"use client";

import * as XLSX from "xlsx";
import { useEffect, useState } from "react";
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

function toNumber(v: unknown): number {
  const s = String(v ?? "").trim().replace(",", ".");
  const n = typeof v === "number" ? v : Number(s);
  return Number.isFinite(n) ? n : 0;
}

export default function ImportPage() {
  const supabase = createClient();

  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [checking, setChecking] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    let alive = true;

    (async () => {
      setChecking(true);
      setMsg(null);

      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) {
        if (!alive) return;
        setIsAdmin(false);
        setChecking(false);
        return;
      }

      const { data: adm, error } = await supabase.rpc("is_admin");
      if (!alive) return;

      if (error) {
        console.error("is_admin rpc error:", error);
        setIsAdmin(false);
        setChecking(false);
        return;
      }

      setIsAdmin(!!adm);
      setChecking(false);
    })();

    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function onFile(file: File) {
    setMsg(null);
    setBusy(true);

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
        setMsg("Nessuna riga valida trovata. Controlla intestazioni del file.");
        return;
      }

      const { error } = await supabase.from("items").upsert(items, { onConflict: "code" });

      if (error) {
        setMsg("Import bloccato ❌ (solo admin). Dettaglio: " + error.message);
        return;
      }

      setMsg(`Import completato ✅ (${items.length} righe)`);
    } catch (e: any) {
      setMsg("Errore import: " + (e?.message ?? String(e)));
    } finally {
      setBusy(false);
    }
  }

  // ===== UI =====
  return (
    <main className="panel">
      <div className="pageBar">
        <div className="pageBarTitle">Magazzino - Import anagrafica da Excel</div>
        <div className="pageBarRight" style={{ display: "flex", gap: 8 }}>
          <a className="btn" href="/giacenze">Giacenze</a>
          <a className="btn" href="/movimenti">Movimenti</a>
        </div>
      </div>

      {checking ? (
        <div style={{ padding: 12 }}>
          Controllo permessi…
        </div>
      ) : !isAdmin ? (
        <>
          <div style={{ padding: 12, borderBottom: "1px solid #d9e1ea" }}>
            <div style={{ fontWeight: 900, fontSize: 14 }}>Accesso negato</div>
            <div style={{ marginTop: 6, color: "#6b7280", fontSize: 13 }}>
              Solo l’admin può importare o modificare l’anagrafica da Excel.
              <br />
              Puoi comunque usare Movimenti e Giacenze ed effettuare Export.
            </div>
          </div>

          <div className="actionsRow">
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <a className="btn" href="/giacenze">Vai a Giacenze</a>
              <a className="btn" href="/movimenti">Vai a Movimenti</a>
              <a className="btn" href="/">Dashboard</a>
            </div>
          </div>
        </>
      ) : (
        <>
          <div style={{ padding: 12, borderBottom: "1px solid #d9e1ea" }}>
            <div style={{ fontSize: 13, color: "#6b7280" }}>
              Carica il file Excel. I dati verranno salvati su Supabase e saranno condivisi tra tutti gli utenti loggati.
              <br />
              <b>Solo admin</b> può importare/aggiornare questi dati.
            </div>
          </div>

          <div className="filters" style={{ gridTemplateColumns: "2fr 1fr 1fr 2fr" }}>
            <div className="field" style={{ gridColumn: "span 2" }}>
              <label>File Excel</label>
              <input
                className="input"
                type="file"
                accept=".xlsx,.xls"
                disabled={busy}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) onFile(f);
                }}
              />
            </div>

            <div className="field">
              <label>&nbsp;</label>
              <button className="btn btnPrimary" type="button" disabled={busy}>
                {busy ? "Import in corso…" : "Importa"}
              </button>
              {/* Nota: il bottone sopra è solo estetico (l'import parte alla selezione file) */}
            </div>

            <div className="field" style={{ gridColumn: "span 1" }}>
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
                {busy ? "Importazione…" : "Pronto"}
              </div>
            </div>
          </div>

          {msg ? (
            <div
              style={{
                padding: "10px 12px",
                borderTop: "1px solid #d9e1ea",
                color: msg.includes("✅") ? "#065f46" : "#991b1b",
                fontWeight: 700,
              }}
            >
              {msg}
            </div>
          ) : null}
        </>
      )}
    </main>
  );
}