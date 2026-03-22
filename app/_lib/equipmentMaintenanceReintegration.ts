import { buildEquipmentStatusUpdate } from "./equipment";
import { createClient } from "./supabase/client";
import type { EquipmentArea } from "./types";

type SupabaseBrowser = ReturnType<typeof createClient>;

function normStatus(s: string | null | undefined) {
  return String(s ?? "").trim().toUpperCase();
}

function isMissingPostgrestRpcError(error: { message?: string; code?: string }) {
  const m = String(error.message ?? "").toLowerCase();
  return (
    error.code === "PGRST202" ||
    m.includes("could not find the function") ||
    m.includes("schema cache") ||
    m.includes("42883")
  );
}

function mapReintegrateRpcError(message: string): string {
  const m = message.toLowerCase();
  if (m.includes("open_movement_exists") || m.includes("open_movement")) {
    return "Non puoi reintegrare: c'è un movimento aperto su questa attrezzatura.";
  }
  if (m.includes("not_authorized")) {
    return "Non hai permesso di reintegrare questa attrezzatura.";
  }
  if (m.includes("equipment_not_found")) {
    return "Attrezzatura non trovata.";
  }
  if (m.includes("invalid_status_for_reintegration")) {
    return "Solo un'attrezzatura in manutenzione può essere reintegrata da qui.";
  }
  if (m.includes("auth_required")) {
    return "Devi essere autenticato.";
  }
  return message;
}

async function applyEquipmentMaintenanceReintegrationViaUpdate(
  supabase: SupabaseBrowser,
  input: {
    equipmentId: string;
    userId: string | null;
    userEmail: string | null;
    userDisplayName: string | null;
  }
) {
  const { data: openRow, error: openErr } = await supabase
    .from("equipment_movements")
    .select("id")
    .eq("equipment_id", input.equipmentId)
    .eq("status", "OPEN")
    .limit(1)
    .maybeSingle();

  if (openErr) throw new Error(openErr.message);
  if (openRow?.id) {
    throw new Error("Non puoi reintegrare: c'è un movimento aperto su questa attrezzatura.");
  }

  const payload = buildEquipmentStatusUpdate("AVAILABLE");
  const { data: updatedRow, error: upErr } = await supabase
    .from("equipment_assets")
    .update(payload as never)
    .eq("id", input.equipmentId)
    .select("id, status, equipment_area")
    .maybeSingle();

  if (upErr) throw new Error(upErr.message);
  if (!updatedRow) {
    throw new Error(
      "Nessuna riga aggiornata sul database. Possibili cause: permessi RLS o attrezzatura non trovata. Esegui la migration SQL reintegrate_equipment_after_maintenance sul progetto Supabase."
    );
  }

  const st = normStatus((updatedRow as { status?: string }).status);
  if (st !== "AVAILABLE") {
    throw new Error(`Reintegro non applicato: stato ricevuto “${(updatedRow as { status?: string }).status ?? "?"}”.`);
  }

  const resolvedArea = (updatedRow as { equipment_area?: EquipmentArea }).equipment_area;
  if (resolvedArea !== "LINEE" && resolvedArea !== "STAZIONI") {
    throw new Error("Area attrezzature non valida dopo il reintegro.");
  }

  await recordMaintenanceReintegrationOnMovement(supabase, {
    equipmentArea: resolvedArea,
    equipmentId: input.equipmentId,
    userId: input.userId,
    userEmail: input.userEmail,
    userDisplayName: input.userDisplayName,
  });
}

/**
 * Reintegro MAINTENANCE → AVAILABLE da UI (Manutenzioni / gestione stato).
 * Ordine: API server (service role) → RPC SQL → UPDATE dal browser con risposta PostgREST.
 */
