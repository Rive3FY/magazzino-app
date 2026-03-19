/**
 * Rileva errori PostgREST/Postgres tipici di tabella assente o non esposta nello schema API.
 * Non trattare come "tabella mancante" errori di rete, RLS, ecc.
 */
export function isRelationMissingOrNotExposedError(
  error: { message?: string | null; code?: string | null; details?: string | null } | null | undefined
): boolean {
  if (!error) return false;
  const msg = String(error.message ?? "").toLowerCase();
  const details = String(error.details ?? "").toLowerCase();
  const code = String(error.code ?? "");

  if (msg === "skip") return false;

  if (msg.includes("404")) return true;
  if (msg.includes("not found") && (msg.includes("table") || msg.includes("relation") || msg.includes("schema"))) return true;
  if (msg.includes("could not find the table")) return true;
  if (msg.includes("does not exist") && (msg.includes("relation") || msg.includes("table"))) return true;
  if (msg.includes("schema cache")) return true;

  // PostgREST: oggetto non trovato nello schema esposto
  if (code === "PGRST116" || code === "PGRST205") return true;

  // SQLSTATE: undefined_table (a volte propagato)
  if (code === "42P01") return true;

  if (details.includes("404")) return true;

  return false;
}
