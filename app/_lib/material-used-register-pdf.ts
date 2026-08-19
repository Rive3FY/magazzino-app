import jsPDF from "jspdf";
import type { MovementRow } from "./types";
import { parsePickupNote } from "./pickupNote";

export type RegisterShelfInfo = { shelf: string; place: string };
export type RegisterNameMap = Record<string, string>;

export type MaterialUsedRegisterRow = {
  matricola: string;
  descrizione: string;
  scaffale: string;
  posizione: string;
  qtyPrelevata: number;
  qtyUtilizzata: number | null; // null = non ancora compilata (uscita aperta / senza rientro)
};

export type MaterialUsedRegisterSheet = {
  impianto: string;
  descrizioneLavori: string;
  tecnico: string;
  data: string;
  note: string;
  rows: MaterialUsedRegisterRow[];
};

const TITLE = "TABELLA MATERIALE UTILIZZATO DTSUD_UMD";
const PAGE_W = 210;
const PAGE_H = 297;
const MARGIN_X = 12;
const CONTENT_W = PAGE_W - MARGIN_X * 2;
const ROWS_PER_PAGE = 18;

const COLS = {
  matricola: 26,
  descrizione: 70,
  scaffale: 22,
  posizione: 24,
  prelevata: 22,
  utilizzata: 22,
} as const;

function n(value: unknown) {
  const num = Number(value ?? 0);
  return Number.isFinite(num) ? num : 0;
}

function fmtDateIt(iso: string | null | undefined) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

function truncate(text: string, max: number) {
  const t = text.trim();
  if (t.length <= max) return t;
  return `${t.slice(0, Math.max(0, max - 1))}…`;
}

/** Nome referente così com’è salvato (solo trim / spazi). */
export function formatRegisterPersonName(value: string) {
  return String(value ?? "")
    .trim()
    .replace(/\s+/g, " ");
}

/** Toglie gli zeri iniziali dalla matricola (es. 000000000001003906 → 1003906). */
export function formatRegisterMatricola(code: string) {
  const raw = String(code ?? "").trim();
  if (!raw) return "";
  const stripped = raw.replace(/^0+/, "");
  return stripped || "0";
}

async function loadImageAsDataUrl(src: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = img.naturalWidth || img.width;
      canvas.height = img.naturalHeight || img.height;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        reject(new Error("Canvas context non disponibile"));
        return;
      }
      ctx.drawImage(img, 0, 0);
      resolve(canvas.toDataURL("image/png"));
    };
    img.onerror = () => reject(new Error("Impossibile caricare il logo Terna"));
    img.src = src;
  });
}

function groupKeyForMovement(row: MovementRow) {
  const gid = String(row.movement_group_id ?? "").trim();
  if (gid) return `g:${gid}`;
  const note = parsePickupNote(String(row.note ?? ""));
  const day = fmtDateIt(row.created_at);
  const tecnico = formatRegisterPersonName(String(row.referee_name ?? row.referee_email ?? ""));
  return `s:${day}|${note.destination}|${note.workDescription}|${tecnico}|${row.id}`;
}

/** Solo uscite: prelevata sempre; utilizzata solo se chiusa (qty usata = prelevata - rientrata). */
export function buildMaterialUsedRegisterSheets(
  movements: MovementRow[],
  opts: {
    nameMap?: RegisterNameMap;
    shelvesByCodeWh?: Record<string, Partial<Record<"PRM" | "REALE", RegisterShelfInfo>>>;
  } = {}
): MaterialUsedRegisterSheet[] {
  const outs = movements
    .filter((m) => m.type === "OUT")
    .slice()
    .sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));

  const groups = new Map<string, MovementRow[]>();
  for (const row of outs) {
    const key = groupKeyForMovement(row);
    const list = groups.get(key) ?? [];
    list.push(row);
    groups.set(key, list);
  }

  const sheets: MaterialUsedRegisterSheet[] = [];

  for (const rows of groups.values()) {
    const lead = rows[0];
    if (!lead) continue;
    const parsed = parsePickupNote(String(lead.note ?? ""));
    const noteParts = rows
      .map((r) => String(r.return_note ?? "").trim())
      .filter(Boolean);
    const uniqueNotes = Array.from(new Set(noteParts));

    sheets.push({
      impianto: parsed.destination || "",
      descrizioneLavori: parsed.workDescription || "",
      tecnico:
        formatRegisterPersonName(String(lead.referee_name ?? "")) ||
        formatRegisterPersonName(String(lead.referee_email ?? "")),
      data: fmtDateIt(lead.closed_at || lead.created_at),
      note: uniqueNotes.join(" · "),
      rows: rows.map((r) => {
        const wh = (r.warehouse === "REALE" ? "REALE" : "PRM") as "PRM" | "REALE";
        const shelfInfo = opts.shelvesByCodeWh?.[r.code]?.[wh];
        const prelevata = Math.abs(n(r.qty));
        const returned = Math.max(0, n(r.returned_qty));
        const isClosed = r.status === "CLOSED";
        return {
          matricola: formatRegisterMatricola(r.code),
          descrizione: opts.nameMap?.[r.code] || r.code,
          scaffale: shelfInfo?.shelf || "",
          posizione: shelfInfo?.place || "",
          qtyPrelevata: prelevata,
          qtyUtilizzata: isClosed ? Math.max(0, prelevata - returned) : null,
        };
      }),
    });
  }

  return sheets;
}

