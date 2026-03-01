"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export default function MobileNav() {
  const pathname = usePathname();

  const isActive = (href: string) =>
    pathname === href || (href !== "/" && pathname.startsWith(href));

  const NavItem = ({
    href,
    label,
    icon,
  }: {
    href: string;
    label: string;
    icon: string;
  }) => (
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
        transition: "0.2s",
      }}
    >
      <div
        style={{
          fontSize: 20,
          lineHeight: 1,
          marginBottom: 2,
        }}
      >
        {icon}
      </div>
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
        bottom: 12,
        zIndex: 999,
        background: "rgba(255,255,255,0.95)",
        border: "1px solid rgba(15,23,42,0.12)",
        borderRadius: 18,
        boxShadow: "0 18px 40px rgba(0,0,0,0.22)",
        display: "flex",
        overflow: "hidden",
        backdropFilter: "blur(12px)",
      }}
    >
      <NavItem href="/" label="Home" icon="🏠" />
      <NavItem href="/movimenti" label="Mov." icon="➕" />
      <NavItem href="/giacenze" label="Giac." icon="📦" />
      <NavItem href="/import" label="Import" icon="📥" />
      <NavItem href="/admin" label="Admin" icon="🛡️" />
    </nav>
  );
}