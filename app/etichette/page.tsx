"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import JsBarcode from "jsbarcode";
import { QRCodeSVG } from "qrcode.react";
import { renderToStaticMarkup } from "react-dom/server";
import { createClient } from "../_lib/supabase/client";
import { useIsAdmin } from "../_lib/hooks/useIsAdmin";

type ItemRow = { code: string; name: string; um: string | null };
type ShelfRow = { code: string; warehouse: "PRM" | "REALE"; shelf: string; place?: string | null; barcode?: string | null };
type LiveRow = { code: string; warehouse: "PRM" | "REALE"; qty_free: unknown; row_json?: Record<string, unknown> | null };

type LabelItem = {
  code: string;
  name: string;
  warehouse: "PRM" | "REALE";
  shelf: string;
  place: string;
  barcodeValue: string;
};

type PrintMode = "complete" | "qrOnly" | "barcodeOnly";

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

function BarcodeSvg({ value, options }: { value: string; options?: Record<string, unknown> }) {
  const svgRef = useRef<SVGSVGElement>(null);
  useEffect(() => {
    if (svgRef.current && value) {
      try {
        JsBarcode(svgRef.current, value, {
          format: "CODE128",
          width: 1.4,
          height: 18,
          displayValue: true,
          fontSize: 8,
          margin: 1,
          ...options,
        });
        const svg = svgRef.current;
        svg.setAttribute("width", "100%");
        svg.removeAttribute("height");
      } catch {}
    }
  }, [value, options]);
  return <svg ref={svgRef} style={{ width: "100%", height: "auto", display: "block" }} />;
}

