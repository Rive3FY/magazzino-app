import "./globals.css";
import { createClient } from "./_lib/supabase/server";

export const metadata = {
  title: "Gestionale Magazzino",
  description: "Movimenti e Giacenze",
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  const email = data.user?.email ?? null;

  return (
    <html lang="it">
      <body
        style={{
          margin: 0,
          fontFamily: "system-ui",
          minHeight: "100vh",
          background: "#0b1220",
          color: "rgba(255,255,255,0.92)",
        }}
      >
        {/* SFONDO */}
        <div style={{ position: "fixed", inset: 0, overflow: "hidden", zIndex: 0 }}>
          <div
            style={{
              position: "absolute",
              width: 520,
              height: 520,
              left: -120,
              top: -140,
              borderRadius: 9999,
              background: "radial-gradient(circle at 30% 30%, #60a5fa, transparent 60%)",
              filter: "blur(45px)",
              opacity: 0.85,
            }}
          />
          <div
            style={{
              position: "absolute",
              width: 520,
              height: 520,
              right: -140,
              bottom: -160,
              borderRadius: 9999,
              background: "radial-gradient(circle at 30% 30%, #a78bfa, transparent 60%)",
              filter: "blur(50px)",
              opacity: 0.85,
            }}
          />
          <div
            style={{
              position: "absolute",
              inset: 0,
              background: "rgba(0,0,0,0.20)",
              backdropFilter: "blur(14px)",
            }}
          />
        </div>

        <div style={{ position: "relative", zIndex: 1 }}>
          {/* HEADER */}
          <header
            style={{
              position: "sticky",
              top: 0,
              zIndex: 2,
              borderBottom: "1px solid rgba(255,255,255,0.12)",
              background: "rgba(15, 23, 42, 0.55)",
              backdropFilter: "blur(10px)",
            }}
          >
            <div
              style={{
                maxWidth: 980,
                margin: "0 auto",
                padding: "14px 16px",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 12,
              }}
            >
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
                    width: 36,
                    height: 36,
                    borderRadius: 14,
                    background: "rgba(255,255,255,0.16)",
                    border: "1px solid rgba(255,255,255,0.16)",
                  }}
                />
                <div>
                  <div style={{ fontWeight: 800 }}>Gestionale Magazzino</div>
                  <div style={{ fontSize: 12, opacity: 0.75 }}>Movimenti · Giacenze</div>
                </div>
              </a>

              <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", justifyContent: "flex-end" }}>
                {email && (
                  <span
                    style={{
                      fontSize: 13,
                      opacity: 0.9,
                      padding: "6px 10px",
                      borderRadius: 999,
                      border: "1px solid rgba(255,255,255,0.16)",
                      background: "rgba(255,255,255,0.06)",
                    }}
                  >
                    👤 {email}
                  </span>
                )}

                <nav style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                  <a href="/movimenti" style={navStyle}>
                    Movimenti
                  </a>
                  <a href="/giacenze" style={navStyle}>
                    Giacenze
                  </a>
                  <a href="/import" style={navStyleSecondary}>
                    Import
                  </a>

                  {/* ✅ VERO BOTTONE LOGOUT (POST) */}
                  <form action="/logout" method="POST" style={{ margin: 0 }}>
                    <button type="submit" style={navStyleSecondary}>
                      Logout
                    </button>
                  </form>
                </nav>
              </div>
            </div>
          </header>

          {/* CONTENUTO */}
          <main style={{ maxWidth: 980, margin: "0 auto", padding: "28px 16px 44px" }}>
            {children}
          </main>
        </div>
      </body>
    </html>
  );
}

const navStyle: React.CSSProperties = {
  padding: "8px 12px",
  borderRadius: 14,
  textDecoration: "none",
  color: "rgba(255,255,255,0.92)",
  border: "1px solid rgba(255,255,255,0.16)",
  background: "rgba(255,255,255,0.10)",
};

const navStyleSecondary: React.CSSProperties = {
  padding: "8px 12px",
  borderRadius: 14,
  border: "1px solid rgba(255,255,255,0.16)",
  background: "rgba(255,255,255,0.06)",
  color: "rgba(255,255,255,0.92)",
  cursor: "pointer",
};