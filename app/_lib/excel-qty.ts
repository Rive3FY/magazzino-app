/** Parsing quantità Excel: supporta 1234,56 / 1.234,56 / 1,234.56. */
export function parseExcelQuantity(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;

  let raw = String(value).trim().replace(/\u00a0/g, " ").replace(/\s+/g, "");
  if (!raw || raw === "-" || raw === "—") return null;

  const negative = raw.startsWith("-");
  if (negative) raw = raw.slice(1);

  if (/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(raw)) {
    raw = raw.replace(/\./g, "").replace(",", ".");
  } else if (/^\d{1,3}(,\d{3})+(\.\d+)?$/.test(raw)) {
    raw = raw.replace(/,/g, "");
  } else if (raw.includes(",") && !raw.includes(".")) {
    raw = raw.replace(",", ".");
  }

  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return null;
  return negative ? -parsed : parsed;
}

export function readTotaleQuantity(rowJson: Record<string, unknown> | null | undefined): number | null {
  if (!rowJson) return null;
  for (const [key, value] of Object.entries(rowJson)) {
    const normalized = key
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/\u00a0/g, " ")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .trim();
    if (normalized !== "totale") continue;
    if (value === "" || value === null || value === undefined) return 0;
    return parseExcelQuantity(value);
  }
  return null;
}

/**
 * Giacenza corretta: TOTALE del file più i movimenti già applicati
 * rispetto alla quantità usata al momento dell'import.
 */
export function rebaseQtyToTotale(totale: number, importedBaseline: number, currentQty: number): number {
  return totale + (currentQty - importedBaseline);
}

export function qtyAlreadyOnTotale(importedBaseline: number, totale: number): boolean {
  return Math.abs(importedBaseline - totale) < 0.000001;
}
