export type JerseyPattern = "solid" | "stripes" | "hoops" | "halves" | "sash" | "sleeves" | "chest_band" | "pinstripes" | "quarters" | "gradient";

export function JerseyPreview({ primary, secondary, pattern = "solid", size = 48, number }: {
  primary: string; secondary: string; pattern?: string; size?: number; number?: number | string;
}) {
  const p = (pattern || "solid") as JerseyPattern;
  const id = `j-${p}-${size}-${Math.random().toString(36).slice(2, 6)}`;
  const outline = "M70,30 L30,45 L5,75 L10,110 L40,95 L40,200 L160,200 L160,95 L190,110 L195,75 L170,45 L130,30 C120,18 110,12 100,12 C90,12 80,18 70,30Z";
  const leftSleeve = "M30,45 L5,75 L10,110 L40,95 L40,50Z";
  const rightSleeve = "M170,45 L195,75 L190,110 L160,95 L160,50Z";
  const neckCut = "M70,30 C80,18 90,12 100,12 C110,12 120,18 130,30 L120,38 C112,28 108,24 100,24 C92,24 88,28 80,38Z";

  const patternFill = p === "stripes" || p === "hoops" || p === "pinstripes" ? `url(#${id}-p)`
    : p === "gradient" ? `url(#${id}-g)` : primary;
  const numSize = size < 40 ? 42 : 54;

  return (
    <svg width={size} height={size * 1.1} viewBox="0 0 200 220">
      <defs>
        <clipPath id={`${id}-c`}><path d={outline} /></clipPath>
        {p === "stripes" && <pattern id={`${id}-p`} width="24" height="220" patternUnits="userSpaceOnUse"><rect width="12" height="220" fill={primary} /><rect x="12" width="12" height="220" fill={secondary} /></pattern>}
        {p === "hoops" && <pattern id={`${id}-p`} width="200" height="30" patternUnits="userSpaceOnUse"><rect width="200" height="15" fill={primary} /><rect y="15" width="200" height="15" fill={secondary} /></pattern>}
        {p === "pinstripes" && <pattern id={`${id}-p`} width="10" height="220" patternUnits="userSpaceOnUse"><rect width="8" height="220" fill={primary} /><rect x="8" width="2" height="220" fill={secondary} /></pattern>}
        {p === "gradient" && <linearGradient id={`${id}-g`} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={primary} /><stop offset="100%" stopColor={secondary} /></linearGradient>}
      </defs>
      <path d={outline} fill={patternFill} />
      {p === "sleeves" && <><path d={leftSleeve} fill={secondary} /><path d={rightSleeve} fill={secondary} /></>}
      <g clipPath={`url(#${id}-c)`}>
        {p === "halves" && <rect x="100" y="0" width="100" height="220" fill={secondary} />}
        {p === "sash" && <polygon points="40,30 130,30 200,180 200,220 110,220 0,60 0,30" fill={secondary} opacity="0.85" />}
        {p === "quarters" && <><rect x="100" y="30" width="100" height="85" fill={secondary} /><rect x="0" y="115" width="100" height="105" fill={secondary} /></>}
        {p === "chest_band" && <rect x="0" y="80" width="200" height="30" fill={secondary} />}
      </g>
      <path d={neckCut} fill={secondary} />
      <path d={outline} fill="none" stroke="rgba(255,255,255,0.6)" strokeWidth="4" strokeLinejoin="round" />
      <path d={outline} fill="none" stroke="rgba(0,0,0,0.2)" strokeWidth="2" strokeLinejoin="round" />
      {number != null && (
        <text x="100" y="155" textAnchor="middle" fontSize={numSize} fontWeight="bold"
          fill="white" stroke="rgba(0,0,0,0.9)" strokeWidth="5" strokeLinejoin="round" paintOrder="stroke"
          fontFamily="var(--font-heading)">{number}</text>
      )}
    </svg>
  );
}
