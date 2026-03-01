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

  function stopAll() {
    try {
      (readerRef.current as any)?.reset?.();
    } catch {}
    try {
      (readerRef.current as any)?.stopContinuousDecode?.();
    } catch {}

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
  }

  useEffect(() => {
    let alive = true;

    (async () => {
      setMsg(null);
      lockedRef.current = false;

      // aspetta render del video
      await new Promise((r) => setTimeout(r, 250));
      if (!alive) return;

      const video = videoRef.current;
      if (!video) {
        setMsg("Video non disponibile");
        return;
      }

      try {
        readerRef.current = new BrowserMultiFormatReader();

        // iOS: ignora i primi frame (buffer vecchi)
        const ignoreUntil = Date.now() + 700;

        await readerRef.current.decodeFromVideoDevice(undefined, video, async (result) => {
          if (!result) return;
          if (Date.now() < ignoreUntil) return;
          if (lockedRef.current) return;

          const code = String((result as any).getText?.() ?? "").trim();
          if (!code) return;

          lockedRef.current = true;
          stopAll();

          const backTo = target === "movimenti" ? "/movimenti" : "/";
          router.replace(`${backTo}?code=${encodeURIComponent(code)}`);
        });
      } catch (e: any) {
        console.error(e);
        setMsg("Errore camera/scansione: " + (e?.message ?? "sconosciuto"));
        stopAll();
      }
    })();

    return () => {
      alive = false;
      stopAll();
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
        <video
          ref={videoRef}
          style={{ width: "100%", borderRadius: 12, background: "black" }}
          muted
          playsInline
        />
        <div style={{ fontSize: 12, marginTop: 6, opacity: 0.9 }}>
          Inquadra il codice a barre con la fotocamera.
        </div>
        {msg && <div style={{ marginTop: 10, fontWeight: 800 }}>{msg}</div>}
      </div>
    </main>
  );
}