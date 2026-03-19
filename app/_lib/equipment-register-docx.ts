import { DOMParser, XMLSerializer } from "@xmldom/xmldom";

const WORD_NS = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";

/** Capacità righe dati per pagina: il template originale prevede 23 righe. */
const REGISTER_PAGE_CAPACITY = 23;

export type EquipmentRegisterArea = "LINEE" | "STAZIONI";

export type EquipmentRegisterAsset = {
  id: string;
  asset_code: string;
  serial_number: string | null;
  name: string;
  equipment_area: EquipmentRegisterArea;
};

export type EquipmentRegisterMovement = {
  id: string;
  created_at: string;
  equipment_id: string;
  equipment_area: EquipmentRegisterArea;
  status: "OPEN" | "CLOSED" | null;
  note: string | null;
  destination: string | null;
  intervention_plan_number: string | null;
  created_by: string | null;
  created_by_name: string | null;
  assigned_to_name: string | null;
  resolution_type: "RETURN" | "MAINTENANCE" | "DISMISS" | null;
  close_note: string | null;
  closed_at: string | null;
  closed_by: string | null;
  movement_group_id: string | null;
};

export type EquipmentRegisterRow = {
  prelievoItem: string;
  prelievoNominativo: string;
  prelievoData: string;
  destinazione: string;
  riconsegnaNominativo: string;
  riconsegnaData: string;
};

export function getEquipmentRegisterHeader(area: EquipmentRegisterArea, sedeDi?: string) {
  return {
    unitaProduttiva: "U.I. Maddaloni",
    sedeDi: (sedeDi ?? "").trim(),
  };
}

function formatDateOnly(iso: string | null) {
  if (!iso) return "";
  return new Intl.DateTimeFormat("it-IT", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(iso));
}

export function buildEquipmentRegisterRows(args: {
  assets: EquipmentRegisterAsset[];
  movements: EquipmentRegisterMovement[];
  createdByNameMap?: Record<string, string>;
  closedByNameMap?: Record<string, string>;
}) {
  const { assets, movements, createdByNameMap = {}, closedByNameMap = {} } = args;
  const assetMap = new Map(assets.map((asset) => [asset.id, asset]));

  // Una riga per ogni movimento (anche con carrello: ogni item nel carrello = una riga)
  const sorted = movements.slice().sort((a, b) => a.created_at.localeCompare(b.created_at));

  return sorted.map((movement) => {
    const asset = assetMap.get(movement.equipment_id);
    const prelievoItem =
      asset?.serial_number || asset?.asset_code || movement.intervention_plan_number || "";

    const prelievoNominativo =
      (movement.created_by ? createdByNameMap[movement.created_by] ?? "" : "") ||
      movement.assigned_to_name ||
      movement.created_by_name ||
      "";

    const isClosed = (movement.status ?? "OPEN") === "CLOSED";
    const riconsegnaNominativo = isClosed
      ? (movement.closed_by ? closedByNameMap[movement.closed_by] ?? "" : "") ||
        movement.assigned_to_name ||
        movement.created_by_name ||
        ""
      : "";

    return {
      prelievoItem,
      prelievoNominativo,
      prelievoData: formatDateOnly(movement.created_at),
      destinazione: movement.destination || movement.note || "",
      riconsegnaNominativo,
      riconsegnaData: isClosed && movement.closed_at ? formatDateOnly(movement.closed_at) : "",
    } satisfies EquipmentRegisterRow;
  });
}

function nodeListToArray<T>(list: ArrayLike<T>) {
  return Array.from({ length: list.length }, (_, index) => list[index]!);
}

function isTableRow(node: Node): node is Element {
  if (!node || node.nodeType !== 1) return false;
  const el = node as Element;
  const tag = (el.tagName || el.localName || "").toLowerCase();
  return tag === "w:tr" || tag === "tr";
}

function getDirectTableRows(table: Element) {
  return nodeListToArray(table.childNodes).filter(isTableRow);
}

function isTableCell(node: Node): node is Element {
  if (!node || node.nodeType !== 1) return false;
  const el = node as Element;
  const tag = (el.tagName || el.localName || "").toLowerCase();
  return tag === "w:tc" || tag === "tc";
}

function getRowCells(row: Element) {
  return nodeListToArray(row.childNodes).filter(isTableCell);
}

function clearCellContent(cell: Element) {
  const removable = nodeListToArray(cell.childNodes).filter(
    (node) => !(node.nodeType === 1 && (node as Element).tagName === "w:tcPr")
  );
  for (const node of removable) {
    cell.removeChild(node);
  }
}

