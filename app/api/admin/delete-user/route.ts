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

type DetachStep = { table: string; column: string };

/** Colonne pubbliche che puntano a auth.users (fallback se le FK non sono ancora SET NULL). */
const DETACH_STEPS: DetachStep[] = [
  { table: "movements", column: "created_by" },
  { table: "movements", column: "closed_by" },
  { table: "audit_log", column: "user_id" },
  { table: "excel_live_requests", column: "requested_by" },
  { table: "excel_live_requests", column: "reviewed_by" },
  { table: "equipment_movements", column: "created_by" },
  { table: "equipment_movements", column: "closed_by" },
  { table: "equipment_assets", column: "uploaded_by" },
  { table: "equipment_assets", column: "technical_sheet_uploaded_by" },
  { table: "remote_nfc_sessions", column: "created_by" },
  { table: "app_notifications", column: "actor_id" },
];

function formatAuthError(error: unknown): string {
  if (!error) return "Errore sconosciuto eliminazione utente";
  if (typeof error === "string") return error;
  if (error instanceof Error && error.message.trim()) return error.message;
  if (typeof error === "object") {
    const e = error as Record<string, unknown>;
    const parts = [e.message, e.error, e.error_description, e.msg, e.code]
      .map((v) => (typeof v === "string" ? v.trim() : ""))
      .filter(Boolean);
    if (parts.length > 0) return parts.join(" · ");
    try {
      const json = JSON.stringify(error);
      if (json && json !== "{}") return json;
    } catch {
      /* ignore */
    }
  }
  return "Database error deleting user (probabile vincolo FK verso auth.users). Esegui la migration 20260810194500_auth_users_fk_on_delete.sql su Supabase.";
}

async function detachUserReferences(
  admin: ReturnType<typeof getSupabaseAdmin>,
  targetUserId: string
) {
  const warnings: string[] = [];

  for (const step of DETACH_STEPS) {
    try {
      const { error } = await admin
        .from(step.table)
        .update({ [step.column]: null } as never)
        .eq(step.column, targetUserId);
      if (error && !/does not exist|schema cache|Could not find/i.test(error.message)) {
        warnings.push(`${step.table}.${step.column}: ${error.message}`);
      }
    } catch (e) {
      warnings.push(`${step.table}.${step.column}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  // Storage objects non sempre accessibili via PostgREST public — le FK SET NULL li gestiscono dopo la migration.
  return warnings;
}

export async function POST(request: Request) {
  try {
    const serverSupabase = await createServerClient();
    const {
      data: { user },
    } = await serverSupabase.auth.getUser();
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

    const detachWarnings = await detachUserReferences(admin, targetUserId);

    const { error } = await admin.auth.admin.deleteUser(targetUserId);
    if (error) {
      const detail = formatAuthError(error);
      console.error("deleteUser failed:", error, { detachWarnings });
      return NextResponse.json(
        {
          error: detail,
          hint:
            "Se l'errore parla di foreign key, esegui su Supabase SQL Editor il file supabase/migrations/20260810194500_auth_users_fk_on_delete.sql",
          detachWarnings: detachWarnings.length ? detachWarnings : undefined,
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      detachWarnings: detachWarnings.length ? detachWarnings : undefined,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Errore sconosciuto";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
