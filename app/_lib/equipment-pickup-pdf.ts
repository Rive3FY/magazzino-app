import jsPDF from "jspdf";
import type { EquipmentAssetRow, EquipmentMovementRow } from "./types";

export type EquipmentPickupPdfRow = {
  matricola: string;
  descrizione: string;
  categoria: string;
  ubicazione: string;
};

export type EquipmentPickupPdfSheet = {
  area: string;
  magazzino: string;
  dataOra: string;
  assegnatario: string;
  destinazione: string;
  pianoIntervento: string;
  operatore: string;
  note: string;
  movementKey: string;
  rows: EquipmentPickupPdfRow[];
};

const PAGE_W = 210;
const PAGE_H = 297;
const MARGIN_X = 12;
const CONTENT_W = PAGE_W - MARGIN_X * 2;
const ROWS_PER_PAGE = 20;
const TITLE = "REGISTRO USCITA ATTREZZATURE";

const COLS = {
  matricola: 38,
  descrizione: 78,
  categoria: 34,
  ubicazione: 36,
} as const;

function clean(value: unknown) {
  return String(value ?? "").trim().replace(/\s+/g, " ");
}

function truncate(value: string, max: number) {
  const text = clean(value);
  return text.length <= max ? text : `${text.slice(0, Math.max(0, max - 1))}…`;
}

function formatDateTimeIt(value: string | null | undefined) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("it-IT", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function getDetail(movement: EquipmentMovementRow, key: string) {
  return clean(movement.details_json?.[key]);
}

function movementKey(movements: EquipmentMovementRow[]) {
  const lead = movements[0];
  if (!lead) return "";
  return clean(lead.movement_group_id) || lead.id;
}

export function buildEquipmentPickupPdfSheet(
  movements: EquipmentMovementRow[],
  assets: EquipmentAssetRow[]
): EquipmentPickupPdfSheet {
  const ordered = movements.slice().sort((a, b) => a.created_at.localeCompare(b.created_at));
  const lead = ordered[0];
  if (!lead) {
    throw new Error("Nessun movimento da includere nel registro.");
  }

  const assetMap = new Map(assets.map((asset) => [asset.id, asset]));
  const warehouses = Array.from(
    new Set(
      ordered
        .map((movement) => clean(assetMap.get(movement.equipment_id)?.warehouse))
        .filter(Boolean)
    )
  );

  return {
    area: lead.equipment_area === "STAZIONI" ? "Stazioni" : "Linee",
    magazzino: warehouses.join(" · "),
    dataOra: formatDateTimeIt(lead.created_at),
    assegnatario:
      [clean(lead.assigned_to_name), lead.assigned_to_badge ? `Badge ${clean(lead.assigned_to_badge)}` : ""]
        .filter(Boolean)
        .join(" · ") || clean(lead.assigned_to_email),
    destinazione: clean(lead.destination),
    pianoIntervento: clean(lead.intervention_plan_number),
    operatore: clean(lead.created_by_name) || clean(lead.created_by_email),
    note: clean(lead.note),
    movementKey: movementKey(ordered),
    rows: ordered.map((movement) => {
      const asset = assetMap.get(movement.equipment_id);
      return {
        matricola:
          clean(asset?.serial_number) ||
          clean(asset?.asset_code) ||
          getDetail(movement, "asset_code") ||
          movement.equipment_id,
        descrizione: clean(asset?.name) || getDetail(movement, "asset_name") || "—",
        categoria: clean(asset?.category),
        ubicazione: [clean(asset?.shelf), clean(asset?.place)].filter(Boolean).join(" · "),
      };
    }),
  };
}

async function loadImageAsDataUrl(src: string): Promise<{ dataUrl: string; width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = image.naturalWidth || image.width;
      canvas.height = image.naturalHeight || image.height;
      const context = canvas.getContext("2d");
      if (!context) {
        reject(new Error("Canvas non disponibile"));
        return;
      }
      context.drawImage(image, 0, 0);
      resolve({
        dataUrl: canvas.toDataURL("image/png"),
        width: canvas.width,
        height: canvas.height,
      });
    };
    image.onerror = () => reject(new Error("Logo non disponibile"));
    image.src = src;
  });
}

