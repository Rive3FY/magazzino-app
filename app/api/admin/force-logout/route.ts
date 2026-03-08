import { createClient } from "../../../_lib/supabase/server";
import { NextResponse } from "next/server";

export async function POST() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Non autenticato" }, { status: 401 });
    }
    const { data: isAdm, error: errAdmin } = await supabase.rpc("is_admin");
    if (errAdmin || !isAdm) {
      return NextResponse.json({ error: "Solo admin" }, { status: 403 });
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
