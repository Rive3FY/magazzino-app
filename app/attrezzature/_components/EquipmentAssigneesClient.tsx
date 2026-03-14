"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "../../_lib/supabase/client";
import { useAuth } from "../../_lib/hooks/useAuth";
import { fmtDateTime } from "../../_lib/utils";
import {
  EQUIPMENT_AREA_LABELS,
  EQUIPMENT_MOVEMENT_STATUS_LABELS,
  EQUIPMENT_RESOLUTION_LABELS,
  equipmentMovementPillStyle,
} from "../../_lib/equipment";
import type { EquipmentArea, EquipmentAssetRow, EquipmentMovementRow } from "../../_lib/types";

type Props = {
  area: EquipmentArea;
  basePath: string;
};

type AssigneeKey = string;

function assigneeKey(row: { assigned_to_name: string | null; assigned_to_email?: string | null; assigned_to_badge?: string | null }): AssigneeKey {
  const name = (row.assigned_to_name ?? "").trim();
  const email = (row.assigned_to_email ?? "").trim();
  const badge = (row.assigned_to_badge ?? "").trim();
  return `${name}|${email}|${badge}`;
}

function assigneeDisplay(row: { assigned_to_name: string | null; assigned_to_email?: string | null; assigned_to_badge?: string | null }): string {
  const name = (row.assigned_to_name ?? "").trim() || "—";
  const badge = (row.assigned_to_badge ?? "").trim();
  return badge ? `${name} · Badge ${badge}` : name;
}

const supabase = createClient();

