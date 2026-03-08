"use client";

import React, { useEffect, useRef, useState } from "react";
import { createClient } from "../_lib/supabase/client";
import { useIsAdmin } from "../_lib/hooks/useIsAdmin";

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
  const { isAdmin, loading: adminLoading } = useIsAdmin();

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
  const [barcodeConfirm, setBarcodeConfirm] = useState<{
    code: string;
    name: string;
    warehouse: "PRM" | "REALE";
    currentShelf: string;
    currentPlace: string;
    otherWarehouse?: { wh: "PRM" | "REALE"; shelf: string; place: string };
  } | null>(null);
  const [barcodeInput, setBarcodeInput] = useState<{ code: string; warehouse: "PRM" | "REALE" } | null>(null);
  const [barcodeInputVal, setBarcodeInputVal] = useState("");
  const barcodeInputRef = useRef<HTMLInputElement>(null);
  const [barcodeReassign, setBarcodeReassign] = useState<{
    barcode: string;
    code: string;
    warehouse: "PRM" | "REALE";
    existingCode: string;
    existingWarehouse: string;
  } | null>(null);
  const [editCell, setEditCell] = useState<{
    code: string;
    warehouse: "PRM" | "REALE";
    shelf: string;
    place: string;
  } | null>(null);
  const [materialPopup, setMaterialPopup] = useState<ItemRow | null>(null);
  const [popupForm, setPopupForm] = useState<{ PRM: { shelf: string; place: string }; REALE: { shelf: string; place: string } } | null>(null);
  const [isMobile, setIsMobile] = useState(false);

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
    const check = () => setIsMobile(typeof window !== "undefined" && window.innerWidth < 768);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
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
    const otherWh = warehouse === "PRM" ? "REALE" : "PRM";
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
    if (!isNfcSupported) {
      setMsg(
        "NFC non disponibile su questo dispositivo. Verifica: 1) Chrome su Android (non Samsung Internet) 2) Sito in HTTPS 3) Permesso NFC attivo nelle impostazioni."
      );
      return;
    }
    setNfcConfirm(buildConfirmData(code, warehouse));
  }

  function openBarcodeConfirm(code: string, warehouse: "PRM" | "REALE") {
    setBarcodeConfirm(buildConfirmData(code, warehouse));
  }

  async function startNfcScan() {
    if (!nfcConfirm) return;
    const { code, warehouse } = nfcConfirm;
    setNfcConfirm(null);
    await doAssociateNfc(code, warehouse);
  }

  async function doAssociateNfc(code: string, warehouse: "PRM" | "REALE", forceReassign = false) {
    if (!isNfcSupported) {
      setMsg("NFC non supportato. Usa Chrome su Android con HTTPS.");
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

  function startBarcodeScan() {
    if (!barcodeConfirm) return;
    const { code, warehouse } = barcodeConfirm;
    setBarcodeConfirm(null);
    setBarcodeInput({ code, warehouse });
    setBarcodeInputVal("");
    setTimeout(() => barcodeInputRef.current?.focus(), 50);
  }

  async function submitBarcode(value: string, forceReassign = false) {
    if (!barcodeInput) return;
    const { code, warehouse } = barcodeInput;
    const barcodeVal = value.trim();
    if (!barcodeVal) {
      setMsg("Inserisci o scansiona un codice a barre.");
      return;
    }

    const { data: existing } = await supabase
      .from("material_shelves")
      .select("code,warehouse")
      .eq("barcode", barcodeVal)
      .maybeSingle();

    if (existing && !forceReassign && (existing.code !== code || existing.warehouse !== warehouse)) {
      setBarcodeInput(null);
      setBarcodeReassign({
        barcode: barcodeVal,
        code,
        warehouse,
        existingCode: (existing as any).code,
        existingWarehouse: (existing as any).warehouse,
      });
      return;
    }

    setBarcodeInput(null);
    try {
      await saveBarcodeAssociation(code, warehouse, barcodeVal);
    } catch (e: any) {
      setMsg(e?.message ?? "Errore associazione barcode");
    }
  }

  async function saveBarcodeAssociation(code: string, warehouse: "PRM" | "REALE", barcodeVal: string) {
    const entry = shelves[code]?.[warehouse] ?? { shelf: "", place: "", nfcTagId: "", barcode: "" };
    const shelfVal = entry.shelf.trim() || "—";
    const placeVal = entry.place.trim() || null;
    await supabase.from("material_shelves").update({ barcode: null }).eq("barcode", barcodeVal);
    const { error } = await supabase.from("material_shelves").upsert(
      { code, warehouse, shelf: shelfVal, place: placeVal, barcode: barcodeVal },
      { onConflict: "code,warehouse" }
    );
    if (error) throw error;
    setMsg("Barcode associato ✅");
    await load();
  }

  async function confirmBarcodeReassign() {
    if (!barcodeReassign) return;
    const { code, warehouse, barcode } = barcodeReassign;
    setBarcodeReassign(null);
    try {
      await saveBarcodeAssociation(code, warehouse, barcode);
    } catch (e: any) {
      setMsg(e?.message ?? "Errore associazione barcode");
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

  const isNfcSupported = typeof window !== "undefined" && typeof (window as any).NDEFReader !== "undefined";

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
    return match || shelfMatch || barcodeMatch;
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
        <div style={{ marginBottom: 12 }}>
          <label className="label" htmlFor="qScaffali">
            Cerca materiale (codice o descrizione)
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

        <div style={{ fontSize: 13, color: "#64748b", marginBottom: 12 }}>
          Assegna scaffale e luogo per ogni materiale e magazzino. Il magazzino può essere diviso in più luoghi (es. Zona A, Padiglione 2). Usa <b>Associa barcode</b> (scelta principale) per collegare un codice a barre: scansiona o digita. Usa <b>Associa NFC</b> su Chrome Android (HTTPS) per collegare un tag NFC. L&apos;operatore vedrà queste informazioni durante il prelievo.
        </div>
        {isMobile && (
          <div style={{ fontSize: 12, padding: 10, background: "#e0f2fe", borderRadius: 8, marginBottom: 12, border: "1px solid #0ea5e9" }}>
            📱 Clicca su un materiale per aprire il popup e inserire scaffale, luogo, barcode o NFC.
          </div>
        )}
        {!isNfcSupported && (
          <div style={{ fontSize: 12, padding: 10, background: "#fef3c7", borderRadius: 8, marginBottom: 12, border: "1px solid #f59e0b" }}>
            ℹ️ NFC: disponibile solo su <b>Chrome Android</b> con <b>HTTPS</b>. Se non vedi il pulsante o non funziona, verifica che il sito sia su https:// e usa Chrome (non Samsung Internet).
          </div>
        )}

        {msg && <div style={{ marginBottom: 12, fontWeight: 800, color: msg.includes("✅") ? "#16a34a" : "#dc2626" }}>{msg}</div>}

        {(nfcConfirm || barcodeConfirm) && (() => {
          const c = nfcConfirm || barcodeConfirm!;
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
                  {nfcConfirm ? "Associazione NFC" : "Associazione Barcode"}
                </div>
                <div style={{ fontSize: 14, marginBottom: 8 }}>
                  <b>{c.code}</b> · {c.name}
                </div>
                <div style={{ fontSize: 14, marginBottom: 12 }}>
                  Magazzino: <b>{c.warehouse}</b>
                </div>
                {(c.currentShelf !== "—" || c.currentPlace) ? (
                  <div style={{ fontSize: 13, padding: 12, background: "#fef3c7", borderRadius: 8, marginBottom: 12, border: "1px solid #f59e0b" }}>
                    ⚠️ Questo materiale ha già una posizione in {c.warehouse}:<br />
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
                  <button type="button" className="btn" onClick={() => { setNfcConfirm(null); setBarcodeConfirm(null); }}>
                    Annulla
                  </button>
                  <button
                    type="button"
                    className="btn btnPrimary"
                    onClick={() => (nfcConfirm ? startNfcScan() : startBarcodeScan())}
                  >
                    Sì, avvia scansione
                  </button>
                </div>
              </div>
            </div>
          );
        })()}

        {barcodeInput && (
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
              <div style={{ fontWeight: 900, fontSize: 16, marginBottom: 12 }}>Scansiona o digita il barcode</div>
              <div style={{ fontSize: 14, color: "#64748b", marginBottom: 12 }}>
                {barcodeInput.code} · {barcodeInput.warehouse}
              </div>
              <input
                ref={barcodeInputRef}
                type="text"
                className="input"
                value={barcodeInputVal}
                onChange={(e) => setBarcodeInputVal(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") submitBarcode(barcodeInputVal);
                  if (e.key === "Escape") setBarcodeInput(null);
                }}
                placeholder="Usa lo scanner o digita il codice..."
                style={{ width: "100%", marginBottom: 16 }}
                autoFocus
              />
              <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
                <button type="button" className="btn" onClick={() => setBarcodeInput(null)}>
                  Annulla
                </button>
                <button type="button" className="btn btnPrimary" onClick={() => submitBarcode(barcodeInputVal)}>
                  Associa
                </button>
              </div>
            </div>
          </div>
        )}

        {barcodeReassign && (
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
              <div style={{ fontWeight: 900, fontSize: 16, marginBottom: 12 }}>Barcode già associato</div>
              <div style={{ fontSize: 14, padding: 12, background: "#fee2e2", borderRadius: 8, marginBottom: 16, border: "1px solid #ef4444" }}>
                Questo barcode è già associato a <b>{barcodeReassign.existingCode}</b> · <b>{barcodeReassign.existingWarehouse}</b>.
              </div>
              <div style={{ fontSize: 13, marginBottom: 16 }}>
                Vuoi spostarlo a <b>{barcodeReassign.code}</b> · <b>{barcodeReassign.warehouse}</b>?
              </div>
              <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
                <button type="button" className="btn" onClick={() => setBarcodeReassign(null)}>
                  No, annulla
                </button>
                <button type="button" className="btn btnPrimary" onClick={confirmBarcodeReassign}>
                  Sì, sposta qui
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
              <div style={{ fontSize: 48, marginBottom: 12 }}>
                {nfcStatus === "searching" && "📱"}
                {nfcStatus === "found" && "⏳"}
                {nfcStatus === "success" && "✅"}
                {nfcStatus === "error" && "❌"}
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
                      <button type="button" className="btn" onClick={() => openBarcodeConfirm(materialPopup.code, "PRM")} disabled={!!barcodeInput}
                        style={{ padding: "8px 12px", fontSize: 12, background: shelves[materialPopup.code]?.PRM?.barcode ? "#dbeafe" : "#f1f5f9" }}>
                        {shelves[materialPopup.code]?.PRM?.barcode ? "Barcode ✓" : "Associa barcode"}
                      </button>
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
                      <button type="button" className="btn" onClick={() => openBarcodeConfirm(materialPopup.code, "REALE")} disabled={!!barcodeInput}
                        style={{ padding: "8px 12px", fontSize: 12, background: shelves[materialPopup.code]?.REALE?.barcode ? "#dbeafe" : "#f1f5f9" }}>
                        {shelves[materialPopup.code]?.REALE?.barcode ? "Barcode ✓" : "Associa barcode"}
                      </button>
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
                              onClick={() => openBarcodeConfirm(it.code, "PRM")}
                              disabled={!!barcodeInput}
                              title={shelves[it.code]?.PRM?.barcode ? "Barcode già associato. Clicca per ri-associare." : "Associa barcode (scelta principale)"}
                              style={{
                                padding: "6px 10px",
                                fontSize: 12,
                                background: shelves[it.code]?.PRM?.barcode ? "#dbeafe" : "#f1f5f9",
                                borderColor: shelves[it.code]?.PRM?.barcode ? "#2563eb" : "#e2e8f0",
                              }}
                            >
                              {shelves[it.code]?.PRM?.barcode ? "Barcode ✓" : "Associa barcode"}
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
                              onClick={() => openBarcodeConfirm(it.code, "REALE")}
                              disabled={!!barcodeInput}
                              title={shelves[it.code]?.REALE?.barcode ? "Barcode già associato. Clicca per ri-associare." : "Associa barcode (scelta principale)"}
                              style={{
                                padding: "6px 10px",
                                fontSize: 12,
                                background: shelves[it.code]?.REALE?.barcode ? "#dbeafe" : "#f1f5f9",
                                borderColor: shelves[it.code]?.REALE?.barcode ? "#2563eb" : "#e2e8f0",
                              }}
                            >
                              {shelves[it.code]?.REALE?.barcode ? "Barcode ✓" : "Associa barcode"}
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
