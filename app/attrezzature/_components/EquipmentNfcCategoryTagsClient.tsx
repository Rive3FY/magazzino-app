"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "../../_lib/supabase/client";
import { notifyEquipmentSync } from "../../_lib/equipmentSync";
import type { EquipmentArea } from "../../_lib/types";
import { useToast } from "../../_lib/ToastContext";

type NfcCategoryTagRow = {
  id: string;
  nfc_tag_id: string;
  category: string;
  equipment_area: string;
  created_at: string;
};

type Props = {
  area: EquipmentArea;
};

export default function EquipmentNfcCategoryTagsClient({ area }: Props) {
  const supabase = createClient();
  const toast = useToast();
  const [rows, setRows] = useState<NfcCategoryTagRow[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [scannedTagId, setScannedTagId] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState("");
  const [customCategory, setCustomCategory] = useState("");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const [tagsRes, assetsRes] = await Promise.all([
      supabase
        .from("equipment_nfc_category_tags")
        .select("id,nfc_tag_id,category,equipment_area,created_at")
        .eq("equipment_area", area)
        .order("category"),
      supabase
        .from("equipment_assets")
        .select("category")
        .eq("equipment_area", area)
        .not("category", "is", null),
    ]);
    if (tagsRes.error) {
      toast.error("Errore caricamento tag: " + tagsRes.error.message);
      setLoading(false);
      return;
    }
    setRows((tagsRes.data as NfcCategoryTagRow[]) ?? []);

    const catSet = new Set<string>();
    for (const r of assetsRes.data ?? []) {
      const c = (r as { category: string | null }).category?.trim();
      if (c) catSet.add(c);
    }
    for (const r of tagsRes.data ?? []) {
      const c = (r as NfcCategoryTagRow).category?.trim();
      if (c) catSet.add(c);
    }
    setCategories(Array.from(catSet).sort());
    setLoading(false);
  }, [area, toast]);

  useEffect(() => {
    void load();
  }, [load]);

  async function startNfcScan() {
    if (typeof NDEFReader === "undefined") {
      toast.error("NFC non disponibile (Chrome Android con HTTPS).");
      return;
    }
    setScanning(true);
    setModalOpen(false);
    setScannedTagId(null);
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
      if (serialNumber) {
        setScannedTagId(serialNumber);
        setModalOpen(true);
        setSelectedCategory(categories[0] ?? "");
        setCustomCategory("");
      } else {
        toast.error("Impossibile leggere l'ID del tag.");
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Errore lettura NFC");
    } finally {
      setScanning(false);
    }
  }

  async function saveTag() {
    if (!scannedTagId?.trim()) return;
    const cat = (selectedCategory || customCategory).trim();
    if (!cat) {
      toast.error("Seleziona o inserisci una categoria.");
      return;
    }
    setSaving(true);
    try {
      const { error } = await supabase.from("equipment_nfc_category_tags").insert({
        nfc_tag_id: scannedTagId.trim(),
        category: cat,
        equipment_area: area,
      });
      if (error) throw error;
      toast.success("Tag registrato.");
      notifyEquipmentSync(area, "admin-nfc-category-tag-save");
      setModalOpen(false);
      setScannedTagId(null);
      void load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Errore salvataggio");
    } finally {
      setSaving(false);
    }
  }

  async function deleteTag(id: string) {
    setDeleting(id);
    try {
      const { error } = await supabase.from("equipment_nfc_category_tags").delete().eq("id", id);
      if (error) throw error;
      toast.success("Tag rimosso.");
      notifyEquipmentSync(area, "admin-nfc-category-tag-delete");
      void load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Errore eliminazione");
    } finally {
      setDeleting(null);
    }
  }

  const effectiveCategory = selectedCategory || customCategory;

  return (
    <div
      style={{
        border: "1px solid var(--border)",
        borderRadius: 12,
        overflow: "hidden",
        background: "var(--panel)",
      }}
    >
      <button
        type="button"
        onClick={() => setCollapsed((c) => !c)}
        style={{
          width: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "12px 16px",
          border: "none",
          background: "transparent",
          cursor: "pointer",
          textAlign: "left",
          fontSize: 15,
          fontWeight: 600,
          color: "var(--text)",
        }}
      >
        <span>Tag NFC per gruppo/categoria</span>
        <span style={{ fontSize: 18, color: "var(--muted)", transition: "transform 0.2s", transform: collapsed ? "rotate(0deg)" : "rotate(180deg)" }}>
          ▼
        </span>
      </button>
      {!collapsed && (
        <div style={{ padding: "0 16px 16px", borderTop: "1px solid var(--border)" }}>
          <div style={{ marginTop: 12, display: "flex", flexWrap: "wrap", gap: 10, alignItems: "flex-end" }}>
            <button
              type="button"
              className="btn btnPrimary"
              onClick={() => void startNfcScan()}
              disabled={scanning}
              style={{ padding: "8px 14px", fontSize: 13 }}
            >
              {scanning ? "Scansiona…" : "Aggiungi tag NFC"}
            </button>
          </div>

          {loading ? (
            <div style={{ padding: 16, textAlign: "center", color: "var(--muted)" }}>Caricamento…</div>
          ) : rows.length === 0 ? (
            <div style={{ marginTop: 16, padding: 16, border: "1px dashed var(--border)", borderRadius: 8, color: "var(--muted)", fontSize: 13 }}>
              Nessun tag registrato. Clicca &quot;Aggiungi tag NFC&quot; e scansiona un tag sul rack.
            </div>
          ) : (
            <ul style={{ margin: "16px 0 0", padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 6 }}>
              {rows.map((r) => (
                <li
                  key={r.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "8px 10px",
                    background: "var(--panel)",
                    border: "1px solid var(--border)",
                    borderRadius: 8,
                  }}
                >
                  <div>
                    <span style={{ fontWeight: 600, marginRight: 8 }}>{r.category}</span>
                    <span style={{ fontSize: 12, color: "var(--muted)", fontFamily: "monospace" }}>{r.nfc_tag_id}</span>
                  </div>
                  <button
                    type="button"
                    className="btn"
                    onClick={() => void deleteTag(r.id)}
                    disabled={deleting === r.id}
                    style={{ padding: "4px 10px", fontSize: 12, borderColor: "rgba(239,68,68,0.5)", color: "#991b1b", background: "rgba(239,68,68,0.08)" }}
                  >
                    {deleting === r.id ? "…" : "Elimina"}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {modalOpen && scannedTagId && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 10050,
            padding: 16,
          }}
          onClick={() => !saving && setModalOpen(false)}
        >
          <div
            style={{
              background: "var(--bg)",
              borderRadius: 12,
              padding: 20,
              maxWidth: 400,
              width: "100%",
              boxShadow: "0 4px 20px rgba(0,0,0,0.2)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h4 style={{ margin: "0 0 12px", fontSize: 16 }}>Registra tag NFC</h4>
            <p style={{ margin: "0 0 12px", fontSize: 13, color: "var(--muted)" }}>
              Tag: <code style={{ fontSize: 12 }}>{scannedTagId}</code>
            </p>
            <div style={{ marginBottom: 12 }}>
              <label className="label" style={{ display: "block", marginBottom: 4 }}>
                Categoria
              </label>
              {categories.length > 0 && (
                <select
                  className="input"
                  value={selectedCategory}
                  onChange={(e) => {
                    setSelectedCategory(e.target.value);
                    setCustomCategory("");
                  }}
                  style={{ width: "100%", marginBottom: 8 }}
                >
                  <option value="">— Scegli o inserisci sotto —</option>
                  {categories.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              )}
              <input
                type="text"
                className="input"
                placeholder="Oppure inserisci categoria (es. 380kV)"
                value={customCategory}
                onChange={(e) => {
                  setCustomCategory(e.target.value);
                  if (e.target.value) setSelectedCategory("");
                }}
                style={{ width: "100%" }}
              />
            </div>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button type="button" className="btn" onClick={() => setModalOpen(false)} disabled={saving}>
                Annulla
              </button>
              <button
                type="button"
                className="btn"
                onClick={() => void saveTag()}
                disabled={saving || !effectiveCategory.trim()}
                style={{ background: "var(--primary)", color: "#fff", borderColor: "var(--primary)" }}
              >
                {saving ? "Salvataggio…" : "Salva"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
