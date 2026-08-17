/** Simbolo attrezzature: chiave inglese e martello incrociati. */
export default function EquipmentToolsIcon({
  size = 20,
  className,
}: {
  size?: number;
  className?: string;
}) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <path d="M7.4 4.7A2.5 2.5 0 1 1 4.7 7.4" strokeWidth="2.2" />
      <path d="M9.1 9.1 17.4 17.4" />
      <path d="M6.6 17.4 15.2 8.8" />
      <rect
        x="13"
        y="5.7"
        width="7.6"
        height="3"
        rx="1.1"
        fill="currentColor"
        stroke="none"
        transform="rotate(45 16.8 7.2)"
      />
    </svg>
  );
}
