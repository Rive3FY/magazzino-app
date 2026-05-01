"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BrowserMultiFormatReader } from "@zxing/browser";
import { useAuth } from "../../_lib/hooks/useAuth";

type ScannerControls = {
  reset?: () => void;
  stopContinuousDecode?: () => void;
};

type NativeBarcodeDetection = {
  rawValue?: string;
};

type NativeBarcodeDetector = {
  detect: (source: ImageBitmapSource) => Promise<NativeBarcodeDetection[]>;
};

type NativeBarcodeDetectorCtor = new (options?: { formats?: string[] }) => NativeBarcodeDetector;

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
  const { user, loading: authLoading } = useAuth();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const readerRef = useRef<BrowserMultiFormatReader | null>(null);
  const nfcAbortRef = useRef<AbortController | null>(null);
  const scanTokenRef = useRef(0);

  const [status, setStatus] = useState<Status>("idle");
  const [msg, setMsg] = useState<string>("");
  const [resolved, setResolved] = useState<ResolvedMaterial | null>(null);
  const [selectedWarehouse, setSelectedWarehouse] = useState<Warehouse>("PRM");
  const [qty, setQty] = useState("1");

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      const returnTo = `/materiali/scan-remoto${code ? `?code=${encodeURIComponent(code)}` : ""}`;
      window.location.href = `/login?redirect=${encodeURIComponent(returnTo)}`;
    }
  }, [user, authLoading, code]);

  const stopCameraScan = useCallback(() => {
    try {
      (readerRef.current as ScannerControls | null)?.reset?.();
    } catch {}
    try {
      (readerRef.current as ScannerControls | null)?.stopContinuousDecode?.();
    } catch {}
    try {
      const stream = videoRef.current?.srcObject as MediaStream | null;
      if (stream) stream.getTracks().forEach((track) => track.stop());
      if (videoRef.current) videoRef.current.srcObject = null;
    } catch {}
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
      body: JSON.stringify({ rawValue: value, source }),
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
  }, []);

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
      const NativeDetector = (window as unknown as { BarcodeDetector?: NativeBarcodeDetectorCtor }).BarcodeDetector;
      const videoConstraints: MediaStreamConstraints = {
        audio: false,
        video: {
          facingMode: { ideal: "environment" },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
      };

      if (NativeDetector) {
        const stream = await navigator.mediaDevices.getUserMedia(videoConstraints);
        videoEl.srcObject = stream;
        await videoEl.play();

        for (let i = 0; i < 30 && videoEl.readyState < HTMLMediaElement.HAVE_CURRENT_DATA; i++) {
          await new Promise((resolve) => setTimeout(resolve, 50));
        }

        const detector = new NativeDetector({
          formats: ["qr_code", "ean_13", "ean_8", "code_128", "code_39", "codabar", "upc_a", "upc_e"],
        });
        const startedAt = Date.now();

        while (Date.now() - startedAt < 30000) {
          if (videoEl.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
            await new Promise((resolve) => setTimeout(resolve, 100));
            continue;
          }

          let detections: NativeBarcodeDetection[] = [];
          try {
            detections = await detector.detect(videoEl);
          } catch {
            await new Promise((resolve) => setTimeout(resolve, 100));
            continue;
          }

          const rawValue = String(detections?.[0]?.rawValue ?? "").trim();
          if (rawValue) {
            stopCameraScan();
            await resolveScanValue(rawValue, "barcode");
            return;
          }
          await new Promise((resolve) => setTimeout(resolve, 100));
        }

        throw new Error("Timeout: nessun Barcode/QR rilevato entro 30 secondi");
      }

      readerRef.current = new BrowserMultiFormatReader();
      const result = await readerRef.current.decodeOnceFromConstraints(videoConstraints, videoEl);
      stopCameraScan();
      const text = String(result?.getText?.() ?? "").trim();
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
    <div style={{ minHeight: "calc(100dvh - 120px)", background: "#0f172a", padding: 14, color: "#fff" }}>
      <div style={{ maxWidth: 460, margin: "0 auto", display: "grid", gap: 14 }}>
        <div
          style={{
            borderRadius: 26,
            border: "1px solid rgba(255,255,255,0.12)",
            background: "linear-gradient(180deg, rgba(30,41,59,0.96), rgba(15,23,42,0.98))",
            padding: 18,
            boxShadow: "0 18px 50px rgba(0,0,0,0.28)",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start", marginBottom: 18 }}>
            <div>
              <p style={{ margin: 0, fontSize: 11, fontWeight: 900, letterSpacing: "0.18em", textTransform: "uppercase", color: "#7dd3fc" }}>Terminale prelievo</p>
              <h1 style={{ margin: "8px 0 0", fontSize: 30, lineHeight: 1, fontWeight: 950 }}>Materiali</h1>
              <p style={{ margin: "10px 0 0", fontSize: 14, lineHeight: 1.45, color: "#cbd5e1" }}>
                Leggi, scegli quantità e aggiungi al carrello del PC.
              </p>
            </div>
            <div style={{ borderRadius: 16, background: "rgba(52,211,153,0.14)", padding: "9px 11px", textAlign: "right", flexShrink: 0 }}>
              <div style={{ fontSize: 10, fontWeight: 900, letterSpacing: "0.12em", textTransform: "uppercase", color: "#a7f3d0" }}>Sessione</div>
              <div style={{ marginTop: 3, fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", fontSize: 18, fontWeight: 950, letterSpacing: "0.12em", color: "#d1fae5" }}>{code}</div>
            </div>
          </div>

          {status === "idle" && (
            <div style={{ display: "grid", gap: 12 }}>
              <button type="button" onClick={startCodeScan} style={{ display: "flex", alignItems: "center", gap: 14, width: "100%", borderRadius: 20, border: "1px solid rgba(52,211,153,0.35)", background: "rgba(16,185,129,0.16)", padding: 14, color: "#fff", textAlign: "left" }}>
                <span style={{ display: "flex", width: 54, height: 54, alignItems: "center", justifyContent: "center", borderRadius: 16, background: "#34d399", color: "#0f172a", fontSize: 20, fontWeight: 950, flexShrink: 0 }}>QR</span>
                <span style={{ display: "block", minWidth: 0, flex: 1 }}>
                  <span style={{ display: "block", fontSize: 18, fontWeight: 950 }}>Barcode / QR</span>
                  <span style={{ display: "block", marginTop: 4, fontSize: 13, lineHeight: 1.35, color: "#cbd5e1" }}>Apri camera compatta e leggi il codice.</span>
                </span>
                <span style={{ fontSize: 28, color: "#a7f3d0" }}>›</span>
              </button>
              <button type="button" onClick={startNfcScan} style={{ display: "flex", alignItems: "center", gap: 14, width: "100%", borderRadius: 20, border: "1px solid rgba(125,211,252,0.35)", background: "rgba(14,165,233,0.16)", padding: 14, color: "#fff", textAlign: "left" }}>
                <span style={{ display: "flex", width: 54, height: 54, alignItems: "center", justifyContent: "center", borderRadius: 16, background: "#38bdf8", color: "#0f172a", fontSize: 18, fontWeight: 950, flexShrink: 0 }}>NFC</span>
                <span style={{ display: "block", minWidth: 0, flex: 1 }}>
                  <span style={{ display: "block", fontSize: 18, fontWeight: 950 }}>Tag NFC</span>
                  <span style={{ display: "block", marginTop: 4, fontSize: 13, lineHeight: 1.35, color: "#cbd5e1" }}>Avvicina il telefono al tag materiale.</span>
                </span>
                <span style={{ fontSize: 28, color: "#bae6fd" }}>›</span>
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
            <div style={{ borderRadius: 22, border: "1px solid rgba(125,211,252,0.22)", background: "rgba(14,165,233,0.12)", padding: 26, textAlign: "center" }}>
              <div style={{ margin: "0 auto 16px", display: "flex", width: 76, height: 76, alignItems: "center", justifyContent: "center", borderRadius: 999, background: "rgba(56,189,248,0.18)" }}>
                <div style={{ width: 46, height: 46, borderRadius: 999, border: "4px solid #bae6fd", borderTopColor: "transparent", animation: "spin 1s linear infinite" }} />
              </div>
              <div style={{ fontSize: 18, fontWeight: 950 }}>
                {status === "sending" ? "Invio al PC..." : status === "resolving" ? "Ricerca materiale..." : "Lettura NFC attiva"}
              </div>
              <div style={{ marginTop: 8, fontSize: 14, color: "#cbd5e1" }}>{msg}</div>
              {status === "scanning_nfc" ? (
                <button type="button" onClick={cancelActiveScan} style={{ marginTop: 18, borderRadius: 16, border: "1px solid rgba(255,255,255,0.16)", background: "rgba(255,255,255,0.10)", padding: "13px 16px", color: "#fff", fontSize: 14, fontWeight: 900 }}>
                  Annulla e scegli altro lettore
                </button>
              ) : null}
            </div>
          )}

          {status === "material" && resolved && (
            <div style={{ display: "grid", gap: 14 }}>
              <div style={{ borderRadius: 22, border: "1px solid rgba(255,255,255,0.12)", background: "rgba(255,255,255,0.10)", padding: 15 }}>
                <div style={{ fontSize: 11, fontWeight: 900, letterSpacing: "0.12em", textTransform: "uppercase", color: "#cbd5e1" }}>Materiale letto</div>
                <div style={{ marginTop: 8, fontSize: 28, lineHeight: 1, fontWeight: 950 }}>{resolved.item.code}</div>
                <div style={{ marginTop: 8, fontSize: 14, lineHeight: 1.35, color: "#cbd5e1" }}>{resolved.item.name}</div>
                <div style={{ marginTop: 8, fontSize: 12, color: "#94a3b8" }}>UM: {resolved.item.um ?? "-"}</div>
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
                        border: active ? "1px solid #6ee7b7" : "1px solid rgba(255,255,255,0.12)",
                        background: active ? "rgba(52,211,153,0.22)" : "rgba(255,255,255,0.06)",
                        padding: 12,
                        textAlign: "left",
                        color: "#fff",
                        opacity: disabled ? 0.45 : 1,
                      }}
                    >
                      <div style={{ fontSize: 13, fontWeight: 950 }}>{row.warehouse}</div>
                      <div style={{ marginTop: 5, fontSize: 26, lineHeight: 1, fontWeight: 950 }}>{row.qtyFree}</div>
                      <div style={{ marginTop: 7, minHeight: 34, fontSize: 11, lineHeight: 1.3, color: "#cbd5e1" }}>{place || "Posizione non assegnata"}</div>
                    </button>
                  );
                })}
              </div>

              <div>
                <label style={{ display: "block", marginBottom: 8, fontSize: 14, fontWeight: 900, color: "#e2e8f0" }} htmlFor="pickupQty">Quantità da prelevare</label>
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
                  <div style={{ marginTop: 8, fontSize: 12, color: "#94a3b8" }}>Disponibile in {selectedWarehouse}: {selectedStock.qtyFree}</div>
                ) : null}
                {msg ? <div style={{ marginTop: 8, fontSize: 13, fontWeight: 900, color: "#fecaca" }}>{msg}</div> : null}
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1.35fr", gap: 10 }}>
                <button type="button" onClick={resetReader} style={{ borderRadius: 18, border: "1px solid rgba(255,255,255,0.16)", background: "rgba(255,255,255,0.10)", padding: "15px 12px", color: "#fff", fontSize: 13, fontWeight: 950 }}>
                  Annulla
                </button>
                <button type="button" onClick={() => void sendPickToPc()} style={{ borderRadius: 18, border: "none", background: "#34d399", padding: "15px 12px", color: "#0f172a", fontSize: 13, fontWeight: 950 }}>
                  Aggiungi al prelievo
                </button>
              </div>
            </div>
          )}

          {status === "success" && (
            <div style={{ borderRadius: 22, border: "1px solid rgba(52,211,153,0.24)", background: "rgba(52,211,153,0.12)", padding: 24, textAlign: "center" }}>
              <div style={{ margin: "0 auto 12px", display: "flex", width: 64, height: 64, alignItems: "center", justifyContent: "center", borderRadius: 999, background: "#34d399", color: "#0f172a", fontSize: 32, fontWeight: 950 }}>✓</div>
              <p style={{ margin: 0, fontSize: 18, fontWeight: 950, color: "#d1fae5" }}>{msg}</p>
              <p style={{ margin: "8px 0 0", fontSize: 14, color: "#cbd5e1" }}>Pronto per il prossimo materiale.</p>
            </div>
          )}

          {status === "error" && (
            <div style={{ borderRadius: 22, border: "1px solid rgba(252,165,165,0.24)", background: "rgba(248,113,113,0.12)", padding: 20, textAlign: "center" }}>
              <p style={{ margin: 0, fontSize: 14, fontWeight: 900, color: "#fee2e2" }}>{msg}</p>
              <button type="button" onClick={resetReader} style={{ marginTop: 16, borderRadius: 16, border: "none", background: "#fff", padding: "12px 20px", color: "#0f172a", fontSize: 14, fontWeight: 950 }}>
                Riprova
              </button>
            </div>
          )}
        </div>

        <Link href="/materiali" style={{ textAlign: "center", fontSize: 14, fontWeight: 900, color: "#94a3b8", textDecoration: "underline", textUnderlineOffset: 4 }}>
          Torna ai materiali
        </Link>
      </div>
    </div>
  );
}
