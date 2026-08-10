import { NextResponse } from "next/server";
import { createClient as createServerClient } from "../../../_lib/supabase/server";
import { sendPushToMaterialsAdmins } from "../../../_lib/fcmAdmin";

export const runtime = "nodejs";

/**
 * Invia push FCM agli admin materiali (background / app chiusa).
 * Chiamata dopo la creazione di una riga in app_notifications.
 */
export async function POST(request: Request) {
  try {
    const serverSupabase = await createServerClient();
    const {
      data: { user },
    } = await serverSupabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Non autenticato" }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const title = String(body?.title ?? "").trim();
    const bodyText = String(body?.body ?? "").trim();
    const link = body?.link != null ? String(body.link) : null;
    const excludeUserId =
      body?.excludeUserId != null ? String(body.excludeUserId) : user.id;

    if (!title || !bodyText) {
      return NextResponse.json({ error: "title e body richiesti" }, { status: 400 });
    }

    const result = await sendPushToMaterialsAdmins({
      title,
      body: bodyText,
      link,
      excludeUserId,
    });

    return NextResponse.json({ ok: true, ...result });
  } catch (e: unknown) {
    console.error("push-notify:", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Errore sconosciuto" },
      { status: 500 }
    );
  }
}
