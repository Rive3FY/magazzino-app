import { createClient } from "../../../_lib/supabase/server";
import { NextResponse } from "next/server";
import { loadServerAdminAccess } from "../../../_lib/admin-access";

export async function POST() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Non autenticato" }, { status: 401 });
    }
    const access = await loadServerAdminAccess(supabase);
    if (!access.isSuperAdmin) {
      return NextResponse.json({ error: "Solo super admin" }, { status: 403 });
    }

    const { error } = await supabase.from("force_logout_events").insert({});

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Errore";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
