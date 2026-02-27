import "./globals.css";

export const metadata = {
  title: "Gestionale Magazzino",
  description: "Movimenti e Giacenze",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="it">
      <body
        style={{
          margin: 0,
          fontFamily: "system-ui",
          minHeight: "100vh",
          background: "#0b1220",
          color: "rgba(255,255,255,0.92)", // ✅ testo base chiaro
        }}
      >
        {/* SFONDO SFUMATO + SFUOCATO */}
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
                  <div style={{ fontWeight: 800, lineHeight: 1.1 }}>Gestionale Magazzino</div>
                  <div style={{ fontSize: 12, opacity: 0.75 }}>Movimenti · Giacenze</div>
                </div>
              </a>

              <nav style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <a
                  href="/movimenti"
                  style={{
                    padding: "8px 12px",
                    borderRadius: 14,
                    textDecoration: "none",
                    color: "rgba(255,255,255,0.92)",
                    border: "1px solid rgba(255,255,255,0.16)",
                    background: "rgba(255,255,255,0.10)",
                  }}
                >
                  Movimenti
                </a>
                <a
                  href="/giacenze"
                  style={{
                    padding: "8px 12px",
                    borderRadius: 14,
                    textDecoration: "none",
                    color: "rgba(255,255,255,0.92)",
                    border: "1px solid rgba(255,255,255,0.16)",
                    background: "rgba(255,255,255,0.10)",
                  }}
                >
                  Giacenze
                </a>
                <a
                  href="/import"
                  style={{
                    padding: "8px 12px",
                    borderRadius: 14,
                    textDecoration: "none",
                    color: "rgba(255,255,255,0.92)",
                    border: "1px solid rgba(255,255,255,0.16)",
                    background: "rgba(255,255,255,0.06)",
                  }}
                >
                  Import
                </a>
              </nav>
            </div>
          </header>

          <main style={{ maxWidth: 980, margin: "0 auto", padding: "28px 16px 44px" }}>
            {children}
          </main>

          <footer
            style={{
              maxWidth: 980,
              margin: "0 auto",
              padding: "0 16px 28px",
              color: "rgba(255,255,255,0.75)",
              fontSize: 12,
            }}
          >
            Dati salvati nel browser. Quando vuoi: database + utenti.
          </footer>
        </div>
      </body>
    </html>
  );
}