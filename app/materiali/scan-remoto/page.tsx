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
      readerRef.current = new BrowserMultiFormatReader();
      const result = await readerRef.current.decodeOnceFromVideoDevice(undefined, videoEl);
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
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-6 p-6">
      <h1 className="text-xl font-semibold text-slate-800">Scansione remota materiali</h1>
      <p className="text-center text-slate-600">
        Usa il telefono come lettore NFC, Barcode o QR. Il risultato verrà inviato al PC.
      </p>
      <p className="text-center text-sm text-slate-500">Codice sessione:</p>
      <div className="rounded-lg bg-slate-100 px-6 py-3 font-mono text-2xl font-bold tracking-wider text-slate-800">
        {code}
      </div>

      {status === "idle" && (
        <div className="flex flex-col items-center gap-3 sm:flex-row">
          <button
            type="button"
            onClick={startNfcScan}
            className="rounded-lg bg-sky-600 px-6 py-3 font-medium text-white hover:bg-sky-700 disabled:opacity-50"
          >
            Leggi NFC
          </button>
          <button
            type="button"
            onClick={startCodeScan}
            className="rounded-lg bg-slate-800 px-6 py-3 font-medium text-white hover:bg-slate-900 disabled:opacity-50"
          >
            Leggi Barcode / QR
          </button>
        </div>
      )}

      {(status === "scanning_nfc" || status === "scanning_code" || status === "sending") && (
        <div className="flex flex-col items-center gap-2">
          {status === "scanning_code" ? (
            <video
              ref={videoRef}
              muted
              playsInline
              autoPlay
              className="w-full max-w-sm rounded-xl border border-slate-200 bg-black"
            />
          ) : (
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-sky-600 border-t-transparent" />
          )}
          <p className="text-sm text-slate-600">{msg}</p>
          {status === "scanning_code" && (
            <button
              type="button"
              onClick={() => {
                stopCameraScan();
                setStatus("idle");
                setMsg("");
              }}
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-700"
            >
              Chiudi camera
            </button>
          )}
        </div>
      )}

      {status === "success" && (
        <div className="flex flex-col items-center gap-3">
          <p className="font-medium text-green-600">{msg}</p>
          <p className="text-center text-xs text-slate-500">Puoi tornare al PC o avviare una nuova scansione.</p>
        </div>
      )}

      {status === "error" && (
        <div className="flex flex-col items-center gap-3">
          <p className="text-center text-red-600">{msg}</p>
          <button
            type="button"
            onClick={() => {
              stopCameraScan();
              setStatus("idle");
              setMsg("");
            }}
            className="rounded-lg bg-sky-600 px-4 py-2 text-sm text-white hover:bg-sky-700"
          >
            Riprova
          </button>
        </div>
      )}

      <Link href="/materiali" className="text-sm text-slate-500 underline">
        Torna ai materiali
      </Link>
    </div>
  );
}
