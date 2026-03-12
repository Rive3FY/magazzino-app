"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import JsBarcode from "jsbarcode";
import { createClient } from "../../_lib/supabase/client";
import { useIsAdmin } from "../../_lib/hooks/useIsAdmin";
import {
  EQUIPMENT_AREA_LABELS,
  EQUIPMENT_STATUS_LABELS,
  EQUIPMENT_STATUS_OPTIONS,
} from "../../_lib/equipment";
import type { EquipmentArea, EquipmentAssetRow, EquipmentStatus } from "../../_lib/types";

type Props = {
  area: EquipmentArea;
  basePath: string;
};

type LabelAsset = EquipmentAssetRow & {
  barcode_value: string;
};

const supabase = createClient();

function BarcodeSvg({ value }: { value: string }) {
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (!svgRef.current || !value) return;
    try {
      JsBarcode(svgRef.current, value, {
        format: "CODE128",
        width: 1.4,
        height: 18,
        displayValue: true,
        fontSize: 8,
        margin: 1,
      });
      svgRef.current.setAttribute("width", "100%");
      svgRef.current.removeAttribute("height");
    } catch {}
  }, [value]);

  return <svg ref={svgRef} style={{ width: "100%", height: "auto", display: "block" }} />;
}

function getBarcodeValue(row: EquipmentAssetRow) {
  return row.barcode || row.serial_number || row.asset_code;
}

