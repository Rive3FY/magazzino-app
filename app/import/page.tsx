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

  // ✅ controllo admin all'apertura pagina
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

          const initial_qty = toNumber(r["TOTALE"]); // giacenza iniziale da TOTALE
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

      // ✅ Upsert su code (chiave primaria)
      const { error } = await supabase.from("items").upsert(items, { onConflict: "code" });

      if (error) {
        // Se non admin, Supabase blocca con RLS: qui mostriamo messaggio chiaro
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

  // UI: loading controllo admin
  if (checking) {
    return (
      <main style={{ fontFamily: "system-ui" }}>
        <h1>📥 Import Excel</h1>
        <p>Controllo permessi…</p>
      </main>
    );
  }

  // UI: non admin -> blocco pagina import
  if (!isAdmin) {
    return (
      <main style={{ fontFamily: "system-ui" }}>
        <h1>📥 Import Excel</h1>

        <div
          style={{
            marginTop: 12,
            padding: 16,
            borderRadius: 16,
            background: "rgba(255,255,255,0.08)",
            border: "1px solid rgba(255,255,255,0.14)",
            color: "rgba(255,255,255,0.92)",
            maxWidth: 720,
          }}
        >
          <div style={{ fontWeight: 900, fontSize: 16 }}>Accesso negato</div>
          <p style={{ margin: "8px 0 0", opacity: 0.9 }}>
            Solo l’admin può importare o modificare l’anagrafica da Excel.
            <br />
            Puoi comunque usare <b>Movimenti</b> e <b>Giacenze</b> ed effettuare <b>Export</b>.
          </p>
        </div>

        <p style={{ marginTop: 18 }}>
          <a href="/giacenze">📦 Vai a Giacenze</a> · <a href="/movimenti">➕/➖ Movimenti</a> · <a href="/">Home</a>
        </p>
      </main>
    );
  }

  // UI: admin -> upload
  return (
    <main style={{ fontFamily: "system-ui" }}>
      <h1>📥 Import Excel</h1>
      <p style={{ opacity: 0.9 }}>
        Carica il file Excel. I dati verranno salvati su <b>Supabase</b> e saranno condivisi tra tutti gli utenti loggati.
        <br />
        <b>Solo admin</b> può importare/aggiornare questi dati.
      </p>

      <input
        type="file"
        accept=".xlsx,.xls"
        disabled={busy}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onFile(f);
        }}
      />

      {busy && <p style={{ marginTop: 12 }}>Import in corso…</p>}
      {msg && <p style={{ marginTop: 12 }}>{msg}</p>}

      <p style={{ marginTop: 18 }}>
        <a href="/giacenze">📦 Vai a Giacenze</a> · <a href="/movimenti">➕/➖ Movimenti</a> · <a href="/">Home</a>
      </p>
    </main>
  );
}