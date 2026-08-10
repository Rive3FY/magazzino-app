export type DefinitivaFields = {
  codiceSap: string;
  descrizione: string;
  divisione: string;
  oggettoContabile: string;
  ordineAcquisto: string;
  entrataMerci: string;
  responsabile: string;
};

export const DEFINITIVA_STORAGE_KEY = "etichette-definitiva-overrides-v1";
export const DEFINITIVA_DOC_CODE = "a08IO035RE";
export const DEFINITIVA_DOC_TITLE = "Modulo per etichettatura materiale";

/** Formato fisico come etichetta stampata / allegato a08IO035RE (landscape). */
export const DEFINITIVA_LABEL_WIDTH_MM = 180;
export const DEFINITIVA_LABEL_HEIGHT_MM = 56;
export const DEFINITIVA_QR_COL_MM = 30;

export const DEFINITIVA_FIELD_LABELS: { key: keyof DefinitivaFields; label: string; editableHint?: string }[] = [
  { key: "codiceSap", label: "Codice Materiale SAP" },
  { key: "descrizione", label: "Descrizione Materiale" },
  { key: "divisione", label: "Divisione SAP" },
  { key: "oggettoContabile", label: "Oggetto contabile (WBE/Ntw/OdM)", editableHint: "Compilabile dall'app" },
  { key: "ordineAcquisto", label: "Ordine di Acquisto (Opzionale)", editableHint: "Opzionale" },
  { key: "entrataMerci", label: "Entrata Merci SAP (Opzionale)", editableHint: "Opzionale" },
  { key: "responsabile", label: "Responsabile/Addetto", editableHint: "Compilabile dall'app" },
];

function str(value: unknown) {
  return String(value ?? "").trim();
}

/** Come sull'etichetta reale: solo codice divisione (es. 2606). */
export function formatDivisioneSap(rowJson: Record<string, unknown> | null | undefined) {
  return str(rowJson?.["Divisione"]) || str(rowJson?.["Descrizione Divisione"]) || "";
}

export function suggestOggettoContabile(rowJson: Record<string, unknown> | null | undefined) {
  return (
    str(rowJson?.["Descrizione Contab."]) ||
    str(rowJson?.["Finalità di Utilizzo"]) ||
    str(rowJson?.["Descrizione Profit Center"]) ||
    str(rowJson?.["Profit Center"]) ||
    ""
  );
}

export function buildDefinitivaDefaults(input: {
  code: string;
  name: string;
  rowJson?: Record<string, unknown> | null;
  responsabile?: string;
}): DefinitivaFields {
  return {
    codiceSap: input.code,
    descrizione: input.name || input.code,
    divisione: formatDivisioneSap(input.rowJson),
    oggettoContabile: suggestOggettoContabile(input.rowJson),
    ordineAcquisto: "",
    entrataMerci: "",
    responsabile: input.responsabile ?? "",
  };
}

export function mergeDefinitivaFields(
  defaults: DefinitivaFields,
  override?: Partial<DefinitivaFields> | null
): DefinitivaFields {
  if (!override) return defaults;
  return {
    codiceSap: override.codiceSap ?? defaults.codiceSap,
    descrizione: override.descrizione ?? defaults.descrizione,
    divisione: override.divisione ?? defaults.divisione,
    oggettoContabile: override.oggettoContabile ?? defaults.oggettoContabile,
    ordineAcquisto: override.ordineAcquisto ?? defaults.ordineAcquisto,
    entrataMerci: override.entrataMerci ?? defaults.entrataMerci,
    responsabile: override.responsabile ?? defaults.responsabile,
  };
}

export function loadDefinitivaOverrides(): Record<string, Partial<DefinitivaFields>> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(DEFINITIVA_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, Partial<DefinitivaFields>>;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

export function saveDefinitivaOverrides(map: Record<string, Partial<DefinitivaFields>>) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(DEFINITIVA_STORAGE_KEY, JSON.stringify(map));
  } catch {
    // ignore quota / private mode
  }
}

export function definitivaPrintStyles(): string {
  return `
@page{size:A4;margin:8mm 10mm}
*{box-sizing:border-box}
body{margin:0;padding:0;background:#fff;font-family:Arial,Helvetica,sans-serif;color:#000}
.definitiva-print-stack{display:flex;flex-direction:column;gap:5mm;width:${DEFINITIVA_LABEL_WIDTH_MM}mm}
.definitiva-label{
  width:${DEFINITIVA_LABEL_WIDTH_MM}mm;
  height:${DEFINITIVA_LABEL_HEIGHT_MM}mm;
  border:0.7pt solid #000;
  break-inside:avoid;
  page-break-inside:avoid;
  overflow:hidden;
  background:#fff;
}
.definitiva-grid{
  width:100%;
  height:100%;
  border-collapse:collapse;
  table-layout:fixed;
}
.definitiva-grid th,
.definitiva-grid td{
  border:0.7pt solid #000;
  padding:0.8mm 1.6mm;
  vertical-align:middle;
  font-size:8.2px;
  line-height:1.15;
  background:#fff;
  color:#000;
}
.definitiva-brand{
  width:38%;
  padding:1.2mm 1.8mm !important;
  vertical-align:middle !important;
}
.definitiva-brand-spacer{padding:0 !important}
.definitiva-brand-inner{
  display:flex;
  flex-direction:column;
  align-items:flex-start;
  justify-content:center;
  gap:0.6mm;
  min-height:9mm;
}
.definitiva-logo{height:6.2mm;width:auto;display:block}
.definitiva-doc{
  font-size:6.4px;
  font-weight:400;
  letter-spacing:0;
  line-height:1.1;
  white-space:nowrap;
}
.definitiva-label-cell{
  width:38%;
  text-align:left;
  font-weight:400;
  white-space:nowrap;
}
.definitiva-value-cell{
  width:auto;
  font-weight:400;
  word-break:break-word;
  overflow:hidden;
}
.definitiva-qr-cell{
  width:${DEFINITIVA_QR_COL_MM}mm;
  padding:1.2mm !important;
  text-align:center;
  vertical-align:middle !important;
}
.definitiva-qr-cell svg{
  width:24mm !important;
  height:24mm !important;
  display:block;
  margin:0 auto;
}
`.trim();
}

export function buildDefinitivaLabelHtml(
  fields: DefinitivaFields,
  opts: { logoHtml: string; qrHtml: string; esc: (s: string) => string }
) {
  const { logoHtml, qrHtml, esc } = opts;
  const rowCount = DEFINITIVA_FIELD_LABELS.length;
  const fieldRows = DEFINITIVA_FIELD_LABELS.map(
    ({ key, label }) => `<tr>
  <th class="definitiva-label-cell">${esc(label)}</th>
  <td class="definitiva-value-cell">${esc(fields[key] || "")}</td>
</tr>`
  ).join("");

  return `<div class="definitiva-label">
  <table class="definitiva-grid">
    <colgroup>
      <col style="width:38%" />
      <col />
      <col style="width:${DEFINITIVA_QR_COL_MM}mm" />
    </colgroup>
    <tr>
      <td class="definitiva-brand">
        <div class="definitiva-brand-inner">
          ${logoHtml}
          <div class="definitiva-doc">${esc(DEFINITIVA_DOC_CODE)} ${esc(DEFINITIVA_DOC_TITLE)}</div>
        </div>
      </td>
      <td class="definitiva-value-cell definitiva-brand-spacer"></td>
      <td class="definitiva-qr-cell" rowspan="${rowCount + 1}">${qrHtml}</td>
    </tr>
    ${fieldRows}
  </table>
</div>`;
}
