"use client";

import React, { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { createClient } from "../_lib/supabase/client";
import { useIsAdmin } from "../_lib/hooks/useIsAdmin";
import { scanFastBarcode, stopFastBarcodeScan, type FastBarcodeReader } from "../_lib/fastBarcodeScanner";
import { matchesMaterialSearch } from "../_lib/materialSearch";
import { AppLoading } from "../_components/AppSpinner";

function QrIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="3" width="6" height="6" rx="1" />
      <rect x="15" y="3" width="6" height="6" rx="1" />
      <rect x="3" y="15" width="6" height="6" rx="1" />
      <path d="M15 15h2v2h-2z" />
      <path d="M19 15h2v6h-6v-2" />
      <path d="M13 13h2" />
      <path d="M13 19h2" />
    </svg>
  );
}

type ItemRow = {
  code: string;
  name: string;
  um: string | null;
};

type ShelfRow = {
  code: string;
  warehouse: "PRM" | "REALE";
  shelf: string;
  place?: string | null;
  nfc_tag_id?: string | null;
  barcode?: string | null;
};

type ShelfEntry = { shelf: string; place: string; nfcTagId: string; barcode: string };
type LiveRow = { code: string; warehouse: "PRM" | "REALE"; row_json?: Record<string, unknown> | null };

function emptyShelfEntry(): ShelfEntry {
  return { shelf: "", place: "", nfcTagId: "", barcode: "" };
}

function hasAssignedPosition(entry: ShelfEntry | undefined) {
  return !!entry && (!!entry.shelf.trim() || !!entry.place.trim());
}

function getLiveItemName(row: LiveRow) {
  return String(row.row_json?.["Descrizione Materiale"] ?? row.code).trim() || row.code;
}

function getLiveItemUm(row: LiveRow) {
  const um = String(row.row_json?.["Unità di Misura"] ?? "").trim();
  return um || null;
}

