import { createClient } from "../_lib/supabase/server";

export const metadata = {
  title: "Admin - Gestionale Magazzino",
};

export default async function AdminPage() {
  const supabase = await createClient();

  const { data: u } = await supabase.auth.getUser();
  const user = u.user;

  if (!user) {
    return (
      <main className="panel">
        <div className="pageBar">
          <div className="pageBarTitle">Admin</div>
        </div>
        <div style={{ padding: 12 }}>Devi essere loggato.</div>
      </main>
    );
  }

  const { data: isAdm, error } = await supabase.rpc("is_admin");
  const ok = !error && !!isAdm;

  if (!ok) {
    return (
      <main className="panel">
        <div className="pageBar">
          <div className="pageBarTitle">Admin</div>
        </div>
        <div style={{ padding: 12, color: "#991b1b", fontWeight: 800 }}>
          Accesso negato: solo Admin.
        </div>
      </main>
    );
  }

  const AdminPanelClient = (await import("./AdminPanelClient")).default;

  return <AdminPanelClient />;
}