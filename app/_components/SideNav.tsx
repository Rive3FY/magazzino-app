"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { createClient } from "../_lib/supabase/client";
import { useIsAdmin } from "../_lib/hooks/useIsAdmin";
import { useUsersCount } from "../_lib/hooks/useUsersCount";
import { useSidebar } from "../_lib/SidebarContext";

type Props = { hideSidebar?: boolean };

type NavIconName =
  | "dashboard"
  | "movimenti"
  | "giacenze"
  | "scaffali"
  | "etichette"
  | "importExport"
  | "admin"
  | "assegnatari"
  | "tutteAttrezzature"
  | "registri"
  | "logout";

function NavIcon({ name }: { name: NavIconName }) {
  switch (name) {
    case "dashboard":
      return (
        <svg className="sideLinkIcon" xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <rect x="3" y="3" width="7" height="7" rx="1.5" />
          <rect x="14" y="3" width="7" height="7" rx="1.5" />
          <rect x="3" y="14" width="7" height="7" rx="1.5" />
          <rect x="14" y="14" width="7" height="7" rx="1.5" />
        </svg>
      );
    case "movimenti":
      return (
        <svg className="sideLinkIcon" xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M7 7h11" />
          <path d="m14 4 4 3-4 3" />
          <path d="M17 17H6" />
          <path d="m10 14-4 3 4 3" />
        </svg>
      );
    case "giacenze":
      return (
        <svg className="sideLinkIcon" xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
          <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
          <line x1="12" y1="22.08" x2="12" y2="12" />
        </svg>
      );
    case "scaffali":
      return (
        <svg className="sideLinkIcon" xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M4 3v18" />
          <path d="M20 3v18" />
          <path d="M4 8h16" />
          <path d="M4 16h16" />
          <path d="M8 8v8" />
          <path d="M16 8v8" />
        </svg>
      );
    case "etichette":
      return (
        <svg className="sideLinkIcon" xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M20.59 13.41 11 23l-8-8V4h11l9.59 9.41Z" />
          <path d="M7 7h.01" />
        </svg>
      );
    case "importExport":
      return (
        <svg className="sideLinkIcon" xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M12 3v12" />
          <path d="m8 7 4-4 4 4" />
          <path d="M12 21V9" />
          <path d="m16 17-4 4-4-4" />
        </svg>
      );
    case "admin":
      return (
        <svg className="sideLinkIcon" xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 8.92 4.6H9A1.65 1.65 0 0 0 10 3.09V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9c.36.64.97 1 1.69 1H21a2 2 0 0 1 0 4h-.09c-.72 0-1.33.36-1.51 1Z" />
        </svg>
      );
    case "assegnatari":
      return (
        <svg className="sideLinkIcon" xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
          <circle cx="9" cy="7" r="4" />
          <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
          <path d="M16 3.13a4 4 0 0 1 0 7.75" />
        </svg>
      );
    case "tutteAttrezzature":
      return (
        <svg className="sideLinkIcon" xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M8 6h13" />
          <path d="M8 12h13" />
          <path d="M8 18h13" />
          <path d="M3 6h.01" />
          <path d="M3 12h.01" />
          <path d="M3 18h.01" />
        </svg>
      );
    case "registri":
      return (
        <svg className="sideLinkIcon" xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <polyline points="14 2 14 8 20 8" />
          <path d="M16 13H8" />
          <path d="M16 17H8" />
          <path d="M10 9H8" />
        </svg>
      );
    case "logout":
      return (
        <svg className="sideLinkIcon" xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
          <path d="M16 17l5-5-5-5" />
          <path d="M21 12H9" />
        </svg>
      );
  }
}

function NavLabel({ icon, label }: { icon: NavIconName; label: string }) {
  return (
    <>
      <NavIcon name={icon} />
      <span>{label}</span>
    </>
  );
}

