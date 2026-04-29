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

function isSetupMissingError(message: string) {
  const normalized = message.toLowerCase();
  return (
    normalized.includes("could not find the table") ||
    normalized.includes("schema cache") ||
    normalized.includes("relation") && normalized.includes("does not exist") ||
    normalized.includes("bucket not found")
  );
}

function chunkArray<T>(items: T[], size: number) {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
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
      return NextResponse.json({ error: "Solo il super admin può fare il reset" }, { status: 403 });
    }

    const admin = getSupabaseAdmin();

    const delAll = (table: string, orFilter: string) =>
      admin.from(table).delete().or(orFilter);

    const nil = "00000000-0000-0000-0000-000000000000";
    const uuidOr = `id.eq.${nil},id.neq.${nil}`;
    const codeOr = "code.eq.,code.neq.";

    const { data: backupRows, error: backupRowsError } = await admin
      .from("import_file_backups")
      .select("storage_path");
    if (backupRowsError && !isSetupMissingError(backupRowsError.message)) {
      return NextResponse.json({ error: backupRowsError.message }, { status: 500 });
    }

    const backupPaths = Array.from(
      new Set(
        (backupRows ?? [])
          .map((row) => String((row as { storage_path?: unknown }).storage_path ?? "").trim())
          .filter(Boolean)
      )
    );

    const tables: [string, string][] = [
      ["excel_live_requests", uuidOr],
      ["movements", uuidOr],
      ["material_shelves", codeOr],
      ["item_stocks", codeOr],
      ["excel_live", codeOr],
      ["excel_original", codeOr],
      ["items", codeOr],
      ["referents", uuidOr],
      ["import_file_backups", uuidOr],
    ];
    for (const [table, filter] of tables) {
      const { error } = await delAll(table, filter);
      if (error && !isSetupMissingError(error.message)) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
    }

    const { error: errAudit } = await admin
      .from("audit_log")
      .delete()
      .in("entity_type", ["material", "movement"]);
    if (errAudit && !isSetupMissingError(errAudit.message)) {
      return NextResponse.json({ error: errAudit.message }, { status: 500 });
    }

    for (const paths of chunkArray(backupPaths, 100)) {
      const { error } = await admin.storage.from("import-backups").remove(paths);
      if (error && !isSetupMissingError(error.message)) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
    }

    return NextResponse.json({ ok: true, deletedBackupFiles: backupPaths.length });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Errore sconosciuto";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
