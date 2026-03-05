import { NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { createClient } from "@supabase/supabase-js";

// Stesse colonne della pagina giacenze
const EXCEL_COLS = [
  "Def. Progetto",
  "Materiale",
  "Descrizione Materiale",
  "Divisione",
  "Descrizione Divisione",
  "Magazzino",
  "Descrizione Magazzino",
  "Qnt. a Mag. bloccato",
  "Controllo Qualità Progetto",
  "Valore per Stock",
  "Controllo Qualità Magazzino",
  "Valore a Magazzino",
  "Bloccato Progetto",
  "Scarico Tot",
  "Qnt. stock prog",
  "Finalità di Utilizzo",
  "Gruppo Merci",
  "Descrizione Gruppo Merci",
  "Profit Center",
  "Descrizione Profit Center",
  "Unità di Misura",
  "Qnt. a Mag. libero",
  "Tipo Valore",
  "Centro Resp.",
  "Descrizione Centro Resp.",
  "Descrizione Contab.",
  "Data Primo utilizzo previsto",
  "Data Ultimo utilizzo previsto",
  "Data Prima EM",
  "Data Ultima EM",
  "Materiale Pianif.",
] as const;

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

export async function GET() {
  try {
    const supabase = getSupabaseAdmin();

    // Prendo tutto excel_live
    // (se hai tantissime righe e superi limiti, dimmelo e lo facciamo paginato)
    const { data: live, error: eLive } = await supabase
      .from("excel_live")
      .select("code,warehouse,qty_free,qty_blocked,qty_quality,initial_qty,row_json")
      .order("warehouse", { ascending: true })
      .order("code", { ascending: true });

    if (eLive) {
      return NextResponse.json({ error: eLive.message }, { status: 500 });
    }

    const codes = Array.from(new Set((live ?? []).map((r: any) => r.code).filter(Boolean)));

    // Join con items per name/um
    let itemsMap: Record<string, { name: string | null; um: string | null }> = {};
    if (codes.length) {
      const { data: items, error: eItems } = await supabase.from("items").select("code,name,um").in("code", codes);
      if (eItems) {
        return NextResponse.json({ error: eItems.message }, { status: 500 });
      }
      for (const it of items ?? []) {
        itemsMap[(it as any).code] = { name: (it as any).name ?? null, um: (it as any).um ?? null };
      }
    }

    const rows = (live ?? []).map((r: any) => {
      const base = { ...(r.row_json ?? {}) };

      const code = String(r.code ?? "").trim();
      const wh = String(r.warehouse ?? "").trim();

      const it = itemsMap[code] ?? { name: null, um: null };

      // Imposto i campi “canonici”
      base["Materiale"] = code;
      base["Magazzino"] = wh;

      if (it.name != null) base["Descrizione Materiale"] = it.name ?? "";
      if (it.um != null) base["Unità di Misura"] = it.um ?? "";

      // ✅ quantità corretta: sempre qty_free su "Qnt. a Mag. libero"
      base["Qnt. a Mag. libero"] = Number(r.qty_free ?? 0);
      base["Qnt. a Mag. bloccato"] = Number(r.qty_blocked ?? 0);
      base["Controllo Qualità Magazzino"] = Number(r.qty_quality ?? 0);

      // Ricostruisco l’oggetto con SOLO le colonne Excel e nell’ordine giusto
      const out: Record<string, any> = {};
      for (const c of EXCEL_COLS) out[c] = base[c] ?? "";
      return out;
    });

    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "excel_live");

    const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });

    const filename = `excel_live_${new Date().toISOString().slice(0, 10)}.xlsx`;

    return new NextResponse(buf, {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? "Unknown error" }, { status: 500 });
  }
}