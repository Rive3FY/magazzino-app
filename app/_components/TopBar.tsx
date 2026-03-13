"use client";

import Link from "next/link";
import { useSidebar } from "../_lib/SidebarContext";
import NotificationBell from "./NotificationBell";

type Props = {
  email?: string | null;
  displayName?: string;
  displayBadge?: string;
};

export default function TopBar({ email, displayName, displayBadge }: Props) {
  const name = displayName ?? (email ?? "");
  const badge = displayBadge ?? "";
  const { isOpen, toggle } = useSidebar();

  return (
    <header className="topbar">
      <div className="topbarLeft">
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
        <Link href="/" className="topbarHomeBtn" aria-label="Torna all'hub principale" title="Torna all'hub principale">
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M3 10.5 12 3l9 7.5" />
            <path d="M5 9.8V21h14V9.8" />
            <path d="M9 21v-6h6v6" />
          </svg>
          <span>Home</span>
        </Link>
      </div>

      <div className="topbarCenter">
        <Link href="/" className="topbarLogo" aria-label="Terna - Torna alla home">
          <img src="/terna-logo-white.svg" alt="Terna" width={118} height={36} />
        </Link>
      </div>

      <div className="userArea">
          <NotificationBell />
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