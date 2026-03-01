import "./globals.css";
import { createClient } from "./_lib/supabase/server";
import SideNav from "./_components/SideNav";
import TopBar from "./_components/TopBar";

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
      <body>
        <div className="app">
          <SideNav />
          <div className="main">
            <TopBar email={email} />
            <div className="content">
              {children}
              <footer className="app-footer">
                © {new Date().getFullYear()} · Gestionale Magazzino
              </footer>
            </div>
          </div>
        </div>
      </body>
    </html>
  );
}