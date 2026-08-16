"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import JsBarcode from "jsbarcode";
import { QRCodeSVG } from "qrcode.react";
import { renderToStaticMarkup } from "react-dom/server";
import { createClient } from "../../_lib/supabase/client";
import { useIsAdmin } from "../../_lib/hooks/useIsAdmin";
import { useToast } from "../../_lib/ToastContext";
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

type PrintMode = "complete" | "barcodeQr" | "qrDescription" | "barcodeDescription" | "qrOnly" | "barcodeOnly";

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

export default function EquipmentLabelsClient({ area }: Props) {
  const access = useIsAdmin();
  const toast = useToast();
  const isAdmin = area === "LINEE" ? access.canManageEquipmentLinee : access.canManageEquipmentStazioni;
  const adminLoading = access.loading;

  const [rows, setRows] = useState<EquipmentAssetRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState<"ALL" | EquipmentStatus>("ALL");
  const [printMode, setPrintMode] = useState<PrintMode>("qrDescription");
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
      return [row.serial_number, row.name, row.asset_code]
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
        const qrHtml = renderToStaticMarkup(
          <QRCodeSVG value={row.barcode_value} size={112} level="M" marginSize={2} />
        );
        if (printMode === "qrOnly") {
          return `<div class="etichetta-label etichetta-qr-only"><div class="etichetta-qr-only-inner">${qrHtml}</div></div>`;
        }

        const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
        tmp.appendChild(svg);
        try {
          JsBarcode(svg, row.barcode_value, { format: "CODE128", width: 1.4, height: 18, displayValue: true, fontSize: 8, margin: 1 });
          svg.setAttribute("width", "100%");
          svg.removeAttribute("height");
        } catch {}
        const barcodeHtml = svg.outerHTML;
        tmp.removeChild(svg);
        if (printMode === "barcodeOnly") {
          return `<div class="etichetta-label etichetta-barcode-only"><div class="etichetta-barcode-only-inner">${barcodeHtml}</div></div>`;
        }
        const shelfLine = [row.shelf, row.place].filter(Boolean).join(" · ");
        const descriptionHtml = `<div class="etichetta-text"><div class="etichetta-code">${esc(row.serial_number || row.asset_code)}</div><div class="etichetta-name">${esc(row.name)}</div><div class="etichetta-shelf">${esc(EQUIPMENT_AREA_LABELS[row.equipment_area])}</div>${shelfLine ? `<div class="etichetta-shelf">Scaffale: ${esc(shelfLine)}</div>` : ""}</div>`;
        if (printMode === "barcodeQr") {
          return `<div class="etichetta-label etichetta-code-pair"><div class="etichetta-code-pair-inner"><div class="etichetta-barcode-only-inner">${barcodeHtml}</div><div class="etichetta-qr-only-inner">${qrHtml}</div></div></div>`;
        }
        if (printMode === "qrDescription") {
          return `<div class="etichetta-label"><div class="etichetta-content etichetta-content-with-qr"><div class="etichetta-left">${descriptionHtml}</div><div class="etichetta-qr">${qrHtml}</div></div></div>`;
        }
        if (printMode === "barcodeDescription") {
          return `<div class="etichetta-label"><div class="etichetta-content">${descriptionHtml}<div class="etichetta-barcode">${barcodeHtml}</div></div></div>`;
        }
        return `<div class="etichetta-label"><div class="etichetta-content etichetta-content-with-qr"><div class="etichetta-left">${descriptionHtml}<div class="etichetta-barcode">${barcodeHtml}</div></div><div class="etichetta-qr">${qrHtml}</div></div></div>`;
      })
      .join("");

    tmp.remove();

    return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Etichette attrezzature</title>
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
.etichetta-code-pair{display:flex;align-items:center;justify-content:center;padding:2mm}
.etichetta-code-pair-inner{display:grid;grid-template-columns:1fr 20mm;gap:2mm;align-items:center;width:100%;height:100%}
.etichetta-code-pair .etichetta-barcode-only-inner svg{width:42mm!important;height:auto!important;display:block}
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
    toast.success("Download avviato");
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
        <div className="pageBarTitle">Stampa etichette</div>
      </div>

      <div className="card" style={{ padding: 12, margin: 12 }}>
        <div style={{ fontSize: 13, color: "#64748b", marginBottom: 16 }}>
          Etichette QR {areaLabel}: filtra, seleziona e stampa. Una etichetta per attrezzatura.
        </div>

        <div style={{ display: "flex", flexWrap: "wrap", gap: 16, marginBottom: 16 }}>
          <div>
            <label className="label" htmlFor={`labels-search-${area}`} style={{ fontSize: 12 }}>Cerca attrezzatura</label>
            <input
              id={`labels-search-${area}`}
              type="text"
              className="input"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Seriale o nome..."
              style={{ width: 200 }}
            />
          </div>
          <div>
            <label className="label" htmlFor={`labels-status-${area}`} style={{ fontSize: 12 }}>Stato</label>
            <select
              id={`labels-status-${area}`}
              className="input"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as "ALL" | EquipmentStatus)}
              style={{ width: 180 }}
            >
              <option value="ALL">Tutti gli stati</option>
              {EQUIPMENT_STATUS_OPTIONS.map((status) => (
                <option key={status} value={status}>{EQUIPMENT_STATUS_LABELS[status]}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label" htmlFor={`labels-print-mode-${area}`} style={{ fontSize: 12 }}>Formato stampa</label>
            <select
              id={`labels-print-mode-${area}`}
              className="input"
              value={printMode}
              onChange={(e) => setPrintMode(e.target.value as PrintMode)}
              style={{ width: 180 }}
            >
              <option value="qrDescription">QR + descrizione</option>
              <option value="qrOnly">Solo QR</option>
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
                Seleziona tutti ({filtered.length})
              </button>
              <button type="button" className="btn" onClick={deselectAll}>
                Deseleziona
              </button>
              <span style={{ fontSize: 13, color: "#64748b" }}>
                {labels.length} etichette da stampare (1 per attrezzatura)
              </span>
            </div>

            <div style={{ fontSize: 12, color: "#64748b", marginBottom: 6 }}>
              Clicca sulle righe per selezionare/deselezionare.
            </div>

            <div className="no-print" style={{ marginBottom: 20, overflow: "auto", border: "1px solid #e2e8f0", borderRadius: 8, maxHeight: 320 }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead>
                  <tr style={{ background: "#f1f5f9", borderBottom: "2px solid #e2e8f0" }}>
                    <th style={{ padding: "10px 12px", textAlign: "left", fontWeight: 600, width: 44 }}>
                      <input
                        ref={headerCheckRef}
                        type="checkbox"
                        checked={selected === null && filtered.length > 0}
                        onChange={(e) => (e.target.checked ? selectAll() : deselectAll())}
                      />
                    </th>
                    <th style={{ padding: "10px 12px", textAlign: "left", fontWeight: 600 }}>Seriale</th>
                    <th style={{ padding: "10px 12px", textAlign: "left", fontWeight: 600 }}>Nome attrezzatura</th>
                    <th style={{ padding: "10px 12px", textAlign: "left", fontWeight: 600 }}>Scaffale</th>
                    <th style={{ padding: "10px 12px", textAlign: "left", fontWeight: 600 }}>Stato</th>
                    <th style={{ padding: "10px 12px", textAlign: "left", fontWeight: 600 }}>Codice QR</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.length === 0 ? (
                    <tr>
                      <td colSpan={6} style={{ padding: "16px 12px", color: "#64748b" }}>Nessuna attrezzatura disponibile.</td>
                    </tr>
                  ) : (
                    filtered.map((row) => {
                      const checked = selected === null || selected.has(row.id);
                      return (
                        <tr
                          key={row.id}
                          onClick={() => toggleSelect(row.id)}
                          style={{
                            cursor: "pointer",
                            background: checked ? "#e0f2fe" : undefined,
                            borderBottom: "1px solid #e2e8f0",
                          }}
                        >
                          <td style={{ padding: "8px 12px" }} onClick={(e) => e.stopPropagation()}>
                            <input type="checkbox" checked={checked} onChange={() => toggleSelect(row.id)} />
                          </td>
                          <td style={{ padding: "8px 12px", fontWeight: 600 }}>{row.serial_number || "—"}</td>
                          <td style={{ padding: "8px 12px", color: "#64748b", maxWidth: 240 }} title={row.name}>
                            {row.name.slice(0, 48)}{row.name.length > 48 ? "…" : ""}
                          </td>
                          <td style={{ padding: "8px 12px", color: "#64748b" }}>{[row.shelf, row.place].filter(Boolean).join(" · ") || "—"}</td>
                          <td style={{ padding: "8px 12px", color: "#64748b" }}>{EQUIPMENT_STATUS_LABELS[row.status]}</td>
                          <td style={{ padding: "8px 12px", color: "#64748b" }} title={getBarcodeValue(row)}>{getBarcodeValue(row) || "Da generare"}</td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <button type="button" className="btn btnPrimary no-print" onClick={() => void handleDownload()} disabled={labels.length === 0} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="7 10 12 15 17 10" />
                  <line x1="12" y1="15" x2="12" y2="3" />
                </svg>
                Scarica anteprima ({labels.length} etichette)
              </button>
              <button type="button" className="btn no-print" onClick={() => void handlePrint()} disabled={labels.length === 0} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <polyline points="6 9 6 2 18 2 18 9" />
                  <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
                </svg>
                Stampa
              </button>
            </div>

            {labels.length > 0 && (
              <details className="no-print" style={{ marginTop: 16 }} open>
                <summary style={{ cursor: "pointer", fontWeight: 600, fontSize: 13 }}>Anteprima stampa (stesso layout della stampa)</summary>
                <div className="etichette-preview-wrap" style={{ marginTop: 8 }}>
                  <div className="etichette-print-grid etichette-preview">
                    {labels.map((row) => (
                      <EquipmentLabelPreview key={row.id} row={row} areaLabel={areaLabel} printMode={printMode} />
                    ))}
                  </div>
                </div>
              </details>
            )}
          </>
        )}
      </div>
    </main>
  );
}

function EquipmentLabelPreview({
  row,
  areaLabel,
  printMode,
}: {
  row: LabelAsset;
  areaLabel: string;
  printMode: PrintMode;
}) {
  if (printMode === "qrOnly") {
    return (
      <div className="etichetta-label etichetta-qr-only">
        <div className="etichetta-qr-only-inner">
          <QRCodeSVG value={row.barcode_value} size={112} level="M" marginSize={2} />
        </div>
      </div>
    );
  }

  if (printMode === "barcodeOnly") {
    return (
      <div className="etichetta-label etichetta-barcode-only">
        <div className="etichetta-barcode-only-inner">
          <BarcodeSvg value={row.barcode_value} />
        </div>
      </div>
    );
  }

  const shelfLine = [row.shelf, row.place].filter(Boolean).join(" · ");
  const description = (
    <div className="etichetta-text">
      <div className="etichetta-code">{row.serial_number || row.asset_code}</div>
      <div className="etichetta-name">{row.name}</div>
      <div className="etichetta-shelf">{areaLabel}</div>
      {shelfLine ? <div className="etichetta-shelf">Scaffale: {shelfLine}</div> : null}
    </div>
  );

  if (printMode === "barcodeQr") {
    return (
      <div className="etichetta-label etichetta-code-pair">
        <div className="etichetta-code-pair-inner">
          <div className="etichetta-barcode-only-inner">
            <BarcodeSvg value={row.barcode_value} />
          </div>
          <div className="etichetta-qr-only-inner">
            <QRCodeSVG value={row.barcode_value} size={88} level="M" marginSize={2} />
          </div>
        </div>
      </div>
    );
  }

  if (printMode === "qrDescription") {
    return (
      <div className="etichetta-label">
        <div className="etichetta-content etichetta-content-with-qr">
          <div className="etichetta-left">{description}</div>
          <div className="etichetta-qr">
            <QRCodeSVG value={row.barcode_value} size={88} level="M" marginSize={2} />
          </div>
        </div>
      </div>
    );
  }

  if (printMode === "barcodeDescription") {
    return (
      <div className="etichetta-label">
        <div className="etichetta-content">
          {description}
          <div className="etichetta-barcode">
            <BarcodeSvg value={row.barcode_value} />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="etichetta-label">
      <div className="etichetta-content etichetta-content-with-qr">
        <div className="etichetta-left">
          {description}
          <div className="etichetta-barcode">
            <BarcodeSvg value={row.barcode_value} />
          </div>
        </div>
        <div className="etichetta-qr">
          <QRCodeSVG value={row.barcode_value} size={88} level="M" marginSize={2} />
        </div>
      </div>
    </div>
  );
}
