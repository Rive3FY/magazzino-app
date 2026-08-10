"use client";

import { useMemo, useState } from "react";
import { Sora, Source_Sans_3 } from "next/font/google";

const sora = Sora({ subsets: ["latin"], weight: ["500", "600", "700"], variable: "--rs-display" });
const sourceSans = Source_Sans_3({ subsets: ["latin"], weight: ["400", "500", "600", "700"], variable: "--rs-body" });

type Screen = "hub" | "dashboard" | "movimenti" | "etichette";

const SCREENS: { id: Screen; label: string }[] = [
  { id: "hub", label: "Hub" },
  { id: "dashboard", label: "Dashboard" },
  { id: "movimenti", label: "Movimenti" },
  { id: "etichette", label: "Etichette" },
];

export default function RestylingPreviewPage() {
  const [screen, setScreen] = useState<Screen>("hub");
  const year = useMemo(() => new Date().getFullYear(), []);

  return (
    <div className={`${sora.variable} ${sourceSans.variable} rsRoot`}>
      <style jsx global>{`
        .rsRoot {
          --ink: #0b1424;
          --ink-soft: #243247;
          --paper: #f2f5f8;
          --paper-2: #e7edf3;
          --line: rgba(11, 20, 36, 0.12);
          --brand: #295eb9;
          --brand-deep: #1e4a96;
          --ok: #1f7a4c;
          --warn: #a15c12;
          --white: #ffffff;
          min-height: 100vh;
          background:
            radial-gradient(1000px 480px at 12% -10%, rgba(41, 94, 185, 0.16), transparent 60%),
            radial-gradient(900px 420px at 90% 0%, rgba(36, 50, 71, 0.08), transparent 55%),
            linear-gradient(180deg, #eef3f8 0%, var(--paper) 42%, #e9eef4 100%);
          color: var(--ink);
          font-family: var(--rs-body), "Segoe UI", sans-serif;
        }
        .rsRoot * { box-sizing: border-box; }
        .rsShell {
          max-width: 1220px;
          margin: 0 auto;
          padding: 28px 20px 48px;
        }
        .rsTop {
          display: flex;
          justify-content: space-between;
          gap: 16px;
          align-items: flex-end;
          margin-bottom: 22px;
          flex-wrap: wrap;
        }
        .rsEyebrow {
          font-size: 12px;
          letter-spacing: 0.14em;
          text-transform: uppercase;
          color: var(--brand-deep);
          font-weight: 700;
          margin-bottom: 8px;
        }
        .rsTitle {
          font-family: var(--rs-display), sans-serif;
          font-size: clamp(28px, 4vw, 40px);
          line-height: 1.05;
          margin: 0;
          letter-spacing: -0.03em;
        }
        .rsLead {
          margin: 10px 0 0;
          max-width: 520px;
          color: var(--ink-soft);
          font-size: 15px;
          line-height: 1.45;
        }
        .rsTabs {
          display: flex;
          gap: 8px;
          flex-wrap: wrap;
          background: rgba(255,255,255,0.55);
          border: 1px solid var(--line);
          padding: 6px;
          border-radius: 14px;
          backdrop-filter: blur(8px);
        }
        .rsTab {
          border: 0;
          background: transparent;
          color: var(--ink-soft);
          font: inherit;
          font-weight: 600;
          font-size: 13px;
          padding: 10px 14px;
          border-radius: 10px;
          cursor: pointer;
        }
        .rsTabActive {
          background: var(--ink);
          color: white;
        }
        .rsStage {
          border: 1px solid var(--line);
          border-radius: 22px;
          overflow: hidden;
          background: var(--white);
          min-height: 680px;
          box-shadow: 0 18px 50px rgba(11, 20, 36, 0.08);
          animation: rsIn 420ms ease both;
        }
        @keyframes rsIn {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .rsApp {
          display: grid;
          grid-template-columns: 232px 1fr;
          min-height: 680px;
        }
        .rsSide {
          background:
            linear-gradient(165deg, #0b1424 0%, #12233d 58%, #16305a 100%);
          color: white;
          padding: 22px 16px;
          display: flex;
          flex-direction: column;
          gap: 18px;
        }
        .rsBrand {
          display: flex;
          flex-direction: column;
          gap: 4px;
          padding: 4px 8px 12px;
          border-bottom: 1px solid rgba(255,255,255,0.12);
        }
        .rsBrandName {
          font-family: var(--rs-display), sans-serif;
          font-size: 22px;
          font-weight: 700;
          letter-spacing: -0.03em;
        }
        .rsBrandSub {
          font-size: 12px;
          opacity: 0.7;
        }
        .rsNavItem {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 11px 12px;
          border-radius: 12px;
          font-size: 14px;
          font-weight: 600;
          color: rgba(255,255,255,0.72);
        }
        .rsNavItemActive {
          background: rgba(41, 94, 185, 0.35);
          color: white;
          outline: 1px solid rgba(255,255,255,0.14);
        }
        .rsDot {
          width: 8px;
          height: 8px;
          border-radius: 2px;
          background: currentColor;
          opacity: 0.85;
        }
        .rsMain {
          background:
            linear-gradient(180deg, rgba(41,94,185,0.04), transparent 120px),
            repeating-linear-gradient(
              90deg,
              transparent,
              transparent 23px,
              rgba(11,20,36,0.025) 23px,
              rgba(11,20,36,0.025) 24px
            ),
            repeating-linear-gradient(
              0deg,
              transparent,
              transparent 23px,
              rgba(11,20,36,0.025) 23px,
              rgba(11,20,36,0.025) 24px
            ),
            var(--paper);
          padding: 22px;
        }
        .rsBar {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 12px;
          margin-bottom: 18px;
        }
        .rsBar h2 {
          margin: 0;
          font-family: var(--rs-display), sans-serif;
          font-size: 24px;
          letter-spacing: -0.03em;
        }
        .rsBarHint {
          color: var(--ink-soft);
          font-size: 13px;
          margin-top: 4px;
        }
        .rsChip {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          background: white;
          border: 1px solid var(--line);
          border-radius: 999px;
          padding: 8px 12px;
          font-size: 12px;
          font-weight: 600;
        }
        .rsStatus {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          background: var(--ok);
        }
        .rsGrid2 {
          display: grid;
          grid-template-columns: 1.4fr 1fr;
          gap: 14px;
        }
        .rsGrid3 {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 12px;
        }
        .rsPanel {
          background: rgba(255,255,255,0.86);
          border: 1px solid var(--line);
          border-radius: 16px;
          padding: 16px;
          backdrop-filter: blur(4px);
        }
        .rsPanelTitle {
          font-family: var(--rs-display), sans-serif;
          font-size: 15px;
          font-weight: 700;
          margin: 0 0 4px;
        }
        .rsMuted {
          color: var(--ink-soft);
          font-size: 12px;
          margin: 0 0 14px;
        }
        .rsSearchRow {
          display: flex;
          gap: 8px;
        }
        .rsInput {
          flex: 1;
          border: 1px solid var(--line);
          background: white;
          border-radius: 12px;
          padding: 12px 14px;
          font: inherit;
          font-size: 14px;
          color: var(--ink);
        }
        .rsBtn {
          border: 0;
          border-radius: 12px;
          padding: 12px 14px;
          font: inherit;
          font-weight: 700;
          font-size: 13px;
          cursor: default;
        }
        .rsBtnPrimary {
          background: var(--brand);
          color: white;
        }
        .rsBtnGhost {
          background: white;
          color: var(--ink);
          border: 1px solid var(--line);
        }
        .rsStat {
          padding: 14px;
          border-radius: 14px;
          background: linear-gradient(160deg, #ffffff, #f5f8fc);
          border: 1px solid var(--line);
        }
        .rsStatLabel {
          font-size: 11px;
          text-transform: uppercase;
          letter-spacing: 0.08em;
          color: var(--ink-soft);
          font-weight: 700;
        }
        .rsStatValue {
          margin-top: 8px;
          font-family: var(--rs-display), sans-serif;
          font-size: 30px;
          letter-spacing: -0.04em;
          font-weight: 700;
        }
        .rsStatMeta {
          margin-top: 6px;
          font-size: 12px;
          color: var(--ink-soft);
        }
        .rsTable {
          width: 100%;
          border-collapse: collapse;
          font-size: 13px;
        }
        .rsTable th {
          text-align: left;
          font-size: 11px;
          letter-spacing: 0.06em;
          text-transform: uppercase;
          color: var(--ink-soft);
          padding: 10px 8px;
          border-bottom: 1px solid var(--line);
        }
        .rsTable td {
          padding: 12px 8px;
          border-bottom: 1px solid rgba(11,20,36,0.06);
        }
        .rsBadge {
          display: inline-flex;
          padding: 3px 8px;
          border-radius: 999px;
          font-size: 11px;
          font-weight: 700;
        }
        .rsBadgeOut { background: #fee2e2; color: #991b1b; }
        .rsBadgeOk { background: #dcfce7; color: #166534; }
        .rsHub {
          padding: 28px;
          min-height: 680px;
          background:
            radial-gradient(700px 320px at 20% 0%, rgba(41,94,185,0.18), transparent 60%),
            linear-gradient(180deg, #0b1424 0%, #12233d 100%);
          color: white;
          display: grid;
          align-content: start;
          gap: 28px;
        }
        .rsHubBrand {
          font-family: var(--rs-display), sans-serif;
          font-size: clamp(40px, 7vw, 64px);
          letter-spacing: -0.045em;
          line-height: 0.95;
          margin: 0;
        }
        .rsHubLead {
          max-width: 460px;
          color: rgba(255,255,255,0.72);
          font-size: 16px;
          line-height: 1.5;
          margin: 0;
        }
        .rsHubActions {
          display: flex;
          gap: 10px;
          flex-wrap: wrap;
        }
        .rsHubCardGrid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 14px;
          margin-top: 8px;
        }
        .rsHubCard {
          border: 1px solid rgba(255,255,255,0.14);
          background: rgba(255,255,255,0.06);
          border-radius: 18px;
          padding: 18px;
          min-height: 180px;
          display: flex;
          flex-direction: column;
          justify-content: space-between;
          transition: transform 220ms ease, background 220ms ease;
        }
        .rsHubCard:hover {
          transform: translateY(-3px);
          background: rgba(255,255,255,0.1);
        }
        .rsHubCardTitle {
          font-family: var(--rs-display), sans-serif;
          font-size: 26px;
          letter-spacing: -0.03em;
          margin: 0;
        }
        .rsHubCardText {
          margin: 8px 0 0;
          color: rgba(255,255,255,0.7);
          font-size: 14px;
          line-height: 1.4;
        }
        .rsLabelMock {
          width: min(100%, 520px);
          margin: 18px auto 0;
          border: 1px solid #111;
          background: white;
          display: grid;
          grid-template-columns: 1fr 92px;
          min-height: 168px;
          animation: rsIn 500ms ease both;
        }
        .rsLabelLeft {
          border-right: 1px solid #111;
        }
        .rsLabelBrand {
          border-bottom: 1px solid #111;
          padding: 10px 12px;
        }
        .rsLabelBrand span {
          display: block;
          font-size: 10px;
          margin-top: 4px;
        }
        .rsLabelRow {
          display: grid;
          grid-template-columns: 42% 1fr;
          border-bottom: 1px solid #111;
          font-size: 11px;
        }
        .rsLabelRow:last-child { border-bottom: 0; }
        .rsLabelRow b {
          border-right: 1px solid #111;
          padding: 7px 10px;
          font-weight: 600;
        }
        .rsLabelRow span { padding: 7px 10px; }
        .rsQr {
          display: grid;
          place-items: center;
          background:
            linear-gradient(#111 0 0) 0 0 / 28% 28%,
            linear-gradient(#111 0 0) 100% 0 / 28% 28%,
            linear-gradient(#111 0 0) 0 100% / 28% 28%,
            linear-gradient(#111 0 0) 72% 72% / 12% 12%,
            white;
          background-repeat: no-repeat;
          margin: 12px;
          width: 68px;
          height: 68px;
          border: 1px solid #111;
        }
        .rsNote {
          margin-top: 16px;
          color: var(--ink-soft);
          font-size: 13px;
          line-height: 1.45;
        }
        .rsFooter {
          margin-top: 18px;
          font-size: 12px;
          color: var(--ink-soft);
        }
        @media (max-width: 900px) {
          .rsApp { grid-template-columns: 1fr; }
          .rsSide { display: none; }
          .rsGrid2, .rsGrid3, .rsHubCardGrid { grid-template-columns: 1fr; }
        }
      `}</style>

      <div className="rsShell">
        <div className="rsTop">
          <div>
            <div className="rsEyebrow">Preview concept · non applicata</div>
            <h1 className="rsTitle">Restyling “Terna Grid Ops”</h1>
            <p className="rsLead">
              Direzione visuale più industriale e brand-led: blu Terna, tipografia espressiva,
              atmosfera a griglia, meno look generico “dashboard SaaS”. Solo anteprima.
            </p>
          </div>
          <div className="rsTabs" role="tablist" aria-label="Schermate preview">
            {SCREENS.map((s) => (
              <button
                key={s.id}
                type="button"
                className={`rsTab ${screen === s.id ? "rsTabActive" : ""}`}
                onClick={() => setScreen(s.id)}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>

        <div className="rsStage" key={screen}>
          {screen === "hub" ? (
            <div className="rsHub">
              <div>
                <div className="rsEyebrow" style={{ color: "rgba(255,255,255,0.55)" }}>Gestionale Magazzino</div>
                <h2 className="rsHubBrand">Terna</h2>
                <p className="rsHubLead">
                  Un hub netto: brand in primo piano, poi una sola scelta chiara tra Materiali e Attrezzature.
                </p>
              </div>
              <div className="rsHubActions">
                <button type="button" className="rsBtn rsBtnPrimary">Entra in Materiali</button>
                <button type="button" className="rsBtn rsBtnGhost" style={{ background: "transparent", color: "white", borderColor: "rgba(255,255,255,0.25)" }}>
                  Attrezzature
                </button>
              </div>
              <div className="rsHubCardGrid">
                <div className="rsHubCard">
                  <div>
                    <h3 className="rsHubCardTitle">Materiali</h3>
                    <p className="rsHubCardText">Dashboard, movimenti, scaffali, etichette definitive a08IO035RE.</p>
                  </div>
                  <div style={{ fontSize: 12, opacity: 0.7 }}>Apri modulo →</div>
                </div>
                <div className="rsHubCard">
                  <div>
                    <h3 className="rsHubCardTitle">Attrezzature</h3>
                    <p className="rsHubCardText">Linee e Stazioni, manutezioni, registri e assegnazioni.</p>
                  </div>
                  <div style={{ fontSize: 12, opacity: 0.7 }}>Scegli area →</div>
                </div>
              </div>
            </div>
          ) : (
            <div className="rsApp">
              <aside className="rsSide">
                <div className="rsBrand">
                  <div className="rsBrandName">Terna</div>
                  <div className="rsBrandSub">Magazzino operativo</div>
                </div>
                {["Dashboard", "Movimenti", "Giacenze", "Scaffali", "Etichette"].map((item) => (
                  <div
                    key={item}
                    className={`rsNavItem ${
                      (screen === "dashboard" && item === "Dashboard") ||
                      (screen === "movimenti" && item === "Movimenti") ||
                      (screen === "etichette" && item === "Etichette")
                        ? "rsNavItemActive"
                        : ""
                    }`}
                  >
                    <span className="rsDot" />
                    {item}
                  </div>
                ))}
              </aside>

              <section className="rsMain">
                {screen === "dashboard" && (
                  <>
                    <div className="rsBar">
                      <div>
                        <h2>Controllo materiale</h2>
                        <div className="rsBarHint">Ricerca testo + QR, quantità PRM/REALE subito visibili.</div>
                      </div>
                      <div className="rsChip"><span className="rsStatus" /> Online · {year}</div>
                    </div>
                    <div className="rsGrid2">
                      <div className="rsPanel">
                        <h3 className="rsPanelTitle">Trova materiale</h3>
                        <p className="rsMuted">Digita codice/descrizione oppure scansiona il QR.</p>
                        <div className="rsSearchRow">
                          <input className="rsInput" readOnly value="11011182 — Giunto comp esag..." />
                          <button type="button" className="rsBtn rsBtnPrimary">QR</button>
                        </div>
                      </div>
                      <div className="rsPanel">
                        <h3 className="rsPanelTitle">Oggi</h3>
                        <p className="rsMuted">Sintesi operativa del turno.</p>
                        <div className="rsGrid3" style={{ gridTemplateColumns: "1fr 1fr" }}>
                          <div className="rsStat">
                            <div className="rsStatLabel">Movimenti</div>
                            <div className="rsStatValue">18</div>
                          </div>
                          <div className="rsStat">
                            <div className="rsStatLabel">Aperti</div>
                            <div className="rsStatValue">4</div>
                          </div>
                        </div>
                      </div>
                    </div>
                    <div className="rsGrid3" style={{ marginTop: 14 }}>
                      <div className="rsStat">
                        <div className="rsStatLabel">Codice</div>
                        <div className="rsStatValue" style={{ fontSize: 22 }}>11011182</div>
                        <div className="rsStatMeta">Giunto comp esag...</div>
                      </div>
                      <div className="rsStat">
                        <div className="rsStatLabel">PRM</div>
                        <div className="rsStatValue">42</div>
                        <div className="rsStatMeta">Scaffale A1 · Zona Nord</div>
                      </div>
                      <div className="rsStat">
                        <div className="rsStatLabel">REALE</div>
                        <div className="rsStatValue">7</div>
                        <div className="rsStatMeta">Scaffale B3 · Corsia 2</div>
                      </div>
                    </div>
                  </>
                )}

                {screen === "movimenti" && (
                  <>
                    <div className="rsBar">
                      <div>
                        <h2>Movimenti</h2>
                        <div className="rsBarHint">Flusso più leggibile: stato, magazzino e quantità in evidenza.</div>
                      </div>
                      <button type="button" className="rsBtn rsBtnPrimary">Nuovo prelievo</button>
                    </div>
                    <div className="rsPanel">
                      <table className="rsTable">
                        <thead>
                          <tr>
                            <th>Data</th>
                            <th>Codice</th>
                            <th>Tipo</th>
                            <th>Qty</th>
                            <th>Stato</th>
                          </tr>
                        </thead>
                        <tbody>
                          <tr>
                            <td>10/08 18:40</td>
                            <td style={{ fontWeight: 700 }}>11011182</td>
                            <td>OUT</td>
                            <td>3</td>
                            <td><span className="rsBadge rsBadgeOut">Aperto</span></td>
                          </tr>
                          <tr>
                            <td>10/08 17:12</td>
                            <td style={{ fontWeight: 700 }}>22044810</td>
                            <td>OUT</td>
                            <td>1</td>
                            <td><span className="rsBadge rsBadgeOk">Chiuso</span></td>
                          </tr>
                          <tr>
                            <td>10/08 16:03</td>
                            <td style={{ fontWeight: 700 }}>33011990</td>
                            <td>IN</td>
                            <td>12</td>
                            <td><span className="rsBadge rsBadgeOk">Chiuso</span></td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </>
                )}

                {screen === "etichette" && (
                  <>
                    <div className="rsBar">
                      <div>
                        <h2>Etichette definitive</h2>
                        <div className="rsBarHint">Solo modulo a08IO035RE, con QR integrato a destra.</div>
                      </div>
                      <button type="button" className="rsBtn rsBtnPrimary">Stampa selezione</button>
                    </div>
                    <div className="rsPanel">
                      <h3 className="rsPanelTitle">Anteprima etichetta</h3>
                      <p className="rsMuted">Layout landscape ispirato al modulo ufficiale, più pulito in stampa.</p>
                      <div className="rsLabelMock">
                        <div className="rsLabelLeft">
                          <div className="rsLabelBrand">
                            <strong style={{ color: "#295eb9" }}>Terna</strong>
                            <span>a08IO035RE Modulo per etichettatura materiale</span>
                          </div>
                          {[
                            ["Codice Materiale SAP", "11011182"],
                            ["Descrizione Materiale", "Giunto comp esag cond all-acc 17,74 mm"],
                            ["Divisione SAP", "2606"],
                            ["Responsabile/Addetto", "ANDREA MONTEFUSCO"],
                          ].map(([k, v]) => (
                            <div className="rsLabelRow" key={k}>
                              <b>{k}</b>
                              <span>{v}</span>
                            </div>
                          ))}
                        </div>
                        <div className="rsQr" aria-hidden />
                      </div>
                    </div>
                  </>
                )}
              </section>
            </div>
          )}
        </div>

        <p className="rsNote">
          Questa è una bozza di direzione. Se ti convince, si può applicare step-by-step (hub → dashboard → movimenti → etichette)
          senza cambiare subito tutta l&apos;operatività.
        </p>
        <div className="rsFooter">Preview locale · /preview-restyling · © {year}</div>
      </div>
    </div>
  );
}
