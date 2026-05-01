"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import JsBarcode from "jsbarcode";
import { QRCodeSVG } from "qrcode.react";
import { renderToStaticMarkup } from "react-dom/server";
import { createClient } from "../../_lib/supabase/client";
import { useAuth } from "../../_lib/hooks/useAuth";
import { useIsAdmin } from "../../_lib/hooks/useIsAdmin";
import { useToast } from "../../_lib/ToastContext";
import {
  EQUIPMENT_AREA_LABELS,
  EQUIPMENT_STATUS_LABELS,
  EQUIPMENT_STATUS_OPTIONS,
} from "../../_lib/equipment";
import type { EquipmentArea, EquipmentAssetRow, EquipmentStatus } from "../../_lib/types";

type NfcReassignState = {
  row: EquipmentAssetRow;
  serialNumber: string;
  existingSerial: string;
  existingArea: EquipmentArea;
};

type Props = {
  area: EquipmentArea;
  basePath: string;
};

type LabelAsset = EquipmentAssetRow & {
  barcode_value: string;
};

type PrintMode = "complete" | "qrOnly" | "barcodeOnly";

const ROWS_PER_PAGE = 15;

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

function NfcIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="5" y="2" width="14" height="20" rx="2" />
      <path d="M9 7h6" />
      <path d="M9 11h6" />
      <path d="M9 15h4" />
      <path d="M12 6v12" />
    </svg>
  );
}

function SpinnerIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ animation: "spin 1s linear infinite", transformOrigin: "center" }}>
      <path d="M21 12a9 9 0 1 1-6.219-8.56" />
    </svg>
  );
}

