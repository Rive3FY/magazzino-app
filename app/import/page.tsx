"use client";

import * as XLSX from "xlsx";
import { useEffect, useState } from "react";
import { createClient } from "../_lib/supabase/client";
import { useIsAdmin } from "../_lib/hooks/useIsAdmin";
import { toNumberLoose } from "../_lib/utils";

type WarehouseKind = "PRM" | "REALE";

type LoadedCounts = { PRM: number; REALE: number } | null;

function cleanCell(v: any) {
  if (v === null || v === undefined) return "";
  if (typeof v === "number") return v;
  return String(v).trim();
}

function chunkArray<T>(arr: T[], size: number) {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

export default function ImportPage() {
  const supabase = createClient();

  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [loadedCounts, setLoadedCounts] = useState<LoadedCounts>(null);

  const { isAdmin, loading: checking } = useIsAdmin();

  async function loadCounts() {
    try {
      const { count: prm } = await supabase.from("excel_live").select("*", { count: "exact", head: true }).eq("warehouse", "PRM");
      const { count: reale } = await supabase.from("excel_live").select("*", { count: "exact", head: true }).eq("warehouse", "REALE");
      setLoadedCounts({ PRM: prm ?? 0, REALE: reale ?? 0 });
    } catch {
      setLoadedCounts({ PRM: 0, REALE: 0 });
    }
  }

  useEffect(() => {
    if (isAdmin) void loadCounts();
  }, [isAdmin]);

  async function importExcel(file: File, warehouseKind: WarehouseKind) {
    setMsg(null);
    setBusy(true);

    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });
      const sheet = wb.Sheets[wb.SheetNames[0]];

      const rows = XLSX.utils.sheet_to_json<Record<string, any>>(sheet, {
        defval: "",
      });

      // 1) Upsert anagrafica items (se ti serve)
      const itemsMap = new Map<string, any>();

      for (const r of rows) {
        const code = String(r["Materiale"] ?? "").trim();
        const name = String(r["Descrizione Materiale"] ?? "").trim();
        const um = String(r["Unità di Misura"] ?? "").trim();

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
        row_json: Record<string, any>;
      };

      const map = new Map<string, ExcelRowPayload>();

      for (const r of rows) {
        const code = String(r["Materiale"] ?? "").trim();
        const name = String(r["Descrizione Materiale"] ?? "").trim();

        if (!code || !name) continue;

        const key = `${code}_${warehouseKind}`;

        // Quantità: la colonna corretta è questa
        const qtyFree = toNumberLoose(r["Qnt. a Mag. libero"]);
        const qtyBlocked = toNumberLoose(r["Qnt. a Mag. bloccato"]);
        const qtyQuality = toNumberLoose(r["Controllo Qualità Magazzino"]);

        const excelJson: Record<string, any> = {};
        for (const k of Object.keys(r)) {
          excelJson[k] = cleanCell(r[k]);
        }

        // Normalizziamo sempre questi campi nel JSON
        excelJson["Materiale"] = code;
        excelJson["Descrizione Materiale"] = name;

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

      setMsg(`Import ${warehouseKind} completato ✅ (${payload.length} materiali)`);
      await loadCounts();
    } catch (e: any) {
      setMsg("Errore import: " + (e?.message ?? String(e)));
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
        <div style={{ fontWeight: 900 }}>Import Magazzino PRM</div>
        {loadedCounts && (
          <div style={{ fontSize: 13, opacity: 0.9, marginTop: 4 }}>
            Caricati: <b>{loadedCounts.PRM}</b> materiali
          </div>
        )}
        <input
          type="file"
          accept=".xlsx,.xls"
          disabled={busy}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) importExcel(f, "PRM");
          }}
          style={{ marginTop: 8 }}
        />
      </div>

      <div className="card" style={{ padding: 12, margin: 12 }}>
        <div style={{ fontWeight: 900 }}>Import Magazzino REALE</div>
        {loadedCounts && (
          <div style={{ fontSize: 13, opacity: 0.9, marginTop: 4 }}>
            Caricati: <b>{loadedCounts.REALE}</b> materiali
          </div>
        )}
        <input
          type="file"
          accept=".xlsx,.xls"
          disabled={busy}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) importExcel(f, "REALE");
          }}
          style={{ marginTop: 8 }}
        />
      </div>

      <div className="card" style={{ padding: 12, margin: 12 }}>
        <div style={{ fontWeight: 900 }}>Download Excel LIVE</div>
        <div style={{ fontSize: 13, opacity: 0.9, marginTop: 4 }}>
          Scarica il file Excel con tutte le giacenze aggiornate (PRM + REALE)
        </div>
        <button
          type="button"
          className="btn btnPrimary"
          style={{ marginTop: 10 }}
          onClick={() => { window.location.href = "/api/excel-live/download"; }}
          title="Scarica il file Excel LIVE (tutte le righe)"
        >
          Download Excel LIVE
        </button>
      </div>

      {busy && <div style={{ padding: 12 }}>Import in corso...</div>}

      {msg && (
        <div style={{ padding: 12, fontWeight: 800, whiteSpace: "pre-wrap" }}>
          {msg}
        </div>
      )}
    </main>
  );
}