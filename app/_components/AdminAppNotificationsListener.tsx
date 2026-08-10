"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { Capacitor } from "@capacitor/core";
import { LocalNotifications } from "@capacitor/local-notifications";
import { PushNotifications } from "@capacitor/push-notifications";
import { createClient } from "../_lib/supabase/client";
import { useAuth } from "../_lib/hooks/useAuth";
import { useIsAdmin } from "../_lib/hooks/useIsAdmin";
import {
  ensureAdminNotificationPermission,
  presentAdminSystemNotification,
  registerAdminPushDevice,
  saveAdminPushToken,
  type AdminAppNotificationRow,
} from "../_lib/adminAppNotifications";

/**
 * - Foreground: Realtime → notifica locale
 * - Background / app chiusa: FCM push (token registrato qui)
 * Al tap apre il report (link).
 */
export default function AdminAppNotificationsListener() {
  const { user } = useAuth();
  const { canManageMaterials, loading: adminLoading } = useIsAdmin();
  const router = useRouter();
  const seenIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (adminLoading || !user?.id || !canManageMaterials) return;

    const openLink = (link: string) => {
      const path = link.trim();
      if (!path) return;
      if (path.startsWith("/")) router.push(path);
      else window.location.assign(path);
    };

    const cleanups: Array<() => void> = [];

    void (async () => {
      await ensureAdminNotificationPermission();

      if (Capacitor.isNativePlatform()) {
        const regHandle = await PushNotifications.addListener("registration", (token) => {
          void saveAdminPushToken(token.value);
        });
        cleanups.push(() => {
          void regHandle.remove();
        });

        const errHandle = await PushNotifications.addListener("registrationError", (err) => {
          console.warn("Push registration error:", err);
        });
        cleanups.push(() => {
          void errHandle.remove();
        });

        // App in foreground: mostra anche le push come notifica locale cliccabile
        const recvHandle = await PushNotifications.addListener("pushNotificationReceived", (notification) => {
          const link = String(notification.data?.link ?? "").trim();
          void presentAdminSystemNotification(
            {
              id: String(notification.id ?? Date.now()),
              title: notification.title ?? "Avviso magazzino",
              body: notification.body ?? "",
              link: link || null,
            },
            openLink
          );
        });
        cleanups.push(() => {
          void recvHandle.remove();
        });

        const actionHandle = await PushNotifications.addListener(
          "pushNotificationActionPerformed",
          (event) => {
            const link = String(event.notification.data?.link ?? "").trim();
            if (link) openLink(link);
          }
        );
        cleanups.push(() => {
          void actionHandle.remove();
        });

        const localAction = await LocalNotifications.addListener(
          "localNotificationActionPerformed",
          (event) => {
            const link = String(
              (event.notification.extra as { link?: string } | undefined)?.link ?? ""
            ).trim();
            if (link) openLink(link);
          }
        );
        cleanups.push(() => {
          void localAction.remove();
        });

        await registerAdminPushDevice();
      }
    })();

    const supabase = createClient();
    const channel = supabase
      .channel(`admin-app-notifications:${user.id}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "app_notifications" },
        (payload) => {
          const row = payload.new as AdminAppNotificationRow;
          if (!row?.id || seenIdsRef.current.has(row.id)) return;
          seenIdsRef.current.add(row.id);
          if (row.actor_id && row.actor_id === user.id) return;
          // Solo se l'app è in primo piano: in background arriva già FCM
          if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
          void presentAdminSystemNotification(row, openLink);
        }
      )
      .subscribe();

    cleanups.push(() => {
      supabase.removeChannel(channel);
    });

    return () => {
      for (const fn of cleanups) fn();
    };
  }, [adminLoading, canManageMaterials, router, user?.id]);

  return null;
}
