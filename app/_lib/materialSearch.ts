/** Accetta anche stringhe tipo "11011182 — Descrizione materiale" (come dopo selezione). */
export function parseMaterialSearchInput(text: string) {
  const raw = String(text ?? "").trim();
  if (!raw) return { terms: [] as string[], exactCode: null as string | null };

  const labeled = raw.match(/^(\S+)\s*[—–\-]\s+(.+)$/);
  if (labeled) {
    const code = labeled[1].trim();
    const name = labeled[2].trim();
    return {
      terms: [code, name].filter(Boolean),
      exactCode: code || null,
    };
  }

  const firstToken = raw.split(/\s+/)[0] ?? "";
  const looksLikeCode = /^[A-Za-z0-9._/-]{3,}$/.test(firstToken) && firstToken.length <= 40;
  return {
    terms: [raw],
    exactCode: looksLikeCode && firstToken !== raw ? firstToken : (/^[A-Za-z0-9._/-]+$/.test(raw) ? raw : null),
  };
}

function normalizeMaterialSearchText(value: string) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("it")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * Restituisce prefissi brevi usati solo per recuperare candidati dal database.
 * Il controllo definitivo viene eseguito da matchesMaterialSearch.
 */
export function materialSearchProbeTerms(text: string) {
  const normalized = normalizeMaterialSearchText(text);
  return Array.from(
    new Set(
      normalized
        .split(/\s+/)
        .filter((token) => token.length >= 3)
        .map((token) => token.slice(0, 3))
    )
  );
}

/**
 * Cerca per parole intere o abbreviate senza modificare i dati importati.
 * "morse amarro" trova "mors amar" e viceversa; trattini e spazi sono equivalenti.
 */
export function matchesMaterialSearch(text: string, ...values: Array<string | null | undefined>) {
  const query = normalizeMaterialSearchText(text);
  if (!query) return true;

  const target = normalizeMaterialSearchText(values.filter(Boolean).join(" "));
  if (!target) return false;
  if (target.includes(query)) return true;

  const queryTokens = query.split(/\s+/).filter(Boolean);
  const targetTokens = target.split(/\s+/).filter(Boolean);

  return queryTokens.every((queryToken) =>
    targetTokens.some((targetToken) => {
      if (queryToken === targetToken) return true;
      if (queryToken.length < 3 || targetToken.length < 3) return false;
      return queryToken.startsWith(targetToken) || targetToken.startsWith(queryToken);
    })
  );
}
