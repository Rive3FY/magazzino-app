export type CartRow = {
  code: string;
  name: string;
  um: string | null;
  warehouse: "PRM" | "REALE";
  qtyAvailable: number;
  qtyPick: number;
};

export type QuickMaterialInfo = {
  code: string;
  name: string;
  um: string | null;
  warehouse: "PRM" | "REALE";
  qtyFree: number;
  qtyBlocked: number;
  qtyQuality: number;
};

export type DbItem = {
  code: string;
  name: string;
  um: string | null;
};

export type MovementRow = {
  id: string;
  created_at: string;
  type: "IN" | "OUT";
  code: string;
  qty: number;
  note: string | null;
  warehouse: "PRM" | "REALE" | null;
  created_by: string | null;
  created_by_name: string | null;
  status: "OPEN" | "CLOSED" | null;
  returned_qty: number | null;
  return_note: string | null;
  referent_id: string | null;
  referee_email: string | null;
  referee_name: string | null;
  closed_at: string | null;
  closed_by: string | null;
};

export type ReferentRow = {
  id: string;
  name: string;
  email: string;
  is_active: boolean;
};

export type ExcelLiveRow = {
  code: string;
  warehouse: "PRM" | "REALE";
  qty_free: number | null;
  qty_blocked: number | null;
  qty_quality: number | null;
  row_json: Record<string, unknown> | null;
};

export type WarehouseView = "REALE" | "PRM" | "TUTTI";
export type SortDir = "none" | "asc" | "desc";