function drawPage(
  pdf: jsPDF,
  sheet: EquipmentPickupPdfSheet,
  rows: EquipmentPickupPdfRow[],
  logo: { dataUrl: string; width: number; height: number } | null,
  pageIndex: number,
  pageCount: number
) {
  const gray = { r: 88, g: 96, b: 106 };
  const line = { r: 150, g: 156, b: 164 };
  const text = { r: 20, g: 20, b: 20 };
  let y = 10;
  let logoW = 0;
  let logoH = 12;

  if (logo) {
    logoW = 42;
    logoH = (logo.height * logoW) / logo.width;
    pdf.addImage(logo.dataUrl, "PNG", MARGIN_X, y, logoW, logoH);
  }

  const titleX = MARGIN_X + logoW + (logoW ? 4 : 0);
  const titleH = Math.max(logoH, 12);
  pdf.setFillColor(gray.r, gray.g, gray.b);
  pdf.rect(titleX, y, CONTENT_W - logoW - (logoW ? 4 : 0), titleH, "F");
  pdf.setTextColor(255, 255, 255);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(11);
  pdf.text(TITLE, titleX + 3, y + titleH / 2 + 1.2);
  y += titleH + 4;

  const metaRows: Array<[string, string]> = [
    ["Area / magazzino:", [sheet.area, sheet.magazzino].filter(Boolean).join(" · ")],
    ["Data e ora uscita:", sheet.dataOra],
    ["Assegnatario:", sheet.assegnatario],
    ["Destinazione:", sheet.destinazione],
    ["Piano intervento:", sheet.pianoIntervento],
    ["Operatore:", sheet.operatore],
    ["N. attrezzature:", String(sheet.rows.length)],
  ];

  pdf.setDrawColor(line.r, line.g, line.b);
  pdf.setLineWidth(0.35);
  for (const [label, value] of metaRows) {
    const valueLines = pdf.splitTextToSize(value || "—", CONTENT_W - 58);
    const rowH = valueLines.length > 1 ? 10 : 7.5;
    pdf.setFillColor(245, 246, 247);
    pdf.rect(MARGIN_X, y, 54, rowH, "F");
    pdf.rect(MARGIN_X, y, CONTENT_W, rowH, "S");
    pdf.line(MARGIN_X + 54, y, MARGIN_X + 54, y + rowH);
    pdf.setTextColor(text.r, text.g, text.b);
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(8);
    pdf.text(label, MARGIN_X + 2, y + 5);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(8.5);
    pdf.text(valueLines.slice(0, 2), MARGIN_X + 56, y + 5);
    y += rowH;
  }

  y += 3;
  const headers: Array<{ key: keyof typeof COLS; label: string }> = [
    { key: "matricola", label: "MATRICOLA / SERIALE" },
    { key: "descrizione", label: "DESCRIZIONE ATTREZZATURA" },
    { key: "categoria", label: "CATEGORIA" },
    { key: "ubicazione", label: "UBICAZIONE" },
  ];
  const headerH = 9;
  const rowH = 7.5;
  let x = MARGIN_X;

  pdf.setFillColor(gray.r, gray.g, gray.b);
  pdf.rect(MARGIN_X, y, CONTENT_W, headerH, "F");
  pdf.setTextColor(255, 255, 255);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(7.2);
  for (const header of headers) {
    const width = COLS[header.key];
    pdf.rect(x, y, width, headerH, "S");
    pdf.text(header.label, x + 1.5, y + 5.8);
    x += width;
  }
  y += headerH;

  pdf.setTextColor(text.r, text.g, text.b);
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(7.8);
  for (let index = 0; index < ROWS_PER_PAGE; index += 1) {
    const row = rows[index];
    x = MARGIN_X;
    if (index % 2 === 1) {
      pdf.setFillColor(248, 249, 250);
      pdf.rect(MARGIN_X, y, CONTENT_W, rowH, "F");
    }
    pdf.setDrawColor(line.r, line.g, line.b);
    pdf.rect(MARGIN_X, y, CONTENT_W, rowH, "S");
    const values: Record<keyof typeof COLS, string> = {
      matricola: row ? truncate(row.matricola, 23) : "",
      descrizione: row ? truncate(row.descrizione, 48) : "",
      categoria: row ? truncate(row.categoria, 18) : "",
      ubicazione: row ? truncate(row.ubicazione, 20) : "",
    };
    for (const header of headers) {
      const width = COLS[header.key];
      pdf.line(x + width, y, x + width, y + rowH);
      pdf.text(values[header.key], x + 1.3, y + 5);
      x += width;
    }
    y += rowH;
  }

  y += 4;
  const noteH = 14;
  pdf.setFillColor(245, 246, 247);
  pdf.rect(MARGIN_X, y, CONTENT_W, noteH, "F");
  pdf.rect(MARGIN_X, y, CONTENT_W, noteH, "S");
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(8);
  pdf.text("NOTE USCITA:", MARGIN_X + 2, y + 5);
  pdf.setFont("helvetica", "normal");
  pdf.text(pdf.splitTextToSize(sheet.note || "—", CONTENT_W - 28).slice(0, 2), MARGIN_X + 25, y + 5);

  y += noteH + 7;
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(8.5);
  pdf.text("Firma consegna:", MARGIN_X, y);
  pdf.line(MARGIN_X + 28, y + 1, MARGIN_X + 82, y + 1);
  pdf.text("Firma ricevente:", MARGIN_X + 96, y);
  pdf.line(MARGIN_X + 125, y + 1, PAGE_W - MARGIN_X, y + 1);

  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(7.5);
  pdf.setTextColor(120, 120, 120);
  pdf.text(`Pagina ${pageIndex} / ${pageCount}`, PAGE_W - MARGIN_X, PAGE_H - 8, { align: "right" });
}

export async function downloadEquipmentPickupPdf(
  sheet: EquipmentPickupPdfSheet,
  options: { filename?: string } = {}
) {
  if (sheet.rows.length === 0) {
    throw new Error("Nessuna attrezzatura da includere nel registro.");
  }

  let logo: { dataUrl: string; width: number; height: number } | null = null;
  try {
    logo = await loadImageAsDataUrl("/terna-logo.svg");
  } catch {
    logo = null;
  }

  const chunks: EquipmentPickupPdfRow[][] = [];
  for (let index = 0; index < sheet.rows.length; index += ROWS_PER_PAGE) {
    chunks.push(sheet.rows.slice(index, index + ROWS_PER_PAGE));
  }

  const pdf = new jsPDF("p", "mm", "a4");
  chunks.forEach((rows, index) => {
    if (index > 0) pdf.addPage();
    drawPage(pdf, sheet, rows, logo, index + 1, chunks.length);
  });

  const safeKey = sheet.movementKey.replace(/[^a-zA-Z0-9_-]+/g, "-").slice(0, 36) || "uscita";
  pdf.save(options.filename ?? `registro_uscita_attrezzature_${safeKey}.pdf`);
}
