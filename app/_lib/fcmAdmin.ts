import { createClient } from "@supabase/supabase-js";
import { cert, getApps, initializeApp, type ServiceAccount } from "firebase-admin/app";
import { getMessaging } from "firebase-admin/messaging";

export function getSupabaseServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  }
  return createClient(url, serviceKey, { auth: { persistSession: false } });
}

function parseServiceAccount(): ServiceAccount | null {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON?.trim();
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as ServiceAccount & { privateKey?: string; private_key?: string };
    const privateKey = parsed.privateKey ?? parsed.private_key;
    if (typeof privateKey === "string") {
      const normalized = privateKey.replace(/\\n/g, "\n");
      return {
        ...parsed,
        privateKey: normalized,
        // firebase-admin accetta anche snake_case da JSON Google
        private_key: normalized,
      } as ServiceAccount;
    }
    return parsed;
  } catch (e) {
    console.error("FIREBASE_SERVICE_ACCOUNT_JSON non valido:", e);
    return null;
  }
}

export function getFirebaseMessaging() {
  const account = parseServiceAccount();
  if (!account) return null;

  if (getApps().length === 0) {
    initializeApp({
      credential: cert(account),
    });
  }

  return getMessaging();
}

export type PushPayload = {
  title: string;
  body: string;
  link?: string | null;
  excludeUserId?: string | null;
};

/** Invia push FCM a tutti i device degli admin materiali (escluso l'attore). */
export async function sendPushToMaterialsAdmins(payload: PushPayload) {
  const messaging = getFirebaseMessaging();
  if (!messaging) {
    return { sent: 0, skipped: true as const, reason: "FIREBASE_SERVICE_ACCOUNT_JSON non configurato" };
  }

  const supabase = getSupabaseServiceClient();

  const { data: admins, error: adminsError } = await supabase
    .from("profiles")
    .select("id")
    .or("is_super_admin.eq.true,is_admin.eq.true,is_materials_admin.eq.true");

  if (adminsError) {
    throw new Error("Errore lettura admin: " + adminsError.message);
  }

  const adminIds = (admins ?? [])
    .map((r) => String((r as { id?: string }).id ?? ""))
    .filter((id) => id && id !== (payload.excludeUserId ?? ""));

  if (adminIds.length === 0) {
    return { sent: 0, skipped: false as const, reason: "Nessun admin destinatario" };
  }

  const { data: tokenRows, error: tokensError } = await supabase
    .from("device_push_tokens")
    .select("id,token,user_id")
    .in("user_id", adminIds);

  if (tokensError) {
    throw new Error("Errore lettura token: " + tokensError.message);
  }

  const tokens = Array.from(
    new Set((tokenRows ?? []).map((r) => String((r as { token?: string }).token ?? "").trim()).filter(Boolean))
  );

  if (tokens.length === 0) {
    return { sent: 0, skipped: false as const, reason: "Nessun device registrato" };
  }

  const link = (payload.link ?? "").trim();
  const response = await messaging.sendEachForMulticast({
    tokens,
    notification: {
      title: payload.title,
      body: payload.body,
    },
    data: {
      link,
      click_action: "FLUTTER_NOTIFICATION_CLICK",
    },
    android: {
      priority: "high",
      notification: {
        channelId: "admin_alerts",
        priority: "high",
        defaultSound: true,
        defaultVibrateTimings: true,
      },
    },
  });

  const invalidTokenIndexes: number[] = [];
  response.responses.forEach((res, idx) => {
    if (!res.success) {
      const code = res.error?.code ?? "";
      if (
        code.includes("registration-token-not-registered") ||
        code.includes("invalid-registration-token") ||
        code.includes("not-found")
      ) {
        invalidTokenIndexes.push(idx);
      } else {
        console.warn("FCM send error:", res.error?.message ?? res.error);
      }
    }
  });

  if (invalidTokenIndexes.length > 0) {
    const badTokens = invalidTokenIndexes.map((i) => tokens[i]).filter(Boolean);
    await supabase.from("device_push_tokens").delete().in("token", badTokens);
  }

  return {
    sent: response.successCount,
    failed: response.failureCount,
    skipped: false as const,
  };
}
