export default function Home() {
  const shell: React.CSSProperties = {
    display: "grid",
    gap: 18,
  };

  const hero: React.CSSProperties = {
    borderRadius: 28,
    padding: 22,
    border: "1px solid rgba(255,255,255,0.14)",
    background: "rgba(255,255,255,0.06)",
    boxShadow: "0 18px 50px rgba(0,0,0,0.22)",
    backdropFilter: "blur(12px)",
  };

  const grid: React.CSSProperties = {
    display: "grid",
    gridTemplateColumns: "repeat(12, 1fr)",
    gap: 14,
  };

  const cardBase: React.CSSProperties = {
    borderRadius: 22,
    padding: 18,
    textDecoration: "none",
    display: "block",
    border: "1px solid rgba(255,255,255,0.14)",
    background: "rgba(255,255,255,0.06)",
    boxShadow: "0 14px 34px rgba(0,0,0,0.18)",
    backdropFilter: "blur(12px)",
    color: "rgba(255,255,255,0.92)",
  };

  const cardTitle: React.CSSProperties = {
    fontWeight: 900,
    fontSize: 18,
    letterSpacing: -0.2,
    margin: 0,
  };

  const cardDesc: React.CSSProperties = {
    margin: "8px 0 0",
    fontSize: 13,
    opacity: 0.82,
    lineHeight: 1.35,
  };

  const pill: React.CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    padding: "8px 10px",
    borderRadius: 999,
    border: "1px solid rgba(255,255,255,0.14)",
    background: "rgba(255,255,255,0.06)",
    fontSize: 13,
    fontWeight: 800,
    color: "rgba(255,255,255,0.92)",
    textDecoration: "none",
  };

  const arrowBox: React.CSSProperties = {
    width: 44,
    height: 44,
    borderRadius: 16,
    border: "1px solid rgba(255,255,255,0.14)",
    background: "rgba(255,255,255,0.06)",
    display: "grid",
    placeItems: "center",
    fontWeight: 900,
    color: "rgba(255,255,255,0.9)",
  };

  const subtle: React.CSSProperties = {
    color: "rgba(255,255,255,0.72)",
    fontSize: 13,
    margin: 0,
    lineHeight: 1.4,
  };

  return (
    <div style={shell}>
      {/* HERO */}
      <section style={hero}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 14, flexWrap: "wrap" }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 30, letterSpacing: -0.6, fontWeight: 950 }}>
              Gestionale Magazzino
            </h1>
            <p style={{ margin: "10px 0 0", ...subtle }}>
              Movimenti, giacenze e import dati. Interfaccia ottimizzata per smartphone in magazzino.
            </p>
          </div>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "flex-end" }}>
            <a href="/movimenti" style={pill}>⚡ Prelievo veloce</a>
            <a href="/movimenti" style={pill}>➕ Entrata veloce</a>
          </div>
        </div>

        {/* Mini stats / hint */}
        <div
          style={{
            marginTop: 14,
            display: "grid",
            gap: 10,
            gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
          }}
        >
          <div style={{ ...miniCard, borderColor: "rgba(96,165,250,0.25)" }}>
            <div style={{ fontSize: 12, opacity: 0.72 }}>Scansione</div>
            <div style={{ fontWeight: 900, marginTop: 3 }}>📷 Barcode da telefono</div>
          </div>
          <div style={{ ...miniCard, borderColor: "rgba(167,139,250,0.25)" }}>
            <div style={{ fontSize: 12, opacity: 0.72 }}>Sicurezza</div>
            <div style={{ fontWeight: 900, marginTop: 3 }}>🔒 Delete solo Admin</div>
          </div>
          <div style={{ ...miniCard, borderColor: "rgba(255,255,255,0.18)" }}>
            <div style={{ fontSize: 12, opacity: 0.72 }}>Dati</div>
            <div style={{ fontWeight: 900, marginTop: 3 }}>📥 Import da Excel</div>
          </div>
        </div>
      </section>

      {/* DASHBOARD */}
      <section style={grid}>
        {/* Movimenti */}
        <a
          href="/movimenti"
          style={{
            ...cardBase,
            gridColumn: "span 12",
            background:
              "linear-gradient(135deg, rgba(96,165,250,0.18), rgba(255,255,255,0.06))",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
            <div>
              <h2 style={cardTitle}>➕/➖ Movimenti</h2>
              <p style={cardDesc}>
                Entrate/uscite, scansione barcode, quantità, note e storico.
              </p>
            </div>
            <div style={arrowBox}>→</div>
          </div>

          <div style={{ marginTop: 12, display: "flex", gap: 8, flexWrap: "wrap" }}>
            <span style={tag}>📷 Scansiona</span>
            <span style={tag}>➖ Prelievo</span>
            <span style={tag}>➕ Entrata</span>
            <span style={tag}>📜 Storico</span>
          </div>
        </a>

        {/* Giacenze */}
        <a
          href="/giacenze"
          style={{
            ...cardBase,
            gridColumn: "span 12",
            background:
              "linear-gradient(135deg, rgba(167,139,250,0.18), rgba(255,255,255,0.06))",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
            <div>
              <h2 style={cardTitle}>📦 Giacenze</h2>
              <p style={cardDesc}>
                Tabella completa, ricerca rapida, export e controllo disponibilità.
              </p>
            </div>
            <div style={arrowBox}>→</div>
          </div>

          <div style={{ marginTop: 12, display: "flex", gap: 8, flexWrap: "wrap" }}>
            <span style={tag}>🔎 Ricerca</span>
            <span style={tag}>📤 Export</span>
            <span style={tag}>🧮 Calcolo</span>
          </div>
        </a>

        {/* Import */}
        <a
          href="/import"
          style={{
            ...cardBase,
            gridColumn: "span 12",
            background:
              "linear-gradient(135deg, rgba(255,255,255,0.10), rgba(255,255,255,0.06))",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
            <div>
              <h2 style={cardTitle}>📥 Import</h2>
              <p style={cardDesc}>
                Carica anagrafica da Excel e aggiorna rapidamente i materiali.
              </p>
            </div>
            <div style={arrowBox}>→</div>
          </div>

          <div style={{ marginTop: 12, display: "flex", gap: 8, flexWrap: "wrap" }}>
            <span style={tag}>📄 Excel</span>
            <span style={tag}>✅ Validazione</span>
            <span style={tag}>⚙️ Setup</span>
          </div>
        </a>
      </section>

      {/* Help footer */}
      <section
        style={{
          borderRadius: 22,
          padding: 16,
          border: "1px solid rgba(255,255,255,0.12)",
          background: "rgba(255,255,255,0.04)",
          color: "rgba(255,255,255,0.8)",
          fontSize: 13,
        }}
      >
        💡 Suggerimento: in magazzino usa <b>Scansiona</b> → quantità → <b>Salva movimento</b>.
      </section>
    </div>
  );
}

const miniCard: React.CSSProperties = {
  borderRadius: 18,
  padding: 12,
  border: "1px solid rgba(255,255,255,0.12)",
  background: "rgba(255,255,255,0.04)",
};

const tag: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  padding: "6px 10px",
  borderRadius: 999,
  border: "1px solid rgba(255,255,255,0.14)",
  background: "rgba(255,255,255,0.06)",
  fontSize: 12,
  fontWeight: 800,
  opacity: 0.95,
};