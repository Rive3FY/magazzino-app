import { createClient as createSupabaseAdmin } from "@supabase/supabase-js";
import { createClient } from "../../../_lib/supabase/server";
import { NextResponse } from "next/server";

type EquipmentArea = "LINEE" | "STAZIONI";

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
}

function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) return null;
  return createSupabaseAdmin(url, serviceKey, { auth: { persistSession: false } });
}

async function getSessionArea(sessionCode: string): Promise<EquipmentArea | null> {
  if (!sessionCode) return null;
  const admin = getSupabaseAdmin();
  if (!admin) return null;

  const { data } = await admin
    .from("remote_nfc_sessions")
    .select("context_data")
    .eq("code", sessionCode)
    .maybeSingle();

  const contextData = asRecord(data?.context_data);
  const area = contextData?.area;
  return area === "LINEE" || area === "STAZIONI" ? area : null;
}

async function getSessionEvents(sessionCode: string): Promise<unknown[]> {
  if (!sessionCode) return [];
  const admin = getSupabaseAdmin();
  if (!admin) return [];

  const { data } = await admin
    .from("remote_nfc_sessions")
    .select("nfc_tag_ids")
    .eq("code", sessionCode)
    .maybeSingle();

  return Array.isArray(data?.nfc_tag_ids) ? data.nfc_tag_ids : [];
}

export async function POST(req: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Non autenticato" }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const rawValue = String(body.rawValue ?? "").trim();
    const source = String(body.source ?? "barcode");
    const sessionCode = String(body.sessionCode ?? "").trim().toUpperCase();

    if (!rawValue) {
      return NextResponse.json({ error: "Valore scansione mancante" }, { status: 400 });
    }

    const area = await getSessionArea(sessionCode);
    const normalized = rawValue.toLowerCase();

    let query = supabase
      .from("equipment_assets")
      .select("id,asset_code,serial_number,name,category,brand,model,equipment_area,warehouse,status,shelf,place,barcode,nfc_tag_id")
      .limit(2);

    if (area) query = query.eq("equipment_area", area);

    if (source === "nfc") {
      query = query.eq("nfc_tag_id", rawValue);
    } else {
      query = query.or(`barcode.eq.${rawValue},serial_number.eq.${rawValue},asset_code.eq.${rawValue}`);
    }

    const queryResult = await query;
    let data = queryResult.data;
    const queryError = queryResult.error;
    if (queryError) return NextResponse.json({ error: queryError.message }, { status: 500 });

    if ((!data || data.length === 0) && source !== "nfc") {
      let fallbackQuery = supabase
        .from("equipment_assets")
        .select("id,asset_code,serial_number,name,category,brand,model,equipment_area,warehouse,status,shelf,place,barcode,nfc_tag_id")
        .limit(2);
      if (area) fallbackQuery = fallbackQuery.eq("equipment_area", area);
      const fallback = await fallbackQuery;
      if (fallback.error) return NextResponse.json({ error: fallback.error.message }, { status: 500 });
      data = (fallback.data ?? []).filter((row) =>
        [row.barcode, row.serial_number, row.asset_code]
          .filter(Boolean)
          .some((value) => String(value).trim().toLowerCase() === normalized)
      );
    }

    const asset = data?.[0];
    if (!asset) {
      return NextResponse.json({ error: `Attrezzatura "${rawValue}" non trovata` }, { status: 404 });
    }

    const sessionEvents = await getSessionEvents(sessionCode);
    const alreadyInSession = sessionEvents.some((event) => {
      const record = asRecord(event);
      if (record) {
        if (record.type !== "equipment_scan") return false;
        if (record.assetId === asset.id) return true;
        const eventRaw = String(record.rawValue ?? "").trim().toLowerCase();
        return !!eventRaw && eventRaw === normalized;
      }
      return source === "nfc" && String(event ?? "").trim().toLowerCase() === String(asset.nfc_tag_id ?? "").trim().toLowerCase();
    });

    return NextResponse.json({
      rawValue,
      source,
      asset,
      alreadyInSession,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Errore sconosciuto";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
