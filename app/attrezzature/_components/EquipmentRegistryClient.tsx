"use client";

import { BrowserMultiFormatReader } from "@zxing/browser";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "../../_lib/supabase/client";
import { useAuth } from "../../_lib/hooks/useAuth";
import { useIsAdmin } from "../../_lib/hooks/useIsAdmin";
import { fmtDateTime, toIsoEndOfDay, toIsoStartOfDay } from "../../_lib/utils";
import {
  EQUIPMENT_AREA_LABELS,
  EQUIPMENT_MOVEMENT_LABELS,
  EQUIPMENT_MOVEMENT_STATUS_LABELS,
  EQUIPMENT_RESOLUTION_LABELS,
  EQUIPMENT_STATUS_LABELS,
  EQUIPMENT_STATUS_OPTIONS,
  equipmentMovementPillStyle,
  equipmentStatusStyle,
} from "../../_lib/equipment";
import type { EquipmentArea, EquipmentAssetRow, EquipmentMovementRow, EquipmentStatus } from "../../_lib/types";

type Props = {
  area: EquipmentArea;
  basePath: string;
};

const supabase = createClient();

function BarcodeIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <rect x="2" y="6" width="2" height="12" />
      <rect x="6" y="6" width="1" height="12" />
      <rect x="9" y="6" width="2" height="12" />
      <rect x="13" y="6" width="1" height="12" />
      <rect x="16" y="6" width="2" height="12" />
      <rect x="20" y="6" width="2" height="12" />
    </svg>
  );
}

function NfcIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="5" y="2" width="14" height="20" rx="2" />
      <path d="M9 7h6" />
      <path d="M9 11h6" />
      <path d="M9 15h4" />
      <path d="M12 6v12" />
    </svg>
  );
}

