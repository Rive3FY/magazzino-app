"use client";

import { useState } from "react";
import ScopedRoleAdminUsersClient from "../../../_components/ScopedRoleAdminUsersClient";
import EquipmentNfcCategoryTagsClient from "../../_components/EquipmentNfcCategoryTagsClient";
import ConfirmWithInputModal from "../../../_components/ConfirmWithInputModal";
import { useIsAdmin } from "../../../_lib/hooks/useIsAdmin";
import { useToast } from "../../../_lib/ToastContext";

export default function LineeAdminPage() {
  const { isSuperAdmin } = useIsAdmin();
  const toast = useToast();
  const [resetting, setResetting] = useState(false);
  const [resetModalOpen, setResetModalOpen] = useState(false);

  async function executeResetAttrezzature() {
    try {
      setResetting(true);
      setResetModalOpen(false);
      const res = await fetch("/api/admin/reset-attrezzature", { method: "POST", credentials: "include" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || res.statusText);
      toast.success("Reset attrezzature completato con successo.");
      window.location.reload();
    } catch (e: unknown) {
      toast.error("Errore reset attrezzature: " + (e instanceof Error ? e.message : "sconosciuto"));
    } finally {
      setResetting(false);
    }
  }

  return (
    <main className="panel" style={{ overflowX: "hidden" }}>
      <div className="pageBar">
        <div className="pageBarTitle">Attrezzature Linee - Gestione Admin</div>
      </div>
      <div style={{ padding: 12, display: "grid", gap: 12 }}>
        {isSuperAdmin && (
          <div style={{ display: "flex", justifyContent: "flex-end" }}>
            <button
              className="btn"
              onClick={() => setResetModalOpen(true)}
              disabled={resetting}
              style={{ borderColor: "rgba(239,68,68,0.5)", background: "rgba(239,68,68,0.10)", color: "#991b1b" }}
            >
              {resetting ? "Reset…" : "Reset attrezzature"}
            </button>
          </div>
        )}
        <EquipmentNfcCategoryTagsClient area="LINEE" />
        <ScopedRoleAdminUsersClient
          scope="LINEE"
          intro="Da qui puoi scegliere chi gestisce le funzioni admin dell'area Attrezzature Linee."
        />
      </div>

      <ConfirmWithInputModal
        open={resetModalOpen}
        title="Reset attrezzature"
        message="ATTENZIONE: Questa operazione cancellerà TUTTE le attrezzature (Linee e Stazioni) e TUTTI i movimenti collegati. L'operazione è irreversibile."
        inputLabel="Scrivi esattamente per confermare:"
        confirmPhrase="RESET ATTREZZATURE"
        confirmLabel="Esegui reset"
        cancelLabel="Annulla"
        danger
        onConfirm={() => void executeResetAttrezzature()}
        onCancel={() => setResetModalOpen(false)}
      />
    </main>
  );
}
