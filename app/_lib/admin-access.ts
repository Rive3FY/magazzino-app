export type RoleScope = "SUPER" | "MATERIALS" | "LINEE" | "STAZIONI";

export type ProfileRoleFlags = {
  approved: boolean;
  legacyAdmin: boolean;
  isSuperAdmin: boolean;
  isMaterialsAdmin: boolean;
  isEquipmentLineeAdmin: boolean;
  isEquipmentStazioniAdmin: boolean;
};

export type AdminAccess = ProfileRoleFlags & {
  isAdmin: boolean;
  canManageMaterials: boolean;
  canManageEquipmentLinee: boolean;
  canManageEquipmentStazioni: boolean;
  canManageScopeAdmins: boolean;
};

type RawProfileFlags = {
  approved?: boolean | null;
  is_admin?: boolean | null;
  is_super_admin?: boolean | null;
  is_materials_admin?: boolean | null;
  is_equipment_linee_admin?: boolean | null;
  is_equipment_stazioni_admin?: boolean | null;
};

type ProfileRoleQuery = {
  select: (columns: string) => {
    eq: (column: string, value: string) => {
      maybeSingle: <T>() => PromiseLike<{ data: T | null; error: { message?: string } | null }>;
    };
  };
};

const EMPTY_ROLE_FLAGS: ProfileRoleFlags = {
  approved: false,
  legacyAdmin: false,
  isSuperAdmin: false,
  isMaterialsAdmin: false,
  isEquipmentLineeAdmin: false,
  isEquipmentStazioniAdmin: false,
};

const ADMIN_ACCESS_CACHE_KEY = "magazzino-admin-access:v1";

type CachedAdminAccess = {
  userId: string;
  flags: ProfileRoleFlags;
};

export function deriveAdminAccess(flags: Partial<ProfileRoleFlags> | null | undefined, scope?: RoleScope): AdminAccess {
  const normalized: ProfileRoleFlags = {
    approved: !!flags?.approved,
    legacyAdmin: !!flags?.legacyAdmin,
    isSuperAdmin: !!flags?.isSuperAdmin || !!flags?.legacyAdmin,
    isMaterialsAdmin: !!flags?.isMaterialsAdmin,
    isEquipmentLineeAdmin: !!flags?.isEquipmentLineeAdmin,
    isEquipmentStazioniAdmin: !!flags?.isEquipmentStazioniAdmin,
  };

  const isAdmin =
    normalized.isSuperAdmin ||
    normalized.isMaterialsAdmin ||
    normalized.isEquipmentLineeAdmin ||
    normalized.isEquipmentStazioniAdmin;

  const canManageMaterials = normalized.isSuperAdmin || normalized.isMaterialsAdmin;
  const canManageEquipmentLinee = normalized.isSuperAdmin || normalized.isEquipmentLineeAdmin;
  const canManageEquipmentStazioni = normalized.isSuperAdmin || normalized.isEquipmentStazioniAdmin;
  const canManageScopeAdmins =
    scope === "SUPER"
      ? normalized.isSuperAdmin
      : scope === "MATERIALS"
      ? canManageMaterials
      : scope === "LINEE"
      ? canManageEquipmentLinee
      : scope === "STAZIONI"
      ? canManageEquipmentStazioni
      : false;

  return {
    ...normalized,
    isAdmin,
    canManageMaterials,
    canManageEquipmentLinee,
    canManageEquipmentStazioni,
    canManageScopeAdmins,
  };
}

export function readCachedAdminAccess(): CachedAdminAccess | null {
  if (typeof window === "undefined") return null;

  try {
    const raw = window.localStorage.getItem(ADMIN_ACCESS_CACHE_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as Partial<CachedAdminAccess>;
    if (!parsed.userId || !parsed.flags) return null;

    return {
      userId: String(parsed.userId),
      flags: {
        approved: !!parsed.flags.approved,
        legacyAdmin: !!parsed.flags.legacyAdmin,
        isSuperAdmin: !!parsed.flags.isSuperAdmin,
        isMaterialsAdmin: !!parsed.flags.isMaterialsAdmin,
        isEquipmentLineeAdmin: !!parsed.flags.isEquipmentLineeAdmin,
        isEquipmentStazioniAdmin: !!parsed.flags.isEquipmentStazioniAdmin,
      },
    };
  } catch {
    return null;
  }
}

export function writeCachedAdminAccess(userId: string, flags: ProfileRoleFlags) {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.setItem(
      ADMIN_ACCESS_CACHE_KEY,
      JSON.stringify({
        userId,
        flags,
      } satisfies CachedAdminAccess)
    );
  } catch {}
}

export function clearCachedAdminAccess() {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.removeItem(ADMIN_ACCESS_CACHE_KEY);
  } catch {}
}

export async function loadOwnProfileRoleFlags(
  supabase: {
    from: (table: string) => unknown;
  },
  userId: string
): Promise<ProfileRoleFlags> {
  const profiles = supabase.from("profiles") as ProfileRoleQuery;

  try {
    const { data, error } = await profiles
      .select("approved,is_admin,is_super_admin,is_materials_admin,is_equipment_linee_admin,is_equipment_stazioni_admin")
      .eq("id", userId)
      .maybeSingle<RawProfileFlags>();

    if (error) {
      throw error;
    }

    return {
      approved: !!data?.approved,
      legacyAdmin: !!data?.is_admin,
      isSuperAdmin: !!data?.is_super_admin || !!data?.is_admin,
      isMaterialsAdmin: !!data?.is_materials_admin,
      isEquipmentLineeAdmin: !!data?.is_equipment_linee_admin,
      isEquipmentStazioniAdmin: !!data?.is_equipment_stazioni_admin,
    } satisfies ProfileRoleFlags;
  } catch {
    const { data, error } = await profiles
      .select("approved,is_admin")
      .eq("id", userId)
      .maybeSingle<{ approved?: boolean | null; is_admin?: boolean | null }>();

    if (error) {
      throw error;
    }

    return {
      approved: !!data?.approved,
      legacyAdmin: !!data?.is_admin,
      isSuperAdmin: !!data?.is_admin,
      isMaterialsAdmin: false,
      isEquipmentLineeAdmin: false,
      isEquipmentStazioniAdmin: false,
    } satisfies ProfileRoleFlags;
  }
}

export async function loadServerAdminAccess(
  supabase: {
    rpc: (fn: string, args?: Record<string, unknown>) => PromiseLike<{ data: boolean | null; error: { message?: string } | null }>;
  }
) {
  const readRole = async (rpcName: string) => {
    try {
      const { data, error } = await supabase.rpc(rpcName);
      if (error) throw error;
      return !!data;
    } catch {
      return null;
    }
  };

  const legacyAdmin = await readRole("is_admin");
  const isSuperAdmin = (await readRole("is_super_admin")) ?? legacyAdmin ?? false;
  const isMaterialsAdmin = (await readRole("is_materials_admin")) ?? false;
  const isEquipmentLineeAdmin = (await readRole("is_equipment_linee_admin")) ?? false;
  const isEquipmentStazioniAdmin = (await readRole("is_equipment_stazioni_admin")) ?? false;

  return deriveAdminAccess({
    ...EMPTY_ROLE_FLAGS,
    legacyAdmin: legacyAdmin ?? false,
    isSuperAdmin,
    isMaterialsAdmin,
    isEquipmentLineeAdmin,
    isEquipmentStazioniAdmin,
  });
}
