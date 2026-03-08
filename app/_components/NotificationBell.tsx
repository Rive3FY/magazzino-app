"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import Link from "next/link";
import { createClient } from "../_lib/supabase/client";
import { useIsAdmin } from "../_lib/hooks/useIsAdmin";
import { useUsersCount } from "../_lib/hooks/useUsersCount";

type NegativeStock = { code: string; warehouse: string; qty_free: number };
type OpenMovement = { id: string; code: string; qty: number; note: string | null; created_at: string };
type PendingUser = { id: string; first_name: string | null; last_name: string | null; badge_number: string | null };

export default function NotificationBell() {
  const [mounted, setMounted] = useState(false);
  const { isAdmin } = useIsAdmin();
  const [open, setOpen] = useState(false);
  const [negativeStocks, setNegativeStocks] = useState<NegativeStock[]>([]);
  const [openMovements, setOpenMovements] = useState<OpenMovement[]>([]);
  const [pendingUsers, setPendingUsers] = useState<PendingUser[]>([]);
  const usersCount = useUsersCount();
  const [loading, setLoading] = useState(true);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const total = negativeStocks.length + openMovements.length + (isAdmin ? pendingUsers.length : 0);

  useEffect(() => {
    setMounted(true);
  }, []);

  const load = useCallback(async () => {
    const supabase = createClient();
    setLoading(true);
    try {
      const [stocksRes, movementsRes, pendingRes] = await Promise.all([
        supabase.from("excel_live").select("code,warehouse,qty_free").lt("qty_free", 0).order("qty_free", { ascending: true }).limit(20),
        supabase.from("movements").select("id,code,qty,note,created_at").eq("type", "OUT").eq("status", "OPEN").order("created_at", { ascending: false }).limit(20),
        isAdmin ? supabase.from("profiles").select("id,first_name,last_name,badge_number").eq("approved", false) : Promise.resolve({ data: [] }),
      ]);

      setNegativeStocks((stocksRes.data ?? []) as NegativeStock[]);
      setOpenMovements((movementsRes.data ?? []) as OpenMovement[]);
      setPendingUsers((pendingRes.data ?? []) as PendingUser[]);
    } catch {
      setNegativeStocks([]);
      setOpenMovements([]);
      setPendingUsers([]);
    } finally {
      setLoading(false);
    }
  }, [isAdmin]);

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

    const chProf = isAdmin
      ? supabase
          .channel("notif-profiles-live")
          .on("postgres_changes", { event: "*", schema: "public", table: "profiles" }, () => void load())
          .subscribe()
      : null;

    const interval = setInterval(load, 120000);

    return () => {
      supabase.removeChannel(chExcel);
      supabase.removeChannel(chMov);
      if (chProf) supabase.removeChannel(chProf);
      clearInterval(interval);
    };
  }, [isAdmin, load]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  if (!mounted) {
    return <div className="notificationBellWrap" />;
  }

  return (
    <div className="notificationBellWrap" ref={dropdownRef}>
      {usersCount !== null && (
        <div className="notificationUsersCounter hideOnMobile" title={`${usersCount} persone collegate`}>
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
            <circle cx="9" cy="7" r="4" />
            <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
            <path d="M16 3.13a4 4 0 0 1 0 7.75" />
          </svg>
          <span>{usersCount}</span>
        </div>
      )}
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

      {open && (
        <div className="notificationBellDropdown">
          {loading ? (
            <div className="notificationBellItem">Caricamento…</div>
          ) : total === 0 ? (
            <div className="notificationBellItem notificationBellEmpty">
              Nessun avviso
            </div>
          ) : (
            <>
              {pendingUsers.length > 0 && (
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
              {negativeStocks.length > 0 && (
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
            </>
          )}
        </div>
      )}
    </div>
  );
}
