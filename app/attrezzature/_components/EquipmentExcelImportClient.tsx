"use client";

import * as XLSX from "xlsx";
import { useMemo, useState } from "react";
import { createClient } from "../../_lib/supabase/client";
import { useToast } from "../../_lib/ToastContext";
import AppModalFrame from "../../_components/AppModalFrame";
import { AppBusyLabel } from "../../_components/AppSpinner";
import type { EquipmentArea } from "../../_lib/types";
import {
  deleteAssetsPreservingMovements,
  findOpenMovementAssetIds,
  isAssetBlockedFromCatalogDelete,
  type EquipmentCatalogAsset,
} from "../../_lib/equipment-movement-snapshot";

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

type ExistingAsset = EquipmentCatalogAsset & { area: EquipmentArea };

function toStr(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "number") return String(v);
  return String(v).trim();
}

function normalizeSerial(value: string) {
  return value.trim().toLowerCase();
}

function serialKeyOf(asset: { serial_number?: string | null; asset_code?: string | null }) {
  return normalizeSerial(String(asset.serial_number || asset.asset_code || ""));
}

export default function EquipmentExcelImportClient({ area, onClose, onSuccess }: Props) {
  const toast = useToast();
  const supabase = createClient();

  const [step, setStep] = useState<"upload" | "mapping" | "preview">("upload");
  const [excelColumns, setExcelColumns] = useState<{ index: number; label: string }[]>([]);
  const [excelRows, setExcelRows] = useState<unknown[][]>([]);
  const [columnMapping, setColumnMapping] = useState<Record<string, number>>({});
  const [importing, setImporting] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [existingBySerial, setExistingBySerial] = useState<Map<string, { id: string; area: EquipmentArea }>>(new Map());
  const [areaAssets, setAreaAssets] = useState<ExistingAsset[]>([]);
  const [openAssetIds, setOpenAssetIds] = useState<Set<string>>(new Set());
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
  const updateCount = validRows.filter((row) => existingBySerial.has(normalizeSerial(row.serial_number))).length;
  const createCount = validRows.length - updateCount;

  const incomingKeys = useMemo(
    () => new Set(validRows.map((row) => normalizeSerial(row.serial_number))),
    [validRows]
  );

  const missingAssets = useMemo(
    () => areaAssets.filter((asset) => {
      const key = serialKeyOf(asset);
      return !key || !incomingKeys.has(key);
    }),
    [areaAssets, incomingKeys]
  );

  const removableMissing = useMemo(
    () => missingAssets.filter((asset) => !isAssetBlockedFromCatalogDelete(asset, openAssetIds)),
    [missingAssets, openAssetIds]
  );

  const blockedMissing = useMemo(
    () => missingAssets.filter((asset) => isAssetBlockedFromCatalogDelete(asset, openAssetIds)),
    [missingAssets, openAssetIds]
  );

  function catalogPayload(row: Record<string, string>, mode: "insert" | "update") {
    const serial = row.serial_number.trim();
    const payload: Record<string, string | null> = {
      asset_code: serial,
      serial_number: serial,
      name: row.name.trim(),
    };
    for (const { key } of EQUIPMENT_FIELDS) {
      if (key === "serial_number" || key === "name") continue;
      if (mode === "update" && columnMapping[key] === undefined) continue;
      payload[key] = row[key].trim() || null;
    }
    return payload;
  }

  async function goPreview() {
    setPreviewLoading(true);
    setMsg(null);
    try {
      const { data, error } = await supabase
        .from("equipment_assets")
        .select("id,serial_number,asset_code,equipment_area,name,warehouse,shelf,place,category,status");
      if (error) throw error;
      const map = new Map<string, { id: string; area: EquipmentArea }>();
      const currentArea: ExistingAsset[] = [];
      for (const asset of data ?? []) {
        const row = asset as {
          id: string;
          serial_number: string | null;
          asset_code: string | null;
          equipment_area: EquipmentArea;
          name: string | null;
          warehouse: string | null;
          shelf: string | null;
          place: string | null;
          category: string | null;
          status: string | null;
        };
        const key = serialKeyOf(row);
        if (key) map.set(key, { id: row.id, area: row.equipment_area });
        if (row.equipment_area === area) {
          currentArea.push({ ...row, area: row.equipment_area });
        }
      }
      setExistingBySerial(map);
      setAreaAssets(currentArea);
      const open = await findOpenMovementAssetIds(
        supabase,
        currentArea.map((asset) => asset.id)
      );
      if (open.error) throw new Error(open.error);
      setOpenAssetIds(open.ids);
      setStep("preview");
    } catch (err) {
      setMsg("Errore lettura anagrafica: " + (err instanceof Error ? err.message : String(err)));
    } finally {
      setPreviewLoading(false);
    }
  }

  async function doImport() {
    if (validRows.length === 0) {
      setMsg("Nessuna riga valida (seriale e nome obbligatori).");
      return;
    }

    setImporting(true);
    setMsg(null);

    let created = 0;
    let updated = 0;
    const errors: string[] = [];
    const seenInFile = new Map<string, { id: string; area: EquipmentArea }>(existingBySerial);

    for (const row of validRows) {
      const serial = row.serial_number.trim();
      const key = normalizeSerial(serial);
      const existing = seenInFile.get(key);
      const payload = catalogPayload(row, existing ? "update" : "insert");

      if (existing && existing.area !== area) {
        errors.push(`${serial}: già presente nell'area ${existing.area === "LINEE" ? "Linee" : "Stazioni"}`);
        if (errors.length >= 5) break;
        continue;
      }

      if (existing) {
        const { error } = await supabase
          .from("equipment_assets")
          .update(payload)
          .eq("id", existing.id)
          .eq("equipment_area", area);
        if (error) {
          errors.push(`${serial}: ${error.message}`);
          if (errors.length >= 5) break;
        } else {
          updated++;
        }
        continue;
      }

      const { data, error } = await supabase
        .from("equipment_assets")
        .insert({ ...payload, equipment_area: area })
        .select("id")
        .single();
      if (error) {
        errors.push(`${serial}: ${error.message}`);
        if (errors.length >= 5) break;
      } else {
        created++;
        if (data?.id) seenInFile.set(key, { id: data.id, area });
      }
    }

    if (errors.length > 0) {
      setImporting(false);
      setMsg(`Import parziale. ${updated} aggiornate, ${created} nuove. Errori: ${errors.join("; ")}`);
      return;
    }

    const { data: currentAreaRows, error: reloadError } = await supabase
      .from("equipment_assets")
      .select("id,serial_number,asset_code,name,warehouse,shelf,place,category,status")
      .eq("equipment_area", area);
    if (reloadError) {
      setImporting(false);
      setMsg("Anagrafica aggiornata, ma non è stato possibile rimuovere le attrezzature assenti dal file: " + reloadError.message);
      return;
    }

    const incoming = new Set(validRows.map((row) => normalizeSerial(row.serial_number)));
    const toReview = ((currentAreaRows ?? []) as EquipmentCatalogAsset[]).filter((asset) => {
      const key = serialKeyOf(asset);
      return !key || !incoming.has(key);
    });
    const open = await findOpenMovementAssetIds(
      supabase,
      toReview.map((asset) => asset.id)
    );
    if (open.error) {
      setImporting(false);
      setMsg("Anagrafica aggiornata, ma non è stato possibile verificare i movimenti aperti: " + open.error);
      return;
    }

    const toDelete = toReview.filter((asset) => !isAssetBlockedFromCatalogDelete(asset, open.ids));
    const kept = toReview.length - toDelete.length;
    const removed = await deleteAssetsPreservingMovements(supabase, toDelete, area);
    setImporting(false);
    if (removed.error) {
      setMsg(
        `Anagrafica aggiornata (${updated} aggiornate, ${created} nuove), ma la rimozione delle attrezzature assenti dal file è fallita: ${removed.error}`
      );
      return;
    }

    const parts = [
      updated > 0 ? `${updated} aggiornate` : null,
      created > 0 ? `${created} nuove` : null,
      toDelete.length > 0 ? `${toDelete.length} rimosse dall'anagrafica` : "nessuna rimossa",
    ].filter(Boolean);
    toast.success(
      `${parts.join(", ")}. Movimenti, registri e scaffali conservati${
        kept > 0 ? `. ${kept} non rimosse perché in uscita aperta o in manutenzione` : ""
      }.`
    );
    onSuccess();
    onClose();
  }

  return (
    <AppModalFrame
      open
      title="Importa attrezzature da Excel"
      subtitle={
        <>
          {step === "upload" && "Carica il file Excel (.xlsx, .xls)"}
          {step === "mapping" && "Associa le colonne del file ai campi del registro"}
          {step === "preview" && "Anteprima: il file sostituisce l'anagrafica, movimenti e registri restano"}
        </>
      }
      onClose={onClose}
      width="min(720px, 96vw)"
      headerRight={<button type="button" className="btn" onClick={onClose}>Chiudi</button>}
    >
        <div style={{ display: "grid", gap: 16 }}>
          {step === "upload" && (
            <div className="appModalSection">
              <div className="appModalSectionHeader">Caricamento file</div>
              <div className="appModalSectionBody">
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
                  Le attrezzature già presenti (stesso seriale) vengono aggiornate; quelle assenti dal file vengono cancellate dall&apos;anagrafica. Movimenti, registri e scaffali restano.
                </div>
              </div>
            </div>
          )}

          {step === "mapping" && (
            <div className="appModalSection">
              <div className="appModalSectionHeader">Associazione colonne</div>
              <div className="appModalSectionBody" style={{ display: "grid", gap: 12 }}>
                <div style={{ fontSize: 13, color: "#64748b" }}>
                  Per ogni campo del registro, scegli quale colonna del tuo Excel usare. Lascia &quot;(Non usare)&quot; per ignorare una colonna.
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
                  <button type="button" className="btn btnPrimary" onClick={() => void goPreview()} disabled={previewLoading}>
                    <AppBusyLabel busy={previewLoading}>{previewLoading ? "Lettura anagrafica…" : "Anteprima"}</AppBusyLabel>
                  </button>
                  <button type="button" className="btn" onClick={() => setStep("upload")}>
                    Cambia file
                  </button>
                </div>
              </div>
            </div>
          )}

          {step === "preview" && (
            <div className="appModalSection">
              <div className="appModalSectionHeader">Anteprima</div>
              <div className="appModalSectionBody" style={{ display: "grid", gap: 12 }}>
                <div style={{ fontWeight: 800 }}>
                  Anteprima ({validRows.length} righe valide
                  {skippedCount > 0 && `, ${skippedCount} saltate (seriale/nome mancanti)`})
                </div>
                <div style={{ padding: 10, borderRadius: 8, background: "rgba(34,197,94,0.08)", border: "1px solid rgba(34,197,94,0.25)", fontSize: 13, fontWeight: 700, color: "#166534" }}>
                  {updateCount} già in anagrafica verranno aggiornate · {createCount} nuove.
                  Movimenti, registri e scaffali non vengono cancellati.
                </div>
                <div style={{ padding: 10, borderRadius: 8, background: "rgba(220,38,38,0.08)", border: "1px solid rgba(220,38,38,0.25)", fontSize: 13, fontWeight: 700, color: "#991b1b" }}>
                  {removableMissing.length} attrezzature assenti dal file verranno rimosse dall&apos;anagrafica.
                  {blockedMissing.length > 0
                    ? ` ${blockedMissing.length} restano perché in uscita aperta o in manutenzione.`
                    : ""}
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
                    <AppBusyLabel busy={importing}>
                      {importing
                        ? "Importazione…"
                        : `Sostituisci anagrafica (${updateCount} aggiorna, ${createCount} nuove, ${removableMissing.length} rimuovi)`}
                    </AppBusyLabel>
                  </button>
                  <button type="button" className="btn" onClick={() => setStep("mapping")}>
                    Modifica associazioni
                  </button>
                </div>
              </div>
            </div>
          )}

          {msg ? (
            <div style={{ padding: 10, background: "#fef2f2", borderRadius: 8, color: "#991b1b", fontWeight: 600 }}>
              {msg}
            </div>
          ) : null}
        </div>
    </AppModalFrame>
  );
}
