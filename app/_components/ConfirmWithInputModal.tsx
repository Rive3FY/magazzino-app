"use client";

import { useState, useEffect } from "react";

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

  if (!open) return null;

  function handleConfirm() {
    if (inputValue.trim() !== confirmPhrase) {
      setError("Testo non corretto. Riprova.");
      return;
    }
    setError(null);
    onConfirm();
  }

  return (
    <div
      className="confirmModalOverlay"
      onMouseDown={onCancel}
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-input-modal-title"
    >
      <div
        className="confirmModalContent"
        onMouseDown={(e) => e.stopPropagation()}
        style={{ maxWidth: 420 }}
      >
        <div id="confirm-input-modal-title" className="confirmModalTitle">
          {title}
        </div>
        <p className="confirmModalMessage">{message}</p>
        <div style={{ marginTop: 16 }}>
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
          {error && (
            <p style={{ marginTop: 8, color: "#b91c1c", fontSize: 14 }}>{error}</p>
          )}
        </div>
        <div className="confirmModalActions" style={{ marginTop: 20 }}>
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
        </div>
      </div>
    </div>
  );
}
