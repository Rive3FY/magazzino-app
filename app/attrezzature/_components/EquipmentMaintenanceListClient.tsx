"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { createClient } from "../../_lib/supabase/client";
import { markMaintenanceNotificationsCleared } from "../../_lib/equipmentMaintenanceAck";
import {
  EQUIPMENT_AREA_LABELS,
  EQUIPMENT_RESOLUTION_LABELS,
  EQUIPMENT_STATUS_LABELS,
} from "../../_lib/equipment";
import { applyEquipmentMaintenanceReintegration } from "../../_lib/equipmentMaintenanceReintegration";
import { useAuth } from "../../_lib/hooks/useAuth";
import { useIsAdmin } from "../../_lib/hooks/useIsAdmin";
import { useToast } from "../../_lib/ToastContext";
import { fmtDateTime } from "../../_lib/utils";
import type { EquipmentArea, EquipmentAssetRow, EquipmentMovementRow } from "../../_lib/types";

type Props = {
  area: EquipmentArea;
  basePath: string;
};

const supabase = createClient();

function reintegrationFromDetails(details: unknown): { at: string | null; by: string | null } {
  const d = details as Record<string, unknown> | null | undefined;
  if (!d || typeof d !== "object") return { at: null, by: null };
  const at = typeof d.maintenance_reintegrated_at === "string" ? d.maintenance_reintegrated_at : null;
  const name = typeof d.maintenance_reintegrated_by_name === "string" ? d.maintenance_reintegrated_by_name.trim() : "";
  const email = typeof d.maintenance_reintegrated_by_email === "string" ? d.maintenance_reintegrated_by_email.trim() : "";
  const by = name || email || null;
  return { at, by };
}

function normStatus(s: string | null | undefined) {
  return String(s ?? "").trim().toUpperCase();
}

function assetResolved(asset: EquipmentAssetRow | undefined) {
  if (!asset) return false;
  const st = normStatus(asset.status);
  return st === "AVAILABLE" || st === "DISMISSED";
}

function DetailRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "minmax(140px, 38%) 1fr", gap: "8px 14px", alignItems: "start", padding: "8px 0", borderBottom: "1px solid rgba(15,23,42,0.08)" }}>
      <div style={{ fontWeight: 800, color: "#475569", fontSize: 13 }}>{label}</div>
      <div style={{ fontSize: 14, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{value ?? "—"}</div>
    </div>
  );
}

type DetailModalProps = {
  mov: EquipmentMovementRow;
  asset: EquipmentAssetRow | undefined;
  area: EquipmentArea;
  userId: string | null;
  userEmail: string | null;
  onClose: () => void;
  onAfterReintegrate: () => Promise<void>;
};

