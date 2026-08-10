export function composePickupNote(destination: string, workDescription: string) {
  const dest = destination.trim();
  const desc = workDescription.trim();
  return [
    dest ? `Destinazione: ${dest}` : "",
    desc ? `Descrizione lavori: ${desc}` : "",
  ]
    .filter(Boolean)
    .join(" · ");
}

export function parsePickupNote(note: string) {
  const destinationPrefix = "Destinazione:";
  const workPrefix = "Descrizione lavori:";
  const parts = String(note ?? "")
    .split(" · ")
    .map((part) => part.trim());
  const destination =
    parts.find((part) => part.startsWith(destinationPrefix))?.slice(destinationPrefix.length).trim() ?? "";
  const workDescription =
    parts.find((part) => part.startsWith(workPrefix))?.slice(workPrefix.length).trim() ?? "";

  return {
    destination,
    workDescription: workDescription || (!destination ? String(note ?? "").trim() : ""),
  };
}
