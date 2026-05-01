"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
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

export default function MaterialiScanRemotoPage() {
  const searchParams = useSearchParams();
  const code = searchParams.get("code")?.trim() ?? "";
  const { user, loading: authLoading } = useAuth();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const readerRef = useRef<BrowserMultiFormatReader | null>(null);

  const [status, setStatus] = useState<"idle" | "scanning_nfc" | "scanning_code" | "sending" | "success" | "error">("idle");
  const [msg, setMsg] = useState<string>("");

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

  const sendScanValue = useCallback(async (scanValue: string, label: string) => {
    const value = scanValue.trim();
    if (!value) {
      setStatus("error");
      setMsg(`${label} non leggibile. Riprova.`);
      return;
    }

    setStatus("sending");
    setMsg("Invio in corso...");

    const res = await fetch("/api/attrezzature/remote-nfc-submit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code, nfcTagId: value }),
    });

    const json = await res.json().catch(() => ({}));

    if (!res.ok) {
      setStatus("error");
      setMsg(json.error ?? "Errore invio. Riprova.");
      return;
    }

    setStatus("success");
    setMsg(`${label} inviato al PC`);
    setTimeout(() => {
      setMsg("");
      setStatus("idle");
    }, 1500);
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

      await sendScanValue(nfcTagId === "unknown" ? "" : nfcTagId, "Tag NFC");
    } catch (error) {
      setStatus("error");
      setMsg(error instanceof Error ? error.message : "Errore lettura NFC");
    }
  }, [code, sendScanValue, stopCameraScan]);

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

      if (NativeDetector) {
        const detector = new NativeDetector({
          formats: ["qr_code", "ean_13", "ean_8", "code_128", "code_39", "codabar", "upc_a", "upc_e"],
        });
        const startedAt = Date.now();

        while (Date.now() - startedAt < 30000) {
          const detections = await detector.detect(videoEl);
          const rawValue = String(detections?.[0]?.rawValue ?? "").trim();
          if (rawValue) {
            stopCameraScan();
            await sendScanValue(rawValue, "Barcode / QR");
            return;
          }
          await new Promise((resolve) => setTimeout(resolve, 100));
        }

        throw new Error("Timeout: nessun Barcode/QR rilevato entro 30 secondi");
      }

      readerRef.current = new BrowserMultiFormatReader();
      const result = await readerRef.current.decodeOnceFromConstraints(
        {
          audio: false,
          video: {
            facingMode: { ideal: "environment" },
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
        },
        videoEl
      );
      stopCameraScan();
      const text = String(result?.getText?.() ?? "").trim();
      await sendScanValue(text, "Barcode / QR");
    } catch (error) {
      stopCameraScan();
      setStatus("error");
      setMsg(error instanceof Error ? error.message : "Errore camera/scansione");
    }
  }, [code, sendScanValue, stopCameraScan]);

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
        <h1 className="text-xl font-semibold text-slate-800">Scansione remota materiali</h1>
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
      <div className="mx-auto flex min-h-[calc(100dvh-2rem)] max-w-md flex-col justify-center gap-5">
        <div className="rounded-[28px] border border-white/10 bg-white/[0.08] p-5 shadow-2xl shadow-black/30 backdrop-blur">
          <div className="mb-4 flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.22em] text-sky-300">Lettore remoto</p>
              <h1 className="mt-2 text-2xl font-black tracking-tight">Materiali</h1>
              <p className="mt-2 text-sm leading-6 text-slate-300">
                Scegli come leggere il materiale. Il risultato viene inviato subito al PC.
              </p>
            </div>
            <div className="rounded-2xl bg-emerald-400/15 px-3 py-2 text-right">
              <div className="text-[10px] font-bold uppercase tracking-widest text-emerald-200">Sessione</div>
              <div className="font-mono text-lg font-black tracking-[0.18em] text-emerald-100">{code}</div>
            </div>
          </div>

          {status === "idle" && (
            <div className="grid gap-3">
              <button
                type="button"
                onClick={startNfcScan}
                className="group flex items-center gap-4 rounded-2xl border border-sky-300/25 bg-sky-500/15 p-4 text-left transition active:scale-[0.99]"
              >
                <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-sky-400 text-xl font-black text-slate-950">
                  NFC
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-lg font-black">Leggi tag NFC</span>
                  <span className="block text-sm text-slate-300">Avvicina il telefono al tag materiale.</span>
                </span>
                <span className="text-2xl text-sky-200">›</span>
              </button>
              <button
                type="button"
                onClick={startCodeScan}
                className="group flex items-center gap-4 rounded-2xl border border-emerald-300/25 bg-emerald-500/15 p-4 text-left transition active:scale-[0.99]"
              >
                <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-400 text-xl font-black text-slate-950">
                  QR
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-lg font-black">Leggi Barcode / QR</span>
                  <span className="block text-sm text-slate-300">Inquadra il codice con la camera.</span>
                </span>
                <span className="text-2xl text-emerald-200">›</span>
              </button>
            </div>
          )}

          {(status === "scanning_nfc" || status === "scanning_code" || status === "sending") && (
            <div className="grid gap-4">
              {status === "scanning_code" ? (
                <div className="overflow-hidden rounded-[24px] border border-white/10 bg-black shadow-xl">
                  <div className="relative aspect-[3/4] max-h-[62vh] w-full bg-black">
                    <video
                      ref={videoRef}
                      muted
                      playsInline
                      autoPlay
                      className="h-full w-full object-cover"
                    />
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
              ) : (
                <div className="rounded-[24px] border border-sky-300/20 bg-sky-400/10 p-8 text-center">
                  <div className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-sky-400/20">
                    <div className="h-12 w-12 animate-spin rounded-full border-4 border-sky-200 border-t-transparent" />
                  </div>
                  <div className="text-lg font-black">{status === "sending" ? "Invio al PC..." : "Lettura NFC attiva"}</div>
                  <div className="mt-2 text-sm text-slate-300">{msg}</div>
                </div>
              )}
              {status === "scanning_code" && (
                <button
                  type="button"
                  onClick={() => {
                    stopCameraScan();
                    setStatus("idle");
                    setMsg("");
                  }}
                  className="rounded-2xl border border-white/15 bg-white/10 px-4 py-3 text-sm font-bold text-white"
                >
                  Chiudi camera
                </button>
              )}
            </div>
          )}

          {status === "success" && (
            <div className="rounded-[24px] border border-emerald-300/20 bg-emerald-400/10 p-6 text-center">
              <div className="mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-400 text-3xl font-black text-slate-950">
                ✓
              </div>
              <p className="text-lg font-black text-emerald-100">{msg}</p>
              <p className="mt-2 text-sm text-slate-300">Puoi tornare al PC o avviare una nuova scansione.</p>
            </div>
          )}

          {status === "error" && (
            <div className="rounded-[24px] border border-red-300/20 bg-red-400/10 p-5 text-center">
              <p className="text-sm font-bold text-red-100">{msg}</p>
              <button
                type="button"
                onClick={() => {
                  stopCameraScan();
                  setStatus("idle");
                  setMsg("");
                }}
                className="mt-4 rounded-2xl bg-white px-5 py-3 text-sm font-black text-slate-950"
              >
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
