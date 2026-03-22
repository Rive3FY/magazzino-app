"use client";

import type { EquipmentArea } from "./types";

function key(area: EquipmentArea) {
  return `equipment_maintenance_ack_${area}`;
}

/** Ultimo `closed_at` considerato "letto" per il badge notifiche (ISO). */
export function getMaintenanceAckIso(area: EquipmentArea): string {
  if (typeof window === "undefined") return new Date(0).toISOString();
  const k = key(area);
  let v = localStorage.getItem(k);
  if (!v) {
    v = new Date().toISOString();
    localStorage.setItem(k, v);
  }
  return v;
}

/** Dopo aver aperto l'elenco manutenzioni: azzera il badge per gli eventi già noti. */
export function markMaintenanceNotificationsCleared(area: EquipmentArea) {
  if (typeof window === "undefined") return;
  localStorage.setItem(key(area), new Date().toISOString());
}
