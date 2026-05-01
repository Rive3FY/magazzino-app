import { createClient as createSupabaseAdmin } from "@supabase/supabase-js";
import { createClient } from "../../../_lib/supabase/server";
import { NextResponse } from "next/server";

type Warehouse = "PRM" | "REALE";

function n(value: unknown) {
  const num = Number(value ?? 0);
  return Number.isFinite(num) ? num : 0;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
}

function excelFreeQty(row: unknown) {
  const record = asRecord(row);
  if (!record) return 0;
  if (record.qty_free !== null && record.qty_free !== undefined && record.qty_free !== "") {
    return n(record.qty_free);
  }
  const rowJson = asRecord(record.row_json);
  return n(rowJson?.["Qnt. a Mag. libero"] ?? 0);
}

function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) return null;
  return createSupabaseAdmin(url, serviceKey, { auth: { persistSession: false } });
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

    let code = rawValue;

    if (source === "nfc") {
      const { data: shelfByNfc, error } = await supabase
        .from("material_shelves")
        .select("code")
        .eq("nfc_tag_id", rawValue)
        .maybeSingle();
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      if (shelfByNfc?.code) code = String(shelfByNfc.code);
    }

    if (code === rawValue) {
      const { data: shelfByBarcode, error } = await supabase
        .from("material_shelves")
        .select("code")
        .eq("barcode", rawValue)
        .maybeSingle();
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      if (shelfByBarcode?.code) code = String(shelfByBarcode.code);
    }

    const { data: item, error: itemError } = await supabase
      .from("items")
      .select("code,name,um")
      .eq("code", code)
      .maybeSingle();

    if (itemError) {
      return NextResponse.json({ error: itemError.message }, { status: 500 });
    }

    if (!item) {
      return NextResponse.json({ error: `Materiale "${rawValue}" non trovato` }, { status: 404 });
    }

    const [{ data: liveRows, error: liveError }, { data: shelfRows, error: shelfError }] = await Promise.all([
      supabase.from("excel_live").select("warehouse,qty_free,row_json").eq("code", item.code),
      supabase.from("material_shelves").select("warehouse,shelf,place").eq("code", item.code),
    ]);

    if (liveError) return NextResponse.json({ error: liveError.message }, { status: 500 });
    if (shelfError) return NextResponse.json({ error: shelfError.message }, { status: 500 });

    const warehouses: Record<Warehouse, { warehouse: Warehouse; qtyFree: number; shelf: string; place: string }> = {
      PRM: { warehouse: "PRM", qtyFree: 0, shelf: "", place: "" },
      REALE: { warehouse: "REALE", qtyFree: 0, shelf: "", place: "" },
    };

    for (const row of liveRows ?? []) {
      const wh = (row as { warehouse?: Warehouse }).warehouse;
      if (wh === "PRM" || wh === "REALE") {
        warehouses[wh].qtyFree = excelFreeQty(row);
      }
    }

    for (const row of shelfRows ?? []) {
      const shelf = row as { warehouse?: Warehouse; shelf?: string | null; place?: string | null };
      if (shelf.warehouse === "PRM" || shelf.warehouse === "REALE") {
        warehouses[shelf.warehouse].shelf = shelf.shelf ?? "";
        warehouses[shelf.warehouse].place = (shelf.place ?? "").trim();
      }
    }

    if (sessionCode) {
      const admin = getSupabaseAdmin();
      if (admin) {
        const { data: session } = await admin
          .from("remote_nfc_sessions")
          .select("nfc_tag_ids")
          .eq("code", sessionCode)
          .maybeSingle();

        const events = Array.isArray(session?.nfc_tag_ids) ? session.nfc_tag_ids : [];
        for (const event of events) {
          const record = asRecord(event);
          if (!record || record.type !== "material_pick" || record.code !== item.code) continue;
          const wh = record.warehouse;
          if (wh !== "PRM" && wh !== "REALE") continue;
          warehouses[wh].qtyFree = Math.max(0, warehouses[wh].qtyFree - n(record.qty));
        }
      }
    }

    return NextResponse.json({
      rawValue,
      source,
      item: {
        code: item.code,
        name: item.name,
        um: item.um ?? null,
      },
      warehouses: [warehouses.PRM, warehouses.REALE],
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Errore sconosciuto";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