export default function EquipmentAssigneesClient({ area, basePath }: Props) {
  const { user, loading: authLoading, approved } = useAuth();
  const [assets, setAssets] = useState<EquipmentAssetRow[]>([]);
  const [movements, setMovements] = useState<EquipmentMovementRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<string | null>(null);
  const [selectedKey, setSelectedKey] = useState<AssigneeKey | null>(null);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      window.location.href = "/login";
      return;
    }
    if (!approved) {
      supabase.auth.signOut();
      window.location.href = "/pending";
    }
  }, [user, approved, authLoading]);

  const loadData = useCallback(async () => {
    setLoading(true);
    setMsg(null);
    const [assetsRes, movementsRes] = await Promise.all([
      supabase
        .from("equipment_assets")
        .select("*")
        .eq("equipment_area", area)
        .order("assigned_to_name"),
      supabase
        .from("equipment_movements")
        .select("*")
        .eq("equipment_area", area)
        .order("created_at", { ascending: false })
        .limit(500),
    ]);
    if (assetsRes.error) {
      setMsg("Errore caricamento attrezzature.");
      setAssets([]);
    } else {
      setAssets((assetsRes.data ?? []) as EquipmentAssetRow[]);
    }
    if (movementsRes.error) {
      setMsg((m) => m ?? "Errore caricamento movimenti.");
      setMovements([]);
    } else {
      setMovements((movementsRes.data ?? []) as EquipmentMovementRow[]);
    }
    setLoading(false);
  }, [area]);

  useEffect(() => {
    if (!user) return;
    void loadData();
  }, [user, loadData]);

  const assigneesMap = useMemo(() => {
    const map = new Map<AssigneeKey, { display: string; assets: EquipmentAssetRow[] }>();
    for (const a of assets) {
      if (a.status !== "ASSIGNED" || !(a.assigned_to_name ?? "").trim()) continue;
      const key = assigneeKey(a);
      const display = assigneeDisplay(a);
      const existing = map.get(key);
      if (existing) {
        existing.assets.push(a);
      } else {
        map.set(key, { display, assets: [a] });
      }
    }
    return map;
  }, [assets]);

  const assigneesList = useMemo(() => Array.from(assigneesMap.entries()).sort((a, b) => a[1].display.localeCompare(b[1].display)), [assigneesMap]);

  const selected = selectedKey ? assigneesMap.get(selectedKey) : null;
  const selectedAssets = selected?.assets ?? [];
  const selectedOpenMovements = useMemo(() => {
    if (!selectedKey || !selected) return [];
    return movements.filter((m) => {
      if (m.status !== "OPEN") return false;
      return assigneeKey(m) === selectedKey;
    });
  }, [selectedKey, selected, movements]);
  const selectedHistory = useMemo(() => {
    if (!selectedKey || !selected) return [];
    return movements.filter((m) => {
      if (m.status !== "CLOSED") return false;
      return assigneeKey(m) === selectedKey;
    });
  }, [selectedKey, selected, movements]);

  const areaLabel = EQUIPMENT_AREA_LABELS[area];

  if (authLoading) {
    return (
      <main className="panel">
        <div className="pageBar">
          <div className="pageBarTitle">Assegnatari {areaLabel}</div>
        </div>
        <div className="card" style={{ padding: 12 }}>Caricamento...</div>
      </main>
    );
  }

  return (
    <main className="panel" style={{ overflowX: "hidden" }}>
      <div className="pageBar">
        <div className="pageBarTitle">Utenti con attrezzature assegnate · {areaLabel}</div>
      </div>

      <div className="card" style={{ padding: 12 }}>
        <div className="equipmentSectionHeader">
          <div>
            <div className="equipmentSectionTitle">Assegnatari</div>
            <div className="equipmentSectionHint">
              Clicca su un nome per vedere cosa ha in consegna, i movimenti aperti e lo storico.
            </div>
          </div>
        </div>

        {msg && <div className="equipmentInlineMessage">{msg}</div>}

        {loading ? (
          <div style={{ padding: 24, textAlign: "center" }}>Caricamento...</div>
        ) : (
          <div className="tableWrap" style={{ marginTop: 12 }}>
            <table className="table">
              <thead>
                <tr>
                  <th>Utente</th>
                  <th>Badge</th>
                  <th>Attrezzature in consegna</th>
                </tr>
              </thead>
              <tbody>
                {assigneesList.length === 0 ? (
                  <tr>
                    <td colSpan={3}>Nessun utente con attrezzature assegnate.</td>
                  </tr>
                ) : (
                  assigneesList.map(([key, { display, assets: list }]) => (
                    <tr
                      key={key}
                      onClick={() => setSelectedKey(key)}
                      style={{ cursor: "pointer" }}
                    >
                      <td>{list[0]?.assigned_to_name ?? "—"}</td>
                      <td>{list[0]?.assigned_to_badge ?? "—"}</td>
                      <td>{list.length}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {selectedKey && selected && (
        <div
          onMouseDown={(e) => e.target === e.currentTarget && setSelectedKey(null)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(15,23,42,0.35)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 14,
            zIndex: 10050,
          }}
        >
          <div
            onMouseDown={(e) => e.stopPropagation()}
            style={{
              width: "min(900px, 100%)",
              maxHeight: "90vh",
              overflow: "auto",
              background: "white",
              borderRadius: 14,
              border: "1px solid rgba(15,23,42,0.16)",
              boxShadow: "0 24px 60px rgba(0,0,0,0.35)",
              padding: 16,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
              <h2 style={{ margin: 0, fontSize: 18, fontWeight: 900 }}>{selected.display}</h2>
              <button type="button" className="btn" onClick={() => setSelectedKey(null)}>
                Chiudi
              </button>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
              <section>
                <h3 style={{ margin: "0 0 10px", fontSize: 14, fontWeight: 800, color: "#64748b" }}>
                  In consegna ({selectedAssets.length})
                </h3>
                {selectedAssets.length === 0 ? (
                  <p style={{ margin: 0, fontSize: 14, opacity: 0.8 }}>Nessuna attrezzatura in consegna.</p>
                ) : (
                  <div className="tableWrap">
                    <table className="table" style={{ fontSize: 13 }}>
                      <thead>
                        <tr>
                          <th>Seriale</th>
                          <th>Nome</th>
                          <th>Categoria</th>
                          <th>Azioni</th>
                        </tr>
                      </thead>
                      <tbody>
                        {selectedAssets.map((a) => (
                          <tr key={a.id}>
                            <td><strong>{a.serial_number || a.asset_code}</strong></td>
                            <td>{a.name}</td>
                            <td>{a.category || "—"}</td>
                            <td>
                              <Link href={`${basePath}/movimenti?asset=${a.id}`} className="btn" style={{ fontSize: 12, padding: "6px 10px" }}>
                                Movimenti
                              </Link>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>

              <section>
                <h3 style={{ margin: "0 0 10px", fontSize: 14, fontWeight: 800, color: "#64748b" }}>
                  Movimenti aperti ({selectedOpenMovements.length})
                </h3>
                {selectedOpenMovements.length === 0 ? (
                  <p style={{ margin: 0, fontSize: 14, opacity: 0.8 }}>Nessun movimento aperto.</p>
                ) : (
                  <div className="tableWrap">
                    <table className="table" style={{ fontSize: 13 }}>
                      <thead>
                        <tr>
                          <th>Data</th>
                          <th>Attrezzatura</th>
                          <th>Stato</th>
                          <th>Azioni</th>
                        </tr>
                      </thead>
                      <tbody>
                        {selectedOpenMovements.map((m) => {
                          const asset = assets.find((a) => a.id === m.equipment_id);
                          return (
                            <tr key={m.id}>
                              <td>{fmtDateTime(m.created_at)}</td>
                              <td>{asset ? (asset.serial_number || asset.asset_code) : m.equipment_id}</td>
                              <td><span style={equipmentMovementPillStyle(m.status)}>{EQUIPMENT_MOVEMENT_STATUS_LABELS[m.status ?? "OPEN"]}</span></td>
                              <td>
                                <Link href={`${basePath}/movimenti?asset=${m.equipment_id}`} className="btn" style={{ fontSize: 12, padding: "6px 10px" }}>
                                  Vai
                                </Link>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>

              <section>
                <h3 style={{ margin: "0 0 10px", fontSize: 14, fontWeight: 800, color: "#64748b" }}>
                  Storico movimenti ({selectedHistory.length})
                </h3>
                {selectedHistory.length === 0 ? (
                  <p style={{ margin: 0, fontSize: 14, opacity: 0.8 }}>Nessuno storico.</p>
                ) : (
                  <div className="tableWrap">
                    <table className="table" style={{ fontSize: 13 }}>
                      <thead>
                        <tr>
                          <th>Data</th>
                          <th>Attrezzatura</th>
                          <th>Esito</th>
                          <th>Chiusura</th>
                        </tr>
                      </thead>
                      <tbody>
                        {selectedHistory.slice(0, 50).map((m) => {
                          const asset = assets.find((a) => a.id === m.equipment_id) ?? selectedAssets.find((a) => a.id === m.equipment_id);
                          return (
                            <tr key={m.id}>
                              <td>{fmtDateTime(m.created_at)}</td>
                              <td>{asset ? (asset.serial_number || asset.asset_code) : m.equipment_id}</td>
                              <td>{m.resolution_type ? EQUIPMENT_RESOLUTION_LABELS[m.resolution_type] : "—"}</td>
                              <td>{m.closed_at ? fmtDateTime(m.closed_at) : "—"}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                    {selectedHistory.length > 50 && (
                      <p style={{ margin: "8px 0 0", fontSize: 12, opacity: 0.8 }}>Mostrati gli ultimi 50 di {selectedHistory.length}.</p>
                    )}
                  </div>
                )}
              </section>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
