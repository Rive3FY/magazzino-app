import { createClient } from "@supabase/supabase-js";
import { createClient as createServerClient } from "../../../_lib/supabase/server";
import { NextResponse } from "next/server";

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
    const { data: isAdm, error: errAdmin } = await serverSupabase.rpc("is_admin");
    if (errAdmin || !isAdm) {
      return NextResponse.json({ error: "Solo admin può fare il reset" }, { status: 403 });
    }

    const admin = getSupabaseAdmin();

    const delAll = (table: string, orFilter: string) =>
      admin.from(table).delete().or(orFilter);

    const nil = "00000000-0000-0000-0000-000000000000";
    const uuidOr = `id.eq.${nil},id.neq.${nil}`;
    const codeOr = "code.eq.,code.neq.";

    const tables: [string, string][] = [
      ["excel_live_requests", uuidOr],
      ["movements", uuidOr],
      ["audit_log", uuidOr],
    ];
    for (const [table, filter] of tables) {
      const { error } = await delAll(table, filter);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const { error: errStocks } = await admin.from("item_stocks").delete().or(codeOr);
    if (errStocks) return NextResponse.json({ error: errStocks.message }, { status: 500 });

    const { error: errLive } = await admin.from("excel_live").delete().or(codeOr);
    if (errLive) return NextResponse.json({ error: errLive.message }, { status: 500 });

    const { error: errOrig } = await admin.from("excel_original").delete().or(codeOr);
    if (errOrig) return NextResponse.json({ error: errOrig.message }, { status: 500 });

    const { error: errItems } = await admin.from("items").delete().or(codeOr);
    if (errItems) return NextResponse.json({ error: errItems.message }, { status: 500 });

    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Errore sconosciuto";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
