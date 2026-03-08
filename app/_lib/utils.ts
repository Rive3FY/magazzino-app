export function fmtDate(iso: string): string {
  const d = new Date(iso);
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();
  const hh = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  return `${dd}/${mm}/${yyyy} ${hh}:${mi}`;
}

export function fmtDateTime(iso: string): string {
  if (!iso) return "-";
  return new Date(iso).toLocaleString("it-IT");
}

export function n(v: unknown): number {
  const x = Number(v ?? 0);
  return Number.isFinite(x) ? x : 0;
}

export function toNumber(v: unknown): number {
  const x = Number(String(v ?? "").trim().replace(",", "."));
  return Number.isFinite(x) ? x : NaN;
}

export function toNumberLoose(v: unknown): number {
  const x = Number(String(v ?? "").trim().replace(",", "."));
  return Number.isFinite(x) ? x : 0;
}

export function toIsoStartOfDay(d: string): string | null {
  if (!d) return null;
  return new Date(`${d}T00:00:00.000`).toISOString();
}

export function toIsoEndOfDay(d: string): string | null {
  if (!d) return null;
  return new Date(`${d}T23:59:59.999`).toISOString();
}

export function sanitizeId(s: string): string {
  return "f_" + s.replace(/\W+/g, "_").toLowerCase();
}
