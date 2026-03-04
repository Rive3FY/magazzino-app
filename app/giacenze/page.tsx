"use client";

export const dynamic = "force-dynamic";

import React, { useEffect, useMemo, useState } from "react";
import * as XLSX from "xlsx";
import { createClient } from "../_lib/supabase/client";

const PAGE_SIZE = 25;

type WarehouseView = "REALE" | "PRM" | "TUTTI";
type SortDir = "none" | "asc" | "desc";

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

type DbRow = {
  code: string;
  warehouse: "PRM" | "REALE";
  qty_free: number;
  qty_blocked: number;
  qty_quality: number;
  initial_qty: number;
  excel: Record<string, any> | null;

  // se la rpc li ritorna (consigliato)
  name?: string | null;
  um?: string | null;

  // conteggio totale (ritornato dalla rpc)
  total_count?: number | null;
};

function n(v: any) {
  const x = Number(v ?? 0);
  return Number.isFinite(x) ? x : 0;
}

function toNumberLoose(v: any) {
  const s = String(v ?? "").trim().replace(",", ".");
  const x = Number(s);
  return Number.isFinite(x) ? x : 0;
}

function sanitizeId(s: string) {
  return "f_" + s.replace(/\W+/g, "_").toLowerCase();
}

export default function GiacenzePage() {
  const supabase = createClient();

  const [view, setView] = useState<WarehouseView>("REALE");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);

  const [sortKey, setSortKey] = useState<string>("Materiale");
  const [sortDir, setSortDir] = useState<SortDir>("none");

  const [count, setCount] = useState(0);
  const [rows, setRows] = useState<DbRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<string | null>(null);

  const totalPages = Math.max(1, Math.ceil(count / PAGE_SIZE));

  // Admin
  const [isAdmin, setIsAdmin] = useState(false);

  // Popup
  const [editing, setEditing] = useState<DbRow | null>(null);
  const [editExcel, setEditExcel] = useState<Record<string, any>>({});
  const [saving, setSaving] = useState(false);

  // modalità creazione nuovo materiale
  const [creating, setCreating] = useState(false);

  // quali campi sono sbloccati (uno per volta)
  const [unlocked, setUnlocked] = useState<Record<string, boolean>>({});

  useEffect(() => {
    (async () => {
      try {
        const { data, error } = await supabase.rpc("is_admin");
        if (error) {
          console.error("is_admin rpc error:", error);
          setIsAdmin(false);
          return;
        }
        setIsAdmin(!!data);
      } catch {
        setIsAdmin(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function cycleSort(clickedKey: string) {
    setPage(1);

    if (sortKey !== clickedKey) {
      setSortKey(clickedKey);
      setSortDir("asc");
      return;
    }

    setSortDir((prev) => {
      if (prev === "none") return "asc";
      if (prev === "asc") return "desc";
      return "none";
    });
  }

  function sortIcon(col: string) {
    if (sortKey !== col || sortDir === "none") return "↕";
    return sortDir === "asc" ? "↑" : "↓";
  }

  async function load() {
    setLoading(true);
    setMsg(null);

    const search = q.trim() || null;
    const offset = (page - 1) * PAGE_SIZE;

    // ✅ Ordinamento globale via RPC
    const { data, error } = await supabase.rpc("giacenze_list", {
      p_view: view,
      p_search: search,
      p_sort_key: sortKey,
      p_sort_dir: sortDir, // "none" | "asc" | "desc"
      p_limit: PAGE_SIZE,
      p_offset: offset,
    });

    if (error) {
      console.error("giacenze_list error:", error);
      setRows([]);
      setCount(0);
      setLoading(false);
      setMsg("Errore caricamento giacenze. (RPC giacenze_list)");
      return;
    }

    const list = (data ?? []) as DbRow[];
    setRows(list);

    const tc = Number(list?.[0]?.total_count ?? 0);
    setCount(Number.isFinite(tc) && tc > 0 ? tc : list.length);

    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, view, sortKey, sortDir]);

  useEffect(() => {
    setPage(1);
  }, [q, view, sortKey, sortDir]);

  useEffect(() => {
    const t = setTimeout(() => {
      load();
    }, 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  const viewRows = useMemo(() => rows, [rows]);

  function openEdit(r: DbRow) {
    setCreating(false);
    setEditing(r);

    const base = { ...(r.excel ?? {}) };

    base["Materiale"] = r.code;
    if (r.name != null) base["Descrizione Materiale"] = r.name ?? "";
    if (r.um != null) base["Unità di Misura"] = r.um ?? "";

    if (base["Qnt. a Mag. libero"] == null) base["Qnt. a Mag. libero"] = r.qty_free ?? 0;
    if (base["Qnt. a Mag. bloccato"] == null) base["Qnt. a Mag. bloccato"] = r.qty_blocked ?? 0;
    if (base["Controllo Qualità Magazzino"] == null) base["Controllo Qualità Magazzino"] = r.qty_quality ?? 0;

    setEditExcel(base);
    setUnlocked({});
    setMsg(null);
  }

  function openCreate() {
    if (!isAdmin) return;

    const base: Record<string, any> = {};
    for (const c of EXCEL_COLS) base[c] = "";

    const wh: "PRM" | "REALE" = view === "PRM" ? "PRM" : "REALE";

    setEditing({
      code: "",
      warehouse: wh,
      qty_free: 0,
      qty_blocked: 0,
      qty_quality: 0,
      initial_qty: 0,
      excel: base,
    });

    setEditExcel(base);
    setUnlocked({});
    setCreating(true);
    setMsg(null);
  }

  async function saveEdit() {
    if (!editing) return;

    setSaving(true);
    setMsg(null);

    try {
      const qtyFree = toNumberLoose(editExcel["Qnt. a Mag. libero"]);
      const qtyBlocked = toNumberLoose(editExcel["Qnt. a Mag. bloccato"]);
      const qtyQuality = toNumberLoose(editExcel["Controllo Qualità Magazzino"]);
      const initial = qtyFree + qtyBlocked + qtyQuality;

      const code = String(editExcel["Materiale"] ?? editing.code ?? "").trim();
      if (!code) {
        setMsg("Inserisci il codice materiale (Materiale).");
        setSaving(false);
        return;
      }

      const payload = {
        excel: editExcel,
        qty_free: qtyFree,
        qty_blocked: qtyBlocked,
        qty_quality: qtyQuality,
        initial_qty: initial,
      };

      if (creating) {
        if (!isAdmin) {
          setMsg("Solo admin può creare nuovi materiali.");
          setSaving(false);
          return;
        }

        // items: crea/aggiorna anagrafica minima
        const name = String(editExcel["Descrizione Materiale"] ?? "").trim() || code;
        const um = String(editExcel["Unità di Misura"] ?? "").trim() || null;

        const { error: eItems } = await supabase
          .from("items")
          .upsert({ code, name, um } as any, { onConflict: "code" });

        if (eItems) {
          setMsg("Errore creazione (items): " + eItems.message);
          setSaving(false);
          return;
        }

        const { error: eStock } = await supabase
          .from("item_stocks")
          .upsert(
            {
              code,
              warehouse: editing.warehouse,
              excel: editExcel,
              qty_free: qtyFree,
              qty_blocked: qtyBlocked,
              qty_quality: qtyQuality,
              initial_qty: initial,
            } as any,
            { onConflict: "code,warehouse" }
          );

        if (eStock) {
          setMsg("Errore creazione (item_stocks): " + eStock.message);
          setSaving(false);
          return;
        }
      } else {
        const { error } = await supabase
          .from("item_stocks")
          .update(payload as any)
          .eq("code", editing.code)
          .eq("warehouse", editing.warehouse);

        if (error) {
          console.error("saveEdit error:", error);
          setMsg("Errore salvataggio: " + ((error as any)?.message ?? "sconosciuto"));
          setSaving(false);
          return;
        }
      }

      setMsg("Salvato ✅");
      setEditing(null);
      setEditExcel({});
      setUnlocked({});
      setCreating(false);
      await load();
    } finally {
      setSaving(false);
    }
  }

  async function deleteRow() {
    if (!isAdmin) return;
    if (!editing) return;
    if (creating) return;

    const ok = confirm(`Eliminare questo materiale?\n\nCodice: ${editing.code}\nMagazzino: ${editing.warehouse}`);
    if (!ok) return;

    const { error } = await supabase
      .from("item_stocks")
      .delete()
      .eq("code", editing.code)
      .eq("warehouse", editing.warehouse);

    if (error) {
      setMsg("Errore eliminazione: " + error.message);
      return;
    }

    setMsg("Eliminato ✅");
    setEditing(null);
    setEditExcel({});
    setUnlocked({});
    await load();
  }

  function exportXlsx() {
    const data = viewRows.map((r) => {
      const obj: Record<string, any> = {};
      for (const c of EXCEL_COLS) {
        if (c === "Materiale") obj[c] = r.code;
        else if (c === "Descrizione Materiale") obj[c] = r.name ?? r.excel?.[c] ?? "";
        else if (c === "Unità di Misura") obj[c] = r.um ?? r.excel?.[c] ?? "";
        else obj[c] = r.excel?.[c] ?? "";
      }
      obj["_warehouse"] = r.warehouse;
      return obj;
    });

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Giacenze");
    XLSX.writeFile(wb, `giacenze_${view.toLowerCase()}_pagina_${page}.xlsx`);
  }

  return (
    <main className="panel">

      <div
  className="pageBar"
  style={{
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 10,
  }}
>
        <div className="pageBarTitle">Magazzino - Giacenze (Excel completo)</div>
        <div className="pageBarActions">
          {isAdmin && (
            <button className="btn" onClick={openCreate}>
              Nuovo materiale
            </button>
          )}
          <a className="btn" href="/movimenti">
            Movimenti
          </a>
          <a className="btn" href="/import">
            Import
          </a>
        </div>
      </div>

      {/* Filtri */}
      <div className="card" style={{ padding: 12 }}>
        <div style={{ display: "grid", gridTemplateColumns: "180px 1fr auto auto", gap: 10, alignItems: "end" }}>
          <div>
            <label className="label" htmlFor="viewSel">
              Magazzino
            </label>
            <select id="viewSel" name="viewSel" className="input" value={view} onChange={(e) => setView(e.target.value as WarehouseView)}>
              <option value="REALE">REALE</option>
              <option value="PRM">PRM</option>
              <option value="TUTTI">TUTTI</option>
            </select>
          </div>

          <div>
            <label className="label" htmlFor="qSearch">
              Cerca
            </label>
            <input
              id="qSearch"
              name="qSearch"
              className="input"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Codice, descrizione, qualunque colonna excel…"
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

        <div style={{ marginTop: 10, fontSize: 12, opacity: 0.8 }}>
          Ordinamento: clicca su una colonna → <b>↑</b> (ASC) → <b>↓</b> (DESC) → <b>↕</b> (default).
        </div>
      </div>

      {msg && <div style={{ padding: 12, fontWeight: 800 }}>{msg}</div>}

      {loading ? (
        <div style={{ padding: 12 }}>Caricamento…</div>
      ) : (
        <>
          {/* Scroll orizzontale */}
          <div
            style={{
              overflowX: "auto",
              overflowY: "hidden",
              width: "100%",
              marginTop: 12,
              WebkitOverflowScrolling: "touch",
            }}
          >
            <table className="table" style={{ minWidth: 2600 }}>
              <thead>
                <tr>
                  <th onClick={() => cycleSort("_warehouse")} style={{ cursor: "pointer", userSelect: "none" }} title="Ordina">
                    Warehouse <span style={{ opacity: 0.7 }}>{sortIcon("_warehouse")}</span>
                  </th>

                  {EXCEL_COLS.map((c) => (
                    <th key={c} onClick={() => cycleSort(c)} style={{ cursor: "pointer", userSelect: "none" }} title="Ordina">
                      {c} <span style={{ opacity: 0.7 }}>{sortIcon(c)}</span>
                    </th>
                  ))}
                </tr>
              </thead>

              <tbody>
                {viewRows.map((r, idx) => {
                  const zebraBg = idx % 2 === 0 ? "rgba(15,23,42,0.03)" : "rgba(15,23,42,0.08)";
                  return (
                    <tr
                      key={`${r.code}__${r.warehouse}`}
                      style={{ background: zebraBg, cursor: "pointer" }}
                      title="Clicca per aprire e modificare (con matita)"
                      onClick={() => openEdit(r)}
                    >
                      <td style={{ fontWeight: 900 }}>{r.warehouse}</td>

                      {EXCEL_COLS.map((c) => {
                        let v: any = r.excel?.[c] ?? "";

                        if (c === "Materiale") v = r.code;
                        if (c === "Descrizione Materiale") v = r.name ?? v;
                        if (c === "Unità di Misura") v = r.um ?? v;

                        return <td key={c}>{String(v ?? "")}</td>;
                      })}
                    </tr>
                  );
                })}

                {viewRows.length === 0 && (
                  <tr>
                    <td colSpan={1 + EXCEL_COLS.length} style={{ padding: 12, color: "#0f172a" }}>
                      Nessun risultato.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* paginazione */}
          <div style={{ marginTop: 14, display: "flex", gap: 10, alignItems: "center" }}>
            <button className="btn" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))} style={{ opacity: page <= 1 ? 0.6 : 1 }}>
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

      {/* POPUP EDIT */}
      {editing && (
        <div
          onMouseDown={() => {
            if (saving) return;
            setEditing(null);
            setEditExcel({});
            setUnlocked({});
            setCreating(false);
            setMsg(null);
          }}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(15,23,42,0.35)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 14,
            zIndex: 999,
          }}
        >
          <div
            onMouseDown={(e) => e.stopPropagation()}
            style={{
              width: "min(1100px, 100%)",
              maxHeight: "85vh",
              overflow: "auto",
              background: "white",
              borderRadius: 14,
              border: "1px solid rgba(15,23,42,0.16)",
              boxShadow: "0 24px 60px rgba(0,0,0,0.35)",
              padding: 12,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
              <div style={{ fontWeight: 900 }}>
                {creating ? "Nuovo materiale" : "Modifica riga"} ·{" "}
                <span style={{ opacity: 0.75 }}>{creating ? "(nuovo)" : editing.code}</span> ·{" "}
                <span style={{ opacity: 0.75 }}>{editing.warehouse}</span>
              </div>

              <div style={{ display: "flex", gap: 10 }}>
                {isAdmin && !creating && (
                  <button
                    className="btn"
                    style={{
                      borderColor: "rgba(239,68,68,0.5)",
                      background: "rgba(239,68,68,0.1)",
                      color: "#991b1b",
                    }}
                    disabled={saving}
                    onClick={deleteRow}
                    title="Elimina riga"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <polyline points="3 6 5 6 21 6" />
                      <path d="M19 6l-1 14H6L5 6" />
                      <path d="M10 11v6" />
                      <path d="M14 11v6" />
                      <path d="M9 6V4h6v2" />
                    </svg>
                  </button>
                )}

                <button
                  className="btn"
                  disabled={saving}
                  onClick={() => {
                    setEditing(null);
                    setEditExcel({});
                    setUnlocked({});
                    setCreating(false);
                    setMsg(null);
                  }}
                >
                  Chiudi
                </button>

                <button className="btn btnPrimary" disabled={saving} onClick={saveEdit}>
                  {saving ? "Salvataggio…" : "Salva"}
                </button>
              </div>
            </div>

            <div style={{ marginTop: 10, fontSize: 12, opacity: 0.75 }}>
              Tutto è bloccato. Premi la <b>matita</b> a destra del campo per sbloccare solo quel campo.
            </div>

            <div style={{ marginTop: 10, display: "grid", gridTemplateColumns: "repeat(12, 1fr)", gap: 10 }}>
              {EXCEL_COLS.map((c) => {
                const id = sanitizeId(c);

                // Materiale è editabile SOLO in creazione
                const isMaterialReadOnly = c === "Materiale" && !creating;

                // descrizione/um: li gestisci già tu, qui li lasciamo bloccati
                const isAlwaysLocked = c === "Descrizione Materiale" || c === "Unità di Misura";

                const computedValue =
                  c === "Materiale"
                    ? (creating ? (editExcel[c] ?? "") : editing.code)
                    : isAlwaysLocked
                    ? (editExcel[c] ?? "")
                    : (editExcel[c] ?? "");

                // ✅ se sei admin, NON bloccare mai "Descrizione Materiale" e "Unità di Misura"
const adminCanEditCoreFields =
  isAdmin && (c === "Descrizione Materiale" || c === "Unità di Misura");

// regola base (quella che avevi)
const canUnlockBase = !isMaterialReadOnly && !isAlwaysLocked;

// ✅ admin sblocca anche quei 2 campi
const canUnlock = adminCanEditCoreFields ? true : canUnlockBase;

const isUnlocked = !!unlocked[c];

// se vuoi che resti sempre “con matita”, lascia così:
const disabled = saving || !canUnlock || !isUnlocked;

                const inputStyle: React.CSSProperties = disabled
                  ? { background: "#f1f5f9", color: "#64748b" }
                  : { background: "white", color: "#0f172a" };

                return (
                  <div key={c} style={{ gridColumn: "span 6" }}>
                    <label className="label" htmlFor={id}>
                      {c}
                    </label>

                    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                      <input
                        id={id}
                        name={id}
                        className="input"
                        disabled={disabled}
                        value={String(computedValue ?? "")}
                        style={{ ...inputStyle, flex: 1 }}
                        onChange={(e) => {
                          if (disabled) return;
                          const v = e.target.value;
                          setEditExcel((prev) => ({ ...prev, [c]: v }));
                        }}
                      />

                      <button
                        type="button"
                        className="btn"
                        disabled={!canUnlock || saving}
                        onClick={() => {
                          if (!canUnlock || saving) return;
                          setUnlocked((prev) => ({ ...prev, [c]: !prev[c] }));
                        }}
                        title={canUnlock ? (isUnlocked ? "Blocca campo" : "Modifica campo") : "Campo non modificabile"}
                        style={{
                          width: 44,
                          justifyContent: "center",
                          opacity: canUnlock ? 1 : 0.5,
                        }}
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M12 20h9" />
                          <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z" />
                        </svg>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            {msg && <div style={{ marginTop: 10, fontWeight: 800 }}>{msg}</div>}

            <div style={{ marginTop: 10, fontSize: 12, opacity: 0.75 }}>
              Nota: se modifichi <b>Qnt. a Mag. libero / bloccato / Controllo Qualità Magazzino</b>, al salvataggio vengono riallineati anche i campi numerici interni.
            </div>
          </div>
        </div>
      )}
    </main>
  );
}