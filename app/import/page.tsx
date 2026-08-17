"use client";

import * as XLSX from "xlsx";
import { useCallback, useEffect, useState } from "react";
import { createClient } from "../_lib/supabase/client";
import { useIsAdmin } from "../_lib/hooks/useIsAdmin";
import { useToast } from "../_lib/ToastContext";
import { toNumberLoose } from "../_lib/utils";
import AppSpinner, { AppLoading } from "../_components/AppSpinner";

type WarehouseKind = "PRM" | "REALE";

type LoadedCounts = { PRM: number; REALE: number } | null;
type BackupFileRow = {
  id: string;
  created_at: string;
  warehouse: WarehouseKind;
  original_filename: string;
  content_type?: string | null;
  file_size?: number | null;
  row_count?: number | null;
  uploaded_by_email?: string | null;
};
type BackupFilesResponse = {
  error?: string;
  files?: BackupFileRow[];
  setupRequired?: boolean;
  message?: string;
};

const supabase = createClient();

function cleanCell(v: unknown) {
  if (v === null || v === undefined) return "";
  if (typeof v === "number") return v;
  return String(v).trim();
}

function chunkArray<T>(arr: T[], size: number) {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

function formatBytes(value: number | null | undefined) {
  const bytes = Number(value ?? 0);
  if (!Number.isFinite(bytes) || bytes <= 0) return "-";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function normalizeExcelHeader(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\u00a0/g, " ")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function getExcelCell(row: Record<string, unknown>, aliases: string[]) {
  for (const alias of aliases) {
    if (Object.prototype.hasOwnProperty.call(row, alias)) return row[alias];
  }

  const normalizedAliases = new Set(aliases.map(normalizeExcelHeader));
  for (const [key, value] of Object.entries(row)) {
    if (normalizedAliases.has(normalizeExcelHeader(key))) return value;
  }

  return "";
}

function getExcelNumber(row: Record<string, unknown>, aliases: string[]) {
  return toNumberLoose(getExcelCell(row, aliases));
}

const QTY_FREE_ALIASES = [
  "Qnt. a Mag. libero",
  "Qnt. a Mag. Libero",
  "Qnt a Mag libero",
  "Qta a Mag libero",
  "Quantità disponibile",
  "Quantita disponibile",
  "Qnt. disponibile",
  "Disponibile",
  "Libero",
];

const QTY_BLOCKED_ALIASES = ["Qnt. a Mag. bloccato", "Qnt a Mag bloccato", "Quantità bloccata", "Quantita bloccata", "Bloccato"];
const QTY_QUALITY_ALIASES = ["Controllo Qualità Magazzino", "Controllo Qualita Magazzino", "Qualità", "Qualita"];

export default function ImportPage() {
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [loadedCounts, setLoadedCounts] = useState<LoadedCounts>(null);
  const [backupFiles, setBackupFiles] = useState<BackupFileRow[]>([]);
  const [backupsLoading, setBackupsLoading] = useState(false);
  const [backupSetupMsg, setBackupSetupMsg] = useState<string | null>(null);
  const [deletingBackupId, setDeletingBackupId] = useState<string | null>(null);
  const [prmUnlocked, setPrmUnlocked] = useState(false);
  const [realeUnlocked, setRealeUnlocked] = useState(false);

  const { canManageMaterials: isAdmin, loading: checking } = useIsAdmin();
  const toast = useToast();

  const loadCounts = useCallback(async () => {
    try {
      const { count: prm } = await supabase.from("excel_live").select("*", { count: "exact", head: true }).eq("warehouse", "PRM");
      const { count: reale } = await supabase.from("excel_live").select("*", { count: "exact", head: true }).eq("warehouse", "REALE");
      setLoadedCounts({ PRM: prm ?? 0, REALE: reale ?? 0 });
    } catch {
      setLoadedCounts({ PRM: 0, REALE: 0 });
    }
  }, []);

  const loadBackupFiles = useCallback(async () => {
    setBackupsLoading(true);
    try {
      const response = await fetch("/api/import-backups", { cache: "no-store" });
      const payload = (await response.json()) as BackupFilesResponse;
      if (payload.setupRequired) {
        setBackupFiles([]);
        setBackupSetupMsg(payload.message || "Archivio backup non ancora attivato su Supabase.");
        return;
      }
      if (!response.ok) {
        throw new Error(payload.error || "Errore caricamento archivio backup");
      }
      setBackupSetupMsg(null);
      setBackupFiles(Array.isArray(payload.files) ? payload.files : []);
    } catch (error: unknown) {
      console.error("load backup files error:", error);
      setBackupFiles([]);
      setBackupSetupMsg("Impossibile leggere l'archivio backup.");
    } finally {
      setBackupsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isAdmin) {
      void loadCounts();
      void loadBackupFiles();
    }
  }, [isAdmin, loadCounts, loadBackupFiles]);

  async function backupImportedFile(file: File, warehouseKind: WarehouseKind, rowCount: number) {
    const formData = new FormData();
    formData.append("file", file);
    formData.append("warehouse", warehouseKind);
    formData.append("rowCount", String(rowCount));

    const response = await fetch("/api/import-backups", {
      method: "POST",
      body: formData,
    });

    const payload = (await response.json()) as { error?: string };
    if (!response.ok) {
      throw new Error(payload.error || "Errore salvataggio backup file");
    }

    await loadBackupFiles();
  }

  async function deleteBackupFile(row: BackupFileRow) {
    const ok = window.confirm(`Eliminare il backup "${row.original_filename}"?\n\nIl file verrà rimosso anche dall'archivio storage.`);
    if (!ok) return;

    setDeletingBackupId(row.id);
    try {
      const response = await fetch(`/api/import-backups?id=${encodeURIComponent(row.id)}`, {
        method: "DELETE",
      });
      const payload = (await response.json().catch(() => ({}))) as { error?: string; warning?: string };

      if (!response.ok) {
        throw new Error(payload.error || "Errore eliminazione backup");
      }

      setBackupFiles((prev) => prev.filter((item) => item.id !== row.id));
      toast.success(payload.warning || "Backup eliminato");
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Errore eliminazione backup";
      setMsg(message);
    } finally {
      setDeletingBackupId(null);
    }
  }

  async function importExcel(file: File, warehouseKind: WarehouseKind) {
    setMsg(null);
    setBusy(true);

    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });
      const sheet = wb.Sheets[wb.SheetNames[0]];

      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
        defval: "",
      });

      // 1) Upsert anagrafica items (se ti serve)
      const itemsMap = new Map<string, { code: string; name: string; um: string | null }>();

      for (const r of rows) {
        const code = String(r["Materiale"] ?? "").trim();
        const name = String(r["Descrizione Materiale"] ?? r["Descrizione"] ?? "").trim();
        const um = String(r["Unità di Misura"] ?? r["UM"] ?? "").trim();

        if (!code || !name) continue;

        itemsMap.set(code, {
          code,
          name,
          um: um || null,
        });
      }

      const items = Array.from(itemsMap.values());

      if (items.length > 0) {
        const { error: eItems } = await supabase
          .from("items")
          .upsert(items, { onConflict: "code" });

        if (eItems) {
          setMsg("Errore import items: " + eItems.message);
          return;
        }
      }

      /**
       * 2) Crea payload per excel_original & excel_live
       * Assunzione schema consigliata:
       * - excel_original: code (text), warehouse (text), qty_free, qty_blocked, qty_quality (numeric), row_json (jsonb)
       * - excel_live:     code (text), warehouse (text), qty_free, qty_blocked, qty_quality (numeric), row_json (jsonb)
       * con unique (code, warehouse)
       *
       * Se i nomi colonna differiscono, dimmelo e lo adeguo.
       */
      type ExcelRowPayload = {
        code: string;
        warehouse: WarehouseKind;
        qty_free: number;
        qty_blocked: number;
        qty_quality: number;
        row_json: Record<string, unknown>;
      };

      const map = new Map<string, ExcelRowPayload>();

      for (const r of rows) {
        const code = String(r["Materiale"] ?? "").trim();
        const name = String(r["Descrizione Materiale"] ?? r["Descrizione"] ?? "").trim();

        if (!code || !name) continue;

        const key = `${code}_${warehouseKind}`;

        // Quantità: lettura robusta delle intestazioni (maiuscole, spazi, accenti, varianti PRM/REALE).
        const qtyFree = getExcelNumber(r, QTY_FREE_ALIASES);
        const qtyBlocked = getExcelNumber(r, QTY_BLOCKED_ALIASES);
        const qtyQuality = getExcelNumber(r, QTY_QUALITY_ALIASES);

        const excelJson: Record<string, unknown> = {};
        for (const k of Object.keys(r)) {
          excelJson[k] = cleanCell(r[k]);
        }

        // Normalizziamo sempre questi campi nel JSON
        excelJson["Materiale"] = code;
        excelJson["Descrizione Materiale"] = name;
        excelJson["Magazzino"] = warehouseKind;
        excelJson["Qnt. a Mag. libero"] = qtyFree;
        excelJson["Qnt. a Mag. bloccato"] = qtyBlocked;
        excelJson["Controllo Qualità Magazzino"] = qtyQuality;

        map.set(key, {
          code,
          warehouse: warehouseKind,
          qty_free: qtyFree,
          qty_blocked: qtyBlocked,
          qty_quality: qtyQuality,
          row_json: excelJson,
        });
      }

      const payload = Array.from(map.values());

      if (payload.length === 0) {
        setMsg("Nessuna riga valida trovata nel file (controlla le intestazioni Excel).");
        return;
      }

      // 3) Upsert excel_original (backup immutabile: non toccato dai movimenti)
      // 4) Upsert excel_live (copia lavorabile: sarà aggiornata dai movimenti)
      //
      // Per evitare limiti su payload grandi, chunkiamo.
      const chunks = chunkArray(payload, 1000);

      for (const chunk of chunks) {
        const { error: eOrig } = await supabase
          .from("excel_original")
          .upsert(chunk, { onConflict: "code,warehouse" });

        if (eOrig) {
          // Se la tabella non esiste o schema diverso, lo diciamo chiaramente
          setMsg(
            "Errore import excel_original: " +
              eOrig.message +
              "\n\nVerifica che esista la tabella 'excel_original' con colonne: code, warehouse, qty_free, qty_blocked, qty_quality, row_json e unique (code, warehouse)."
          );
          return;
        }
      }

      for (const chunk of chunks) {
        const { error: eLive } = await supabase
          .from("excel_live")
          .upsert(chunk, { onConflict: "code,warehouse" });

        if (eLive) {
          setMsg(
            "Errore import excel_live: " +
              eLive.message +
              "\n\nVerifica che esista la tabella 'excel_live' con colonne: code, warehouse, qty_free, qty_blocked, qty_quality, row_json e unique (code, warehouse)."
          );
          return;
        }
      }

      let backupMsg = "\n\nBackup file salvato ✅";
      try {
        await backupImportedFile(file, warehouseKind, payload.length);
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : "errore sconosciuto";
        backupMsg = `\n\nImport completato ma backup file non salvato: ${message}`;
      }

      setMsg(`Import ${warehouseKind} completato ✅ (${payload.length} materiali)${backupMsg}`);
      toast.success(`Import ${warehouseKind} completato (${payload.length} materiali)`);
      await loadCounts();
    } catch (e: unknown) {
      setMsg("Errore import: " + (e instanceof Error ? e.message : String(e)));
    } finally {
      setBusy(false);
    }
  }

  if (checking) {
    return <div style={{ padding: 20 }}>Controllo permessi...</div>;
  }

  if (!isAdmin) {
    return <div style={{ padding: 20 }}>Accesso solo Admin</div>;
  }

  return (
    <main className="panel">
      <div className="pageBar">
        <div className="pageBarTitle">Import & Export Excel</div>
      </div>

      <div className="card" style={{ padding: 12, margin: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <button
            type="button"
            onClick={() => setPrmUnlocked((u) => !u)}
            title={prmUnlocked ? "Blocca: clicca per disabilitare il caricamento" : "Sblocca: clicca per abilitare il caricamento"}
            style={{
              flexShrink: 0,
              padding: 4,
              border: "none",
              background: "none",
              cursor: "pointer",
              borderRadius: 4,
            }}
          >
            {prmUnlocked ? (
              <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ verticalAlign: "middle", color: "#22c55e" }}>
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                <path d="M7 11V7a5 5 0 0 1 10 0" />
              </svg>
            ) : (
              <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ verticalAlign: "middle", color: "#64748b" }}>
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                <path d="M7 11V7a5 5 0 0 1 10 0v4" />
              </svg>
            )}
          </button>
          <div style={{ fontWeight: 900 }}>Import Magazzino PRM</div>
          {!prmUnlocked && <span style={{ fontSize: 12, color: "#94a3b8" }}>(clicca il lucchetto per sbloccare)</span>}
        </div>
        {loadedCounts && (
          <div style={{ fontSize: 13, opacity: 0.9, marginTop: 4 }}>
            Caricati: <b>{loadedCounts.PRM}</b> materiali
          </div>
        )}
        <input
          type="file"
          accept=".xlsx,.xls"
          disabled={busy || !prmUnlocked}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) importExcel(f, "PRM");
          }}
          style={{ marginTop: 8, opacity: prmUnlocked ? 1 : 0.6 }}
        />
      </div>

      <div className="card" style={{ padding: 12, margin: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <button
            type="button"
            onClick={() => setRealeUnlocked((u) => !u)}
            title={realeUnlocked ? "Blocca: clicca per disabilitare il caricamento" : "Sblocca: clicca per abilitare il caricamento"}
            style={{
              flexShrink: 0,
              padding: 4,
              border: "none",
              background: "none",
              cursor: "pointer",
              borderRadius: 4,
            }}
          >
            {realeUnlocked ? (
              <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ verticalAlign: "middle", color: "#22c55e" }}>
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                <path d="M7 11V7a5 5 0 0 1 10 0" />
              </svg>
            ) : (
              <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ verticalAlign: "middle", color: "#64748b" }}>
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                <path d="M7 11V7a5 5 0 0 1 10 0v4" />
              </svg>
            )}
          </button>
          <div style={{ fontWeight: 900 }}>Import Magazzino REALE</div>
          {!realeUnlocked && <span style={{ fontSize: 12, color: "#94a3b8" }}>(clicca il lucchetto per sbloccare)</span>}
        </div>
        {loadedCounts && (
          <div style={{ fontSize: 13, opacity: 0.9, marginTop: 4 }}>
            Caricati: <b>{loadedCounts.REALE}</b> materiali
          </div>
        )}
        <input
          type="file"
          accept=".xlsx,.xls"
          disabled={busy || !realeUnlocked}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) importExcel(f, "REALE");
          }}
          style={{ marginTop: 8, opacity: realeUnlocked ? 1 : 0.6 }}
        />
      </div>

      <div className="card" style={{ padding: 12, margin: 12 }}>
        <div style={{ fontWeight: 900 }}>Download Excel LIVE</div>
        <div style={{ fontSize: 13, opacity: 0.9, marginTop: 4 }}>
          Scarica il file Excel con tutto l'inventario aggiornato (PRM + REALE)
        </div>
        <button
          type="button"
          className="btn btnPrimary"
          style={{ marginTop: 10 }}
          onClick={() => {
            window.location.href = "/api/excel-live/download";
            toast.success("Download avviato");
          }}
          title="Scarica il file Excel LIVE (tutte le righe)"
        >
          Download Excel LIVE
        </button>
      </div>

      <div className="card" style={{ padding: 12, margin: 12 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
          <div>
            <div style={{ fontWeight: 900 }}>Archivio file importati</div>
            <div style={{ fontSize: 13, opacity: 0.9, marginTop: 4 }}>
              Conserva i file Excel originali caricati per PRM e REALE, pronti da riscaricare come backup.
            </div>
          </div>

          <button type="button" className="btn" onClick={() => void loadBackupFiles()} disabled={backupsLoading} style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
            {backupsLoading && <AppSpinner size={15} />}
            {backupsLoading ? "Aggiornamento..." : "Aggiorna archivio"}
          </button>
        </div>

        {backupsLoading ? (
          <div style={{ marginTop: 12 }}><AppLoading label="Caricamento archivio backup..." align="start" /></div>
        ) : backupSetupMsg ? (
          <div style={{ marginTop: 12, fontWeight: 700 }}>{backupSetupMsg}</div>
        ) : backupFiles.length === 0 ? (
          <div style={{ marginTop: 12, opacity: 0.75 }}>Nessun file importato archiviato al momento.</div>
        ) : (
          <div className="tableWrap" style={{ marginTop: 12 }}>
            <table className="table">
              <thead>
                <tr>
                  <th>Data</th>
                  <th>Magazzino</th>
                  <th>File</th>
                  <th>Righe</th>
                  <th>Dimensione</th>
                  <th>Caricato da</th>
                  <th>Azioni</th>
                </tr>
              </thead>
              <tbody>
                {backupFiles.map((row) => (
                  <tr key={row.id}>
                    <td>{row.created_at ? new Date(row.created_at).toLocaleString("it-IT") : "-"}</td>
                    <td>{row.warehouse}</td>
                    <td>{row.original_filename}</td>
                    <td>{row.row_count ?? "-"}</td>
                    <td>{formatBytes(row.file_size)}</td>
                    <td>{row.uploaded_by_email ?? "-"}</td>
                    <td>
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                        <button
                          type="button"
                          className="btn"
                          onClick={() => {
                            window.location.href = `/api/import-backups/download?id=${encodeURIComponent(row.id)}`;
                            toast.success("Download avviato");
                          }}
                        >
                          Scarica
                        </button>
                        <button
                          type="button"
                          className="btn"
                          disabled={deletingBackupId === row.id}
                          onClick={() => void deleteBackupFile(row)}
                          style={{
                            borderColor: "rgba(239,68,68,0.5)",
                            background: "rgba(239,68,68,0.1)",
                            color: "#991b1b",
                          }}
                        >
                          {deletingBackupId === row.id ? "Eliminazione..." : "Elimina"}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {busy && <div style={{ padding: 12 }}><AppLoading label="Import in corso..." align="start" /></div>}

      {msg && (
        <div style={{ padding: 12, fontWeight: 800, whiteSpace: "pre-wrap" }}>
          {msg}
        </div>
      )}
    </main>
  );
}