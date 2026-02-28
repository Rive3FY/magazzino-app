"use client";

import { useMemo, useState } from "react";
import { usePathname } from "next/navigation";

type Props = {
  email: string | null;
};

export default function TopNav({ email }: Props) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  const links = useMemo(
    () => [
      { href: "/", label: "Home" },
      { href: "/movimenti", label: "Movimenti" },
      { href: "/giacenze", label: "Giacenze" },
      { href: "/import", label: "Import" },
    ],
    []
  );

  function isActive(href: string) {
    if (href === "/") return pathname === "/";
    return pathname?.startsWith(href);
  }

  return (
    <header
      style={{
        position: "sticky",
        top: 0,
        zIndex: 20,
        borderBottom: "1px solid rgba(255,255,255,0.10)",
        background: "rgba(15, 23, 42, 0.55)",
        backdropFilter: "blur(12px)",
      }}
    >
      <div
        style={{
          maxWidth: 1040,
          margin: "0 auto",
          padding: "12px 16px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
        }}
      >
        {/* Brand */}
        <a
          href="/"
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            textDecoration: "none",
            color: "rgba(255,255,255,0.95)",
          }}
        >
          <div
            style={{
              width: 38,
              height: 38,
              borderRadius: 14,
              border: "1px solid rgba(255,255,255,0.18)",
              background:
                "radial-gradient(circle at 30% 30%, rgba(96,165,250,0.85), rgba(167,139,250,0.55))",
              boxShadow: "0 10px 30px rgba(0,0,0,0.25)",
            }}
          />
          <div style={{ lineHeight: 1.1 }}>
            <div style={{ fontWeight: 900, letterSpacing: 0.2 }}>Gestionale Magazzino</div>
            <div style={{ fontSize: 12, opacity: 0.75 }}>Movimenti · Giacenze</div>
          </div>
        </a>

        {/* Desktop nav */}
        <nav
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
          }}
        >
          <div
            style={{
              display: "flex",
              gap: 8,
              alignItems: "center",
              flexWrap: "wrap",
            }}
            className="topnav-desktop"
          >
            {links.map((l) => (
              <a
                key={l.href}
                href={l.href}
                style={isActive(l.href) ? navActive : navLink}
              >
                {l.label}
              </a>
            ))}
          </div>

          {/* User badge */}
          {email && (
            <span
              style={{
                marginLeft: 8,
                fontSize: 13,
                opacity: 0.95,
                padding: "7px 10px",
                borderRadius: 999,
                border: "1px solid rgba(255,255,255,0.16)",
                background: "rgba(255,255,255,0.06)",
                maxWidth: 260,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
              title={email}
              className="topnav-desktop"
            >
              👤 {email}
            </span>
          )}

          {/* Logout */}
          <form action="/logout" method="POST" style={{ margin: 0 }} className="topnav-desktop">
            <button type="submit" style={navGhostBtn}>
              Logout
            </button>
          </form>

          {/* Mobile hamburger */}
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-label="Apri menu"
            style={hamburgerBtn}
            className="topnav-mobile"
          >
            ☰
          </button>
        </nav>
      </div>

      {/* Mobile panel */}
      {open && (
        <div
          style={{
            borderTop: "1px solid rgba(255,255,255,0.10)",
            background: "rgba(2, 6, 23, 0.55)",
            backdropFilter: "blur(12px)",
          }}
          className="topnav-mobile"
        >
          <div style={{ maxWidth: 1040, margin: "0 auto", padding: "12px 16px" }}>
            {email && (
              <div
                style={{
                  fontSize: 13,
                  opacity: 0.95,
                  padding: "10px 12px",
                  borderRadius: 14,
                  border: "1px solid rgba(255,255,255,0.12)",
                  background: "rgba(255,255,255,0.06)",
                  marginBottom: 10,
                }}
              >
                👤 {email}
              </div>
            )}

            <div style={{ display: "grid", gap: 8 }}>
              {links.map((l) => (
                <a
                  key={l.href}
                  href={l.href}
                  onClick={() => setOpen(false)}
                  style={isActive(l.href) ? navActive : navLink}
                >
                  {l.label}
                </a>
              ))}

              <form action="/logout" method="POST" style={{ margin: 0 }}>
                <button type="submit" style={{ ...navGhostBtn, width: "100%" }}>
                  Logout
                </button>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* CSS semplice per mostrare/nascondere desktop/mobile */}
      <style>{`
        @media (max-width: 780px) {
          .topnav-desktop { display: none !important; }
          .topnav-mobile { display: inline-flex !important; }
        }
        @media (min-width: 781px) {
          .topnav-mobile { display: none !important; }
        }
      `}</style>
    </header>
  );
}

const navLink: React.CSSProperties = {
  padding: "9px 12px",
  borderRadius: 14,
  textDecoration: "none",
  color: "rgba(255,255,255,0.92)",
  border: "1px solid rgba(255,255,255,0.14)",
  background: "rgba(255,255,255,0.08)",
  fontWeight: 700,
};

const navActive: React.CSSProperties = {
  ...navLink,
  background: "rgba(255,255,255,0.16)",
  border: "1px solid rgba(255,255,255,0.22)",
};

const navGhostBtn: React.CSSProperties = {
  padding: "9px 12px",
  borderRadius: 14,
  border: "1px solid rgba(255,255,255,0.14)",
  background: "rgba(255,255,255,0.06)",
  color: "rgba(255,255,255,0.92)",
  cursor: "pointer",
  fontWeight: 800,
};

const hamburgerBtn: React.CSSProperties = {
  padding: "9px 12px",
  borderRadius: 14,
  border: "1px solid rgba(255,255,255,0.14)",
  background: "rgba(255,255,255,0.06)",
  color: "rgba(255,255,255,0.95)",
  cursor: "pointer",
  fontWeight: 900,
  lineHeight: 1,
};