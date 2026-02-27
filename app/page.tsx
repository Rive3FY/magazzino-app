export default function Home() {
  return (
    <main style={{ padding: 40, fontFamily: "system-ui" }}>
      <h1>Gestionale Magazzino</h1>
      <p>Import Excel → Movimenti → Giacenze</p>

      <div style={{ marginTop: 20, display: "flex", gap: 15, flexWrap: "wrap" }}>
        <a href="/import">📥 Import Excel</a>
        <a href="/movimenti">➕/➖ Movimenti</a>
        <a href="/giacenze">📦 Giacenze</a>
      </div>
    </main>
  );
}