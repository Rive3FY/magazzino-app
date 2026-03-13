export type CartRow = {
  code: string;
  name: string;
  um: string | null;
  warehouse: "PRM" | "REALE";
  qtyAvailable: number;
  qtyPick: number;
  shelf?: string;
  place?: string;
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
  movement_group_id?: string | null;
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

export type EquipmentArea = "LINEE" | "STAZIONI";
export type EquipmentStatus = "AVAILABLE" | "ASSIGNED" | "MAINTENANCE" | "DISMISSED";

export type EquipmentMovementType = "OUT";
export type EquipmentMovementStatus = "OPEN" | "CLOSED";
export type EquipmentResolutionType = "RETURN" | "MAINTENANCE" | "DISMISS";

export type EquipmentAssetRow = {
  id: string;
  created_at: string;
  updated_at: string;
  asset_code: string;
  serial_number: string | null;
  name: string;
  category: string | null;
  brand: string | null;
  model: string | null;
  equipment_area: EquipmentArea;
  warehouse: string | null;
  status: EquipmentStatus;
  shelf: string | null;
  place: string | null;
  barcode: string | null;
  nfc_tag_id: string | null;
  notes: string | null;
  assigned_to_name: string | null;
  assigned_to_email: string | null;
  assigned_to_badge: string | null;
  assigned_at: string | null;
  maintenance_note: string | null;
  dismissed_at: string | null;
  technical_sheet_path: string | null;
  technical_sheet_filename: string | null;
  technical_sheet_content_type: string | null;
  technical_sheet_uploaded_at: string | null;
  technical_sheet_uploaded_by: string | null;
};

export type EquipmentMovementRow = {
  id: string;
  created_at: string;
  equipment_id: string;
  equipment_area: EquipmentArea;
  type: EquipmentMovementType;
  status: EquipmentMovementStatus | null;
  note: string | null;
  destination: string | null;
  intervention_plan_number: string | null;
  created_by: string | null;
  created_by_name: string | null;
  created_by_email: string | null;
  assigned_to_name: string | null;
  assigned_to_email: string | null;
  assigned_to_badge: string | null;
  resolution_type: EquipmentResolutionType | null;
  close_note: string | null;
  closed_at: string | null;
  closed_by: string | null;
  movement_group_id: string | null;
  details_json: Record<string, unknown> | null;
};

export type WarehouseView = "REALE" | "PRM" | "TUTTI";
export type SortDir = "none" | "asc" | "desc";
