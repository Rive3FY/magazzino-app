"use client";

import Link from "next/link";
import { useIsAdmin } from "../_lib/hooks/useIsAdmin";

function LauncherArrow() {
  return (
    <span className="launcherArrow" aria-hidden="true">
      <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M5 12h14" />
        <path d="m12 5 7 7-7 7" />
      </svg>
    </span>
  );
}

function LauncherIcon({ label }: { label: string }) {
  return <span className="launcherIcon" aria-hidden="true">{label}</span>;
}

function LauncherMeta({ items }: { items: string[] }) {
  return (
    <div className="launcherMeta">
      {items.map((item) => (
        <span key={item}>{item}</span>
      ))}
    </div>
  );
}

export default function AttrezzaturePage() {
  const { canManageEquipmentLinee, canManageEquipmentStazioni, loading } = useIsAdmin();
  const lineeAdmin = !loading && canManageEquipmentLinee;
  const stazioniAdmin = !loading && canManageEquipmentStazioni;

  return (
    <main className="panel launcherPanel">
      <div className="pageBar">
        <div className="pageBarTitle">Selezione attrezzature</div>
      </div>

      <div className="card" style={{ padding: 20 }}>
        <div className="launcherHero">
          <div className="launcherTitle">Scegli il registro attrezzature</div>
          <div className="launcherText">
            Le attrezzature di Linee e Stazioni sono separate, non condividono inventario e hanno una navigazione dedicata.
          </div>
        </div>

        <div className="launcherGrid">
          <Link
            href="/attrezzature/linee"
            className="launcherCard"
            style={{ borderTopColor: "#15803d" }}
          >
            <div className="launcherCardContent">
              <LauncherIcon label="L" />
              <div className="launcherCardBadge">Dashboard Linee</div>
              <div className="launcherCardTitle">Attrezzature Linee</div>
              <div className="launcherCardText">
                {lineeAdmin
                  ? "Gestisci anagrafica, assegnazioni, rientri, manutenzione ed etichette delle attrezzature usate sulle linee."
                  : "Consulta il registro linee, i movimenti, gli assegnatari e i registri."}
              </div>
              <LauncherMeta
                items={lineeAdmin ? ["Movimenti", "Manutenzioni", "Etichette"] : ["Movimenti", "Assegnatari", "Registri"]}
              />
            </div>
            <div className="launcherCardFooter">
              <span>Apri Linee</span>
              <LauncherArrow />
            </div>
          </Link>

          <Link
            href="/attrezzature/stazioni"
            className="launcherCard"
            style={{ borderTopColor: "#c2410c" }}
          >
            <div className="launcherCardContent">
              <LauncherIcon label="S" />
              <div className="launcherCardBadge">Dashboard Stazioni</div>
              <div className="launcherCardTitle">Attrezzature Stazioni</div>
              <div className="launcherCardText">
                {stazioniAdmin
                  ? "Gestisci il registro stazioni, con storico, manutenzione ed etichette dedicate."
                  : "Consulta il registro stazioni, i movimenti, gli assegnatari e i registri."}
              </div>
              <LauncherMeta
                items={stazioniAdmin ? ["Movimenti", "Manutenzioni", "Etichette"] : ["Movimenti", "Assegnatari", "Registri"]}
              />
            </div>
            <div className="launcherCardFooter">
              <span>Apri Stazioni</span>
              <LauncherArrow />
            </div>
          </Link>
        </div>

        <div className="showOnMobileOnly" style={{ marginTop: 20, paddingTop: 16, borderTop: "1px solid var(--border)" }}>
          <Link href="/" className="btn" style={{ width: "100%", display: "block", textAlign: "center", textDecoration: "none" }} prefetch={false}>
            Indietro
          </Link>
        </div>
      </div>
    </main>
  );
}
