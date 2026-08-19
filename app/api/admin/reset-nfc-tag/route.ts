import { createClient as createServerClient } from "../../../_lib/supabase/server";
import { NextResponse } from "next/server";
import { loadServerAdminAccess } from "../../../_lib/admin-access";

export async function POST(request: Request) {
  try {
    const serverSupabase = await createServerClient();
    const { data: { user } } = await serverSupabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Non autenticato" }, { status: 401 });
    }
    const access = await loadServerAdminAccess(serverSupabase);
    if (!access.isSuperAdmin) {
      return NextResponse.json({ error: "Solo il super admin può resettare i tag NFC" }, { status: 403 });
    }

    const body = await request.json();
    const nfcTagId = typeof body?.nfcTagId === "string" ? body.nfcTagId.trim() : "";
    if (!nfcTagId) {
      return NextResponse.json({ error: "nfcTagId richiesto" }, { status: 400 });
    }

    const { data: eqData, error: eqErr } = await serverSupabase
      .from("equipment_assets")
      .update({ nfc_tag_id: null })
      .eq("nfc_tag_id", nfcTagId)
      .select("id");

    const { data: shelfData, error: shelfErr } = await serverSupabase
      .from("material_shelves")
      .update({ nfc_tag_id: null })
      .eq("nfc_tag_id", nfcTagId)
      .select("code,warehouse");

    if (eqErr || shelfErr) {
      const msg = eqErr?.message ?? shelfErr?.message ?? "Errore aggiornamento";
      return NextResponse.json({ error: msg }, { status: 500 });
    }

    const eqCount = eqData?.length ?? 0;
    const shelfCount = shelfData?.length ?? 0;

    return NextResponse.json({
      ok: true,
      equipmentReset: eqCount,
      shelvesReset: shelfCount,
      message: eqCount > 0 || shelfCount > 0
        ? `Tag NFC resettato. ${eqCount} attrezzatura/e, ${shelfCount} posizione/i aggiornati.`
        : "Nessuna associazione trovata per questo tag NFC.",
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Errore sconosciuto";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
