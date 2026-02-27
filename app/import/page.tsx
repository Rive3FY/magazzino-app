"use client";

import * as XLSX from "xlsx";
import { useState } from "react";
import { Item, upsertManyItems } from "../_lib/store";

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
  const [msg, setMsg] = useState<string | null>(null);
  const [preview, setPreview] = useState<Item[]>([]);

  async function onFile(file: File) {
    setMsg(null);
    setPreview([]);

    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json<Row>(sheet, { defval: "" });

      const items: Item[] = rows
        .map((r) => {
          const code = String(r["Materiale"] ?? "").trim();
          const name = String(r["Descrizione Materiale"] ?? "").trim();

          const total = toNumber(r["TOTALE"]);
          const qtyFree = toNumber(r["Qnt. a Mag. Libero"]);
          const qtyBlocked = toNumber(r["Qnt. a Mag. bloccato"]);
          const qtyQuality = toNumber(r["Controllo Qualità Magazzino"]);

          return {
            code,
            name,
            initialQty: total,
            um: String(r["UM"] ?? "").trim() || undefined,

            division: String(r["Divisione"] ?? "").trim() || undefined,
            divisionDesc: String(r["Descrizione Divisione"] ?? "").trim() || undefined,

            warehouse: String(r["Magazzino"] ?? "").trim() || undefined,
            warehouseDesc: String(r["Descrizione Magazzino"] ?? "").trim() || undefined,

            groupDesc: String(r["Descrizione Gruppo Merci"] ?? "").trim() || undefined,

            qtyFree,
            qtyBlocked,
            qtyQuality,
          };
        })
        .filter((x) => x.code && x.name);

      if (items.length === 0) {
        setMsg("Nessuna riga valida trovata. Controlla intestazioni del file.");
        return;
      }

      upsertManyItems(items);
      setPreview(items.slice(0, 20));
      setMsg(`Import completato ✅ (${items.length} righe).`);
    } catch (e: any) {
      setMsg("Errore import: " + (e?.message ?? String(e)));
    }
  }

  return (
    <main style={{ padding: 24, fontFamily: "system-ui", maxWidth: 1200 }}>
      <h1>📥 Import Excel</h1>
      <p>Import per file con intestazioni nuove (Materiale, Descrizione Materiale, TOTALE, ecc.).</p>

      <input
        type="file"
        accept=".xlsx,.xls"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onFile(f);
        }}
      />

      {msg && <p style={{ marginTop: 12 }}>{msg}</p>}

      {preview.length > 0 && (
        <>
          <h2 style={{ marginTop: 20 }}>Anteprima</h2>
          <div style={{ overflowX: "auto" }}>
            <table style={{ borderCollapse: "collapse", width: "100%" }}>
              <thead>
                <tr>
                  {["Materiale", "Descrizione", "Magazzino", "UM", "Libero", "Bloccato", "CQ", "TOTALE"].map((h) => (
                    <th key={h} style={{ textAlign: "left", padding: 8, borderBottom: "1px solid #ddd" }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {preview.map((it) => (
                  <tr key={it.code}>
                    <td style={{ padding: 8, borderBottom: "1px solid #f0f0f0" }}>{it.code}</td>
                    <td style={{ padding: 8, borderBottom: "1px solid #f0f0f0" }}>{it.name}</td>
                    <td style={{ padding: 8, borderBottom: "1px solid #f0f0f0" }}>
                      {[it.warehouse, it.warehouseDesc].filter(Boolean).join(" - ")}
                    </td>
                    <td style={{ padding: 8, borderBottom: "1px solid #f0f0f0" }}>{it.um ?? ""}</td>
                    <td style={{ padding: 8, borderBottom: "1px solid #f0f0f0" }}>{it.qtyFree ?? 0}</td>
                    <td style={{ padding: 8, borderBottom: "1px solid #f0f0f0" }}>{it.qtyBlocked ?? 0}</td>
                    <td style={{ padding: 8, borderBottom: "1px solid #f0f0f0" }}>{it.qtyQuality ?? 0}</td>
                    <td style={{ padding: 8, borderBottom: "1px solid #f0f0f0" }}><b>{it.initialQty}</b></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      <p style={{ marginTop: 24 }}>
        <a href="/">← Home</a>
      </p>
    </main>
  );
}