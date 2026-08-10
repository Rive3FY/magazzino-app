"use client";

import Link from "next/link";

const APK_URL = "/downloads/magazzino.apk";
const VERSION = "1.1.0";

export default function ScaricaAppPage() {
  return (
    <main className="panel" style={{ maxWidth: 560, margin: "40px auto" }}>
      <div className="pageBar">
        <div className="pageBarTitle">Scarica app Android</div>
      </div>

      <div style={{ padding: 16 }}>
        <p style={{ marginTop: 0, lineHeight: 1.5, color: "#334155" }}>
          Scarica l&apos;APK aggiornato di <b>Magazzino App2</b> (versione {VERSION}).
          Sul telefono apri il file e installa. Se hai già l&apos;app, puoi aggiornarla sopra la precedente.
        </p>

        <a
          className="btn btnPrimary"
          href={APK_URL}
          download="MagazzinoApp2.apk"
          style={{ display: "inline-flex", alignItems: "center", gap: 8, textDecoration: "none" }}
        >
          Scarica APK
        </a>

        <div style={{ marginTop: 16, fontSize: 13, color: "#64748b", lineHeight: 1.45 }}>
          Se Android blocca l&apos;installazione, consenti l&apos;installazione da questa sorgente
          (Chrome / File). Link diretto:{" "}
          <code style={{ fontSize: 12 }}>{APK_URL}</code>
        </div>

        <div style={{ marginTop: 20 }}>
          <Link href="/login" className="btn" style={{ textDecoration: "none" }}>
            Vai al login
          </Link>
        </div>
      </div>
    </main>
  );
}
