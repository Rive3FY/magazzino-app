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
          width: 1,
          height: 28,
          displayValue: true,
          fontSize: 8,
          margin: 1,
          ...options,
        });
      } catch {}
    }
  }, [value, options]);
  return <svg ref={svgRef} style={{ maxWidth: "100%", height: "auto" }} />;
}

export default function EtichettePage() {
  const supabase = createClient();
  const { isAdmin, loading: adminLoading } = useIsAdmin();

  const [items, setItems] = useState<ItemRow[]>([]);
  const [shelves, setShelves] = useState<Record<string, Record<string, { shelf: string; place: string; barcode: string }>>>({});
  const [loading, setLoading] = useState(true);
  const [warehouseFilter, setWarehouseFilter] = useState<"PRM" | "REALE" | "both">("both");
  const [onlyWithShelf, setOnlyWithShelf] = useState(true);
  const [labelType, setLabelType] = useState<"materiale" | "scaffale">("scaffale");
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState<Set<string> | null>(null);
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

      setItems(itemsData ?? []);
      setShelves(shelfMap);
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
      if (onlyWithShelf) {
        const hasPrm = prm && (prm.shelf || prm.place);
        const hasReale = reale && (reale.shelf || reale.place);
        return hasPrm || hasReale;
      }
      return true;
    }
    const entry = shelves[it.code]?.[warehouseFilter];
    if (onlyWithShelf && (!entry || (!entry.shelf && !entry.place))) return false;
    return true;
  });

  const whs: Array<"PRM" | "REALE"> = warehouseFilter === "both" ? ["PRM", "REALE"] : [warehouseFilter];
  const selectableCount = filtered.reduce((acc, it) => {
    let n = 0;
    for (const wh of whs) {
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

  const printAreaRef = useRef<HTMLDivElement>(null);

  const handlePrint = () => {
    const el = printAreaRef.current;
    if (!el || labels.length === 0) return;
    const printWin = window.open("", "_blank", "noopener,noreferrer");
    if (!printWin) {
      setMsg("Consenti i popup per stampare.");
      return;
    }
    printWin.document.write(`
<!DOCTYPE html><html><head><meta charset="utf-8"><title>Etichette</title>
<style>
@page{size:A4;margin:8mm}
*{box-sizing:border-box}
body{margin:0;padding:0;background:#fff}
.etichette-print-grid{display:grid;grid-template-columns:repeat(5,37mm);gap:1.5mm;padding:8mm;width:max-content}
.etichetta-label{width:37mm;min-height:25mm;border:1px dashed #999;padding:1.5mm;break-inside:avoid}
.etichetta-content{display:flex;flex-direction:column;align-items:flex-start;font-size:9px}
</style>
</head><body><div class="etichette-print-grid">${el.innerHTML}</div></body></html>`);
    printWin.document.close();
    printWin.focus();
    setTimeout(() => {
      printWin.print();
      printWin.close();
    }, 400);
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
          Genera etichette con barcode per materiali e scaffali. Stampa con Ctrl+P (o Cmd+P su Mac).
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

        {msg && <div style={{ marginBottom: 12, color: "#dc2626", fontWeight: 600 }}>{msg}</div>}

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
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((it) => {
                    const whs: Array<"PRM" | "REALE"> = warehouseFilter === "both" ? ["PRM", "REALE"] : [warehouseFilter];
                    return whs.map((wh) => {
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
                        </tr>
                      );
                    });
                  })}
                </tbody>
              </table>
            </div>

            <button type="button" className="btn btnPrimary no-print" onClick={handlePrint} disabled={labels.length === 0}>
              🖨️ Stampa {labels.length} etichette
            </button>

            {labels.length > 0 && (
              <details className="no-print" style={{ marginTop: 16 }}>
                <summary style={{ cursor: "pointer", fontWeight: 600, fontSize: 13 }}>Anteprima stampa (stesso layout della stampa)</summary>
                <div className="etichette-preview-wrap" style={{ marginTop: 8 }}>
                  <div className="etichette-print-grid etichette-preview">
                    {labels.map((l, i) => (
                      <div key={i} className="etichetta-label">
                        <div className="etichetta-content">
                          <div style={{ fontWeight: 800, fontSize: 11, marginBottom: 1 }}>{l.code}</div>
                          <div style={{ fontSize: 8, color: "#64748b", marginBottom: 2, maxHeight: 16, overflow: "hidden", textOverflow: "ellipsis" }}>{l.name}</div>
                          {labelType === "scaffale" && (
                            <div style={{ fontSize: 8, marginBottom: 2 }}>
                              <b>{l.warehouse}</b> · {l.shelf}{l.place ? ` · ${l.place}` : ""}
                            </div>
                          )}
                          <div style={{ width: "100%", maxWidth: 85 }}>
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

      {/* Area stampa: etichette in griglia per A4 */}
      <div ref={printAreaRef} className="print-area etichette-print-grid">
        {labels.map((l, i) => (
          <div key={i} className="etichetta-label">
            <div className="etichetta-content">
              <div style={{ fontWeight: 800, fontSize: 11, marginBottom: 1 }}>{l.code}</div>
              <div style={{ fontSize: 8, color: "#64748b", marginBottom: 2, maxHeight: 16, overflow: "hidden", textOverflow: "ellipsis" }}>{l.name}</div>
              {labelType === "scaffale" && (
                <div style={{ fontSize: 8, marginBottom: 2 }}>
                  <b>{l.warehouse}</b> · {l.shelf}{l.place ? ` · ${l.place}` : ""}
                </div>
              )}
              <div style={{ width: "100%", maxWidth: 85 }}>
                <BarcodeSvg value={l.barcodeValue} />
              </div>
            </div>
          </div>
        ))}
      </div>

    </main>
  );
}