export default function SideNav({ hideSidebar = false }: Props) {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = createClient();
  const {
    canManageMaterials,
    canManageEquipmentLinee,
    canManageEquipmentStazioni,
    loading,
  } = useIsAdmin();
  const usersCount = useUsersCount();
  const { isOpen, setIsOpen } = useSidebar();
  const checked = !loading;

  const isActive = (href: string) =>
    pathname === href || (href !== "/" && pathname.startsWith(href));

  const isExactActive = (href: string) => pathname === href;

  const cls = (href: string) => `sideLink ${isActive(href) ? "active" : ""}`;
  const clsExact = (href: string) => `sideLink ${isExactActive(href) ? "active" : ""}`;

  const handleLinkClick = () => setIsOpen(false);

  const inLinee = pathname.startsWith("/attrezzature/linee");
  const inStazioni = pathname.startsWith("/attrezzature/stazioni");
  const inMaterials =
    pathname.startsWith("/materiali") ||
    pathname.startsWith("/movimenti") ||
    pathname.startsWith("/giacenze") ||
    pathname.startsWith("/scaffali") ||
    pathname.startsWith("/etichette") ||
    pathname.startsWith("/import") ||
    pathname.startsWith("/materiali/admin") ||
    pathname.startsWith("/admin") ||
    pathname.startsWith("/referenti") ||
    pathname.startsWith("/audit-log") ||
    pathname.startsWith("/scan");

  useEffect(() => {
    if (checked) return;
    let alive = true;

    (async () => {
      const { data: u } = await supabase.auth.getUser();
      const user = u.user;

      if (!user) return;

      const { data: profile } = await supabase
        .from("profiles")
        .select("badge_number, first_name, last_name")
        .eq("id", user.id)
        .maybeSingle();

      if (
        !alive ||
        !profile ||
        (profile.badge_number && profile.first_name && profile.last_name) ||
        pathname === "/profilo"
      ) {
        return;
      }

      router.replace("/profilo");
    })();

    return () => {
      alive = false;
    };
  }, [pathname, router, supabase, checked]);

  const hiddenClass = hideSidebar ? " sidebarHidden" : "";
  return (
    <>
      <div
        className={`sidebarOverlay ${isOpen ? "sidebarOverlayOpen" : ""}${hiddenClass}`}
        onClick={() => setIsOpen(false)}
        aria-hidden="true"
      />
      <aside className={`sidebar ${isOpen ? "sidebarOpen" : ""}${hiddenClass}`} aria-label="Menu di navigazione">
        <button
          type="button"
          className="sidebarCloseBtn"
          onClick={() => setIsOpen(false)}
          aria-label="Chiudi menu"
        >
          ✕
        </button>

        <nav className="sideNav">
          {inMaterials && (
            <>
              <div className="sideLink sideSectionHeader" style={{ opacity: 0.7, pointerEvents: "none" }}>
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
                  <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
                  <line x1="12" y1="22.08" x2="12" y2="12" />
                </svg>
                Materiali
              </div>
              <Link className={clsExact("/materiali")} href="/materiali" onClick={handleLinkClick}><NavLabel icon="dashboard" label="Dashboard" /></Link>
              <Link className={cls("/movimenti")} href="/movimenti" onClick={handleLinkClick}><NavLabel icon="movimenti" label="Movimenti" /></Link>
              <Link className={cls("/giacenze")} href="/giacenze" onClick={handleLinkClick}><NavLabel icon="giacenze" label="Giacenze" /></Link>
              {canManageMaterials && <Link className={cls("/scaffali")} href="/scaffali" onClick={handleLinkClick}><NavLabel icon="scaffali" label="Scaffali" /></Link>}
              {canManageMaterials && <Link className={cls("/etichette")} href="/etichette" onClick={handleLinkClick}><NavLabel icon="etichette" label="Etichette" /></Link>}
              {canManageMaterials && <Link className={cls("/import")} href="/import" onClick={handleLinkClick}><NavLabel icon="importExport" label="Import & Export" /></Link>}
              {canManageMaterials && <Link className={cls("/materiali/admin")} href="/materiali/admin" onClick={handleLinkClick}><NavLabel icon="admin" label="Gestione Admin" /></Link>}
            </>
          )}

          {inLinee && (
            <>
              <div className="sideLink sideSectionHeader" style={{ opacity: 0.7, pointerEvents: "none" }}>
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M5 19 19 5" />
                  <path d="M8.5 5.5 6 8l2 2 3-3-2.5-1.5Z" />
                  <path d="m14 13 5 5" />
                  <path d="m13 14 4 4" />
                  <path d="M15.5 4.5a3.5 3.5 0 0 1 4 4L17 11l-3-1-1-3 2.5-2.5Z" />
                  <path d="M6.5 12.5 4 15a3.5 3.5 0 0 0 5 5l2.5-2.5" />
                </svg>
                Attrezzature Linee
              </div>
              <Link className={clsExact("/attrezzature/linee")} href="/attrezzature/linee" onClick={handleLinkClick}><NavLabel icon="dashboard" label="Dashboard" /></Link>
              <Link className={cls("/attrezzature/linee/movimenti")} href="/attrezzature/linee/movimenti" onClick={handleLinkClick}><NavLabel icon="movimenti" label="Movimenti" /></Link>
              <Link className={cls("/attrezzature/linee/registri")} href="/attrezzature/linee/registri" onClick={handleLinkClick}><NavLabel icon="registri" label="Registri" /></Link>
              <Link className={cls("/attrezzature/linee/assegnatari")} href="/attrezzature/linee/assegnatari" onClick={handleLinkClick}><NavLabel icon="assegnatari" label="Assegnatari" /></Link>
              {canManageEquipmentLinee && <Link className={cls("/attrezzature/linee/etichette")} href="/attrezzature/linee/etichette" onClick={handleLinkClick}><NavLabel icon="etichette" label="Etichette" /></Link>}
              <Link className={cls("/attrezzature/linee/tutte-attrezzature")} href="/attrezzature/linee/tutte-attrezzature" onClick={handleLinkClick}><NavLabel icon="tutteAttrezzature" label="Tutte le attrezzature" /></Link>
              {canManageEquipmentLinee && <Link className={cls("/attrezzature/linee/admin")} href="/attrezzature/linee/admin" onClick={handleLinkClick}><NavLabel icon="admin" label="Gestione Admin" /></Link>}
            </>
          )}

          {inStazioni && (
            <>
              <div className="sideLink sideSectionHeader" style={{ opacity: 0.7, pointerEvents: "none" }}>
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M5 19 19 5" />
                  <path d="M8.5 5.5 6 8l2 2 3-3-2.5-1.5Z" />
                  <path d="m14 13 5 5" />
                  <path d="m13 14 4 4" />
                  <path d="M15.5 4.5a3.5 3.5 0 0 1 4 4L17 11l-3-1-1-3 2.5-2.5Z" />
                  <path d="M6.5 12.5 4 15a3.5 3.5 0 0 0 5 5l2.5-2.5" />
                </svg>
                Attrezzature Stazioni
              </div>
              <Link className={clsExact("/attrezzature/stazioni")} href="/attrezzature/stazioni" onClick={handleLinkClick}><NavLabel icon="dashboard" label="Dashboard" /></Link>
              <Link className={cls("/attrezzature/stazioni/movimenti")} href="/attrezzature/stazioni/movimenti" onClick={handleLinkClick}><NavLabel icon="movimenti" label="Movimenti" /></Link>
              <Link className={cls("/attrezzature/stazioni/registri")} href="/attrezzature/stazioni/registri" onClick={handleLinkClick}><NavLabel icon="registri" label="Registri" /></Link>
              <Link className={cls("/attrezzature/stazioni/assegnatari")} href="/attrezzature/stazioni/assegnatari" onClick={handleLinkClick}><NavLabel icon="assegnatari" label="Assegnatari" /></Link>
              {canManageEquipmentStazioni && <Link className={cls("/attrezzature/stazioni/etichette")} href="/attrezzature/stazioni/etichette" onClick={handleLinkClick}><NavLabel icon="etichette" label="Etichette" /></Link>}
              <Link className={cls("/attrezzature/stazioni/tutte-attrezzature")} href="/attrezzature/stazioni/tutte-attrezzature" onClick={handleLinkClick}><NavLabel icon="tutteAttrezzature" label="Tutte le attrezzature" /></Link>
              {canManageEquipmentStazioni && <Link className={cls("/attrezzature/stazioni/admin")} href="/attrezzature/stazioni/admin" onClick={handleLinkClick}><NavLabel icon="admin" label="Gestione Admin" /></Link>}
            </>
          )}

          {usersCount !== null && (
            <div className="sideNavUsersCount" title={`${usersCount} persone online`}>
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                <circle cx="9" cy="7" r="4" />
                <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                <path d="M16 3.13a4 4 0 0 1 0 7.75" />
              </svg>
              <span>{usersCount} persone online</span>
            </div>
          )}
          {!checked && (
            <div className="sideLink" style={{ opacity: 0.6, pointerEvents: "none" }}>
              …
            </div>
          )}
        </nav>

        <div className="sidebarFooter">
          <form action="/logout" method="POST" style={{ margin: 0 }} className="sidebarLogoutForm">
            <button type="submit" className="sidebarLogoutBtn">
              <NavIcon name="logout" />
              <span>Esci</span>
            </button>
          </form>
        </div>
      </aside>
    </>
  );
}