"use client";

import AppModalFrame from "../../_components/AppModalFrame";

export type MaterialsDashboardStats = {
  items_count: number;
  excel_codes_distinct: number;
  excel_rows_total: number;
  excel_rows_prm: number;
  excel_rows_reale: number;
  assigned_rows_total: number;
  assigned_rows_prm: number;
  assigned_rows_reale: number;
  orphan_shelf_rows: number;
  excel_codes_without_item: number;
  zero_stock_count: number;
  zero_stock_prm: number;
  zero_stock_reale: number;
  negative_stock_count: number;
  open_out_movements: number;
  pending_excel_requests: number;
  movements_today: number;
};

type Props = {
  open: boolean;
  stats: MaterialsDashboardStats | null;
  loading: boolean;
  error: string | null;
  onClose: () => void;
  onRefresh: () => void;
};

type DonutProps = {
  label: string;
  assigned: number;
  total: number;
  href: string;
  color: string;
};

function DonutKpi({ label, assigned, total, href, color }: DonutProps) {
  const missing = Math.max(0, total - assigned);
  const percent = total > 0 ? Math.min(100, Math.round((assigned / total) * 100)) : 0;

  return (
    <a
      href={href}
      style={{
        display: "grid",
        justifyItems: "center",
        gap: 10,
        padding: 16,
        borderRadius: 14,
        border: "1px solid #e2e8f0",
        background: "#fff",
        color: "inherit",
        textDecoration: "none",
      }}
    >
      <div style={{ fontWeight: 900 }}>{label}</div>
      <div
        role="img"
        aria-label={`${label}: ${percent}% assegnato`}
        style={{
          width: 132,
          height: 132,
          borderRadius: "50%",
          background: `conic-gradient(${color} 0 ${percent}%, #e2e8f0 ${percent}% 100%)`,
          display: "grid",
          placeItems: "center",
        }}
      >
        <div
          style={{
            width: 92,
            height: 92,
            borderRadius: "50%",
            background: "#fff",
            display: "grid",
            placeItems: "center",
            textAlign: "center",
          }}
        >
          <div>
            <div style={{ fontSize: 24, fontWeight: 950, color }}>{percent}%</div>
            <div style={{ marginTop: 2, fontSize: 11, color: "#64748b" }}>{assigned}/{total}</div>
          </div>
        </div>
      </div>
      <div style={{ fontSize: 13, fontWeight: 800, color: missing > 0 ? "#9a3412" : "#047857" }}>
        {missing > 0 ? `${missing} mancanti` : "Completato"}
      </div>
      <div style={{ fontSize: 11, color: "#64748b" }}>Apri elenco filtrato →</div>
    </a>
  );
}

export default function AdminMaterialsOverviewModal({
  open,
  stats,
  loading,
  error,
  onClose,
  onRefresh,
}: Props) {
  return (
    <AppModalFrame
      open={open}
      title="Panoramica admin materiali"
      subtitle="Copertura delle assegnazioni scaffale e qualità dell'anagrafica"
      onClose={onClose}
      width="min(1040px, 100%)"
      bodyStyle={{ background: "#f8fafc" }}
      headerRight={
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button className="btn" type="button" onClick={onRefresh} disabled={loading}>
            {loading ? "Aggiornamento..." : "Aggiorna"}
          </button>
          <button className="btn" type="button" onClick={onClose}>Chiudi</button>
        </div>
      }
    >
      {error && (
        <div style={{ padding: 12, borderRadius: 10, background: "#fff7ed", border: "1px solid #fdba74", color: "#9a3412", fontWeight: 700 }}>
          {error}
        </div>
      )}

      {loading && !stats ? (
        <div style={{ padding: 24, textAlign: "center", color: "#64748b" }}>Caricamento statistiche...</div>
      ) : stats ? (
        <>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(min(220px, 100%), 1fr))",
              gap: 12,
            }}
          >
            <DonutKpi
              label="Copertura totale"
              assigned={stats.assigned_rows_total}
              total={stats.excel_rows_total}
              href="/scaffali?filter=missing"
              color="#2563eb"
            />
            <DonutKpi
              label="Magazzino PRM"
              assigned={stats.assigned_rows_prm}
              total={stats.excel_rows_prm}
              href="/scaffali?filter=missing&warehouse=PRM"
              color="#0891b2"
            />
            <DonutKpi
              label="Magazzino REALE"
              assigned={stats.assigned_rows_reale}
              total={stats.excel_rows_reale}
              href="/scaffali?filter=missing&warehouse=REALE"
              color="#7c3aed"
            />
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(min(190px, 100%), 1fr))",
              gap: 10,
              marginTop: 14,
            }}
          >
            {[
              { label: "Codici in anagrafica", value: stats.items_count, href: "/scaffali" },
              { label: "Codici distinti Excel", value: stats.excel_codes_distinct, href: "/import" },
              { label: "Q.tà 0 totale (PRM+REALE)", value: stats.zero_stock_count, href: "/giacenze?stock=zero-total" },
              { label: "Q.tà 0 PRM", value: stats.zero_stock_prm, href: "/giacenze?stock=zero&warehouse=PRM" },
              { label: "Q.tà 0 REALE", value: stats.zero_stock_reale, href: "/giacenze?stock=zero&warehouse=REALE" },
            ].map((item) => (
              <a
                key={item.label}
                href={item.href}
                style={{
                  padding: 14,
                  borderRadius: 12,
                  background: "#fff",
                  border: "1px solid #e2e8f0",
                  color: "inherit",
                  textDecoration: "none",
                }}
              >
                <div style={{ fontSize: 12, color: "#64748b" }}>{item.label}</div>
                <div style={{ marginTop: 5, fontSize: 25, fontWeight: 900 }}>{item.value}</div>
                <div style={{ marginTop: 4, fontSize: 11, color: "#64748b" }}>Apri dettaglio →</div>
              </a>
            ))}
          </div>

          {stats.orphan_shelf_rows > 0 && (
            <a
              href="/scaffali?filter=orphan"
              style={{
                display: "block",
                marginTop: 12,
                padding: 12,
                borderRadius: 10,
                border: "1px solid #fecaca",
                background: "#fef2f2",
                color: "#991b1b",
                textDecoration: "none",
                fontWeight: 800,
              }}
            >
              {stats.orphan_shelf_rows} scaffali senza riga Excel · Apri elenco →
            </a>
          )}
          {stats.excel_codes_without_item > 0 && (
            <a
              href="/import"
              style={{
                display: "block",
                marginTop: 10,
                padding: 12,
                borderRadius: 10,
                border: "1px solid #fecaca",
                background: "#fef2f2",
                color: "#991b1b",
                textDecoration: "none",
                fontWeight: 800,
              }}
            >
              {stats.excel_codes_without_item} codici Excel senza anagrafica · Controlla import →
            </a>
          )}
        </>
      ) : !error ? (
        <div style={{ padding: 24, textAlign: "center", color: "#64748b" }}>Nessun dato disponibile.</div>
      ) : null}
    </AppModalFrame>
  );
}
