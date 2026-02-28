import "./globals.css";
import { createClient } from "./_lib/supabase/server";
import TopNav from "./_components/TopNav";

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
          color: "rgba(255,255,255,0.92)",
        }}
      >
        {/* SFONDO TERNA */}
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 0,
            backgroundImage: "url('/terna-bg.jpg')",
            backgroundSize: "cover",
            backgroundPosition: "center",
            backgroundRepeat: "no-repeat",
          }}
        >
          {/* Overlay scuro per leggibilità */}
          <div
            style={{
              position: "absolute",
              inset: 0,
              background: "rgba(11, 18, 32, 0.70)",
              backdropFilter: "blur(2px)",
            }}
          />
        </div>

        {/* CONTENUTO SOPRA LO SFONDO */}
        <div style={{ position: "relative", zIndex: 1 }}>
          <TopNav email={email} />

          <main
            style={{
              maxWidth: 1040,
              margin: "0 auto",
              padding: "26px 16px 44px",
            }}
          >
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