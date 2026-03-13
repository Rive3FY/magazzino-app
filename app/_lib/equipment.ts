import type { CSSProperties } from "react";
import type {
  EquipmentArea,
  EquipmentMovementStatus,
  EquipmentMovementType,
  EquipmentResolutionType,
  EquipmentStatus,
} from "./types";

export const EQUIPMENT_AREA_OPTIONS: EquipmentArea[] = ["LINEE", "STAZIONI"];

export const EQUIPMENT_AREA_LABELS: Record<EquipmentArea, string> = {
  LINEE: "Linee",
  STAZIONI: "Stazioni",
};

export const EQUIPMENT_STATUS_OPTIONS: EquipmentStatus[] = [
  "AVAILABLE",
  "ASSIGNED",
  "MAINTENANCE",
  "DISMISSED",
];

export const EQUIPMENT_MOVEMENT_TYPE_OPTIONS: EquipmentMovementType[] = [
  "OUT",
];

export const EQUIPMENT_RESOLUTION_TYPE_OPTIONS: EquipmentResolutionType[] = [
  "RETURN",
  "MAINTENANCE",
  "DISMISS",
];

export const EQUIPMENT_STATUS_LABELS: Record<EquipmentStatus, string> = {
  AVAILABLE: "Disponibile",
  ASSIGNED: "Assegnata",
  MAINTENANCE: "In manutenzione",
  DISMISSED: "Dismessa",
};

export const EQUIPMENT_MOVEMENT_LABELS: Record<EquipmentMovementType, string> = {
  OUT: "Uscita",
};

export const EQUIPMENT_MOVEMENT_STATUS_LABELS: Record<EquipmentMovementStatus, string> = {
  OPEN: "Aperto",
  CLOSED: "Chiuso",
};

export const EQUIPMENT_RESOLUTION_LABELS: Record<EquipmentResolutionType, string> = {
  RETURN: "Rientro",
  MAINTENANCE: "Invio manutenzione",
  DISMISS: "Dismissione",
};

export function buildEquipmentStatusUpdate(status: EquipmentStatus, maintenanceNote?: string): Record<string, unknown> {
  const payload: Record<string, unknown> = { status };

  if (status === "DISMISSED") {
    payload.assigned_to_name = null;
    payload.assigned_to_email = null;
    payload.assigned_to_badge = null;
    payload.assigned_at = null;
    payload.maintenance_note = null;
    payload.dismissed_at = new Date().toISOString();
    return payload;
  }

  if (status === "MAINTENANCE") {
    payload.assigned_to_name = null;
    payload.assigned_to_email = null;
    payload.assigned_to_badge = null;
    payload.assigned_at = null;
    payload.dismissed_at = null;
    payload.maintenance_note = String(maintenanceNote ?? "").trim() || null;
    return payload;
  }

  payload.dismissed_at = null;
  payload.maintenance_note = null;
  if (status === "AVAILABLE") {
    payload.assigned_to_name = null;
    payload.assigned_to_email = null;
    payload.assigned_to_badge = null;
    payload.assigned_at = null;
  }
  return payload;
}

export function equipmentStatusStyle(status: EquipmentStatus): CSSProperties {
  const base: CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    borderRadius: 999,
    padding: "6px 10px",
    fontSize: 12,
    fontWeight: 800,
    letterSpacing: 0.2,
    border: "1px solid rgba(15,23,42,0.12)",
    background: "rgba(255,255,255,0.9)",
    color: "#0f172a",
    whiteSpace: "nowrap",
  };

  if (status === "AVAILABLE") {
    return {
      ...base,
      borderColor: "rgba(16,185,129,0.35)",
      background: "rgba(16,185,129,0.10)",
    };
  }

  if (status === "ASSIGNED") {
    return {
      ...base,
      borderColor: "rgba(59,130,246,0.35)",
      background: "rgba(59,130,246,0.10)",
    };
  }

  if (status === "MAINTENANCE") {
    return {
      ...base,
      borderColor: "rgba(245,158,11,0.5)",
      background: "rgba(245,158,11,0.12)",
    };
  }

  return {
    ...base,
    borderColor: "rgba(239,68,68,0.35)",
    background: "rgba(239,68,68,0.10)",
  };
}

export function equipmentMovementPillStyle(kind: EquipmentMovementType | EquipmentMovementStatus): CSSProperties {
  const base: CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    padding: "6px 10px",
    borderRadius: 999,
    border: "1px solid rgba(15,23,42,0.12)",
    fontSize: 12,
    fontWeight: 900,
    letterSpacing: 0.2,
    background: "rgba(255,255,255,0.85)",
    color: "#0f172a",
    whiteSpace: "nowrap",
  };

  if (kind === "OUT") {
    return {
      ...base,
      borderColor: "rgba(239,68,68,0.35)",
      background: "rgba(239,68,68,0.10)",
    };
  }

  if (kind === "OPEN") {
    return {
      ...base,
      borderColor: "rgba(245,158,11,0.55)",
      background: "rgba(245,158,11,0.12)",
    };
  }

  return {
    ...base,
    borderColor: "rgba(59,130,246,0.45)",
    background: "rgba(59,130,246,0.10)",
  };
}
