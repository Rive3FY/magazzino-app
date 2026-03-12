import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import JSZip from "jszip";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
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

function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceKey) {
    throw new Error("Missing env NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  }

  return createSupabaseClient(url, serviceKey, {
    auth: { persistSession: false },
  });
}

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
    const serverSupabase = await createServerClient();
    const {
      data: { user },
    } = await serverSupabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Non autenticato" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const areaParam = String(searchParams.get("area") ?? "").trim().toUpperCase();
    if (!isEquipmentArea(areaParam)) {
      return NextResponse.json({ error: "Area non valida" }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();
    const [assetsRes, movementsRes] = await Promise.all([
      supabase
        .from("equipment_assets")
        .select("id,asset_code,serial_number,name,equipment_area")
        .eq("equipment_area", areaParam)
        .order("serial_number", { ascending: true }),
      supabase
        .from("equipment_movements")
        .select("id,created_at,equipment_id,equipment_area,status,note,destination,intervention_plan_number,created_by,created_by_name,assigned_to_name,resolution_type,close_note,closed_at,closed_by,movement_group_id")
        .eq("equipment_area", areaParam)
        .order("created_at", { ascending: true }),
    ]);

    if (assetsRes.error) {
      return NextResponse.json({ error: assetsRes.error.message }, { status: 500 });
    }
    if (movementsRes.error) {
      return NextResponse.json({ error: movementsRes.error.message }, { status: 500 });
    }

    const movements = (movementsRes.data ?? []) as EquipmentRegisterMovement[];
    const assets = (assetsRes.data ?? []) as EquipmentRegisterAsset[];

    const profileIds = Array.from(
      new Set(
        movements
          .flatMap((movement) => [movement.created_by, movement.closed_by])
          .filter((value): value is string => Boolean(value))
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
        (profiles ?? []).map((profile) => {
          const fullName = buildRegisterPersonName(
            (profile as { first_name?: string | null }).first_name,
            (profile as { last_name?: string | null }).last_name
          );
          return [String((profile as { id: string }).id), fullName];
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
    const pageCount = getEquipmentRegisterPageCount({
      documentXml,
      rowCount: registerRows.length,
    });

    const updatedDocumentXml = fillEquipmentRegisterDocumentXml({
      documentXml,
      area: areaParam,
      rows: registerRows,
    });
    const updatedHeaderXml = fillEquipmentRegisterHeaderXml({
      headerXml,
      year: new Date().getFullYear(),
      pageCount,
    });
    zip.file("word/document.xml", updatedDocumentXml);
    zip.file("word/header1.xml", updatedHeaderXml);

    const outputBuffer = await zip.generateAsync({ type: "nodebuffer" });
    const outputBytes = new Uint8Array(outputBuffer);
    const filename = `registro_movimentazione_dotazioni_${safeFilePart(areaParam)}_${new Date().toISOString().slice(0, 10)}.docx`;

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
