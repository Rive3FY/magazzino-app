"use client";

import * as XLSX from "xlsx";
import { useState } from "react";
import { createClient } from "../_lib/supabase/client";

type Row = {
  "Materiale"?: any;
  "Descrizione Materiale"?: any;
  "Divisione"?: any;
  "Descrizione Divisione"?: any;
  "Magazzino"?: any;
  "Descrizione Magazzino"?: any;
  "Qnt. a Mag. bloccato"?: any;
  "Controllo Qualità Magazzino"?: any;
  "Descrizione Gruppo Merci"?: any;
  "Qnt. a Mag. Libero"?: any;
  "UM"?: any;
  "TOTALE"?: any;
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

          const initial_qty = toNumber(r["TOTALE"]); // ✅ giacenza iniziale da TOTALE
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

      // Upsert su code (chiave primaria)
      const { error } = await supabase
        .from("items")
        .upsert(items, { onConflict: "code" });

      if (error) {
        setMsg("Errore import DB: " + error.message);
        return;
      }

      setMsg(`Import completato ✅ (${items.length} righe)`);
    } catch (e: any) {
      setMsg("Errore import: " + (e?.message ?? String(e)));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main style={{ fontFamily: "system-ui" }}>
      <h1>📥 Import Excel</h1>
      <p style={{ opacity: 0.9 }}>
        Carica il file Excel. I dati verranno salvati su <b>Supabase</b> e saranno condivisi tra tutti gli utenti loggati.
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