"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { Capacitor } from "@capacitor/core";
import { LocalNotifications } from "@capacitor/local-notifications";
import { createClient } from "../_lib/supabase/client";
import { useAuth } from "../_lib/hooks/useAuth";
import { useIsAdmin } from "../_lib/hooks/useIsAdmin";
import {
  ensureAdminNotificationPermission,
  presentAdminSystemNotification,
  type AdminAppNotificationRow,
} from "../_lib/adminAppNotifications";

/**
 * Ascolta nuove righe in app_notifications e mostra notifiche di sistema
 * agli admin materiali. Al tap apre il link (report movimento / materiale).
 */
export default function AdminAppNotificationsListener() {
  const { user } = useAuth();
  const { canManageMaterials, loading: adminLoading } = useIsAdmin();
  const router = useRouter();
  const seenIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (adminLoading || !user?.id || !canManageMaterials) return;

    void ensureAdminNotificationPermission();

    const supabase = createClient();
    const openLink = (link: string) => {
      if (!link) return;
      if (link.startsWith("/")) router.push(link);
      else window.location.assign(link);
    };

    let removeNativeListener: (() => void) | undefined;

    if (Capacitor.isNativePlatform()) {
      void LocalNotifications.addListener("localNotificationActionPerformed", (event) => {
        const link = String((event.notification.extra as { link?: string } | undefined)?.link ?? "").trim();
        if (link) openLink(link);
      }).then((handle) => {
        removeNativeListener = () => {
          void handle.remove();
        };
      });
    }

    const channel = supabase
      .channel(`admin-app-notifications:${user.id}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "app_notifications" },
        (payload) => {
          const row = payload.new as AdminAppNotificationRow;
          if (!row?.id || seenIdsRef.current.has(row.id)) return;
          seenIdsRef.current.add(row.id);
          // Non notificare chi ha compiuto l'azione
          if (row.actor_id && row.actor_id === user.id) return;
          void presentAdminSystemNotification(row, openLink);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
      removeNativeListener?.();
    };
  }, [adminLoading, canManageMaterials, router, user?.id]);

  return null;
}
