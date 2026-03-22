"use client";

import type { EquipmentArea } from "./types";

const STORAGE_KEY = "equipment-sync-event";
const EVENT_NAME = "equipment-sync";

type EquipmentSyncPayload = {
  area: EquipmentArea;
  source: string;
  timestamp: number;
};

function parsePayload(raw: string | null): EquipmentSyncPayload | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<EquipmentSyncPayload>;
    if (
      (parsed.area === "LINEE" || parsed.area === "STAZIONI") &&
      typeof parsed.source === "string" &&
      typeof parsed.timestamp === "number"
    ) {
      return parsed as EquipmentSyncPayload;
    }
  } catch {
    // ignore malformed payloads
  }
  return null;
}

export function notifyEquipmentSync(area: EquipmentArea, source: string) {
  if (typeof window === "undefined") return;
  const payload: EquipmentSyncPayload = {
    area,
    source,
    timestamp: Date.now(),
  };
  const serialized = JSON.stringify(payload);
  window.localStorage.setItem(STORAGE_KEY, serialized);
  window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail: payload }));
}

const MAINTENANCE_STORAGE_KEY = "equipment-maintenance-sync";
const MAINTENANCE_EVENT = "equipment-maintenance-sync";

/** Notifica altre schede / listener: nuova chiusura con invio in manutenzione. */
export function notifyEquipmentMaintenance(area: EquipmentArea) {
  if (typeof window === "undefined") return;
  const payload = { area, timestamp: Date.now() };
  const serialized = JSON.stringify(payload);
  window.localStorage.setItem(MAINTENANCE_STORAGE_KEY, serialized);
  window.dispatchEvent(new CustomEvent(MAINTENANCE_EVENT, { detail: payload }));
}

export function subscribeEquipmentMaintenance(callback: () => void) {
  if (typeof window === "undefined") return () => {};

  type MaintPayload = { area: EquipmentArea; timestamp: number };

  const parse = (raw: string | null): MaintPayload | null => {
    if (!raw) return null;
    try {
      const p = JSON.parse(raw) as Partial<MaintPayload>;
      if ((p.area === "LINEE" || p.area === "STAZIONI") && typeof p.timestamp === "number") {
        return p as MaintPayload;
      }
    } catch {
      /* ignore */
    }
    return null;
  };

  const onStorage = (event: StorageEvent) => {
    if (event.key !== MAINTENANCE_STORAGE_KEY) return;
    if (parse(event.newValue)) callback();
  };

  const onCustom = (event: Event) => {
    const e = event as CustomEvent<MaintPayload>;
    if (e.detail?.area) callback();
  };

  window.addEventListener("storage", onStorage);
  window.addEventListener(MAINTENANCE_EVENT, onCustom);

  return () => {
    window.removeEventListener("storage", onStorage);
    window.removeEventListener(MAINTENANCE_EVENT, onCustom);
  };
}

export function subscribeEquipmentSync(
  area: EquipmentArea,
  callback: () => void
) {
  if (typeof window === "undefined") return () => {};

  const handlePayload = (payload: EquipmentSyncPayload | null) => {
    if (!payload) return;
    if (payload.area !== area) return;
    callback();
  };

  const onStorage = (event: StorageEvent) => {
    if (event.key !== STORAGE_KEY) return;
    handlePayload(parsePayload(event.newValue));
  };

  const onCustom = (event: Event) => {
    const customEvent = event as CustomEvent<EquipmentSyncPayload>;
    handlePayload(customEvent.detail ?? null);
  };

  window.addEventListener("storage", onStorage);
  window.addEventListener(EVENT_NAME, onCustom);

  return () => {
    window.removeEventListener("storage", onStorage);
    window.removeEventListener(EVENT_NAME, onCustom);
  };
}
