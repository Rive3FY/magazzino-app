"use client";

import React, { useEffect, useState } from "react";
import { createClient } from "../_lib/supabase/client";

type AuditRow = {
  id: string;
  created_at: string;
  action: string;
  entity_type: string;
  entity_id: string | null;
  code: string | null;
  warehouse: string | null;
  user_id: string | null;
  user_email: string | null;
  user_name: string | null;
  details_json: Record<string, any> | null;
};
function fmtDateTime(iso: string) {
  if (!iso) return "-";
  return new Date(iso).toLocaleString("it-IT");
}

function renderAuditDetails(row: {
  action: string;
  details_json: Record<string, any> | null;
}) {
  const d = row.details_json ?? {};

  if (row.action === "MOVEMENT_CREATED") {
    return (
      <div style={{ display: "grid", gap: 4 }}>
        <div><b>Tipo:</b> {d.type ?? "-"}</div>
        <div><b>Quantità:</b> {d.qty ?? "-"}</div>
        <div><b>Stato:</b> {d.status ?? "-"}</div>
        <div><b>Nota:</b> {d.note ?? "-"}</div>
      </div>
    );
  }

  if (row.action === "MOVEMENT_DELETED") {
    return (
      <div style={{ display: "grid", gap: 4 }}>
        <div><b>Tipo:</b> {d.type ?? "-"}</div>
        <div><b>Quantità:</b> {d.qty ?? "-"}</div>
      </div>
    );
  }

  if (row.action === "MOVEMENT_CLOSED") {
    return (
      <div style={{ display: "grid", gap: 4 }}>
        <div><b>Tipo:</b> {d.type ?? "-"}</div>
        <div><b>Uscita:</b> {d.out_qty ?? "-"}</div>
        <div><b>Rientro:</b> {d.returned_qty ?? "-"}</div>
        <div><b>Netta:</b> {d.net_qty ?? "-"}</div>
        <div><b>Referente:</b> {d.referent_name ?? "-"}</div>
        <div><b>Email referente:</b> {d.referent_email ?? "-"}</div>
        <div><b>Nota rientro:</b> {d.return_note ?? "-"}</div>
      </div>
    );
  }

  if (row.action === "MATERIAL_CREATED" || row.action === "MATERIAL_UPDATED") {
    return (
      <div style={{ display: "grid", gap: 4 }}>
        <div><b>Descrizione:</b> {d.name ?? "-"}</div>
        <div><b>UM:</b> {d.um ?? "-"}</div>
        <div><b>Libero:</b> {d.qty_free ?? "-"}</div>
        <div><b>Bloccato:</b> {d.qty_blocked ?? "-"}</div>
        <div><b>Qualità:</b> {d.qty_quality ?? "-"}</div>
        <div><b>Totale iniziale:</b> {d.initial_qty ?? "-"}</div>
      </div>
    );
  }

  if (row.action === "MATERIAL_DELETED") {
    return (
      <div style={{ display: "grid", gap: 4 }}>
        <div><b>Libero:</b> {d.qty_free ?? "-"}</div>
        <div><b>Bloccato:</b> {d.qty_blocked ?? "-"}</div>
        <div><b>Qualità:</b> {d.qty_quality ?? "-"}</div>
        <div><b>Totale iniziale:</b> {d.initial_qty ?? "-"}</div>
      </div>
    );
  }

  return (
    <pre
      style={{
        margin: 0,
        whiteSpace: "pre-wrap",
        fontSize: 12,
        lineHeight: 1.35,
        fontFamily: "monospace",
      }}
    >
      {JSON.stringify(d ?? {}, null, 2)}
    </pre>
  );
}
export default function AuditLogPage() {
  const supabase = createClient();

  const [rows, setRows] = useState<AuditRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const [q, setQ] = useState("");
  const [fAction, setFAction] = useState("ALL");

  async function loadAudit() {
    setLoading(true);
    setMsg(null);

    let query = supabase
      .from("audit_log")
      .select(
        "id,created_at,action,entity_type,entity_id,code,warehouse,user_id,user_email,user_name,details_json"
      )
      .order("created_at", { ascending: false })
      .limit(500);

    if (fAction !== "ALL") {
      query = query.eq("action", fAction);
    }

    const { data, error } = await query;

    if (error) {
      console.error("loadAudit error:", error);
      setRows([]);
      setMsg("Errore caricamento audit log.");
      setLoading(false);
      return;
    }

    let list = (data ?? []) as AuditRow[];

    const text = q.trim().toLowerCase();
    if (text) {
      list = list.filter((r) => {
        const blob = [
          r.action,
          r.entity_type,
          r.entity_id,
          r.code,
          r.warehouse,
          r.user_email,
          r.user_name,
          JSON.stringify(r.details_json ?? {}),
        ]
          .join(" ")
          .toLowerCase();

        return blob.includes(text);
      });
    }

    setRows(list);
    setLoading(false);
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

      await loadAudit();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (isAdmin) {
      loadAudit();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, fAction]);

  if (isAdmin === null) {
    return (
      <main className="panel">
        <div className="pageBar">
          <div className="pageBarTitle">Audit Log</div>
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
          <div className="pageBarTitle">Audit Log</div>
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
        <div className="pageBarTitle">Audit Log</div>
      </div>

      <div className="card" style={{ padding: 12 }}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(240px,1fr) 220px auto",
            gap: 10,
            alignItems: "end",
          }}
        >
          <div>
            <label className="label" htmlFor="auditSearch">
              Cerca
            </label>
            <input
              id="auditSearch"
              className="input"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Codice, email, azione, dettagli..."
            />
          </div>

          <div>
            <label className="label" htmlFor="auditAction">
              Azione
            </label>
            <select
              id="auditAction"
              className="input"
              value={fAction}
              onChange={(e) => setFAction(e.target.value)}
            >
              <option value="ALL">Tutte</option>
              <option value="MOVEMENT_CREATED">MOVEMENT_CREATED</option>
              <option value="MOVEMENT_DELETED">MOVEMENT_DELETED</option>
              <option value="MOVEMENT_CLOSED">MOVEMENT_CLOSED</option>
              <option value="MATERIAL_CREATED">MATERIAL_CREATED</option>
              <option value="MATERIAL_UPDATED">MATERIAL_UPDATED</option>
              <option value="MATERIAL_DELETED">MATERIAL_DELETED</option>
            </select>
          </div>

          <div>
            <button className="btn" onClick={loadAudit}>
              Aggiorna
            </button>
          </div>
        </div>

        {msg && <div style={{ marginTop: 10, fontWeight: 800 }}>{msg}</div>}
      </div>

      <div className="card" style={{ padding: 12, marginTop: 12 }}>
        {loading ? (
          <div style={{ padding: 12 }}>Caricamento…</div>
        ) : rows.length === 0 ? (
          <div style={{ padding: 12 }}>Nessun record.</div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table className="table">
              <thead>
                <tr>
  <th>Data</th>
  <th>Azione</th>
  <th>Entità</th>
  <th>Codice</th>
  <th>Mag.</th>
  <th>Utente</th>
  <th style={{ minWidth: 320 }}>Dettaglio operazione</th>
</tr>
              </thead>

              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td>{fmtDateTime(r.created_at)}</td>
<td style={{ fontWeight: 900 }}>{r.action}</td>
<td>{r.entity_type}</td>
<td style={{ fontWeight: 900 }}>{r.code ?? "-"}</td>
<td>{r.warehouse ?? "-"}</td>
<td>{r.user_name ?? r.user_email ?? "-"}</td>
<td>{renderAuditDetails(r)}</td>
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