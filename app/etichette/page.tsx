"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { renderToStaticMarkup } from "react-dom/server";
import { createClient } from "../_lib/supabase/client";
import { useAuth } from "../_lib/hooks/useAuth";
import { useIsAdmin } from "../_lib/hooks/useIsAdmin";
import { matchesMaterialSearch } from "../_lib/materialSearch";
import {
  buildDefinitivaDefaults,
  buildDefinitivaLabelHtml,
  DEFINITIVA_FIELD_LABELS,
  definitivaPrintStyles,
  loadDefinitivaOverrides,
  mergeDefinitivaFields,
  saveDefinitivaOverrides,
  type DefinitivaFields,
} from "./_lib/definitivaLabel";

type ItemRow = { code: string; name: string; um: string | null };
type ShelfRow = { code: string; warehouse: "PRM" | "REALE"; shelf: string; place?: string | null; barcode?: string | null };
type LiveRow = { code: string; warehouse: "PRM" | "REALE"; qty_free: unknown; row_json?: Record<string, unknown> | null };

const supabase = createClient();

function n(value: unknown) {
  const num = Number(value ?? 0);
  return Number.isFinite(num) ? num : 0;
}

function getLiveQty(row: LiveRow) {
  if (row.qty_free !== null && row.qty_free !== undefined && row.qty_free !== "") {
    return n(row.qty_free);
  }
  return n(row.row_json?.["Qnt. a Mag. libero"] ?? 0);
}

function getLiveItemName(row: LiveRow) {
  return String(row.row_json?.["Descrizione Materiale"] ?? row.code).trim() || row.code;
}

function getLiveItemUm(row: LiveRow) {
  const um = String(row.row_json?.["Unità di Misura"] ?? "").trim();
  return um || null;
}

function escHtml(s: string) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function pickLiveRowJson(
  byWh: Record<string, Record<string, unknown> | null | undefined> | undefined
): Record<string, unknown> | null {
  if (!byWh) return null;
  return byWh.PRM ?? byWh.REALE ?? null;
}

