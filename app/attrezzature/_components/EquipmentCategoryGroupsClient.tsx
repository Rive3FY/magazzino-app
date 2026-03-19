"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "../../_lib/supabase/client";
import type { EquipmentArea } from "../../_lib/types";
import { useToast } from "../../_lib/ToastContext";
import { isRelationMissingOrNotExposedError } from "../../_lib/postgrestErrors";

type CategoryGroupRow = {
  id: string;
  equipment_area: string;
  group_name: string;
  category: string;
  sort_order: number | null;
};

type Props = {
  area: EquipmentArea;
};

export default function EquipmentCategoryGroupsClient({ area }: Props) {
  const supabase = createClient();
  const toast = useToast();
  const [rows, setRows] = useState<CategoryGroupRow[]>([]);
  const [allCategories, setAllCategories] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState(true);
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const [newGroupName, setNewGroupName] = useState("");
  const [newCategory, setNewCategory] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const [groupsRes, assetsRes] = await Promise.all([
      supabase
        .from("equipment_category_groups")
        .select("id,equipment_area,group_name,category,sort_order")
        .eq("equipment_area", area)
        .order("group_name")
        .order("category"),
      supabase.from("equipment_assets").select("category").eq("equipment_area", area).not("category", "is", null),
    ]);

    if (groupsRes.error) {
      if (isRelationMissingOrNotExposedError(groupsRes.error)) {
        toast.error("Tabella equipment_category_groups non trovata. Esegui la migration SQL in Supabase.");
      } else {
        toast.error("Errore caricamento gruppi: " + groupsRes.error.message);
      }
      setRows([]);
      setLoading(false);
      return;
    }
    setRows((groupsRes.data as CategoryGroupRow[]) ?? []);

    const catSet = new Set<string>();
    for (const r of assetsRes.data ?? []) {
      const c = (r as { category: string | null }).category?.trim();
      if (c) catSet.add(c);
    }
    setAllCategories(Array.from(catSet).sort());
    setLoading(false);
  }, [area, toast]);

  useEffect(() => {
    void load();
  }, [load]);

  const assignedCategories = new Set(rows.map((r) => r.category));
  const availableCategories = allCategories.filter((c) => !assignedCategories.has(c));
  const existingGroupNames = Array.from(new Set(rows.map((r) => r.group_name))).sort();

  async function addMapping() {
    const group = newGroupName.trim();
    const category = newCategory.trim();
    if (!group || !category) {
      toast.error("Inserisci gruppo e categoria.");
      return;
    }
    setSaving(true);
    try {
      const { error } = await supabase.from("equipment_category_groups").insert({
        equipment_area: area,
        group_name: group,
        category,
      });
      if (error) throw error;
      toast.success("Associazione aggiunta.");
      setNewCategory("");
      void load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Errore salvataggio");
    } finally {
      setSaving(false);
    }
  }

  async function deleteRow(id: string) {
    setDeleting(id);
    try {
      const { error } = await supabase.from("equipment_category_groups").delete().eq("id", id);
      if (error) throw error;
      toast.success("Associazione rimossa.");
      void load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Errore eliminazione");
    } finally {
      setDeleting(null);
    }
  }

  const rowsByGroup = rows.reduce<Record<string, CategoryGroupRow[]>>((acc, r) => {
    const g = r.group_name;
    if (!acc[g]) acc[g] = [];
    acc[g].push(r);
    return acc;
  }, {});

  useEffect(() => {
    const groupNames = [...new Set(rows.map((r) => r.group_name))];
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      for (const g of groupNames) {
        if (!prev.has(g)) next.add(g);
      }
      return next;
    });
  }, [rows]);

  const toggleGroup = (groupName: string) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(groupName)) next.delete(groupName);
      else next.add(groupName);
      return next;
    });
  };

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
        <span>Gruppi categorie (per movimenti)</span>
        <span style={{ fontSize: 18, color: "var(--muted)", transition: "transform 0.2s", transform: collapsed ? "rotate(0deg)" : "rotate(180deg)" }}>
          ▼
        </span>
      </button>
      {!collapsed && (
        <div style={{ padding: "0 16px 16px", borderTop: "1px solid var(--border)" }}>
          <div style={{ marginTop: 12, display: "flex", flexWrap: "wrap", gap: 10, alignItems: "flex-end" }}>
            <div style={{ minWidth: 160 }}>
              <label className="label" style={{ display: "block", marginBottom: 4 }}>
                Gruppo
              </label>
              <input
                type="text"
                className="input"
                placeholder="Nome gruppo"
                value={newGroupName}
                onChange={(e) => setNewGroupName(e.target.value)}
                list="existing-groups"
                style={{ width: "100%" }}
              />
              <datalist id="existing-groups">
                {existingGroupNames.map((g) => (
                  <option key={g} value={g} />
                ))}
              </datalist>
            </div>
            <div style={{ minWidth: 160 }}>
              <label className="label" style={{ display: "block", marginBottom: 4 }}>
                Categoria
              </label>
              <select
                className="input"
                value={newCategory}
                onChange={(e) => setNewCategory(e.target.value)}
                style={{ width: "100%" }}
              >
                <option value="">— Seleziona —</option>
                {availableCategories.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
            <button
              type="button"
              className="btn btnPrimary"
              onClick={() => void addMapping()}
              disabled={saving || !newGroupName.trim() || !newCategory.trim()}
              style={{ padding: "8px 14px", fontSize: 13 }}
            >
              {saving ? "Salvataggio…" : "Aggiungi"}
            </button>
          </div>

          {loading ? (
            <div style={{ padding: 16, textAlign: "center", color: "var(--muted)" }}>Caricamento…</div>
          ) : rows.length === 0 ? (
            <div style={{ marginTop: 16, padding: 16, border: "1px dashed var(--border)", borderRadius: 8, color: "var(--muted)", fontSize: 13 }}>
              Nessun gruppo configurato. Inserisci gruppo e categoria sopra.
            </div>
          ) : (
            <div style={{ marginTop: 16 }}>
              {Object.entries(rowsByGroup).map(([groupName, groupRows]) => {
                const isGroupCollapsed = collapsedGroups.has(groupName);
                return (
                  <div key={groupName} style={{ marginBottom: 12, border: "1px solid var(--border)", borderRadius: 8, overflow: "hidden" }}>
                    <button
                      type="button"
                      onClick={() => toggleGroup(groupName)}
                      style={{
                        width: "100%",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        padding: "10px 12px",
                        border: "none",
                        background: "var(--bg)",
                        cursor: "pointer",
                        textAlign: "left",
                        fontWeight: 700,
                        fontSize: 13,
                        color: "var(--text)",
                      }}
                    >
                      <span>{groupName}</span>
                      <span style={{ fontSize: 12, color: "var(--muted)", marginRight: 4 }}>
                        {groupRows.length} {groupRows.length === 1 ? "categoria" : "categorie"}
                      </span>
                      <span style={{ fontSize: 14, color: "var(--muted)", transition: "transform 0.2s", transform: isGroupCollapsed ? "rotate(-90deg)" : "rotate(0deg)" }}>
                        ▶
                      </span>
                    </button>
                    {!isGroupCollapsed && (
                      <ul style={{ margin: 0, padding: "8px 12px 12px", listStyle: "none", display: "flex", flexDirection: "column", gap: 6, borderTop: "1px solid var(--border)" }}>
                        {groupRows.map((r) => (
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
                            <span style={{ fontSize: 13 }}>{r.category}</span>
                            <button
                              type="button"
                              className="btn"
                              onClick={() => void deleteRow(r.id)}
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
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
