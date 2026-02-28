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
      <body>
        <TopNav email={email} />

        <main className="app-container">
          {children}
        </main>

        <footer className="app-footer">
          © {new Date().getFullYear()} · Gestionale Magazzino
        </footer>
      </body>
    </html>
  );
}