export default function EquipmentRegistryClient({ area, basePath }: Props) {
  const { user, loading: authLoading, approved } = useAuth();
  const { loading: adminLoading } = useIsAdmin();

  const [rows, setRows] = useState<EquipmentAssetRow[]>([]);
  const [history, setHistory] = useState<EquipmentMovementRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [quickSearch, setQuickSearch] = useState("");
  const [quickSelectedId, setQuickSelectedId] = useState("");
  const [quickOpen, setQuickOpen] = useState(false);
  const [quickActiveIndex, setQuickActiveIndex] = useState(0);
  const [msg, setMsg] = useState<string | null>(null);
  const [historyFrom, setHistoryFrom] = useState("");
  const [historyTo, setHistoryTo] = useState("");
  const [cameraScanning, setCameraScanning] = useState(false);
  const [searchByNfcScanning, setSearchByNfcScanning] = useState(false);
  const [isNfcSupported, setIsNfcSupported] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const readerRef = useRef<BrowserMultiFormatReader | null>(null);
  const quickBoxRef = useRef<HTMLDivElement | null>(null);

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

  const loadAssets = useCallback(async () => {
    setLoading(true);
    setMsg(null);

    const [assetsRes, historyRes] = await Promise.all([
      supabase
        .from("equipment_assets")
        .select("*")
        .eq("equipment_area", area)
        .order("created_at", { ascending: false }),
      supabase
        .from("equipment_movements")
        .select("*")
        .eq("equipment_area", area)
        .order("created_at", { ascending: false })
        .limit(300),
    ]);

    if (assetsRes.error) {
      console.error(assetsRes.error);
      setRows([]);
      setMsg("Errore caricamento attrezzature.");
    } else {
      setRows((assetsRes.data ?? []) as EquipmentAssetRow[]);
    }

    if (historyRes.error) {
      console.error(historyRes.error);
      setHistory([]);
      setMsg((prev) => prev ?? "Errore caricamento storico movimenti.");
    } else {
      setHistory((historyRes.data ?? []) as EquipmentMovementRow[]);
    }

    setLoading(false);
  }, [area]);

  useEffect(() => {
    if (!user) return;
    const timer = window.setTimeout(() => {
      void loadAssets();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [user, loadAssets]);

  useEffect(() => {
    setIsNfcSupported(typeof NDEFReader !== "undefined");
    const ua = navigator.userAgent;
    setIsIOS(/iPad|iPhone|iPod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1));
  }, []);

  const stats = useMemo(() => {
    return EQUIPMENT_STATUS_OPTIONS.reduce<Record<EquipmentStatus, number>>(
      (acc, status) => {
        acc[status] = rows.filter((row) => row.status === status).length;
        return acc;
      },
      {
        AVAILABLE: 0,
        ASSIGNED: 0,
        MAINTENANCE: 0,
        DISMISSED: 0,
      }
    );
  }, [rows]);

  const quickMatches = useMemo(() => {
    const search = quickSearch.trim().toLowerCase();
    if (!search) return rows.slice(0, 12);
    return rows
      .filter((row) =>
        [
          row.serial_number,
          row.name,
          row.barcode,
          row.nfc_tag_id,
          row.assigned_to_name,
          row.assigned_to_badge,
        ]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(search))
      )
      .slice(0, 12);
  }, [quickSearch, rows]);

  const quickSelected = useMemo(() => {
    if (!quickSelectedId) return null;
    return rows.find((row) => row.id === quickSelectedId) ?? null;
  }, [quickSelectedId, rows]);

  const quickActive = useMemo(() => quickMatches[quickActiveIndex] ?? null, [quickMatches, quickActiveIndex]);
  const historyGroupCountMap = useMemo(() => {
    const counts = new Map<string, number>();
    for (const row of history) {
      if (!row.movement_group_id) continue;
      counts.set(row.movement_group_id, (counts.get(row.movement_group_id) ?? 0) + 1);
    }
    return counts;
  }, [history]);
  const displayHistory = useMemo(() => {
    const fromIso = toIsoStartOfDay(historyFrom);
    const toIso = toIsoEndOfDay(historyTo);
    const seen = new Set<string>();
    return history.filter((row) => {
      if (fromIso && row.created_at < fromIso) return false;
      if (toIso && row.created_at > toIso) return false;
      const gid = row.movement_group_id;
      if (gid) {
        if (seen.has(gid)) return false;
        seen.add(gid);
      }
      return true;
    });
  }, [history, historyFrom, historyTo]);

  function applyQuickResult(value: string, mode: "barcode" | "nfc") {
    const normalized = value.trim().toLowerCase();
    if (!normalized) return;
    setQuickSearch(value.trim());
    const matched = rows.find((row) => {
      if (mode === "barcode") {
        return [row.barcode, row.serial_number, row.asset_code]
          .filter(Boolean)
          .some((item) => String(item).trim().toLowerCase() === normalized);
      }
      return String(row.nfc_tag_id ?? "").trim().toLowerCase() === normalized;
    });
    setQuickSelectedId(matched?.id ?? "");
    setQuickOpen(false);
    if (!matched) {
      setMsg(mode === "barcode" ? "Nessuna attrezzatura trovata per questo barcode." : "Nessuna attrezzatura associata a questo tag NFC.");
    } else {
      setQuickSearch(`${matched.serial_number || matched.asset_code} - ${matched.name}`);
      setMsg(null);
    }
  }

  function pickQuickMatch(row: EquipmentAssetRow) {
    setQuickSelectedId(row.id);
    setQuickSearch(`${row.serial_number || row.asset_code} - ${row.name}`);
    setQuickOpen(false);
    setMsg(null);
  }

  function stopCameraScan() {
    try {
      (readerRef.current as { reset?: () => void } | null)?.reset?.();
    } catch {}
    try {
      const video = videoRef.current;
      const stream = video?.srcObject as MediaStream | null;
      if (stream) stream.getTracks().forEach((track) => track.stop());
      if (video) video.srcObject = null;
    } catch {}
    readerRef.current = null;
    setCameraScanning(false);
  }

  async function startCameraScanForQuickSearch() {
    setMsg(null);
    if (!navigator.mediaDevices?.getUserMedia) {
      setMsg("La fotocamera richiede HTTPS. Usa npm run dev:https e accedi da https://TUO_IP:3000");
      return;
    }

    stopCameraScan();
    setCameraScanning(true);
    await new Promise((resolve) => setTimeout(resolve, 100));

    let videoEl = videoRef.current;
    for (let i = 0; i < 30 && !videoEl; i++) {
      await new Promise((resolve) => setTimeout(resolve, 50));
      videoEl = videoRef.current;
    }

    if (!videoEl) {
      setCameraScanning(false);
      setMsg("Video non disponibile. Riprova.");
      return;
    }

    try {
      readerRef.current = new BrowserMultiFormatReader();
      const result = await readerRef.current.decodeOnceFromVideoDevice(undefined, videoEl);
      stopCameraScan();
      const text = String(result?.getText?.() ?? "").trim();
      if (text) applyQuickResult(text, "barcode");
    } catch (error) {
      stopCameraScan();
      setMsg("Errore camera: " + (error instanceof Error ? error.message : "sconosciuto"));
    }
  }

  async function searchByNfc() {
    if (!isNfcSupported) {
      setMsg(isIOS ? "NFC non disponibile su iPhone/iPad." : "NFC richiede Chrome su Android con HTTPS.");
      return;
    }
    setSearchByNfcScanning(true);
    setMsg(null);
    try {
      const ndef = new NDEFReader();
      await ndef.scan();
      const serialNumber = await new Promise<string>((resolve, reject) => {
        const handler = (event: NDEFReadingEvent) => {
          ndef.removeEventListener("reading", handler);
          resolve(event.serialNumber ?? "");
        };
        ndef.addEventListener("reading", handler);
        setTimeout(() => reject(new Error("Timeout: avvicina il telefono al tag entro 30 secondi")), 30000);
      });
      applyQuickResult(serialNumber, "nfc");
    } catch (error) {
      setMsg(error instanceof Error ? error.message : "Errore lettura NFC");
    } finally {
      setSearchByNfcScanning(false);
    }
  }

  useEffect(() => {
    setQuickActiveIndex(0);
  }, [quickSearch]);

  useEffect(() => {
    function onDocMouseDown(e: MouseEvent) {
      if (!quickBoxRef.current) return;
      if (!quickBoxRef.current.contains(e.target as Node)) setQuickOpen(false);
    }
    document.addEventListener("mousedown", onDocMouseDown);
    return () => document.removeEventListener("mousedown", onDocMouseDown);
  }, []);

  const areaLabel = EQUIPMENT_AREA_LABELS[area];

  if (authLoading || adminLoading) {
    return (
      <main className="panel">
        <div className="pageBar">
          <div className="pageBarTitle">Attrezzature {areaLabel}</div>
        </div>
        <div className="card" style={{ padding: 12 }}>Caricamento...</div>
      </main>
    );
  }

  return (
    <main className="panel" style={{ overflowX: "hidden" }}>
      <div className="pageBar">
        <div className="pageBarTitle">Attrezzature {areaLabel} - Dashboard</div>
      </div>

      <div className="card" style={{ padding: 12 }}>
        <div style={{ display: "grid", gap: 12 }}>
          <div className="equipmentSectionHeader" style={{ marginBottom: 0 }}>
            <div>
              <div className="equipmentSectionTitle">Panoramica {areaLabel}</div>
              <div className="equipmentSectionHint">
                Vista rapida del registro. Per inserimento, modifica e consultazione completa usa la pagina
                ` Tutte le attrezzature`.
              </div>
            </div>
            <div className="equipmentAreaPill">Area fissa: {areaLabel}</div>
          </div>

          <div className="equipmentStatsGrid">
            <div className="equipmentStatCard">
              <div className="equipmentStatLabel">Registrate</div>
              <div className="equipmentStatValue">{rows.length}</div>
            </div>
            {EQUIPMENT_STATUS_OPTIONS.map((status) => (
              <div key={status} className="equipmentStatCard">
                <div className="equipmentStatLabel">{EQUIPMENT_STATUS_LABELS[status]}</div>
                <div className="equipmentStatValue">{stats[status]}</div>
              </div>
            ))}
          </div>

          <div className="equipmentFilterGrid mobileGrid1">
            <div ref={quickBoxRef} style={{ minWidth: 0, position: "relative" }}>
              <label className="label" htmlFor={`equipment-quick-search-${area}`}>
                Controllo veloce
              </label>
              <input
                id={`equipment-quick-search-${area}`}
                className="input"
                value={quickSearch}
                onChange={(e) => {
                  setQuickSearch(e.target.value);
                  setQuickSelectedId("");
                  setQuickOpen(true);
                }}
                onFocus={() => setQuickOpen(true)}
                onKeyDown={(e) => {
                  if (!quickOpen) return;
                  if (e.key === "ArrowDown") {
                    e.preventDefault();
                    setQuickActiveIndex((i) => Math.min(i + 1, quickMatches.length - 1));
                  } else if (e.key === "ArrowUp") {
                    e.preventDefault();
                    setQuickActiveIndex((i) => Math.max(i - 1, 0));
                  } else if (e.key === "Enter") {
                    e.preventDefault();
                    if (quickActive) pickQuickMatch(quickActive);
                  } else if (e.key === "Escape") {
                    setQuickOpen(false);
                  }
                }}
                placeholder="Seriale, nome, barcode o NFC"
                style={{ width: "100%" }}
              />
              {quickOpen && quickSearch.trim() && (
                <div
                  style={{
                    position: "absolute",
                    left: 0,
                    right: 0,
                    top: "100%",
                    marginTop: 6,
                    background: "#fff",
                    border: "1px solid rgba(15,23,42,0.12)",
                    borderRadius: 12,
                    boxShadow: "0 16px 40px rgba(0,0,0,0.12)",
                    overflow: "hidden",
                    zIndex: 50,
                  }}
                >
                  {quickMatches.length === 0 ? (
                    <div style={{ padding: 12, color: "#0f172a" }}>Nessun risultato</div>
                  ) : (
                    quickMatches.map((row, idx) => (
                      <div
                        key={row.id}
                        onMouseEnter={() => setQuickActiveIndex(idx)}
                        onMouseDown={(ev) => {
                          ev.preventDefault();
                          pickQuickMatch(row);
                        }}
                        style={{
                          padding: "10px 12px",
                          cursor: "pointer",
                          background: idx === quickActiveIndex ? "#eef2ff" : "white",
                          borderTop: idx === 0 ? "none" : "1px solid #f1f5f9",
                        }}
                      >
                        <div style={{ fontWeight: 900, color: "#0f172a" }}>{row.serial_number || row.asset_code}</div>
                        <div style={{ fontSize: 12, color: "#334155" }}>{row.name}</div>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
            <div style={{ minWidth: 0, display: "flex", alignItems: "end", gap: 8, flexWrap: "wrap" }}>
              <button className="btn" onClick={startCameraScanForQuickSearch} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                <BarcodeIcon />
                Barcode
              </button>
              <button className="btn" onClick={searchByNfc} disabled={searchByNfcScanning} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                <NfcIcon />
                {searchByNfcScanning ? "NFC..." : "NFC"}
              </button>
            </div>
            <div style={{ minWidth: 0 }}>
              <label className="label" htmlFor={`equipment-quick-pick-${area}`}>
                Attrezzatura
              </label>
              <select
                id={`equipment-quick-pick-${area}`}
                className="input"
                value={quickSelectedId}
                onChange={(e) => setQuickSelectedId(e.target.value)}
              >
                <option value="">Seleziona risultato</option>
                {quickMatches.map((row) => (
                  <option key={row.id} value={row.id}>
                    {(row.serial_number || row.asset_code) + " - " + row.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {quickSelected && (
            <div className="equipmentInfoGrid">
              <div>
                <div className="equipmentInfoLabel">Seriale</div>
                <div className="equipmentInfoValue">{quickSelected.serial_number || quickSelected.asset_code}</div>
              </div>
              <div>
                <div className="equipmentInfoLabel">Nome</div>
                <div className="equipmentInfoValue">{quickSelected.name}</div>
              </div>
              <div>
                <div className="equipmentInfoLabel">Stato</div>
                <div style={{ marginTop: 4 }}>
                  <span style={equipmentStatusStyle(quickSelected.status)}>{EQUIPMENT_STATUS_LABELS[quickSelected.status]}</span>
                </div>
              </div>
              <div>
                <div className="equipmentInfoLabel">Assegnata a</div>
                <div className="equipmentInfoValue">
                  {[quickSelected.assigned_to_name, quickSelected.assigned_to_badge ? `Badge ${quickSelected.assigned_to_badge}` : null]
                    .filter(Boolean)
                    .join(" · ") || "—"}
                </div>
              </div>
              <div>
                <div className="equipmentInfoLabel">Ubicazione</div>
                <div className="equipmentInfoValue">
                  {[quickSelected.shelf, quickSelected.place].filter(Boolean).join(" · ") || "—"}
                </div>
              </div>
              <div>
                <div className="equipmentInfoLabel">Identificativi</div>
                <div className="equipmentInfoValue">
                  {[
                    quickSelected.barcode ? `Barcode ${quickSelected.barcode}` : null,
                    quickSelected.nfc_tag_id ? `NFC ${quickSelected.nfc_tag_id}` : null,
                  ].filter(Boolean).join(" · ") || "Nessun identificativo"}
                </div>
              </div>
            </div>
          )}

          <div style={{ display: cameraScanning ? "block" : "none" }}>
            <video
              ref={videoRef}
              style={{ width: "100%", borderRadius: 12, background: "black" }}
              muted
              playsInline
            />
            <div style={{ fontSize: 12, marginTop: 6, opacity: 0.9 }}>
              Inquadra il barcode dell&apos;attrezzatura con la fotocamera.
            </div>
          </div>

          {msg && <div className="equipmentInlineMessage">{msg}</div>}
        </div>
      </div>

      <div className="card" style={{ padding: 12, marginTop: 12 }}>
        <div className="equipmentSectionHeader">
          <div>
            <div className="equipmentSectionTitle">Storico movimenti</div>
            <div className="equipmentSectionHint">
              Elenco completo dei movimenti dell&apos;area. Le righe aperte restano evidenziate.
            </div>
          </div>
        </div>

        <div
          className="mobileGrid1"
          style={{
            display: "grid",
            gridTemplateColumns: "2fr 2fr auto",
            gap: 10,
            alignItems: "end",
            marginTop: 10,
          }}
        >
          <div>
            <label className="label" htmlFor={`equipment-history-from-${area}`}>
              Data da
            </label>
            <input
              id={`equipment-history-from-${area}`}
              className="input"
              type="date"
              value={historyFrom}
              onChange={(e) => setHistoryFrom(e.target.value)}
            />
          </div>

          <div>
            <label className="label" htmlFor={`equipment-history-to-${area}`}>
              Data a
            </label>
            <input
              id={`equipment-history-to-${area}`}
              className="input"
              type="date"
              value={historyTo}
              onChange={(e) => setHistoryTo(e.target.value)}
            />
          </div>

          <button
            className="btn"
            onClick={() => {
              setHistoryFrom("");
              setHistoryTo("");
            }}
            type="button"
          >
            Reset
          </button>
        </div>

        <div className="tableWrap" style={{ marginTop: 10 }}>
          <table className="table">
            <thead>
              <tr>
                <th>Data</th>
                <th>Stato</th>
                <th>Tipo</th>
                <th>Attrezzatura</th>
                <th>Esito finale</th>
                <th>Note uscita</th>
                <th>Note chiusura</th>
                <th>Inserito da</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={8}>Caricamento...</td>
                </tr>
              ) : displayHistory.length === 0 ? (
                <tr>
                  <td colSpan={8}>Nessun movimento disponibile.</td>
                </tr>
              ) : (
                displayHistory.map((row) => {
                  const asset = rows.find((item) => item.id === row.equipment_id);
                  const status = row.status ?? "OPEN";
                  const groupCount = row.movement_group_id ? (historyGroupCountMap.get(row.movement_group_id) ?? 1) : 1;
                  return (
                    <tr
                      key={row.id}
                      style={{
                        background: status === "OPEN" ? "rgba(148,163,184,0.18)" : "transparent",
                      }}
                    >
                      <td>{fmtDateTime(row.created_at)}</td>
                      <td>
                        <span
                          className={status === "OPEN" ? "openStripe" : ""}
                          style={
                            status === "OPEN"
                              ? (() => {
                                  const s = equipmentMovementPillStyle(status);
                                  const { background, ...rest } = s;
                                  return rest;
                                })()
                              : equipmentMovementPillStyle(status)
                          }
                        >
                          {EQUIPMENT_MOVEMENT_STATUS_LABELS[status]}
                        </span>
                      </td>
                      <td><span style={equipmentMovementPillStyle("OUT")}>{EQUIPMENT_MOVEMENT_LABELS.OUT}</span></td>
                      <td style={{ fontWeight: 900 }}>
                        {groupCount > 1
                          ? `Prelievo multiplo (${groupCount} attrezzature)`
                          : asset
                            ? `${asset.serial_number || asset.asset_code} - ${asset.name}`
                            : row.equipment_id}
                      </td>
                      <td>{row.resolution_type ? EQUIPMENT_RESOLUTION_LABELS[row.resolution_type] : "—"}</td>
                      <td>{row.note || "—"}</td>
                      <td>{row.close_note || "—"}</td>
                      <td>{row.created_by_name || row.created_by_email || "—"}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </main>
  );
}
