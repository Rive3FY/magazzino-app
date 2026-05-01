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

    stopCameraScan();
    setStatus("scanning_nfc");
    setMsg("Avvicina il telefono al tag NFC...");

    try {
      const ndef = new NDEFReader();
      await ndef.scan();
      const nfcTagId = await new Promise<string>((resolve, reject) => {
        const handler = (event: NDEFReadingEvent) => {
          ndef.removeEventListener("reading", handler);
          resolve(event.serialNumber ?? "");
        };
        ndef.addEventListener("reading", handler);
        setTimeout(() => reject(new Error("Timeout: avvicina il telefono al tag entro 30 secondi")), 30000);
      });

      await resolveScanValue(nfcTagId === "unknown" ? "" : nfcTagId, "nfc");
    } catch (error) {
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
    stopCameraScan();
    setResolved(null);
    setMsg("");
    setStatus("idle");
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
    <div className="min-h-[100dvh] bg-slate-950 p-4 text-white">
      <div className="mx-auto flex min-h-[calc(100dvh-2rem)] max-w-md flex-col justify-center gap-4">
        <div className="rounded-[28px] border border-white/10 bg-white/[0.08] p-5 shadow-2xl shadow-black/30 backdrop-blur">
          <div className="mb-4 flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.22em] text-sky-300">Terminale prelievo</p>
              <h1 className="mt-2 text-2xl font-black tracking-tight">Materiali</h1>
              <p className="mt-2 text-sm leading-6 text-slate-300">
                Leggi, scegli quantità e aggiungi al carrello del PC.
              </p>
            </div>
            <div className="rounded-2xl bg-emerald-400/15 px-3 py-2 text-right">
              <div className="text-[10px] font-bold uppercase tracking-widest text-emerald-200">Sessione</div>
              <div className="font-mono text-lg font-black tracking-[0.18em] text-emerald-100">{code}</div>
            </div>
          </div>

          {status === "idle" && (
            <div className="grid gap-3">
              <button type="button" onClick={startCodeScan} className="flex items-center gap-4 rounded-2xl border border-emerald-300/25 bg-emerald-500/15 p-4 text-left transition active:scale-[0.99]">
                <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-400 text-xl font-black text-slate-950">QR</span>
                <span className="min-w-0 flex-1">
                  <span className="block text-lg font-black">Barcode / QR</span>
                  <span className="block text-sm text-slate-300">Apri camera compatta e leggi il codice.</span>
                </span>
                <span className="text-2xl text-emerald-200">›</span>
              </button>
              <button type="button" onClick={startNfcScan} className="flex items-center gap-4 rounded-2xl border border-sky-300/25 bg-sky-500/15 p-4 text-left transition active:scale-[0.99]">
                <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-sky-400 text-xl font-black text-slate-950">NFC</span>
                <span className="min-w-0 flex-1">
                  <span className="block text-lg font-black">Tag NFC</span>
                  <span className="block text-sm text-slate-300">Avvicina il telefono al tag materiale.</span>
                </span>
                <span className="text-2xl text-sky-200">›</span>
              </button>
            </div>
          )}

          {status === "scanning_code" && (
            <div className="grid gap-3">
              <div className="overflow-hidden rounded-[24px] border border-white/10 bg-black shadow-xl">
                <div className="relative mx-auto aspect-[4/5] max-h-[430px] w-full bg-black">
                  <video ref={videoRef} muted playsInline autoPlay className="h-full w-full object-cover" />
                  <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_0,transparent_38%,rgba(2,6,23,0.62)_72%)]" />
                  <div className="pointer-events-none absolute inset-x-8 top-1/2 h-0.5 -translate-y-1/2 bg-emerald-300/90 shadow-[0_0_18px_rgba(52,211,153,0.9)]" />
                  <div className="pointer-events-none absolute inset-10 rounded-3xl border border-white/20">
                    <div className="absolute -left-0.5 -top-0.5 h-12 w-12 rounded-tl-3xl border-l-4 border-t-4 border-emerald-300" />
                    <div className="absolute -right-0.5 -top-0.5 h-12 w-12 rounded-tr-3xl border-r-4 border-t-4 border-emerald-300" />
                    <div className="absolute -bottom-0.5 -left-0.5 h-12 w-12 rounded-bl-3xl border-b-4 border-l-4 border-emerald-300" />
                    <div className="absolute -bottom-0.5 -right-0.5 h-12 w-12 rounded-br-3xl border-b-4 border-r-4 border-emerald-300" />
                  </div>
                  <div className="absolute inset-x-4 bottom-4 rounded-2xl bg-slate-950/75 p-3 text-center text-sm font-bold text-white backdrop-blur">
                    Centra il Barcode / QR nel riquadro
                  </div>
                </div>
              </div>
              <button type="button" onClick={resetReader} className="rounded-2xl border border-white/15 bg-white/10 px-4 py-3 text-sm font-bold text-white">
                Chiudi camera
              </button>
            </div>
          )}

          {(status === "scanning_nfc" || status === "resolving" || status === "sending") && (
            <div className="rounded-[24px] border border-sky-300/20 bg-sky-400/10 p-8 text-center">
              <div className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-sky-400/20">
                <div className="h-12 w-12 animate-spin rounded-full border-4 border-sky-200 border-t-transparent" />
              </div>
              <div className="text-lg font-black">
                {status === "sending" ? "Invio al PC..." : status === "resolving" ? "Ricerca materiale..." : "Lettura NFC attiva"}
              </div>
              <div className="mt-2 text-sm text-slate-300">{msg}</div>
            </div>
          )}

          {status === "material" && resolved && (
            <div className="grid gap-4">
              <div className="rounded-[24px] border border-white/10 bg-white/10 p-4">
                <div className="text-xs font-bold uppercase tracking-widest text-slate-300">Materiale letto</div>
                <div className="mt-2 text-2xl font-black">{resolved.item.code}</div>
                <div className="mt-1 text-sm leading-5 text-slate-300">{resolved.item.name}</div>
                <div className="mt-2 text-xs text-slate-400">UM: {resolved.item.um ?? "-"}</div>
              </div>

              <div className="grid grid-cols-2 gap-3">
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
                      className={`rounded-2xl border p-3 text-left transition ${
                        active ? "border-emerald-300 bg-emerald-400/20" : "border-white/10 bg-white/5"
                      } ${disabled ? "opacity-45" : "active:scale-[0.99]"}`}
                    >
                      <div className="text-sm font-black">{row.warehouse}</div>
                      <div className="mt-1 text-2xl font-black">{row.qtyFree}</div>
                      <div className="mt-1 min-h-8 text-xs text-slate-300">{place || "Posizione non assegnata"}</div>
                    </button>
                  );
                })}
              </div>

              <div>
                <label className="mb-2 block text-sm font-bold text-slate-200" htmlFor="pickupQty">Quantità da prelevare</label>
                <input
                  id="pickupQty"
                  className="w-full rounded-2xl border border-white/10 bg-white px-4 py-4 text-2xl font-black text-slate-950 outline-none"
                  value={qty}
                  onChange={(event) => {
                    setQty(event.target.value);
                    setMsg("");
                  }}
                  inputMode="decimal"
                  autoFocus
                />
                {selectedStock ? (
                  <div className="mt-2 text-xs text-slate-400">Disponibile in {selectedWarehouse}: {selectedStock.qtyFree}</div>
                ) : null}
                {msg ? <div className="mt-2 text-sm font-bold text-red-200">{msg}</div> : null}
              </div>

              <div className="grid grid-cols-[1fr_1.4fr] gap-3">
                <button type="button" onClick={resetReader} className="rounded-2xl border border-white/15 bg-white/10 px-4 py-4 text-sm font-black text-white">
                  Annulla
                </button>
                <button type="button" onClick={() => void sendPickToPc()} className="rounded-2xl bg-emerald-400 px-4 py-4 text-sm font-black text-slate-950">
                  Aggiungi al prelievo
                </button>
              </div>
            </div>
          )}

          {status === "success" && (
            <div className="rounded-[24px] border border-emerald-300/20 bg-emerald-400/10 p-6 text-center">
              <div className="mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-400 text-3xl font-black text-slate-950">✓</div>
              <p className="text-lg font-black text-emerald-100">{msg}</p>
              <p className="mt-2 text-sm text-slate-300">Pronto per il prossimo materiale.</p>
            </div>
          )}

          {status === "error" && (
            <div className="rounded-[24px] border border-red-300/20 bg-red-400/10 p-5 text-center">
              <p className="text-sm font-bold text-red-100">{msg}</p>
              <button type="button" onClick={resetReader} className="mt-4 rounded-2xl bg-white px-5 py-3 text-sm font-black text-slate-950">
                Riprova
              </button>
            </div>
          )}
        </div>

        <Link href="/materiali" className="text-center text-sm font-bold text-slate-400 underline underline-offset-4">
          Torna ai materiali
        </Link>
      </div>
    </div>
  );
}
