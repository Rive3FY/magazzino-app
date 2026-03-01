"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "./_lib/supabase/client";

type Movement = {
  id: string;
  created_at: string;
  type: "IN" | "OUT";
  code: string;
  qty: number;
  note: string | null;
  created_by: string | null; // ✅ usiamo questo per risalire al profilo
  created_by_email: string | null;
};

type ProfileMini = {
  id: string;
  badge_number: string;
  first_name: string;
  last_name: string;
};

function isSameDay(d: Date, ref: Date) {
  return d.getFullYear() === ref.getFullYear() && d.getMonth() === ref.getMonth() && d.getDate() === ref.getDate();
}

function fmtDate(iso: string) {
  const d = new Date(iso);
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();
  const hh = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  return `${dd}/${mm}/${yyyy} ${hh}:${mi}`;
}

export default function Home() {
  const supabase = createClient();

  const [loading, setLoading] = useState(true);

  const [itemsCount, setItemsCount] = useState<number>(0);
  const [movements, setMovements] = useState<Movement[]>([]);

  // mappa profili (id -> "Nome Cognome · Badge X")
  const [profileMap, setProfileMap] = useState<Record<string, string>>({});

  useEffect(() => {
    let alive = true;

    (async () => {
      setLoading(true);

      // 0) Controllo login + profilo: se mancano dati -> vai a /profilo
      const { data: u } = await supabase.auth.getUser();
      const user = u.user;

      if (!user) {
        if (!alive) return;
        window.location.href = "/login";
        return;
      }

      const { data: prof, error: eProf } = await supabase
        .from("profiles")
        .select("badge_number,first_name,last_name")
        .eq("id", user.id)
        .maybeSingle();

      if (eProf) console.error(eProf);

      const badgeOk = !!prof?.badge_number?.trim();
      const firstOk = !!prof?.first_name?.trim();
      const lastOk = !!prof?.last_name?.trim();

      if (!badgeOk || !firstOk || !lastOk) {
        if (!alive) return;
        window.location.href = "/profilo";
        return;
      }

      // 1) Count materiali (count exact, senza scaricare righe)
      const { count: cItems, error: eItems } = await supabase
        .from("items")
        .select("code", { count: "exact", head: true });

      // 2) Ultimi movimenti (prendiamo 100)
      const { data: movs, error: eMovs } = await supabase
        .from("movements")
        .select("id,created_at,type,code,qty,note,created_by,created_by_email")
        .order("created_at", { ascending: false })
        .limit(100);

      if (!alive) return;

      if (eItems) console.error(eItems);
      if (eMovs) console.error(eMovs);

      setItemsCount(cItems ?? 0);
      const list = (movs ?? []) as Movement[];
      setMovements(list);

      // 3) Carico i profili degli autori movimenti (per mostrare nome+cognome+badge)
      const ids = Array.from(new Set(list.map((m) => m.created_by).filter(Boolean))) as string[];

      if (ids.length > 0) {
        const { data: profiles, error: eP2 } = await supabase
          .from("profiles")
          .select("id,badge_number,first_name,last_name")
          .in("id", ids);

        if (eP2) {
          console.error(eP2);
          setProfileMap({});
        } else {
          const map: Record<string, string> = {};
          for (const p of (profiles ?? []) as ProfileMini[]) {
            const label = `${p.first_name} ${p.last_name} · Badge ${p.badge_number}`;
            map[p.id] = label;
          }
          setProfileMap(map);
        }
      } else {
        setProfileMap({});
      }

      setLoading(false);
    })();

    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const today = new Date();
  const movementsToday = useMemo(() => {
    return movements.filter((m) => isSameDay(new Date(m.created_at), today)).length;
  }, [movements]);

  const lastMovement = movements[0] ?? null;
  const last10 = movements.slice(0, 10);

  function whoLabel(m: Movement) {
    if (m.created_by && profileMap[m.created_by]) return profileMap[m.created_by];
    // fallback: email se il profilo non è disponibile
    return m.created_by_email ?? "-";
  }

  return (
    <main className="panel">
      <div className="pageBar">
        <div className="pageBarTitle">Dashboard</div>
        <div className="pageBarRight" style={{ display: "flex", gap: 8 }}>
          <a className="btn btnPrimary" href="/movimenti">Nuovo movimento</a>
          <a className="btn" href="/giacenze">Giacenze</a>
        </div>
      </div>

      {/* KPI */}
      <div style={{ padding: 12 }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(12, 1fr)", gap: 12 }}>
          <div className="panel" style={{ gridColumn: "span 4" }}>
            <div style={{ padding: 12 }}>
              <div style={{ color: "#6b7280", fontSize: 12 }}>Materiali</div>
              <div style={{ fontSize: 28, fontWeight: 900, marginTop: 6 }}>{loading ? "…" : itemsCount}</div>
              <div style={{ color: "#6b7280", fontSize: 12, marginTop: 6 }}>Codici in anagrafica</div>
            </div>
          </div>

          <div className="panel" style={{ gridColumn: "span 4" }}>
            <div style={{ padding: 12 }}>
              <div style={{ color: "#6b7280", fontSize: 12 }}>Movimenti oggi</div>
              <div style={{ fontSize: 28, fontWeight: 900, marginTop: 6 }}>{loading ? "…" : movementsToday}</div>
              <div style={{ color: "#6b7280", fontSize: 12, marginTop: 6 }}>Entrate/uscite registrate oggi</div>
            </div>
          </div>

          <div className="panel" style={{ gridColumn: "span 4" }}>
            <div style={{ padding: 12 }}>
              <div style={{ color: "#6b7280", fontSize: 12 }}>Ultimo movimento</div>
              <div style={{ marginTop: 8, fontWeight: 900 }}>
                {loading
                  ? "…"
                  : lastMovement
                  ? `${lastMovement.code} · ${lastMovement.type === "IN" ? "Entrata" : "Uscita"}`
                  : "—"}
              </div>
              <div style={{ color: "#6b7280", fontSize: 12, marginTop: 6 }}>
                {loading ? "" : lastMovement ? fmtDate(lastMovement.created_at) : ""}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Ultimi movimenti */}
      <div style={{ padding: "0 12px 12px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <h2 style={{ margin: 0, fontSize: 16 }}>Ultimi movimenti</h2>
          <a className="btn" href="/movimenti">Vedi tutto</a>
        </div>

        <div className="tableWrap" style={{ marginTop: 10 }}>
          <table className="table">
            <thead>
              <tr>
                <th>Data</th>
                <th>Tipo</th>
                <th>Codice</th>
                <th>Q.tà</th>
                <th>Note</th>
                <th>Operatore</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={6}>Caricamento…</td>
                </tr>
              ) : last10.length === 0 ? (
                <tr>
                  <td colSpan={6}>Nessun movimento.</td>
                </tr>
              ) : (
                last10.map((m) => (
                  <tr key={m.id}>
                    <td>{fmtDate(m.created_at)}</td>
                    <td>{m.type === "IN" ? <span className="badgeIn">Entrata</span> : <span className="badgeOut">Uscita</span>}</td>
                    <td>{m.code}</td>
                    <td>
                      {m.type === "IN" ? "+" : "-"}
                      {m.qty}
                    </td>
                    <td>{m.note ?? ""}</td>
                    <td>{whoLabel(m)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div style={{ marginTop: 12, color: "#6b7280", fontSize: 12 }}>
          Suggerimento: usa “Nuovo movimento” per registrare rapidamente entrate/uscite.
        </div>
      </div>
    </main>
  );
}