function drawFormPage(
  pdf: jsPDF,
  sheet: MaterialUsedRegisterSheet,
  pageRows: Array<MaterialUsedRegisterRow | null>,
  logoDataUrl: string | null,
  logoW: number,
  logoH: number,
  pageIndex: number,
  pageCount: number
) {
  const gray = { r: 88, g: 96, b: 106 };
  const line = { r: 150, g: 156, b: 164 };
  const text = { r: 20, g: 20, b: 20 };

  let y = 10;

  if (logoDataUrl) {
    pdf.addImage(logoDataUrl, "PNG", MARGIN_X, y, logoW, logoH);
  }

  const titleX = MARGIN_X + logoW + 4;
  const titleH = Math.max(logoH, 12);
  pdf.setFillColor(gray.r, gray.g, gray.b);
  pdf.rect(titleX, y, CONTENT_W - logoW - 4, titleH, "F");
  pdf.setTextColor(255, 255, 255);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(11);
  pdf.text(TITLE, titleX + 3, y + titleH / 2 + 1.2);

  y += titleH + 4;

  const metaRows: Array<[string, string]> = [
    ["IMPIANTO (linea/stazione):", sheet.impianto],
    ["Descrizione Lavori:", sheet.descrizioneLavori],
    ["Tecnico:", sheet.tecnico],
    ["DATA:", sheet.data],
  ];

  pdf.setDrawColor(line.r, line.g, line.b);
  pdf.setLineWidth(0.35);

  for (const [label, value] of metaRows) {
    const valueText = String(value || "").trim();
    const valueLines = pdf.splitTextToSize(valueText, CONTENT_W - 62);
    const lineCount = Math.max(1, Math.min(2, valueLines.length));
    const rowH = lineCount > 1 ? 11 : 8;
    pdf.setFillColor(245, 246, 247);
    pdf.rect(MARGIN_X, y, 58, rowH, "F");
    pdf.rect(MARGIN_X, y, CONTENT_W, rowH, "S");
    pdf.line(MARGIN_X + 58, y, MARGIN_X + 58, y + rowH);
    pdf.setTextColor(text.r, text.g, text.b);
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(8);
    pdf.text(label, MARGIN_X + 2, y + (lineCount > 1 ? 4.2 : 5.2));
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(9);
    pdf.text(valueLines.slice(0, 2), MARGIN_X + 60, y + (lineCount > 1 ? 4.2 : 5.2));
    y += rowH;
  }

  y += 3;

  const colOrder: Array<{ key: keyof typeof COLS; label: string; align?: "left" | "right" | "center" }> = [
    { key: "matricola", label: "MATRICOLA" },
    { key: "descrizione", label: "DESCRIZIONE MATERIALE" },
    { key: "scaffale", label: "Posizione", align: "center" },
    { key: "posizione", label: "Posizione", align: "center" },
    { key: "prelevata", label: "Q.tà Prelevata", align: "center" },
    { key: "utilizzata", label: "Q.tà Utilizzata", align: "center" },
  ];

  const headerH = 10;
  const rowH = 8.2;
  let x = MARGIN_X;

  pdf.setFillColor(gray.r, gray.g, gray.b);
  pdf.rect(MARGIN_X, y, CONTENT_W, headerH, "F");
  pdf.setTextColor(255, 255, 255);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(7.5);

  for (const col of colOrder) {
    const w = COLS[col.key];
    pdf.rect(x, y, w, headerH, "S");
    const labelY = y + 6.2;
    if (col.align === "center") {
      pdf.text(col.label, x + w / 2, labelY, { align: "center" });
    } else {
      pdf.text(col.label, x + 1.5, labelY);
    }
    x += w;
  }
  y += headerH;

  pdf.setTextColor(text.r, text.g, text.b);
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(8);

  for (let i = 0; i < ROWS_PER_PAGE; i++) {
    const row = pageRows[i] ?? null;
    x = MARGIN_X;
    if (i % 2 === 1) {
      pdf.setFillColor(248, 249, 250);
      pdf.rect(MARGIN_X, y, CONTENT_W, rowH, "F");
    }
    pdf.setDrawColor(line.r, line.g, line.b);
    pdf.rect(MARGIN_X, y, CONTENT_W, rowH, "S");

    const values: Record<keyof typeof COLS, string> = {
      matricola: row ? truncate(row.matricola, 18) : "",
      descrizione: row ? truncate(row.descrizione, 42) : "",
      scaffale: row ? truncate(row.scaffale, 10) : "",
      posizione: row ? truncate(row.posizione, 12) : "",
      prelevata: row ? String(row.qtyPrelevata) : "",
      utilizzata: row && row.qtyUtilizzata !== null ? String(row.qtyUtilizzata) : "",
    };

    for (const col of colOrder) {
      const w = COLS[col.key];
      pdf.line(x + w, y, x + w, y + rowH);
      const val = values[col.key];
      const ty = y + 5.4;
      if (col.align === "center") pdf.text(val, x + w / 2, ty, { align: "center" });
      else pdf.text(val, x + 1.4, ty);
      x += w;
    }
    y += rowH;
  }

  y += 4;
  const noteH = 14;
  pdf.setFillColor(245, 246, 247);
  pdf.rect(MARGIN_X, y, CONTENT_W, noteH, "F");
  pdf.setDrawColor(line.r, line.g, line.b);
  pdf.rect(MARGIN_X, y, CONTENT_W, noteH, "S");
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(8);
  pdf.setTextColor(text.r, text.g, text.b);
  pdf.text("NOTE:", MARGIN_X + 2, y + 5);
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(8);
  const noteLines = pdf.splitTextToSize(sheet.note || "", CONTENT_W - 20);
  pdf.text(noteLines.slice(0, 2), MARGIN_X + 16, y + 5);

  y += noteH + 6;
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(9);
  pdf.text("Firma:", MARGIN_X, y);
  pdf.setDrawColor(line.r, line.g, line.b);
  pdf.line(MARGIN_X + 18, y + 1, MARGIN_X + 90, y + 1);

  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(7.5);
  pdf.setTextColor(120, 120, 120);
  pdf.text(`Pagina ${pageIndex} / ${pageCount}`, PAGE_W - MARGIN_X, PAGE_H - 8, { align: "right" });
}

