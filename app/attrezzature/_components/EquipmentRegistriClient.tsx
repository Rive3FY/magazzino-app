"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "../../_lib/supabase/client";
import { useAuth } from "../../_lib/hooks/useAuth";
import { useToast } from "../../_lib/ToastContext";
import { EQUIPMENT_AREA_LABELS } from "../../_lib/equipment";
import type { EquipmentArea } from "../../_lib/types";
import { AppLoading } from "../../_components/AppSpinner";

type Props = {
  area: EquipmentArea;
  basePath: string;
};

const supabase = createClient();

export default function EquipmentRegistriClient({ area }: Props) {
  const { user, loading: authLoading, approved } = useAuth();
  const toast = useToast();
  const [assets, setAssets] = useState<{ warehouse: string | null }[]>([]);
  const [loading, setLoading] = useState(true);
  const [registroWarehouse, setRegistroWarehouse] = useState<string>("");

  const warehouses = useMemo(() => {
    const set = new Set<string>();
    for (const a of assets) {
      const w = (a.warehouse ?? "").trim();
      if (w) set.add(w);
    }
    return Array.from(set).sort();
  }, [assets]);

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

  useEffect(() => {
    if (!user || !approved) return;
    let alive = true;
    (async () => {
      const { data, error } = await supabase
        .from("equipment_assets")
        .select("warehouse")
        .eq("equipment_area", area);

      if (!alive) return;
      if (error) {
        setLoading(false);
        return;
      }
      setAssets((data ?? []) as { warehouse: string | null }[]);
      setLoading(false);
    })();
    return () => {
      alive = false;
    };
  }, [user, approved, area]);

  const areaLabel = EQUIPMENT_AREA_LABELS[area];
  const docxUrl =
    registroWarehouse === "__ALL__"
      ? `/api/attrezzature/registro-docx?area=${area}&warehouse=__ALL__`
      : registroWarehouse
        ? `/api/attrezzature/registro-docx?area=${area}&warehouse=${encodeURIComponent(registroWarehouse)}`
        : "";

  if (authLoading || loading) {
    return (
      <main className="panel">
        <div className="pageBar">
          <div className="pageBarTitle">Attrezzature {areaLabel} - Registri</div>
        </div>
        <div className="card" style={{ padding: 12 }}><AppLoading align="start" /></div>
      </main>
    );
  }

  return (
    <main className="panel">
      <div className="pageBar">
        <div className="pageBarTitle">Attrezzature {areaLabel} - Registri</div>
      </div>

      <div className="card" style={{ padding: 20 }}>
        <div className="equipmentSectionHeader" style={{ marginBottom: 16 }}>
          <div>
            <div className="equipmentSectionTitle">Registro movimenti DOCX</div>
            <div className="equipmentSectionHint">
              Scarica il registro dei movimenti delle attrezzature in formato Word (DOCX) per il magazzino selezionato.
              Con &quot;Tutti i magazzini&quot; viene scaricato un file ZIP contenente un DOCX per ogni magazzino (con contatore pagine corretto).
            </div>
          </div>
          <div className="equipmentAreaPill">Area: {areaLabel}</div>
        </div>

        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end" }}>
          <div style={{ minWidth: 240 }}>
            <label className="label" htmlFor={`registro-warehouse-${area}`}>
              Magazzino
            </label>
            <select
              id={`registro-warehouse-${area}`}
              className="input"
              value={registroWarehouse}
              onChange={(e) => setRegistroWarehouse(e.target.value)}
              style={{ width: "100%" }}
              aria-label="Seleziona magazzino registro DOCX"
            >
              <option value="">— Seleziona magazzino —</option>
              <option value="__ALL__">Tutti i magazzini</option>
              {warehouses.map((w) => (
                <option key={w} value={w}>{w}</option>
              ))}
            </select>
          </div>
          <a
            className="btn"
            href={docxUrl || "#"}
            aria-disabled={!registroWarehouse}
            onClick={(e) => {
              if (!registroWarehouse) e.preventDefault();
              else toast.success("Download avviato");
            }}
            style={!registroWarehouse ? { opacity: 0.5, pointerEvents: "auto" } : undefined}
          >
            Scarica registro Movimenti
          </a>
        </div>

        {warehouses.length === 0 && (
          <p style={{ marginTop: 16, color: "var(--muted)", fontSize: "var(--font-sm)" }}>
            Nessun magazzino disponibile. Aggiungi attrezzature con magazzino assegnato per generare il registro.
          </p>
        )}
      </div>
    </main>
  );
}
