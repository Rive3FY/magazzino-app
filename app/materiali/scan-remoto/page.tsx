"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { createClient } from "../../_lib/supabase/client";
import { scanFastBarcode, stopFastBarcodeScan, type FastBarcodeReader } from "../../_lib/fastBarcodeScanner";

type Warehouse = "PRM" | "REALE";

type ResolvedMaterial = {
  rawValue: string;
  source: "barcode" | "nfc";
  item: {
    code: string;
    name: string;
    um: string | null;
  };
  warehouses: Array<{
    warehouse: Warehouse;
    qtyFree: number;
    shelf: string;
    place: string;
  }>;
};

type Status = "idle" | "scanning_nfc" | "scanning_code" | "resolving" | "material" | "sending" | "success" | "error";

function toNumber(value: string) {
  const normalized = value.replace(",", ".").trim();
  const num = Number(normalized);
  return Number.isFinite(num) ? num : NaN;
}

export default function MaterialiScanRemotoPage() {
  const searchParams = useSearchParams();
  const code = searchParams.get("code")?.trim().toUpperCase() ?? "";
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const readerRef = useRef<FastBarcodeReader | null>(null);
  const nfcAbortRef = useRef<AbortController | null>(null);
  const scanTokenRef = useRef(0);

  const [status, setStatus] = useState<Status>("idle");
  const [msg, setMsg] = useState<string>("");
  const [resolved, setResolved] = useState<ResolvedMaterial | null>(null);
  const [selectedWarehouse, setSelectedWarehouse] = useState<Warehouse>("PRM");
  const [qty, setQty] = useState("1");

  useEffect(() => {
    const supabase = createClient();
    let active = true;

    void supabase.auth.getUser().then(({ data }) => {
      if (!active) return;
      const nextUser = data.user ?? null;
      setUser(nextUser);
      setAuthLoading(false);
      if (!nextUser) {
        const returnTo = `/materiali/scan-remoto${code ? `?code=${encodeURIComponent(code)}` : ""}`;
        window.location.href = `/login?redirect=${encodeURIComponent(returnTo)}`;
      }
    });

    return () => {
      active = false;
    };
  }, [code]);

  const stopCameraScan = useCallback(() => {
    stopFastBarcodeScan(videoRef.current, readerRef.current);
    readerRef.current = null;
  }, []);

  const cancelActiveScan = useCallback(() => {
    scanTokenRef.current += 1;
    stopCameraScan();
    try {
      nfcAbortRef.current?.abort();
    } catch {}
    nfcAbortRef.current = null;
    setResolved(null);
    setMsg("");
    setStatus("idle");
  }, [stopCameraScan]);

  useEffect(() => {
    return () => stopCameraScan();
  }, [stopCameraScan]);

  const selectedStock = useMemo(
    () => resolved?.warehouses.find((row) => row.warehouse === selectedWarehouse) ?? null,
    [resolved, selectedWarehouse]
  );

  const resolveScanValue = useCallback(async (rawValue: string, source: "barcode" | "nfc") => {
    const value = rawValue.trim();
    if (!value) {
      setStatus("error");
      setMsg(source === "nfc" ? "Tag NFC non leggibile. Riprova." : "Barcode / QR non leggibile. Riprova.");
      return;
    }

    setStatus("resolving");
    setMsg("Ricerca materiale...");
    setResolved(null);

    const res = await fetch("/api/materiali/remote-scan-resolve", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rawValue: value, source, sessionCode: code }),
    });
    const json = await res.json().catch(() => ({}));

    if (!res.ok) {
      setStatus("error");
      setMsg(json.error ?? "Materiale non trovato.");
      return;
    }

    const material = json as ResolvedMaterial;
    const firstAvailable = material.warehouses.find((row) => row.qtyFree > 0)?.warehouse ?? "PRM";
    setResolved(material);
    setSelectedWarehouse(firstAvailable);
    setQty("1");
    setMsg("");
    setStatus("material");
  }, [code]);

  const startNfcScan = useCallback(async () => {
    if (!code) {
      setStatus("error");
      setMsg("Codice sessione mancante. Inquadra il QR dal PC.");
      return;
    }
    const isNfcSupported = typeof NDEFReader !== "undefined";
    const isIOS = typeof navigator !== "undefined" && /iPad|iPhone|iPod/.test(navigator.userAgent);
    if (!isNfcSupported) {
      setStatus("error");
      setMsg(isIOS ? "NFC non disponibile su iPhone/iPad." : "NFC richiede Chrome su Android con HTTPS.");
      return;
    }

    const token = scanTokenRef.current + 1;
    scanTokenRef.current = token;
    stopCameraScan();
    setStatus("scanning_nfc");
    setMsg("Avvicina il telefono al tag NFC...");

    try {
      const ndef = new NDEFReader();
      const abortController = new AbortController();
      nfcAbortRef.current = abortController;
      await (ndef as unknown as { scan: (options?: { signal?: AbortSignal }) => Promise<void> }).scan({
        signal: abortController.signal,
      });
      const nfcTagId = await new Promise<string>((resolve, reject) => {
        const handler = (event: NDEFReadingEvent) => {
          ndef.removeEventListener("reading", handler);
          resolve(event.serialNumber ?? "");
        };
        ndef.addEventListener("reading", handler);
        setTimeout(() => reject(new Error("Timeout: avvicina il telefono al tag entro 30 secondi")), 30000);
      });

      if (scanTokenRef.current !== token) return;
      nfcAbortRef.current = null;
      await resolveScanValue(nfcTagId === "unknown" ? "" : nfcTagId, "nfc");
    } catch (error) {
      if (scanTokenRef.current !== token) return;
      nfcAbortRef.current = null;
      if (error instanceof DOMException && error.name === "AbortError") return;
      setStatus("error");
      setMsg(error instanceof Error ? error.message : "Errore lettura NFC");
    }
  }, [code, resolveScanValue, stopCameraScan]);

  const startCodeScan = useCallback(async () => {
    if (!code) {
      setStatus("error");
      setMsg("Codice sessione mancante. Inquadra il QR dal PC.");
      return;
    }

    if (!navigator.mediaDevices?.getUserMedia) {
      setStatus("error");
      setMsg("La fotocamera richiede HTTPS. Accedi da mobile con https://IP_DEL_PC:3000.");
      return;
    }

    stopCameraScan();
    setStatus("scanning_code");
    setMsg("Inquadra il barcode o il QR code...");
    await new Promise((resolve) => setTimeout(resolve, 100));

    let videoEl = videoRef.current;
    for (let i = 0; i < 30 && !videoEl; i++) {
      await new Promise((resolve) => setTimeout(resolve, 50));
      videoEl = videoRef.current;
    }

    if (!videoEl) {
      setStatus("error");
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
      await resolveScanValue(text, "barcode");
    } catch (error) {
      stopCameraScan();
      setStatus("error");
      setMsg(error instanceof Error ? error.message : "Errore camera/scansione");
    }
  }, [code, resolveScanValue, stopCameraScan]);

  async function sendPickToPc() {
    if (!resolved || !selectedStock) return;

    const qtyNumber = toNumber(qty);
    if (!Number.isFinite(qtyNumber) || qtyNumber <= 0) {
      setMsg("Inserisci una quantità valida.");
      return;
    }
    if (qtyNumber > selectedStock.qtyFree) {
      setMsg(`Quantità superiore alla disponibilità (${selectedStock.qtyFree}).`);
      return;
    }

    setStatus("sending");
    setMsg("Invio al PC...");

    const res = await fetch("/api/attrezzature/remote-nfc-submit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        code,
        event: {
          type: "material_pick",
          code: resolved.item.code,
          name: resolved.item.name,
          um: resolved.item.um,
          warehouse: selectedWarehouse,
          qty: qtyNumber,
          source: resolved.source,
          rawValue: resolved.rawValue,
        },
      }),
    });
    const json = await res.json().catch(() => ({}));

    if (!res.ok) {
      setStatus("error");
      setMsg(json.error ?? "Errore invio. Riprova.");
      return;
    }

    setStatus("success");
    setMsg(`${resolved.item.code} aggiunto al prelievo`);
    setResolved(null);
    window.setTimeout(() => {
      setMsg("");
      setStatus("idle");
    }, 1100);
  }

  function resetReader() {
    cancelActiveScan();
  }

  if (authLoading || !user) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center p-4">
        <div className="animate-pulse text-slate-500">Caricamento...</div>
      </div>
    );
  }

  if (!code) {
    return (
      <div className="flex min-h-[50vh] flex-col items-center justify-center gap-4 p-6">
        <h1 className="text-xl font-semibold text-slate-800">Terminale prelievo materiali</h1>
        <p className="text-center text-slate-600">
          Codice sessione mancante. Apri questa pagina inquadrando il QR code mostrato sul PC.
        </p>
        <Link href="/materiali" className="text-sky-600 underline">
          Torna ai materiali
        </Link>
      </div>
    );
  }

  return (
    <div style={{ minHeight: "calc(100dvh - 120px)", background: "#f1f5f9", padding: 10, color: "#0f172a", overflowX: "hidden" }}>
      <div style={{ width: "100%", maxWidth: 430, margin: "0 auto", display: "grid", gap: 12, boxSizing: "border-box" }}>
        <div
          style={{
            width: "100%",
            maxWidth: "100%",
            boxSizing: "border-box",
            borderRadius: 20,
            border: "1px solid rgba(15,23,42,0.10)",
            background: "rgba(255,255,255,0.96)",
            padding: 14,
            boxShadow: "0 14px 38px rgba(15,23,42,0.12)",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "flex-start", marginBottom: 14 }}>
            <div style={{ minWidth: 0 }}>
              <p style={{ margin: 0, fontSize: 10, fontWeight: 900, letterSpacing: "0.16em", textTransform: "uppercase", color: "#0284c7" }}>Terminale prelievo</p>
              <h1 style={{ margin: "6px 0 0", fontSize: 28, lineHeight: 1, fontWeight: 950, color: "#0f172a" }}>Materiali</h1>
              <p style={{ margin: "9px 0 0", fontSize: 14, lineHeight: 1.35, color: "#475569" }}>
                Leggi, scegli quantità e aggiungi al carrello del PC.
              </p>
            </div>
            <div style={{ borderRadius: 14, background: "rgba(16,185,129,0.12)", border: "1px solid rgba(16,185,129,0.18)", padding: "8px 10px", textAlign: "right", flexShrink: 0 }}>
              <div style={{ fontSize: 9, fontWeight: 900, letterSpacing: "0.10em", textTransform: "uppercase", color: "#047857" }}>Sessione</div>
              <div style={{ marginTop: 3, fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", fontSize: 17, fontWeight: 950, letterSpacing: "0.10em", color: "#065f46" }}>{code}</div>
            </div>
          </div>

          {status === "idle" && (
            <div style={{ display: "grid", gap: 12 }}>
              <button type="button" onClick={startCodeScan} style={{ display: "flex", alignItems: "center", gap: 14, width: "100%", borderRadius: 18, border: "1px solid rgba(16,185,129,0.28)", background: "rgba(16,185,129,0.08)", padding: 14, color: "#0f172a", textAlign: "left" }}>
                <span style={{ display: "flex", width: 54, height: 54, alignItems: "center", justifyContent: "center", borderRadius: 16, background: "#34d399", color: "#0f172a", fontSize: 20, fontWeight: 950, flexShrink: 0 }}>QR</span>
                <span style={{ display: "block", minWidth: 0, flex: 1 }}>
                  <span style={{ display: "block", fontSize: 18, fontWeight: 950 }}>Barcode / QR</span>
                  <span style={{ display: "block", marginTop: 4, fontSize: 13, lineHeight: 1.35, color: "#475569" }}>Apri camera compatta e leggi il codice.</span>
                </span>
                <span style={{ fontSize: 28, color: "#059669" }}>›</span>
              </button>
              <button type="button" onClick={startNfcScan} style={{ display: "flex", alignItems: "center", gap: 14, width: "100%", borderRadius: 18, border: "1px solid rgba(2,132,199,0.24)", background: "rgba(2,132,199,0.08)", padding: 14, color: "#0f172a", textAlign: "left" }}>
                <span style={{ display: "flex", width: 54, height: 54, alignItems: "center", justifyContent: "center", borderRadius: 16, background: "#38bdf8", color: "#0f172a", fontSize: 18, fontWeight: 950, flexShrink: 0 }}>NFC</span>
                <span style={{ display: "block", minWidth: 0, flex: 1 }}>
                  <span style={{ display: "block", fontSize: 18, fontWeight: 950 }}>Tag NFC</span>
                  <span style={{ display: "block", marginTop: 4, fontSize: 13, lineHeight: 1.35, color: "#475569" }}>Avvicina il telefono al tag materiale.</span>
                </span>
                <span style={{ fontSize: 28, color: "#0284c7" }}>›</span>
              </button>
            </div>
          )}

          {status === "scanning_code" && (
            <div style={{ display: "grid", gap: 12 }}>
              <div style={{ overflow: "hidden", borderRadius: 22, border: "1px solid rgba(255,255,255,0.12)", background: "#000", boxShadow: "0 18px 45px rgba(0,0,0,0.35)" }}>
                <div style={{ position: "relative", width: "100%", height: "min(58vh, 420px)", minHeight: 300, background: "#000" }}>
                  <video ref={videoRef} muted playsInline autoPlay style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                  <div style={{ position: "absolute", inset: 0, background: "radial-gradient(circle at center, transparent 0, transparent 38%, rgba(2,6,23,0.62) 72%)", pointerEvents: "none" }} />
                  <div style={{ position: "absolute", left: 30, right: 30, top: "50%", height: 2, background: "#6ee7b7", boxShadow: "0 0 18px rgba(52,211,153,0.9)", pointerEvents: "none" }} />
                  <div style={{ position: "absolute", inset: 42, borderRadius: 24, border: "1px solid rgba(255,255,255,0.25)", pointerEvents: "none" }}>
                    <div style={{ position: "absolute", left: -2, top: -2, width: 44, height: 44, borderLeft: "4px solid #6ee7b7", borderTop: "4px solid #6ee7b7", borderTopLeftRadius: 24 }} />
                    <div style={{ position: "absolute", right: -2, top: -2, width: 44, height: 44, borderRight: "4px solid #6ee7b7", borderTop: "4px solid #6ee7b7", borderTopRightRadius: 24 }} />
                    <div style={{ position: "absolute", left: -2, bottom: -2, width: 44, height: 44, borderLeft: "4px solid #6ee7b7", borderBottom: "4px solid #6ee7b7", borderBottomLeftRadius: 24 }} />
                    <div style={{ position: "absolute", right: -2, bottom: -2, width: 44, height: 44, borderRight: "4px solid #6ee7b7", borderBottom: "4px solid #6ee7b7", borderBottomRightRadius: 24 }} />
                  </div>
                  <div style={{ position: "absolute", left: 14, right: 14, bottom: 14, borderRadius: 16, background: "rgba(15,23,42,0.78)", padding: 12, textAlign: "center", fontSize: 13, fontWeight: 900 }}>
                    Centra il Barcode / QR nel riquadro
                  </div>
                </div>
              </div>
              <button type="button" onClick={resetReader} style={{ borderRadius: 16, border: "1px solid rgba(255,255,255,0.16)", background: "rgba(255,255,255,0.10)", padding: "13px 16px", color: "#fff", fontSize: 14, fontWeight: 900 }}>
                Chiudi camera
              </button>
            </div>
          )}

          {(status === "scanning_nfc" || status === "resolving" || status === "sending") && (
            <div style={{ borderRadius: 18, border: "1px solid rgba(2,132,199,0.18)", background: "rgba(2,132,199,0.06)", padding: 24, textAlign: "center" }}>
              <div style={{ margin: "0 auto 16px", display: "flex", width: 76, height: 76, alignItems: "center", justifyContent: "center", borderRadius: 999, background: "rgba(2,132,199,0.10)" }}>
                <div style={{ width: 46, height: 46, borderRadius: 999, border: "4px solid #0284c7", borderTopColor: "transparent", animation: "spin 1s linear infinite" }} />
              </div>
              <div style={{ fontSize: 18, fontWeight: 950, color: "#0f172a" }}>
                {status === "sending" ? "Invio al PC..." : status === "resolving" ? "Ricerca materiale..." : "Lettura NFC attiva"}
              </div>
              <div style={{ marginTop: 8, fontSize: 14, color: "#475569" }}>{msg}</div>
              {status === "scanning_nfc" ? (
                <button type="button" onClick={cancelActiveScan} style={{ marginTop: 18, borderRadius: 14, border: "1px solid rgba(15,23,42,0.12)", background: "#fff", padding: "13px 16px", color: "#0f172a", fontSize: 14, fontWeight: 900 }}>
                  Annulla e scegli altro lettore
                </button>
              ) : null}
            </div>
          )}

          {status === "material" && resolved && (
            <div style={{ display: "grid", gap: 14 }}>
              <div style={{ borderRadius: 18, border: "1px solid rgba(15,23,42,0.10)", background: "#f8fafc", padding: 15, boxSizing: "border-box", minWidth: 0 }}>
                <div style={{ fontSize: 11, fontWeight: 900, letterSpacing: "0.12em", textTransform: "uppercase", color: "#64748b" }}>Materiale letto</div>
                <div style={{ marginTop: 8, fontSize: 23, lineHeight: 1.08, fontWeight: 950, color: "#0f172a", overflowWrap: "anywhere", wordBreak: "break-word" }}>{resolved.item.code}</div>
                <div style={{ marginTop: 8, fontSize: 14, lineHeight: 1.35, color: "#334155" }}>{resolved.item.name}</div>
                <div style={{ marginTop: 8, fontSize: 12, color: "#64748b" }}>UM: {resolved.item.um ?? "-"}</div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                {resolved.warehouses.map((row) => {
                  const active = selectedWarehouse === row.warehouse;
                  const disabled = row.qtyFree <= 0;
                  const place = [row.shelf, row.place].filter(Boolean).join(" · ");
                  return (
                    <button
                      key={row.warehouse}
                      type="button"
                      disabled={disabled}
                      onClick={() => setSelectedWarehouse(row.warehouse)}
                      style={{
                        borderRadius: 18,
                        border: active ? "1px solid rgba(16,185,129,0.55)" : "1px solid rgba(15,23,42,0.10)",
                        background: active ? "rgba(16,185,129,0.12)" : "#f8fafc",
                        padding: 12,
                        textAlign: "left",
                        color: "#0f172a",
                        opacity: disabled ? 0.45 : 1,
                        minWidth: 0,
                      }}
                    >
                      <div style={{ fontSize: 13, fontWeight: 950 }}>{row.warehouse}</div>
                      <div style={{ marginTop: 5, fontSize: 26, lineHeight: 1, fontWeight: 950 }}>{row.qtyFree}</div>
                      <div style={{ marginTop: 7, minHeight: 34, fontSize: 11, lineHeight: 1.3, color: "#64748b" }}>{place || "Posizione non assegnata"}</div>
                    </button>
                  );
                })}
              </div>

              <div>
                <label style={{ display: "block", marginBottom: 8, fontSize: 14, fontWeight: 900, color: "#0f172a" }} htmlFor="pickupQty">Quantità da prelevare</label>
                <input
                  id="pickupQty"
                  style={{ width: "100%", borderRadius: 18, border: "1px solid rgba(255,255,255,0.14)", background: "#fff", padding: "14px 16px", fontSize: 28, fontWeight: 950, color: "#0f172a", outline: "none", boxSizing: "border-box" }}
                  value={qty}
                  onChange={(event) => {
                    setQty(event.target.value);
                    setMsg("");
                  }}
                  inputMode="decimal"
                  autoFocus
                />
                {selectedStock ? (
                  <div style={{ marginTop: 8, fontSize: 12, color: "#64748b" }}>Disponibile in {selectedWarehouse}: {selectedStock.qtyFree}</div>
                ) : null}
                {msg ? <div style={{ marginTop: 8, fontSize: 13, fontWeight: 900, color: "#b91c1c" }}>{msg}</div> : null}
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1.35fr", gap: 10 }}>
                <button type="button" onClick={resetReader} style={{ borderRadius: 18, border: "1px solid rgba(15,23,42,0.12)", background: "#fff", padding: "15px 12px", color: "#0f172a", fontSize: 13, fontWeight: 950 }}>
                  Annulla
                </button>
                <button type="button" onClick={() => void sendPickToPc()} style={{ borderRadius: 18, border: "none", background: "#34d399", padding: "15px 12px", color: "#0f172a", fontSize: 13, fontWeight: 950 }}>
                  Aggiungi al prelievo
                </button>
              </div>
            </div>
          )}

          {status === "success" && (
            <div style={{ borderRadius: 18, border: "1px solid rgba(16,185,129,0.24)", background: "rgba(16,185,129,0.10)", padding: 24, textAlign: "center" }}>
              <div style={{ margin: "0 auto 12px", display: "flex", width: 64, height: 64, alignItems: "center", justifyContent: "center", borderRadius: 999, background: "#34d399", color: "#0f172a", fontSize: 32, fontWeight: 950 }}>✓</div>
              <p style={{ margin: 0, fontSize: 18, fontWeight: 950, color: "#065f46" }}>{msg}</p>
              <p style={{ margin: "8px 0 0", fontSize: 14, color: "#475569" }}>Pronto per il prossimo materiale.</p>
            </div>
          )}

          {status === "error" && (
            <div style={{ borderRadius: 18, border: "1px solid rgba(239,68,68,0.24)", background: "rgba(239,68,68,0.08)", padding: 20, textAlign: "center" }}>
              <p style={{ margin: 0, fontSize: 14, fontWeight: 900, color: "#991b1b" }}>{msg}</p>
              <button type="button" onClick={resetReader} style={{ marginTop: 16, borderRadius: 16, border: "none", background: "#0f172a", padding: "12px 20px", color: "#fff", fontSize: 14, fontWeight: 950 }}>
                Riprova
              </button>
            </div>
          )}
        </div>

        <Link href="/materiali" style={{ textAlign: "center", fontSize: 14, fontWeight: 900, color: "#475569", textDecoration: "underline", textUnderlineOffset: 4 }}>
          Torna ai materiali
        </Link>
      </div>
    </div>
  );
}
