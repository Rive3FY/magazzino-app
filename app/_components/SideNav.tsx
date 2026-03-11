"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { createClient } from "../_lib/supabase/client";
import { useIsAdmin } from "../_lib/hooks/useIsAdmin";
import { useUsersCount } from "../_lib/hooks/useUsersCount";
import { useSidebar } from "../_lib/SidebarContext";

export default function SideNav() {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = createClient();
  const { isAdmin, loading } = useIsAdmin();
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

  return (
    <>
      <div
        className={`sidebarOverlay ${isOpen ? "sidebarOverlayOpen" : ""}`}
        onClick={() => setIsOpen(false)}
        aria-hidden="true"
      />
      <aside className={`sidebar ${isOpen ? "sidebarOpen" : ""}`} aria-label="Menu di navigazione">
        <div className="sidebarHeader">
          <button
            type="button"
            className="sidebarCloseBtn"
            onClick={() => setIsOpen(false)}
            aria-label="Chiudi menu"
          >
            ✕
          </button>
          <Link href="/" className="sidebarBrand" style={{ display: "flex", alignItems: "center", gap: 8, textDecoration: "none", color: "inherit" }}>
            <Image src="/logo.svg" alt="" width={48} height={17} style={{ objectFit: "contain", filter: "brightness(0) invert(1)" }} />
            <span>GESTIONALE</span>
          </Link>
          <div className="sidebarVersion">Versione: 2.06.09</div>
        </div>

        <nav className="sideNav">
          {inMaterials && (
            <>
              <div className="sideLink" style={{ opacity: 0.7, pointerEvents: "none" }}>
                Materiali
              </div>
              <Link className={clsExact("/materiali")} href="/materiali" onClick={handleLinkClick}>Dashboard</Link>
              <Link className={cls("/movimenti")} href="/movimenti" onClick={handleLinkClick}>Movimenti</Link>
              <Link className={cls("/giacenze")} href="/giacenze" onClick={handleLinkClick}>Giacenze</Link>
              {isAdmin && <Link className={cls("/scaffali")} href="/scaffali" onClick={handleLinkClick}>Scaffali</Link>}
              {isAdmin && <Link className={cls("/etichette")} href="/etichette" onClick={handleLinkClick}>Etichette</Link>}
              {isAdmin && <Link className={cls("/import")} href="/import" onClick={handleLinkClick}>Import & Export</Link>}
              {isAdmin && <Link className={cls("/admin")} href="/admin" onClick={handleLinkClick}>Admin</Link>}
            </>
          )}

          {inLinee && (
            <>
              <div className="sideLink" style={{ opacity: 0.7, pointerEvents: "none" }}>
                Attrezzature Linee
              </div>
              <Link className={clsExact("/attrezzature/linee")} href="/attrezzature/linee" onClick={handleLinkClick}>Dashboard</Link>
              <Link className={cls("/attrezzature/linee/movimenti")} href="/attrezzature/linee/movimenti" onClick={handleLinkClick}>Movimenti</Link>
              <Link className={cls("/attrezzature/linee/etichette")} href="/attrezzature/linee/etichette" onClick={handleLinkClick}>Etichette</Link>
              <Link className={cls("/attrezzature/linee/tutte-attrezzature")} href="/attrezzature/linee/tutte-attrezzature" onClick={handleLinkClick}>Tutte le attrezzature</Link>
            </>
          )}

          {inStazioni && (
            <>
              <div className="sideLink" style={{ opacity: 0.7, pointerEvents: "none" }}>
                Attrezzature Stazioni
              </div>
              <Link className={clsExact("/attrezzature/stazioni")} href="/attrezzature/stazioni" onClick={handleLinkClick}>Dashboard</Link>
              <Link className={cls("/attrezzature/stazioni/movimenti")} href="/attrezzature/stazioni/movimenti" onClick={handleLinkClick}>Movimenti</Link>
              <Link className={cls("/attrezzature/stazioni/etichette")} href="/attrezzature/stazioni/etichette" onClick={handleLinkClick}>Etichette</Link>
              <Link className={cls("/attrezzature/stazioni/tutte-attrezzature")} href="/attrezzature/stazioni/tutte-attrezzature" onClick={handleLinkClick}>Tutte le attrezzature</Link>
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
              Esci
            </button>
          </form>
        </div>
      </aside>
    </>
  );
}