export async function applyEquipmentMaintenanceReintegration(
  supabase: SupabaseBrowser,
  input: {
    equipmentId: string;
    userId: string | null;
    userEmail: string | null;
    userDisplayName: string | null;
  }
): Promise<void> {
  if (typeof window !== "undefined") {
    try {
      const res = await fetch("/api/attrezzature/reintegrate-after-maintenance", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ equipmentId: input.equipmentId }),
      });
      let json: { ok?: boolean; noop?: boolean; error?: string } = {};
      try {
        json = (await res.json()) as typeof json;
      } catch {
        /* ignore */
      }

      if (res.ok && (json.ok === true || json.noop === true)) {
        /* L'API ha già verificato la riga aggiornata; una seconda SELECT dal browser può dare falsi negativi (cache/replica). */
        return;
      }

      if (res.status === 503) {
        /* service role assente: continua con RPC / update browser */
      } else {
        throw new Error(json.error ?? `Reintegro non riuscito (${res.status})`);
      }
    } catch (e) {
      if (e instanceof Error && e.message !== "Failed to fetch" && !e.message.startsWith("Load failed")) {
        throw e;
      }
      /* rete / server dev spento: fallback */
    }
  }

  const { data: rpcData, error: rpcError } = await supabase.rpc("reintegrate_equipment_after_maintenance", {
    p_equipment_id: input.equipmentId,
  });

  if (!rpcError) {
    const body = rpcData as Record<string, unknown> | null;
    const rpcOk =
      body?.ok === true ||
      body?.ok === "true" ||
      normStatus(typeof body?.status === "string" ? body.status : String(body?.status ?? "")) === "AVAILABLE";
    if (rpcOk) {
      return;
    }
    throw new Error("Reintegro: risposta dal server non riconosciuta.");
  }

  if (!isMissingPostgrestRpcError(rpcError)) {
    throw new Error(mapReintegrateRpcError(rpcError.message ?? "Errore reintegro"));
  }

  await applyEquipmentMaintenanceReintegrationViaUpdate(supabase, input);
}

/**
 * Quando un admin reintegra un'attrezzatura (stato MAINTENANCE → AVAILABLE),
 * annota data e operatore sull'ultimo movimento chiuso con esito manutenzione,
 * così la sezione Manutenzioni può mostrare il reintegro senza nuove colonne DB.
 */
export async function recordMaintenanceReintegrationOnMovement(
  supabase: SupabaseBrowser,
  input: {
    equipmentArea: EquipmentArea;
    equipmentId: string;
    userId: string | null;
    userEmail: string | null;
    userDisplayName: string | null;
  }
): Promise<void> {
  const now = new Date().toISOString();

  let displayName = input.userDisplayName?.trim() || null;
  if (!displayName && input.userId) {
    const { data: p } = await supabase.from("profiles").select("first_name,last_name").eq("id", input.userId).maybeSingle();
    const fn = String((p as { first_name?: string | null } | null)?.first_name ?? "").trim();
    const ln = String((p as { last_name?: string | null } | null)?.last_name ?? "").trim();
    const full = `${fn} ${ln}`.trim();
    if (full) displayName = full;
  }

  const { data: mov, error: qErr } = await supabase
    .from("equipment_movements")
    .select("id, details_json")
    .eq("equipment_id", input.equipmentId)
    .eq("equipment_area", input.equipmentArea)
    .eq("resolution_type", "MAINTENANCE")
    .eq("status", "CLOSED")
    .order("closed_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (qErr || !mov || typeof (mov as { id?: unknown }).id !== "string") {
    if (qErr) console.warn("maintenance reintegration: query movement", qErr.message);
    return;
  }

  const row = mov as { id: string; details_json: Record<string, unknown> | null };
  const existing = row.details_json && typeof row.details_json === "object" ? { ...row.details_json } : {};
  const nextDetails = {
    ...existing,
    maintenance_reintegrated_at: now,
    maintenance_reintegrated_by: input.userId,
    maintenance_reintegrated_by_email: input.userEmail,
    maintenance_reintegrated_by_name: displayName,
  };

  const { error: uErr } = await supabase
    .from("equipment_movements")
    .update({ details_json: nextDetails } as never)
    .eq("id", row.id);

  if (uErr) console.warn("maintenance reintegration: update movement", uErr.message);
}
