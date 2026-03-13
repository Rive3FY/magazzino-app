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

export async function POST() {
  try {
    const serverSupabase = await createServerClient();
    const { data: { user } } = await serverSupabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Non autenticato" }, { status: 401 });
    }
    const access = await loadServerAdminAccess(serverSupabase);
    if (!access.isSuperAdmin) {
      return NextResponse.json({ error: "Solo il super admin può fare il reset attrezzature" }, { status: 403 });
    }

    const admin = getSupabaseAdmin();

    const { error: errMov } = await admin.from("equipment_movements").delete().neq("id", "00000000-0000-0000-0000-000000000000");
    if (errMov) return NextResponse.json({ error: errMov.message }, { status: 500 });

    const { error: errAssets } = await admin.from("equipment_assets").delete().neq("id", "00000000-0000-0000-0000-000000000000");
    if (errAssets) return NextResponse.json({ error: errAssets.message }, { status: 500 });

    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Errore sconosciuto";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
