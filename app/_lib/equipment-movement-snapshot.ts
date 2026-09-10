import { createClient } from "./supabase/client";

type EquipmentDb = ReturnType<typeof createClient>;

const IN_CHUNK = 100;

export type EquipmentCatalogAsset = {
  id: string;
  asset_code?: string | null;
  name?: string | null;
  serial_number?: string | null;
  warehouse?: string | null;
  shelf?: string | null;
  place?: string | null;
  category?: string | null;
  status?: string | null;
};

export function equipmentIdentitySnapshot(asset: EquipmentCatalogAsset) {
  return {
    asset_code: asset.asset_code ?? null,
    asset_name: asset.name ?? null,
    serial_number: asset.serial_number ?? null,
    warehouse: asset.warehouse ?? null,
    shelf: asset.shelf ?? null,
    place: asset.place ?? null,
    category: asset.category ?? null,
  };
}

export function equipmentMovementDetailsJson(asset: EquipmentCatalogAsset, area: string, mode: string) {
  return {
    ...equipmentIdentitySnapshot(asset),
    equipment_area: area,
    mode,
  };
}

export function mergeEquipmentIdentityDetails(
  existing: Record<string, unknown> | null | undefined,
  snapshot: ReturnType<typeof equipmentIdentitySnapshot>
): Record<string, unknown> {
  const base = existing && typeof existing === "object" ? existing : {};
  return { ...base, ...snapshot };
}

export function detailsField(details: Record<string, unknown> | null | undefined, key: string) {
  if (!details || typeof details !== "object") return "";
  return String(details[key] ?? "").trim();
}

export function movementAssetCode(
  movement: { details_json?: Record<string, unknown> | null },
  asset?: { serial_number?: string | null; asset_code?: string | null } | null
) {
  const fromAsset = String(asset?.serial_number || asset?.asset_code || "").trim();
  if (fromAsset) return fromAsset;
  return detailsField(movement.details_json, "serial_number") || detailsField(movement.details_json, "asset_code");
}

export function movementAssetName(
  movement: { details_json?: Record<string, unknown> | null },
  asset?: { name?: string | null } | null
) {
  const fromAsset = String(asset?.name ?? "").trim();
  if (fromAsset) return fromAsset;
  return detailsField(movement.details_json, "asset_name");
}

export function movementWarehouse(
  movement: { details_json?: Record<string, unknown> | null },
  asset?: { warehouse?: string | null } | null
) {
  const fromAsset = String(asset?.warehouse ?? "").trim();
  if (fromAsset) return fromAsset;
  return detailsField(movement.details_json, "warehouse");
}

export function movementAssetLabel(
  movement: { details_json?: Record<string, unknown> | null },
  asset?: { serial_number?: string | null; asset_code?: string | null; name?: string | null } | null
) {
  const code = movementAssetCode(movement, asset);
  const name = movementAssetName(movement, asset);
  if (code && name) return `${code} - ${name}`;
  return code || name || "Attrezzatura non più in anagrafica";
}

export function isAssetBlockedFromCatalogDelete(
  asset: { id: string; status?: string | null },
  openAssetIds: Set<string>
) {
  if (openAssetIds.has(asset.id)) return true;
  return String(asset.status ?? "").trim().toUpperCase() === "MAINTENANCE";
}

async function forIdChunks<T>(
  ids: string[],
  run: (chunk: string[]) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>
): Promise<{ rows: T[]; error: string | null }> {
  const rows: T[] = [];
  for (let i = 0; i < ids.length; i += IN_CHUNK) {
    const { data, error } = await run(ids.slice(i, i + IN_CHUNK));
    if (error) return { rows, error: error.message };
    if (data) rows.push(...data);
  }
  return { rows, error: null };
}

export async function findOpenMovementAssetIds(supabase: EquipmentDb, ids: string[]) {
  const openIds = new Set<string>();
  if (ids.length === 0) return { ids: openIds, error: null as string | null };
  const { rows, error } = await forIdChunks<{ equipment_id: string | null }>(ids, async (chunk) =>
    supabase.from("equipment_movements").select("equipment_id").eq("status", "OPEN").in("equipment_id", chunk)
  );
  if (error) return { ids: openIds, error };
  for (const row of rows) {
    if (row.equipment_id) openIds.add(row.equipment_id);
  }
  return { ids: openIds, error: null };
}

export async function snapshotIdentityOntoMovements(supabase: EquipmentDb, assets: EquipmentCatalogAsset[]) {
  if (assets.length === 0) return { error: null as string | null };
  const snapById = new Map(assets.map((asset) => [asset.id, equipmentIdentitySnapshot(asset)]));
  const { rows, error } = await forIdChunks<{
    id: string;
    equipment_id: string | null;
    details_json: Record<string, unknown> | null;
  }>(
    assets.map((asset) => asset.id),
    async (chunk) => supabase.from("equipment_movements").select("id, equipment_id, details_json").in("equipment_id", chunk)
  );
  if (error) return { error };
  for (const row of rows) {
    const snap = row.equipment_id ? snapById.get(row.equipment_id) : undefined;
    if (!snap) continue;
    const { error: updateError } = await supabase
      .from("equipment_movements")
      .update({ details_json: mergeEquipmentIdentityDetails(row.details_json, snap) })
      .eq("id", row.id);
    if (updateError) return { error: updateError.message };
  }
  return { error: null };
}

export async function deleteAssetsPreservingMovements(
  supabase: EquipmentDb,
  assets: EquipmentCatalogAsset[],
  area?: string
) {
  if (assets.length === 0) return { error: null as string | null };
  const snap = await snapshotIdentityOntoMovements(supabase, assets);
  if (snap.error) return snap;
  const ids = assets.map((asset) => asset.id);
  for (let i = 0; i < ids.length; i += IN_CHUNK) {
    const chunk = ids.slice(i, i + IN_CHUNK);
    const { error } = area
      ? await supabase.from("equipment_assets").delete().eq("equipment_area", area).in("id", chunk)
      : await supabase.from("equipment_assets").delete().in("id", chunk);
    if (error) return { error: error.message };
  }
  return { error: null };
}
