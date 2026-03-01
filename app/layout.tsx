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
  const user = data.user;

  let displayName = user?.email ?? "";
  let displayBadge = "";

  if (user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("badge_number, first_name, last_name")
      .eq("id", user.id)
      .maybeSingle();

    const first = profile?.first_name?.trim() ?? "";
    const last = profile?.last_name?.trim() ?? "";
    const badge = profile?.badge_number?.trim() ?? "";

    if (first && last) displayName = `${first} ${last}`;
    if (badge) displayBadge = `Badge ${badge}`;
  }

  return (
    <html lang="it">
      <body>
        <div className="app">
          <SideNav />

          <div className="main">
            <TopBar displayName={displayName} displayBadge={displayBadge} />

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