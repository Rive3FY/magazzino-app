"use client";

type Props = { email: string | null };

export default function TopBar({ email }: Props) {
  return (
    <header className="topbar">
      <div className="topbarTitle">Magazzino</div>

      {email ? (
        <div className="userArea">
          <span className="userPill">👤 {email}</span>
          <form action="/logout" method="POST" style={{ margin: 0 }}>
            <button className="btn" type="submit">Logout</button>
          </form>
        </div>
      ) : null}
    </header>
  );
}