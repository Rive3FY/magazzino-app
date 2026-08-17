"use client";

import AppModalFrame from "../../_components/AppModalFrame";
import { AppLoading } from "../../_components/AppSpinner";
import styles from "./MaterialSearchResultsModal.module.css";

export type MaterialSearchResult = {
  code: string;
  name: string;
  um: string | null;
  matchInfo?: string | null;
};

type Props = {
  open: boolean;
  query: string;
  results: MaterialSearchResult[];
  loading: boolean;
  maxResults: number;
  onSelect: (item: MaterialSearchResult) => void;
  onClose: () => void;
};

export default function MaterialSearchResultsModal({
  open,
  query,
  results,
  loading,
  maxResults,
  onSelect,
  onClose,
}: Props) {
  return (
    <AppModalFrame
      open={open}
      title="Risultati materiali"
      subtitle="Seleziona una voce per visualizzare quantità e posizione"
      onClose={onClose}
      width="min(1180px, calc(100vw - 24px))"
      bodyStyle={{ background: "#f8fafc", minHeight: "min(380px, 58vh)" }}
      headerRight={
        <button className="btn" type="button" onClick={onClose}>
          Chiudi
        </button>
      }
    >
      <div className={styles.summary}>
        <div className={styles.queryBlock}>
          <div className={styles.queryLabel}>Ricerca</div>
          <div className={styles.queryValue}>{query}</div>
        </div>
        <div className={styles.count}>{loading ? "…" : `${results.length} risultati`}</div>
      </div>

      {loading ? (
        <div className={styles.state}><AppLoading label="Ricerca dei materiali in corso…" /></div>
      ) : results.length === 0 ? (
        <div className={styles.state}>
          <div style={{ fontWeight: 900, color: "#334155" }}>Nessun materiale trovato</div>
          <div style={{ marginTop: 5, fontSize: 13 }}>Prova una misura o una descrizione diversa.</div>
        </div>
      ) : (
        <div className={styles.list}>
          {results.map((item) => (
            <button
              key={item.code}
              type="button"
              className={styles.result}
              onClick={() => onSelect(item)}
            >
              <span className={styles.code}>{item.code}</span>
              <span className={styles.content}>
                <span className={styles.description}>{item.name}</span>
                <span className={styles.meta}>
                  <span>UM: {item.um || "—"}</span>
                  {item.matchInfo ? <span className={styles.location}>{item.matchInfo}</span> : null}
                </span>
              </span>
              <span className={styles.arrow} aria-hidden="true">›</span>
            </button>
          ))}

          {results.length >= maxResults ? (
            <div className={styles.limitNotice}>
              Sono mostrati i primi {maxResults} risultati. Aggiungi altri dettagli per restringere la ricerca.
            </div>
          ) : null}
        </div>
      )}
    </AppModalFrame>
  );
}
