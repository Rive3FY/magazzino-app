"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { createClient } from "../_lib/supabase/client";
import { useIsAdmin } from "../_lib/hooks/useIsAdmin";
import { useEquipmentMaintenanceNotifications } from "../_lib/hooks/useEquipmentMaintenanceNotifications";
import { useSidebar } from "../_lib/SidebarContext";
import EquipmentToolsIcon from "./EquipmentToolsIcon";

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
  | "manutenzione"
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
    case "manutenzione":
      return (
        <svg className="sideLinkIcon" xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
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
    default:
      return null;
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
  const {
    canManageMaterials,
    canManageEquipmentLinee,
    canManageEquipmentStazioni,
    loading,
  } = useIsAdmin();
  const { isOpen, setIsOpen } = useSidebar();
  const checked = !loading;
  const sidebarRef = useRef<HTMLElement | null>(null);
  const [navInteractive, setNavInteractive] = useState(false);

  const inLinee = pathname.startsWith("/attrezzature/linee");
  const inStazioni = pathname.startsWith("/attrezzature/stazioni");

  const lineeMaintenance = useEquipmentMaintenanceNotifications(
    "LINEE",
    checked && canManageEquipmentLinee && inLinee
  );
  const stazioniMaintenance = useEquipmentMaintenanceNotifications(
    "STAZIONI",
    checked && canManageEquipmentStazioni && inStazioni
  );

  const isActive = (href: string) =>
    pathname === href || (href !== "/" && pathname.startsWith(`${href}/`));

  const isExactActive = (href: string) => pathname === href;

  const cls = (href: string) => `sideLink ${isActive(href) ? "active" : ""}`;
  const clsExact = (href: string) => `sideLink ${isExactActive(href) ? "active" : ""}`;

  const handleLinkClick = () => {
    if (typeof window !== "undefined" && window.innerWidth < 901) {
      setIsOpen(false);
    }
    if (!materialsAdminOpenByRoute) {
      setMaterialsAdminOpen(false);
    }
  };

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

  const materialsAdminOpenByRoute =
    pathname.startsWith("/scaffali") ||
    pathname.startsWith("/etichette") ||
    pathname.startsWith("/import") ||
    pathname.startsWith("/materiali/admin");
  const [materialsAdminOpen, setMaterialsAdminOpen] = useState(materialsAdminOpenByRoute);

  useEffect(() => {
    setMaterialsAdminOpen(materialsAdminOpenByRoute);
  }, [materialsAdminOpenByRoute]);

  useEffect(() => {
    const sidebar = sidebarRef.current;
    if (!sidebar) return;

    const syncInteractive = () => {
      const styles = window.getComputedStyle(sidebar);
      const matrix = new DOMMatrixReadOnly(styles.transform);
      const hiddenOffscreen = Math.abs(matrix.m41) > sidebar.offsetWidth * 0.5;
      setNavInteractive(isOpen && !hiddenOffscreen);
    };

    syncInteractive();

    const onTransitionEnd = (event: TransitionEvent) => {
      if (event.target !== sidebar || event.propertyName !== "transform") return;
      syncInteractive();
    };

    sidebar.addEventListener("transitionend", onTransitionEnd);
    return () => sidebar.removeEventListener("transitionend", onTransitionEnd);
  }, [isOpen]);

  useEffect(() => {
    if (checked) return;
    let alive = true;
    const supabase = createClient();

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
  }, [pathname, router, checked]);

  const hiddenClass = hideSidebar ? " sidebarHidden" : "";
  return (
    <>
      <div
        className={`sidebarOverlay ${isOpen ? "sidebarOverlayOpen" : ""}${hiddenClass}`}
        onClick={() => setIsOpen(false)}
        aria-hidden="true"
      />
      <aside
        ref={sidebarRef}
        className={`sidebar ${isOpen ? "sidebarOpen" : ""}${hiddenClass}`}
        aria-label="Menu di navigazione"
      >
        <button
          type="button"
          className="sidebarCloseBtn"
          onClick={() => setIsOpen(false)}
          aria-label="Chiudi menu"
        >
          ✕
        </button>

        <nav className={`sideNav${navInteractive ? " sideNavInteractive" : ""}`}>
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
              <Link className={clsExact("/materiali")} href="/materiali" onClick={handleLinkClick} prefetch={false}><NavLabel icon="dashboard" label="Dashboard" /></Link>
              <Link className={cls("/movimenti")} href="/movimenti" onClick={handleLinkClick} prefetch={false}><NavLabel icon="movimenti" label="Movimenti" /></Link>
              <Link className={cls("/giacenze")} href="/giacenze" onClick={handleLinkClick} prefetch={false}><NavLabel icon="giacenze" label="Inventario" /></Link>
              {canManageMaterials && (
                <div>
                  <button
                    type="button"
                    className={`sideLink sideGroupToggle${materialsAdminOpenByRoute ? " active" : ""}`}
                    onClick={() => setMaterialsAdminOpen((open) => !open)}
                    aria-expanded={materialsAdminOpen}
                  >
                    <NavLabel icon="admin" label="Gestione Admin" />
                    <svg
                      className="sideGroupChevron"
                      xmlns="http://www.w3.org/2000/svg"
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden
                      style={{ transform: materialsAdminOpen ? "rotate(90deg)" : "rotate(0deg)" }}
                    >
                      <path d="m9 18 6-6-6-6" />
                    </svg>
                  </button>
                  {materialsAdminOpen && (
                    <div className="sideSubNav">
                      <Link className={cls("/scaffali")} href="/scaffali" onClick={handleLinkClick} prefetch={false}><NavLabel icon="scaffali" label="Posizioni" /></Link>
                      <Link className={cls("/etichette")} href="/etichette" onClick={handleLinkClick} prefetch={false}><NavLabel icon="etichette" label="Etichette" /></Link>
                      <Link className={cls("/import")} href="/import" onClick={handleLinkClick} prefetch={false}><NavLabel icon="importExport" label="Import & Export" /></Link>
                      <Link className={cls("/materiali/admin")} href="/materiali/admin" onClick={handleLinkClick} prefetch={false}><NavLabel icon="admin" label="Pannello admin" /></Link>
                    </div>
                  )}
                </div>
              )}
            </>
          )}

          {inLinee && (
            <>
              <div className="sideLink sideSectionHeader" style={{ opacity: 0.7, pointerEvents: "none" }}>
                <EquipmentToolsIcon />
                Attrezzature Linee
              </div>
              <Link className={clsExact("/attrezzature/linee")} href="/attrezzature/linee" onClick={handleLinkClick} prefetch={false}><NavLabel icon="dashboard" label="Dashboard" /></Link>
              <Link className={cls("/attrezzature/linee/movimenti")} href="/attrezzature/linee/movimenti" onClick={handleLinkClick} prefetch={false}><NavLabel icon="movimenti" label="Movimenti" /></Link>
              <Link className={cls("/attrezzature/linee/tutte-attrezzature")} href="/attrezzature/linee/tutte-attrezzature" onClick={handleLinkClick} prefetch={false}><NavLabel icon="tutteAttrezzature" label="Tutte le attrezzature" /></Link>
              {canManageEquipmentLinee && (
                <Link
                  className={cls("/attrezzature/linee/manutenzioni")}
                  href="/attrezzature/linee/manutenzioni"
                  onClick={handleLinkClick}
                  prefetch={false}
                  style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}
                >
                  <NavIcon name="manutenzione" />
                  <span>Manutenzioni</span>
                  {lineeMaintenance.count > 0 ? (
                    <span
                      style={{
                        marginLeft: 8,
                        minWidth: 20,
                        height: 20,
                        padding: "0 6px",
                        borderRadius: 999,
                        background: "#ef4444",
                        color: "#fff",
                        fontSize: 11,
                        fontWeight: 900,
                        display: "inline-flex",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                      aria-label={`${lineeMaintenance.count} nuovi invii in manutenzione`}
                    >
                      {lineeMaintenance.count > 99 ? "99+" : lineeMaintenance.count}
                    </span>
                  ) : null}
                </Link>
              )}
              <Link className={cls("/attrezzature/linee/assegnatari")} href="/attrezzature/linee/assegnatari" onClick={handleLinkClick} prefetch={false}><NavLabel icon="assegnatari" label="Assegnatari" /></Link>
              {canManageEquipmentLinee && <Link className={cls("/attrezzature/linee/etichette")} href="/attrezzature/linee/etichette" onClick={handleLinkClick} prefetch={false}><NavLabel icon="etichette" label="Etichette" /></Link>}
              <Link className={cls("/attrezzature/linee/registri")} href="/attrezzature/linee/registri" onClick={handleLinkClick} prefetch={false}><NavLabel icon="registri" label="Registri" /></Link>
              {canManageEquipmentLinee && <Link className={cls("/attrezzature/linee/admin")} href="/attrezzature/linee/admin" onClick={handleLinkClick} prefetch={false}><NavLabel icon="admin" label="Gestione Admin" /></Link>}
            </>
          )}

          {inStazioni && (
            <>
              <div className="sideLink sideSectionHeader" style={{ opacity: 0.7, pointerEvents: "none" }}>
                <EquipmentToolsIcon />
                Attrezzature Stazioni
              </div>
              <Link className={clsExact("/attrezzature/stazioni")} href="/attrezzature/stazioni" onClick={handleLinkClick} prefetch={false}><NavLabel icon="dashboard" label="Dashboard" /></Link>
              <Link className={cls("/attrezzature/stazioni/movimenti")} href="/attrezzature/stazioni/movimenti" onClick={handleLinkClick} prefetch={false}><NavLabel icon="movimenti" label="Movimenti" /></Link>
              <Link className={cls("/attrezzature/stazioni/tutte-attrezzature")} href="/attrezzature/stazioni/tutte-attrezzature" onClick={handleLinkClick} prefetch={false}><NavLabel icon="tutteAttrezzature" label="Tutte le attrezzature" /></Link>
              {canManageEquipmentStazioni && (
                <Link
                  className={cls("/attrezzature/stazioni/manutenzioni")}
                  href="/attrezzature/stazioni/manutenzioni"
                  onClick={handleLinkClick}
                  prefetch={false}
                  style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}
                >
                  <NavIcon name="manutenzione" />
                  <span>Manutenzioni</span>
                  {stazioniMaintenance.count > 0 ? (
                    <span
                      style={{
                        marginLeft: 8,
                        minWidth: 20,
                        height: 20,
                        padding: "0 6px",
                        borderRadius: 999,
                        background: "#ef4444",
                        color: "#fff",
                        fontSize: 11,
                        fontWeight: 900,
                        display: "inline-flex",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                      aria-label={`${stazioniMaintenance.count} nuovi invii in manutenzione`}
                    >
                      {stazioniMaintenance.count > 99 ? "99+" : stazioniMaintenance.count}
                    </span>
                  ) : null}
                </Link>
              )}
              <Link className={cls("/attrezzature/stazioni/assegnatari")} href="/attrezzature/stazioni/assegnatari" onClick={handleLinkClick} prefetch={false}><NavLabel icon="assegnatari" label="Assegnatari" /></Link>
              {canManageEquipmentStazioni && <Link className={cls("/attrezzature/stazioni/etichette")} href="/attrezzature/stazioni/etichette" onClick={handleLinkClick} prefetch={false}><NavLabel icon="etichette" label="Etichette" /></Link>}
              <Link className={cls("/attrezzature/stazioni/registri")} href="/attrezzature/stazioni/registri" onClick={handleLinkClick} prefetch={false}><NavLabel icon="registri" label="Registri" /></Link>
              {canManageEquipmentStazioni && <Link className={cls("/attrezzature/stazioni/admin")} href="/attrezzature/stazioni/admin" onClick={handleLinkClick} prefetch={false}><NavLabel icon="admin" label="Gestione Admin" /></Link>}
            </>
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