"use client";

// Lightweight isometrický náhled stadionu — bez three.js
// Barvy se ladí podle klubu, detail podle facilities levelu

interface StadiumPreviewProps {
  primary: string;
  secondary: string;
  standsLevel?: number;
  pitchType?: string;
  width?: number;
  height?: number;
}

function darken(hex: string, amount = 0.25): string {
  const c = hex.replace("#", "");
  const r = Math.max(0, parseInt(c.substring(0, 2), 16) - Math.floor(255 * amount));
  const g = Math.max(0, parseInt(c.substring(2, 4), 16) - Math.floor(255 * amount));
  const b = Math.max(0, parseInt(c.substring(4, 6), 16) - Math.floor(255 * amount));
  return "#" + [r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("");
}

export function StadiumPreview({ primary, secondary, standsLevel = 1, pitchType = "natural", width = 320, height = 180 }: StadiumPreviewProps) {
  const primaryDark = darken(primary, 0.3);
  const pitchGreen = pitchType === "synthetic" ? "#4A8B3C" : "#3E7A2E";
  const pitchLine = "rgba(255,255,255,0.9)";
  const grassStripe = pitchType === "synthetic" ? "#548E3E" : "#487030";

  // Isometric transform: rotace 30° kolem X, pak 0° Y
  // SVG skew simuluje
  return (
    <svg viewBox="0 0 320 180" width={width} height={height} style={{ display: "block" }}>
      <defs>
        <linearGradient id="sp-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#B8DCEC" />
          <stop offset="100%" stopColor="#E8F2F8" />
        </linearGradient>
        <linearGradient id="sp-ground" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#9BAE7C" />
          <stop offset="100%" stopColor="#8AA06A" />
        </linearGradient>
        <pattern id="sp-grass" width="10" height="180" patternUnits="userSpaceOnUse">
          <rect width="5" height="180" fill={pitchGreen} />
          <rect x="5" width="5" height="180" fill={grassStripe} />
        </pattern>
      </defs>

      {/* Sky */}
      <rect width="320" height="90" fill="url(#sp-sky)" />
      {/* Ground */}
      <rect y="90" width="320" height="90" fill="url(#sp-ground)" />

      {/* Pitch — isometric parallelogram */}
      <g transform="translate(160 120) skewX(-30) scale(1 0.55) translate(-90 -50)">
        {/* Pitch field */}
        <rect x="0" y="0" width="180" height="100" fill="url(#sp-grass)" stroke={pitchLine} strokeWidth="1.2" />
        {/* Center line */}
        <line x1="90" y1="0" x2="90" y2="100" stroke={pitchLine} strokeWidth="1" />
        {/* Center circle */}
        <circle cx="90" cy="50" r="18" fill="none" stroke={pitchLine} strokeWidth="1" />
        {/* Penalty boxes */}
        <rect x="0" y="28" width="22" height="44" fill="none" stroke={pitchLine} strokeWidth="1" />
        <rect x="158" y="28" width="22" height="44" fill="none" stroke={pitchLine} strokeWidth="1" />
        {/* Goal boxes */}
        <rect x="0" y="40" width="8" height="20" fill="none" stroke={pitchLine} strokeWidth="1" />
        <rect x="172" y="40" width="8" height="20" fill="none" stroke={pitchLine} strokeWidth="1" />
      </g>

      {/* Stands — severní (horní) */}
      {standsLevel >= 1 && (
        <g>
          <polygon points="70,75 250,75 270,60 50,60" fill={primary} stroke={primaryDark} strokeWidth="1" />
          <polygon points="70,75 250,75 255,82 65,82" fill={primaryDark} />
          {/* Seats detail */}
          <line x1="60" y1="67" x2="260" y2="67" stroke={secondary} strokeWidth="0.5" opacity="0.7" />
        </g>
      )}
      {/* Stands — jižní (dolní, přední) */}
      {standsLevel >= 1 && (
        <g>
          <polygon points="70,145 250,145 275,160 45,160" fill={primary} stroke={primaryDark} strokeWidth="1" />
          <polygon points="70,145 250,145 250,140 70,140" fill={primaryDark} />
          <line x1="55" y1="152" x2="265" y2="152" stroke={secondary} strokeWidth="0.5" opacity="0.7" />
        </g>
      )}
      {/* Boční tribuny pro level 2+ */}
      {standsLevel >= 2 && (
        <>
          <polygon points="30,85 50,60 50,160 30,165" fill={primaryDark} stroke={primaryDark} strokeWidth="1" />
          <polygon points="290,85 270,60 270,160 290,165" fill={primaryDark} stroke={primaryDark} strokeWidth="1" />
        </>
      )}
      {/* Flag (level 3+) */}
      {standsLevel >= 3 && (
        <g>
          <line x1="20" y1="40" x2="20" y2="75" stroke="#555" strokeWidth="1" />
          <polygon points="20,40 35,45 20,50" fill={primary} stroke={secondary} strokeWidth="0.5" />
        </g>
      )}
    </svg>
  );
}
