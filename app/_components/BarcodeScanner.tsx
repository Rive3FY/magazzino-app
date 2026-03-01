"use client";

import { useEffect, useRef, useState } from "react";
import { BrowserMultiFormatReader } from "@zxing/browser";

type Props = {
  onDetected: (code: string) => Promise<void> | void;
  onError?: (message: string) => void;
};

export default function BarcodeScanner({ onDetected, onError }: Props) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const readerRef = useRef<BrowserMultiFormatReader | null>(null);

  const [scanning, setScanning] = useState(false);

  // blocchi anti doppia lettura / ultimo risultato
  const scanLockedRef = useRef(false);
  const lastScanRef = useRef<{ code: string; ts: number } | null>(null);

  function hardStopCamera() {
    // 1) ferma decoder
    try {
      (readerRef.current as any)?.reset?.();
    } catch {}
    try {
      (readerRef.current as any)?.stopContinuousDecode?.();
    } catch {}
    readerRef.current = null;

    // 2) ferma stream + “hard reset” video (iOS)
    try {
      const v = videoRef.current;
      if (v) {
        const stream = v.srcObject as MediaStream | null;
        if (stream) stream.getTracks().forEach((t) => t.stop());

        v.pause();
        v.srcObject = null;

        // IMPORTANTISSIMO su iOS: forza il rilascio
        try {
          v.removeAttribute("src");
          // @ts-ignore
          v.load?.();
        } catch {}
      }
    } catch {}

    setScanning(false);
  }

  async function start() {
    // chiudi tutto prima (evita sessioni appese)
    hardStopCamera();

    scanLockedRef.current = false;
    lastScanRef.current = null;

    setScanning(true);

    // aspetta render video
    await new Promise((r) => setTimeout(r, 200));

    try {
      const v = videoRef.current;
      if (!v) throw new Error("Video non disponibile");

      // reader sempre nuovo
      readerRef.current = new BrowserMultiFormatReader();

      // ignora primi frame (stale)
      const ignoreUntil = Date.now() + 700;

      await readerRef.current.decodeFromVideoDevice(undefined, v, async (result) => {
        if (!result) return;

        if (Date.now() < ignoreUntil) return;
        if (scanLockedRef.current) return;

        const text = String(result.getText?.() ?? "").trim();
        if (!text) return;

        // evita stesso codice immediato
        const prev = lastScanRef.current;
        const now = Date.now();
        if (prev && prev.code === text && now - prev.ts < 1500) return;
        lastScanRef.current = { code: text, ts: now };

        scanLockedRef.current = true;

        // chiudi camera e passa il codice
        hardStopCamera();
        await onDetected(text);
      });
    } catch (e: any) {
      const m = e?.message ?? String(e);
      onError?.(m);
      hardStopCamera();
    }
  }

  // pulizia se smonti componente
  useEffect(() => {
    return () => hardStopCamera();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <button className="btn" onClick={() => (scanning ? hardStopCamera() : start())} type="button">
          {scanning ? "⏹ Ferma scansione" : "📷 Scansiona barcode"}
        </button>

        <button
          className="btn"
          type="button"
          onClick={() => {
            hardStopCamera();
            scanLockedRef.current = false;
            lastScanRef.current = null;
          }}
        >
          Reset scanner
        </button>
      </div>

      {scanning && (
        <div style={{ marginTop: 12 }}>
          <video
            ref={videoRef}
            style={{ width: "100%", borderRadius: 12, background: "black" }}
            muted
            playsInline
          />
          <div style={{ fontSize: 12, marginTop: 6, opacity: 0.9 }}>
            Inquadra il codice a barre con la fotocamera.
          </div>
        </div>
      )}
    </div>
  );
}