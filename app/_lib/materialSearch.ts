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
