"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { createClient } from "../_lib/supabase/client";

export default function SideNav() {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = createClient();

  const [isAdmin, setIsAdmin] = useState(false);
  const [checked, setChecked] = useState(false);

  const isActive = (href: string) =>
    pathname === href || (href !== "/" && pathname.startsWith(href));

  const cls = (href: string) => `sideLink ${isActive(href) ? "active" : ""}`;

  useEffect(() => {
    let alive = true;

    (async () => {
      try {
        const { data: u } = await supabase.auth.getUser();
        const user = u.user;

        if (!user) {
          if (!alive) return;
          setIsAdmin(false);
          setChecked(true);
          return;
        }

        /* 🔹 controllo profilo compilato */
        const { data: profile } = await supabase
          .from("profiles")
          .select("badge_number, first_name, last_name")
          .eq("id", user.id)
          .maybeSingle();

        if (
          profile &&
          (!profile.badge_number || !profile.first_name || !profile.last_name) &&
          pathname !== "/profilo"
        ) {
          router.replace("/profilo");
          return;
        }

        /* 🔹 controllo admin */
        const { data, error } = await supabase.rpc("is_admin");

        if (!alive) return;

        if (error) {
          console.error("is_admin error:", error);
          setIsAdmin(false);
        } else {
          setIsAdmin(!!data);
        }
      } finally {
        if (alive) setChecked(true);
      }
    })();

    return () => {
      alive = false;
    };
  }, [pathname, router, supabase]);

  return (
    <aside className="sidebar">
      <div className="sidebarHeader">
        <div className="sidebarBrand">GESTIONALE</div>
        <div className="sidebarVersion">Versione: 2.06.09</div>
      </div>

      <nav className="sideNav">
        <Link className={cls("/")} href="/">Dashboard</Link>

        <Link className={cls("/profilo")} href="/profilo">Profilo</Link>

        <Link className={cls("/movimenti")} href="/movimenti">Movimenti</Link>
        <Link className={cls("/giacenze")} href="/giacenze">Giacenze</Link>

        {isAdmin && <Link className={cls("/import")} href="/import">Import</Link>}

{isAdmin && <Link className={cls("/referenti")} href="/referenti">Referenti</Link>}

{isAdmin && <Link className={cls("/audit-log")} href="/audit-log">Audit Log</Link>}

{isAdmin && <Link className={cls("/admin")} href="/admin">Admin</Link>}

        {!checked && (
          <div
            className="sideLink"
            style={{ opacity: 0.6, pointerEvents: "none" }}
          >
            …
          </div>
        )}
      </nav>

      <div className="sidebarFooter"></div>
    </aside>
  );
}