export default function EquipmentLabelsClient({ area }: Props) {
  const { user } = useAuth();
  const access = useIsAdmin();
  const toast = useToast();
  const isAdmin = area === "LINEE" ? access.canManageEquipmentLinee : access.canManageEquipmentStazioni;
  const adminLoading = access.loading;

  const [rows, setRows] = useState<EquipmentAssetRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState<"ALL" | EquipmentStatus>("ALL");
  const [printMode, setPrintMode] = useState<PrintMode>("complete");
  const [page, setPage] = useState(1);
  const [pageInput, setPageInput] = useState("");
  const [selected, setSelected] = useState<Set<string> | null>(new Set());
  const [nfcAssociatingId, setNfcAssociatingId] = useState<string | null>(null);
  const [nfcTagReassign, setNfcTagReassign] = useState<NfcReassignState | null>(null);
  const [isNfcSupported, setIsNfcSupported] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
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

  useEffect(() => {
    setIsNfcSupported(typeof NDEFReader !== "undefined");
    const ua = navigator.userAgent;
    setIsIOS(/iPad|iPhone|iPod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1));
  }, []);

  async function writeAuditLog(action: string, entityId: string | null, details: Record<string, unknown>) {
    try {
      await supabase.from("audit_log").insert({
        action,
        entity_type: "equipment_asset",
        entity_id: entityId,
        code: details.asset_code ?? null,
        warehouse: area,
        user_id: user?.id ?? null,
        user_email: user?.email ?? null,
        user_name: null,
        details_json: details,
      });
    } catch (error) {
      console.error("equipment audit error:", error);
    }
  }

  async function saveNfcAssociation(row: EquipmentAssetRow, serialNumber: string) {
    await supabase.from("equipment_assets").update({ nfc_tag_id: null }).eq("nfc_tag_id", serialNumber);
    const { error } = await supabase
      .from("equipment_assets")
      .update({ nfc_tag_id: serialNumber })
      .eq("id", row.id)
      .eq("equipment_area", area);

    if (error) throw error;

    await writeAuditLog("EQUIPMENT_UPDATED", row.id, {
      asset_code: row.asset_code,
      serial_number: row.serial_number,
      equipment_area: row.equipment_area,
      nfc_tag_id: serialNumber,
      update_mode: "nfc_association",
    });
  }

  async function doAssociateNfc(row: EquipmentAssetRow, forceReassign = false, knownSerialNumber?: string) {
    if (!isNfcSupported) {
      setMsg(
        isIOS
          ? "NFC non disponibile su iPhone/iPad. Safari non supporta la scansione NFC."
          : "NFC richiede Chrome su Android con HTTPS. Da mobile via IP usa npm run dev:https, poi accedi da https://TUO_IP:3000"
      );
      return;
    }

    setNfcTagReassign(null);
    setNfcAssociatingId(row.id);
    setMsg("Avvicina il dispositivo al tag NFC...");

    try {
      const serialNumber = knownSerialNumber
        ? knownSerialNumber
        : await (async () => {
            const ndef = new NDEFReader();
            await ndef.scan();
            return await new Promise<string>((resolve, reject) => {
              const handler = (event: NDEFReadingEvent) => {
                ndef.removeEventListener("reading", handler);
                resolve(event.serialNumber ?? "");
              };
              ndef.addEventListener("reading", handler);
              setTimeout(() => reject(new Error("Timeout: avvicina il telefono al tag entro 30 secondi")), 30000);
            });
          })();

      if (!serialNumber || serialNumber === "unknown") {
        setMsg("Impossibile leggere l'ID del tag. Riprova.");
        return;
      }

      const { data: existing } = await supabase
        .from("equipment_assets")
        .select("id,serial_number,asset_code,equipment_area")
        .eq("nfc_tag_id", serialNumber)
        .maybeSingle();

      if (existing && existing.id !== row.id && !forceReassign) {
        setNfcTagReassign({
          row,
          serialNumber,
          existingSerial: existing.serial_number || existing.asset_code,
          existingArea: existing.equipment_area as EquipmentArea,
        });
        setMsg(null);
        return;
      }

      await saveNfcAssociation(row, serialNumber);
      toast.success("NFC associato");
      setMsg("NFC associato ✅");
      await load();
    } catch (error) {
      console.error(error);
      setMsg(error instanceof Error ? error.message : "Errore associazione NFC");
    } finally {
      setNfcAssociatingId(null);
    }
  }

  const filtered = useMemo(() => {
    const search = q.trim().toLowerCase();
    return rows.filter((row) => {
      if (statusFilter !== "ALL" && row.status !== statusFilter) return false;
      if (!search) return true;
      return [row.serial_number, row.name, row.barcode, row.nfc_tag_id]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(search));
    });
  }, [q, rows, statusFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / ROWS_PER_PAGE));
  const paginatedRows = useMemo(() => {
    const start = (page - 1) * ROWS_PER_PAGE;
    return filtered.slice(start, start + ROWS_PER_PAGE);
  }, [filtered, page]);

  function goToPage(p: number) {
    const target = Math.max(1, Math.min(totalPages, p));
    setPage(target);
    setPageInput("");
  }

  useEffect(() => {
    setPage(1);
    setPageInput("");
  }, [q, statusFilter, area]);

  useEffect(() => {
    setPage((current) => Math.min(current, totalPages));
  }, [totalPages]);

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
        return `<div class="etichetta-label"><div class="etichetta-content etichetta-content-with-qr"><div class="etichetta-left"><div class="etichetta-text"><div class="etichetta-code">${esc(row.serial_number || row.asset_code)}</div><div class="etichetta-name">${esc(row.name)}</div><div class="etichetta-shelf">${esc(EQUIPMENT_AREA_LABELS[row.equipment_area])}</div>${shelfLine ? `<div class="etichetta-shelf">Scaffale: ${esc(shelfLine)}</div>` : ""}</div><div class="etichetta-barcode">${barcodeHtml}</div></div><div class="etichetta-qr">${qrHtml}</div></div></div>`;
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
        <div className="pageBarTitle">Attrezzature {areaLabel} - Etichette</div>
      </div>

      <div className="card" style={{ padding: 12 }}>
        <div style={{ display: "grid", gap: 12 }}>
          <div className="equipmentSectionHeader" style={{ marginBottom: 0 }}>
            <div>
              <div className="equipmentSectionTitle">Etichette {areaLabel}</div>
              <div className="equipmentSectionHint">
                Barcode, NFC e stampa etichette. Filtra, seleziona, associa NFC e genera le etichette.
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
            <div style={{ minWidth: 0 }}>
              <label className="label" htmlFor={`labels-print-mode-${area}`}>Stampa</label>
              <select id={`labels-print-mode-${area}`} className="input" value={printMode} onChange={(e) => setPrintMode(e.target.value as PrintMode)}>
                <option value="complete">Barcode + QR</option>
                <option value="qrOnly">Solo QR</option>
                <option value="barcodeOnly">Solo Barcode</option>
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
            <div className="equipmentSectionTitle">Barcode e NFC</div>
            <div className="equipmentSectionHint">
              {filtered.length} risultati · Pagina {page} di {totalPages}. Scegli quali etichette stampare e associa i tag NFC.
            </div>
          </div>
          {totalPages > 1 && (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10, flexWrap: "wrap" }}>
              <button
                type="button"
                className="btn"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                ← Prec
              </button>
              <span style={{ fontSize: 13, fontWeight: 600 }}>Pagina {page} di {totalPages}</span>
              <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                <input
                  type="number"
                  min={1}
                  max={totalPages}
                  value={pageInput}
                  onChange={(e) => setPageInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && goToPage(parseInt(pageInput, 10) || 1)}
                  placeholder="n°"
                  className="input"
                  style={{ width: 52, padding: "6px 8px", fontSize: 13 }}
                />
                <button type="button" className="btn" onClick={() => goToPage(parseInt(pageInput, 10) || 1)}>
                  Vai
                </button>
              </div>
              <button
                type="button"
                className="btn"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              >
                Succ →
              </button>
            </div>
          )}
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
                <th>Scaffale</th>
                <th>Area</th>
                <th>Stato</th>
                <th>Barcode</th>
                <th>NFC</th>
                <th>Azioni</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan={9}>Caricamento attrezzature...</td>
                </tr>
              )}
              {!loading && filtered.length === 0 && (
                <tr>
                  <td colSpan={9}>Nessuna attrezzatura disponibile.</td>
                </tr>
              )}
              {paginatedRows.map((row) => {
                const checked = selected === null || selected.has(row.id);
                return (
                  <tr key={row.id}>
                    <td>
                      <input type="checkbox" checked={checked} onChange={() => toggleSelect(row.id)} />
                    </td>
                    <td>{row.serial_number || "—"}</td>
                    <td>{row.name}</td>
                    <td>{[row.shelf, row.place].filter(Boolean).join(" · ") || "—"}</td>
                    <td>{EQUIPMENT_AREA_LABELS[row.equipment_area]}</td>
                    <td>{EQUIPMENT_STATUS_LABELS[row.status]}</td>
                    <td title={getBarcodeValue(row)}>{getBarcodeValue(row) || "Da generare"}</td>
                    <td title={row.nfc_tag_id || "Non associato"}>{row.nfc_tag_id || "Non associato"}</td>
                    <td>
                      <button
                        type="button"
                        className="btn"
                        onClick={() => void doAssociateNfc(row)}
                        disabled={nfcAssociatingId === row.id}
                        style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
                      >
                        <NfcIcon />
                        {nfcAssociatingId === row.id ? "NFC..." : row.nfc_tag_id ? "Riassegna NFC" : "Associa NFC"}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {totalPages > 1 && (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10, flexWrap: "wrap", marginTop: 12 }}>
            <button
              type="button"
              className="btn"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              ← Prec
            </button>
            <span style={{ fontSize: 13, fontWeight: 600 }}>Pagina {page} di {totalPages}</span>
            <button
              type="button"
              className="btn"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            >
              Succ →
            </button>
          </div>
        )}
      </div>

      {!!nfcAssociatingId && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(15,23,42,0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 20,
            zIndex: 10050,
          }}
        >
          <div
            style={{
              background: "white",
              borderRadius: 14,
              padding: 24,
              maxWidth: 420,
              width: "100%",
              boxShadow: "0 24px 60px rgba(0,0,0,0.3)",
            }}
          >
            <div style={{ fontWeight: 900, fontSize: 16, marginBottom: 12 }}>Associazione NFC</div>
            <div style={{ padding: 24, background: "#0f172a", borderRadius: 12, marginBottom: 12, display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}>
              <SpinnerIcon />
              <div style={{ fontSize: 14, color: "#94a3b8" }}>Avvicina il telefono al tag NFC</div>
            </div>
            <button type="button" className="btn" onClick={() => setNfcAssociatingId(null)}>
              Fine
            </button>
          </div>
        </div>
      )}

      {nfcTagReassign && (
        <div className="card" style={{ padding: 12, marginTop: 12, borderColor: "rgba(245,158,11,0.35)", background: "rgba(245,158,11,0.08)" }}>
          <div className="equipmentSectionHeader">
            <div>
              <div className="equipmentSectionTitle">Tag NFC già associato</div>
              <div className="equipmentSectionHint">
                Il tag letto è già associato a ` {nfcTagReassign.existingSerial} ` nell&apos;area {EQUIPMENT_AREA_LABELS[nfcTagReassign.existingArea]}.
              </div>
            </div>
          </div>
          <div className="equipmentActionGroup">
            <button
              className="btn btnPrimary"
              onClick={() => void doAssociateNfc(nfcTagReassign.row, true, nfcTagReassign.serialNumber)}
              style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
            >
              <NfcIcon />
              Conferma riassegnazione
            </button>
            <button className="btn" onClick={() => setNfcTagReassign(null)}>
              Annulla
            </button>
          </div>
        </div>
      )}

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
              <EquipmentLabelPreview key={row.id} row={row} areaLabel={areaLabel} printMode={printMode} />
            ))}
          </div>
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

  return (
    <div className="etichetta-label">
      <div className="etichetta-content etichetta-content-with-qr">
        <div className="etichetta-left">
          <div className="etichetta-text">
            <div className="etichetta-code">{row.serial_number || row.asset_code}</div>
            <div className="etichetta-name">{row.name}</div>
            <div className="etichetta-shelf">{areaLabel}</div>
            {shelfLine ? <div className="etichetta-shelf">Scaffale: {shelfLine}</div> : null}
          </div>
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
