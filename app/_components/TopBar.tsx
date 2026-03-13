"use client";

import Link from "next/link";
import { useSidebar } from "../_lib/SidebarContext";
import NotificationBell from "./NotificationBell";

type Props = {
  email?: string | null;
  displayName?: string;
  displayBadge?: string;
  showHamburger?: boolean;
};

export default function TopBar({ email, displayName, displayBadge, showHamburger = false }: Props) {
  const name = displayName ?? (email ?? "");
  const badge = displayBadge ?? "";
  const { isOpen, toggle } = useSidebar();

  return (
    <header className={`topbar ${showHamburger ? "topbarWithSidebar" : ""}`.trim()}>
      <div className="topbarLeft">
        {showHamburger && (
          <button
            type="button"
            className="hamburgerBtn"
            onClick={toggle}
            aria-label={isOpen ? "Chiudi menu" : "Apri menu di navigazione"}
            aria-expanded={isOpen}
          >
            <span className="hamburgerLine" />
            <span className="hamburgerLine" />
            <span className="hamburgerLine" />
          </button>
        )}
      </div>

      <div className="topbarCenter">
        <Link href="/" className="topbarLogo" aria-label="Terna - Torna alla home">
          <img src="/terna-logo-white.svg" alt="Terna" width={118} height={36} />
        </Link>
      </div>

      <div className="userArea">
          <div className="hideOnMobile">
            <NotificationBell />
          </div>
          <Link href="/profilo" className="userPill userPillLink" title={`${name || "Utente"} - Vai al profilo`}>
            <span className="userPillIcon" aria-hidden="true">
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                <circle cx="12" cy="7" r="4" />
              </svg>
            </span>
            {name || "Utente"}
            {badge ? ` · ${badge}` : ""}
          </Link>

          <form action="/logout" method="POST" style={{ margin: 0 }} className="hideOnMobile">
            <button className="btn" type="submit">
              Logout
            </button>
          </form>
        </div>
    </header>
  );
}