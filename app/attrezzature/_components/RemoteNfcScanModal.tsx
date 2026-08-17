"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { QRCodeSVG } from "qrcode.react";
import AppModalFrame from "../../_components/AppModalFrame";
import AppSpinner from "../../_components/AppSpinner";

export type RemoteScanEvent = {
  type?: string;
  code?: string;
  name?: string;
  um?: string | null;
  warehouse?: "PRM" | "REALE";
  qty?: number;
  source?: string;
  rawValue?: string;
};

type Props = {
  open: boolean;
  onClose: () => void;
  context: "equipment_associate" | "movement_select";
  equipmentId?: string;
  equipmentIds?: string[];
  area?: string;
  onTagReceived: (nfcTagId: string, context?: { equipmentId?: string }) => void;
  onScanEventReceived?: (event: RemoteScanEvent) => void;
  allowMultiple?: boolean;
  title?: string;
  subtitle?: string;
  liveContent?: ReactNode;
  sessionEndpoint?: string;
  scanPath?: string;
  width?: string;
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
  onScanEventReceived,
  allowMultiple = false,
  title = "Usa telefono come lettore QR",
  subtitle,
  liveContent,
  sessionEndpoint = "/api/attrezzature/remote-nfc-session",
  scanPath = "/attrezzature/scan-remoto",
  width = "min(460px, 100%)",
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
      const res = await fetch(sessionEndpoint, {
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
  }, [context, equipmentId, equipmentIds, area, sessionEndpoint]);

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
        const res = await fetch(`${sessionEndpoint}?code=${encodeURIComponent(code)}`);
        const json = await res.json().catch(() => ({}));
        if (!res.ok) return;

        const ids = (json.nfcTagIds ?? (json.nfcTagId ? [json.nfcTagId] : [])) as Array<string | RemoteScanEvent>;
        const newCount = ids.length;

        if (newCount > processedCount) {
          const eqIds = (json.contextData?.equipmentIds ?? []) as string[];
          for (let i = processedCount; i < newCount; i++) {
            const entry = ids[i];
            if (entry && typeof entry === "object") {
              onScanEventReceived?.(entry);
              continue;
            }
            const ctx = eqIds[i] ? { equipmentId: eqIds[i] } : undefined;
            onTagReceived(String(entry ?? ""), ctx);
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
  }, [open, code, processedCount, allowMultiple, onTagReceived, onScanEventReceived, onClose, sessionEndpoint]);

  if (!open) return null;

  const scanUrl = typeof window !== "undefined" && code
    ? `${window.location.origin}${scanPath}?code=${encodeURIComponent(code)}`
    : "";

  return (
    <AppModalFrame
      open={open}
      title={title}
        subtitle={
        subtitle ??
        (allowMultiple
          ? "Inquadra il QR con il telefono, poi scansiona i QR delle attrezzature. Ogni scansione apparirà sul PC."
          : "Inquadra il QR con il telefono, poi scansiona il QR dell'attrezzatura.")
      }
      onClose={onClose}
      width={width}
      footer={
        <button type="button" className="btn btnPrimary" onClick={onClose}>
          Chiudi
        </button>
      }
    >
      <div style={{ display: "grid", gap: 16 }}>
        {loading ? (
          <div className="appModalSection">
            <div
              className="appModalSectionBody"
              style={{ display: "flex", justifyContent: "center", padding: "40px 12px" }}
            >
              <AppSpinner size={40} style={{ color: "#0f172a" }} />
            </div>
          </div>
        ) : null}

        {error ? (
          <div
            style={{
              padding: 12,
              background: "rgba(239,68,68,0.08)",
              border: "1px solid rgba(239,68,68,0.25)",
              borderRadius: 12,
              color: "#991b1b",
              fontSize: 14,
              fontWeight: 700,
            }}
          >
            {error}
          </div>
        ) : null}

        {code && !loading ? (
          <div className="appModalSection">
            <div className="appModalSectionHeader">Scansione remota</div>
            <div
              className="appModalSectionBody"
              style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 20 }}
            >
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
                Sessione valida per questa operazione
                {allowMultiple && processedCount > 0 && ` · ${processedCount} tag ricevuti`}
                {" · "}In attesa...
              </p>
            </div>
          </div>
        ) : null}

        {liveContent ? liveContent : null}
      </div>
    </AppModalFrame>
  );
}
