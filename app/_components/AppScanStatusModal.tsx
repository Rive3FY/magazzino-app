"use client";

import type { RefObject, ReactNode } from "react";
import AppModalFrame from "./AppModalFrame";
import AppSpinner from "./AppSpinner";

export const SCAN_RESOLVE_MIN_MS = 280;

export async function waitScanResolveFeedback(startedAt: number, minMs = SCAN_RESOLVE_MIN_MS) {
  const remaining = minMs - (Date.now() - startedAt);
  if (remaining > 0) await new Promise((resolve) => setTimeout(resolve, remaining));
}

function ResolvingSpinner() {
  return <AppSpinner size={38} style={{ color: "#38bdf8" }} />;
}

export function ScanResolvingPanel({ hint = "Caricamento dati..." }: { hint?: string }) {
  return (
    <div className="appModalSection">
      <div
        className="appModalSectionBody"
        style={{
          padding: 28,
          background: "#0f172a",
          borderRadius: 12,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 12,
          minHeight: 180,
          justifyContent: "center",
        }}
      >
        <ResolvingSpinner />
        <div style={{ fontSize: 16, color: "#e2e8f0", fontWeight: 800 }}>QR riconosciuto</div>
        <div style={{ fontSize: 13, color: "#94a3b8" }}>{hint}</div>
      </div>
    </div>
  );
}

type Props = {
  open: boolean;
  mode: "barcode" | "nfc";
  phase?: "scanning" | "resolving";
  videoRef?: RefObject<HTMLVideoElement | null>;
  icon?: ReactNode;
  onClose: () => void;
  barcodeTitle?: string;
  nfcTitle?: string;
  barcodeHint?: string;
  nfcHint?: string;
  resolvingHint?: string;
};

export default function AppScanStatusModal({
  open,
  mode,
  phase = "scanning",
  videoRef,
  icon,
  onClose,
  barcodeTitle = "Scanner Barcode / QR",
  nfcTitle = "Scanner NFC",
  barcodeHint = "Inquadra il barcode o il QR code",
  nfcHint = "Avvicina il telefono al tag NFC",
  resolvingHint = "Caricamento dati...",
}: Props) {
  const resolving = phase === "resolving";
  return (
    <AppModalFrame
      open={open}
      title={mode === "barcode" ? barcodeTitle : nfcTitle}
      subtitle={
        resolving
          ? "QR riconosciuto"
          : mode === "barcode"
            ? "Lettura in corso"
            : "Attendi la lettura del tag"
      }
      onClose={onClose}
      width="min(420px, 100%)"
      footer={
        <button type="button" className="btn btnPrimary" onClick={onClose}>
          Fine
        </button>
      }
    >
      {resolving ? (
        <ScanResolvingPanel hint={resolvingHint} />
      ) : mode === "barcode" ? (
        <div className="appModalSection">
          <div className="appModalSectionBody">
            <div style={{ padding: 12, background: "#0f172a", borderRadius: 12 }}>
              <video ref={videoRef} style={{ width: "100%", maxWidth: 360, borderRadius: 8 }} muted playsInline />
              <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 8 }}>{barcodeHint}</div>
            </div>
          </div>
        </div>
      ) : (
        <div className="appModalSection">
          <div
            className="appModalSectionBody"
            style={{
              padding: 24,
              background: "#0f172a",
              borderRadius: 12,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 10,
            }}
          >
            {icon}
            <div style={{ fontSize: 14, color: "#94a3b8" }}>{nfcHint}</div>
          </div>
        </div>
      )}
    </AppModalFrame>
  );
}
