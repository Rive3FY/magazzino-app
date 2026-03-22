"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "../supabase/client";
import { subscribeEquipmentMaintenance } from "../equipmentSync";
import { useToast } from "../ToastContext";
import type { EquipmentArea } from "../types";

function normStatus(s: string | null | undefined) {
  return String(s ?? "").trim().toUpperCase();
}

function assetResolvedStatus(status: string | undefined) {
  const st = normStatus(status);
  return st === "AVAILABLE" || st === "DISMISSED";
}

export function useEquipmentMaintenanceNotifications(area: EquipmentArea | null, enabled: boolean) {
  const toast = useToast();
  const toastRef = useRef(toast);
  toastRef.current = toast;
  const supabase = createClient();
  const [count, setCount] = useState(0);
  const myUserIdRef = useRef<string | null>(null);

  const refresh = useCallback(async () => {
    if (!enabled || !area) {
      setCount(0);
      return;
    }
    const { data: movements, error: movErr } = await supabase
      .from("equipment_movements")
      .select("equipment_id")
      .eq("equipment_area", area)
      .eq("resolution_type", "MAINTENANCE")
      .eq("status", "CLOSED")
      .not("closed_at", "is", null)
      .limit(500);

    if (movErr) {
      console.warn("equipment maintenance badge:", movErr.message);
      return;
    }
    const movRows = (movements ?? []) as { equipment_id: string }[];
    const ids = [...new Set(movRows.map((m) => m.equipment_id).filter(Boolean))];
    if (ids.length === 0) {
      setCount(0);
      return;
    }

    const { data: assets, error: aErr } = await supabase.from("equipment_assets").select("id, status").in("id", ids);

    if (aErr) {
      console.warn("equipment maintenance badge:", aErr.message);
      return;
    }
    const statusById = new Map<string, string>();
    for (const a of assets ?? []) {
      const row = a as { id: string; status: string };
      statusById.set(row.id, row.status);
    }

    let queue = 0;
    for (const m of movRows) {
      const st = statusById.get(m.equipment_id);
      if (!st) {
        queue += 1;
        continue;
      }
      if (!assetResolvedStatus(st)) queue += 1;
    }
    setCount(queue);
  }, [area, enabled, supabase]);

  useEffect(() => {
    if (!enabled) return;
    void supabase.auth.getUser().then(({ data }) => {
      myUserIdRef.current = data.user?.id ?? null;
    });
  }, [enabled, supabase]);

  useEffect(() => {
    if (!enabled || !area) return;
    void refresh();
  }, [area, enabled, refresh]);

  useEffect(() => {
    if (!enabled || !area) return;
    return subscribeEquipmentMaintenance(() => {
      void refresh();
    });
  }, [area, enabled, refresh]);

  useEffect(() => {
    if (!enabled || !area) return;
    const bump = () => {
      void refresh();
    };
    const onVis = () => {
      if (typeof document !== "undefined" && document.visibilityState === "visible") bump();
    };
    window.addEventListener("focus", bump);
    document.addEventListener("visibilitychange", onVis);
    return () => {
      window.removeEventListener("focus", bump);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [area, enabled, refresh]);

  useEffect(() => {
    if (!enabled || !area) return;

    const channel = supabase
      .channel(`equipment-maintenance-${area}`)
      .on(
        "postgres_changes",
        {
          // INSERT/DELETE non aggiornavano il badge (es. svuotamento movimenti → lista ok, counter fermo).
          event: "*",
          schema: "public",
          table: "equipment_movements",
          filter: `equipment_area=eq.${area}`,
        },
        (payload) => {
          if (payload.eventType === "UPDATE") {
            const n = payload.new as Record<string, unknown>;
            const o = payload.old as Record<string, unknown> | undefined;
            const wasOpen = o?.status === "OPEN" || o?.status == null;
            const nowClosed = n.status === "CLOSED";
            const isMaint = n.resolution_type === "MAINTENANCE";
            const closedBy = typeof n.closed_by === "string" ? n.closed_by : null;

            if (isMaint && nowClosed && wasOpen && n.closed_at) {
              if (!closedBy || closedBy !== myUserIdRef.current) {
                toastRef.current.info(
                  area === "LINEE"
                    ? "Nuovo invio in manutenzione (Linee). Apri la sezione Manutenzioni."
                    : "Nuovo invio in manutenzione (Stazioni). Apri la sezione Manutenzioni."
                );
              }
            }
          }
          void refresh();
        }
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "equipment_assets",
          filter: `equipment_area=eq.${area}`,
        },
        () => {
          void refresh();
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [area, enabled, refresh, supabase]);

  return { count, refresh };
}
