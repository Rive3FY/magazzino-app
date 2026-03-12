"use client";

import ScopedRoleAdminUsersClient from "../../../_components/ScopedRoleAdminUsersClient";

export default function StazioniAdminPage() {
  return (
    <main className="panel" style={{ overflowX: "hidden" }}>
      <div className="pageBar">
        <div className="pageBarTitle">Attrezzature Stazioni - Gestione Admin</div>
      </div>
      <div style={{ padding: 12, display: "grid", gap: 12 }}>
        <ScopedRoleAdminUsersClient
          scope="STAZIONI"
          intro="Da qui puoi scegliere chi gestisce le funzioni admin dell'area Attrezzature Stazioni."
        />
      </div>
    </main>
  );
}
