"use client";

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

  const cls = (href: string) => `sideLink ${isActive(href) ? "active" : ""}`;

  const handleLinkClick = () => setIsOpen(false);

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
          <div className="sidebarBrand">GESTIONALE</div>
          <div className="sidebarVersion">Versione: 2.06.09</div>
        </div>

        <nav className="sideNav">
          <Link className={cls("/")} href="/" onClick={handleLinkClick}>Dashboard</Link>
          <Link className={cls("/movimenti")} href="/movimenti" onClick={handleLinkClick}>Movimenti</Link>
          <Link className={cls("/giacenze")} href="/giacenze" onClick={handleLinkClick}>Giacenze</Link>
          {isAdmin && <Link className={cls("/import")} href="/import" onClick={handleLinkClick}>Import & Export</Link>}
          {isAdmin && <Link className={cls("/admin")} href="/admin" onClick={handleLinkClick}>Admin</Link>}
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