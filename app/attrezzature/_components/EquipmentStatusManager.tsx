"use client";

import { useEffect, useState } from "react";
import AppModalFrame from "../../_components/AppModalFrame";
import { EQUIPMENT_STATUS_LABELS, equipmentStatusStyle } from "../../_lib/equipment";
import type { EquipmentAssetRow, EquipmentStatus } from "../../_lib/types";

type AllowedTargetStatus = "AVAILABLE" | "MAINTENANCE";

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
    <AppModalFrame
      open={isOpen}
      title="Gestione stato attrezzatura"
      subtitle={
        <>
          <strong>{asset.serial_number || asset.asset_code}</strong>
          {" · "}
          {asset.name}
        </>
      }
      onClose={onClose}
      width="min(760px, 100%)"
      headerRight={
        <button type="button" className="btn" onClick={onClose} disabled={isSaving}>
          Chiudi
        </button>
      }
      footer={
        <>
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
        </>
      }
    >
      <div style={{ display: "grid", gap: 14 }}>
        <div className="appModalSection">
          <div className="appModalSectionHeader">Situazione attuale</div>
          <div className="appModalSectionBody" style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
            <div style={{ fontSize: 13, color: "#475569" }}>Stato attuale</div>
            <span style={equipmentStatusStyle(asset.status)}>{EQUIPMENT_STATUS_LABELS[asset.status]}</span>
          </div>
        </div>

        <div className="appModalSection">
          <div className="appModalSectionHeader">Nuovo stato</div>
          <div className="appModalSectionBody">
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
                      borderColor: active ? "#2563eb" : "rgba(15,23,42,0.15)",
                      background: active ? "rgba(59,130,246,0.1)" : "#fff",
                      opacity: disabled ? 0.55 : 1,
                    }}
                  >
                    <div style={{ fontWeight: 800, marginBottom: 6 }}>{option.title}</div>
                    <div style={{ fontSize: 13, color: "#475569", lineHeight: 1.35 }}>{option.hint}</div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {targetStatus === "MAINTENANCE" && (
          <div className="appModalSection">
            <div className="appModalSectionHeader">Dettagli manutenzione</div>
            <div className="appModalSectionBody" style={{ display: "grid", gap: 6 }}>
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
          </div>
        )}
      </div>
    </AppModalFrame>
  );
}
