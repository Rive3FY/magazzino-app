import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import JSZip from "jszip";
import { createClient as createServerClient } from "../../../_lib/supabase/server";
import {
  buildEquipmentRegisterRows,
  collectEquipmentRegisterWarehouses,
  equipmentRegisterWarehouse,
  fillEquipmentRegisterDocumentXml,
  fillEquipmentRegisterHeaderXml,
  type EquipmentRegisterArea,
  type EquipmentRegisterAsset,
  type EquipmentRegisterMovement,
} from "../../../_lib/equipment-register-docx";

const MOVEMENT_SELECT =
  "id,created_at,equipment_id,equipment_area,status,note,destination,intervention_plan_number,created_by,created_by_name,assigned_to_name,resolution_type,close_note,closed_at,closed_by,movement_group_id,details_json";

function isEquipmentArea(value: string): value is EquipmentRegisterArea {
  return value === "LINEE" || value === "STAZIONI";
}

function safeFilePart(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9_-]+/g, "-");
}

function buildRegisterPersonName(firstName: string | null | undefined, lastName: string | null | undefined) {
  return [String(lastName ?? "").trim(), String(firstName ?? "").trim()].filter(Boolean).join(" ");
}

async function loadAreaRegisterData(supabase: Awaited<ReturnType<typeof createServerClient>>, area: EquipmentRegisterArea) {
  const assetsRes = await supabase
    .from("equipment_assets")
    .select("id,asset_code,serial_number,name,equipment_area,warehouse")
    .eq("equipment_area", area)
    .order("serial_number", { ascending: true });
  if (assetsRes.error) {
    return { error: assetsRes.error.message, assets: [] as EquipmentRegisterAsset[], movements: [] as EquipmentRegisterMovement[] };
  }

  const movementsRes = await supabase
    .from("equipment_movements")
    .select(MOVEMENT_SELECT)
    .eq("equipment_area", area)
    .order("created_at", { ascending: true });
  if (movementsRes.error) {
    return { error: movementsRes.error.message, assets: [] as EquipmentRegisterAsset[], movements: [] as EquipmentRegisterMovement[] };
  }

  return {
    error: null as string | null,
    assets: (assetsRes.data ?? []) as EquipmentRegisterAsset[],
    movements: (movementsRes.data ?? []) as EquipmentRegisterMovement[],
  };
}

async function profileNameMaps(
  supabase: Awaited<ReturnType<typeof createServerClient>>,
  movements: EquipmentRegisterMovement[]
) {
  const profileIds = Array.from(
    new Set(
      movements
        .flatMap((m) => [m.created_by, m.closed_by])
        .filter((v): v is string => Boolean(v))
    )
  );
  if (profileIds.length === 0) {
    return { createdByNameMap: {} as Record<string, string>, closedByNameMap: {} as Record<string, string>, error: null as string | null };
  }
  const { data: profiles, error } = await supabase
    .from("profiles")
    .select("id,first_name,last_name")
    .in("id", profileIds);
  if (error) {
    return { createdByNameMap: {} as Record<string, string>, closedByNameMap: {} as Record<string, string>, error: error.message };
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
  return { createdByNameMap: nameMap, closedByNameMap: nameMap, error: null as string | null };
}

function registerRowsForWarehouse(
  assets: EquipmentRegisterAsset[],
  movements: EquipmentRegisterMovement[],
  warehouse: string,
  createdByNameMap: Record<string, string>,
  closedByNameMap: Record<string, string>
) {
  const assetMap = new Map(assets.map((asset) => [asset.id, asset]));
  const filteredMovements = movements.filter((movement) => {
    const asset = movement.equipment_id ? assetMap.get(movement.equipment_id) : undefined;
    return equipmentRegisterWarehouse(movement, asset) === warehouse;
  });
  return buildEquipmentRegisterRows({
    assets,
    movements: filteredMovements,
    createdByNameMap,
    closedByNameMap,
  });
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

    const loaded = await loadAreaRegisterData(supabase, areaParam);
    if (loaded.error) {
      return NextResponse.json({ error: loaded.error }, { status: 500 });
    }
    const { assets, movements } = loaded;
    const warehouses = collectEquipmentRegisterWarehouses(assets, movements);
    const allWarehouses = !warehouseParam || warehouseParam === "__ALL__";

    if (allWarehouses) {
      if (warehouses.length === 0) {
        return NextResponse.json(
          { error: "Nessun magazzino trovato per questa area." },
          { status: 400 }
        );
      }

      const names = await profileNameMaps(supabase, movements);
      if (names.error) {
        return NextResponse.json({ error: names.error }, { status: 500 });
      }

      const outZip = new JSZip();
      const dateStr = new Date().toISOString().slice(0, 10);

      for (const wh of warehouses) {
        const registerRows = registerRowsForWarehouse(
          assets,
          movements,
          wh,
          names.createdByNameMap,
          names.closedByNameMap
        );
        const whDocumentXml = fillEquipmentRegisterDocumentXml({
          documentXml,
          area: areaParam,
          rows: registerRows,
          sedeDi: wh,
        });
        const whHeaderXml = fillEquipmentRegisterHeaderXml({
          headerXml,
          year: new Date().getFullYear(),
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
    }

    const names = await profileNameMaps(supabase, movements);
    if (names.error) {
      return NextResponse.json({ error: names.error }, { status: 500 });
    }
    const registerRows = registerRowsForWarehouse(
      assets,
      movements,
      warehouseParam,
      names.createdByNameMap,
      names.closedByNameMap
    );
    const updatedDocumentXml = fillEquipmentRegisterDocumentXml({
      documentXml,
      area: areaParam,
      rows: registerRows,
      sedeDi: warehouseParam || undefined,
    });
    const filename = `registro_movimentazione_dotazioni_${safeFilePart(areaParam)}_${safeFilePart(warehouseParam)}_${new Date().toISOString().slice(0, 10)}.docx`;

    const updatedHeaderXml = fillEquipmentRegisterHeaderXml({
      headerXml,
      year: new Date().getFullYear(),
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
