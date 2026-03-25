"use client";

import AppModalFrame from "./AppModalFrame";

type Props = {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

export default function ConfirmModal({
  open,
  title,
  message,
  confirmLabel = "Conferma",
  cancelLabel = "Annulla",
  danger = false,
  onConfirm,
  onCancel,
}: Props) {
  return (
    <AppModalFrame
      open={open}
      title={title}
      subtitle="Conferma operazione"
      onClose={onCancel}
      width="min(440px, 100%)"
      footer={
        <>
          <button type="button" className="btn" onClick={onCancel}>
            {cancelLabel}
          </button>
          <button
            type="button"
            className={danger ? "btn btnDanger btnDangerSolid" : "btn btnPrimary"}
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
        </>
      }
    >
      <p className="confirmModalMessage" style={{ margin: 0 }} id="confirm-modal-desc">
        {message}
      </p>
    </AppModalFrame>
  );
}
