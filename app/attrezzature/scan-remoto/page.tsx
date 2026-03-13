"use client";

import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../../_lib/hooks/useAuth";
import Link from "next/link";

export default function ScanRemotoPage() {
  const searchParams = useSearchParams();
  const code = searchParams.get("code")?.trim() ?? "";
  const { user, loading: authLoading } = useAuth();

  const [status, setStatus] = useState<"idle" | "scanning" | "sending" | "success" | "error">("idle");
  const [msg, setMsg] = useState<string>("");
  const [isNfcSupported, setIsNfcSupported] = useState(false);
  const [isIOS, setIsIOS] = useState(false);

  useEffect(() => {
    setIsNfcSupported(typeof NDEFReader !== "undefined");
    setIsIOS(/iPad|iPhone|iPod/.test(navigator.userAgent));
  }, []);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      const returnTo = `/attrezzature/scan-remoto${code ? `?code=${encodeURIComponent(code)}` : ""}`;
      window.location.href = `/login?redirect=${encodeURIComponent(returnTo)}`;
      return;
    }
  }, [user, authLoading, code]);

  const startScan = useCallback(async () => {
    if (!code) {
      setStatus("error");
      setMsg("Codice sessione mancante. Inquadra il QR dal PC.");
      return;
    }
    if (!isNfcSupported) {
      setStatus("error");
      setMsg(isIOS ? "NFC non disponibile su iPhone/iPad." : "NFC richiede Chrome su Android con HTTPS.");
      return;
    }

    setStatus("scanning");
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

      if (!nfcTagId || nfcTagId === "unknown") {
        setStatus("error");
        setMsg("Impossibile leggere l'ID del tag. Riprova.");
        return;
      }

      setStatus("sending");
      setMsg("Invio in corso...");

      const res = await fetch("/api/attrezzature/remote-nfc-submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, nfcTagId }),
      });

      const json = await res.json().catch(() => ({}));

      if (!res.ok) {
        setStatus("error");
        setMsg(json.error ?? "Errore invio. Riprova.");
        return;
      }

      setStatus("success");
      setMsg("Tag inviato al PC ✅");
      // Multi-scan: dopo 1.5s riavvia automaticamente la scansione per il prossimo tag
      setTimeout(() => {
        setMsg("");
        void startScan();
      }, 1500);
    } catch (error) {
      setStatus("error");
      setMsg(error instanceof Error ? error.message : "Errore lettura NFC");
    }
  }, [code, isNfcSupported, isIOS]);

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
        <h1 className="text-xl font-semibold text-slate-800">Scansione remota NFC</h1>
        <p className="text-center text-slate-600">
          Codice sessione mancante. Apri questa pagina inquadrando il QR code mostrato sul PC.
        </p>
        <Link href="/attrezzature" className="text-sky-600 underline">
          Torna alle attrezzature
        </Link>
      </div>
    );
  }

  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-6 p-6">
      <h1 className="text-xl font-semibold text-slate-800">Scansione remota NFC</h1>
        <p className="text-center text-slate-600">
        Usa il telefono come lettore NFC. Inquadra il QR una sola volta, poi scansiona tutti i tag che vuoi.
      </p>
      <p className="text-center text-sm text-slate-500">
        Codice sessione:
      </p>
      <div className="rounded-lg bg-slate-100 px-6 py-3 font-mono text-2xl font-bold tracking-wider text-slate-800">
        {code}
      </div>

      {status === "idle" && (
        <button
          type="button"
          onClick={startScan}
          className="rounded-lg bg-sky-600 px-6 py-3 font-medium text-white hover:bg-sky-700 disabled:opacity-50"
        >
          Avvia scansione NFC
        </button>
      )}

      {(status === "scanning" || status === "sending") && (
        <div className="flex flex-col items-center gap-2">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-sky-600 border-t-transparent" />
          <p className="text-sm text-slate-600">{msg}</p>
        </div>
      )}

      {status === "success" && (
        <div className="flex flex-col items-center gap-3">
          <p className="text-green-600 font-medium">{msg}</p>
          <p className="text-center text-xs text-slate-500">
            Torna pronto per il prossimo tag...
          </p>
        </div>
      )}

      {status === "error" && (
        <div className="flex flex-col items-center gap-3">
          <p className="text-center text-red-600">{msg}</p>
          <button
            type="button"
            onClick={() => {
              setStatus("idle");
              setMsg("");
              void startScan();
            }}
            className="rounded-lg bg-sky-600 px-4 py-2 text-sm text-white hover:bg-sky-700"
          >
            Riprova
          </button>
        </div>
      )}

      <Link href="/attrezzature" className="text-sm text-slate-500 underline">
        Torna alle attrezzature
      </Link>
    </div>
  );
}
