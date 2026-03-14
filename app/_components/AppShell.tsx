"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { useSidebar } from "../_lib/SidebarContext";
import SideNav from "./SideNav";
import TopBar from "./TopBar";

type Props = {
  hasUser: boolean;
  displayName: string;
  displayBadge: string;
  children: React.ReactNode;
};

function shouldHideSidebar(pathname: string) {
  return pathname === "/" || pathname === "/attrezzature" || pathname === "/profilo" || pathname.startsWith("/admin");
}

export default function AppShell({ hasUser, displayName, displayBadge, children }: Props) {
  const pathname = usePathname();
  const { isOpen } = useSidebar();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const hideSidebar = hasUser && shouldHideSidebar(pathname);
  const sidebarCollapsed = hasUser && !hideSidebar && !isOpen;
  const showHamburger = hasUser && !hideSidebar;

  const appClasses = [
    "app",
    hasUser ? "" : "appLogin",
    hideSidebar ? "appNoSidebar" : "",
    showHamburger ? "appWithSidebar" : "",
    sidebarCollapsed ? "appSidebarCollapsed" : "",
  ].filter(Boolean).join(" ");

  return (
    <div className={appClasses}>
      {hasUser && <TopBar displayName={displayName} displayBadge={displayBadge} showHamburger={showHamburger} />}
      {hasUser && <SideNav hideSidebar={hideSidebar} />}

      <div className="main">
        <div className="content">
          {mounted ? children : <div style={{ minHeight: 120 }} aria-hidden="true" />}
          <footer className="app-footer">
            © <span suppressHydrationWarning>{new Date().getFullYear()}</span> · Gestionale Magazzino
          </footer>
        </div>
      </div>
    </div>
  );
}
