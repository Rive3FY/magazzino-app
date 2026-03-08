"use client";

import { useEffect, useState } from "react";
import { createClient } from "../_lib/supabase/client";

export default function ProfiloPage() {
  const supabase = createClient();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const [badge, setBadge] = useState("");
  const [first, setFirst] = useState("");
  const [last, setLast] = useState("");

  useEffect(() => {
    let alive = true;

    (async () => {
      setLoading(true);
      setMsg(null);

      const { data: u } = await supabase.auth.getUser();
      const user = u.user;

      if (!user) {
        if (!alive) return;
        window.location.href = "/login";
        return;
      }

      const { data: p, error } = await supabase
        .from("profiles")
        .select("badge_number, first_name, last_name")
        .eq("id", user.id)
        .maybeSingle();

      if (!alive) return;

      if (error) {
        console.error(error);
        setMsg("Errore caricamento profilo: " + error.message);
      }

      if (p) {
        setBadge(p.badge_number ?? "");
        setFirst(p.first_name ?? "");
        setLast(p.last_name ?? "");
      }

      setLoading(false);
    })();

    return () => {
      alive = false;
    };
  }, []);

  async function save() {
    setMsg(null);

    const b = badge.trim();
    const f = first.trim();
    const l = last.trim();

    if (!b || !f || !l) {
      setMsg("Compila badge, nome e cognome.");
      return;
    }

    setSaving(true);

    try {
      const { data: u } = await supabase.auth.getUser();
      const user = u.user;

      if (!user) {
        window.location.href = "/login";
        return;
      }

      const { data: existing, error: readError } = await supabase
        .from("profiles")
        .select("id")
        .eq("id", user.id)
        .maybeSingle();

      if (readError) {
        setMsg("Errore verifica profilo: " + readError.message);
        return;
      }

      let saveError = null;

      if (existing) {
        const { error } = await supabase
          .from("profiles")
          .update({
            badge_number: b,
            first_name: f,
            last_name: l,
          })
          .eq("id", user.id);

        saveError = error;
      } else {
        const { error } = await supabase
          .from("profiles")
          .insert({
            id: user.id,
            badge_number: b,
            first_name: f,
            last_name: l,
          });

        saveError = error;
      }

      if (saveError) {
        setMsg("Errore salvataggio: " + saveError.message);
        return;
      }

      setMsg("Profilo salvato ✅");

      setTimeout(() => {
        window.location.href = "/";
      }, 600);
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <main className="panel">
        <div className="pageBar">
          <div className="pageBarTitle">Profilo operatore</div>
        </div>
        <div style={{ padding: 12 }}>Caricamento…</div>
      </main>
    );
  }

  return (
    <main className="panel">
      <div className="pageBar">
        <div className="pageBarTitle">Profilo operatore</div>
      </div>

      <div
        className="filters mobileGrid1"
        style={{ gridTemplateColumns: "1fr 1fr 1fr 1fr" }}
      >
        <div className="field">
          <label>Numero badge</label>
          <input
            className="input"
            value={badge}
            onChange={(e) => setBadge(e.target.value)}
            placeholder="es. 1024"
          />
        </div>

        <div className="field">
          <label>Nome</label>
          <input
            className="input"
            value={first}
            onChange={(e) => setFirst(e.target.value)}
            placeholder="Mario"
          />
        </div>

        <div className="field">
          <label>Cognome</label>
          <input
            className="input"
            value={last}
            onChange={(e) => setLast(e.target.value)}
            placeholder="Rossi"
          />
        </div>

        <div className="field">
          <label>&nbsp;</label>
          <button
            className="btn btnPrimary"
            onClick={save}
            disabled={saving}
          >
            {saving ? "Salvataggio…" : "Salva"}
          </button>
        </div>
      </div>

      {msg ? (
        <div
          style={{
            padding: "10px 12px",
            color: msg.includes("✅") ? "#065f46" : "#991b1b",
            fontWeight: 700,
          }}
        >
          {msg}
        </div>
      ) : null}
    </main>
  );
}