export default function EtichettePage() {
  const { canManageMaterials: isAdmin, loading: adminLoading } = useIsAdmin();

  const [items, setItems] = useState<ItemRow[]>([]);
  const [shelves, setShelves] = useState<Record<string, Record<string, { shelf: string; place: string; barcode: string }>>>({});
  const [qtyByCodeWh, setQtyByCodeWh] = useState<Record<string, Record<string, number>>>({});
  const [loading, setLoading] = useState(true);
  const [warehouseFilter, setWarehouseFilter] = useState<"PRM" | "REALE" | "both">("both");
  const [onlyWithShelf, setOnlyWithShelf] = useState(false);
  const [labelType, setLabelType] = useState<"materiale" | "scaffale">("scaffale");
  const [printMode, setPrintMode] = useState<PrintMode>("complete");
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState<Set<string> | null>(new Set());
  const [msg, setMsg] = useState<string | null>(null);
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
      }

      setItems(Array.from(liveItems.values()).sort((a, b) => a.code.localeCompare(b.code)));
      setShelves(shelfMap);
      setQtyByCodeWh(qtyMap);
    } catch (e: unknown) {
      setMsg("Errore caricamento: " + (e instanceof Error ? e.message : String(e)));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isAdmin) void load();
  }, [isAdmin, load]);

  function hasAssignedShelf(entry: { shelf: string; place: string; barcode: string } | undefined) {
    return !!entry && (!!entry.shelf || !!entry.place);
  }

  function canPrintWarehouseLabel(code: string, warehouse: "PRM" | "REALE") {
    const entry = shelves[code]?.[warehouse];
    const hasQty = (qtyByCodeWh[code]?.[warehouse] ?? 0) > 0;
    return hasQty || hasAssignedShelf(entry);
  }

  const filtered = items.filter((it) => {
    const match = !q.trim() || it.code.toLowerCase().includes(q.toLowerCase()) || (it.name ?? "").toLowerCase().includes(q.toLowerCase());
    if (!match) return false;
    if (warehouseFilter === "both") {
      const prm = shelves[it.code]?.PRM;
      const reale = shelves[it.code]?.REALE;
      if (onlyWithShelf) {
        return hasAssignedShelf(prm) || hasAssignedShelf(reale);
      }
      return canPrintWarehouseLabel(it.code, "PRM") || canPrintWarehouseLabel(it.code, "REALE");
    }
    const entry = shelves[it.code]?.[warehouseFilter];
    if (onlyWithShelf) return hasAssignedShelf(entry);
    return canPrintWarehouseLabel(it.code, warehouseFilter);
  });

  const whs: Array<"PRM" | "REALE"> = warehouseFilter === "both" ? ["PRM", "REALE"] : [warehouseFilter];
  const selectableCount = filtered.reduce((acc, it) => {
    let n = 0;
    for (const wh of whs) {
      const entry = shelves[it.code]?.[wh] ?? { shelf: "", place: "", barcode: "" };
      if (!canPrintWarehouseLabel(it.code, wh)) continue;
      if (onlyWithShelf && !entry.shelf && !entry.place) continue;
      n++;
    }
    return acc + n;
  }, 0);

  const labels: LabelItem[] = [];
  for (const it of filtered) {
    const prm = shelves[it.code]?.PRM ?? { shelf: "", place: "", barcode: "" };
    const reale = shelves[it.code]?.REALE ?? { shelf: "", place: "", barcode: "" };
    for (const wh of whs) {
      const entry = wh === "PRM" ? prm : reale;
      if (!canPrintWarehouseLabel(it.code, wh)) continue;
      if (onlyWithShelf && !entry.shelf && !entry.place) continue;
      if (selected !== null && !selected.has(`${it.code}:${wh}`)) continue;
      labels.push({
        code: it.code,
        name: it.name ?? it.code,
        warehouse: wh,
        shelf: entry.shelf || "—",
        place: entry.place || "",
        barcodeValue: entry.barcode || it.code,
      });
    }
  }

  const toggleSelect = (code: string, wh: "PRM" | "REALE") => {
    const key = `${code}:${wh}`;
    setSelected((prev) => {
      const allKeys = new Set<string>();
      for (const it of filtered) {
        for (const w of whs) {
          const entry = shelves[it.code]?.[w] ?? { shelf: "", place: "", barcode: "" };
          if (!canPrintWarehouseLabel(it.code, w)) continue;
          if (onlyWithShelf && !entry.shelf && !entry.place) continue;
          allKeys.add(`${it.code}:${w}`);
        }
      }
      const current = prev === null ? allKeys : prev;
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next.size === 0 ? new Set() : next.size === allKeys.size ? null : next;
    });
  };

  useEffect(() => {
    const el = headerCheckRef.current;
    if (!el) return;
    const selSize = selected === null ? selectableCount : selected.size;
    el.indeterminate = selSize > 0 && selSize < selectableCount;
  }, [selected, selectableCount]);

  const selectAll = () => setSelected(null);
  const deselectAll = () => setSelected(new Set());

  function buildLabelsHtml(): string {
    const esc = (s: string) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
    const tmp = document.createElement("div");
    tmp.style.cssText = "position:absolute;left:-9999px;top:0;visibility:hidden";
    document.body.appendChild(tmp);
    const labelHtml = labels.map((l) => {
      const qrHtml = renderToStaticMarkup(
        <QRCodeSVG value={l.barcodeValue} size={112} level="M" marginSize={2} />
      );
      if (printMode === "qrOnly") {
        return `<div class="etichetta-label etichetta-qr-only"><div class="etichetta-qr-only-inner">${qrHtml}</div></div>`;
      }

      const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      tmp.appendChild(svg);
      try {
        JsBarcode(svg, l.barcodeValue, { format: "CODE128", width: 1.4, height: 18, displayValue: true, fontSize: 8, margin: 1 });
        svg.setAttribute("width", "100%");
        svg.removeAttribute("height");
      } catch {}
      const bcHtml = svg.outerHTML;
      tmp.removeChild(svg);
      if (printMode === "barcodeOnly") {
        return `<div class="etichetta-label etichetta-barcode-only"><div class="etichetta-barcode-only-inner">${bcHtml}</div></div>`;
      }
      const shelfLine = labelType === "scaffale" ? `<div class="etichetta-shelf"><b>${esc(l.warehouse)}</b> · ${esc(l.shelf)}${l.place ? ` · ${esc(l.place)}` : ""}</div>` : "";
      return `<div class="etichetta-label"><div class="etichetta-content etichetta-content-with-qr"><div class="etichetta-left"><div class="etichetta-text"><div class="etichetta-code">${esc(l.code)}</div><div class="etichetta-name">${esc(l.name)}</div>${shelfLine}</div><div class="etichetta-barcode">${bcHtml}</div></div><div class="etichetta-qr">${qrHtml}</div></div></div>`;
    }).join("");
    tmp.remove();
    return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Etichette</title>
<style>
@page{size:A4;margin:8mm}
*{box-sizing:border-box}
body{margin:0;padding:0;background:#fff}
.etichette-print-grid{display:grid;grid-template-columns:repeat(2,70mm);gap:2mm;padding:0;width:max-content}
.etichetta-label{width:70mm;height:30mm;border:1px dashed #999;padding:2.5mm;break-inside:avoid;box-sizing:border-box}
.etichetta-content{display:flex;flex-direction:column;height:100%;gap:1.5mm}
.etichetta-content-with-qr{flex-direction:row;align-items:stretch;gap:2mm}
.etichetta-left{display:flex;flex-direction:column;gap:1mm;min-width:0;flex:1}
.etichetta-text{display:flex;flex-direction:column;gap:0.5mm;flex-shrink:0;min-width:0;width:100%;align-self:stretch}
.etichetta-code{font-weight:800;font-size:10px;line-height:1.2;letter-spacing:-0.02em;word-break:break-all;flex-shrink:0}
.etichetta-name{font-size:9px;color:#555;line-height:1.25;word-wrap:break-word;overflow-wrap:break-word;word-break:break-word;max-height:10mm;overflow:hidden;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical}
.etichetta-shelf{font-size:9px;color:#444;line-height:1.2;flex-shrink:0}
.etichetta-barcode{width:100%;max-height:11mm;overflow:hidden;margin-top:auto;flex-shrink:1;min-height:0;display:flex;align-items:flex-end}
.etichetta-barcode svg{width:100%!important;height:auto!important;display:block;max-width:none}
.etichetta-qr{width:20mm;min-width:20mm;display:flex;align-items:center;justify-content:center}
.etichetta-qr svg{width:20mm!important;height:20mm!important;display:block}
.etichetta-qr-only{display:flex;align-items:center;justify-content:center;padding:2mm}
.etichetta-qr-only-inner{display:flex;align-items:center;justify-content:center;width:100%;height:100%}
.etichetta-qr-only svg{width:26mm!important;height:26mm!important;display:block}
.etichetta-barcode-only{display:flex;align-items:center;justify-content:center;padding:3mm}
.etichetta-barcode-only-inner{display:flex;align-items:center;justify-content:center;width:100%;height:100%}
.etichetta-barcode-only svg{width:58mm!important;height:auto!important;display:block}
</style>
</head><body><div class="etichette-print-grid">${labelHtml}</div></body></html>`;
  }

  const handleDownload = () => {
    if (labels.length === 0) return;
    const html = buildLabelsHtml();
    const blob = new Blob([html], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `etichette-${new Date().toISOString().slice(0, 10)}.html`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handlePrint = () => {
    if (labels.length === 0) return;
    const html = buildLabelsHtml();
    const iframe = document.createElement("iframe");
    iframe.style.cssText = "position:fixed;right:0;bottom:0;width:1px;height:1px;border:0;opacity:0;pointer-events:none";
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

  if (adminLoading) return <div style={{ padding: 20 }}>Controllo permessi...</div>;
  if (!isAdmin) return <div style={{ padding: 20 }}>Accesso solo Admin</div>;

  return (
    <main className="panel">
      <div className="pageBar">
        <div className="pageBarTitle">Stampa etichette</div>
      </div>

      <div className="card" style={{ padding: 12, margin: 12 }}>
        <div style={{ fontSize: 13, color: "#64748b", marginBottom: 16 }}>
          Genera etichette con barcode e QR code per materiali e scaffali. Puoi anche stampare solo i QR senza descrizione.
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
          <div>
            <label className="label" style={{ fontSize: 12 }}>Magazzino</label>
            <select className="input" value={warehouseFilter} onChange={(e) => setWarehouseFilter(e.target.value as "PRM" | "REALE" | "both")} style={{ width: 120 }}>
              <option value="both">Entrambi</option>
              <option value="PRM">PRM</option>
              <option value="REALE">REALE</option>
            </select>
          </div>
          <div style={{ display: "flex", alignItems: "flex-end", gap: 8 }}>
            <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, cursor: "pointer" }}>
              <input type="checkbox" checked={onlyWithShelf} onChange={(e) => setOnlyWithShelf(e.target.checked)} />
              Solo con scaffale assegnato
            </label>
          </div>
          <div>
            <label className="label" style={{ fontSize: 12 }}>Tipo etichetta</label>
            <select className="input" value={labelType} onChange={(e) => setLabelType(e.target.value as "materiale" | "scaffale")} style={{ width: 140 }}>
              <option value="materiale">Materiale (codice + Barcode / QR)</option>
              <option value="scaffale">Scaffale (codice + scaffale + Barcode / QR)</option>
            </select>
          </div>
          <div>
            <label className="label" style={{ fontSize: 12 }}>Stampa</label>
            <select className="input" value={printMode} onChange={(e) => setPrintMode(e.target.value as PrintMode)} style={{ width: 150 }}>
              <option value="complete">Barcode + QR</option>
              <option value="qrOnly">Solo QR</option>
              <option value="barcodeOnly">Solo Barcode</option>
            </select>
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
                {labels.length} etichette da stampare
              </span>
            </div>

            <div style={{ fontSize: 12, color: "#64748b", marginBottom: 6 }}>Clicca sulle righe per selezionare/deselezionare. Se nessuna riga è selezionata, verranno stampate tutte.</div>

            <div className="no-print" style={{ marginBottom: 20, overflow: "auto", border: "1px solid #e2e8f0", borderRadius: 8, maxHeight: 320 }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead>
                  <tr style={{ background: "#f1f5f9", borderBottom: "2px solid #e2e8f0" }}>
                    <th style={{ padding: "10px 12px", textAlign: "left", fontWeight: 600, width: 44 }}>
                      <input
                        ref={headerCheckRef}
                        type="checkbox"
                        checked={selected === null}
                        onChange={(e) => (e.target.checked ? selectAll() : deselectAll())}
                      />
                    </th>
                    <th style={{ padding: "10px 12px", textAlign: "left", fontWeight: 600 }}>Codice</th>
                    <th style={{ padding: "10px 12px", textAlign: "left", fontWeight: 600 }}>Nome materiale</th>
                    <th style={{ padding: "10px 12px", textAlign: "left", fontWeight: 600, width: 80 }}>Magazzino</th>
                    <th style={{ padding: "10px 12px", textAlign: "left", fontWeight: 600, width: 80 }}>Scaffale</th>
                    <th style={{ padding: "10px 12px", textAlign: "left", fontWeight: 600 }}>Luogo</th>
                    <th style={{ padding: "10px 12px", textAlign: "right", fontWeight: 600, width: 70 }}>Giacenza</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((it) => {
                    const whsRow: Array<"PRM" | "REALE"> = warehouseFilter === "both" ? ["PRM", "REALE"] : [warehouseFilter];
                    return whsRow.map((wh) => {
                      const entry = shelves[it.code]?.[wh] ?? { shelf: "", place: "", barcode: "" };
                      if (!canPrintWarehouseLabel(it.code, wh)) return null;
                      if (onlyWithShelf && !entry.shelf && !entry.place) return null;
                      const key = `${it.code}:${wh}`;
                      const sel = selected === null || selected.has(key);
                      return (
                        <tr
                          key={key}
                          onClick={() => toggleSelect(it.code, wh)}
                          style={{
                            cursor: "pointer",
                            background: sel ? "#e0f2fe" : undefined,
                            borderBottom: "1px solid #e2e8f0",
                          }}
                        >
                          <td style={{ padding: "8px 12px" }} onClick={(e) => e.stopPropagation()}>
                            <input type="checkbox" checked={sel} onChange={() => toggleSelect(it.code, wh)} />
                          </td>
                          <td style={{ padding: "8px 12px", fontWeight: 600 }}>{it.code}</td>
                          <td style={{ padding: "8px 12px", color: "#64748b", maxWidth: 200 }} title={it.name ?? ""}>
                            {(it.name ?? "").slice(0, 40)}{(it.name ?? "").length > 40 ? "…" : ""}
                          </td>
                          <td style={{ padding: "8px 12px" }}>
                            <span style={{ padding: "2px 6px", borderRadius: 4, background: wh === "PRM" ? "#dbeafe" : "#dcfce7", fontSize: 11, fontWeight: 600 }}>
                              {wh}
                            </span>
                          </td>
                          <td style={{ padding: "8px 12px" }}>{entry.shelf || "—"}</td>
                          <td style={{ padding: "8px 12px", color: "#64748b" }}>{entry.place || "—"}</td>
                          <td style={{ padding: "8px 12px", textAlign: "right", fontWeight: 600 }}>{qtyByCodeWh[it.code]?.[wh] ?? 0}</td>
                        </tr>
                      );
                    });
                  })}
                </tbody>
              </table>
            </div>

            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <button type="button" className="btn btnPrimary no-print" onClick={handleDownload} disabled={labels.length === 0} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="7 10 12 15 17 10" />
                  <line x1="12" y1="15" x2="12" y2="3" />
                </svg>
                Scarica anteprima ({labels.length} etichette)
              </button>
              <button type="button" className="btn no-print" onClick={handlePrint} disabled={labels.length === 0} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <polyline points="6 9 6 2 18 2 18 9" />
                  <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
                </svg>
                Stampa
              </button>
            </div>

            {labels.length > 0 && (
              <details className="no-print" style={{ marginTop: 16 }}>
                <summary style={{ cursor: "pointer", fontWeight: 600, fontSize: 13 }}>Anteprima stampa (stesso layout della stampa)</summary>
                <div className="etichette-preview-wrap" style={{ marginTop: 8 }}>
                  <div className="etichette-print-grid etichette-preview">
                    {labels.map((l, i) => (
                      <LabelPreview key={i} label={l} labelType={labelType} printMode={printMode} />
                    ))}
                  </div>
                </div>
              </details>
            )}
          </>
        )}
      </div>

      {/* Area stampa: usata per anteprima; la stampa genera il contenuto al volo */}
      <div className="print-area etichette-print-grid">
        {labels.map((l, i) => (
          <LabelPreview key={i} label={l} labelType={labelType} printMode={printMode} />
        ))}
      </div>

    </main>
  );
}

function LabelPreview({
  label,
  labelType,
  printMode,
}: {
  label: LabelItem;
  labelType: "materiale" | "scaffale";
  printMode: PrintMode;
}) {
  if (printMode === "qrOnly") {
    return (
      <div className="etichetta-label etichetta-qr-only">
        <div className="etichetta-qr-only-inner">
          <QRCodeSVG value={label.barcodeValue} size={112} level="M" marginSize={2} />
        </div>
      </div>
    );
  }

  if (printMode === "barcodeOnly") {
    return (
      <div className="etichetta-label etichetta-barcode-only">
        <div className="etichetta-barcode-only-inner">
          <BarcodeSvg value={label.barcodeValue} />
        </div>
      </div>
    );
  }

  return (
    <div className="etichetta-label">
      <div className="etichetta-content etichetta-content-with-qr">
        <div className="etichetta-left">
          <div className="etichetta-text">
            <div className="etichetta-code">{label.code}</div>
            <div className="etichetta-name">{label.name}</div>
            {labelType === "scaffale" && (
              <div className="etichetta-shelf">
                <b>{label.warehouse}</b> · {label.shelf}{label.place ? ` · ${label.place}` : ""}
              </div>
            )}
          </div>
          <div className="etichetta-barcode">
            <BarcodeSvg value={label.barcodeValue} />
          </div>
        </div>
        <div className="etichetta-qr">
          <QRCodeSVG value={label.barcodeValue} size={88} level="M" marginSize={2} />
        </div>
      </div>
    </div>
  );
}