export async function downloadMaterialUsedRegisterPdf(
  sheets: MaterialUsedRegisterSheet[],
  opts: { filename?: string } = {}
) {
  if (sheets.length === 0) {
    throw new Error("Nessuna uscita da includere nel registro.");
  }

  const pdf = new jsPDF("p", "mm", "a4");
  let logoDataUrl: string | null = null;
  let logoW = 42;
  let logoH = 13;
  try {
    logoDataUrl = await loadImageAsDataUrl("/terna-logo.svg");
    const img = new Image();
    img.src = logoDataUrl;
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error("logo"));
    });
    logoH = (img.height * logoW) / img.width;
  } catch {
    logoDataUrl = null;
    logoW = 0;
    logoH = 12;
  }

  const pagePlans: Array<{ sheet: MaterialUsedRegisterSheet; rows: Array<MaterialUsedRegisterRow | null> }> = [];
  for (const sheet of sheets) {
    const chunks: MaterialUsedRegisterRow[][] = [];
    if (sheet.rows.length === 0) {
      chunks.push([]);
    } else {
      for (let i = 0; i < sheet.rows.length; i += ROWS_PER_PAGE) {
        chunks.push(sheet.rows.slice(i, i + ROWS_PER_PAGE));
      }
    }
    for (const chunk of chunks) {
      const padded: Array<MaterialUsedRegisterRow | null> = [...chunk];
      while (padded.length < ROWS_PER_PAGE) padded.push(null);
      pagePlans.push({ sheet, rows: padded });
    }
  }

  const pageCount = pagePlans.length;
  pagePlans.forEach((plan, index) => {
    if (index > 0) pdf.addPage();
    drawFormPage(pdf, plan.sheet, plan.rows, logoDataUrl, logoW, logoH, index + 1, pageCount);
  });

  const filename = opts.filename ?? `tabella_materiale_utilizzato_${new Date().toISOString().slice(0, 10)}.pdf`;
  pdf.save(filename);
}
