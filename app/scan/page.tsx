"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { BrowserMultiFormatReader } from "@zxing/browser";

export default function ScanPage() {
  const router = useRouter();
  const sp = useSearchParams();
  const target = sp.get("target") || "dashboard";

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const readerRef = useRef<BrowserMultiFormatReader | null>(null);

  const [msg, setMsg] = useState<string | null>(null);

  /* ---------- FEEDBACK ---------- */

  function vibrateOnce() {
    try {
      if (navigator.vibrate) navigator.vibrate(60);
    } catch {}
  }

  function beepOnce() {
    try {
      const AudioCtx =
        window.AudioContext || (window as any).webkitAudioContext;
      const ctx = new AudioCtx();

      const oscillator = ctx.createOscillator();
      const gain = ctx.createGain();

      oscillator.type = "sine";
      oscillator.frequency.value = 1000;
      gain.gain.value = 0.05;

      oscillator.connect(gain);
      gain.connect(ctx.destination);

      oscillator.start();
      setTimeout(() => {
        oscillator.stop();
        ctx.close?.();
      }, 80);
    } catch {}
  }

  /* ---------- STOP ---------- */

  function stopCamera() {
    try {
      (readerRef.current as any)?.reset?.();
    } catch {}

    try {
      const v = videoRef.current;
      if (v) {
        const stream = v.srcObject as MediaStream | null;
        if (stream) stream.getTracks().forEach((t) => t.stop());
        v.pause();
        v.srcObject = null;
      }
    } catch {}

    readerRef.current = null;
  }

  /* ---------- START ---------- */

  async function startScan() {
    setMsg(null);

    if (!navigator.mediaDevices?.getUserMedia) {
      setMsg(
        "La fotocamera richiede HTTPS. Da mobile, se accedi via IP (es. 192.168.x.x) non funziona con http://. " +
        "Usa npm run dev:https sul PC, poi accedi da https://TUO_IP:3000 (accetta il certificato)."
      );
      return;
    }

    await new Promise((r) => setTimeout(r, 100));

    let video = videoRef.current;
    for (let i = 0; i < 30 && !video; i++) {
      await new Promise((r) => setTimeout(r, 50));
      video = videoRef.current;
    }
    if (!video) {
      setMsg("Video non disponibile. Riprova.");
      return;
    }

    try {
      readerRef.current = new BrowserMultiFormatReader();

      const result = await readerRef.current.decodeOnceFromVideoDevice(
        undefined,
        video
      );

      const code = String(result?.getText?.() ?? "").trim();
      if (!code) return;

      vibrateOnce();
      beepOnce();

      stopCamera();

      const backTo =
        target === "movimenti" ? "/movimenti" : "/";

      router.replace(
        `${backTo}?code=${encodeURIComponent(code)}`
      );
    } catch (e: any) {
      console.error(e);
      setMsg("Errore camera: " + (e?.message ?? "sconosciuto"));
      stopCamera();
    }
  }

  /* ---------- AUTO START ---------- */

  useEffect(() => {
    startScan();

    return () => {
      stopCamera();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ---------- UI ---------- */

  return (
    <main className="panel">
      <div className="pageBar">
        <div className="pageBarTitle">Scansione barcode</div>
        <div className="pageBarActions">
          <button className="btn" onClick={() => router.back()}>
            Indietro
          </button>
        </div>
      </div>

      <div className="card" style={{ padding: 12, marginTop: 12 }}>
        <video
          ref={videoRef}
          style={{
            width: "100%",
            borderRadius: 12,
            background: "black",
          }}
          muted
          playsInline
        />

        <div style={{ fontSize: 12, marginTop: 6, opacity: 0.9 }}>
          Inquadra il codice a barre.
        </div>

        {msg && (
          <div style={{ marginTop: 10, fontWeight: 800 }}>
            {msg}
          </div>
        )}
      </div>
    </main>
  );
}