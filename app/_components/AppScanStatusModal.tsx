"use client";

import type { RefObject, ReactNode } from "react";
import AppModalFrame from "./AppModalFrame";

type Props = {
  open: boolean;
  mode: "barcode" | "nfc";
  videoRef?: RefObject<HTMLVideoElement | null>;
  icon?: ReactNode;
  onClose: () => void;
  barcodeTitle?: string;
  nfcTitle?: string;
  barcodeHint?: string;
  nfcHint?: string;
};

export default function AppScanStatusModal({
  open,
  mode,
  videoRef,
  icon,
  onClose,
  barcodeTitle = "Scanner Barcode / QR",
  nfcTitle = "Scanner NFC",
  barcodeHint = "Inquadra il barcode o il QR code",
  nfcHint = "Avvicina il telefono al tag NFC",
}: Props) {
  return (
    <AppModalFrame
      open={open}
      title={mode === "barcode" ? barcodeTitle : nfcTitle}
      subtitle={mode === "barcode" ? "Lettura in corso" : "Attendi la lettura del tag"}
      onClose={onClose}
      width="min(420px, 100%)"
      footer={
        <button type="button" className="btn btnPrimary" onClick={onClose}>
          Fine
        </button>
      }
    >
      {mode === "barcode" ? (
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
