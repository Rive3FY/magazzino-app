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
  created_by_email: string | null;
};

function isSameDay(d: Date, ref: Date) {
  return (
    d.getFullYear() === ref.getFullYear() &&
    d.getMonth() === ref.getMonth() &&
    d.getDate() === ref.getDate()
  );
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

  useEffect(() => {
    let alive = true;

    (async () => {
      setLoading(true);

      // 1) Count materiali (metodo veloce: count exact, senza scaricare righe)
      const { count: cItems, error: eItems } = await supabase
        .from("items")
        .select("code", { count: "exact", head: true });

      // 2) Ultimi movimenti (prendiamo 100 per calcolare "oggi" + mostrare ultimi 10)
      const { data: movs, error: eMovs } = await supabase
        .from("movements")
        .select("id,created_at,type,code,qty,note,created_by_email")
        .order("created_at", { ascending: false })
        .limit(100);

      if (!alive) return;

      if (eItems) console.error(eItems);
      if (eMovs) console.error(eMovs);

      setItemsCount(cItems ?? 0);
      setMovements((movs ?? []) as Movement[]);

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

  return (
    <div>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div>
          <h1 style={{ margin: 0 }}>Dashboard</h1>
          <div style={{ opacity: 0.85, marginTop: 6 }}>
            Panoramica rapida di anagrafica e operatività.
          </div>
        </div>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <a className="btn btnPrimary" href="/movimenti">➕/➖ Nuovo movimento</a>
          <a className="btn" href="/giacenze">📦 Vai a giacenze</a>
        </div>
      </div>

      {/* KPI */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(12, 1fr)", gap: 12, marginTop: 14 }}>
        <div className="glass" style={{ gridColumn: "span 4" }}>
          <div style={{ opacity: 0.85, fontSize: 12 }}>Materiali</div>
          <div style={{ fontSize: 28, fontWeight: 900, marginTop: 6 }}>
            {loading ? "…" : itemsCount}
          </div>
          <div style={{ opacity: 0.8, fontSize: 12, marginTop: 6 }}>Codici in anagrafica</div>
        </div>

        <div className="glass" style={{ gridColumn: "span 4" }}>
          <div style={{ opacity: 0.85, fontSize: 12 }}>Movimenti oggi</div>
          <div style={{ fontSize: 28, fontWeight: 900, marginTop: 6 }}>
            {loading ? "…" : movementsToday}
          </div>
          <div style={{ opacity: 0.8, fontSize: 12, marginTop: 6 }}>Entrate/uscite registrate oggi</div>
        </div>

        <div className="glass" style={{ gridColumn: "span 4" }}>
          <div style={{ opacity: 0.85, fontSize: 12 }}>Ultimo movimento</div>
          <div style={{ marginTop: 8, fontWeight: 800 }}>
            {loading ? "…" : lastMovement ? `${lastMovement.code} · ${lastMovement.type === "IN" ? "Entrata" : "Uscita"}` : "—"}
          </div>
          <div style={{ opacity: 0.85, fontSize: 12, marginTop: 6 }}>
            {loading ? "" : lastMovement ? fmtDate(lastMovement.created_at) : ""}
          </div>
        </div>
      </div>

      {/* Ultimi movimenti */}
      <div style={{ marginTop: 14 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <h2 style={{ margin: 0 }}>Ultimi movimenti</h2>
          <a className="btn" href="/movimenti">Vedi tutto</a>
        </div>

        <div style={{ overflowX: "auto", marginTop: 10 }}>
          <table className="table">
            <thead>
              <tr>
                <th>Data</th>
                <th>Tipo</th>
                <th>Codice</th>
                <th>Q.tà</th>
                <th>Note</th>
                <th>Inserito da</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={6} style={{ padding: 12, color: "#0f172a" }}>
                    Caricamento…
                  </td>
                </tr>
              ) : last10.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ padding: 12, color: "#0f172a" }}>
                    Nessun movimento.
                  </td>
                </tr>
              ) : (
                last10.map((m) => (
                  <tr key={m.id}>
                    <td>{fmtDate(m.created_at)}</td>
                    <td>
                      <span className={`badge ${m.type === "IN" ? "badgeIn" : "badgeOut"}`}>
                        {m.type === "IN" ? "Entrata" : "Uscita"}
                      </span>
                    </td>
                    <td>{m.code}</td>
                    <td>
                      {m.type === "IN" ? "+" : "-"}
                      {m.qty}
                    </td>
                    <td>{m.note ?? ""}</td>
                    <td>{m.created_by_email ?? "-"}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div style={{ marginTop: 12, opacity: 0.8, fontSize: 12 }}>
        Suggerimento: usa “Nuovo movimento” per registrare rapidamente entrate/uscite.
      </div>
    </div>
  );
}