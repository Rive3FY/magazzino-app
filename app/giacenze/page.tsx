"use client";

export const dynamic = "force-dynamic";

import { useEffect, useMemo, useState } from "react";
import * as XLSX from "xlsx";
import { createClient } from "../_lib/supabase/client";

const PAGE_SIZE = 25;

type WarehouseView = "REALE" | "PRM" | "TUTTI";

type DbItem = {
  code: string;
  name: string;
  um: string | null;
};

type StockRow = DbItem & {
  stockPRM: number;
  stockREALE: number;
};

type DbStock = {
  code: string;
  warehouse: "PRM" | "REALE";
  initial_qty: number | null;
};

type DbMov = {
  code: string;
  warehouse: "PRM" | "REALE" | null;
  type: "IN" | "OUT";
  qty: number;
};

function n(v: any) {
  const x = Number(v ?? 0);
  return Number.isFinite(x) ? x : 0;
}

export default function GiacenzePage() {
  const supabase = createClient();

  const [view, setView] = useState<WarehouseView>("REALE");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);

  const [items, setItems] = useState<DbItem[]>([]);
  const [count, setCount] = useState(0);
  const [rows, setRows] = useState<StockRow[]>([]);
  const [loading, setLoading] = useState(true);

  const totalPages = Math.max(1, Math.ceil(count / PAGE_SIZE));

  async function load() {
    setLoading(true);

    const search = q.trim();
    let query = supabase.from("items").select("code,name,um", { count: "exact" });

    if (search) query = query.or(`code.ilike.%${search}%,name.ilike.%${search}%`);

    const from = (page - 1) * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;

    const { data, error, count: c } = await query.order("code", { ascending: true }).range(from, to);

    if (error) {
      console.error("items load error:", error);
      setItems([]);
      setRows([]);
      setCount(0);
      setLoading(false);
      return;
    }

    const list = (data ?? []) as DbItem[];
    setItems(list);
    setCount(c ?? 0);

    const codes = list.map((i) => i.code).filter(Boolean);
    if (codes.length === 0) {
      setRows([]);
      setLoading(false);
      return;
    }

    // 1) base stock da item_stocks (PRM / REALE)
    const { data: baseStocks, error: eS } = await supabase
      .from("item_stocks")
      .select("code,warehouse,initial_qty")
      .in("code", codes);

    if (eS) console.error("item_stocks load error:", eS);

    const baseMap = new Map<string, { PRM: number; REALE: number }>();
    for (const c of codes) baseMap.set(c, { PRM: 0, REALE: 0 });

    for (const r of (baseStocks ?? []) as DbStock[]) {
      const m = baseMap.get(r.code) ?? { PRM: 0, REALE: 0 };
      if (r.warehouse === "PRM") m.PRM = n(r.initial_qty);
      if (r.warehouse === "REALE") m.REALE = n(r.initial_qty);
      baseMap.set(r.code, m);
    }

    // 2) delta stock da movements
    let movQuery = supabase.from("movements").select("code,warehouse,type,qty").in("code", codes);

    // se non stai vedendo "TUTTI" filtriamo lato DB (più veloce)
    if (view === "PRM") movQuery = movQuery.eq("warehouse", "PRM");
    if (view === "REALE") movQuery = movQuery.eq("warehouse", "REALE");

    const { data: movs, error: eM } = await movQuery;
    if (eM) console.error("movements load error:", eM);

    const deltaMap = new Map<string, { PRM: number; REALE: number }>();
    for (const c of codes) deltaMap.set(c, { PRM: 0, REALE: 0 });

    for (const m of (movs ?? []) as DbMov[]) {
      const wh = (m.warehouse ?? "") as any;
      if (wh !== "PRM" && wh !== "REALE") continue;

      const d = deltaMap.get(m.code) ?? { PRM: 0, REALE: 0 };
      const signed = (m.type === "IN" ? 1 : -1) * n(m.qty);

      if (wh === "PRM") d.PRM += signed;
      if (wh === "REALE") d.REALE += signed;

      deltaMap.set(m.code, d);
    }

    const computed: StockRow[] = list.map((it) => {
      const b = baseMap.get(it.code) ?? { PRM: 0, REALE: 0 };
      const d = deltaMap.get(it.code) ?? { PRM: 0, REALE: 0 };

      return {
        ...it,
        stockPRM: b.PRM + d.PRM,
        stockREALE: b.REALE + d.REALE,
      };
    });

    setRows(computed);
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, view]);

  useEffect(() => {
    setPage(1);
  }, [q, view]);

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  const viewRows = useMemo(() => rows, [rows]);

  function exportXlsx() {
    const data =
      view === "TUTTI"
        ? viewRows.map((r) => ({
            Materiale: r.code,
            Descrizione: r.name,
            UM: r.um ?? "",
            PRM: r.stockPRM ?? 0,
            REALE: r.stockREALE ?? 0,
          }))
        : viewRows.map((r) => ({
            Materiale: r.code,
            Descrizione: r.name,
            UM: r.um ?? "",
            Magazzino: view,
            Giacenza: view === "PRM" ? r.stockPRM ?? 0 : r.stockREALE ?? 0,
          }));

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Giacenze");
    XLSX.writeFile(wb, `giacenze_${view.toLowerCase()}_pagina_${page}.xlsx`);
  }

  return (
    <main className="panel">
      <div className="pageBar">
        <div className="pageBarTitle">Magazzino - Giacenze</div>
        <div className="pageBarActions">
          <a className="btn" href="/movimenti">
            Movimenti
          </a>
          <a className="btn" href="/import">
            Import
          </a>
        </div>
      </div>

      {/* Barra filtri orizzontale */}
      <div className="card" style={{ padding: 12 }}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "180px 1fr auto auto",
            gap: 10,
            alignItems: "end",
          }}
        >
          <div>
            <label className="label">Magazzino</label>
            <select
              className="input"
              value={view}
              onChange={(e) => setView(e.target.value as WarehouseView)}
            >
              <option value="REALE">REALE</option>
              <option value="PRM">PRM</option>
              <option value="TUTTI">TUTTI</option>
            </select>
          </div>

          <div>
            <label className="label">Cerca</label>
            <input
              className="input"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Codice o descrizione…"
              style={{ width: "100%" }}
            />
          </div>

          <button className="btn" onClick={load}>
            Aggiorna
          </button>

          <button className="btn" onClick={exportXlsx}>
            Export pagina
          </button>
        </div>
      </div>

      {loading ? (
        <div style={{ padding: 12 }}>Caricamento…</div>
      ) : (
        <>
          <div style={{ overflowX: "auto", marginTop: 12 }}>
            <table className="table">
              <thead>
                <tr>
                  <th>Materiale</th>
                  <th>Descrizione</th>
                  <th>UM</th>

                  {view === "TUTTI" ? (
                    <>
                      <th>PRM</th>
                      <th>REALE</th>
                    </>
                  ) : (
                    <>
                      <th>Magazzino</th>
                      <th>Giacenza</th>
                    </>
                  )}
                </tr>
              </thead>

              <tbody>
                {viewRows.map((r, idx) => {
                  const zebraBg = idx % 2 === 0 ? "rgba(15,23,42,0.03)" : "rgba(15,23,42,0.08)";
                  return (
                    <tr key={r.code} style={{ background: zebraBg }}>
                      <td style={{ fontWeight: 900 }}>{r.code}</td>
                      <td>{r.name}</td>
                      <td>{r.um ?? ""}</td>

                      {view === "TUTTI" ? (
                        <>
                          <td>
                            <b>{r.stockPRM ?? 0}</b>
                          </td>
                          <td>
                            <b>{r.stockREALE ?? 0}</b>
                          </td>
                        </>
                      ) : (
                        <>
                          <td>{view}</td>
                          <td>
                            <b>{view === "PRM" ? r.stockPRM ?? 0 : r.stockREALE ?? 0}</b>
                          </td>
                        </>
                      )}
                    </tr>
                  );
                })}

                {viewRows.length === 0 && (
                  <tr>
                    <td colSpan={view === "TUTTI" ? 5 : 5} style={{ padding: 12, color: "#0f172a" }}>
                      Nessun risultato.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div style={{ marginTop: 14, display: "flex", gap: 10, alignItems: "center" }}>
            <button
              className="btn"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              style={{ opacity: page <= 1 ? 0.6 : 1 }}
            >
              ← Precedente
            </button>

            <span style={{ opacity: 0.9 }}>
              Pagina <b>{page}</b> di <b>{totalPages}</b> · Totale righe: <b>{count}</b>
            </span>

            <button
              className="btn"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              style={{ opacity: page >= totalPages ? 0.6 : 1 }}
            >
              Successiva →
            </button>
          </div>
        </>
      )}
    </main>
  );
}