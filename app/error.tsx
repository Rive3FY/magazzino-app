"use client";

import { useEffect } from "react";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("App error:", error);
  }, [error]);

  return (
    <div
      style={{
        minHeight: "50vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
        textAlign: "center",
      }}
    >
      <h1 style={{ fontSize: 24, fontWeight: 900, marginBottom: 12, color: "#0f172a" }}>
        Si è verificato un errore
      </h1>
      <p style={{ color: "#64748b", marginBottom: 24, maxWidth: 400 }}>
        {error.message || "Errore imprevisto. Riprova più tardi."}
      </p>
      <button
        className="btn btnPrimary"
        onClick={reset}
        aria-label="Riprova"
      >
        Riprova
      </button>
    </div>
  );
}
