"use client";

import { usePathname } from "next/navigation";
import SideNav from "./SideNav";
import TopBar from "./TopBar";

type Props = {
  hasUser: boolean;
  displayName: string;
  displayBadge: string;
  children: React.ReactNode;
};

function shouldHideSidebar(pathname: string) {
  return pathname === "/" || pathname === "/attrezzature" || pathname === "/profilo";
}

export default function AppShell({ hasUser, displayName, displayBadge, children }: Props) {
  const pathname = usePathname();
  const hideSidebar = hasUser && shouldHideSidebar(pathname);

  return (
    <div className={hasUser ? `app ${hideSidebar ? "appNoSidebar" : ""}`.trim() : "app appLogin"}>
      {hasUser && !hideSidebar && <SideNav />}

      <div className="main">
        {hasUser && <TopBar displayName={displayName} displayBadge={displayBadge} />}
        <div className="content">
          {children}
          <footer className="app-footer">
            © <span suppressHydrationWarning>{new Date().getFullYear()}</span> · Gestionale Magazzino
          </footer>
        </div>
      </div>
    </div>
  );
}
