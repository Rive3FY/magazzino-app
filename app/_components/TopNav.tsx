"use client";

import Link from "next/link";

type Props = { email: string | null };

export default function TopNav({ email }: Props) {
  return (
    <header className="erpTopbar">
      <div className="erpTopbarInner">
        <Link href="/" className="erpBrand">
          <span className="erpLogo" />
          <span>
            <div className="erpBrandTitle">Gestionale Magazzino</div>
            <div className="erpBrandSub">Movimenti · Giacenze</div>
          </span>
        </Link>

        {email ? (
          <div className="erpTopbarRight">
            <span className="erpUser" title={email}>
              👤 {email}
            </span>

            <form action="/logout" method="POST" style={{ margin: 0 }}>
              <button type="submit" className="erpBtn erpBtnGhost">
                Logout
              </button>
            </form>
          </div>
        ) : null}
      </div>
    </header>
  );
}