export default function ScaffaliPage() {
  const supabase = createClient();
  const searchParams = useSearchParams();
  const { canManageMaterials: isAdmin, loading: adminLoading } = useIsAdmin();
  const assignmentFilter = searchParams.get("filter");
  const warehouseFilter = searchParams.get("warehouse") === "PRM" || searchParams.get("warehouse") === "REALE"
    ? searchParams.get("warehouse") as "PRM" | "REALE"
    : null;

  const [items, setItems] = useState<ItemRow[]>([]);
  const [shelves, setShelves] = useState<Record<string, { PRM: ShelfEntry; REALE: ShelfEntry }>>({});
  const [liveWarehouses, setLiveWarehouses] = useState<Record<string, { PRM: boolean; REALE: boolean }>>({});
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [saving, setSaving] = useState<string | null>(null);
  const [searchByQrOpen, setSearchByQrOpen] = useState(false);
  const [searchQrVal, setSearchQrVal] = useState("");
  const searchQrInputRef = useRef<HTMLInputElement>(null);
  const [editCell, setEditCell] = useState<{
    code: string;
    warehouse: "PRM" | "REALE";
    shelf: string;
    place: string;
  } | null>(null);
  const [materialPopup, setMaterialPopup] = useState<ItemRow | null>(null);
  const [popupForm, setPopupForm] = useState<{ PRM: { shelf: string; place: string }; REALE: { shelf: string; place: string } } | null>(null);
  const [isMobile, setIsMobile] = useState(false);
  const [cameraScanning, setCameraScanning] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const readerRef = useRef<FastBarcodeReader | null>(null);

  async function load() {
    setLoading(true);
    setMsg(null);
    try {
      const { data: itemsData, error: eItems } = await supabase.from("items").select("code,name,um").order("code");
      if (eItems) throw eItems;

      const { data: shelfData, error: eShelf } = await supabase.from("material_shelves").select("code,warehouse,shelf,place,nfc_tag_id,barcode");
      if (eShelf) throw eShelf;

      const { data: liveData, error: eLive } = await supabase
        .from("excel_live")
        .select("code,warehouse,row_json")
        .order("code");
      if (eLive) throw eLive;

      const shelfMap: Record<string, { PRM: ShelfEntry; REALE: ShelfEntry }> = {};
      for (const s of shelfData ?? []) {
        const row = s as ShelfRow;
        if (!shelfMap[row.code]) shelfMap[row.code] = { PRM: emptyShelfEntry(), REALE: emptyShelfEntry() };
        shelfMap[row.code][row.warehouse] = {
          shelf: row.shelf ?? "",
          place: (row.place ?? "").trim(),
          nfcTagId: (row.nfc_tag_id ?? "").trim(),
          barcode: (row.barcode ?? "").trim(),
        };
      }

      const itemMap = new Map((itemsData ?? []).map((item) => [item.code, item]));
      const liveItems = new Map<string, ItemRow>();
      const nextLiveWarehouses: Record<string, { PRM: boolean; REALE: boolean }> = {};
      for (const rowRaw of liveData ?? []) {
        const row = rowRaw as LiveRow;
        if (!row.code) continue;
        if (!nextLiveWarehouses[row.code]) nextLiveWarehouses[row.code] = { PRM: false, REALE: false };
        nextLiveWarehouses[row.code][row.warehouse] = true;
        if (liveItems.has(row.code)) continue;
        const item = itemMap.get(row.code);
        liveItems.set(row.code, {
          code: row.code,
          name: item?.name ?? getLiveItemName(row),
          um: item?.um ?? getLiveItemUm(row),
        });
      }
      for (const shelfRaw of shelfData ?? []) {
        const shelfRow = shelfRaw as ShelfRow;
        if (!shelfRow.code || liveItems.has(shelfRow.code)) continue;
        const item = itemMap.get(shelfRow.code);
        liveItems.set(shelfRow.code, {
          code: shelfRow.code,
          name: item?.name ?? shelfRow.code,
          um: item?.um ?? null,
        });
      }

      setItems(Array.from(liveItems.values()).sort((a, b) => a.code.localeCompare(b.code)));
      setShelves(shelfMap);
      setLiveWarehouses(nextLiveWarehouses);
    } catch (e: unknown) {
      setMsg("Errore caricamento: " + (e instanceof Error ? e.message : String(e)));
      setItems([]);
      setShelves({});
      setLiveWarehouses({});
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (isAdmin) void load();
  }, [isAdmin]);

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  useEffect(() => {
    return () => {
      stopFastBarcodeScan(videoRef.current, readerRef.current);
    };
  }, []);

  async function saveShelf(code: string, warehouse: "PRM" | "REALE", shelf: string, place: string) {
    setSaving(code + warehouse);
    setMsg(null);
    try {
      const shelfVal = shelf.trim();
      const placeVal = place.trim();
      const entry = shelves[code]?.[warehouse];
      if (shelfVal || entry?.barcode) {
        const payload: Record<string, unknown> = {
          code,
          warehouse,
          shelf: shelfVal || "—",
          place: placeVal || null,
          // preserva eventuali valori già presenti in DB senza esporli in UI
          nfc_tag_id: entry?.nfcTagId || null,
          barcode: entry?.barcode || null,
        };
        const { error } = await supabase.from("material_shelves").upsert(payload, { onConflict: "code,warehouse" });
        if (error) throw error;
      } else {
        const { error } = await supabase.from("material_shelves").delete().eq("code", code).eq("warehouse", warehouse);
        if (error) throw error;
      }
      await load();
      setEditCell(null);
    } catch (e: unknown) {
      setMsg("Errore salvataggio: " + (e instanceof Error ? e.message : String(e)));
    } finally {
      setSaving(null);
    }
  }

  async function searchByQr(value: string) {
    const qrVal = value.trim();
    if (!qrVal) return;
    setQ(qrVal);
    setSearchQrVal("");
    setSearchByQrOpen(false);
  }

  function stopCameraScan() {
    stopFastBarcodeScan(videoRef.current, readerRef.current);
    readerRef.current = null;
    setCameraScanning(false);
  }

  async function startCameraScanForSearch() {
    setMsg(null);
    if (!navigator.mediaDevices?.getUserMedia) {
      setMsg("La fotocamera richiede HTTPS. Usa npm run dev:https e accedi da https://TUO_IP:3000");
      return;
    }
    stopCameraScan();
    setCameraScanning(true);
    await new Promise((r) => setTimeout(r, 100));
    let videoEl = videoRef.current;
    for (let i = 0; i < 30 && !videoEl; i++) {
      await new Promise((r) => setTimeout(r, 50));
      videoEl = videoRef.current;
    }
    if (!videoEl) {
      setCameraScanning(false);
      setMsg("Video non disponibile. Riprova.");
      return;
    }
    try {
      const text = await scanFastBarcode(videoEl, {
        onReader: (reader) => {
          readerRef.current = reader;
        },
      });
      stopCameraScan();
      if (text) void searchByQr(text);
    } catch (e: unknown) {
      setMsg("Errore camera: " + (e instanceof Error ? e.message : "sconosciuto"));
      stopCameraScan();
    }
  }

  function getShelfDisplay(entry: ShelfEntry | undefined): string {
    if (!entry) return "—";
    const parts = [entry.shelf.trim(), entry.place.trim()].filter(Boolean);
    return parts.length ? parts.join(" · ") : "—";
  }

  function openMaterialPopup(it: ItemRow) {
    setMaterialPopup(it);
    const prm = shelves[it.code]?.PRM ?? emptyShelfEntry();
    const reale = shelves[it.code]?.REALE ?? emptyShelfEntry();
    setPopupForm({
      PRM: { shelf: prm.shelf, place: prm.place },
      REALE: { shelf: reale.shelf, place: reale.place },
    });
  }

  async function savePopupForm() {
    if (!materialPopup || !popupForm) return;
    setSaving(materialPopup.code);
    setMsg(null);
    try {
      const prm = shelves[materialPopup.code]?.PRM;
      const reale = shelves[materialPopup.code]?.REALE;
      for (const wh of ["PRM", "REALE"] as const) {
        const form = popupForm[wh];
        const shelfVal = form.shelf.trim();
        const placeVal = form.place.trim();
        const entry = wh === "PRM" ? prm : reale;
        if (shelfVal || entry?.barcode) {
          const payload: Record<string, unknown> = {
            code: materialPopup.code,
            warehouse: wh,
            shelf: shelfVal || "—",
            place: placeVal || null,
            nfc_tag_id: entry?.nfcTagId || null,
            barcode: entry?.barcode || null,
          };
          const { error } = await supabase.from("material_shelves").upsert(payload, { onConflict: "code,warehouse" });
          if (error) throw error;
        } else {
          const { error } = await supabase.from("material_shelves").delete().eq("code", materialPopup.code).eq("warehouse", wh);
          if (error) throw error;
        }
      }
      await load();
      setMaterialPopup(null);
      setPopupForm(null);
    } catch (e: unknown) {
      setMsg(e instanceof Error ? e.message : "Errore salvataggio");
    } finally {
      setSaving(null);
    }
  }

  const filtered = items.filter((it) => {
    const s = shelves[it.code];
    const prm = s?.PRM ?? emptyShelfEntry();
    const reale = s?.REALE ?? emptyShelfEntry();
    const live = liveWarehouses[it.code] ?? { PRM: false, REALE: false };
    const targetWarehouses: Array<"PRM" | "REALE"> = warehouseFilter ? [warehouseFilter] : ["PRM", "REALE"];
    const assignmentMatch =
      assignmentFilter === "missing"
        ? targetWarehouses.some((warehouse) => live[warehouse] && !hasAssignedPosition(s?.[warehouse]))
        : assignmentFilter === "assigned"
          ? targetWarehouses.some((warehouse) => live[warehouse] && hasAssignedPosition(s?.[warehouse]))
          : assignmentFilter === "orphan"
            ? targetWarehouses.some((warehouse) => !live[warehouse] && hasAssignedPosition(s?.[warehouse]))
            : true;
    const match = matchesMaterialSearch(q, it.code, it.name);
    const shelfMatch =
      !q.trim() ||
      prm.shelf.toLowerCase().includes(q.toLowerCase()) ||
      prm.place.toLowerCase().includes(q.toLowerCase()) ||
      reale.shelf.toLowerCase().includes(q.toLowerCase()) ||
      reale.place.toLowerCase().includes(q.toLowerCase());
    const qrMatch =
      !q.trim() ||
      prm.barcode.toLowerCase().includes(q.toLowerCase()) ||
      reale.barcode.toLowerCase().includes(q.toLowerCase());
    return assignmentMatch && (match || shelfMatch || qrMatch);
  });

  if (adminLoading) {
    return <div style={{ padding: 20 }}>Controllo permessi...</div>;
  }

  if (!isAdmin) {
    return <div style={{ padding: 20 }}>Accesso solo Admin</div>;
  }

  return (
    <main className="panel">
      <div className="pageBar">
        <div className="pageBarTitle">Posizioni</div>
      </div>

      <div className="card" style={{ padding: 12, margin: 12 }}>
        <div style={{ marginBottom: 12, display: "flex", flexWrap: "wrap", gap: 10, alignItems: "flex-end" }}>
          <div>
            <label className="label" htmlFor="qScaffali">
              Cerca materiale (codice, descrizione, posizione, QR)
            </label>
            <input
              id="qScaffali"
              type="text"
              className="input"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Filtra..."
              style={{ maxWidth: 320 }}
            />
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button
              type="button"
              className="btn btnPrimary"
              onClick={() => {
                setSearchQrVal("");
                setSearchByQrOpen(true);
                setTimeout(() => searchQrInputRef.current?.focus(), 50);
              }}
              style={{ display: "flex", alignItems: "center", gap: 6 }}
            >
              <QrIcon />
              Cerca con QR
            </button>
          </div>
        </div>

        <div style={{ fontSize: 13, color: "#64748b", marginBottom: 12 }}>
          Assegna posizione e luogo per ogni materiale e magazzino. Usa la ricerca testo o scansiona il QR per trovare rapidamente un materiale.
        </div>
        {(assignmentFilter === "missing" || assignmentFilter === "assigned" || assignmentFilter === "orphan") && (
          <div
            style={{
              marginBottom: 12,
              padding: 12,
              borderRadius: 10,
              border: "1px solid #93c5fd",
              background: "#eff6ff",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              gap: 10,
              flexWrap: "wrap",
            }}
          >
            <div>
              <div style={{ fontWeight: 900, color: "#1d4ed8" }}>
                {assignmentFilter === "missing"
                  ? "Posizioni senza assegnazione"
                  : assignmentFilter === "orphan"
                    ? "Posizioni senza riga Excel"
                    : "Posizioni assegnate"}
                {warehouseFilter ? ` · ${warehouseFilter}` : " · Tutti i magazzini"}
              </div>
              <div style={{ marginTop: 3, fontSize: 12, color: "#475569" }}>
                {filtered.length} materiali corrispondenti
              </div>
            </div>
            <a className="btn" href="/scaffali">Rimuovi filtro</a>
          </div>
        )}
        {isMobile && (
          <div style={{ fontSize: 12, padding: 10, background: "#e0f2fe", borderRadius: 8, marginBottom: 12, border: "1px solid #0ea5e9" }}>
            Clicca su un materiale per aprire il popup e inserire posizione e luogo.
          </div>
        )}

        {msg && (
          <div
            style={{
              position: "fixed",
              inset: 0,
              background: "rgba(15,23,42,0.5)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              zIndex: 10050,
              padding: 20,
            }}
          >
            <div
              style={{
                background: "white",
                borderRadius: 14,
                padding: 24,
                maxWidth: 360,
                width: "100%",
                boxShadow: "0 24px 60px rgba(0,0,0,0.3)",
              }}
            >
              <div
                style={{
                  fontWeight: 800,
                  fontSize: 16,
                  color: msg.includes("✅") ? "#16a34a" : "#dc2626",
                  marginBottom: 20,
                  textAlign: "center",
                }}
              >
                {msg}
              </div>
              <button
                type="button"
                className="btn btnPrimary"
                onClick={() => setMsg(null)}
                style={{ width: "100%" }}
              >
                OK
              </button>
            </div>
          </div>
        )}

        {searchByQrOpen && (
          <div
            style={{
              position: "fixed",
              inset: 0,
              background: "rgba(15,23,42,0.5)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              zIndex: 10050,
              padding: 20,
            }}
          >
            <div
              style={{
                background: "white",
                borderRadius: 14,
                padding: 24,
                maxWidth: 400,
                boxShadow: "0 24px 60px rgba(0,0,0,0.3)",
              }}
            >
              <div style={{ fontWeight: 900, fontSize: 16, marginBottom: 8, display: "flex", alignItems: "center", gap: 8 }}>
                <QrIcon />
                Cerca materiale per QR
              </div>
              <div style={{ fontSize: 14, color: "#64748b", marginBottom: 12 }}>
                Scansiona o digita il valore QR per trovare il materiale associato.
              </div>
              <div style={{ marginBottom: 16, display: cameraScanning ? "block" : "none" }}>
                <div style={{ padding: 12, background: "#0f172a", borderRadius: 12, marginBottom: 8 }}>
                  <video ref={videoRef} style={{ width: "100%", maxWidth: 360, borderRadius: 8 }} muted playsInline />
                  <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 8 }}>Inquadra il QR code</div>
                </div>
                <button type="button" className="btn" onClick={stopCameraScan} style={{ width: "100%" }}>
                  Chiudi camera
                </button>
              </div>
              {!cameraScanning && (
                <>
                  <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
                    <button
                      type="button"
                      className="btn btnPrimary"
                      onClick={() => void startCameraScanForSearch()}
                      style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}
                    >
                      <QrIcon />
                      Scansiona con fotocamera
                    </button>
                  </div>
                  <input
                    ref={searchQrInputRef}
                    type="text"
                    className="input"
                    value={searchQrVal}
                    onChange={(e) => setSearchQrVal(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") void searchByQr(searchQrVal);
                      if (e.key === "Escape") {
                        stopCameraScan();
                        setSearchByQrOpen(false);
                      }
                    }}
                    placeholder="Oppure digita il codice QR..."
                    style={{ width: "100%", marginBottom: 16 }}
                    autoFocus
                  />
                </>
              )}
              <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
                <button
                  type="button"
                  className="btn"
                  onClick={() => {
                    stopCameraScan();
                    setSearchByQrOpen(false);
                  }}
                >
                  Annulla
                </button>
                <button
                  type="button"
                  className="btn btnPrimary"
                  onClick={() => void searchByQr(searchQrVal)}
                  disabled={cameraScanning || !searchQrVal.trim()}
                >
                  Cerca
                </button>
              </div>
            </div>
          </div>
        )}

        {materialPopup && popupForm && (
          <div
            onMouseDown={() => {
              setMaterialPopup(null);
              setPopupForm(null);
            }}
            style={{
              position: "fixed",
              inset: 0,
              background: "rgba(15,23,42,0.5)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              zIndex: 10050,
              padding: 16,
            }}
          >
            <div
              onMouseDown={(e) => e.stopPropagation()}
              style={{
                background: "white",
                borderRadius: 14,
                padding: 20,
                maxWidth: 420,
                width: "100%",
                maxHeight: "90vh",
                overflow: "auto",
                boxShadow: "0 24px 60px rgba(0,0,0,0.3)",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
                <div>
                  <div style={{ fontWeight: 900, fontSize: 18 }}>{materialPopup.code}</div>
                  <div style={{ fontSize: 14, color: "#64748b" }}>{materialPopup.name ?? "-"}</div>
                </div>
                <button
                  type="button"
                  className="btn"
                  onClick={() => {
                    setMaterialPopup(null);
                    setPopupForm(null);
                  }}
                >
                  Chiudi
                </button>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
                <div style={{ padding: 12, background: "rgba(2,132,199,0.08)", borderRadius: 10, border: "1px solid rgba(2,132,199,0.25)" }}>
                  <div style={{ fontWeight: 800, marginBottom: 10 }}>PRM</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    <div>
                      <label className="label" style={{ fontSize: 12 }}>Posizione</label>
                      <input
                        type="text"
                        className="input"
                        value={popupForm.PRM.shelf}
                        onChange={(e) => setPopupForm((p) => (p ? { ...p, PRM: { ...p.PRM, shelf: e.target.value } } : null))}
                        placeholder="Es. A1"
                        style={{ width: "100%" }}
                      />
                    </div>
                    <div>
                      <label className="label" style={{ fontSize: 12 }}>Luogo</label>
                      <input
                        type="text"
                        className="input"
                        value={popupForm.PRM.place}
                        onChange={(e) => setPopupForm((p) => (p ? { ...p, PRM: { ...p.PRM, place: e.target.value } } : null))}
                        placeholder="Es. Zona A"
                        style={{ width: "100%" }}
                      />
                    </div>
                  </div>
                </div>

                <div style={{ padding: 12, background: "rgba(124,58,237,0.08)", borderRadius: 10, border: "1px solid rgba(124,58,237,0.25)" }}>
                  <div style={{ fontWeight: 800, marginBottom: 10 }}>REALE</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    <div>
                      <label className="label" style={{ fontSize: 12 }}>Posizione</label>
                      <input
                        type="text"
                        className="input"
                        value={popupForm.REALE.shelf}
                        onChange={(e) => setPopupForm((p) => (p ? { ...p, REALE: { ...p.REALE, shelf: e.target.value } } : null))}
                        placeholder="Es. B2"
                        style={{ width: "100%" }}
                      />
                    </div>
                    <div>
                      <label className="label" style={{ fontSize: 12 }}>Luogo</label>
                      <input
                        type="text"
                        className="input"
                        value={popupForm.REALE.place}
                        onChange={(e) => setPopupForm((p) => (p ? { ...p, REALE: { ...p.REALE, place: e.target.value } } : null))}
                        placeholder="Es. Zona B"
                        style={{ width: "100%" }}
                      />
                    </div>
                  </div>
                </div>
              </div>

              <button type="button" className="btn btnPrimary" style={{ marginTop: 16, width: "100%" }} onClick={() => void savePopupForm()} disabled={!!saving}>
                {saving ? "Salvataggio…" : "Salva"}
              </button>
            </div>
          </div>
        )}

        {loading ? (
          <div style={{ padding: 24 }}><AppLoading /></div>
        ) : (
          <div className="tableWrap" style={{ marginTop: 8 }}>
            <table className="table">
              <thead>
                <tr>
                  <th>Codice</th>
                  <th>Descrizione</th>
                  <th>UM</th>
                  <th>Posizione · Luogo PRM</th>
                  <th>Posizione · Luogo REALE</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={5} style={{ padding: 24, color: "#64748b" }}>
                      Nessun materiale trovato.
                    </td>
                  </tr>
                ) : (
                  filtered.map((it) => (
                    <tr
                      key={it.code}
                      onClick={() => isMobile && openMaterialPopup(it)}
                      style={isMobile ? { cursor: "pointer" } : undefined}
                    >
                      <td style={{ fontWeight: 900 }}>{it.code}</td>
                      <td>{it.name ?? "-"}</td>
                      <td>{it.um ?? "-"}</td>
                      <td
                        onClick={(e) => {
                          if (isMobile) return;
                          e.stopPropagation();
                        }}
                      >
                        {isMobile ? (
                          <span style={{ fontSize: 13 }}>{getShelfDisplay(shelves[it.code]?.PRM)}</span>
                        ) : editCell?.code === it.code && editCell?.warehouse === "PRM" ? (
                          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
                            <input
                              type="text"
                              className="input"
                              placeholder="Posizione"
                              value={editCell.shelf}
                              onChange={(e) => setEditCell((p) => (p ? { ...p, shelf: e.target.value } : null))}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") void saveShelf(it.code, "PRM", editCell.shelf, editCell.place);
                                if (e.key === "Escape") setEditCell(null);
                              }}
                              autoFocus
                              style={{ width: 90 }}
                            />
                            <input
                              type="text"
                              className="input"
                              placeholder="Luogo"
                              value={editCell.place}
                              onChange={(e) => setEditCell((p) => (p ? { ...p, place: e.target.value } : null))}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") void saveShelf(it.code, "PRM", editCell.shelf, editCell.place);
                                if (e.key === "Escape") setEditCell(null);
                              }}
                              style={{ width: 90 }}
                            />
                            <button
                              type="button"
                              className="btn btnPrimary"
                              onClick={() => void saveShelf(it.code, "PRM", editCell.shelf, editCell.place)}
                              disabled={!!saving}
                            >
                              Salva
                            </button>
                            <button type="button" className="btn" onClick={() => setEditCell(null)}>
                              Annulla
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            className="btn"
                            onClick={() => {
                              const e = shelves[it.code]?.PRM ?? emptyShelfEntry();
                              setEditCell({ code: it.code, warehouse: "PRM", shelf: e.shelf, place: e.place });
                            }}
                            style={{
                              minWidth: 80,
                              background: shelves[it.code]?.PRM?.shelf || shelves[it.code]?.PRM?.place ? "#f0fdf4" : "#f8fafc",
                              borderColor: "#e2e8f0",
                            }}
                          >
                            {getShelfDisplay(shelves[it.code]?.PRM)}
                          </button>
                        )}
                      </td>
                      <td
                        onClick={(e) => {
                          if (isMobile) return;
                          e.stopPropagation();
                        }}
                      >
                        {isMobile ? (
                          <span style={{ fontSize: 13 }}>{getShelfDisplay(shelves[it.code]?.REALE)}</span>
                        ) : editCell?.code === it.code && editCell?.warehouse === "REALE" ? (
                          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
                            <input
                              type="text"
                              className="input"
                              placeholder="Posizione"
                              value={editCell.shelf}
                              onChange={(e) => setEditCell((p) => (p ? { ...p, shelf: e.target.value } : null))}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") void saveShelf(it.code, "REALE", editCell.shelf, editCell.place);
                                if (e.key === "Escape") setEditCell(null);
                              }}
                              autoFocus
                              style={{ width: 90 }}
                            />
                            <input
                              type="text"
                              className="input"
                              placeholder="Luogo"
                              value={editCell.place}
                              onChange={(e) => setEditCell((p) => (p ? { ...p, place: e.target.value } : null))}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") void saveShelf(it.code, "REALE", editCell.shelf, editCell.place);
                                if (e.key === "Escape") setEditCell(null);
                              }}
                              style={{ width: 90 }}
                            />
                            <button
                              type="button"
                              className="btn btnPrimary"
                              onClick={() => void saveShelf(it.code, "REALE", editCell.shelf, editCell.place)}
                              disabled={!!saving}
                            >
                              Salva
                            </button>
                            <button type="button" className="btn" onClick={() => setEditCell(null)}>
                              Annulla
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            className="btn"
                            onClick={() => {
                              const e = shelves[it.code]?.REALE ?? emptyShelfEntry();
                              setEditCell({ code: it.code, warehouse: "REALE", shelf: e.shelf, place: e.place });
                            }}
                            style={{
                              minWidth: 80,
                              background: shelves[it.code]?.REALE?.shelf || shelves[it.code]?.REALE?.place ? "#f0fdf4" : "#f8fafc",
                              borderColor: "#e2e8f0",
                            }}
                          >
                            {getShelfDisplay(shelves[it.code]?.REALE)}
                          </button>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </main>
  );
}