function MaintenanceDetailModal({ mov, asset, area, userId, userEmail, onClose, onAfterReintegrate }: DetailModalProps) {
  const toast = useToast();
  const [closedByLabel, setClosedByLabel] = useState<string | null>(null);
  const [loadingClosedBy, setLoadingClosedBy] = useState(false);
  const [openMovementMsg, setOpenMovementMsg] = useState<string | null>(null);
  const [reintBusy, setReintBusy] = useState(false);
  const [localErr, setLocalErr] = useState<string | null>(null);

  const code = asset?.asset_code ?? (mov.details_json as { asset_code?: string } | null)?.asset_code ?? "—";
  const name = asset?.name ?? (mov.details_json as { asset_name?: string } | null)?.asset_name ?? "—";
  const reint = reintegrationFromDetails(mov.details_json);
  const shelfLabel = [asset?.shelf, asset?.place].filter(Boolean).join(" · ") || "—";

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    const cid = mov.closed_by?.trim();
    if (!cid) {
      setClosedByLabel(null);
      setLoadingClosedBy(false);
      return;
    }
    let alive = true;
    setLoadingClosedBy(true);
    (async () => {
      const { data, error } = await supabase.from("profiles").select("first_name,last_name").eq("id", cid).maybeSingle();
      if (!alive) return;
      setLoadingClosedBy(false);
      if (error || !data) {
        setClosedByLabel(`Utente (ID) ${cid.slice(0, 8)}…`);
        return;
      }
      const fn = String((data as { first_name?: string | null }).first_name ?? "").trim();
      const ln = String((data as { last_name?: string | null }).last_name ?? "").trim();
      const full = `${fn} ${ln}`.trim();
      setClosedByLabel(full || `Utente (ID) ${cid.slice(0, 8)}…`);
    })();
    return () => {
      alive = false;
    };
  }, [mov.closed_by, mov.id]);

  useEffect(() => {
    let alive = true;
    (async () => {
      const { data, error } = await supabase
        .from("equipment_movements")
        .select("id")
        .eq("equipment_id", mov.equipment_id)
        .eq("equipment_area", area)
        .eq("status", "OPEN")
        .limit(1)
        .maybeSingle();
      if (!alive) return;
      if (error) {
        setOpenMovementMsg(null);
        return;
      }
      setOpenMovementMsg(data?.id ? "È presente un movimento di uscita ancora aperto: chiudilo prima di reintegrare l'attrezzatura." : null);
    })();
    return () => {
      alive = false;
    };
  }, [mov.equipment_id, area, mov.id]);

  const canReintegrate = !!asset && !assetResolved(asset) && !openMovementMsg;

  async function handleReintegrate() {
    if (!asset || !canReintegrate) return;
    setReintBusy(true);
    setLocalErr(null);
    try {
      await applyEquipmentMaintenanceReintegration(supabase, {
        equipmentId: asset.id,
        userId,
        userEmail,
        userDisplayName: null,
      });
      toast.success("Attrezzatura reintegrata (disponibile)");
      await onAfterReintegrate();
      onClose();
    } catch (e: unknown) {
      setLocalErr(e instanceof Error ? e.message : "Reintegro non riuscito.");
    } finally {
      setReintBusy(false);
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="maint-detail-title"
      onMouseDown={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(15,23,42,0.45)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 14,
        zIndex: 10060,
      }}
    >
      <div
        onMouseDown={(e) => e.stopPropagation()}
        style={{
          width: "min(720px, 100%)",
          maxHeight: "min(92vh, 900px)",
          overflow: "auto",
          background: "#fff",
          borderRadius: 16,
          border: "1px solid rgba(15,23,42,0.12)",
          boxShadow: "0 24px 60px rgba(0,0,0,0.25)",
          padding: 18,
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, marginBottom: 14 }}>
          <div>
            <div id="maint-detail-title" style={{ fontWeight: 900, fontSize: 18 }}>
              Dettaglio invio manutenzione · {code}
            </div>
            <div style={{ fontSize: 13, color: "#64748b", marginTop: 4 }}>{name}</div>
          </div>
          <button type="button" className="btn" onClick={onClose} aria-label="Chiudi">
            Chiudi
          </button>
        </div>

        <div style={{ fontWeight: 800, fontSize: 13, color: "#0f172a", marginBottom: 6 }}>Contesto uscita (dove / quando)</div>
        <DetailRow label="Data e ora uscita" value={mov.created_at ? fmtDateTime(mov.created_at) : "—"} />
        <DetailRow label="Destinazione d'uso" value={(mov.destination ?? "").trim() || "—"} />
        <DetailRow label="Piano intervento n." value={(mov.intervention_plan_number ?? "").trim() || "—"} />
        <DetailRow label="Magazzino (anagrafica)" value={asset?.warehouse ?? "—"} />
        <DetailRow label="Scaffale · posto" value={shelfLabel} />
        <DetailRow label="Nota uscita" value={(mov.note ?? "").trim() || "—"} />
        <DetailRow
          label="Operatore uscita"
          value={
            [mov.assigned_to_name, mov.assigned_to_badge ? `Badge ${mov.assigned_to_badge}` : null, mov.assigned_to_email].filter(Boolean).join(" · ") ||
            [mov.created_by_name, mov.created_by_email].filter(Boolean).join(" · ") ||
            "—"
          }
        />

        <div style={{ fontWeight: 800, fontSize: 13, color: "#0f172a", margin: "16px 0 6px" }}>Chiusura con invio manutenzione</div>
        <DetailRow label="Data e ora chiusura" value={mov.closed_at ? fmtDateTime(mov.closed_at) : "—"} />
        <DetailRow
          label="Esito"
          value={
            mov.resolution_type && mov.resolution_type in EQUIPMENT_RESOLUTION_LABELS
              ? EQUIPMENT_RESOLUTION_LABELS[mov.resolution_type]
              : "—"
          }
        />
        <DetailRow label="Nota di chiusura (problema / dichiarazione)" value={(mov.close_note ?? "").trim() || "—"} />
        <DetailRow
          label="Dichiarazione registrata da"
          value={loadingClosedBy ? "Caricamento…" : closedByLabel ?? "—"}
        />

        <div style={{ fontWeight: 800, fontSize: 13, color: "#0f172a", margin: "16px 0 6px" }}>Attrezzatura</div>
        <DetailRow label="Codice" value={code} />
        <DetailRow label="Nome" value={name} />
        <DetailRow label="Seriale / matricola" value={asset?.serial_number ?? "—"} />
        <DetailRow label="Categoria" value={asset?.category ?? "—"} />
        <DetailRow label="Marca / modello" value={[asset?.brand, asset?.model].filter(Boolean).join(" · ") || "—"} />
        <DetailRow
          label="Stato in anagrafica (ora)"
          value={asset ? EQUIPMENT_STATUS_LABELS[asset.status] : "—"}
        />

        <div style={{ fontWeight: 800, fontSize: 13, color: "#0f172a", margin: "16px 0 6px" }}>Reintegro</div>
        <DetailRow label="Reintegrata il" value={reint.at ? fmtDateTime(reint.at) : "—"} />
        <DetailRow label="Reintegrata da" value={reint.by ?? "—"} />

        <div style={{ fontSize: 12, color: "#64748b", marginTop: 10 }}>
          ID movimento: <span style={{ fontFamily: "monospace" }}>{mov.id}</span>
          {mov.movement_group_id ? (
            <>
              {" "}
              · Gruppo: <span style={{ fontFamily: "monospace" }}>{mov.movement_group_id}</span>
            </>
          ) : null}
        </div>

        {localErr && (
          <div style={{ marginTop: 12, padding: 10, borderRadius: 10, background: "rgba(239,68,68,0.12)", color: "#991b1b", fontWeight: 700 }}>
            {localErr}
          </div>
        )}
        {openMovementMsg && (
          <div style={{ marginTop: 12, padding: 10, borderRadius: 10, background: "rgba(245,158,11,0.15)", color: "#92400e", fontWeight: 700 }}>
            {openMovementMsg}
          </div>
        )}

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 18, justifyContent: "flex-end" }}>
          <button type="button" className="btn" onClick={onClose}>
            Chiudi
          </button>
          <button
            type="button"
            className="btn btnPrimary"
            disabled={!canReintegrate || reintBusy || !!openMovementMsg}
            onClick={() => void handleReintegrate()}
            title={!asset ? "Anagrafica non trovata" : assetResolved(asset) ? "Già disponibile o dismessa" : openMovementMsg ?? "Reintegra in magazzino"}
          >
            {reintBusy ? "Reintegro…" : "Reintegra (disponibile)"}
          </button>
        </div>
        {assetResolved(asset) ? (
          <div style={{ marginTop: 10, fontSize: 12, color: "#64748b" }}>
            L&apos;anagrafica è già Disponibile o Dismessa: il reintegro non è necessario.
          </div>
        ) : null}
      </div>
    </div>
  );
}