export default function EtichettePage() {
  const { user } = useAuth();
  const { canManageMaterials: isAdmin, loading: adminLoading } = useIsAdmin();

  const [items, setItems] = useState<ItemRow[]>([]);
  const [shelves, setShelves] = useState<Record<string, Record<string, { shelf: string; place: string; barcode: string }>>>({});
  const [qtyByCodeWh, setQtyByCodeWh] = useState<Record<string, Record<string, number>>>({});
  const [liveJsonByCode, setLiveJsonByCode] = useState<Record<string, Record<string, Record<string, unknown> | null>>>({});
  const [loading, setLoading] = useState(true);
  const [onlyWithShelf, setOnlyWithShelf] = useState(false);
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [msg, setMsg] = useState<string | null>(null);
  const [overrides, setOverrides] = useState<Record<string, Partial<DefinitivaFields>>>({});
  const [editCode, setEditCode] = useState<string | null>(null);
  const [defaultResponsabile, setDefaultResponsabile] = useState("");
  const [ternaLogoSvg, setTernaLogoSvg] = useState<string>("");
  const headerCheckRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setMsg(null);
    try {
      const { data: itemsData, error: eItems } = await supabase.from("items").select("code,name,um").order("code");
      if (eItems) throw eItems;

      const { data: shelfData, error: eShelf } = await supabase.from("material_shelves").select("code,warehouse,shelf,place,barcode");
      if (eShelf) throw eShelf;

      const { data: liveData, error: eLive } = await supabase
        .from("excel_live")
        .select("code,warehouse,qty_free,row_json");

      if (eLive) throw eLive;

      const shelfMap: Record<string, Record<string, { shelf: string; place: string; barcode: string }>> = {};
      for (const s of shelfData ?? []) {
        const row = s as ShelfRow;
        if (!shelfMap[row.code]) shelfMap[row.code] = {};
        shelfMap[row.code][row.warehouse] = {
          shelf: (row.shelf ?? "").trim(),
          place: (row.place ?? "").trim(),
          barcode: (row.barcode ?? "").trim(),
        };
      }

      const qtyMap: Record<string, Record<string, number>> = {};
      const jsonMap: Record<string, Record<string, Record<string, unknown> | null>> = {};
      const itemMap = new Map((itemsData ?? []).map((item) => [item.code, item]));
      const liveItems = new Map<string, ItemRow>();
      for (const r of liveData ?? []) {
        const row = r as LiveRow;
        if (!row.code) continue;
        if (!liveItems.has(row.code)) {
          const item = itemMap.get(row.code);
          liveItems.set(row.code, {
            code: row.code,
            name: item?.name ?? getLiveItemName(row),
            um: item?.um ?? getLiveItemUm(row),
          });
        }
        if (!qtyMap[row.code]) qtyMap[row.code] = {};
        qtyMap[row.code][row.warehouse] = getLiveQty(row);
        if (!jsonMap[row.code]) jsonMap[row.code] = {};
        jsonMap[row.code][row.warehouse] = (row.row_json ?? null) as Record<string, unknown> | null;
      }

      setItems(Array.from(liveItems.values()).sort((a, b) => a.code.localeCompare(b.code)));
      setShelves(shelfMap);
      setQtyByCodeWh(qtyMap);
      setLiveJsonByCode(jsonMap);
    } catch (e: unknown) {
      setMsg("Errore caricamento: " + (e instanceof Error ? e.message : String(e)));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isAdmin) void load();
  }, [isAdmin, load]);

  useEffect(() => {
    setOverrides(loadDefinitivaOverrides());
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!user?.id) {
        setDefaultResponsabile("");
        return;
      }
      const { data } = await supabase
        .from("profiles")
        .select("first_name,last_name")
        .eq("id", user.id)
        .maybeSingle();
      if (cancelled) return;
      const first = String((data as { first_name?: string } | null)?.first_name ?? "").trim();
      const last = String((data as { last_name?: string } | null)?.last_name ?? "").trim();
      const full = [first, last].filter(Boolean).join(" ");
      setDefaultResponsabile(full || user.email || "");
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.id, user?.email]);

  useEffect(() => {
    let cancelled = false;
    fetch("/terna-logo.svg")
      .then((r) => r.text())
      .then((svg) => {
        if (!cancelled) setTernaLogoSvg(svg);
      })
      .catch(() => {
        if (!cancelled) setTernaLogoSvg("");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  function hasAssignedShelf(entry: { shelf: string; place: string; barcode: string } | undefined) {
    return !!entry && (!!entry.shelf || !!entry.place);
  }

  function canPrintWarehouseLabel(code: string, warehouse: "PRM" | "REALE") {
    const entry = shelves[code]?.[warehouse];
    const hasQty = (qtyByCodeWh[code]?.[warehouse] ?? 0) > 0;
    return hasQty || hasAssignedShelf(entry);
  }

  function canPrintMaterial(code: string) {
    return canPrintWarehouseLabel(code, "PRM") || canPrintWarehouseLabel(code, "REALE");
  }

  function qrValueForCode(code: string) {
    const prm = shelves[code]?.PRM;
    const reale = shelves[code]?.REALE;
    return prm?.barcode || reale?.barcode || code;
  }

  const filtered = items.filter((it) => {
    const match = matchesMaterialSearch(q, it.code, it.name);
    if (!match) return false;
    if (onlyWithShelf) {
      return hasAssignedShelf(shelves[it.code]?.PRM) || hasAssignedShelf(shelves[it.code]?.REALE);
    }
    return canPrintMaterial(it.code);
  });

  const selectableCount = filtered.length;
  const visibleSelectedCount = filtered.reduce((count, it) => count + (selected.has(it.code) ? 1 : 0), 0);
  const allVisibleSelected = selectableCount > 0 && visibleSelectedCount === selectableCount;

  const definitivaLabels = useMemo(() => {
    const out: Array<{ code: string; fields: DefinitivaFields; qrValue: string }> = [];
    for (const it of filtered) {
      if (!selected.has(it.code)) continue;
      const defaults = buildDefinitivaDefaults({
        code: it.code,
        name: it.name ?? it.code,
        rowJson: pickLiveRowJson(liveJsonByCode[it.code]),
        responsabile: defaultResponsabile,
      });
      out.push({
        code: it.code,
        fields: mergeDefinitivaFields(defaults, overrides[it.code]),
        qrValue: qrValueForCode(it.code),
      });
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtered, selected, liveJsonByCode, overrides, defaultResponsabile, shelves]);

  const printCount = definitivaLabels.length;

  const toggleSelect = (key: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  useEffect(() => {
    const el = headerCheckRef.current;
    if (!el) return;
    el.indeterminate = visibleSelectedCount > 0 && visibleSelectedCount < selectableCount;
  }, [visibleSelectedCount, selectableCount]);

  useEffect(() => {
    if (editCode && definitivaLabels.some((l) => l.code === editCode)) return;
    setEditCode(definitivaLabels[0]?.code ?? null);
  }, [definitivaLabels, editCode]);

  const selectAll = () => {
    setSelected((prev) => {
      const next = new Set(prev);
      for (const it of filtered) next.add(it.code);
      return next;
    });
  };
  const deselectAll = () => setSelected(new Set());

  function updateOverride(code: string, patch: Partial<DefinitivaFields>) {
    setOverrides((prev) => {
      const defaults = buildDefinitivaDefaults({
        code,
        name: items.find((i) => i.code === code)?.name ?? code,
        rowJson: pickLiveRowJson(liveJsonByCode[code]),
        responsabile: defaultResponsabile,
      });
      const merged = { ...(prev[code] ?? {}), ...patch };
      const cleaned: Partial<DefinitivaFields> = {};
      (Object.keys(merged) as Array<keyof DefinitivaFields>).forEach((key) => {
        const value = merged[key];
        if (value === undefined) return;
        if (value === defaults[key]) return;
        cleaned[key] = value;
      });
      const next = { ...prev };
      if (Object.keys(cleaned).length === 0) delete next[code];
      else next[code] = cleaned;
      saveDefinitivaOverrides(next);
      return next;
    });
  }

  function resetOverride(code: string) {
    setOverrides((prev) => {
      const next = { ...prev };
      delete next[code];
      saveDefinitivaOverrides(next);
      return next;
    });
  }

  function logoHtmlForPrint() {
    if (ternaLogoSvg) {
      return ternaLogoSvg
        .replace(/<svg\b/, '<svg class="definitiva-logo"')
        .replace(/\s(width|height)="[^"]*"/g, "");
    }
    return `<img class="definitiva-logo" src="${escHtml(`${window.location.origin}/terna-logo.svg`)}" alt="Terna" />`;
  }

  function buildLabelsHtml(): string {
    const logoHtml = logoHtmlForPrint();
    const stack = definitivaLabels
      .map((l) => {
        const qrHtml = renderToStaticMarkup(
          <QRCodeSVG value={l.qrValue || l.fields.codiceSap || l.code} size={120} level="M" marginSize={1} />
        );
        return buildDefinitivaLabelHtml(l.fields, { logoHtml, qrHtml, esc: escHtml });
      })
      .join("");
    return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Etichette definitive (${definitivaLabels.length})</title>
<style>${definitivaPrintStyles()}</style>
</head><body><div class="definitiva-print-stack">${stack}</div></body></html>`;
  }

  const handleDownload = () => {
    if (printCount === 0) return;
    const html = buildLabelsHtml();
    const blob = new Blob([html], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `etichette-definitive-${new Date().toISOString().slice(0, 10)}.html`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handlePrint = () => {
    if (printCount === 0) return;
    const html = buildLabelsHtml();
    const win = window.open("", "_blank");
    if (win) {
      win.document.open();
      win.document.write(html);
      win.document.close();
      let printed = false;
      const printWin = () => {
        if (printed) return;
        printed = true;
        win.focus();
        win.print();
      };
      win.onload = printWin;
      setTimeout(printWin, 400);
      return;
    }

    const iframe = document.createElement("iframe");
    iframe.setAttribute("title", "Stampa etichette");
    iframe.style.cssText = "position:fixed;left:0;top:0;width:210mm;height:297mm;border:0;opacity:0;pointer-events:none";
    document.body.appendChild(iframe);
    const doc = iframe.contentWindow?.document;
    if (!doc) {
      iframe.remove();
      return;
    }

    let printed = false;
    const cleanup = () => {
      setTimeout(() => iframe.remove(), 1000);
    };

    const printFrame = () => {
      if (printed) return;
      printed = true;
      iframe.contentWindow?.focus();
      iframe.contentWindow?.print();
    };

    iframe.onload = printFrame;
    iframe.contentWindow?.addEventListener("afterprint", cleanup, { once: true });
    doc.open();
    doc.write(html);
    doc.close();
    setTimeout(printFrame, 500);
    setTimeout(cleanup, 60000);
  };

  const editingFields = useMemo(() => {
    if (!editCode) return null;
    const it = items.find((i) => i.code === editCode);
    const defaults = buildDefinitivaDefaults({
      code: editCode,
      name: it?.name ?? editCode,
      rowJson: pickLiveRowJson(liveJsonByCode[editCode]),
      responsabile: defaultResponsabile,
    });
    return mergeDefinitivaFields(defaults, overrides[editCode]);
  }, [editCode, items, liveJsonByCode, overrides, defaultResponsabile]);

  if (adminLoading) return <div style={{ padding: 20 }}>Controllo permessi...</div>;
  if (!isAdmin) return <div style={{ padding: 20 }}>Accesso solo Admin</div>;

  return (
    <main className="panel">
      <div className="pageBar">
        <div className="pageBarTitle">Stampa etichette</div>
      </div>

      <div className="card" style={{ padding: 12, margin: 12 }}>
        <div style={{ fontSize: 13, color: "#64748b", marginBottom: 16 }}>
          Modulo definitivo a08IO035RE: una etichetta per materiale, campi auto-compilati e modificabili dall&apos;app, QR a destra.
        </div>

        <div style={{ display: "flex", flexWrap: "wrap", gap: 16, marginBottom: 16 }}>
          <div>
            <label className="label" style={{ fontSize: 12 }}>Cerca materiale</label>
            <input
              type="text"
              className="input"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Codice o descrizione..."
              style={{ width: 200 }}
            />
          </div>
          <div style={{ display: "flex", alignItems: "flex-end", gap: 8 }}>
            <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, cursor: "pointer" }}>
              <input type="checkbox" checked={onlyWithShelf} onChange={(e) => setOnlyWithShelf(e.target.checked)} />
              Solo con scaffale assegnato
            </label>
          </div>
        </div>

        {loading ? (
          <div style={{ padding: 24, textAlign: "center", color: "#64748b" }}>Caricamento...</div>
        ) : (
          <>
            {msg && <div className="equipmentInlineMessage" style={{ marginBottom: 10 }}>{msg}</div>}
            <div style={{ marginBottom: 8, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <button type="button" className="btn btnPrimary" onClick={selectAll}>
                Seleziona tutti ({selectableCount})
              </button>
              <button type="button" className="btn" onClick={deselectAll}>
                Deseleziona
              </button>
              <span style={{ fontSize: 13, color: "#64748b" }}>
                {printCount} etichette da stampare (1 per materiale)
              </span>
            </div>

            <div style={{ fontSize: 12, color: "#64748b", marginBottom: 6 }}>
              Clicca sulle righe per selezionare/deselezionare. Puoi anche modificare i campi compilati prima della stampa.
            </div>

            <div className="no-print" style={{ marginBottom: 20, overflow: "auto", border: "1px solid #e2e8f0", borderRadius: 8, maxHeight: 320 }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead>
                  <tr style={{ background: "#f1f5f9", borderBottom: "2px solid #e2e8f0" }}>
                    <th style={{ padding: "10px 12px", textAlign: "left", fontWeight: 600, width: 44 }}>
                      <input
                        ref={headerCheckRef}
                        type="checkbox"
                        checked={allVisibleSelected}
                        onChange={(e) => {
                          if (e.target.checked) selectAll();
                          else {
                            setSelected((prev) => {
                              const next = new Set(prev);
                              for (const it of filtered) next.delete(it.code);
                              return next;
                            });
                          }
                        }}
                      />
                    </th>
                    <th style={{ padding: "10px 12px", textAlign: "left", fontWeight: 600 }}>Codice</th>
                    <th style={{ padding: "10px 12px", textAlign: "left", fontWeight: 600 }}>Nome materiale</th>
                    <th style={{ padding: "10px 12px", textAlign: "left", fontWeight: 600 }}>Divisione SAP</th>
                    <th style={{ padding: "10px 12px", textAlign: "left", fontWeight: 600, width: 110 }}>Modifiche</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((it) => {
                    const key = it.code;
                    const sel = selected.has(key);
                    const defaults = buildDefinitivaDefaults({
                      code: it.code,
                      name: it.name ?? it.code,
                      rowJson: pickLiveRowJson(liveJsonByCode[it.code]),
                      responsabile: defaultResponsabile,
                    });
                    const fields = mergeDefinitivaFields(defaults, overrides[it.code]);
                    const hasCustom = !!overrides[it.code];
                    return (
                      <tr
                        key={key}
                        onClick={() => {
                          toggleSelect(key);
                          setEditCode(it.code);
                        }}
                        style={{
                          cursor: "pointer",
                          background: editCode === it.code ? "#dbeafe" : sel ? "#e0f2fe" : undefined,
                          borderBottom: "1px solid #e2e8f0",
                        }}
                      >
                        <td style={{ padding: "8px 12px" }} onClick={(e) => e.stopPropagation()}>
                          <input type="checkbox" checked={sel} onChange={() => toggleSelect(key)} />
                        </td>
                        <td style={{ padding: "8px 12px", fontWeight: 600 }}>{it.code}</td>
                        <td style={{ padding: "8px 12px", color: "#64748b", maxWidth: 240 }} title={it.name ?? ""}>
                          {(it.name ?? "").slice(0, 48)}{(it.name ?? "").length > 48 ? "…" : ""}
                        </td>
                        <td style={{ padding: "8px 12px", color: "#64748b" }}>{fields.divisione || "—"}</td>
                        <td style={{ padding: "8px 12px" }}>
                          {hasCustom ? (
                            <span style={{ fontSize: 11, fontWeight: 700, color: "#0369a1" }}>Personalizzata</span>
                          ) : (
                            <span style={{ fontSize: 11, color: "#94a3b8" }}>Auto</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {editingFields && editCode && (
              <div className="no-print" style={{ marginBottom: 20, border: "1px solid #bfdbfe", background: "#f8fbff", borderRadius: 8, padding: 12 }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", marginBottom: 10 }}>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 14 }}>Modifica etichetta definitiva</div>
                    <div style={{ fontSize: 12, color: "#64748b" }}>
                      Materiale <b>{editCode}</b> · i campi SAP si compilano da Excel; puoi correggere tutto prima della stampa. Le modifiche restano salvate su questo browser.
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <select
                      className="input"
                      value={editCode}
                      onChange={(e) => setEditCode(e.target.value)}
                      style={{ width: 180 }}
                    >
                      {definitivaLabels.map((l) => (
                        <option key={l.code} value={l.code}>{l.code}</option>
                      ))}
                    </select>
                    <button type="button" className="btn" onClick={() => resetOverride(editCode)} disabled={!overrides[editCode]}>
                      Ripristina auto
                    </button>
                  </div>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 10 }}>
                  {DEFINITIVA_FIELD_LABELS.map(({ key, label, editableHint }) => (
                    <div key={key}>
                      <label className="label" style={{ fontSize: 12 }}>
                        {label}
                        {editableHint ? <span style={{ color: "#0284c7", marginLeft: 6 }}>({editableHint})</span> : null}
                      </label>
                      {key === "descrizione" || key === "oggettoContabile" ? (
                        <textarea
                          className="input"
                          value={editingFields[key]}
                          onChange={(e) => updateOverride(editCode, { [key]: e.target.value })}
                          rows={2}
                          style={{ width: "100%", resize: "vertical" }}
                        />
                      ) : (
                        <input
                          className="input"
                          value={editingFields[key]}
                          onChange={(e) => updateOverride(editCode, { [key]: e.target.value })}
                          style={{ width: "100%" }}
                        />
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <button type="button" className="btn btnPrimary no-print" onClick={handleDownload} disabled={printCount === 0} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="7 10 12 15 17 10" />
                  <line x1="12" y1="15" x2="12" y2="3" />
                </svg>
                Scarica anteprima ({printCount} etichette)
              </button>
              <button type="button" className="btn no-print" onClick={handlePrint} disabled={printCount === 0} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <polyline points="6 9 6 2 18 2 18 9" />
                  <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
                </svg>
                Stampa
              </button>
            </div>

            {printCount > 0 && (
              <details className="no-print" style={{ marginTop: 16 }} open>
                <summary style={{ cursor: "pointer", fontWeight: 600, fontSize: 13 }}>Anteprima stampa (stesso layout della stampa)</summary>
                <div className="etichette-preview-wrap" style={{ marginTop: 8 }}>
                  <div className="definitiva-print-stack etichette-preview definitiva-preview">
                    {definitivaLabels.map((l) => (
                      <DefinitivaPreview key={l.code} fields={l.fields} logoSvg={ternaLogoSvg} qrValue={l.qrValue} />
                    ))}
                  </div>
                </div>
              </details>
            )}
          </>
        )}
      </div>

      <div className="print-area definitiva-print-stack">
        {definitivaLabels.map((l) => (
          <DefinitivaPreview key={l.code} fields={l.fields} logoSvg={ternaLogoSvg} qrValue={l.qrValue} />
        ))}
      </div>
    </main>
  );
}

function DefinitivaPreview({
  fields,
  logoSvg,
  qrValue,
}: {
  fields: DefinitivaFields;
  logoSvg: string;
  qrValue: string;
}) {
  const rowCount = DEFINITIVA_FIELD_LABELS.length;
  return (
    <div className="definitiva-label">
      <table className="definitiva-grid">
        <colgroup>
          <col style={{ width: "38%" }} />
          <col />
          <col className="definitiva-qr-col" />
        </colgroup>
        <tbody>
          <tr>
            <td className="definitiva-brand">
              <div className="definitiva-brand-inner">
                {logoSvg ? (
                  <span
                    className="definitiva-logo-wrap"
                    dangerouslySetInnerHTML={{ __html: logoSvg.replace(/<svg\b/, '<svg class="definitiva-logo"') }}
                  />
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img className="definitiva-logo" src="/terna-logo.svg" alt="Terna" />
                )}
                <div className="definitiva-doc">a08IO035RE Modulo per etichettatura materiale</div>
              </div>
            </td>
            <td className="definitiva-value-cell definitiva-brand-spacer" />
            <td className="definitiva-qr-cell" rowSpan={rowCount + 1}>
              <QRCodeSVG value={qrValue || fields.codiceSap} size={120} level="M" marginSize={1} />
            </td>
          </tr>
          {DEFINITIVA_FIELD_LABELS.map(({ key, label }) => (
            <tr key={key}>
              <th className="definitiva-label-cell">{label}</th>
              <td className="definitiva-value-cell">{fields[key] || ""}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
