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

export default function Home() {
  return (
    <main className="panel">
      <div className="pageBar">
        <div className="pageBarTitle">Selezione modulo</div>
      </div>

      <div className="card" style={{ padding: 20 }}>
        <div className="launcherHero">
          <div className="launcherTitle">Scegli l&apos;area di lavoro</div>
          <div className="launcherText">
            Accedi rapidamente ai materiali, alle attrezzature oppure alla gestione del tuo profilo.
            Se scegli attrezzature, nel passaggio successivo potrai entrare in Linee o Stazioni.
          </div>
        </div>

        <div className="launcherGrid">
          <Link
            href="/materiali"
            className="launcherCard"
            style={{ background: "linear-gradient(135deg, #0f172a 0%, #1d4ed8 100%)" }}
          >
            <div className="launcherCardContent">
              <div className="launcherCardBadge">Materiali</div>
              <div className="launcherCardTitle">Materiali</div>
              <div className="launcherCardText">
                Entra nel flusso materiali per dashboard, movimenti, giacenze, scaffali, etichette e gestione operativa.
              </div>
            </div>
            <div className="launcherCardFooter">
              <span>Apri modulo materiali</span>
              <LauncherArrow />
            </div>
          </Link>

          <Link
            href="/attrezzature"
            className="launcherCard"
            style={{ background: "linear-gradient(135deg, #0f766e 0%, #14b8a6 100%)" }}
          >
            <div className="launcherCardContent">
              <div className="launcherCardBadge">Attrezzature</div>
              <div className="launcherCardTitle">Attrezzature</div>
              <div className="launcherCardText">
                Accedi alle attrezzature e scegli il registro corretto tra Linee e Stazioni.
              </div>
            </div>
            <div className="launcherCardFooter">
              <span>Scegli area attrezzature</span>
              <LauncherArrow />
            </div>
          </Link>

          <Link
            href="/profilo"
            className="launcherCard"
            style={{ background: "linear-gradient(135deg, #7c3aed 0%, #c026d3 100%)" }}
          >
            <div className="launcherCardContent">
              <div className="launcherCardBadge">Profilo</div>
              <div className="launcherCardTitle">Gestione Profilo</div>
              <div className="launcherCardText">
                Modifica badge, nome e cognome del tuo profilo senza entrare in un contesto operativo specifico.
              </div>
            </div>
            <div className="launcherCardFooter">
              <span>Apri profilo</span>
              <LauncherArrow />
            </div>
          </Link>
        </div>
      </div>
    </main>
  );
}
