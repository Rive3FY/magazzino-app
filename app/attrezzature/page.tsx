import Link from "next/link";

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

export default function AttrezzaturePage() {
  return (
    <main className="panel">
      <div className="pageBar">
        <div className="pageBarTitle">Selezione attrezzature</div>
      </div>

      <div className="card" style={{ padding: 20 }}>
        <div className="launcherHero">
          <div className="launcherTitle">Scegli il registro attrezzature</div>
          <div className="launcherText">
            Le attrezzature di Linee e Stazioni sono separate, non condividono inventario e avranno una navigazione dedicata.
          </div>
        </div>

        <div className="launcherGrid">
          <Link
            href="/attrezzature/linee"
            className="launcherCard"
            style={{ borderTopColor: "#15803d" }}
          >
            <div className="launcherCardContent">
              <div className="launcherCardBadge">Dashboard Linee</div>
              <div className="launcherCardTitle">Attrezzature Linee</div>
              <div className="launcherCardText">
                Gestisci anagrafica, assegnazioni, rientri, manutenzione ed etichette delle attrezzature usate sulle linee.
              </div>
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
              <div className="launcherCardBadge">Dashboard Stazioni</div>
              <div className="launcherCardTitle">Attrezzature Stazioni</div>
              <div className="launcherCardText">
                Gestisci un registro separato per le attrezzature delle stazioni, con storico ed etichette dedicati.
              </div>
            </div>
            <div className="launcherCardFooter">
              <span>Apri Stazioni</span>
              <LauncherArrow />
            </div>
          </Link>
        </div>
      </div>
    </main>
  );
}
