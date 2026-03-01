"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { BrowserMultiFormatReader } from "@zxing/browser";

export default function ScanPage() {
  const router = useRouter();
  const sp = useSearchParams();
  const target = sp.get("target") || "dashboard"; // "dashboard" | "movimenti"

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const readerRef = useRef<BrowserMultiFormatReader | null>(null);
  const lockedRef = useRef(false);

  const [msg, setMsg] = useState<string | null>(null);
  const [started, setStarted] = useState(false);

  function vibrate() {
    try {
      if (navigator.vibrate) navigator.vibrate(80);
    } catch {}
  }

  function beep() {
    // beep corto; su iOS funziona solo dopo gesto utente (tasto "Avvia")
    try {
      const AudioCtx = (window.AudioContext || (window as any).webkitAudioContext);
      const ctx = new AudioCtx();
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = "sine";
      o.frequency.value = 980;
      g.gain.value = 0.08;
      o.connect(g);
      g.connect(ctx.destination);
      o.start();
      setTimeout(() => {
        o.stop();
        ctx.close?.();
      }, 90);
    } catch {
      // se l'audio è bloccato, ignoriamo
    }
  }

  async function tryFullscreen() {
    // iOS Safari non sempre supporta fullscreen vero, ma tentiamo.
    try {
      if (document.fullscreenElement) return;
      const el: any = document.documentElement;
      await el.requestFullscreen?.();
    } catch {}
  }

  function stopAll() {
    // stop decoder
    try {
      (readerRef.current as any)?.reset?.();
    } catch {}
    try {
      (readerRef.current as any)?.stopContinuousDecode?.();
    } catch {}

    // stop camera stream
    try {
      const v = videoRef.current;
      if (v) {
        const stream = v.srcObject as MediaStream | null;
        if (stream) stream.getTracks().forEach((t) => t.stop());
        v.pause();
        v.srcObject = null;
        v.removeAttribute("src");
        // @ts-ignore
        v.load?.();
      }
    } catch {}

    readerRef.current = null;
    lockedRef.current = false;
    setStarted(false);
  }

  async function start() {
    setMsg(null);
    lockedRef.current = false;

    // iOS: gesto utente -> abilita camera/audio e proviamo fullscreen
    await tryFullscreen();

    setStarted(true);

    // aspetta che il <video> sia renderizzato
    await new Promise((r) => setTimeout(r, 200));

    const video = videoRef.current;
    if (!video) {
      setMsg("Video non disponibile");
      setStarted(false);
      return;
    }

    try {
      readerRef.current = new BrowserMultiFormatReader();

      // evita frame "vecchi" / buffer su iOS
      const ignoreUntil = Date.now() + 650;

      await readerRef.current.decodeFromVideoDevice(undefined, video, async (result) => {
        if (!result) return;
        if (Date.now() < ignoreUntil) return;
        if (lockedRef.current) return;

        const code = String((result as any).getText?.() ?? "").trim();
        if (!code) return;

        lockedRef.current = true;

        // feedback
        vibrate();
        beep();

        stopAll();

        const backTo = target === "movimenti" ? "/movimenti" : "/";
        router.replace(`${backTo}?code=${encodeURIComponent(code)}`);
      });
    } catch (e: any) {
      console.error(e);
      setMsg("Errore camera/scansione: " + (e?.message ?? "sconosciuto"));
      stopAll();
    }
  }

  useEffect(() => {
    return () => {
      stopAll();
      try {
        if (document.fullscreenElement) document.exitFullscreen?.();
      } catch {}
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <main className="panel">
      <div className="pageBar">
        <div className="pageBarTitle">Scansione barcode</div>
        <div className="pageBarActions">
          <button className="btn" type="button" onClick={() => router.back()}>
            Indietro
          </button>
        </div>
      </div>

      <div className="card" style={{ padding: 12, marginTop: 12 }}>
        {!started ? (
          <>
            <div style={{ fontWeight: 900, marginBottom: 6 }}>Pronto a scansionare</div>
            <div style={{ opacity: 0.85, fontSize: 12, marginBottom: 10 }}>
              Premi “Avvia” (su iPhone serve il tap per abilitare fotocamera e audio).
            </div>

            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <button className="btn btnPrimary" type="button" onClick={start}>
                ▶️ Avvia scansione
              </button>
              <button className="btn" type="button" onClick={stopAll}>
                Reset
              </button>
            </div>
          </>
        ) : (
          <>
            <video
              ref={videoRef}
              style={{ width: "100%", borderRadius: 12, background: "black" }}
              muted
              playsInline
            />
            <div style={{ fontSize: 12, marginTop: 6, opacity: 0.9 }}>
              Inquadra il codice a barre con la fotocamera.
            </div>

            <div style={{ display: "flex", gap: 10, marginTop: 10, flexWrap: "wrap" }}>
              <button className="btn" type="button" onClick={stopAll}>
                ⏹ Ferma
              </button>
              <button
                className="btn"
                type="button"
                onClick={async () => {
                  stopAll();
                  await start();
                }}
              >
                🔄 Riavvia
              </button>
            </div>
          </>
        )}

        {msg && <div style={{ marginTop: 10, fontWeight: 800 }}>{msg}</div>}
      </div>
    </main>
  );
}