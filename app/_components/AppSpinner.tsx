import type { CSSProperties, ReactNode } from "react";

const BARS = Array.from({ length: 12 }, (_, i) => i);

export default function AppSpinner({
  size = 20,
  style,
  className,
}: {
  size?: number;
  style?: CSSProperties;
  className?: string;
}) {
  return (
    <span
      className={className ? `appSpinner ${className}` : "appSpinner"}
      style={{ width: size, height: size, ...style }}
      aria-hidden="true"
    >
      {BARS.map((i) => (
        <span key={i} />
      ))}
    </span>
  );
}

/** Etichetta per pulsanti con operazione in corso: mostra lo spinner accanto al testo. */
export function AppBusyLabel({
  busy,
  size = 15,
  children,
}: {
  busy: boolean;
  size?: number;
  children: ReactNode;
}) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
      {busy ? <AppSpinner size={size} /> : null}
      {children}
    </span>
  );
}

/** Placeholder di caricamento: spinner + testo, da usare al posto dei "Caricamento…" statici. */
export function AppLoading({
  label = "Caricamento…",
  size = 22,
  align = "center",
  style,
}: {
  label?: string | null;
  size?: number;
  align?: "start" | "center";
  style?: CSSProperties;
}) {
  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: align === "center" ? "center" : "flex-start",
        gap: 10,
        color: "var(--muted, #64748b)",
        fontWeight: 700,
        ...style,
      }}
    >
      <AppSpinner size={size} />
      {label ? <span>{label}</span> : null}
    </div>
  );
}