function setCellText(doc: Document, cell: Element, text: string) {
  clearCellContent(cell);
  const paragraph = doc.createElementNS(WORD_NS, "w:p");
  const run = doc.createElementNS(WORD_NS, "w:r");
  const textNode = doc.createElementNS(WORD_NS, "w:t");
  textNode.setAttribute("xml:space", "preserve");
  textNode.appendChild(doc.createTextNode(text));
  run.appendChild(textNode);
  paragraph.appendChild(run);
  cell.appendChild(paragraph);
}

function setRowValues(doc: Document, row: Element, values: EquipmentRegisterRow) {
  const cells = getRowCells(row);
  const ordered = [
    values.prelievoItem,
    values.prelievoNominativo,
    values.prelievoData,
    values.destinazione,
    values.riconsegnaNominativo,
    values.riconsegnaData,
  ];

  ordered.forEach((value, index) => {
    const cell = cells[index];
    if (cell) setCellText(doc, cell, value);
  });
}

function createPageBreakParagraph(doc: Document) {
  const paragraph = doc.createElementNS(WORD_NS, "w:p");
  const run = doc.createElementNS(WORD_NS, "w:r");
  const pageBreak = doc.createElementNS(WORD_NS, "w:br");
  pageBreak.setAttribute("w:type", "page");
  run.appendChild(pageBreak);
  paragraph.appendChild(run);
  return paragraph;
}

function fillRegisterTablePage(args: {
  doc: Document;
  table: Element;
  area: EquipmentRegisterArea;
  rows: EquipmentRegisterRow[];
  sedeDi?: string;
}) {
  const { doc, table, area, rows, sedeDi } = args;
  const tableRows = getDirectTableRows(table);
  if (tableRows.length < 5) {
    throw new Error("Struttura tabella DOCX non valida.");
  }

  const header = getEquipmentRegisterHeader(area, sedeDi);
  const headerCells = getRowCells(tableRows[0]!);
  if (headerCells[0]) setCellText(doc, headerCells[0], `Unità Produttiva: ${header.unitaProduttiva}`);
  if (headerCells[1]) setCellText(doc, headerCells[1], `Sede di: ${header.sedeDi}`);

  const templateRow = tableRows[4]!.cloneNode(true) as Element;
  const pageCapacity = Math.max(tableRows.length - 4, REGISTER_PAGE_CAPACITY);

  for (let index = tableRows.length - 1; index >= 4; index -= 1) {
    table.removeChild(tableRows[index]!);
  }

  const dataRows = rows.length > 0 ? rows.slice(0, pageCapacity) : [emptyRegisterRow()];
  const paddedRows = [...dataRows];
  while (paddedRows.length < pageCapacity) {
    paddedRows.push(emptyRegisterRow());
  }
  for (const rowValues of paddedRows) {
    const row = templateRow.cloneNode(true) as Element;
    setRowValues(doc, row, rowValues);
    table.appendChild(row);
  }
}

export function buildEquipmentRegisterDocx(args: {
  templateBuffer: Buffer;
  area: EquipmentRegisterArea;
  rows: EquipmentRegisterRow[];
}) {
  const parser = new DOMParser();
  const serializer = new XMLSerializer();
  const zip = args.templateBuffer;
  return { parser, serializer, zip };
}

export function getEquipmentRegisterPageCount(args: {
  documentXml: string;
  rowCount: number;
}) {
  const doc = new DOMParser().parseFromString(args.documentXml, "application/xml");
  const table = doc.getElementsByTagName("w:tbl")[0];
  if (!table) {
    throw new Error("Tabella registro non trovata nel template DOCX.");
  }

  const templatePageRows = getDirectTableRows(table);
  if (templatePageRows.length < 5) {
    throw new Error("Struttura tabella DOCX non valida.");
  }

  const pageCapacity = Math.max(templatePageRows.length - 4, REGISTER_PAGE_CAPACITY);
  const effectiveRowCount = Math.max(1, args.rowCount);
  return Math.max(1, Math.ceil(effectiveRowCount / pageCapacity));
}

