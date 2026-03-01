"use client";

import * as XLSX from "xlsx";
import { useEffect, useMemo, useState } from "react";
import { createClient } from "../_lib/supabase/client";

type Row = {
  Materiale?: any;
  "Descrizione Materiale"?: any;
  Divisione?: any;
  "Descrizione Divisione"?: any;
  Magazzino?: any;
  "Descrizione Magazzino"?: any;
  "Qnt. a Mag. bloccato"?: any;
  "Controllo Qualità Magazzino"?: any;
  "Descrizione Gruppo Merci"?: any;
  "Qnt. a Mag. Libero"?: any;
  UM?: any;
  TOTALE?: any;
  "Qnt. Reale"?: any;
};

type Movement = {
  id: string;
  created_at: string;
  type: "IN" | "OUT";
  code: string;
  qty: number;
  note: string | null;
  created_by_email: string | null;
};

function toNumber(v: unknown): number {
  const s = String(v ?? "").trim().replace(",", ".");
  const n = typeof v === "number" ? v : Number(s);
  return Number.isFinite(n) ? n : 0;
}

function fmtDate(iso: string) {
  const d = new Date(iso);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  return `${dd}/${mm}/${yyyy} ${hh}:${mi}`;
}

export default function AdminPanelClient() {
  const supabase = createClient();

  // IMPORT
  const [importMsg, setImportMsg] = useState<string | null>(null);
  const [importBusy, setImportBusy] = useState(false);

  // MOVIMENTI
  const [movMsg, setMovMsg] = useState<string | null>(null);
  const [loadingMov, setLoadingMov] = useState(true);
  const [movements, setMovements] = useState<Movement[]>([]);

  // filtri base
  const [typeFilter, setTypeFilter] = useState<"ALL" | "IN" | "OUT">("ALL");
  const [dateFrom, setDateFrom] = useState(""); // yyyy-mm-dd
  const [dateTo, setDateTo] = useState("");     // yyyy-mm-dd
  const [codeSearch, setCodeSearch] = useState("");

  async function loadMovements() {
    setLoadingMov(true);
    setMovMsg(null);

    let q = supabase
      .from("movements")
      .select("id,created_at,type,code,qty,note,created_by_email")
      .order("created_at", { ascending: false })
      .limit(200);

    if (typeFilter !== "ALL") q = q.eq("type", typeFilter);
    if (dateFrom) q = q.gte("created_at", `${dateFrom}T00:00:00`);
    if (dateTo) q = q.lte("created_at", `${dateTo}T23:59:59`);

    const s = codeSearch.trim();
    if (s) q = q.ilike("code", `%${s}%`);

    const { data, error } = await q;
    if (error) {
      console.error(error);
      setMovements([]);
      setMovMsg("Errore caricamento movimenti: " + error.message);
      setLoadingMov(false);
      return;
    }

    setMovements((data ?? []) as Movement[]);
    setLoadingMov(false);
  }

  useEffect(() => {
    loadMovements();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    loadMovements();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [typeFilter, dateFrom, dateTo]);

  async function deleteMovement(id: string) {
    const ok = confirm("Eliminare questo movimento?");
    if (!ok) return;

    const { error } = await supabase.from("movements").delete().eq("id", id);
    if (error) {
      alert("Non posso eliminare: " + error.message);
      return;
    }

    setMovMsg("Movimento eliminato ✅");
    await loadMovements();
  }

  async function onFile(file: File) {
    setImportMsg(null);
    setImportBusy(true);

    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json<Row>(sheet, { defval: "" });

      const items = rows
        .map((r) => {
          const code = String(r["Materiale"] ?? "").trim();
          const name = String(r["Descrizione Materiale"] ?? "").trim();
          if (!code || !name) return null;

          const initial_qty = toNumber(r["TOTALE"]);
          const qty_free = toNumber(r["Qnt. a Mag. Libero"]);
          const qty_blocked = toNumber(r["Qnt. a Mag. bloccato"]);
          const qty_quality = toNumber(r["Controllo Qualità Magazzino"]);

          return {
            code,
            name,
            um: String(r["UM"] ?? "").trim() || null,

            division: String(r["Divisione"] ?? "").trim() || null,
            division_desc: String(r["Descrizione Divisione"] ?? "").trim() || null,

            warehouse: String(r["Magazzino"] ?? "").trim() || null,
            warehouse_desc: String(r["Descrizione Magazzino"] ?? "").trim() || null,

            group_desc: String(r["Descrizione Gruppo Merci"] ?? "").trim() || null,

            qty_free,
            qty_blocked,
            qty_quality,
            initial_qty,
          };
        })
        .filter(Boolean) as any[];

      if (items.length === 0) {
        setImportMsg("Nessuna riga valida trovata. Controlla intestazioni del file.");
        return;
      }

      const { error } = await supabase.from("items").upsert(items, { onConflict: "code" });
      if (error) {
        setImportMsg("Import bloccato ❌. Dettaglio: " + error.message);
        return;
      }

      setImportMsg(`Import completato ✅ (${items.length} righe)`);
    } catch (e: any) {
      setImportMsg("Errore import: " + (e?.message ?? String(e)));
    } finally {
      setImportBusy(false);
    }
  }

  const shown = useMemo(() => movements, [movements]);

  return (
    <main className="panel">
      <div className="pageBar">
        <div className="pageBarTitle">Admin Panel</div>
        <div className="pageBarRight" style={{ display: "flex", gap: 8 }}>
          <a className="btn" href="/giacenze">Giacenze</a>
          <a className="btn" href="/movimenti">Movimenti</a>
        </div>
      </div>

      {/* IMPORT */}
      <div style={{ padding: 12, borderBottom: "1px solid #d9e1ea" }}>
        <h2 style={{ margin: "0 0 8px", fontSize: 16 }}>Import anagrafica da Excel</h2>

        <div className="filters" style={{ gridTemplateColumns: "2fr 1fr 1fr 2fr" }}>
          <div className="field" style={{ gridColumn: "span 2" }}>
            <label>File Excel</label>
            <input
              className="input"
              type="file"
              accept=".xlsx,.xls"
              disabled={importBusy}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) onFile(f);
              }}
            />
          </div>

          <div className="field">
            <label>Stato</label>
            <div
              style={{
                border: "1px solid #cfd8e3",
                borderRadius: 4,
                background: "#f8fafc",
                padding: "9px 10px",
                fontSize: 13,
                color: "#1f2937",
              }}
            >
              {importBusy ? "Importazione…" : "Pronto"}
            </div>
          </div>

          <div className="field">
            <label>&nbsp;</label>
            <button className="btn btnPrimary" type="button" disabled>
              {importBusy ? "Import in corso…" : "Seleziona un file"}
            </button>
          </div>
        </div>

        {importMsg ? (
          <div style={{ marginTop: 10, fontWeight: 800, color: importMsg.includes("✅") ? "#065f46" : "#991b1b" }}>
            {importMsg}
          </div>
        ) : null}
      </div>

      {/* MOVIMENTI */}
      <div style={{ padding: 12 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <h2 style={{ margin: 0, fontSize: 16 }}>Gestione movimenti (elimina)</h2>
          <button className="btn" onClick={loadMovements}>Aggiorna</button>
        </div>

        <div className="filters" style={{ marginTop: 10, gridTemplateColumns: "1fr 1fr 1fr 1fr" }}>
          <div className="field">
            <label>Data da</label>
            <input className="input" type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
          </div>

          <div className="field">
            <label>Data a</label>
            <input className="input" type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
          </div>

          <div className="field">
            <label>Tipo</label>
            <select className="select" value={typeFilter} onChange={(e) => setTypeFilter(e.target.value as any)}>
              <option value="ALL">Tutti</option>
              <option value="IN">Entrata</option>
              <option value="OUT">Uscita</option>
            </select>
          </div>

          <div className="field">
            <label>Codice</label>
            <input
              className="input"
              value={codeSearch}
              onChange={(e) => setCodeSearch(e.target.value)}
              placeholder="Filtra per codice…"
              onKeyDown={(e) => {
                if (e.key === "Enter") loadMovements();
              }}
            />
          </div>
        </div>

        {movMsg ? (
          <div style={{ marginTop: 10, fontWeight: 800, color: movMsg.includes("✅") ? "#065f46" : "#991b1b" }}>
            {movMsg}
          </div>
        ) : null}

        <div className="tableWrap" style={{ marginTop: 10 }}>
          <table className="table">
            <thead>
              <tr>
                <th>Data</th>
                <th>Tipo</th>
                <th>Codice</th>
                <th>Q.tà</th>
                <th>Note</th>
                <th>Inserito da</th>
                <th>Azioni</th>
              </tr>
            </thead>
            <tbody>
              {loadingMov ? (
                <tr><td colSpan={7}>Caricamento…</td></tr>
              ) : shown.length === 0 ? (
                <tr><td colSpan={7}>Nessun movimento.</td></tr>
              ) : (
                shown.map((m) => (
                  <tr key={m.id}>
                    <td>{fmtDate(m.created_at)}</td>
                    <td>{m.type === "IN" ? <span className="badgeIn">Entrata</span> : <span className="badgeOut">Uscita</span>}</td>
                    <td>{m.code}</td>
                    <td>{m.type === "IN" ? "+" : "-"}{m.qty}</td>
                    <td>{m.note ?? ""}</td>
                    <td>{m.created_by_email ?? "-"}</td>
                    <td>
                      <button className="btn" onClick={() => deleteMovement(m.id)}>Elimina</button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div style={{ marginTop: 8, color: "#6b7280", fontSize: 12 }}>
          Nota: per sicurezza, la cancellazione è bloccata anche da RLS (solo admin).
        </div>
      </div>
    </main>
  );
}