import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createClient as createServerClient } from "../../_lib/supabase/server";
import { loadServerAdminAccess } from "../../_lib/admin-access";

type WarehouseKind = "PRM" | "REALE";

function isSetupMissingError(message: string) {
  const normalized = message.toLowerCase();
  return (
    normalized.includes("could not find the table") ||
    normalized.includes("schema cache") ||
    normalized.includes("relation") && normalized.includes("does not exist") ||
    normalized.includes("bucket not found")
  );
}

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

function sanitizeFilename(filename: string) {
  return filename.replace(/[^a-zA-Z0-9._-]/g, "_");
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

export async function GET() {
  try {
    const auth = await requireAdmin();
    if (auth.error) return auth.error;

    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("import_file_backups")
      .select("id,created_at,warehouse,original_filename,content_type,file_size,row_count,uploaded_by_email")
      .order("created_at", { ascending: false })
      .limit(50);

    if (error) {
      if (isSetupMissingError(error.message)) {
        return NextResponse.json({
          files: [],
          setupRequired: true,
          message: "Archivio backup non ancora attivato su Supabase. Esegui prima lo script SQL.",
        });
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ files: data ?? [] });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const auth = await requireAdmin();
    if (auth.error) return auth.error;

    const formData = await request.formData();
    const file = formData.get("file");
    const warehouse = String(formData.get("warehouse") ?? "").trim() as WarehouseKind;
    const rowCountRaw = Number(formData.get("rowCount") ?? 0);

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "File mancante" }, { status: 400 });
    }

    if (warehouse !== "PRM" && warehouse !== "REALE") {
      return NextResponse.json({ error: "Magazzino non valido" }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();
    const safeName = sanitizeFilename(file.name || "import.xlsx");
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const storagePath = `${warehouse}/${timestamp}_${safeName}`;

    const { error: uploadError } = await supabase.storage
      .from("import-backups")
      .upload(storagePath, file, {
        contentType: file.type || "application/octet-stream",
        upsert: false,
      });

    if (uploadError) {
      if (isSetupMissingError(uploadError.message)) {
        return NextResponse.json(
          { error: "Backup file non attivo: esegui prima lo script SQL su Supabase per creare bucket e tabella." },
          { status: 503 }
        );
      }
      return NextResponse.json({ error: uploadError.message }, { status: 500 });
    }

    const { error: insertError } = await supabase.from("import_file_backups").insert({
      warehouse,
      original_filename: file.name || safeName,
      storage_path: storagePath,
      content_type: file.type || null,
      file_size: file.size,
      row_count: Number.isFinite(rowCountRaw) ? rowCountRaw : null,
      uploaded_by: auth.user.id,
      uploaded_by_email: auth.user.email ?? null,
    });

    if (insertError) {
      await supabase.storage.from("import-backups").remove([storagePath]);
      if (isSetupMissingError(insertError.message)) {
        return NextResponse.json(
          { error: "Backup file non attivo: esegui prima lo script SQL su Supabase per creare bucket e tabella." },
          { status: 503 }
        );
      }
      return NextResponse.json({ error: insertError.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
