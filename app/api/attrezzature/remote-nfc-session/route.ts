import { createClient } from "../../../_lib/supabase/server";
import { NextResponse } from "next/server";

function randomCode(length: number): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let s = "";
  for (let i = 0; i < length; i++) {
    s += chars[Math.floor(Math.random() * chars.length)];
  }
  return s;
}

export async function POST(req: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Non autenticato" }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const { context, equipmentId, equipmentIds, area } = body as {
      context?: string;
      equipmentId?: string;
      equipmentIds?: string[];
      area?: string;
    };

    if (!context || !["equipment_associate", "movement_select"].includes(context)) {
      return NextResponse.json({ error: "Context non valido" }, { status: 400 });
    }

    const contextData: Record<string, unknown> = {};
    if (equipmentId) contextData.equipmentId = equipmentId;
    if (equipmentIds?.length) contextData.equipmentIds = equipmentIds;
    if (area) contextData.area = area;

    let code: string | undefined;
    for (let i = 0; i < 5; i++) {
      const c = randomCode(6);
      const { data: existing } = await supabase
        .from("remote_nfc_sessions")
        .select("id")
        .eq("code", c)
        .maybeSingle();
      if (!existing) {
        code = c;
        break;
      }
    }
    if (!code) {
      return NextResponse.json({ error: "Impossibile generare codice univoco" }, { status: 500 });
    }

    const { error } = await supabase.from("remote_nfc_sessions").insert({
      code,
      context,
      context_data: contextData,
      created_by: user.id,
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ code });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Errore sconosciuto";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function GET(req: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Non autenticato" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const code = searchParams.get("code")?.trim();
    if (!code) {
      return NextResponse.json({ error: "Codice mancante" }, { status: 400 });
    }

    const { data, error } = await supabase
      .from("remote_nfc_sessions")
      .select("id, context, context_data, nfc_tag_id, nfc_tag_ids, created_at, expires_at")
      .eq("code", code)
      .eq("created_by", user.id)
      .maybeSingle();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (!data) {
      return NextResponse.json({ error: "Sessione non trovata o scaduta" }, { status: 404 });
    }

    const expiresAt = new Date(data.expires_at).getTime();
    if (Date.now() > expiresAt) {
      return NextResponse.json({ error: "Sessione scaduta" }, { status: 410 });
    }

    const nfcTagIds = Array.isArray(data.nfc_tag_ids)
      ? data.nfc_tag_ids
      : (data.nfc_tag_ids as string[] | null)
        ? [...(data.nfc_tag_ids as string[])]
        : data.nfc_tag_id
          ? [data.nfc_tag_id]
          : [];

    return NextResponse.json({
      context: data.context,
      contextData: data.context_data,
      nfcTagId: data.nfc_tag_id,
      nfcTagIds,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Errore sconosciuto";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
