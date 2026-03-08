export type Item = {
  code: string;              // Materiale
  name: string;              // Descrizione Materiale
  initialQty: number;        // TOTALE
  um?: string;

  division?: string;
  divisionDesc?: string;

  warehouse?: string;
  warehouseDesc?: string;

  groupDesc?: string;

  qtyFree?: number;
  qtyBlocked?: number;
  qtyQuality?: number;
};

export type Movement = {
  id: string;
  date: string; // ISO
  type: "IN" | "OUT";
  code: string;
  qty: number;
  note?: string;
};

const ITEMS_KEY = "magazzino_items_v4";
const MOV_KEY = "magazzino_movements_v4";

function toNumber(v: unknown): number {
  const s = String(v ?? "").trim().replace(",", ".");
  const n = typeof v === "number" ? v : Number(s);
  return Number.isFinite(n) ? n : 0;
}

export function getItems(): Item[] {
  if (typeof window === "undefined") return [];
  const raw = localStorage.getItem(ITEMS_KEY);
  return raw ? (JSON.parse(raw) as Item[]) : [];
}

export function setItems(items: Item[]) {
  localStorage.setItem(ITEMS_KEY, JSON.stringify(items));
}

export function upsertManyItems(incoming: Item[]) {
  const map = new Map(getItems().map((i) => [i.code, i]));
  for (const it of incoming) {
    if (!it.code) continue;
    map.set(it.code, it);
  }
  setItems(Array.from(map.values()).sort((a, b) => a.code.localeCompare(b.code)));
}

export function getMovements(): Movement[] {
  if (typeof window === "undefined") return [];
  const raw = localStorage.getItem(MOV_KEY);
  return raw ? (JSON.parse(raw) as Movement[]) : [];
}

export function addMovement(m: Omit<Movement, "id" | "date">) {
  const movement: Movement = {
    id: crypto.randomUUID(),
    date: new Date().toISOString(),
    ...m,
    qty: toNumber(m.qty),
  };
  localStorage.setItem(MOV_KEY, JSON.stringify([movement, ...getMovements()]));
  return movement;
}

export function deleteMovement(id: string) {
  const next = getMovements().filter((m) => m.id !== id);
  localStorage.setItem(MOV_KEY, JSON.stringify(next));
}

export function clearAll() {
  localStorage.removeItem(ITEMS_KEY);
  localStorage.removeItem(MOV_KEY);
}

export function computeAllStocks(): Array<Item & { stock: number }> {
  const items = getItems();
  const delta = new Map<string, number>();

  for (const m of getMovements()) {
    delta.set(m.code, (delta.get(m.code) ?? 0) + (m.type === "IN" ? m.qty : -m.qty));
  }

  return items.map((it) => ({
    ...it,
    stock: (it.initialQty ?? 0) + (delta.get(it.code) ?? 0),
  }));
}

export function getStockByCode(code: string): number {
  const item = getItems().find((i) => i.code === code);
  const initial = item?.initialQty ?? 0;

  let delta = 0;
  for (const m of getMovements()) {
    if (m.code !== code) continue;
    delta += m.type === "IN" ? m.qty : -m.qty;
  }
  return initial + delta;
}