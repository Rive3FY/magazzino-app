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

export default function HubLauncher() {
  const { isSuperAdmin, loading } = useIsAdmin();

  return (
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
          style={{ borderTopColor: "#1d4ed8" }}
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
          style={{ borderTopColor: "#0f766e" }}
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
          style={{ borderTopColor: "#6366f1" }}
        >
          <div className="launcherCardContent">
            <div className="launcherCardBadge">Profilo</div>
            <div className="launcherCardTitle">Gestione Profilo</div>
            <div className="launcherCardText">
              Modifica badge, nome e cognome del tuo profilo.
            </div>
          </div>
          <div className="launcherCardFooter">
            <span>Apri profilo</span>
            <LauncherArrow />
          </div>
        </Link>

        {!loading && isSuperAdmin && (
          <Link
            href="/admin"
            className="launcherCard"
            style={{ borderTopColor: "#b91c1c" }}
          >
            <div className="launcherCardContent">
              <div className="launcherCardBadge">Amministrazione</div>
              <div className="launcherCardTitle">Super Admin</div>
              <div className="launcherCardText">
                Gestione utenti, approvazioni, permessi admin e funzioni di sistema.
              </div>
            </div>
            <div className="launcherCardFooter">
              <span>Apri Super Admin</span>
              <LauncherArrow />
            </div>
          </Link>
        )}
      </div>

      <div className="showOnMobileOnly" style={{ marginTop: 20, paddingTop: 16, borderTop: "1px solid var(--border)" }}>
        <form action="/logout" method="POST" style={{ margin: 0 }}>
          <button type="submit" className="btn" style={{ width: "100%" }}>
            Esci
          </button>
        </form>
      </div>
    </div>
  );
}
