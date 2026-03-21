"use client";

import * as XLSX from "xlsx";
import { useState } from "react";
import { createClient } from "../../_lib/supabase/client";
import { useToast } from "../../_lib/ToastContext";
import type { EquipmentArea } from "../../_lib/types";

const EQUIPMENT_FIELDS = [
  { key: "serial_number", label: "Seriale / Codice", required: true },
  { key: "name", label: "Nome / Descrizione", required: true },
  { key: "category", label: "Categoria", required: false },
  { key: "warehouse", label: "Magazzino", required: false },
  { key: "shelf", label: "Scaffale", required: false },
  { key: "place", label: "Posizione", required: false },
  { key: "brand", label: "Marca", required: false },
  { key: "model", label: "Modello", required: false },
  { key: "notes", label: "Note", required: false },
] as const;

type Props = {
  area: EquipmentArea;
  onClose: () => void;
  onSuccess: () => void;
};

function toStr(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "number") return String(v);
  return String(v).trim();
}

export default function EquipmentExcelImportClient({ area, onClose, onSuccess }: Props) {
  const toast = useToast();
  const supabase = createClient();

  const [step, setStep] = useState<"upload" | "mapping" | "preview">("upload");
  const [file, setFile] = useState<File | null>(null);
  const [excelColumns, setExcelColumns] = useState<{ index: number; label: string }[]>([]);
  const [excelRows, setExcelRows] = useState<unknown[][]>([]);
  const [columnMapping, setColumnMapping] = useState<Record<string, number>>({});
  const [importing, setImporting] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  function colLetter(n: number): string {
    let s = "";
    let x = n;
    while (x >= 0) {
      s = String.fromCharCode(65 + (x % 26)) + s;
      x = Math.floor(x / 26) - 1;
    }
    return s;
  }

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setFile(f);
    setMsg(null);

    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const buf = ev.target?.result as ArrayBuffer;
        const wb = XLSX.read(buf, { type: "array" });
        const sheet = wb.Sheets[wb.SheetNames[0]];
        const raw = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: "" });
        if (raw.length === 0) {
          setMsg("Il foglio è vuoto.");
          return;
        }
        const headerRow = raw[0] as unknown[];
        const dataRows = raw.slice(1) as unknown[][];
        const colCount = Math.max(
          headerRow?.length ?? 0,
          ...dataRows.map((r) => r?.length ?? 0)
        );
        const columns: { index: number; label: string }[] = [];
        const seen = new Map<string, number>();
        for (let i = 0; i < colCount; i++) {
          const h = toStr(headerRow?.[i] ?? "");
          const letter = colLetter(i);
          let label: string;
          if (h) {
            const count = (seen.get(h) ?? 0) + 1;
            seen.set(h, count);
            label = count > 1 ? `${h} (${letter})` : `${h} (${letter})`;
          } else {
            const firstVal = dataRows[0]?.[i];
            const s = firstVal != null ? String(firstVal).trim() : "";
            const preview = s ? `: ${s.length > 25 ? s.slice(0, 25) + "…" : s}` : "";
            label = `Colonna ${letter}${preview}`;
          }
          columns.push({ index: i, label });
        }
        setExcelColumns(columns);
        setExcelRows(dataRows);
        setStep("mapping");
      } catch (err) {
        setMsg("Errore lettura file: " + (err instanceof Error ? err.message : String(err)));
      }
    };
    reader.readAsArrayBuffer(f);
  }

  function setMapping(fieldKey: string, colIndex: number) {
    if (colIndex < 0) {
      const { [fieldKey]: _, ...rest } = columnMapping;
      setColumnMapping(rest);
    } else {
      setColumnMapping((prev) => ({ ...prev, [fieldKey]: colIndex }));
    }
  }

  function buildPreviewRows(): Record<string, string>[] {
    return excelRows.map((row) => {
      const out: Record<string, string> = {};
      for (const { key } of EQUIPMENT_FIELDS) {
        const colIndex = columnMapping[key];
        if (colIndex === undefined || colIndex < 0) {
          out[key] = "";
          continue;
        }
        const val = row[colIndex];
        out[key] = toStr(val);
      }
      return out;
    });
  }

  const previewRows = step === "preview" ? buildPreviewRows() : [];
  const validRows = previewRows.filter((r) => r.serial_number.trim() && r.name.trim());
  const skippedCount = previewRows.length - validRows.length;

  async function doImport() {
    if (validRows.length === 0) {
      setMsg("Nessuna riga valida (seriale e nome obbligatori).");
      return;
    }

    setImporting(true);
    setMsg(null);

    let created = 0;
    const errors: string[] = [];

    for (const row of validRows) {
      const serial = row.serial_number.trim();
      const payload = {
        asset_code: serial,
        serial_number: serial,
        name: row.name.trim(),
        category: row.category.trim() || null,
        warehouse: row.warehouse.trim() || null,
        shelf: row.shelf.trim() || null,
        place: row.place.trim() || null,
        brand: row.brand.trim() || null,
        model: row.model.trim() || null,
        notes: row.notes.trim() || null,
        equipment_area: area,
      };

      const { error } = await supabase.from("equipment_assets").insert(payload).select("id").single();
      if (error) {
        errors.push(`${serial}: ${error.message}`);
        if (errors.length >= 5) break;
      } else {
        created++;
      }
    }

    setImporting(false);

    if (errors.length > 0) {
      setMsg(`Import parziale. ${created} create. Errori: ${errors.join("; ")}`);
    } else {
      toast.success(`${created} attrezzature importate`);
      onSuccess();
      onClose();
    }
  }

  return (
    <div
      onMouseDown={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.4)",
        display: "grid",
        placeItems: "center",
        zIndex: 10050,
        padding: 16,
      }}
    >
      <div
        onMouseDown={(e) => e.stopPropagation()}
        style={{
          width: "min(720px, 96vw)",
          maxHeight: "90vh",
          overflow: "auto",
          background: "#fff",
          borderRadius: 14,
          boxShadow: "0 24px 60px rgba(0,0,0,0.2)",
          border: "1px solid #e2e8f0",
        }}
      >
        <div style={{ padding: 16, borderBottom: "1px solid #e2e8f0", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div style={{ fontWeight: 900, fontSize: 18 }}>Importa attrezzature da Excel</div>
            <div style={{ fontSize: 13, color: "#64748b", marginTop: 4 }}>
              {step === "upload" && "Carica il file Excel (.xlsx, .xls)"}
              {step === "mapping" && "Associa le colonne del file ai campi del registro"}
              {step === "preview" && "Anteprima e conferma importazione"}
            </div>
          </div>
          <button type="button" className="btn" onClick={onClose}>Chiudi</button>
        </div>

        <div style={{ padding: 16 }}>
          {step === "upload" && (
            <div>
              <label className="label">File Excel</label>
              <input
                type="file"
                accept=".xlsx,.xls"
                onChange={handleFileSelect}
                className="input"
                style={{ width: "100%" }}
              />
              <div style={{ marginTop: 12, fontSize: 13, color: "#64748b" }}>
                Il file deve avere la prima riga con le intestazioni delle colonne. Dopo il caricamento potrai associare ogni colonna del file ai campi del registro.
              </div>
            </div>
          )}

          {step === "mapping" && (
            <div style={{ display: "grid", gap: 12 }}>
              <div style={{ fontWeight: 800 }}>Associazione colonne</div>
              <div style={{ fontSize: 13, color: "#64748b" }}>
                Per ogni campo del registro, scegli quale colonna del tuo Excel usare. Lascia "(Non usare)" per ignorare una colonna.
                {excelColumns.length > 0 && (
                  <span style={{ display: "block", marginTop: 4, fontWeight: 600 }}>{excelColumns.length} colonne trovate nel file.</span>
                )}
              </div>
              <div style={{ display: "grid", gap: 10 }}>
                {EQUIPMENT_FIELDS.map(({ key, label, required }) => (
                  <div key={key} style={{ display: "grid", gridTemplateColumns: "180px 1fr", gap: 12, alignItems: "center" }}>
                    <label style={{ fontWeight: 600 }}>
                      {label}
                      {required && <span style={{ color: "#dc2626", marginLeft: 4 }}>*</span>}
                    </label>
                    <select
                      className="input"
                      value={columnMapping[key] !== undefined ? String(columnMapping[key]) : ""}
                      onChange={(e) => {
                        const v = e.target.value;
                        setMapping(key, v === "" ? -1 : parseInt(v, 10));
                      }}
                      style={{ width: "100%" }}
                    >
                      <option value="">(Non usare)</option>
                      {excelColumns.map((col) => (
                        <option key={col.index} value={col.index}>{col.label}</option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>
              <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                <button type="button" className="btn btnPrimary" onClick={() => setStep("preview")}>
                  Anteprima
                </button>
                <button type="button" className="btn" onClick={() => setStep("upload")}>
                  Cambia file
                </button>
              </div>
            </div>
          )}

          {step === "preview" && (
            <div style={{ display: "grid", gap: 12 }}>
              <div style={{ fontWeight: 800 }}>
                Anteprima ({validRows.length} righe valide
                {skippedCount > 0 && `, ${skippedCount} saltate (seriale/nome mancanti)`})
              </div>
              <div style={{ overflowX: "auto", maxHeight: 280, border: "1px solid #e2e8f0", borderRadius: 8 }}>
                <table className="table" style={{ fontSize: 12 }}>
                  <thead>
                    <tr>
                      <th>Seriale</th>
                      <th>Nome</th>
                      <th>Categoria</th>
                      <th>Magazzino</th>
                    </tr>
                  </thead>
                  <tbody>
                    {validRows.slice(0, 15).map((r, i) => (
                      <tr key={i}>
                        <td>{r.serial_number}</td>
                        <td>{r.name}</td>
                        <td>{r.category}</td>
                        <td>{r.warehouse}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {validRows.length > 15 && (
                <div style={{ fontSize: 12, color: "#64748b" }}>… e altre {validRows.length - 15} righe</div>
              )}
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button
                  type="button"
                  className="btn btnPrimary"
                  disabled={importing || validRows.length === 0}
                  onClick={() => void doImport()}
                >
                  {importing ? "Importazione…" : `Importa ${validRows.length} attrezzature`}
                </button>
                <button type="button" className="btn" onClick={() => setStep("mapping")}>
                  Modifica associazioni
                </button>
              </div>
            </div>
          )}

          {msg && (
            <div style={{ marginTop: 12, padding: 10, background: "#fef2f2", borderRadius: 8, color: "#991b1b", fontWeight: 600 }}>
              {msg}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
