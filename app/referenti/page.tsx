"use client";

import React, { useEffect, useState } from "react";
import { createClient } from "../_lib/supabase/client";

type ReferentRow = {
  id: string;
  name: string;
  email: string;
  is_active: boolean;
};

export default function ReferentiPage() {
  const supabase = createClient();

  const [rows, setRows] = useState<ReferentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [isActive, setIsActive] = useState(true);

  const [editingId, setEditingId] = useState<string | null>(null);

  async function loadReferents() {
    setLoading(true);
    setMsg(null);

    const { data, error } = await supabase
      .from("referents")
      .select("id,name,email,is_active")
      .order("name", { ascending: true });

    if (error) {
      console.error("loadReferents error:", error);
      setRows([]);
      setLoading(false);
      setMsg("Errore caricamento referenti.");
      return;
    }

    setRows((data ?? []) as ReferentRow[]);
    setLoading(false);
  }

  function resetForm() {
    setName("");
    setEmail("");
    setIsActive(true);
    setEditingId(null);
  }

  function startEdit(r: ReferentRow) {
    setEditingId(r.id);
    setName(r.name ?? "");
    setEmail(r.email ?? "");
    setIsActive(!!r.is_active);
    setMsg(null);
  }

  async function saveReferent() {
    if (!isAdmin) return;

    setMsg(null);

    const cleanName = name.trim();
    const cleanEmail = email.trim().toLowerCase();

    if (!cleanName) {
      setMsg("Inserisci nome e cognome.");
      return;
    }

    if (!cleanEmail) {
      setMsg("Inserisci email.");
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(cleanEmail)) {
      setMsg("Email non valida.");
      return;
    }

    setSaving(true);

    try {
      if (editingId) {
        const { error } = await supabase
          .from("referents")
          .update({
            name: cleanName,
            email: cleanEmail,
            is_active: isActive,
          })
          .eq("id", editingId);

        if (error) {
          console.error("update referent error:", error);
          setMsg("Errore aggiornamento referente: " + error.message);
          return;
        }

        setMsg("Referente aggiornato ✅");
      } else {
        const { error } = await supabase
          .from("referents")
          .insert({
            name: cleanName,
            email: cleanEmail,
            is_active: isActive,
          });

        if (error) {
          console.error("insert referent error:", error);
          setMsg("Errore creazione referente: " + error.message);
          return;
        }

        setMsg("Referente creato ✅");
      }

      resetForm();
      await loadReferents();
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(r: ReferentRow) {
    if (!isAdmin) return;

    const { error } = await supabase
      .from("referents")
      .update({ is_active: !r.is_active })
      .eq("id", r.id);

    if (error) {
      console.error("toggle active error:", error);
      setMsg("Errore aggiornamento stato referente.");
      return;
    }

    await loadReferents();
  }

  async function deleteReferent(id: string) {
    if (!isAdmin) return;

    const ok = confirm("Eliminare questo referente?");
    if (!ok) return;

    const { error } = await supabase
      .from("referents")
      .delete()
      .eq("id", id);

    if (error) {
      console.error("delete referent error:", error);
      setMsg("Errore eliminazione referente.");
      return;
    }

    setMsg("Referente eliminato ✅");

    if (editingId === id) {
      resetForm();
    }

    await loadReferents();
  }

  useEffect(() => {
    (async () => {
      const { data: userData } = await supabase.auth.getUser();
      const uid = userData.user?.id ?? null;

      if (!uid) {
        window.location.href = "/login";
        return;
      }

      const { data: isAdm, error } = await supabase.rpc("is_admin");

      if (error) {
        console.error("is_admin rpc error:", error);
        setIsAdmin(false);
        setLoading(false);
        return;
      }

      const adminFlag = !!isAdm;
      setIsAdmin(adminFlag);

      if (!adminFlag) {
        setLoading(false);
        return;
      }

      await loadReferents();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (isAdmin === null) {
    return (
      <main className="panel">
        <div className="pageBar">
          <div className="pageBarTitle">Impostazioni - Referenti</div>
        </div>
        <div className="card" style={{ padding: 12 }}>
          Verifica permessi…
        </div>
      </main>
    );
  }

  if (!isAdmin) {
    return (
      <main className="panel">
        <div className="pageBar">
          <div className="pageBarTitle">Impostazioni - Referenti</div>
        </div>
        <div className="card" style={{ padding: 12, fontWeight: 800 }}>
          Accesso non consentito.
        </div>
      </main>
    );
  }

  return (
    <main className="panel" style={{ overflowX: "hidden" }}>
      <div className="pageBar">
        <div className="pageBarTitle">Impostazioni - Referenti</div>
      </div>

      <div className="card" style={{ padding: 12 }}>
        <div style={{ fontWeight: 900, marginBottom: 10 }}>
          {editingId ? "Modifica referente" : "Nuovo referente"}
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "2fr 2fr 1fr auto",
            gap: 10,
            alignItems: "end",
          }}
        >
          <div>
            <label className="label" htmlFor="refName">
              Nome e cognome
            </label>
            <input
              id="refName"
              className="input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Es. Mario Rossi"
            />
          </div>

          <div>
            <label className="label" htmlFor="refEmail">
              Email
            </label>
            <input
              id="refEmail"
              className="input"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Es. mario.rossi@azienda.it"
            />
          </div>

          <div>
            <label className="label" htmlFor="refActive">
              Stato
            </label>
            <select
              id="refActive"
              className="input"
              value={isActive ? "true" : "false"}
              onChange={(e) => setIsActive(e.target.value === "true")}
            >
              <option value="true">Attivo</option>
              <option value="false">Non attivo</option>
            </select>
          </div>

          <div style={{ display: "flex", gap: 10 }}>
            <button
              className="btn btnPrimary"
              onClick={saveReferent}
              disabled={saving}
            >
              {saving ? "Salvataggio..." : editingId ? "Salva" : "Crea"}
            </button>

            <button
              className="btn"
              onClick={resetForm}
              disabled={saving}
            >
              Pulisci
            </button>
          </div>
        </div>

        {msg && (
          <div style={{ marginTop: 10, fontWeight: 800 }}>
            {msg}
          </div>
        )}
      </div>

      <div className="card" style={{ padding: 12, marginTop: 12 }}>
        <div style={{ fontWeight: 900, marginBottom: 10 }}>
          Elenco referenti
        </div>

        {loading ? (
          <div style={{ padding: 12 }}>Caricamento…</div>
        ) : rows.length === 0 ? (
          <div style={{ padding: 12 }}>Nessun referente.</div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table className="table">
              <thead>
                <tr>
                  <th>Nome</th>
                  <th>Email</th>
                  <th>Stato</th>
                  <th>Azioni</th>
                </tr>
              </thead>

              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td style={{ fontWeight: 900 }}>{r.name}</td>
                    <td>{r.email}</td>
                    <td>{r.is_active ? "Attivo" : "Non attivo"}</td>
                    <td>
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                        <button className="btn" onClick={() => startEdit(r)}>
                          Modifica
                        </button>

                        <button className="btn" onClick={() => toggleActive(r)}>
                          {r.is_active ? "Disattiva" : "Attiva"}
                        </button>

                        <button className="btn" onClick={() => deleteReferent(r.id)}>
                          Elimina
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </main>
  );
}