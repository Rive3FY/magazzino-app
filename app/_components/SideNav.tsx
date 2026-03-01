"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export default function SideNav() {
  const pathname = usePathname();
  const isActive = (href: string) =>
    pathname === href || (href !== "/" && pathname.startsWith(href));

  const cls = (href: string) => `sideLink ${isActive(href) ? "active" : ""}`;

  return (
    <aside className="sidebar">
      <div className="sidebarHeader">
        <div className="sidebarBrand">GESTIONALE</div>
        <div className="sidebarVersion">Versione: 2.06.08</div>
      </div>

      <nav className="sideNav">
        <Link className={cls("/")} href="/">Dashboard</Link>
        <Link className={cls("/movimenti")} href="/movimenti">Movimenti</Link>
        <Link className={cls("/giacenze")} href="/giacenze">Giacenze</Link>
        <Link className={cls("/import")} href="/import">Import</Link>
      </nav>

      <div className="sidebarFooter">
        <div>• Operatori</div>
        <div>• Impostazioni</div>
      </div>
    </aside>
  );
}