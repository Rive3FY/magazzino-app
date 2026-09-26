import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { qtyAlreadyOnTotale, readTotaleQuantity, rebaseQtyToTotale } from "./excel-qty";

type OriginalRow = {
  code: string;
  warehouse: string;
  qty_free: number | null;
  row_json: Record<string, unknown> | null;
};

type LiveRow = OriginalRow & {
  initial_qty: number | null;
};

const PAGE = 1000;
const WRITE_CHUNK = 200;

async function fetchAll<T>(supabase: SupabaseClient, table: "excel_original" | "excel_live", columns: string): Promise<T[]> {
  const all: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase.from(table).select(columns).range(from, from + PAGE - 1);
    if (error) throw error;
    const rows = (data ?? []) as T[];
    all.push(...rows);
    if (rows.length < PAGE) break;
  }
  return all;
}

export async function rebaseStockToTotale(): Promise<{ updated: number }> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) return { updated: 0 };

  const supabase = createClient(url, serviceKey, { auth: { persistSession: false } });
  const [originalRows, liveRows] = await Promise.all([
    fetchAll<OriginalRow>(supabase, "excel_original", "code,warehouse,qty_free,row_json"),
    fetchAll<LiveRow>(supabase, "excel_live", "code,warehouse,qty_free,initial_qty,row_json"),
  ]);

  const liveByKey = new Map(liveRows.map((row) => [`${row.code}__${row.warehouse}`, row]));
  const liveUpdates: Array<{ code: string; warehouse: string; qty_free: number; initial_qty: number; row_json: Record<string, unknown> }> = [];

  for (const original of originalRows) {
    if (original.qty_free === null || original.qty_free === undefined) continue;
    const baseline = Number(original.qty_free);
    if (!Number.isFinite(baseline)) continue;

    const totale = readTotaleQuantity(original.row_json);
    if (totale === null || qtyAlreadyOnTotale(baseline, totale)) continue;

    const live = liveByKey.get(`${original.code}__${original.warehouse}`);
    if (!live) continue;
    if (live.row_json?._qty_source === "TOTALE") continue;

    const current = Number.isFinite(Number(live.qty_free)) ? Number(live.qty_free) : baseline;
    const nextQty = rebaseQtyToTotale(totale, baseline, current);
    const nextJson = { ...(live.row_json ?? {}) };
    nextJson.TOTALE = nextQty;
    nextJson["Qnt. a Mag. libero"] = nextQty;
    nextJson._qty_source = "TOTALE";

    liveUpdates.push({
      code: original.code,
      warehouse: original.warehouse,
      qty_free: nextQty,
      initial_qty: totale,
      row_json: nextJson,
    });
  }

  for (let i = 0; i < liveUpdates.length; i += WRITE_CHUNK) {
    const chunk = liveUpdates.slice(i, i + WRITE_CHUNK);
    const { error } = await supabase.from("excel_live").upsert(chunk, { onConflict: "code,warehouse" });
    if (error) throw error;
  }

  if (liveUpdates.length > 0) {
    console.info(`Giacenze riallineate alla colonna TOTALE: ${liveUpdates.length}`);
  }

  return { updated: liveUpdates.length };
}

let pending: Promise<void> | null = null;

/** Una volta per istanza server. È idempotente: le righe già su TOTALE non cambiano. */
export function ensureStockRebasedToTotale(): Promise<void> {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return Promise.resolve();
  }
  if (!pending) {
    pending = rebaseStockToTotale()
      .then(() => undefined)
      .catch((error: unknown) => {
        pending = null;
        console.error("Riallineamento giacenze su TOTALE non riuscito:", error);
      });
  }
  return pending;
}