export default function EquipmentLabelsClient({ area, basePath }: Props) {
  const access = useIsAdmin();
  const isAdmin = area === "LINEE" ? access.canManageEquipmentLinee : access.canManageEquipmentStazioni;
  const adminLoading = access.loading;

  const [rows, setRows] = useState<EquipmentAssetRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState<"ALL" | EquipmentStatus>("ALL");
  const [selected, setSelected] = useState<Set<string> | null>(new Set());
  const headerCheckRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setMsg(null);
    const { data, error } = await supabase.from("equipment_assets").select("*").eq("equipment_area", area).order("asset_code");
    if (error) {
      console.error(error);
      setRows([]);
      setMsg("Errore caricamento attrezzature.");
    } else {
      setRows((data ?? []) as EquipmentAssetRow[]);
    }
    setLoading(false);
  }, [area]);

  useEffect(() => {
    if (!isAdmin) return;
    const timer = window.setTimeout(() => {
      void load();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [isAdmin, load]);

  const filtered = useMemo(() => {
    const search = q.trim().toLowerCase();
    return rows.filter((row) => {
      if (statusFilter !== "ALL" && row.status !== statusFilter) return false;
      if (!search) return true;
      return [row.serial_number, row.name, row.barcode]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(search));
    });
  }, [q, rows, statusFilter]);

  const labels = useMemo<LabelAsset[]>(() => {
    return filtered
      .filter((row) => getBarcodeValue(row))
      .filter((row) => selected === null || selected.has(row.id))
      .map((row) => ({
        ...row,
        barcode_value: getBarcodeValue(row),
      }));
  }, [filtered, selected]);

  useEffect(() => {
    const el = headerCheckRef.current;
    if (!el) return;
    const selectableCount = filtered.filter((row) => getBarcodeValue(row)).length;
    const currentCount = selected === null ? selectableCount : selected.size;
    el.indeterminate = currentCount > 0 && currentCount < selectableCount;
  }, [filtered, selected]);

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const selectable = new Set(filtered.filter((row) => getBarcodeValue(row)).map((row) => row.id));
      const current = prev === null ? selectable : prev;
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next.size === 0 ? new Set() : next.size === selectable.size ? null : next;
    });
  }

  const selectAll = () => setSelected(null);
  const deselectAll = () => setSelected(new Set());

  async function persistMissingBarcodes(targetRows: LabelAsset[]) {
    const missing = targetRows.filter((row) => !row.barcode && getBarcodeValue(row));
    if (missing.length === 0) return;

    const updates = missing.map((row) =>
      supabase
        .from("equipment_assets")
        .update({ barcode: getBarcodeValue(row) })
        .eq("id", row.id)
        .eq("equipment_area", area)
    );

    const results = await Promise.all(updates);
    const failed = results.find((result) => result.error);
    if (failed?.error) {
      throw failed.error;
    }
  }

  function buildLabelsHtml(): string {
    const esc = (s: string) =>
      String(s)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");

    const tmp = document.createElement("div");
    tmp.style.cssText = "position:absolute;left:-9999px;top:0;visibility:hidden";
    document.body.appendChild(tmp);

    const labelsHtml = labels
      .map((row) => {
        const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
        tmp.appendChild(svg);
        try {
          JsBarcode(svg, row.barcode_value, { format: "CODE128", width: 1.4, height: 18, displayValue: true, fontSize: 8, margin: 1 });
          svg.setAttribute("width", "100%");
          svg.removeAttribute("height");
        } catch {}
        const barcodeHtml = svg.outerHTML;
        tmp.removeChild(svg);
        return `<div class="etichetta-label"><div class="etichetta-content"><div class="etichetta-text"><div class="etichetta-code">${esc(row.serial_number || row.asset_code)}</div><div class="etichetta-name">${esc(row.name)}</div><div class="etichetta-shelf">${esc(EQUIPMENT_AREA_LABELS[row.equipment_area])}</div><div class="etichetta-shelf">${esc(EQUIPMENT_STATUS_LABELS[row.status])}</div></div><div class="etichetta-barcode">${barcodeHtml}</div></div></div>`;
      })
      .join("");

    tmp.remove();

    return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Etichette attrezzature</title>
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
</head><body><div class="etichette-print-grid">${labelsHtml}</div></body></html>`;
  }

  async function handleDownload() {
    if (labels.length === 0) return;
    try {
      await persistMissingBarcodes(labels);
      await load();
    } catch (error) {
      console.error(error);
      setMsg("Errore generazione barcode: " + (error instanceof Error ? error.message : "sconosciuto"));
      return;
    }
    const html = buildLabelsHtml();
    const blob = new Blob([html], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `etichette-attrezzature-${area.toLowerCase()}-${new Date().toISOString().slice(0, 10)}.html`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function handlePrint() {
    if (labels.length === 0) return;
    try {
      await persistMissingBarcodes(labels);
      await load();
    } catch (error) {
      console.error(error);
      setMsg("Errore generazione barcode: " + (error instanceof Error ? error.message : "sconosciuto"));
      return;
    }
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
  }

  const areaLabel = EQUIPMENT_AREA_LABELS[area];

  if (adminLoading) {
    return (
      <main className="panel">
        <div className="pageBar">
          <div className="pageBarTitle">Attrezzature {areaLabel} - Etichette</div>
        </div>
        <div className="card" style={{ padding: 12 }}>Caricamento...</div>
      </main>
    );
  }

  if (!isAdmin) {
    return (
      <main className="panel">
        <div className="pageBar">
          <div className="pageBarTitle">Attrezzature {areaLabel} - Etichette</div>
        </div>
        <div className="card" style={{ padding: 12 }}>Solo gli admin possono stampare etichette attrezzature.</div>
      </main>
    );
  }

  return (
    <main className="panel">
      <div className="pageBar">
        <div className="pageBarTitle">Attrezzature {areaLabel} - Etichette</div>
      </div>

      <div className="card" style={{ padding: 12 }}>
        <div style={{ display: "grid", gap: 12 }}>
          <div className="equipmentSectionHeader" style={{ marginBottom: 0 }}>
            <div>
              <div className="equipmentSectionTitle">Stampa etichette {areaLabel}</div>
              <div className="equipmentSectionHint">
                Filtra il registro, seleziona le attrezzature e genera le etichette barcode dell&apos;area.
              </div>
            </div>
            <div className="equipmentAreaPill">Area: {areaLabel}</div>
          </div>

          <div className="equipmentFilterGrid mobileGrid1">
            <div style={{ minWidth: 0 }}>
              <label className="label" htmlFor={`labels-search-${area}`}>Cerca</label>
              <input
                id={`labels-search-${area}`}
                className="input"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder={`Cerca in ${areaLabel.toLowerCase()} per seriale o nome`}
              />
            </div>
            <div style={{ minWidth: 0 }}>
              <label className="label" htmlFor={`labels-status-${area}`}>Stato</label>
              <select id={`labels-status-${area}`} className="input" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as "ALL" | EquipmentStatus)}>
                <option value="ALL">Tutti gli stati</option>
                {EQUIPMENT_STATUS_OPTIONS.map((status) => (
                  <option key={status} value={status}>{EQUIPMENT_STATUS_LABELS[status]}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="equipmentActionGroup">
            <button type="button" className="btn btnPrimary" onClick={selectAll}>Seleziona tutto</button>
            <button type="button" className="btn" onClick={deselectAll}>Deseleziona</button>
            <button type="button" className="btn btnPrimary" onClick={handleDownload} disabled={labels.length === 0}>Scarica HTML</button>
            <button type="button" className="btn" onClick={handlePrint} disabled={labels.length === 0}>Stampa</button>
          </div>

          {msg && <div className="equipmentInlineMessage">{msg}</div>}
        </div>
      </div>

      <div className="card" style={{ padding: 12, marginTop: 12 }}>
        <div className="equipmentSectionHeader">
          <div>
            <div className="equipmentSectionTitle">Selezione attrezzature</div>
            <div className="equipmentSectionHint">Scegli quali etichette includere nella stampa.</div>
          </div>
        </div>
        <div className="tableWrap">
          <table className="table">
            <thead>
              <tr>
                <th style={{ width: 42 }}>
                  <input
                    ref={headerCheckRef}
                    type="checkbox"
                    checked={selected === null && filtered.length > 0}
                    onChange={(e) => {
                      if (e.target.checked) selectAll();
                      else deselectAll();
                    }}
                  />
                </th>
                <th>Seriale</th>
                <th>Nome</th>
                <th>Area</th>
                <th>Stato</th>
                <th>Barcode</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan={6}>Caricamento attrezzature...</td>
                </tr>
              )}
              {!loading && filtered.length === 0 && (
                <tr>
                  <td colSpan={6}>Nessuna attrezzatura disponibile.</td>
                </tr>
              )}
              {filtered.map((row) => {
                const checked = selected === null || selected.has(row.id);
                return (
                  <tr key={row.id}>
                    <td>
                      <input type="checkbox" checked={checked} onChange={() => toggleSelect(row.id)} />
                    </td>
                    <td>{row.serial_number || "—"}</td>
                    <td>{row.name}</td>
                    <td>{EQUIPMENT_AREA_LABELS[row.equipment_area]}</td>
                    <td>{EQUIPMENT_STATUS_LABELS[row.status]}</td>
                    <td>{getBarcodeValue(row)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card" style={{ padding: 12, marginTop: 12 }}>
        <div className="equipmentSectionHeader">
          <div>
            <div className="equipmentSectionTitle">Anteprima etichette {areaLabel}</div>
            <div className="equipmentSectionHint">{labels.length} etichette selezionate</div>
          </div>
        </div>
        {labels.length === 0 ? (
          <div style={{ color: "var(--muted)" }}>Seleziona almeno un&apos;attrezzatura da stampare.</div>
        ) : (
          <div className="etichette-print-grid etichette-preview">
            {labels.map((row) => (
              <div key={row.id} className="etichetta-label">
                <div className="etichetta-content">
                  <div className="etichetta-text">
                    <div className="etichetta-code">{row.serial_number || row.asset_code}</div>
                    <div className="etichetta-name">{row.name}</div>
                    <div className="etichetta-shelf">{row.serial_number || "Nessun seriale"}</div>
                    <div className="etichetta-shelf">{areaLabel}</div>
                    <div className="etichetta-shelf">{EQUIPMENT_STATUS_LABELS[row.status]}</div>
                  </div>
                  <div className="etichetta-barcode">
                    <BarcodeSvg value={row.barcode_value} />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
