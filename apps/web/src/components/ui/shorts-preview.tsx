export function ShortsPreview({ color, trim, size = 64 }: { color: string; trim?: string; size?: number }) {
  // Trenýrky — jednoduchý tvar s páskem v pase + postranní pruh v trim barvě
  const trimColor = trim || color;
  return (
    <svg width={size} height={size} viewBox="0 0 100 80">
      {/* Main body */}
      <path
        d="M10 5 L90 5 L92 30 L85 70 L60 72 L52 35 L48 35 L40 72 L15 70 L8 30 Z"
        fill={color}
        stroke="rgba(0,0,0,0.2)"
        strokeWidth="1"
        strokeLinejoin="round"
      />
      {/* Pásek v pase */}
      <rect x="10" y="5" width="80" height="6" fill={trimColor} opacity="0.7" />
      {/* Postranní pruh — jen pokud se liší trim */}
      {trim && trim !== color && (
        <>
          <path d="M12 12 L15 65 L18 65 L15 12 Z" fill={trimColor} />
          <path d="M88 12 L85 65 L82 65 L85 12 Z" fill={trimColor} />
        </>
      )}
      {/* Shadow */}
      <path
        d="M10 5 L90 5 L92 30 L85 70 L60 72 L52 35 L48 35 L40 72 L15 70 L8 30 Z"
        fill="none"
        stroke="rgba(255,255,255,0.4)"
        strokeWidth="0.8"
        strokeLinejoin="round"
      />
    </svg>
  );
}
