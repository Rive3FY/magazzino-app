"use client";

import { useEffect, useState } from "react";
import { EQUIPMENT_STATUS_LABELS, equipmentStatusStyle } from "../../_lib/equipment";
import type { EquipmentAssetRow, EquipmentStatus } from "../../_lib/types";

type AllowedTargetStatus = "AVAILABLE" | "MAINTENANCE" | "DISMISSED";

type Props = {
  asset: EquipmentAssetRow | null;
  isOpen: boolean;
  isSaving?: boolean;
  onClose: () => void;
  onSubmit: (status: AllowedTargetStatus, note?: string) => Promise<void> | void;
};

const STATUS_OPTIONS: Array<{
  value: AllowedTargetStatus;
  title: string;
  hint: string;
}> = [
  {
    value: "MAINTENANCE",
    title: "Invia in manutenzione",
    hint: "Toglie l'attrezzatura dalla disponibilita' e la segna come in manutenzione.",
  },
  {
    value: "DISMISSED",
    title: "Dismetti",
    hint: "Rimuove definitivamente l'attrezzatura dalla disponibilita'.",
  },
  {
    value: "AVAILABLE",
    title: "Reintegra",
    hint: "Riporta l'attrezzatura tra quelle disponibili.",
  },
];

export default function EquipmentStatusManager({ asset, isOpen, isSaving = false, onClose, onSubmit }: Props) {
  const [targetStatus, setTargetStatus] = useState<AllowedTargetStatus | "">("");
  const [maintenanceNote, setMaintenanceNote] = useState("");

  useEffect(() => {
    if (!isOpen || !asset) {
      setTargetStatus("");
      setMaintenanceNote("");
      return;
    }

    if (asset.status === "MAINTENANCE") setTargetStatus("AVAILABLE");
    else if (asset.status === "DISMISSED") setTargetStatus("AVAILABLE");
    else setTargetStatus("");

    setMaintenanceNote(asset.maintenance_note ?? "");
  }, [asset, isOpen]);

  if (!isOpen || !asset) return null;

  const canSubmit = !!targetStatus && targetStatus !== asset.status;

  return (
    <div
      onMouseDown={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(15,23,42,0.35)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 14,
        zIndex: 10050,
      }}
    >
      <div
        onMouseDown={(e) => e.stopPropagation()}
        style={{
          width: "min(760px, 100%)",
          background: "#fff",
          borderRadius: 16,
          border: "1px solid rgba(15,23,42,0.12)",
          boxShadow: "0 24px 60px rgba(0,0,0,0.25)",
          padding: 16,
          display: "grid",
          gap: 14,
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "start" }}>
          <div style={{ display: "grid", gap: 6 }}>
            <div style={{ fontSize: 18, fontWeight: 900 }}>Gestione stato attrezzatura</div>
            <div style={{ color: "#334155" }}>
              <strong>{asset.serial_number || asset.asset_code}</strong>
              {" · "}
              {asset.name}
            </div>
          </div>
          <button type="button" className="btn" onClick={onClose} disabled={isSaving}>
            Chiudi
          </button>
        </div>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <div style={{ fontSize: 13, color: "#475569" }}>Stato attuale</div>
          <span style={equipmentStatusStyle(asset.status)}>{EQUIPMENT_STATUS_LABELS[asset.status]}</span>
        </div>

        <div style={{ display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))" }}>
          {STATUS_OPTIONS.map((option) => {
            const active = targetStatus === option.value;
            const disabled = option.value === asset.status;
            return (
              <button
                key={option.value}
                type="button"
                className="btn"
                disabled={disabled || isSaving}
                onClick={() => setTargetStatus(option.value)}
                style={{
                  textAlign: "left",
                  minHeight: 96,
                  padding: 14,
                  borderColor: active ? "#0f172a" : "rgba(15,23,42,0.15)",
                  background: active ? "rgba(15,23,42,0.06)" : "#fff",
                  opacity: disabled ? 0.55 : 1,
                }}
              >
                <div style={{ fontWeight: 800, marginBottom: 6 }}>{option.title}</div>
                <div style={{ fontSize: 13, color: "#475569", lineHeight: 1.35 }}>{option.hint}</div>
              </button>
            );
          })}
        </div>

        {targetStatus === "MAINTENANCE" && (
          <div style={{ display: "grid", gap: 6 }}>
            <label className="label" htmlFor="equipment-status-maintenance-note">
              Note manutenzione
            </label>
            <textarea
              id="equipment-status-maintenance-note"
              className="input"
              value={maintenanceNote}
              onChange={(e) => setMaintenanceNote(e.target.value)}
              placeholder="Motivo, intervento richiesto o dettagli utili"
              rows={3}
              style={{ resize: "vertical", minHeight: 80 }}
            />
          </div>
        )}

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, flexWrap: "wrap" }}>
          <button type="button" className="btn" onClick={onClose} disabled={isSaving}>
            Annulla
          </button>
          <button
            type="button"
            className="btn btnPrimary"
            disabled={!canSubmit || isSaving}
            onClick={() => void onSubmit(targetStatus as AllowedTargetStatus, maintenanceNote)}
          >
            {isSaving ? "Salvataggio..." : "Conferma"}
          </button>
        </div>
      </div>
    </div>
  );
}
