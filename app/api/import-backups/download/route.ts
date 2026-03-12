import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createClient as createServerClient } from "../../../_lib/supabase/server";
import { loadServerAdminAccess } from "../../../_lib/admin-access";

function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceKey) {
    throw new Error("Missing env NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  }

  return createClient(url, serviceKey, {
    auth: { persistSession: false },
  });
}

async function requireAdmin() {
  const serverSupabase = await createServerClient();
  const {
    data: { user },
  } = await serverSupabase.auth.getUser();

  if (!user) {
    return { error: NextResponse.json({ error: "Non autenticato" }, { status: 401 }) };
  }

  const access = await loadServerAdminAccess(serverSupabase);
  if (!access.canManageMaterials) {
    return { error: NextResponse.json({ error: "Accesso negato: solo admin Materiali o super admin" }, { status: 403 }) };
  }

  return { user };
}

export async function GET(request: Request) {
  try {
    const auth = await requireAdmin();
    if (auth.error) return auth.error;

    const { searchParams } = new URL(request.url);
    const id = String(searchParams.get("id") ?? "").trim();
    if (!id) {
      return NextResponse.json({ error: "ID backup mancante" }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();
    const { data: row, error: rowError } = await supabase
      .from("import_file_backups")
      .select("storage_path,original_filename,content_type")
      .eq("id", id)
      .maybeSingle();

    if (rowError) {
      return NextResponse.json({ error: rowError.message }, { status: 500 });
    }

    if (!row) {
      return NextResponse.json({ error: "Backup non trovato" }, { status: 404 });
    }

    const { data: file, error: downloadError } = await supabase.storage
      .from("import-backups")
      .download(row.storage_path);

    if (downloadError || !file) {
      return NextResponse.json({ error: downloadError?.message ?? "File non trovato nello storage" }, { status: 500 });
    }

    const filename = row.original_filename || "import-backup.xlsx";
    return new NextResponse(file, {
      status: 200,
      headers: {
        "Content-Type": row.content_type || "application/octet-stream",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
