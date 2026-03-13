"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { createClient } from "../_lib/supabase/client";
import { useAuth } from "../_lib/hooks/useAuth";
import { useIsAdmin } from "../_lib/hooks/useIsAdmin";

type NegativeStock = { code: string; warehouse: string; qty_free: number };
type OpenMovement = { id: string; code: string; qty: number; note: string | null; created_at: string };
type OpenEquipmentMovement = {
  id: string;
  created_at: string;
  equipment_area: string;
  note: string | null;
  destination: string | null;
  assigned_to_name: string | null;
  equipment_assets: { serial_number: string | null; asset_code: string; name: string } | null;
};
type PendingUser = { id: string; first_name: string | null; last_name: string | null; badge_number: string | null };
type ExcelLiveRequest = { id: string; movement_id: string; code: string; warehouse: string; delta_free: number; requested_at: string; details_json: Record<string, unknown> | null };

export default function NotificationBell() {
  const [mounted, setMounted] = useState(false);
  const { user } = useAuth();
  const { isSuperAdmin, canManageMaterials, isAdmin } = useIsAdmin();
  const [open, setOpen] = useState(false);
  const [negativeStocks, setNegativeStocks] = useState<NegativeStock[]>([]);
  const [openMovements, setOpenMovements] = useState<OpenMovement[]>([]);
  const [openEquipmentMovements, setOpenEquipmentMovements] = useState<OpenEquipmentMovement[]>([]);
  const [pendingUsers, setPendingUsers] = useState<PendingUser[]>([]);
  const [excelLiveRequests, setExcelLiveRequests] = useState<ExcelLiveRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [dropdownStyle, setDropdownStyle] = useState<{ top: number; left: number } | null>(null);

  const total =
    (isAdmin ? negativeStocks.length : 0) +
    openMovements.length +
    openEquipmentMovements.length +
    (isSuperAdmin ? pendingUsers.length : 0) +
    (canManageMaterials ? excelLiveRequests.length : 0);

  useEffect(() => {
    setMounted(true);
  }, []);

  const load = useCallback(async () => {
    const supabase = createClient();
    const userId = user?.id ?? null;
    setLoading(true);
    try {
      const shouldFetchMovements = userId != null;
      let movementsQuery = shouldFetchMovements
        ? supabase.from("movements").select("id,code,qty,note,created_at").eq("type", "OUT").eq("status", "OPEN").order("created_at", { ascending: false }).limit(20)
        : null;
      if (movementsQuery && userId && !isAdmin) movementsQuery = movementsQuery.eq("created_by", userId);

      let equipMovQuery = shouldFetchMovements
        ? supabase.from("equipment_movements").select("id,created_at,equipment_area,note,destination,assigned_to_name,equipment_assets(serial_number,asset_code,name)").eq("status", "OPEN").order("created_at", { ascending: false }).limit(20)
        : null;
      if (equipMovQuery && userId && !isAdmin) equipMovQuery = equipMovQuery.eq("created_by", userId);

      const [stocksRes, movementsRes, equipMovRes, pendingRes, requestsRes] = await Promise.all([
        isAdmin ? supabase.from("excel_live").select("code,warehouse,qty_free").lt("qty_free", 0).order("qty_free", { ascending: true }).limit(20) : Promise.resolve({ data: [] }),
        movementsQuery ?? Promise.resolve({ data: [] }),
        equipMovQuery ?? Promise.resolve({ data: [] }),
        isSuperAdmin ? supabase.from("profiles").select("id,first_name,last_name,badge_number").eq("approved", false) : Promise.resolve({ data: [] }),
        canManageMaterials ? supabase.from("excel_live_requests").select("id,movement_id,code,warehouse,delta_free,requested_at,details_json").eq("status", "pending").order("requested_at", { ascending: false }).limit(20) : Promise.resolve({ data: [] }),
      ]);

      setNegativeStocks((stocksRes.data ?? []) as NegativeStock[]);
      setOpenMovements((movementsRes.data ?? []) as OpenMovement[]);
      setOpenEquipmentMovements((equipMovRes.data ?? []) as OpenEquipmentMovement[]);
      setPendingUsers((pendingRes.data ?? []) as PendingUser[]);
      setExcelLiveRequests((requestsRes.data ?? []) as ExcelLiveRequest[]);
    } catch {
      setNegativeStocks([]);
      setOpenMovements([]);
      setOpenEquipmentMovements([]);
      setPendingUsers([]);
      setExcelLiveRequests([]);
    } finally {
      setLoading(false);
    }
  }, [user?.id, isAdmin, canManageMaterials, isSuperAdmin]);

  useEffect(() => {
    const supabase = createClient();
    void load();

    const chExcel = supabase
      .channel("notif-excel-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "excel_live" }, () => void load())
      .subscribe();

    const chMov = supabase
      .channel("notif-movements-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "movements" }, () => void load())
      .subscribe();

    const chEquipMov = supabase
      .channel("notif-equipment-movements-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "equipment_movements" }, () => void load())
      .subscribe();

    const chProf = isSuperAdmin
      ? supabase
          .channel("notif-profiles-live")
          .on("postgres_changes", { event: "*", schema: "public", table: "profiles" }, () => void load())
          .subscribe()
      : null;

    const chRequests = canManageMaterials
      ? supabase
          .channel("notif-excel-live-requests")
          .on("postgres_changes", { event: "*", schema: "public", table: "excel_live_requests" }, () => void load())
          .subscribe()
      : null;

    const interval = setInterval(load, 120000);

    return () => {
      supabase.removeChannel(chExcel);
      supabase.removeChannel(chMov);
      supabase.removeChannel(chEquipMov);
      if (chProf) supabase.removeChannel(chProf);
      if (chRequests) supabase.removeChannel(chRequests);
      clearInterval(interval);
    };
  }, [user?.id, isAdmin, canManageMaterials, isSuperAdmin, load]);

  useEffect(() => {
    if (open && wrapRef.current) {
      const rect = wrapRef.current.getBoundingClientRect();
      setDropdownStyle({
        top: rect.bottom + 8,
        left: rect.left + rect.width / 2,
      });
    } else {
      setDropdownStyle(null);
    }
  }, [open]);

  useEffect(() => {
    if (open) {
      const prev = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = prev;
      };
    }
  }, [open]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent | TouchEvent) {
      const target = (e.target as HTMLElement);
      const inWrap = wrapRef.current?.contains(target);
      const inDropdown = target.closest(".notificationBellDropdown");
      if (!inWrap && !inDropdown) setOpen(false);
    }
    if (open) {
      document.addEventListener("mousedown", handleClickOutside);
      document.addEventListener("touchstart", handleClickOutside, { passive: true });
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("touchstart", handleClickOutside);
    };
  }, [open]);

  if (!mounted) {
    return <div className="notificationBellWrap" />;
  }

  return (
    <div className="notificationBellWrap" ref={wrapRef}>
      <button
        type="button"
        className="notificationBellBtn"
        onClick={() => setOpen((o) => !o)}
        aria-label={total > 0 ? `${total} notifiche` : "Nessuna notifica"}
        aria-expanded={open}
      >
        <span className="notificationBellIcon" aria-hidden="true">
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
            <path d="M13.73 21a2 2 0 0 1-3.46 0" />
          </svg>
        </span>
        {total > 0 && (
          <span className="notificationBellBadge" aria-hidden="true">
            {total > 99 ? "99+" : total}
          </span>
        )}
      </button>

      {open && dropdownStyle && createPortal(
        <div
          className="notificationBellOverlay"
          onClick={() => setOpen(false)}
          aria-hidden="true"
        >
          <div
            className="notificationBellDropdown notificationBellDropdownPortal"
            style={{
              position: "fixed",
              top: dropdownStyle.top,
              left: dropdownStyle.left,
              transform: "translateX(-50%)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="notificationBellDropdownScroll">
              {loading ? (
                <div className="notificationBellItem">Caricamento…</div>
              ) : total === 0 ? (
                <div className="notificationBellItem notificationBellEmpty">
                  Nessun avviso
                </div>
              ) : (
                <>
                  {canManageMaterials && excelLiveRequests.length > 0 && (
                    <div className="notificationBellSection">
                      <div className="notificationBellSectionTitle">
                        📥 Richieste riga excel ({excelLiveRequests.length})
                      </div>
                      {excelLiveRequests.map((req) => (
                        <Link
                          key={req.id}
                          href={`/materiali/admin?tab=richieste-excel`}
                          className="notificationBellItem notificationBellLink"
                          onClick={() => setOpen(false)}
                        >
                          <b>{req.code}</b> · {req.warehouse} · +{req.delta_free}
                        </Link>
                      ))}
                    </div>
                  )}
                  {isSuperAdmin && pendingUsers.length > 0 && (
                <div className="notificationBellSection">
                  <div className="notificationBellSectionTitle">
                    👤 Utenti da approvare ({pendingUsers.length})
                  </div>
                  {pendingUsers.map((u) => (
                    <Link
                      key={u.id}
                      href="/admin?tab=utenti"
                      className="notificationBellItem notificationBellLink"
                      onClick={() => setOpen(false)}
                    >
                      <b>{[u.first_name, u.last_name].filter(Boolean).join(" ").trim() || "Senza nome"}</b>
                      {u.badge_number ? ` · Badge ${u.badge_number}` : ""}
                    </Link>
                  ))}
                </div>
              )}
              {isAdmin && negativeStocks.length > 0 && (
                <div className="notificationBellSection">
                  <div className="notificationBellSectionTitle">
                    ⚠️ Giacenze negative ({negativeStocks.length})
                  </div>
                  {negativeStocks.map((s) => (
                    <Link
                      key={`${s.code}-${s.warehouse}`}
                      href={`/giacenze?code=${encodeURIComponent(s.code)}&warehouse=${encodeURIComponent(s.warehouse)}`}
                      className="notificationBellItem notificationBellLink"
                      onClick={() => setOpen(false)}
                    >
                      <b>{s.code}</b> · {s.warehouse}: <span className="notificationBellNegative">{s.qty_free}</span>
                    </Link>
                  ))}
                </div>
              )}
              {openMovements.length > 0 && (
                <div className="notificationBellSection">
                  <div className="notificationBellSectionTitle">
                    📋 Movimenti aperti ({openMovements.length})
                  </div>
                  {openMovements.map((m) => (
                    <Link
                      key={m.id}
                      href={`/movimenti?open=${encodeURIComponent(m.id)}`}
                      className="notificationBellItem notificationBellLink"
                      onClick={() => setOpen(false)}
                    >
                      <b>{m.code}</b> · -{Math.abs(Number(m.qty))} · {(m.note ?? "").slice(0, 30)}
                      {(m.note ?? "").length > 30 ? "…" : ""}
                    </Link>
                  ))}
                </div>
              )}
              {openEquipmentMovements.length > 0 && (
                <div className="notificationBellSection">
                  <div className="notificationBellSectionTitle">
                    🔧 Prelievi attrezzature aperti ({openEquipmentMovements.length})
                  </div>
                  {openEquipmentMovements.map((m) => {
                    const label = m.equipment_assets
                      ? `${m.equipment_assets.serial_number || m.equipment_assets.asset_code} - ${m.equipment_assets.name}`
                      : "Attrezzatura";
                    const path = m.equipment_area === "LINEE" ? "/attrezzature/linee/movimenti" : "/attrezzature/stazioni/movimenti";
                    const extra = (m.note ?? m.destination ?? "").trim();
                    return (
                      <Link
                        key={m.id}
                        href={path}
                        className="notificationBellItem notificationBellLink"
                        onClick={() => setOpen(false)}
                      >
                        <b>{label}</b>
                        {m.assigned_to_name ? ` · ${m.assigned_to_name}` : ""}
                        {extra ? ` · ${extra.length > 25 ? `${extra.slice(0, 25)}…` : extra}` : ""}
                      </Link>
                    );
                  })}
                </div>
              )}
            </>
          )}
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
