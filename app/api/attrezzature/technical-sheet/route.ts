import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createClient as createServerClient } from "../../../_lib/supabase/server";
import { loadServerAdminAccess } from "../../../_lib/admin-access";
import type { EquipmentArea } from "../../../_lib/types";

function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceKey) {
    throw new Error("Missing env NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  }

  return createClient(url, serviceKey, {
    auth: { persistSession: false },
  });
}

function sanitizeFilename(filename: string) {
  return filename.replace(/[^a-zA-Z0-9._-]/g, "_");
}

function canManageArea(access: Awaited<ReturnType<typeof loadServerAdminAccess>>, area: EquipmentArea) {
  return area === "LINEE" ? access.canManageEquipmentLinee : access.canManageEquipmentStazioni;
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
    const id = String(searchParams.get("id") ?? "").trim();
    if (!id) {
      return NextResponse.json({ error: "ID attrezzatura mancante" }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();
    const { data: row, error: rowError } = await supabase
      .from("equipment_assets")
      .select("technical_sheet_path,technical_sheet_filename,technical_sheet_content_type")
      .eq("id", id)
      .maybeSingle();

    if (rowError) {
      return NextResponse.json({ error: rowError.message }, { status: 500 });
    }

    if (!row?.technical_sheet_path) {
      return NextResponse.json({ error: "Scheda tecnica non presente" }, { status: 404 });
    }

    const { data: file, error: downloadError } = await supabase.storage
      .from("equipment-technical-sheets")
      .download(row.technical_sheet_path);

    if (downloadError || !file) {
      return NextResponse.json({ error: downloadError?.message ?? "File non trovato nello storage" }, { status: 500 });
    }

    const filename = row.technical_sheet_filename || "scheda-tecnica.pdf";
    return new NextResponse(file, {
      status: 200,
      headers: {
        "Content-Type": row.technical_sheet_content_type || "application/pdf",
        "Content-Disposition": `inline; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const serverSupabase = await createServerClient();
    const {
      data: { user },
    } = await serverSupabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Non autenticato" }, { status: 401 });
    }

    const formData = await request.formData();
    const file = formData.get("file");
    const equipmentId = String(formData.get("equipmentId") ?? "").trim();

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "File mancante" }, { status: 400 });
    }

    if (!equipmentId) {
      return NextResponse.json({ error: "Attrezzatura mancante" }, { status: 400 });
    }

    if (file.type !== "application/pdf") {
      return NextResponse.json({ error: "La scheda tecnica deve essere un PDF" }, { status: 400 });
    }

    const access = await loadServerAdminAccess(serverSupabase);
    const supabase = getSupabaseAdmin();

    const { data: asset, error: assetError } = await supabase
      .from("equipment_assets")
      .select("id,equipment_area,asset_code,serial_number,technical_sheet_path")
      .eq("id", equipmentId)
      .maybeSingle<{ id: string; equipment_area: EquipmentArea; asset_code: string; serial_number: string | null; technical_sheet_path: string | null }>();

    if (assetError) {
      return NextResponse.json({ error: assetError.message }, { status: 500 });
    }

    if (!asset) {
      return NextResponse.json({ error: "Attrezzatura non trovata" }, { status: 404 });
    }

    if (!canManageArea(access, asset.equipment_area)) {
      return NextResponse.json({ error: "Accesso negato" }, { status: 403 });
    }

    const safeName = sanitizeFilename(file.name || "scheda-tecnica.pdf");
    const stem = sanitizeFilename(asset.serial_number || asset.asset_code || equipmentId);
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const storagePath = `${asset.equipment_area}/${asset.id}/${timestamp}_${stem}_${safeName}`;

    const { error: uploadError } = await supabase.storage
      .from("equipment-technical-sheets")
      .upload(storagePath, file, {
        contentType: file.type || "application/pdf",
        upsert: false,
      });

    if (uploadError) {
      return NextResponse.json({ error: uploadError.message }, { status: 500 });
    }

    const payload = {
      technical_sheet_path: storagePath,
      technical_sheet_filename: file.name || safeName,
      technical_sheet_content_type: file.type || "application/pdf",
      technical_sheet_uploaded_at: new Date().toISOString(),
      technical_sheet_uploaded_by: user.id,
    };

    const { data: updated, error: updateError } = await supabase
      .from("equipment_assets")
      .update(payload)
      .eq("id", equipmentId)
      .select("*")
      .single();

    if (updateError) {
      await supabase.storage.from("equipment-technical-sheets").remove([storagePath]);
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    if (asset.technical_sheet_path) {
      await supabase.storage.from("equipment-technical-sheets").remove([asset.technical_sheet_path]);
    }

    return NextResponse.json({ ok: true, row: updated });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
