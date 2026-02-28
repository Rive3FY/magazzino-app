import "./globals.css";
import { createClient } from "./_lib/supabase/server";
import TopNav from "./_components/TopNav";

export const metadata = {
  title: "Gestionale Magazzino",
  description: "Movimenti e Giacenze",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
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
        {/* Background più “soft” */}
        <div style={{ position: "fixed", inset: 0, overflow: "hidden", zIndex: 0 }}>
          <div
            style={{
              position: "absolute",
              width: 640,
              height: 640,
              left: -220,
              top: -240,
              borderRadius: 9999,
              background: "radial-gradient(circle at 30% 30%, rgba(96,165,250,0.9), transparent 60%)",
              filter: "blur(55px)",
              opacity: 0.85,
            }}
          />
          <div
            style={{
              position: "absolute",
              width: 640,
              height: 640,
              right: -240,
              bottom: -260,
              borderRadius: 9999,
              background: "radial-gradient(circle at 30% 30%, rgba(167,139,250,0.9), transparent 60%)",
              filter: "blur(60px)",
              opacity: 0.8,
            }}
          />
          <div
            style={{
              position: "absolute",
              inset: 0,
              background: "linear-gradient(180deg, rgba(0,0,0,0.30), rgba(0,0,0,0.45))",
              backdropFilter: "blur(12px)",
            }}
          />
        </div>

        <div style={{ position: "relative", zIndex: 1 }}>
          <TopNav email={email} />

          <main style={{ maxWidth: 1040, margin: "0 auto", padding: "26px 16px 44px" }}>
            {children}
          </main>

          <footer
            style={{
              maxWidth: 1040,
              margin: "0 auto",
              padding: "0 16px 28px",
              opacity: 0.65,
              fontSize: 12,
            }}
          >
            © {new Date().getFullYear()} · Gestionale Magazzino
          </footer>
        </div>
      </body>
    </html>
  );
}