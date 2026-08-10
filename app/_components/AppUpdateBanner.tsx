"use client";

import { useEffect, useState } from "react";
import { Capacitor } from "@capacitor/core";
import { App } from "@capacitor/app";

type RemoteVersion = {
  versionCode: number;
  versionName: string;
  apkPath: string;
  notes?: string;
};

/**
 * Su app nativa: se sul server c'è un versionCode più alto, mostra banner con link download APK.
 */
export default function AppUpdateBanner() {
  const [remote, setRemote] = useState<RemoteVersion | null>(null);
  const [currentBuild, setCurrentBuild] = useState<number | null>(null);

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    let alive = true;
    (async () => {
      try {
        const info = await App.getInfo();
        const build = Number(info.build);
        if (alive) setCurrentBuild(Number.isFinite(build) ? build : null);

        const res = await fetch("/app-version.json", { cache: "no-store" });
        if (!res.ok) return;
        const data = (await res.json()) as RemoteVersion;
        if (alive) setRemote(data);
      } catch (e) {
        console.warn("AppUpdateBanner:", e);
      }
    })();

    return () => {
      alive = false;
    };
  }, []);

  if (!remote || currentBuild == null) return null;
  if (remote.versionCode <= currentBuild) return null;

  const href = remote.apkPath || "/downloads/magazzino.apk";

  return (
    <div
      style={{
        position: "sticky",
        top: 0,
        zIndex: 40,
        padding: "10px 14px",
        background: "linear-gradient(120deg, #0f766e 0%, #155e75 100%)",
        color: "#fff",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
        flexWrap: "wrap",
      }}
    >
      <div style={{ fontSize: 13, lineHeight: 1.35 }}>
        <b>Aggiornamento disponibile</b>
        <span style={{ opacity: 0.9 }}>
          {" "}
          · v{remote.versionName}
          {remote.notes ? ` · ${remote.notes}` : ""}
        </span>
      </div>
      <a
        href={href}
        download="MagazzinoApp2.apk"
        className="btn"
        style={{
          background: "#fff",
          color: "#0f766e",
          fontWeight: 800,
          textDecoration: "none",
          whiteSpace: "nowrap",
        }}
      >
        Scarica e installa
      </a>
    </div>
  );
}
