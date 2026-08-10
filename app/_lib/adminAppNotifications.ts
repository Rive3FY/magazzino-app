import { Capacitor } from "@capacitor/core";
import { LocalNotifications } from "@capacitor/local-notifications";
import { createClient } from "./supabase/client";

export type AdminAppNotificationType =
  | "MATERIAL_CREATED"
  | "MATERIAL_DELETED"
  | "MOVEMENT_OPENED"
  | "MOVEMENT_CLOSED";

export type AdminAppNotificationRow = {
  id: string;
  created_at: string;
  type: AdminAppNotificationType | string;
  title: string;
  body: string;
  link: string | null;
  code: string | null;
  warehouse: string | null;
  entity_type: string | null;
  entity_id: string | null;
  actor_id: string | null;
  actor_name: string | null;
};

export type NotifyMaterialsAdminsInput = {
  type: AdminAppNotificationType;
  title: string;
  body: string;
  link: string | null;
  code?: string | null;
  warehouse?: string | null;
  entity_type?: string | null;
  entity_id?: string | null;
  actor_id?: string | null;
  actor_name?: string | null;
};

/** Scrive una notifica per gli admin materiali (fail-soft se tabella assente). */
export async function notifyMaterialsAdmins(input: NotifyMaterialsAdminsInput) {
  try {
    const supabase = createClient();
    const { error } = await supabase.from("app_notifications").insert({
      type: input.type,
      title: input.title,
      body: input.body,
      link: input.link,
      code: input.code ?? null,
      warehouse: input.warehouse ?? null,
      entity_type: input.entity_type ?? null,
      entity_id: input.entity_id ?? null,
      actor_id: input.actor_id ?? null,
      actor_name: input.actor_name ?? null,
    } as never);
    if (error) console.warn("notifyMaterialsAdmins:", error.message);
  } catch (e) {
    console.warn("notifyMaterialsAdmins:", e);
  }
}

export function movementReportLink(movementId: string) {
  return `/movimenti?open=${encodeURIComponent(movementId)}`;
}

export function materialReportLink(code: string, warehouse?: string | null) {
  const q = new URLSearchParams({ code });
  if (warehouse === "PRM" || warehouse === "REALE") q.set("warehouse", warehouse);
  return `/giacenze?${q.toString()}`;
}

let permissionsReady = false;

export async function ensureAdminNotificationPermission(): Promise<boolean> {
  if (typeof window === "undefined") return false;

  if (Capacitor.isNativePlatform()) {
    try {
      const current = await LocalNotifications.checkPermissions();
      if (current.display === "granted") {
        permissionsReady = true;
        return true;
      }
      const requested = await LocalNotifications.requestPermissions();
      permissionsReady = requested.display === "granted";
      return permissionsReady;
    } catch (e) {
      console.warn("LocalNotifications permission:", e);
      return false;
    }
  }

  if (!("Notification" in window)) return false;
  if (Notification.permission === "granted") {
    permissionsReady = true;
    return true;
  }
  if (Notification.permission === "denied") return false;
  const result = await Notification.requestPermission();
  permissionsReady = result === "granted";
  return permissionsReady;
}

function notificationNumericId(seed: string) {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) | 0;
  }
  return Math.abs(hash) % 2147483647 || 1;
}

/** Mostra notifica di sistema (Android Capacitor o browser). */
export async function presentAdminSystemNotification(
  row: Pick<AdminAppNotificationRow, "id" | "title" | "body" | "link">,
  onOpenLink?: (link: string) => void
) {
  const ok = permissionsReady || (await ensureAdminNotificationPermission());
  if (!ok) return;

  const link = (row.link ?? "").trim();

  if (Capacitor.isNativePlatform()) {
    try {
      await LocalNotifications.schedule({
        notifications: [
          {
            id: notificationNumericId(row.id),
            title: row.title,
            body: row.body,
            extra: { link, notificationId: row.id },
          },
        ],
      });
    } catch (e) {
      console.warn("LocalNotifications.schedule:", e);
    }
    return;
  }

  try {
    const n = new Notification(row.title, {
      body: row.body,
      tag: row.id,
      data: { link },
    });
    n.onclick = () => {
      window.focus();
      n.close();
      if (link && onOpenLink) onOpenLink(link);
      else if (link) window.location.assign(link);
    };
  } catch (e) {
    console.warn("Notification:", e);
  }
}
