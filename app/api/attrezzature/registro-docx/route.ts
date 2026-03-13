import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import JSZip from "jszip";
import { createClient as createServerClient } from "../../../_lib/supabase/server";
import {
  buildEquipmentRegisterRows,
  getEquipmentRegisterPageCount,
  fillEquipmentRegisterDocumentXml,
  fillEquipmentRegisterHeaderXml,
  type EquipmentRegisterArea,
  type EquipmentRegisterAsset,
  type EquipmentRegisterMovement,
} from "../../../_lib/equipment-register-docx";

function isEquipmentArea(value: string): value is EquipmentRegisterArea {
  return value === "LINEE" || value === "STAZIONI";
}

function safeFilePart(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9_-]+/g, "-");
}

function buildRegisterPersonName(firstName: string | null | undefined, lastName: string | null | undefined) {
  return [String(lastName ?? "").trim(), String(firstName ?? "").trim()].filter(Boolean).join(" ");
}

export async function GET(request: Request) {
  try {
    const supabase = await createServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Non autenticato" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const areaParam = String(searchParams.get("area") ?? "").trim().toUpperCase();
    const warehouseParam = String(
      searchParams.get("warehouse") ?? searchParams.get("sede") ?? ""
    ).trim();
    if (!isEquipmentArea(areaParam)) {
      return NextResponse.json({ error: "Area non valida" }, { status: 400 });
    }

    const templatePath = path.join(
      process.cwd(),
      "public",
      "m02IO005ML - Registro movimentazione dotazioni (1).docx"
    );
    const templateBuffer = await readFile(templatePath);
    const zip = await JSZip.loadAsync(templateBuffer);
    const documentXml = await zip.file("word/document.xml")?.async("string");
    if (!documentXml) {
      return NextResponse.json({ error: "Template DOCX non valido" }, { status: 500 });
    }
    const headerXml = await zip.file("word/header1.xml")?.async("string");
    if (!headerXml) {
      return NextResponse.json({ error: "Header DOCX non valido" }, { status: 500 });
    }

    const allWarehouses = !warehouseParam || warehouseParam === "__ALL__";

    let updatedDocumentXml: string;
    let pageCount: number;
    let filename: string;

    if (allWarehouses) {
      const { data: warehouseRows } = await supabase
        .from("equipment_assets")
        .select("warehouse")
        .eq("equipment_area", areaParam);
      const warehouseSet = new Set<string>();
      for (const row of warehouseRows ?? []) {
        const w = (row as { warehouse?: string | null }).warehouse;
        if (w && String(w).trim()) warehouseSet.add(String(w).trim());
      }
      const warehouses = Array.from(warehouseSet).sort();

      if (warehouses.length === 0) {
        return NextResponse.json(
          { error: "Nessun magazzino trovato per questa area." },
          { status: 400 }
        );
      }

      const outZip = new JSZip();
      const dateStr = new Date().toISOString().slice(0, 10);

      for (const wh of warehouses) {
        let assetsQuery = supabase
          .from("equipment_assets")
          .select("id,asset_code,serial_number,name,equipment_area")
          .eq("equipment_area", areaParam)
          .eq("warehouse", wh);
        const assetsRes = await assetsQuery.order("serial_number", { ascending: true });
        if (assetsRes.error) {
          return NextResponse.json({ error: assetsRes.error.message }, { status: 500 });
        }
        const assets = (assetsRes.data ?? []) as EquipmentRegisterAsset[];
        const assetIds = assets.map((asset) => asset.id);

        let movements: EquipmentRegisterMovement[] = [];
        if (assetIds.length > 0) {
          const { data: movementRows, error: movementsError } = await supabase
            .from("equipment_movements")
            .select("id,created_at,equipment_id,equipment_area,status,note,destination,intervention_plan_number,created_by,created_by_name,assigned_to_name,resolution_type,close_note,closed_at,closed_by,movement_group_id")
            .eq("equipment_area", areaParam)
            .in("equipment_id", assetIds)
            .order("created_at", { ascending: true });
          if (movementsError) {
            return NextResponse.json({ error: movementsError.message }, { status: 500 });
          }
          movements = (movementRows ?? []) as EquipmentRegisterMovement[];
        }

        const profileIds = Array.from(
          new Set(
            movements
              .flatMap((m) => [m.created_by, m.closed_by])
              .filter((v): v is string => Boolean(v))
          )
        );

        let createdByNameMap: Record<string, string> = {};
        let closedByNameMap: Record<string, string> = {};
        if (profileIds.length > 0) {
          const { data: profiles, error: profilesError } = await supabase
            .from("profiles")
            .select("id,first_name,last_name")
            .in("id", profileIds);
          if (profilesError) {
            return NextResponse.json({ error: profilesError.message }, { status: 500 });
          }
          const nameMap = Object.fromEntries(
            (profiles ?? []).map((p) => {
              const fullName = buildRegisterPersonName(
                (p as { first_name?: string | null }).first_name,
                (p as { last_name?: string | null }).last_name
              );
              return [String((p as { id: string }).id), fullName];
            })
          );
          createdByNameMap = nameMap;
          closedByNameMap = nameMap;
        }

        const registerRows = buildEquipmentRegisterRows({
          area: areaParam,
          assets,
          movements,
          createdByNameMap,
          closedByNameMap,
        });

        const whPageCount = getEquipmentRegisterPageCount({
          documentXml,
          rowCount: registerRows.length > 0 ? registerRows.length : 1,
        });
        const whDocumentXml = fillEquipmentRegisterDocumentXml({
          documentXml,
          area: areaParam,
          rows: registerRows,
          sedeDi: wh,
        });
        const whHeaderXml = fillEquipmentRegisterHeaderXml({
          headerXml,
          year: new Date().getFullYear(),
          pageCount: whPageCount,
        });

        const whZip = await JSZip.loadAsync(templateBuffer);
        whZip.file("word/document.xml", whDocumentXml);
        whZip.file("word/header1.xml", whHeaderXml);
        const docxBuffer = await whZip.generateAsync({ type: "nodebuffer" });
        const docxFilename = `registro_${safeFilePart(areaParam)}_${safeFilePart(wh)}_${dateStr}.docx`;
        outZip.file(docxFilename, docxBuffer);
      }

      const zipBuffer = await outZip.generateAsync({ type: "nodebuffer" });
      const zipFilename = `registro_movimentazione_dotazioni_${safeFilePart(areaParam)}_tutti_${dateStr}.zip`;

      return new NextResponse(new Uint8Array(zipBuffer), {
        status: 200,
        headers: {
          "Content-Type": "application/zip",
          "Content-Disposition": `attachment; filename="${zipFilename}"`,
          "Cache-Control": "no-store",
        },
      });
    } else {
      let assetsQuery = supabase
        .from("equipment_assets")
        .select("id,asset_code,serial_number,name,equipment_area")
        .eq("equipment_area", areaParam)
        .eq("warehouse", warehouseParam);
      const assetsRes = await assetsQuery.order("serial_number", { ascending: true });
      if (assetsRes.error) {
        return NextResponse.json({ error: assetsRes.error.message }, { status: 500 });
      }
      const assets = (assetsRes.data ?? []) as EquipmentRegisterAsset[];
      const assetIds = assets.map((asset) => asset.id);

      let movements: EquipmentRegisterMovement[] = [];
      if (assetIds.length > 0) {
        const { data: movementRows, error: movementsError } = await supabase
          .from("equipment_movements")
          .select("id,created_at,equipment_id,equipment_area,status,note,destination,intervention_plan_number,created_by,created_by_name,assigned_to_name,resolution_type,close_note,closed_at,closed_by,movement_group_id")
          .eq("equipment_area", areaParam)
          .in("equipment_id", assetIds)
          .order("created_at", { ascending: true });
        if (movementsError) {
          return NextResponse.json({ error: movementsError.message }, { status: 500 });
        }
        movements = (movementRows ?? []) as EquipmentRegisterMovement[];
      }

      const profileIds = Array.from(
        new Set(
          movements
            .flatMap((m) => [m.created_by, m.closed_by])
            .filter((v): v is string => Boolean(v))
        )
      );

      let createdByNameMap: Record<string, string> = {};
      let closedByNameMap: Record<string, string> = {};
      if (profileIds.length > 0) {
        const { data: profiles, error: profilesError } = await supabase
          .from("profiles")
          .select("id,first_name,last_name")
          .in("id", profileIds);
        if (profilesError) {
          return NextResponse.json({ error: profilesError.message }, { status: 500 });
        }
        const nameMap = Object.fromEntries(
          (profiles ?? []).map((p) => {
            const fullName = buildRegisterPersonName(
              (p as { first_name?: string | null }).first_name,
              (p as { last_name?: string | null }).last_name
            );
            return [String((p as { id: string }).id), fullName];
          })
        );
        createdByNameMap = nameMap;
        closedByNameMap = nameMap;
      }

      const registerRows = buildEquipmentRegisterRows({
        area: areaParam,
        assets,
        movements,
        createdByNameMap,
        closedByNameMap,
      });

      pageCount = getEquipmentRegisterPageCount({
        documentXml,
        rowCount: registerRows.length,
      });
      updatedDocumentXml = fillEquipmentRegisterDocumentXml({
        documentXml,
        area: areaParam,
        rows: registerRows,
        sedeDi: warehouseParam || undefined,
      });
      filename = `registro_movimentazione_dotazioni_${safeFilePart(areaParam)}_${safeFilePart(warehouseParam)}_${new Date().toISOString().slice(0, 10)}.docx`;
    }

    const updatedHeaderXml = fillEquipmentRegisterHeaderXml({
      headerXml,
      year: new Date().getFullYear(),
      pageCount,
    });
    zip.file("word/document.xml", updatedDocumentXml);
    zip.file("word/header1.xml", updatedHeaderXml);

    const outputBuffer = await zip.generateAsync({ type: "nodebuffer" });
    const outputBytes = new Uint8Array(outputBuffer);

    return new NextResponse(outputBytes, {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
