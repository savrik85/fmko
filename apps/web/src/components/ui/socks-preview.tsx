export function SocksPreview({ color, trim, size = 64 }: { color: string; trim?: string; size?: number }) {
  // Štulpny — vysoké ponožky, horní pás v trim barvě
  const trimColor = trim || color;
  const single = (
    <>
      <path
        d="M25 5 L75 5 L72 70 L65 95 L35 95 L28 70 Z"
        fill={color}
        stroke="rgba(0,0,0,0.2)"
        strokeWidth="1"
        strokeLinejoin="round"
      />
      {/* Horní pás */}
      <rect x="25" y="5" width="50" height="18" fill={trimColor} />
      {/* Mid pás pokud trim */}
      {trim && trim !== color && (
        <rect x="28" y="30" width="44" height="3" fill={trimColor} />
      )}
      {/* Highlight */}
      <path
        d="M25 5 L75 5 L72 70 L65 95 L35 95 L28 70 Z"
        fill="none"
        stroke="rgba(255,255,255,0.35)"
        strokeWidth="0.8"
        strokeLinejoin="round"
      />
    </>
  );

  return (
    <svg width={size} height={size * 0.6} viewBox="0 0 220 100">
      {/* Levá ponožka */}
      <g transform="translate(5, 0)">{single}</g>
      {/* Pravá ponožka */}
      <g transform="translate(120, 0)">{single}</g>
    </svg>
  );
}
