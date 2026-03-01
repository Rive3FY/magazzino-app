"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export default function MobileNav() {
  const pathname = usePathname();
  const isActive = (href: string) =>
    pathname === href || (href !== "/" && pathname.startsWith(href));

  const Item = ({ href, label, icon }: { href: string; label: string; icon: string }) => (
    <Link
      href={href}
      style={{
        flex: 1,
        textAlign: "center",
        padding: "10px 6px",
        textDecoration: "none",
        fontWeight: 800,
        fontSize: 12,
        color: isActive(href) ? "#0b5566" : "#334155",
      }}
    >
      <div style={{ fontSize: 20, lineHeight: 1, marginBottom: 2 }}>{icon}</div>
      {label}
    </Link>
  );

  return (
    <nav
      className="mobileOnly"
      style={{
        position: "fixed",
        left: 12,
        right: 12,
        bottom: "calc(12px + env(safe-area-inset-bottom))",
        zIndex: 999,
        background: "rgba(255,255,255,0.95)",
        border: "1px solid rgba(15,23,42,0.12)",
        borderRadius: 18,
        boxShadow: "0 18px 40px rgba(0,0,0,0.22)",
        display: "flex",
        overflow: "hidden",
        backdropFilter: "blur(12px)",
      }}
      aria-label="Navigazione mobile"
    >
      <Item href="/" label="Home" icon="🏠" />
      <Item href="/movimenti" label="Mov." icon="➕" />
      <Item href="/giacenze" label="Giac." icon="📦" />
      <Item href="/import" label="Import" icon="📥" />
      <Item href="/admin" label="Admin" icon="🛡️" />
    </nav>
  );
}