import { createClient } from "@supabase/supabase-js";
import { createClient as createServerClient } from "../../../_lib/supabase/server";
import { NextResponse } from "next/server";
import { loadServerAdminAccess } from "../../../_lib/admin-access";

function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY");
  }
  return createClient(url, serviceKey, { auth: { persistSession: false } });
}

export async function POST(request: Request) {
  try {
    const serverSupabase = await createServerClient();
    const { data: { user } } = await serverSupabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Non autenticato" }, { status: 401 });
    }
    const access = await loadServerAdminAccess(serverSupabase);
    if (!access.isSuperAdmin) {
      return NextResponse.json({ error: "Solo il super admin può eliminare utenti" }, { status: 403 });
    }

    const body = await request.json();
    const targetUserId = body?.userId as string | undefined;
    if (!targetUserId) {
      return NextResponse.json({ error: "userId richiesto" }, { status: 400 });
    }

    if (targetUserId === user.id) {
      return NextResponse.json({ error: "Non puoi eliminare il tuo account" }, { status: 400 });
    }

    const admin = getSupabaseAdmin();

    const { error } = await admin.auth.admin.deleteUser(targetUserId);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Errore sconosciuto";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
