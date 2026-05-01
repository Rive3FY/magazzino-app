import { createClient as createSupabaseAdmin } from "@supabase/supabase-js";
import { createClient } from "../../../_lib/supabase/server";
import { NextResponse } from "next/server";

function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY");
  }
  return createSupabaseAdmin(url, serviceKey, { auth: { persistSession: false } });
}

export async function POST(req: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Non autenticato" }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const { code, nfcTagId } = body as { code?: string; nfcTagId?: string };
    const sessionCode = code?.trim().toUpperCase();
    const scanValue = nfcTagId?.trim();

    if (!sessionCode || !scanValue) {
      return NextResponse.json({ error: "Codice e nfcTagId obbligatori" }, { status: 400 });
    }

    const admin = getSupabaseAdmin();
    const { data: session, error: fetchError } = await admin
      .from("remote_nfc_sessions")
      .select("id, expires_at, nfc_tag_ids")
      .eq("code", sessionCode)
      .maybeSingle();

    if (fetchError) {
      return NextResponse.json({ error: fetchError.message }, { status: 500 });
    }

    if (!session) {
      return NextResponse.json({ error: "Sessione non trovata" }, { status: 404 });
    }

    const expiresAt = new Date(session.expires_at).getTime();
    if (Date.now() > expiresAt) {
      return NextResponse.json({ error: "Sessione scaduta" }, { status: 410 });
    }

    const existing = Array.isArray(session.nfc_tag_ids)
      ? session.nfc_tag_ids
      : (session.nfc_tag_ids as string[] | null) ?? [];
    const updated = [...existing, scanValue];

    const { error: updateError } = await admin
      .from("remote_nfc_sessions")
      .update({ nfc_tag_ids: updated, nfc_tag_id: scanValue })
      .eq("id", session.id);

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Errore sconosciuto";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
