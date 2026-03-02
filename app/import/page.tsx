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

  "Descrizione Gruppo Merci"?: any;

  "Qnt. a Mag. Libero"?: any;
  "Qnt. a Mag. bloccato"?: any;
  "Controllo Qualità Magazzino"?: any;

  UM?: any;
  TOTALE?: any;
  "Qnt. Reale"?: any;
};

function toNumber(v: unknown): number {
  const s = String(v ?? "").trim().replace(",", ".");
  const n = typeof v === "number" ? v : Number(s);
  return Number.isFinite(n) ? n : 0;
}

type WarehouseKind = "PRM" | "REALE";

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
      const rows = XLSX.utils.sheet_to_json<Row>(sheet, { defval: "" });

      // =========================
      // 1) ITEMS: dedupe per code
      // =========================
      const itemsMap = new Map<string, any>();

      for (const r of rows) {
        const code = String(r["Materiale"] ?? "").trim();
        const name = String(r["Descrizione Materiale"] ?? "").trim();
        if (!code || !name) continue;

        // teniamo l'ultima riga come "anagrafica" (più sicuro)
        itemsMap.set(code, {
          code,
          name,
          um: String(r["UM"] ?? "").trim() || null,

          division: String(r["Divisione"] ?? "").trim() || null,
          division_desc: String(r["Descrizione Divisione"] ?? "").trim() || null,

          // Non serve per distinguere PRM/REALE, ma lo puoi conservare
          warehouse: String(r["Magazzino"] ?? "").trim() || null,
          warehouse_desc: String(r["Descrizione Magazzino"] ?? "").trim() || null,

          group_desc: String(r["Descrizione Gruppo Merci"] ?? "").trim() || null,
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

      // ===========================================
      // 2) STOCKS: dedupe per (code, warehouseKind)
      //    sommando le quantità
      // ===========================================
      type StockRow = {
        code: string;
        warehouse: WarehouseKind;
        qty_free: number;
        qty_blocked: number;
        qty_quality: number;
        initial_qty: number;
      };

      const stocksMap = new Map<string, StockRow>();
      // chiave = `${code}__${warehouseKind}`
      for (const r of rows) {
        const code = String(r["Materiale"] ?? "").trim();
        const name = String(r["Descrizione Materiale"] ?? "").trim();
        if (!code || !name) continue;

        const key = `${code}__${warehouseKind}`;

        const add: StockRow = {
          code,
          warehouse: warehouseKind,
          qty_free: toNumber(r["Qnt. a Mag. Libero"]),
          qty_blocked: toNumber(r["Qnt. a Mag. bloccato"]),
          qty_quality: toNumber(r["Controllo Qualità Magazzino"]),
          initial_qty: toNumber(r["TOTALE"]),
        };

        const prev = stocksMap.get(key);
        if (!prev) {
          stocksMap.set(key, add);
        } else {
          // somma (se nel file ci sono righe duplicate dello stesso materiale)
          stocksMap.set(key, {
            ...prev,
            qty_free: prev.qty_free + add.qty_free,
            qty_blocked: prev.qty_blocked + add.qty_blocked,
            qty_quality: prev.qty_quality + add.qty_quality,
            initial_qty: prev.initial_qty + add.initial_qty,
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

        <div style={{ padding: 12, color: "#991b1b", fontWeight: 900 }}>
          Accesso negato: solo Admin.
        </div>

        <div style={{ padding: 12 }}>
          Puoi comunque usare <b>Movimenti</b> e <b>Giacenze</b>.
        </div>

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
        Carica i file Excel. L’anagrafica va su <b>items</b> e le giacenze su <b>item_stocks</b> separate per magazzino.
        <br />
        <b>Solo admin</b> può importare/aggiornare questi dati.
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