"use client";

import React, { useEffect, useRef, useState } from "react";
import JsBarcode from "jsbarcode";
import { createClient } from "../_lib/supabase/client";
import { useIsAdmin } from "../_lib/hooks/useIsAdmin";

type ItemRow = { code: string; name: string; um: string | null };
type ShelfRow = { code: string; warehouse: "PRM" | "REALE"; shelf: string; place?: string | null; barcode?: string | null };

type LabelItem = {
  code: string;
  name: string;
  warehouse: "PRM" | "REALE";
  shelf: string;
  place: string;
  barcodeValue: string;
};

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
  const supabase = createClient();
  const { canManageMaterials: isAdmin, loading: adminLoading } = useIsAdmin();

  const [items, setItems] = useState<ItemRow[]>([]);
  const [shelves, setShelves] = useState<Record<string, Record<string, { shelf: string; place: string; barcode: string }>>>({});
  const [qtyByCodeWh, setQtyByCodeWh] = useState<Record<string, Record<string, number>>>({});
  const [loading, setLoading] = useState(true);
  const [warehouseFilter, setWarehouseFilter] = useState<"PRM" | "REALE" | "both">("both");
  const [onlyWithShelf, setOnlyWithShelf] = useState(false);
  const [labelType, setLabelType] = useState<"materiale" | "scaffale">("scaffale");
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState<Set<string> | null>(new Set());
  const [msg, setMsg] = useState<string | null>(null);
  const headerCheckRef = useRef<HTMLInputElement>(null);

  async function load() {
    setLoading(true);
    setMsg(null);
    try {
      const { data: itemsData, error: eItems } = await supabase.from("items").select("code,name,um").order("code");
      if (eItems) throw eItems;

      const { data: shelfData, error: eShelf } = await supabase.from("material_shelves").select("code,warehouse,shelf,place,barcode");
      if (eShelf) throw eShelf;

      const { data: liveData, error: eLive } = await supabase
        .from("excel_live")
        .select("code,warehouse,qty_free")
        .gt("qty_free", 0);

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
      for (const r of liveData ?? []) {
        const row = r as { code: string; warehouse: string; qty_free: number };
        if (!qtyMap[row.code]) qtyMap[row.code] = {};
        qtyMap[row.code][row.warehouse] = Number(row.qty_free ?? 0);
      }

      setItems(itemsData ?? []);
      setShelves(shelfMap);
      setQtyByCodeWh(qtyMap);
    } catch (e: any) {
      setMsg("Errore caricamento: " + (e?.message ?? String(e)));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (isAdmin) void load();
  }, [isAdmin]);

  const filtered = items.filter((it) => {
    const match = !q.trim() || it.code.toLowerCase().includes(q.toLowerCase()) || (it.name ?? "").toLowerCase().includes(q.toLowerCase());
    if (!match) return false;
    if (warehouseFilter === "both") {
      const prm = shelves[it.code]?.PRM;
      const reale = shelves[it.code]?.REALE;
      const prmQty = (qtyByCodeWh[it.code]?.PRM ?? 0) > 0;
      const realeQty = (qtyByCodeWh[it.code]?.REALE ?? 0) > 0;
      if (!prmQty && !realeQty) return false;
      if (onlyWithShelf) {
        const hasPrm = prm && (prm.shelf || prm.place) && prmQty;
        const hasReale = reale && (reale.shelf || reale.place) && realeQty;
        return hasPrm || hasReale;
      }
      return true;
    }
    const entry = shelves[it.code]?.[warehouseFilter];
    const hasQty = (qtyByCodeWh[it.code]?.[warehouseFilter] ?? 0) > 0;
    if (!hasQty) return false;
    if (onlyWithShelf && (!entry || (!entry.shelf && !entry.place))) return false;
    return true;
  });

  const whs: Array<"PRM" | "REALE"> = warehouseFilter === "both" ? ["PRM", "REALE"] : [warehouseFilter];
  const selectableCount = filtered.reduce((acc, it) => {
    let n = 0;
    for (const wh of whs) {
      if ((qtyByCodeWh[it.code]?.[wh] ?? 0) <= 0) continue;
      const entry = shelves[it.code]?.[wh] ?? { shelf: "", place: "", barcode: "" };
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
      if ((qtyByCodeWh[it.code]?.[wh] ?? 0) <= 0) continue;
      const entry = wh === "PRM" ? prm : reale;
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
          if ((qtyByCodeWh[it.code]?.[w] ?? 0) <= 0) continue;
          const entry = shelves[it.code]?.[w] ?? { shelf: "", place: "", barcode: "" };
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
      const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      tmp.appendChild(svg);
      try {
        JsBarcode(svg, l.barcodeValue, { format: "CODE128", width: 1.4, height: 18, displayValue: true, fontSize: 8, margin: 1 });
        svg.setAttribute("width", "100%");
        svg.removeAttribute("height");
      } catch {}
      const bcHtml = svg.outerHTML;
      tmp.removeChild(svg);
      const shelfLine = labelType === "scaffale" ? `<div class="etichetta-shelf"><b>${esc(l.warehouse)}</b> · ${esc(l.shelf)}${l.place ? ` · ${esc(l.place)}` : ""}</div>` : "";
      return `<div class="etichetta-label"><div class="etichetta-content"><div class="etichetta-text"><div class="etichetta-code">${esc(l.code)}</div><div class="etichetta-name">${esc(l.name)}</div>${shelfLine}</div><div class="etichetta-barcode">${bcHtml}</div></div></div>`;
    }).join("");
    tmp.remove();
    return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Etichette</title>
<style>
@page{size:A4;margin:8mm}
*{box-sizing:border-box}
body{margin:0;padding:0;background:#fff}
.etichette-print-grid{display:grid;grid-template-columns:repeat(3,70mm);gap:2mm;padding:8mm;width:max-content}
.etichetta-label{width:70mm;height:30mm;border:1px dashed #999;padding:2.5mm;break-inside:avoid;box-sizing:border-box}
.etichetta-content{display:flex;flex-direction:column;height:100%;gap:1.5mm}
.etichetta-text{display:flex;flex-direction:column;gap:0.5mm;flex-shrink:0;min-width:0;width:100%;align-self:stretch}
.etichetta-code{font-weight:800;font-size:10px;line-height:1.2;letter-spacing:-0.02em;word-break:break-all;flex-shrink:0}
.etichetta-name{font-size:9px;color:#555;line-height:1.25;word-wrap:break-word;overflow-wrap:break-word;word-break:break-word;max-height:10mm;overflow:hidden;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical}
.etichetta-shelf{font-size:9px;color:#444;line-height:1.2;flex-shrink:0}
.etichetta-barcode{width:100%;max-height:14mm;overflow:hidden;margin-top:auto;flex-shrink:1;min-height:0;display:flex;align-items:flex-end}
.etichetta-barcode svg{width:100%!important;height:auto!important;display:block;max-width:none}
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
    iframe.style.cssText = "position:absolute;width:0;height:0;border:0;visibility:hidden";
    document.body.appendChild(iframe);
    const doc = iframe.contentWindow?.document;
    if (!doc) {
      iframe.remove();
      return;
    }
    doc.open();
    doc.write(html);
    doc.close();
    iframe.contentWindow?.focus();
    setTimeout(() => {
      iframe.contentWindow?.print();
      setTimeout(() => iframe.remove(), 100);
    }, 300);
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
          Genera etichette con barcode per materiali e scaffali. Vengono mostrati solo i materiali con giacenza disponibile (qty &gt; 0). <b>Scarica anteprima</b> per salvare un file HTML da aprire e stampare (Ctrl+P).
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
            <select className="input" value={warehouseFilter} onChange={(e) => setWarehouseFilter(e.target.value as any)} style={{ width: 120 }}>
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
            <select className="input" value={labelType} onChange={(e) => setLabelType(e.target.value as any)} style={{ width: 140 }}>
              <option value="materiale">Materiale (codice + barcode)</option>
              <option value="scaffale">Scaffale (codice + scaffale + barcode)</option>
            </select>
          </div>
        </div>

        {loading ? (
          <div style={{ padding: 24, textAlign: "center", color: "#64748b" }}>Caricamento...</div>
        ) : (
          <>
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
                      if ((qtyByCodeWh[it.code]?.[wh] ?? 0) <= 0) return null;
                      const entry = shelves[it.code]?.[wh] ?? { shelf: "", place: "", barcode: "" };
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
                      <div key={i} className="etichetta-label">
                        <div className="etichetta-content">
                          <div className="etichetta-text">
                            <div className="etichetta-code">{l.code}</div>
                            <div className="etichetta-name">{l.name}</div>
                            {labelType === "scaffale" && (
                              <div className="etichetta-shelf">
                                <b>{l.warehouse}</b> · {l.shelf}{l.place ? ` · ${l.place}` : ""}
                              </div>
                            )}
                          </div>
                          <div className="etichetta-barcode">
                            <BarcodeSvg value={l.barcodeValue} />
                          </div>
                        </div>
                      </div>
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
          <div key={i} className="etichetta-label">
            <div className="etichetta-content">
              <div className="etichetta-text">
                <div className="etichetta-code">{l.code}</div>
                <div className="etichetta-name">{l.name}</div>
                {labelType === "scaffale" && (
                  <div className="etichetta-shelf">
                    <b>{l.warehouse}</b> · {l.shelf}{l.place ? ` · ${l.place}` : ""}
                  </div>
                )}
              </div>
              <div className="etichetta-barcode">
                <BarcodeSvg value={l.barcodeValue} />
              </div>
            </div>
          </div>
        ))}
      </div>

    </main>
  );
}
