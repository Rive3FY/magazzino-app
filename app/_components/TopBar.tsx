"use client";

type Props = {
  displayName: string;
  displayBadge?: string;
};

export default function TopBar({ displayName, displayBadge }: Props) {
  return (
    <header className="topbar">
      <div className="topbarTitle">Magazzino</div>

      <div className="userArea">
        <span className="userPill" title={displayName}>
          👤 {displayName}
          {displayBadge ? ` · ${displayBadge}` : ""}
        </span>

        <form action="/logout" method="POST" style={{ margin: 0 }}>
          <button className="btn" type="submit">Logout</button>
        </form>
      </div>
    </header>
  );
}