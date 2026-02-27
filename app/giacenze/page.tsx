"use client";

import { useEffect, useMemo, useState } from "react";
import * as XLSX from "xlsx";
import { clearAll, computeAllStocks } from "../_lib/store";

const PAGE_SIZE = 30;

export default function GiacenzePage() {
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<ReturnType<typeof computeAllStocks>>([]);
  const [page, setPage] = useState(1);
  const [ready, setReady] = useState(false);

  function refresh() {
    setRows(computeAllStocks());
  }

  useEffect(() => {
    refresh();
    setReady(true);
  }, []);

  // filtro ricerca
  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return rows;
    return rows.filter((r) =>
      (r.code + " " + r.name).toLowerCase().includes(s)
    );
  }, [q, rows]);

  // reset pagina quando cambi ricerca
  useEffect(() => {
    setPage(1);
  }, [q]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));

  const paginated = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE;
    return filtered.slice(start, start + PAGE_SIZE);
  }, [filtered, page]);

  function exportXlsx() {
    const ws = XLSX.utils.json_to_sheet(filtered);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Giacenze");
    XLSX.writeFile(wb, "giacenze.xlsx");
  }

  function resetAll() {
    if (!confirm("Vuoi davvero cancellare tutti i dati?")) return;
    clearAll();
    refresh();
  }

  return (
    <main>
      <h1>📦 Giacenze</h1>

      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 16 }}>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Cerca materiale..."
          style={{ padding: 10, borderRadius: 10, border: "1px solid #ccc" }}
        />
        <button onClick={refresh}>Aggiorna</button>
        <button onClick={exportXlsx}>Export Excel</button>
        <button onClick={resetAll}>Reset dati</button>
      </div>

      {!ready ? (
        <p>Caricamento…</p>
      ) : (
        <>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <th>Materiale</th>
                  <th>Descrizione</th>
                  <th>UM</th>
                  <th>Giacenza</th>
                </tr>
              </thead>
              <tbody>
                {paginated.map((r) => (
                  <tr key={r.code}>
                    <td>{r.code}</td>
                    <td>{r.name}</td>
                    <td>{r.um}</td>
                    <td><b>{r.stock}</b></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* PAGINAZIONE */}
          <div style={{ marginTop: 16, display: "flex", gap: 12, alignItems: "center" }}>
            <button
              disabled={page === 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              ← Precedente
            </button>

            <span>
              Pagina {page} di {totalPages}
            </span>

            <button
              disabled={page === totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            >
              Successiva →
            </button>
          </div>
        </>
      )}
    </main>
  );
}