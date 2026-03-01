"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { createClient } from "../_lib/supabase/client";

export default function SideNav() {
  const pathname = usePathname();
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
        if (!u.user) {
          if (!alive) return;
          setIsAdmin(false);
          setChecked(true);
          return;
        }

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <aside className="sidebar">
      <div className="sidebarHeader">
        <div className="sidebarBrand">GESTIONALE</div>
        <div className="sidebarVersion">Versione: 2.06.09</div>
      </div>

      <nav className="sideNav">
        <Link className={cls("/")} href="/">Dashboard</Link>
        <Link className={cls("/movimenti")} href="/movimenti">Movimenti</Link>
        <Link className={cls("/giacenze")} href="/giacenze">Giacenze</Link>

        {/* Import: se vuoi che lo vedano solo admin */}
        {isAdmin && <Link className={cls("/import")} href="/import">Import</Link>}

        {/* Admin: solo admin */}
        {isAdmin && <Link className={cls("/admin")} href="/admin">Admin</Link>}

        {/* Se vuoi far vedere un placeholder mentre controlla */}
        {!checked && (
          <div className="sideLink" style={{ opacity: 0.6, pointerEvents: "none" }}>
            …
          </div>
        )}
      </nav>

      <div className="sidebarFooter">
        <div>• Operatori</div>
        <div>• Impostazioni</div>
      </div>
    </aside>
  );
}