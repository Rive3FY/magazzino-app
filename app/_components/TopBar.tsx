"use client";

type Props = {
  // compatibilità vecchia
  email?: string | null;

  // compatibilità nuova
  displayName?: string;
  displayBadge?: string;
};

export default function TopBar({ email, displayName, displayBadge }: Props) {
  const name = displayName ?? (email ?? "");
  const badge = displayBadge ?? "";

  return (
    <header className="topbar">
      <div className="topbarTitle">Magazzino</div>

      <div className="userArea">
        <span className="userPill" title={name}>
          👤 {name || "Utente"}
          {badge ? ` · ${badge}` : ""}
        </span>

        <form action="/logout" method="POST" style={{ margin: 0 }}>
          <button className="btn" type="submit">
            Logout
          </button>
        </form>
      </div>
    </header>
  );
}