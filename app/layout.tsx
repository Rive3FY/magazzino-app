import "./globals.css";
import { createClient } from "./_lib/supabase/server";
import SideNav from "./_components/SideNav";
import TopBar from "./_components/TopBar";
import { ToastProvider } from "./_lib/ToastContext";
import { SidebarProvider } from "./_lib/SidebarContext";
import ForceLogoutListener from "./_components/ForceLogoutListener";
import OnlinePresenceTracker from "./_components/OnlinePresenceTracker";
import { Inter } from "next/font/google";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
export const metadata = {
  title: "Gestionale Magazzino",
  description: "Movimenti e Giacenze",
};
export const viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
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

  const hasUser = !!user;

  return (
    <html lang="it" className={inter.variable}>
      <body className={inter.className}>
        <ToastProvider>
          {hasUser && <ForceLogoutListener />}
          {hasUser && user && <OnlinePresenceTracker userId={user.id} />}
          <SidebarProvider>
            <div className={hasUser ? "app" : "app appLogin"}>
              {hasUser && <SideNav />}

              <div className="main">
                {hasUser && <TopBar displayName={displayName} displayBadge={displayBadge} />}
                <div className="content">
                  {children}
                  <footer className="app-footer">
                    © <span suppressHydrationWarning>{new Date().getFullYear()}</span> · Gestionale Magazzino
                  </footer>
                </div>
              </div>
            </div>
          </SidebarProvider>
        </ToastProvider>
      </body>
    </html>
  );
}