export function fillEquipmentRegisterDocumentXml(args: {
  documentXml: string;
  area: EquipmentRegisterArea;
  rows: EquipmentRegisterRow[];
  sedeDi?: string;
}) {
  const doc = new DOMParser().parseFromString(args.documentXml, "application/xml");
  const serializer = new XMLSerializer();
  const table = doc.getElementsByTagName("w:tbl")[0];
  if (!table) {
    throw new Error("Tabella registro non trovata nel template DOCX.");
  }
  const parent = table.parentNode;
  if (!parent) {
    throw new Error("Nodo tabella DOCX non valido.");
  }

  const templatePageRows = getDirectTableRows(table);
  if (templatePageRows.length < 5) {
    throw new Error("Struttura tabella DOCX non valida.");
  }

  const pageCapacity = Math.max(templatePageRows.length - 4, REGISTER_PAGE_CAPACITY);
  const effectiveRows = args.rows.length > 0 ? args.rows : [emptyRegisterRow()];
  const pageCount = Math.max(1, Math.ceil(effectiveRows.length / pageCapacity));

  for (let pageIndex = 0; pageIndex < pageCount; pageIndex += 1) {
    const pageTable = table.cloneNode(true) as Element;
    const pageRows = effectiveRows.slice(pageIndex * pageCapacity, (pageIndex + 1) * pageCapacity);
    fillRegisterTablePage({
      doc,
      table: pageTable,
      area: args.area,
      rows: pageRows,
      sedeDi: args.sedeDi,
    });

    if (pageIndex > 0) {
      parent.insertBefore(createPageBreakParagraph(doc), table);
    }
    parent.insertBefore(pageTable, table);
  }

  parent.removeChild(table);

  return serializer.serializeToString(doc);
}

export type WarehouseSection = {
  warehouse: string;
  rows: EquipmentRegisterRow[];
};

export function getEquipmentRegisterPageCountMultiWarehouse(args: {
  documentXml: string;
  sections: WarehouseSection[];
}) {
  let total = 0;
  for (const section of args.sections) {
    total += getEquipmentRegisterPageCount({
      documentXml: args.documentXml,
      rowCount: section.rows.length,
    });
  }
  return Math.max(1, total);
}

export function fillEquipmentRegisterDocumentXmlMultiWarehouse(args: {
  documentXml: string;
  area: EquipmentRegisterArea;
  sections: WarehouseSection[];
}) {
  const doc = new DOMParser().parseFromString(args.documentXml, "application/xml");
  const serializer = new XMLSerializer();
  const table = doc.getElementsByTagName("w:tbl")[0];
  if (!table) {
    throw new Error("Tabella registro non trovata nel template DOCX.");
  }
  const parent = table.parentNode;
  if (!parent) {
    throw new Error("Nodo tabella DOCX non valido.");
  }

  const templatePageRows = getDirectTableRows(table);
  if (templatePageRows.length < 5) {
    throw new Error("Struttura tabella DOCX non valida.");
  }

  const pageCapacity = Math.max(templatePageRows.length - 4, REGISTER_PAGE_CAPACITY);
  let isFirst = true;

  for (const section of args.sections) {
    const effectiveRows = section.rows.length > 0 ? section.rows : [emptyRegisterRow()];
    const pageCount = Math.max(1, Math.ceil(effectiveRows.length / pageCapacity));

    for (let pageIndex = 0; pageIndex < pageCount; pageIndex += 1) {
      const pageTable = table.cloneNode(true) as Element;
      const pageRows = effectiveRows.slice(pageIndex * pageCapacity, (pageIndex + 1) * pageCapacity);
      fillRegisterTablePage({
        doc,
        table: pageTable,
        area: args.area,
        rows: pageRows,
        sedeDi: section.warehouse,
      });

      if (!isFirst || pageIndex > 0) {
        parent.insertBefore(createPageBreakParagraph(doc), table);
      }
      parent.insertBefore(pageTable, table);
      isFirst = false;
    }
  }

  parent.removeChild(table);

  return serializer.serializeToString(doc);
}

export function fillEquipmentRegisterHeaderXml(args: {
  headerXml: string;
  year?: number;
  pageCount?: number;
}) {
  const doc = new DOMParser().parseFromString(args.headerXml, "application/xml");
  const serializer = new XMLSerializer();
  const table = doc.getElementsByTagName("w:tbl")[0];
  if (!table) {
    throw new Error("Tabella intestazione DOCX non trovata.");
  }

  const rows = getDirectTableRows(table);
  if (rows.length < 2) {
    throw new Error("Struttura intestazione DOCX non valida.");
  }

  const headerYear = String(args.year ?? new Date().getFullYear());
  const firstRowCells = getRowCells(rows[0]!);
  const secondRowCells = getRowCells(rows[1]!);

  if (firstRowCells[2]) setCellText(doc, firstRowCells[2], `Anno: ${headerYear}`);
  if (secondRowCells[2]) setCellText(doc, secondRowCells[2], `N° Foglio: 1 / ${String(args.pageCount ?? 1)}`);

  return serializer.serializeToString(doc);
}

function emptyRegisterRow(): EquipmentRegisterRow {
  return {
    prelievoItem: "",
    prelievoNominativo: "",
    prelievoData: "",
    destinazione: "",
    riconsegnaNominativo: "",
    riconsegnaData: "",
  };
}
