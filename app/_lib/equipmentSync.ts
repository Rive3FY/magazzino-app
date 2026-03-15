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