export default function EquipmentMaintenanceListClient({ area, basePath }: Props) {
  const { user, loading: authLoading, approved } = useAuth();
  const access = useIsAdmin();
  const adminLoading = access.loading;
  const isAreaAdmin = area === "LINEE" ? access.canManageEquipmentLinee : access.canManageEquipmentStazioni;

  const [rows, setRows] = useState<EquipmentMovementRow[]>([]);
  const [assetsById, setAssetsById] = useState<Map<string, EquipmentAssetRow>>(new Map());
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<string | null>(null);
  const [listMode, setListMode] = useState<"queue" | "all">("queue");
  const [detailMov, setDetailMov] = useState<EquipmentMovementRow | null>(null);

  const areaLabel = EQUIPMENT_AREA_LABELS[area];

  const load = useCallback(async () => {
    setLoading(true);
    setMsg(null);
    try {
      const { data: movements, error: movErr } = await supabase
        .from("equipment_movements")
        .select("*")
        .eq("equipment_area", area)
        .eq("resolution_type", "MAINTENANCE")
        .eq("status", "CLOSED")
        .not("closed_at", "is", null)
        .order("closed_at", { ascending: false })
        .limit(400);

      if (movErr) throw movErr;
      const list = (movements ?? []) as EquipmentMovementRow[];
      setRows(list);

      const ids = [...new Set(list.map((m) => m.equipment_id).filter(Boolean))];
      if (ids.length === 0) {
        setAssetsById(new Map());
      } else {
        const { data: assetRows, error: aErr } = await supabase.from("equipment_assets").select("*").in("id", ids);
        if (aErr) throw aErr;
        const map = new Map<string, EquipmentAssetRow>();
        for (const a of (assetRows ?? []) as EquipmentAssetRow[]) {
          map.set(a.id, a);
        }
        setAssetsById(map);
      }

      markMaintenanceNotificationsCleared(area);
    } catch (e: unknown) {
      const err = e as { message?: string };
      setMsg(err?.message ?? "Errore caricamento elenco.");
      setRows([]);
      setAssetsById(new Map());
    } finally {
      setLoading(false);
    }
  }, [area]);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      window.location.href = "/login";
      return;
    }
    if (!approved) {
      void supabase.auth.signOut();
      window.location.href = "/pending";
    }
  }, [user, approved, authLoading]);

  useEffect(() => {
    if (authLoading || adminLoading || !user || !approved) return;
    if (!isAreaAdmin) {
      setLoading(false);
      return;
    }
    void load();
  }, [authLoading, adminLoading, user, approved, isAreaAdmin, load]);

  function isRowResolved(asset: EquipmentAssetRow | undefined) {
    return assetResolved(asset);
  }

  const sortedRows = useMemo(() => {
    if (listMode === "all") return rows;
    return rows.filter((m) => !isRowResolved(assetsById.get(m.equipment_id)));
  }, [rows, listMode, assetsById]);

  const detailAsset = detailMov ? assetsById.get(detailMov.equipment_id) : undefined;

  if (authLoading || adminLoading) {
    return (
      <main className="panel">
        <div className="pageBar">
          <div className="pageBarTitle">Attrezzature {areaLabel} — Manutenzioni</div>
        </div>
        <div className="card" style={{ padding: 12 }}>Caricamento…</div>
      </main>
    );
  }

  if (!isAreaAdmin) {
    return (
      <main className="panel">
        <div className="pageBar">
          <div className="pageBarTitle">Attrezzature {areaLabel} — Manutenzioni</div>
        </div>
        <div className="card" style={{ padding: 16 }}>
          <div style={{ fontWeight: 800 }}>Accesso riservato agli amministratori di questa area.</div>
          <Link href={basePath} className="btn" style={{ marginTop: 12, display: "inline-block" }} prefetch={false}>
            Torna alla dashboard
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="panel" style={{ overflowX: "hidden" }}>
      <div className="pageBar">
        <div className="pageBarTitle">Attrezzature {areaLabel} — Invii in manutenzione</div>
      </div>

      {detailMov ? (
        <MaintenanceDetailModal
          mov={detailMov}
          asset={detailAsset}
          area={area}
          userId={user?.id ?? null}
          userEmail={user?.email ?? null}
          onClose={() => setDetailMov(null)}
          onAfterReintegrate={load}
        />
      ) : null}

      <div className="card" style={{ padding: 12 }}>
        <div className="equipmentSectionHeader" style={{ marginBottom: 12 }}>
          <div>
            <div className="equipmentSectionTitle">Elenco manutenzioni da movimento</div>
            <div className="equipmentSectionHint">
              <b>Tocca una riga</b> per aprire il dettaglio (piano intervento, destinazione, note, chi ha dichiarato l&apos;invio in
              manutenzione) e per <b>reintegrare</b> l&apos;attrezzatura se è ancora in coda. Dopo reintegro da qui o da Gestisci stato
              compaiono data e operatore in elenco.
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <button type="button" className="btn" onClick={() => void load()} disabled={loading}>
              {loading ? "Aggiornamento…" : "Aggiorna"}
            </button>
          </div>
        </div>

        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: 8,
            alignItems: "center",
            marginBottom: 12,
            padding: "10px 12px",
            background: "rgba(59,130,246,0.06)",
            borderRadius: 12,
            border: "1px solid rgba(59,130,246,0.2)",
          }}
        >
          <span style={{ fontWeight: 800, marginRight: 4 }}>Vista:</span>
          <button type="button" className={`btn ${listMode === "queue" ? "btnPrimary" : ""}`} onClick={() => setListMode("queue")}>
            In coda
          </button>
          <button type="button" className={`btn ${listMode === "all" ? "btnPrimary" : ""}`} onClick={() => setListMode("all")}>
            Storico completo
          </button>
          <span style={{ fontSize: 13, color: "#64748b", flex: "1 1 220px" }}>
            In coda: righe ancora da “chiudere” in anagrafica (non ancora Disponibile/Dismessa).
          </span>
        </div>

        {msg && <div style={{ marginBottom: 12, fontWeight: 700, color: "#b91c1c" }}>{msg}</div>}

        {loading ? (
          <div style={{ padding: 12 }}>Caricamento…</div>
        ) : sortedRows.length === 0 ? (
          <div style={{ padding: 12, color: "#64748b" }}>
            {listMode === "queue"
              ? "Nessuna attrezzatura in coda: tutte risultano Disponibili o Dismesse in anagrafica, oppure non ci sono invii in manutenzione."
              : "Nessun invio in manutenzione registrato."}
          </div>
        ) : (
          <div className="tableWrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Chiusura</th>
                  <th>Codice</th>
                  <th>Attrezzatura</th>
                  <th>Magazzino</th>
                  <th>Stato in anagrafica</th>
                  <th>Reintegrata il</th>
                  <th>Reintegrata da</th>
                  <th>Destinazione</th>
                  <th>Operatore uscita</th>
                  <th>Nota chiusura (manutenzione)</th>
                  <th>Nota uscita</th>
                </tr>
              </thead>
              <tbody>
                {sortedRows.map((m) => {
                  const asset = assetsById.get(m.equipment_id);
                  const code = asset?.asset_code ?? (m.details_json as { asset_code?: string } | null)?.asset_code ?? "—";
                  const name = asset?.name ?? (m.details_json as { asset_name?: string } | null)?.asset_name ?? "—";
                  const st = asset?.status;
                  const statusLabel = st ? EQUIPMENT_STATUS_LABELS[st] : "—";
                  const reint = reintegrationFromDetails(m.details_json);
                  return (
                    <tr
                      key={m.id}
                      onClick={() => setDetailMov(m)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          setDetailMov(m);
                        }
                      }}
                      tabIndex={0}
                      title="Apri dettaglio"
                      aria-label={`Dettaglio manutenzione ${code}`}
                      style={{ cursor: "pointer" }}
                      className="maintenanceRowClickable"
                    >
                      <td>{m.closed_at ? fmtDateTime(m.closed_at) : "—"}</td>
                      <td style={{ fontWeight: 800 }}>{code}</td>
                      <td>{name}</td>
                      <td>{asset?.warehouse ?? "—"}</td>
                      <td style={{ fontWeight: 700 }}>{statusLabel}</td>
                      <td>{reint.at ? fmtDateTime(reint.at) : "—"}</td>
                      <td>{reint.by ?? "—"}</td>
                      <td>{m.destination ?? "—"}</td>
                      <td>{m.assigned_to_name ?? m.created_by_name ?? m.created_by_email ?? "—"}</td>
                      <td style={{ maxWidth: 280, whiteSpace: "pre-wrap" }}>{(m.close_note ?? "").trim() || "—"}</td>
                      <td style={{ maxWidth: 220, whiteSpace: "pre-wrap", color: "#64748b" }}>
                        {(m.note ?? "").trim() || "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </main>
  );
}
