import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { loadServerAdminAccess } from "../../../_lib/admin-access";
import { createClient as createServerClient } from "../../../_lib/supabase/server";

function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

function normStatus(s: string | null | undefined) {
  return String(s ?? "").trim().toUpperCase();
}

/**
 * Reintegro MAINTENANCE → AVAILABLE usando il service role: aggira RLS/trigger lato REST
 * che in locale o in alcuni progetti possono far sembrare riuscito l’UPDATE dal browser senza persistere.
 */
export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { equipmentId?: string };
    const equipmentId = typeof body.equipmentId === "string" ? body.equipmentId.trim() : "";
    if (!equipmentId) {
      return NextResponse.json({ error: "equipmentId richiesto" }, { status: 400 });
    }

    const serverSupabase = await createServerClient();
    const {
      data: { user },
    } = await serverSupabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Non autenticato" }, { status: 401 });
    }

    const access = await loadServerAdminAccess(serverSupabase);
    const admin = getServiceClient();
    if (!admin) {
      return NextResponse.json(
        {
          error:
            "Manca SUPABASE_SERVICE_ROLE_KEY nel server (.env.local). Aggiungila per reintegrare in modo affidabile, oppure usa la funzione SQL reintegrate_equipment_after_maintenance.",
        },
        { status: 503 }
      );
    }

    const { data: asset, error: assetErr } = await admin
      .from("equipment_assets")
      .select("id, equipment_area, status")
      .eq("id", equipmentId)
      .maybeSingle();

    if (assetErr) {
      return NextResponse.json({ error: assetErr.message }, { status: 500 });
    }
    if (!asset) {
      return NextResponse.json({ error: "Attrezzatura non trovata" }, { status: 404 });
    }

    const area = String((asset as { equipment_area?: string }).equipment_area ?? "");
    if (area !== "LINEE" && area !== "STAZIONI") {
      return NextResponse.json({ error: "Area attrezzature non valida" }, { status: 500 });
    }

    const canManage =
      (area === "LINEE" && access.canManageEquipmentLinee) || (area === "STAZIONI" && access.canManageEquipmentStazioni);
    if (!canManage) {
      return NextResponse.json({ error: "Non autorizzato per questa area attrezzature" }, { status: 403 });
    }

    const { data: openMov } = await admin
      .from("equipment_movements")
      .select("id")
      .eq("equipment_id", equipmentId)
      .eq("equipment_area", area)
      .eq("status", "OPEN")
      .limit(1)
      .maybeSingle();

    if (openMov && typeof (openMov as { id?: unknown }).id === "string") {
      return NextResponse.json({ error: "C'è un movimento aperto su questa attrezzatura" }, { status: 409 });
    }

    const st = normStatus((asset as { status?: string }).status);
    if (st === "AVAILABLE") {
      return NextResponse.json({ ok: true, noop: true, status: "AVAILABLE" });
    }
    if (st !== "MAINTENANCE") {
      return NextResponse.json({ error: "Solo attrezzature in manutenzione possono essere reintegrate da qui" }, { status: 400 });
    }

    const payload = {
      status: "AVAILABLE",
      dismissed_at: null,
      maintenance_note: null,
      assigned_to_name: null,
      assigned_to_email: null,
      assigned_to_badge: null,
      assigned_at: null,
    };

    const { data: updated, error: upErr } = await admin
      .from("equipment_assets")
      .update(payload as never)
      .eq("id", equipmentId)
      .select("id, status")
      .maybeSingle();

    if (upErr) {
      return NextResponse.json({ error: upErr.message }, { status: 500 });
    }
    if (!updated || normStatus((updated as { status?: string }).status) !== "AVAILABLE") {
      return NextResponse.json({ error: "Aggiornamento stato non applicato sul database" }, { status: 500 });
    }

    const { data: mov } = await admin
      .from("equipment_movements")
      .select("id, details_json")
      .eq("equipment_id", equipmentId)
      .eq("equipment_area", area)
      .eq("resolution_type", "MAINTENANCE")
      .eq("status", "CLOSED")
      .not("closed_at", "is", null)
      .order("closed_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (mov && typeof (mov as { id?: unknown }).id === "string") {
      const row = mov as { id: string; details_json: Record<string, unknown> | null };
      const now = new Date().toISOString();
      let displayName: string | null = null;
      const { data: prof } = await admin.from("profiles").select("first_name,last_name").eq("id", user.id).maybeSingle();
      if (prof) {
        const fn = String((prof as { first_name?: string | null }).first_name ?? "").trim();
        const ln = String((prof as { last_name?: string | null }).last_name ?? "").trim();
        const full = `${fn} ${ln}`.trim();
        if (full) displayName = full;
      }
      const existing = row.details_json && typeof row.details_json === "object" ? { ...row.details_json } : {};
      const nextDetails = {
        ...existing,
        maintenance_reintegrated_at: now,
        maintenance_reintegrated_by: user.id,
        maintenance_reintegrated_by_email: user.email ?? null,
        maintenance_reintegrated_by_name: displayName,
      };
      const { error: mErr } = await admin
        .from("equipment_movements")
        .update({ details_json: nextDetails } as never)
        .eq("id", row.id);
      if (mErr) {
        console.error("reintegrate-after-maintenance: movement details_json", mErr.message);
      }
    }

    return NextResponse.json({ ok: true, status: "AVAILABLE" });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Errore sconosciuto";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
