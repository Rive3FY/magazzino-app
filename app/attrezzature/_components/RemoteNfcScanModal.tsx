"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { QRCodeSVG } from "qrcode.react";

type Props = {
  open: boolean;
  onClose: () => void;
  context: "equipment_associate" | "movement_select";
  equipmentId?: string;
  equipmentIds?: string[];
  area?: string;
  onTagReceived: (nfcTagId: string, context?: { equipmentId?: string }) => void;
  allowMultiple?: boolean;
  title?: string;
};

const POLL_INTERVAL_MS = 1500;

export default function RemoteNfcScanModal({
  open,
  onClose,
  context,
  equipmentId,
  equipmentIds,
  area,
  onTagReceived,
  allowMultiple = false,
  title = "Usa telefono come lettore NFC",
}: Props) {
  const [code, setCode] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [processedCount, setProcessedCount] = useState(0);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const createSession = useCallback(async () => {
    setLoading(true);
    setError(null);
    setProcessedCount(0);
    try {
      const res = await fetch("/api/attrezzature/remote-nfc-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          context,
          equipmentId: equipmentId ?? undefined,
          equipmentIds: equipmentIds ?? undefined,
          area: area ?? undefined,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(json.error ?? "Errore creazione sessione");
        return;
      }
      setCode(json.code);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Errore di rete");
    } finally {
      setLoading(false);
    }
  }, [context, equipmentId, equipmentIds, area]);

  useEffect(() => {
    if (!open) return;
    setCode(null);
    setError(null);
    setProcessedCount(0);
    void createSession();
  }, [open, createSession]);

  useEffect(() => {
    if (!open || !code) return;

    const poll = async () => {
      try {
        const res = await fetch(`/api/attrezzature/remote-nfc-session?code=${encodeURIComponent(code)}`);
        const json = await res.json().catch(() => ({}));
        if (!res.ok) return;

        const ids = (json.nfcTagIds ?? (json.nfcTagId ? [json.nfcTagId] : [])) as string[];
        const newCount = ids.length;

        if (newCount > processedCount) {
          const eqIds = (json.contextData?.equipmentIds ?? []) as string[];
          for (let i = processedCount; i < newCount; i++) {
            const ctx = eqIds[i] ? { equipmentId: eqIds[i] } : undefined;
            onTagReceived(ids[i], ctx);
          }
          setProcessedCount(newCount);

          if (!allowMultiple) {
            if (pollRef.current) {
              clearInterval(pollRef.current);
              pollRef.current = null;
            }
            onClose();
            return;
          }
        }
      } catch {
        // ignore poll errors
      }
    };

    pollRef.current = setInterval(poll, POLL_INTERVAL_MS);
    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, [open, code, processedCount, allowMultiple, onTagReceived, onClose]);

  if (!open) return null;

  const scanUrl = typeof window !== "undefined" && code
    ? `${window.location.origin}/attrezzature/scan-remoto?code=${encodeURIComponent(code)}`
    : "";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="remote-scan-title"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="max-w-sm rounded-xl bg-white p-6 shadow-xl">
        <h2 id="remote-scan-title" className="mb-4 text-lg font-semibold text-slate-800">
          {title}
        </h2>
        <p className="mb-4 text-sm text-slate-600">
          {allowMultiple
            ? "Inquadra il QR una volta, poi scansiona tutti i tag che vuoi. Ogni scansione apparirà sul PC."
            : "Inquadra il QR con il telefono, poi avvicina il tag NFC. La scansione apparirà sul PC."}
        </p>

        {loading && (
          <div className="flex justify-center py-8">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-sky-600 border-t-transparent" />
          </div>
        )}

        {error && (
          <div className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {code && !loading && (
          <div className="flex flex-col items-center gap-4">
            <div className="rounded-lg bg-white p-3 ring-2 ring-slate-200">
              <QRCodeSVG value={scanUrl} size={180} level="M" />
            </div>
            <div className="rounded-lg bg-slate-100 px-6 py-2 font-mono text-xl font-bold tracking-wider text-slate-800">
              {code}
            </div>
            <p className="text-center text-xs text-slate-500">
              Sessione valida 15 minuti. {allowMultiple && processedCount > 0 ? `${processedCount} tag ricevuti. ` : ""}In attesa...
            </p>
          </div>
        )}

        <div className="mt-6 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
          >
            Chiudi
          </button>
        </div>
      </div>
    </div>
  );
}
