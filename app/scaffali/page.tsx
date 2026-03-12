"use client";

import React, { useEffect, useRef, useState } from "react";
import { createClient } from "../_lib/supabase/client";
import { useIsAdmin } from "../_lib/hooks/useIsAdmin";
import { BrowserMultiFormatReader } from "@zxing/browser";

function BarcodeIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <rect x="2" y="6" width="2" height="12" />
      <rect x="6" y="6" width="1" height="12" />
      <rect x="9" y="6" width="2" height="12" />
      <rect x="13" y="6" width="1" height="12" />
      <rect x="16" y="6" width="2" height="12" />
      <rect x="20" y="6" width="2" height="12" />
    </svg>
  );
}

function NfcIcon({ size = 24 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="5" y="2" width="14" height="20" rx="2" />
      <path d="M9 7h6" />
      <path d="M9 11h6" />
      <path d="M9 15h4" />
      <path d="M12 6v12" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M20 6L9 17l-5-5" />
    </svg>
  );
}

function ErrorIcon() {
  return (
    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#dc2626" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="10" />
      <path d="M15 9l-6 6" />
      <path d="M9 9l6 6" />
    </svg>
  );
}

function SpinnerIcon() {
  return (
    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ animation: "spin 1s linear infinite", transformOrigin: "center" }}>
      <path d="M21 12a9 9 0 1 1-6.219-8.56" />
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

