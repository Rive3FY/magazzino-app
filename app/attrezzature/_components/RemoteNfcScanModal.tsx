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
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 10050,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "rgba(15, 23, 42, 0.6)",
        padding: 20,
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="remote-scan-title"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        style={{
          maxWidth: 380,
          width: "100%",
          background: "#fff",
          borderRadius: 20,
          overflow: "hidden",
          boxShadow: "0 24px 60px rgba(0,0,0,0.25), 0 0 0 1px rgba(15,23,42,0.06)",
        }}
      >
        <div
          style={{
            background: "linear-gradient(135deg, #0f172a 0%, #1e293b 100%)",
            padding: "20px 24px",
            color: "#fff",
          }}
        >
          <h2 id="remote-scan-title" style={{ margin: 0, fontSize: 18, fontWeight: 700, letterSpacing: "0.02em" }}>
            {title}
          </h2>
          <p style={{ margin: "8px 0 0", fontSize: 13, opacity: 0.9, lineHeight: 1.4 }}>
            {allowMultiple
              ? "Inquadra il QR, poi scansiona i tag. Ogni scansione apparirà sul PC."
              : "Inquadra il QR con il telefono, poi avvicina il tag NFC."}
          </p>
        </div>

        <div style={{ padding: 24 }}>
          {loading && (
            <div style={{ display: "flex", justifyContent: "center", padding: "40px 0" }}>
              <div
                style={{
                  width: 40,
                  height: 40,
                  border: "3px solid #e2e8f0",
                  borderTopColor: "#0f172a",
                  borderRadius: "50%",
                  animation: "spin 0.8s linear infinite",
                }}
              />
            </div>
          )}

          {error && (
            <div
              style={{
                marginBottom: 16,
                padding: 12,
                background: "rgba(239,68,68,0.08)",
                border: "1px solid rgba(239,68,68,0.25)",
                borderRadius: 12,
                color: "#991b1b",
                fontSize: 14,
              }}
            >
              {error}
            </div>
          )}

          {code && !loading && (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 20 }}>
              <div
                style={{
                  padding: 20,
                  background: "linear-gradient(145deg, #f8fafc 0%, #f1f5f9 100%)",
                  borderRadius: 16,
                  boxShadow: "inset 0 1px 0 rgba(255,255,255,0.8), 0 4px 20px rgba(15,23,42,0.08)",
                }}
              >
                <QRCodeSVG value={scanUrl} size={200} level="M" />
              </div>
              <div
                style={{
                  padding: "10px 20px",
                  background: "#0f172a",
                  color: "#fff",
                  borderRadius: 10,
                  fontFamily: "ui-monospace, monospace",
                  fontSize: 16,
                  fontWeight: 700,
                  letterSpacing: "0.15em",
                }}
              >
                {code}
              </div>
              <p style={{ margin: 0, fontSize: 12, color: "#64748b", textAlign: "center", lineHeight: 1.5 }}>
                Sessione valida 15 minuti
                {allowMultiple && processedCount > 0 && ` · ${processedCount} tag ricevuti`}
                {" · "}In attesa...
              </p>
            </div>
          )}

          <div style={{ marginTop: 24, display: "flex", justifyContent: "flex-end" }}>
            <button
              type="button"
              className="btn"
              onClick={onClose}
              style={{
                padding: "10px 20px",
                background: "#0f172a",
                color: "#fff",
                border: "none",
                borderRadius: 10,
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              Chiudi
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
