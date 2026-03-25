"use client";

import { useState, useEffect } from "react";
import AppModalFrame from "./AppModalFrame";

type Props = {
  open: boolean;
  title: string;
  message: string;
  inputLabel: string;
  confirmPhrase: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

export default function ConfirmWithInputModal({
  open,
  title,
  message,
  inputLabel,
  confirmPhrase,
  confirmLabel = "Conferma",
  cancelLabel = "Annulla",
  danger = false,
  onConfirm,
  onCancel,
}: Props) {
  const [inputValue, setInputValue] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setInputValue("");
      setError(null);
    }
  }, [open]);

  function handleConfirm() {
    if (inputValue.trim() !== confirmPhrase) {
      setError("Testo non corretto. Riprova.");
      return;
    }
    setError(null);
    onConfirm();
  }

  return (
    <AppModalFrame
      open={open}
      title={title}
      subtitle="Conferma con testo"
      onClose={onCancel}
      width="min(460px, 100%)"
      footer={
        <>
          <button type="button" className="btn" onClick={onCancel}>
            {cancelLabel}
          </button>
          <button
            type="button"
            className={danger ? "btn btnDanger btnDangerSolid" : "btn btnPrimary"}
            onClick={handleConfirm}
          >
            {confirmLabel}
          </button>
        </>
      }
    >
      <div style={{ display: "grid", gap: 16 }}>
        <p className="confirmModalMessage" style={{ margin: 0 }}>
          {message}
        </p>
        <div className="appModalSection">
          <div className="appModalSectionHeader">Verifica</div>
          <div className="appModalSectionBody">
            <label className="label" htmlFor="confirm-input-phrase">
              {inputLabel}
            </label>
            <input
              id="confirm-input-phrase"
              type="text"
              className="input"
              value={inputValue}
              onChange={(e) => {
                setInputValue(e.target.value);
                setError(null);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleConfirm();
                if (e.key === "Escape") onCancel();
              }}
              placeholder={confirmPhrase}
              autoFocus
              style={{ width: "100%", marginTop: 6 }}
            />
            {error ? (
              <p style={{ margin: "8px 0 0", color: "#b91c1c", fontSize: 14, fontWeight: 700 }}>{error}</p>
            ) : null}
          </div>
        </div>
      </div>
    </AppModalFrame>
  );
}
