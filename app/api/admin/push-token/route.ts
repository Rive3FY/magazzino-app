import { NextResponse } from "next/server";
import { createClient as createServerClient } from "../../../_lib/supabase/server";
import { loadServerAdminAccess } from "../../../_lib/admin-access";
import { getSupabaseServiceClient } from "../../../_lib/fcmAdmin";

/**
 * Registra / aggiorna il token FCM del dispositivo corrente.
 * Solo admin materiali (o super) — sono i destinatari delle push.
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

    const access = await loadServerAdminAccess(serverSupabase);
    if (!access.canManageMaterials) {
      return NextResponse.json({ error: "Solo admin materiali" }, { status: 403 });
    }

    const body = await request.json().catch(() => ({}));
    const token = String(body?.token ?? "").trim();
    const platform = String(body?.platform ?? "android").trim() || "android";
    if (!token) {
      return NextResponse.json({ error: "token richiesto" }, { status: 400 });
    }

    const admin = getSupabaseServiceClient();
    const { error } = await admin.from("device_push_tokens").upsert(
      {
        user_id: user.id,
        token,
        platform,
        updated_at: new Date().toISOString(),
      } as never,
      { onConflict: "token" }
    );

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Errore sconosciuto" },
      { status: 500 }
    );
  }
}

export async function DELETE(request: Request) {
  try {
    const serverSupabase = await createServerClient();
    const {
      data: { user },
    } = await serverSupabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Non autenticato" }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const token = String(body?.token ?? "").trim();
    if (!token) {
      return NextResponse.json({ error: "token richiesto" }, { status: 400 });
    }

    const { error } = await serverSupabase
      .from("device_push_tokens")
      .delete()
      .eq("user_id", user.id)
      .eq("token", token);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Errore sconosciuto" },
      { status: 500 }
    );
  }
}