export default function ScaffaliPage() {
  const supabase = createClient();
  const { canManageMaterials: isAdmin, loading: adminLoading } = useIsAdmin();

  const [items, setItems] = useState<ItemRow[]>([]);
  const [shelves, setShelves] = useState<Record<string, { PRM: ShelfEntry; REALE: ShelfEntry }>>({});
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [saving, setSaving] = useState<string | null>(null);
  const [nfcAssociating, setNfcAssociating] = useState<{ code: string; warehouse: "PRM" | "REALE" } | null>(null);
  const [nfcStatus, setNfcStatus] = useState<"searching" | "found" | "success" | "error">("searching");
  const [nfcStatusMsg, setNfcStatusMsg] = useState<string>("");
  const [nfcConfirm, setNfcConfirm] = useState<{
    code: string;
    name: string;
    warehouse: "PRM" | "REALE";
    currentShelf: string;
    currentPlace: string;
    otherWarehouse?: { wh: "PRM" | "REALE"; shelf: string; place: string };
  } | null>(null);
  const [nfcTagReassign, setNfcTagReassign] = useState<{
    serialNumber: string;
    code: string;
    warehouse: "PRM" | "REALE";
    existingCode: string;
    existingWarehouse: string;
  } | null>(null);
  const [searchByBarcodeOpen, setSearchByBarcodeOpen] = useState(false);
  const [searchBarcodeVal, setSearchBarcodeVal] = useState("");
  const [searchByNfcScanning, setSearchByNfcScanning] = useState(false);
  const searchBarcodeInputRef = useRef<HTMLInputElement>(null);
  const [editCell, setEditCell] = useState<{
    code: string;
    warehouse: "PRM" | "REALE";
    shelf: string;
    place: string;
  } | null>(null);
  const [materialPopup, setMaterialPopup] = useState<ItemRow | null>(null);
  const [popupForm, setPopupForm] = useState<{ PRM: { shelf: string; place: string }; REALE: { shelf: string; place: string } } | null>(null);
  const [isMobile, setIsMobile] = useState(false);
  const [isNfcSupported, setIsNfcSupported] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [cameraScanning, setCameraScanning] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const readerRef = useRef<BrowserMultiFormatReader | null>(null);

  async function load() {
    setLoading(true);
    setMsg(null);
    try {
      const { data: itemsData, error: eItems } = await supabase.from("items").select("code,name,um").order("code");
      if (eItems) throw eItems;

      const { data: shelfData, error: eShelf } = await supabase.from("material_shelves").select("code,warehouse,shelf,place,nfc_tag_id,barcode");
      if (eShelf) throw eShelf;

      const shelfMap: Record<string, { PRM: ShelfEntry; REALE: ShelfEntry }> = {};
      for (const s of shelfData ?? []) {
        const row = s as ShelfRow;
        if (!shelfMap[row.code]) shelfMap[row.code] = { PRM: { shelf: "", place: "", nfcTagId: "", barcode: "" }, REALE: { shelf: "", place: "", nfcTagId: "", barcode: "" } };
        shelfMap[row.code][row.warehouse] = {
          shelf: row.shelf ?? "",
          place: (row.place ?? "").trim(),
          nfcTagId: (row.nfc_tag_id ?? "").trim(),
          barcode: (row.barcode ?? "").trim(),
        };
      }

      setItems(itemsData ?? []);
      setShelves(shelfMap);
    } catch (e: any) {
      setMsg("Errore caricamento: " + (e?.message ?? String(e)));
      setItems([]);
      setShelves({});
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
    setIsNfcSupported(typeof (window as any).NDEFReader !== "undefined");
    const ua = navigator.userAgent;
    setIsIOS(/iPad|iPhone|iPod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1));
  }, []);

  async function saveShelf(code: string, warehouse: "PRM" | "REALE", shelf: string, place: string, preserveNfcBarcode = true) {
    setSaving(code + warehouse);
    setMsg(null);
    try {
      const shelfVal = shelf.trim();
      const placeVal = place.trim();
      const entry = shelves[code]?.[warehouse];
      if (shelfVal || (preserveNfcBarcode && (entry?.nfcTagId || entry?.barcode))) {
        const payload: Record<string, unknown> = {
          code,
          warehouse,
          shelf: shelfVal || "—",
          place: placeVal || null,
          nfc_tag_id: preserveNfcBarcode && entry?.nfcTagId ? entry.nfcTagId : null,
          barcode: preserveNfcBarcode && entry?.barcode ? entry.barcode : null,
        };
        const { error } = await supabase.from("material_shelves").upsert(payload, { onConflict: "code,warehouse" });
        if (error) throw error;
      } else {
        const { error } = await supabase.from("material_shelves").delete().eq("code", code).eq("warehouse", warehouse);
        if (error) throw error;
      }
      await load();
      setEditCell(null);
    } catch (e: any) {
      setMsg("Errore salvataggio: " + (e?.message ?? String(e)));
    } finally {
      setSaving(null);
    }
  }

  function buildConfirmData(code: string, warehouse: "PRM" | "REALE") {
    const item = items.find((i) => i.code === code);
    const entry = shelves[code]?.[warehouse] ?? { shelf: "", place: "", nfcTagId: "", barcode: "" };
    const otherWh: "PRM" | "REALE" = warehouse === "PRM" ? "REALE" : "PRM";
    const otherEntry = shelves[code]?.[otherWh] ?? { shelf: "", place: "", nfcTagId: "", barcode: "" };
    const otherShelf = otherEntry.shelf.trim();
    const otherPlace = otherEntry.place.trim();
    const otherHasPos = (otherShelf && otherShelf !== "—") || !!otherPlace;
    return {
      code,
      name: item?.name ?? code,
      warehouse,
      currentShelf: entry.shelf.trim() || "—",
      currentPlace: entry.place.trim(),
      otherWarehouse: otherHasPos ? { wh: otherWh, shelf: otherEntry.shelf, place: otherEntry.place } : undefined,
    };
  }

  function openNfcConfirm(code: string, warehouse: "PRM" | "REALE") {
    setNfcConfirm(buildConfirmData(code, warehouse));
  }

  async function startNfcScan() {
    if (!nfcConfirm) return;
    const { code, warehouse } = nfcConfirm;
    setNfcConfirm(null);
    await doAssociateNfc(code, warehouse);
  }

  async function doAssociateNfc(code: string, warehouse: "PRM" | "REALE", forceReassign = false) {
    if (!isNfcSupported) {
      setMsg(
        isIOS
          ? "NFC non disponibile su iPhone/iPad. Safari non supporta la scansione NFC. Usa la ricerca per barcode."
          : "NFC richiede Chrome su Android con HTTPS. Da mobile via IP usa npm run dev:https, poi accedi da https://TUO_IP:3000"
      );
      return;
    }
    setNfcTagReassign(null);
    setNfcAssociating({ code, warehouse });
    setNfcStatus("searching");
    setNfcStatusMsg("Avvicina il dispositivo al tag NFC...");
    setMsg(null);
    try {
      const ndef = new NDEFReader();
      await ndef.scan();

      const serialNumber = await new Promise<string>((resolve, reject) => {
        const handler = (event: NDEFReadingEvent) => {
          ndef.removeEventListener("reading", handler);
          const sn = event.serialNumber ?? "";
          resolve(sn || "unknown");
        };
        ndef.addEventListener("reading", handler);
        setTimeout(() => reject(new Error("Timeout: avvicina il telefono al tag entro 30 secondi")), 30000);
      });

      setNfcStatus("found");
      setNfcStatusMsg("Tag trovato! Salvataggio...");

      if (!serialNumber || serialNumber === "unknown") {
        setNfcStatus("error");
        setNfcStatusMsg("Impossibile leggere l'ID del tag. Riprova.");
        setMsg("Impossibile leggere l'ID del tag. Riprova.");
        setTimeout(() => { setNfcAssociating(null); setNfcStatus("searching"); }, 2500);
        return;
      }

      const { data: existing } = await supabase
        .from("material_shelves")
        .select("code,warehouse")
        .eq("nfc_tag_id", serialNumber)
        .maybeSingle();

      if (existing && !forceReassign && (existing.code !== code || existing.warehouse !== warehouse)) {
        setNfcAssociating(null);
        setNfcStatus("searching");
        setNfcTagReassign({
          serialNumber,
          code,
          warehouse,
          existingCode: (existing as any).code,
          existingWarehouse: (existing as any).warehouse,
        });
        return;
      }

      await saveNfcAssociation(code, warehouse, serialNumber);
      setNfcStatus("success");
      setNfcStatusMsg("Successo! Tag associato.");
      setMsg("NFC associato ✅");
      await new Promise((r) => setTimeout(r, 1500));
      setNfcAssociating(null);
      setNfcStatus("searching");
    } catch (e: any) {
      setNfcStatus("error");
      setNfcStatusMsg(e?.message ?? "Errore associazione NFC");
      setMsg(e?.message ?? "Errore associazione NFC");
      await new Promise((r) => setTimeout(r, 3000));
      setNfcAssociating(null);
      setNfcStatus("searching");
    }
  }

  async function saveNfcAssociation(code: string, warehouse: "PRM" | "REALE", serialNumber: string) {
    const entry = shelves[code]?.[warehouse] ?? { shelf: "", place: "", nfcTagId: "", barcode: "" };
    const shelfVal = entry.shelf.trim() || "—";
    const placeVal = entry.place.trim() || null;
    await supabase.from("material_shelves").update({ nfc_tag_id: null }).eq("nfc_tag_id", serialNumber);
    const { error } = await supabase.from("material_shelves").upsert(
      { code, warehouse, shelf: shelfVal, place: placeVal, nfc_tag_id: serialNumber },
      { onConflict: "code,warehouse" }
    );
    if (error) throw error;
    setMsg("NFC associato ✅");
    await load();
  }

  async function confirmNfcReassign() {
    if (!nfcTagReassign) return;
    const { code, warehouse, serialNumber } = nfcTagReassign;
    setNfcTagReassign(null);
    try {
      await saveNfcAssociation(code, warehouse, serialNumber);
    } catch (e: any) {
      setMsg(e?.message ?? "Errore associazione NFC");
    }
  }

  async function searchByBarcode(value: string) {
    const barcodeVal = value.trim();
    if (!barcodeVal) return;
    setQ(barcodeVal);
    setSearchBarcodeVal("");
    setSearchByBarcodeOpen(false);
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
      readerRef.current = new BrowserMultiFormatReader();
      const result = await readerRef.current.decodeOnceFromVideoDevice(undefined, videoEl);
      stopCameraScan();
      const text = String(result?.getText?.() ?? "").trim();
      if (text) searchByBarcode(text);
    } catch (e: any) {
      setMsg("Errore camera: " + (e?.message ?? "sconosciuto"));
      stopCameraScan();
    }
  }

  async function searchByNfc() {
    if (!isNfcSupported) {
      setMsg(isIOS ? "NFC non disponibile su iPhone/iPad." : "NFC richiede Chrome su Android con HTTPS.");
      return;
    }
    setSearchByNfcScanning(true);
    setMsg(null);
    try {
      const ndef = new NDEFReader();
      await ndef.scan();
      const serialNumber = await new Promise<string>((resolve, reject) => {
        const handler = (event: NDEFReadingEvent) => {
          ndef.removeEventListener("reading", handler);
          resolve(event.serialNumber ?? "");
        };
        ndef.addEventListener("reading", handler);
        setTimeout(() => reject(new Error("Timeout: avvicina il telefono al tag entro 30 secondi")), 30000);
      });
      const { data: row } = await supabase.from("material_shelves").select("code").eq("nfc_tag_id", serialNumber).maybeSingle();
      if (row) {
        setQ((row as any).code ?? "");
        setMsg("Materiale trovato: " + (row as any).code);
      } else {
        setMsg("Nessun materiale associato a questo tag NFC.");
      }
    } catch (e: any) {
      setMsg(e?.message ?? "Errore lettura NFC");
    } finally {
      setSearchByNfcScanning(false);
    }
  }

  function getShelfDisplay(entry: ShelfEntry | undefined): string {
    if (!entry) return "—";
    const parts = [entry.shelf.trim(), entry.place.trim()].filter(Boolean);
    return parts.length ? parts.join(" · ") : "—";
  }

  function openMaterialPopup(it: ItemRow) {
    setMaterialPopup(it);
    const prm = shelves[it.code]?.PRM ?? { shelf: "", place: "", nfcTagId: "", barcode: "" };
    const reale = shelves[it.code]?.REALE ?? { shelf: "", place: "", nfcTagId: "", barcode: "" };
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
        if (shelfVal || (entry?.nfcTagId || entry?.barcode)) {
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
    } catch (e: any) {
      setMsg(e?.message ?? "Errore salvataggio");
    } finally {
      setSaving(null);
    }
  }

  function stopCameraScan() {
    try {
      (readerRef.current as any)?.reset?.();
    } catch {}
    try {
      (readerRef.current as any)?.stopContinuousDecode?.();
    } catch {}
    try {
      const v = videoRef.current;
      const stream = v?.srcObject as MediaStream | null;
      if (stream) stream.getTracks().forEach((t) => t.stop());
      if (v) v.srcObject = null;
    } catch {}
    readerRef.current = null;
    setCameraScanning(false);
  }

  const filtered = items.filter((it) => {
    const s = shelves[it.code];
    const prm = s?.PRM ?? { shelf: "", place: "", nfcTagId: "", barcode: "" };
    const reale = s?.REALE ?? { shelf: "", place: "", nfcTagId: "", barcode: "" };
    const match =
      !q.trim() ||
      it.code.toLowerCase().includes(q.toLowerCase()) ||
      (it.name ?? "").toLowerCase().includes(q.toLowerCase());
    const shelfMatch =
      !q.trim() ||
      prm.shelf.toLowerCase().includes(q.toLowerCase()) ||
      prm.place.toLowerCase().includes(q.toLowerCase()) ||
      reale.shelf.toLowerCase().includes(q.toLowerCase()) ||
      reale.place.toLowerCase().includes(q.toLowerCase());
    const barcodeMatch = !q.trim() || prm.barcode.toLowerCase().includes(q.toLowerCase()) || reale.barcode.toLowerCase().includes(q.toLowerCase());
    const nfcMatch = !q.trim() || (prm.nfcTagId && prm.nfcTagId.toLowerCase().includes(q.toLowerCase())) || (reale.nfcTagId && reale.nfcTagId.toLowerCase().includes(q.toLowerCase()));
    return match || shelfMatch || barcodeMatch || nfcMatch;
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
        <div className="pageBarTitle">Scaffali</div>
      </div>

      <div className="card" style={{ padding: 12, margin: 12 }}>
        <div style={{ marginBottom: 12, display: "flex", flexWrap: "wrap", gap: 10, alignItems: "flex-end" }}>
          <div>
            <label className="label" htmlFor="qScaffali">
              Cerca materiale (codice, descrizione, scaffale, barcode)
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
              className="btn"
              onClick={() => { setSearchBarcodeVal(""); setSearchByBarcodeOpen(true); setTimeout(() => searchBarcodeInputRef.current?.focus(), 50); }}
              style={{ display: "flex", alignItems: "center", gap: 6 }}
            >
              <BarcodeIcon />
              Cerca con barcode
            </button>
            <button
              type="button"
              className="btn"
              onClick={searchByNfc}
              disabled={!isNfcSupported || searchByNfcScanning}
              style={{ display: "flex", alignItems: "center", gap: 6, opacity: isNfcSupported ? 1 : 0.7 }}
            >
              <NfcIcon size={18} />
              {searchByNfcScanning ? "Scansione..." : "Cerca con NFC"}
            </button>
          </div>
        </div>

        <div style={{ fontSize: 13, color: "#64748b", marginBottom: 12 }}>
          Assegna scaffale e luogo per ogni materiale e magazzino. Cerca con barcode o NFC per trovare rapidamente un materiale.
        </div>
        {isMobile && (
          <div style={{ fontSize: 12, padding: 10, background: "#e0f2fe", borderRadius: 8, marginBottom: 12, border: "1px solid #0ea5e9" }}>
            Clicca su un materiale per aprire il popup e inserire scaffale, luogo, barcode o NFC.
          </div>
        )}
        {!isNfcSupported && (
          <div style={{ fontSize: 12, padding: 10, background: "#fef3c7", borderRadius: 8, marginBottom: 12, border: "1px solid #f59e0b" }}>
            {isIOS ? (
              <>ℹ️ <b>NFC non disponibile su iPhone/iPad.</b> Safari non supporta l&apos;API Web NFC. Usa <b>Cerca con barcode</b> per trovare i materiali.</>
            ) : (
              <>ℹ️ NFC: disponibile solo su <b>Chrome Android</b> con <b>HTTPS</b>. Su iOS non è supportato. Usa <b>Cerca con barcode</b> come alternativa.</>
            )}
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
              zIndex: 1200,
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

        {nfcConfirm && (() => {
          const c = nfcConfirm;
          return (
            <div
              style={{
                position: "fixed",
                inset: 0,
                background: "rgba(15,23,42,0.5)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                zIndex: 1100,
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
                <div style={{ fontWeight: 900, fontSize: 16, marginBottom: 12 }}>
                  Associazione NFC
                </div>
                <div style={{ fontSize: 14, marginBottom: 8 }}>
                  <b>{c.code}</b> · {c.name}
                </div>
                <div style={{ fontSize: 14, marginBottom: 12 }}>
                  Magazzino: <b>{c.warehouse}</b>
                </div>
                {(c.currentShelf !== "—" || c.currentPlace) ? (
                  <div style={{ fontSize: 13, padding: 12, background: "#fef3c7", borderRadius: 8, marginBottom: 12, border: "1px solid #f59e0b" }}>
                    Questo materiale ha già una posizione in {c.warehouse}:<br />
                    <b>Scaffale {c.currentShelf}</b>
                    {c.currentPlace && <> · <b>Luogo {c.currentPlace}</b></>}
                  </div>
                ) : (
                  <div style={{ fontSize: 13, padding: 12, background: "#f1f5f9", borderRadius: 8, marginBottom: 12 }}>
                    Nessuna posizione ancora. Verrà creato con scaffale "—". Puoi modificarlo dopo.
                  </div>
                )}
                {c.otherWarehouse && (
                  <div style={{ fontSize: 12, color: "#64748b", marginBottom: 12 }}>
                    Nota: questo materiale ha anche posizione in <b>{c.otherWarehouse.wh}</b> ({c.otherWarehouse.shelf}
                    {c.otherWarehouse.place && ` · ${c.otherWarehouse.place}`})
                  </div>
                )}
                <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
                  <button type="button" className="btn" onClick={() => setNfcConfirm(null)}>
                    Annulla
                  </button>
                  <button type="button" className="btn btnPrimary" onClick={() => startNfcScan()}>
                    Sì, avvia scansione
                  </button>
                </div>
              </div>
            </div>
          );
        })()}

        {searchByBarcodeOpen && (
          <div
            style={{
              position: "fixed",
              inset: 0,
              background: "rgba(15,23,42,0.5)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              zIndex: 1100,
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
              <div style={{ fontWeight: 900, fontSize: 16, marginBottom: 12 }}>Cerca materiale per barcode</div>
              <div style={{ fontSize: 14, color: "#64748b", marginBottom: 12 }}>
                Scansiona o digita il barcode per cercare il materiale associato.
              </div>
              <div style={{ marginBottom: 16, display: cameraScanning ? "block" : "none" }}>
                <div style={{ padding: 12, background: "#0f172a", borderRadius: 12, marginBottom: 8 }}>
                  <video ref={videoRef} style={{ width: "100%", maxWidth: 360, borderRadius: 8 }} muted playsInline />
                  <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 8 }}>Inquadra il barcode</div>
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
                      onClick={startCameraScanForSearch}
                      style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}
                    >
                      <BarcodeIcon />
                      Scansiona con fotocamera
                    </button>
                  </div>
                  <input
                    ref={searchBarcodeInputRef}
                    type="text"
                    className="input"
                    value={searchBarcodeVal}
                    onChange={(e) => setSearchBarcodeVal(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") searchByBarcode(searchBarcodeVal);
                      if (e.key === "Escape") { stopCameraScan(); setSearchByBarcodeOpen(false); }
                    }}
                    placeholder="Oppure digita o usa scanner hardware..."
                    style={{ width: "100%", marginBottom: 16 }}
                    autoFocus
                  />
                </>
              )}
              <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
                <button
                  type="button"
                  className="btn"
                  onClick={() => { stopCameraScan(); setSearchByBarcodeOpen(false); }}
                >
                  Annulla
                </button>
                <button
                  type="button"
                  className="btn btnPrimary"
                  onClick={() => searchByBarcode(searchBarcodeVal)}
                  disabled={cameraScanning || !searchBarcodeVal.trim()}
                >
                  Cerca
                </button>
              </div>
            </div>
          </div>
        )}

        {nfcTagReassign && (
          <div
            style={{
              position: "fixed",
              inset: 0,
              background: "rgba(15,23,42,0.5)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              zIndex: 1100,
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
              <div style={{ fontWeight: 900, fontSize: 16, marginBottom: 12 }}>Tag NFC già associato</div>
              <div style={{ fontSize: 14, padding: 12, background: "#fee2e2", borderRadius: 8, marginBottom: 16, border: "1px solid #ef4444" }}>
                Questo tag NFC è già associato a <b>{nfcTagReassign.existingCode}</b> · <b>{nfcTagReassign.existingWarehouse}</b>.
              </div>
              <div style={{ fontSize: 13, marginBottom: 16 }}>
                Vuoi spostarlo a <b>{nfcTagReassign.code}</b> · <b>{nfcTagReassign.warehouse}</b>?
              </div>
              <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
                <button type="button" className="btn" onClick={() => setNfcTagReassign(null)}>
                  No, annulla
                </button>
                <button type="button" className="btn btnPrimary" onClick={confirmNfcReassign}>
                  Sì, sposta qui
                </button>
              </div>
            </div>
          </div>
        )}

        {nfcAssociating && (
          <div
            style={{
              position: "fixed",
              inset: 0,
              background: "rgba(15,23,42,0.5)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              zIndex: 1100,
              padding: 20,
            }}
          >
            <div
              style={{
                background: "white",
                borderRadius: 14,
                padding: 24,
                maxWidth: 360,
                textAlign: "center",
                boxShadow: "0 24px 60px rgba(0,0,0,0.3)",
              }}
            >
              <div style={{ display: "flex", justifyContent: "center", marginBottom: 12 }}>
                {nfcStatus === "searching" && <NfcIcon size={48} />}
                {nfcStatus === "found" && <SpinnerIcon />}
                {nfcStatus === "success" && <CheckIcon />}
                {nfcStatus === "error" && <ErrorIcon />}
              </div>
              <div
                style={{
                  fontWeight: 900,
                  fontSize: 18,
                  marginBottom: 8,
                  color: nfcStatus === "success" ? "#16a34a" : nfcStatus === "error" ? "#dc2626" : "#0f172a",
                }}
              >
                {nfcStatusMsg}
              </div>
              <div style={{ fontSize: 14, color: "#64748b", marginBottom: 16 }}>
                {nfcAssociating.code} · {nfcAssociating.warehouse}
              </div>
              {nfcStatus === "searching" && (
                <div style={{ display: "flex", justifyContent: "center", gap: 4, marginBottom: 16 }}>
                  <span className="nfc-pulse" style={{ width: 8, height: 8, borderRadius: "50%", background: "#0ea5e9" }} />
                  <span className="nfc-pulse" style={{ width: 8, height: 8, borderRadius: "50%", background: "#0ea5e9", animationDelay: "0.2s" }} />
                  <span className="nfc-pulse" style={{ width: 8, height: 8, borderRadius: "50%", background: "#0ea5e9", animationDelay: "0.4s" }} />
                </div>
              )}
              {nfcStatus === "searching" && (
                <div style={{ fontSize: 12, color: "#94a3b8", marginBottom: 16 }}>Attendi la lettura del tag… (max 30 sec)</div>
              )}
              {nfcStatus === "searching" && (
                <button type="button" className="btn" onClick={() => { setNfcAssociating(null); setNfcStatus("searching"); }}>
                  Annulla
                </button>
              )}
            </div>
          </div>
        )}

        {materialPopup && popupForm && (
          <div
            onMouseDown={() => { setMaterialPopup(null); setPopupForm(null); }}
            style={{
              position: "fixed",
              inset: 0,
              background: "rgba(15,23,42,0.5)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              zIndex: 1000,
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
                <button type="button" className="btn" onClick={() => { setMaterialPopup(null); setPopupForm(null); }}>
                  Chiudi
                </button>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
                <div style={{ padding: 12, background: "rgba(2,132,199,0.08)", borderRadius: 10, border: "1px solid rgba(2,132,199,0.25)" }}>
                  <div style={{ fontWeight: 800, marginBottom: 10 }}>PRM</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    <div>
                      <label className="label" style={{ fontSize: 12 }}>Scaffale</label>
                      <input
                        type="text"
                        className="input"
                        value={popupForm.PRM.shelf}
                        onChange={(e) => setPopupForm((p) => p ? { ...p, PRM: { ...p.PRM, shelf: e.target.value } } : null)}
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
                        onChange={(e) => setPopupForm((p) => p ? { ...p, PRM: { ...p.PRM, place: e.target.value } } : null)}
                        placeholder="Es. Zona A"
                        style={{ width: "100%" }}
                      />
                    </div>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      <button type="button" className="btn" onClick={() => openNfcConfirm(materialPopup.code, "PRM")} disabled={!!nfcAssociating}
                        style={{ padding: "8px 12px", fontSize: 12, background: shelves[materialPopup.code]?.PRM?.nfcTagId ? "#dcfce7" : "#f1f5f9" }}>
                        {shelves[materialPopup.code]?.PRM?.nfcTagId ? "NFC ✓" : "Associa NFC"}
                      </button>
                    </div>
                  </div>
                </div>

                <div style={{ padding: 12, background: "rgba(124,58,237,0.08)", borderRadius: 10, border: "1px solid rgba(124,58,237,0.25)" }}>
                  <div style={{ fontWeight: 800, marginBottom: 10 }}>REALE</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    <div>
                      <label className="label" style={{ fontSize: 12 }}>Scaffale</label>
                      <input
                        type="text"
                        className="input"
                        value={popupForm.REALE.shelf}
                        onChange={(e) => setPopupForm((p) => p ? { ...p, REALE: { ...p.REALE, shelf: e.target.value } } : null)}
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
                        onChange={(e) => setPopupForm((p) => p ? { ...p, REALE: { ...p.REALE, place: e.target.value } } : null)}
                        placeholder="Es. Zona B"
                        style={{ width: "100%" }}
                      />
                    </div>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      <button type="button" className="btn" onClick={() => openNfcConfirm(materialPopup.code, "REALE")} disabled={!!nfcAssociating}
                        style={{ padding: "8px 12px", fontSize: 12, background: shelves[materialPopup.code]?.REALE?.nfcTagId ? "#dcfce7" : "#f1f5f9" }}>
                        {shelves[materialPopup.code]?.REALE?.nfcTagId ? "NFC ✓" : "Associa NFC"}
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              <button type="button" className="btn btnPrimary" style={{ marginTop: 16, width: "100%" }} onClick={savePopupForm} disabled={!!saving}>
                {saving ? "Salvataggio…" : "Salva"}
              </button>
            </div>
          </div>
        )}

        {loading ? (
          <div style={{ padding: 24 }}>Caricamento…</div>
        ) : (
          <div className="tableWrap" style={{ marginTop: 8 }}>
            <table className="table">
              <thead>
                <tr>
                  <th>Codice</th>
                  <th>Descrizione</th>
                  <th>UM</th>
                  <th>Scaffale · Luogo PRM</th>
                  <th>Scaffale · Luogo REALE</th>
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
                          <span style={{ fontSize: 13 }}>
                            {getShelfDisplay(shelves[it.code]?.PRM)}
                            {(shelves[it.code]?.PRM?.barcode || shelves[it.code]?.PRM?.nfcTagId) && (
                              <span style={{ marginLeft: 4, opacity: 0.8 }}>✓</span>
                            )}
                          </span>
                        ) : editCell?.code === it.code && editCell?.warehouse === "PRM" ? (
                          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
                            <input
                              type="text"
                              className="input"
                              placeholder="Scaffale"
                              value={editCell.shelf}
                              onChange={(e) => setEditCell((p) => (p ? { ...p, shelf: e.target.value } : null))}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") saveShelf(it.code, "PRM", editCell.shelf, editCell.place);
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
                                if (e.key === "Enter") saveShelf(it.code, "PRM", editCell.shelf, editCell.place);
                                if (e.key === "Escape") setEditCell(null);
                              }}
                              style={{ width: 90 }}
                            />
                            <button
                              type="button"
                              className="btn btnPrimary"
                              onClick={() => saveShelf(it.code, "PRM", editCell.shelf, editCell.place)}
                              disabled={!!saving}
                            >
                              Salva
                            </button>
                            <button type="button" className="btn" onClick={() => setEditCell(null)}>
                              Annulla
                            </button>
                          </div>
                        ) : (
                          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
                            <button
                              type="button"
                              className="btn"
                              onClick={() => {
                                const e = shelves[it.code]?.PRM ?? { shelf: "", place: "", nfcTagId: "", barcode: "" };
                                setEditCell({ code: it.code, warehouse: "PRM", shelf: e.shelf, place: e.place });
                              }}
                              style={{
                                minWidth: 80,
                                background: (shelves[it.code]?.PRM?.shelf || shelves[it.code]?.PRM?.place) ? "#f0fdf4" : "#f8fafc",
                                borderColor: "#e2e8f0",
                              }}
                            >
                              {getShelfDisplay(shelves[it.code]?.PRM)}
                            </button>
                            <button
                              type="button"
                              className="btn"
                              onClick={() => openNfcConfirm(it.code, "PRM")}
                              disabled={!!nfcAssociating}
                              title={shelves[it.code]?.PRM?.nfcTagId ? "NFC già associato. Clicca per ri-associare." : "Associa tag NFC (Chrome Android)"}
                              style={{
                                padding: "6px 10px",
                                fontSize: 12,
                                background: shelves[it.code]?.PRM?.nfcTagId ? "#dcfce7" : "#f1f5f9",
                                borderColor: shelves[it.code]?.PRM?.nfcTagId ? "#22c55e" : "#e2e8f0",
                                opacity: isNfcSupported ? 1 : 0.7,
                              }}
                            >
                              {shelves[it.code]?.PRM?.nfcTagId ? "NFC ✓" : "Associa NFC"}
                            </button>
                          </div>
                        )}
                      </td>
                      <td
                        onClick={(e) => {
                          if (isMobile) return;
                          e.stopPropagation();
                        }}
                      >
                        {isMobile ? (
                          <span style={{ fontSize: 13 }}>
                            {getShelfDisplay(shelves[it.code]?.REALE)}
                            {(shelves[it.code]?.REALE?.barcode || shelves[it.code]?.REALE?.nfcTagId) && (
                              <span style={{ marginLeft: 4, opacity: 0.8 }}>✓</span>
                            )}
                          </span>
                        ) : editCell?.code === it.code && editCell?.warehouse === "REALE" ? (
                          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
                            <input
                              type="text"
                              className="input"
                              placeholder="Scaffale"
                              value={editCell.shelf}
                              onChange={(e) => setEditCell((p) => (p ? { ...p, shelf: e.target.value } : null))}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") saveShelf(it.code, "REALE", editCell.shelf, editCell.place);
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
                                if (e.key === "Enter") saveShelf(it.code, "REALE", editCell.shelf, editCell.place);
                                if (e.key === "Escape") setEditCell(null);
                              }}
                              style={{ width: 90 }}
                            />
                            <button
                              type="button"
                              className="btn btnPrimary"
                              onClick={() => saveShelf(it.code, "REALE", editCell.shelf, editCell.place)}
                              disabled={!!saving}
                            >
                              Salva
                            </button>
                            <button type="button" className="btn" onClick={() => setEditCell(null)}>
                              Annulla
                            </button>
                          </div>
                        ) : (
                          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
                            <button
                              type="button"
                              className="btn"
                              onClick={() => {
                                const e = shelves[it.code]?.REALE ?? { shelf: "", place: "", nfcTagId: "", barcode: "" };
                                setEditCell({ code: it.code, warehouse: "REALE", shelf: e.shelf, place: e.place });
                              }}
                              style={{
                                minWidth: 80,
                                background: (shelves[it.code]?.REALE?.shelf || shelves[it.code]?.REALE?.place) ? "#f0fdf4" : "#f8fafc",
                                borderColor: "#e2e8f0",
                              }}
                            >
                              {getShelfDisplay(shelves[it.code]?.REALE)}
                            </button>
                            <button
                              type="button"
                              className="btn"
                              onClick={() => openNfcConfirm(it.code, "REALE")}
                              disabled={!!nfcAssociating}
                              title={shelves[it.code]?.REALE?.nfcTagId ? "NFC già associato. Clicca per ri-associare." : "Associa tag NFC (Chrome Android)"}
                              style={{
                                padding: "6px 10px",
                                fontSize: 12,
                                background: shelves[it.code]?.REALE?.nfcTagId ? "#dcfce7" : "#f1f5f9",
                                borderColor: shelves[it.code]?.REALE?.nfcTagId ? "#22c55e" : "#e2e8f0",
                                opacity: isNfcSupported ? 1 : 0.7,
                              }}
                            >
                              {shelves[it.code]?.REALE?.nfcTagId ? "NFC ✓" : "Associa NFC"}
                            </button>
                          </div>
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
