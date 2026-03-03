"use client";

import * as XLSX from "xlsx";
import { useEffect, useState } from "react";
import { createClient } from "../_lib/supabase/client";

type WarehouseKind = "PRM" | "REALE";

function toNumber(v: unknown): number {
  const s = String(v ?? "").trim().replace(",", ".");
  const n = typeof v === "number" ? v : Number(s);
  return Number.isFinite(n) ? n : 0;
}

function cleanCell(v: any) {
  if (v === null || v === undefined) return "";
  if (typeof v === "number") return v;
  const s = String(v).trim();
  // se è un numero scritto come testo, lo lasciamo testo (Excel spesso ha codici ecc.)
  return s;
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

  async function importExcel(file: File, warehouseKind: WarehouseKind) {
    setMsg(null);
    setBusy(true);

    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });
      const sheet = wb.Sheets[wb.SheetNames[0]];

      // tutte le colonne così come sono, anche se 0
      const rows = XLSX.utils.sheet_to_json<Record<string, any>>(sheet, { defval: "" });

      // ===== 1) ITEMS (anagrafica minima) =====
      const itemsMap = new Map<string, any>();

      for (const r of rows) {
        const code = String(r["Materiale"] ?? "").trim();
        const name = String(r["Descrizione Materiale"] ?? "").trim();
        if (!code || !name) continue;

        // UM nel tuo file è "Unità di Misura"
        const um = String(r["Unità di Misura"] ?? "").trim() || null;

        itemsMap.set(code, {
          code,
          name,
          um,
        });
      }

      const items = Array.from(itemsMap.values());
      if (items.length === 0) {
        setMsg("Nessuna riga valida trovata. Controlla intestazioni del file.");
        return;
      }

      const { error: eItems } = await supabase.from("items").upsert(items, { onConflict: "code" });
      if (eItems) {
        setMsg("Import bloccato ❌ (items). Dettaglio: " + eItems.message);
        return;
      }

      // ===== 2) ITEM_STOCKS: una riga per (code, warehouseKind) con excel JSON completo =====
      type StockRow = {
        code: string;
        warehouse: WarehouseKind;
        qty_free: number;
        qty_blocked: number;
        qty_quality: number;
        initial_qty: number;
        excel: any; // jsonb
      };

      const stocksMap = new Map<string, StockRow>(); // key = code__warehouse

      for (const r of rows) {
        const code = String(r["Materiale"] ?? "").trim();
        const name = String(r["Descrizione Materiale"] ?? "").trim();
        if (!code || !name) continue;

        const key = `${code}__${warehouseKind}`;

        const qtyFree = toNumber(r["Qnt. a Mag. libero"]);
        const qtyBlocked = toNumber(r["Qnt. a Mag. bloccato"]);
        const qtyQuality = toNumber(r["Controllo Qualità Magazzino"]);
        const initial = qtyFree + qtyBlocked + qtyQuality;

        // excel json: TUTTE le colonne presenti nel file (31 colonne)
        const excelJson: Record<string, any> = {};
        for (const k of Object.keys(r)) excelJson[k] = cleanCell(r[k]);

        // assicuro coerenza minima
        excelJson["Materiale"] = code;
        excelJson["Descrizione Materiale"] = name;

        const add: StockRow = {
          code,
          warehouse: warehouseKind,
          qty_free: qtyFree,
          qty_blocked: qtyBlocked,
          qty_quality: qtyQuality,
          initial_qty: initial,
          excel: excelJson,
        };

        const prev = stocksMap.get(key);
        if (!prev) {
          stocksMap.set(key, add);
        } else {
          // se nel file hai righe duplicate dello stesso materiale, sommiamo le quantità
          // e teniamo l'ultima versione dei campi excel (ma con quantità sommate coerenti)
          const mergedExcel = { ...prev.excel, ...add.excel };

          // aggiorno anche dentro excel i campi quantità (somma)
          const sumFree = prev.qty_free + add.qty_free;
          const sumBlocked = prev.qty_blocked + add.qty_blocked;
          const sumQuality = prev.qty_quality + add.qty_quality;

          mergedExcel["Qnt. a Mag. libero"] = sumFree;
          mergedExcel["Qnt. a Mag. bloccato"] = sumBlocked;
          mergedExcel["Controllo Qualità Magazzino"] = sumQuality;

          stocksMap.set(key, {
            ...prev,
            qty_free: sumFree,
            qty_blocked: sumBlocked,
            qty_quality: sumQuality,
            initial_qty: sumFree + sumBlocked + sumQuality,
            excel: mergedExcel,
          });
        }
      }

      const stocks = Array.from(stocksMap.values());

      const { error: eStocks } = await supabase
        .from("item_stocks")
        .upsert(stocks, { onConflict: "code,warehouse" });

      if (eStocks) {
        setMsg("Import bloccato ❌ (item_stocks). Dettaglio: " + eStocks.message);
        return;
      }

      setMsg(`Import ${warehouseKind} completato ✅ (items: ${items.length}, stocks: ${stocks.length})`);
    } catch (e: any) {
      setMsg("Errore import: " + (e?.message ?? String(e)));
    } finally {
      setBusy(false);
    }
  }

  if (checking) {
    return (
      <main className="panel">
        <div className="pageBar">
          <div className="pageBarTitle">Import Excel</div>
        </div>
        <div style={{ padding: 12 }}>Controllo permessi…</div>
      </main>
    );
  }

  if (!isAdmin) {
    return (
      <main className="panel">
        <div className="pageBar">
          <div className="pageBarTitle">Import Excel</div>
        </div>

        <div style={{ padding: 12, color: "#991b1b", fontWeight: 900 }}>Accesso negato: solo Admin.</div>

        <div style={{ padding: 12 }}>Puoi comunque usare <b>Movimenti</b> e <b>Giacenze</b>.</div>

        <div style={{ padding: 12, display: "flex", gap: 10, flexWrap: "wrap" }}>
          <a className="btn" href="/giacenze">Vai a Giacenze</a>
          <a className="btn" href="/movimenti">Movimenti</a>
          <a className="btn" href="/">Home</a>
        </div>
      </main>
    );
  }

  return (
    <main className="panel">
      <div className="pageBar">
        <div className="pageBarTitle">Import Excel</div>
        <div className="pageBarActions">
          <a className="btn" href="/giacenze">Giacenze</a>
          <a className="btn" href="/movimenti">Movimenti</a>
        </div>
      </div>

      <div style={{ padding: 12, opacity: 0.9 }}>
        Carica i file Excel. L’anagrafica minima va su <b>items</b> e la riga completa (tutte le colonne) va su{" "}
        <b>item_stocks.excel</b> separata per PRM/REALE.
      </div>

      <div className="card" style={{ padding: 12, margin: "12px" }}>
        <div style={{ fontWeight: 900, marginBottom: 8 }}>📦 Import Magazzino PRM</div>

        <input
          type="file"
          accept=".xlsx,.xls"
          disabled={busy}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) importExcel(f, "PRM");
            e.currentTarget.value = "";
          }}
        />

        <div style={{ opacity: 0.8, fontSize: 12, marginTop: 8 }}>
          Aggiorna/crea giacenze con <b>warehouse = PRM</b>.
        </div>
      </div>

      <div className="card" style={{ padding: 12, margin: "12px" }}>
        <div style={{ fontWeight: 900, marginBottom: 8 }}>🏗️ Import Magazzino REALE</div>

        <input
          type="file"
          accept=".xlsx,.xls"
          disabled={busy}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) importExcel(f, "REALE");
            e.currentTarget.value = "";
          }}
        />

        <div style={{ opacity: 0.8, fontSize: 12, marginTop: 8 }}>
          Aggiorna/crea giacenze con <b>warehouse = REALE</b>.
        </div>
      </div>

      {busy && <div style={{ padding: 12 }}>Import in corso…</div>}
      {msg && <div style={{ padding: 12, fontWeight: 800 }}>{msg}</div>}

      <div style={{ padding: 12 }}>
        <a className="btn" href="/">Home</a>
      </div>
    </main>
  );
}