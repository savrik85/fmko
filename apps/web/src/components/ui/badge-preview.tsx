"use client";

export type BadgePattern =
  | "shield" | "rounded_shield" | "crest" | "double_shield"
  | "circle" | "oval" | "square" | "diamond"
  | "hexagon" | "octagon" | "triangle" | "star"
  | "pennant" | "banner" | "chevron" | "arch";

// Special patterns rendered bez <path> elementu (použijí custom SVG elementy)
const SPECIAL = ["circle", "oval", "square"] as const;
type SpecialPattern = typeof SPECIAL[number];

// Hvězda 5-cípá — path s outer/inner vrcholy
function starPath(cx: number, cy: number, R: number, r: number, points = 5): string {
  const step = Math.PI / points;
  let p = `M`;
  for (let i = 0; i < points * 2; i++) {
    const radius = i % 2 === 0 ? R : r;
    const angle = i * step - Math.PI / 2;
    const x = cx + Math.cos(angle) * radius;
    const y = cy + Math.sin(angle) * radius;
    p += `${i === 0 ? "" : "L"}${x.toFixed(2)},${y.toFixed(2)} `;
  }
  return p + "Z";
}

function escapeXml(s: string): string {
  return s.replace(/[&<>"']/g, (ch) => (
    ch === "&" ? "&amp;" : ch === "<" ? "&lt;" : ch === ">" ? "&gt;" : ch === '"' ? "&quot;" : "&apos;"
  ));
}

function lumOf(hex: string): number {
  const c = hex.replace("#", "");
  const r = parseInt(c.substring(0, 2), 16);
  const g = parseInt(c.substring(2, 4), 16);
  const b = parseInt(c.substring(4, 6), 16);
  return (r * 299 + g * 587 + b * 114) / 1000;
}

// Barvy odvozené od primary/secondary — jeden zdroj pro SVG (profil) i canvas (3D vlajka)
function badgeColors(primary: string, secondary: string) {
  const primaryLight = lumOf(primary) > 200;
  const stroke = primaryLight && lumOf(secondary) > 200 ? "#bbb" : secondary;
  const textFill = primaryLight ? "#333" : "white";
  return { primaryLight, stroke, textFill };
}

// Path 'd' pro tvary se skutečným <path> (bez circle/oval/square) — sdíleno SVG i canvasem (Path2D)
export function badgeShapes(s: number): Record<Exclude<BadgePattern, SpecialPattern>, string> {
  const half = s / 2;
  return {
    shield: `M${half},${s * 0.05} L${s * 0.9},${s * 0.25} L${s * 0.9},${s * 0.6} Q${s * 0.9},${s * 0.85} ${half},${s * 0.95} Q${s * 0.1},${s * 0.85} ${s * 0.1},${s * 0.6} L${s * 0.1},${s * 0.25}Z`,
    diamond: `M${half},${s * 0.05} L${s * 0.92},${half} L${half},${s * 0.95} L${s * 0.08},${half}Z`,
    hexagon: `M${half},${s * 0.05} L${s * 0.9},${s * 0.27} L${s * 0.9},${s * 0.73} L${half},${s * 0.95} L${s * 0.1},${s * 0.73} L${s * 0.1},${s * 0.27}Z`,
    crest: `M${half},${s * 0.02} L${s * 0.85},${s * 0.15} L${s * 0.92},${s * 0.2} L${s * 0.88},${s * 0.6} Q${s * 0.85},${s * 0.85} ${half},${s * 0.98} Q${s * 0.15},${s * 0.85} ${s * 0.12},${s * 0.6} L${s * 0.08},${s * 0.2} L${s * 0.15},${s * 0.15}Z`,
    rounded_shield: `M${half},${s * 0.08} Q${s * 0.85},${s * 0.08} ${s * 0.88},${s * 0.3} L${s * 0.88},${s * 0.55} Q${s * 0.88},${s * 0.9} ${half},${s * 0.95} Q${s * 0.12},${s * 0.9} ${s * 0.12},${s * 0.55} L${s * 0.12},${s * 0.3} Q${s * 0.15},${s * 0.08} ${half},${s * 0.08}Z`,
    pennant: `M${s * 0.15},${s * 0.05} L${s * 0.85},${s * 0.05} L${half},${s * 0.95}Z`,
    triangle: `M${s * 0.08},${s * 0.85} L${s * 0.92},${s * 0.85} L${half},${s * 0.1}Z`,
    octagon: `M${s * 0.3},${s * 0.07} L${s * 0.7},${s * 0.07} L${s * 0.93},${s * 0.3} L${s * 0.93},${s * 0.7} L${s * 0.7},${s * 0.93} L${s * 0.3},${s * 0.93} L${s * 0.07},${s * 0.7} L${s * 0.07},${s * 0.3}Z`,
    star: starPath(half, half * 1.02, half * 0.85, half * 0.36, 5),
    banner: `M${s * 0.1},${s * 0.08} L${s * 0.9},${s * 0.08} L${s * 0.9},${s * 0.75} L${half},${s * 0.92} L${s * 0.1},${s * 0.75}Z`,
    chevron: `M${half},${s * 0.1} L${s * 0.92},${s * 0.5} L${half},${s * 0.9} L${s * 0.08},${s * 0.5}Z`,
    arch: `M${s * 0.12},${s * 0.95} L${s * 0.12},${s * 0.4} Q${s * 0.12},${s * 0.05} ${half},${s * 0.05} Q${s * 0.88},${s * 0.05} ${s * 0.88},${s * 0.4} L${s * 0.88},${s * 0.95}Z`,
    double_shield: `M${half},${s * 0.05} L${s * 0.9},${s * 0.2} L${s * 0.9},${s * 0.58} Q${s * 0.9},${s * 0.85} ${half},${s * 0.95} Q${s * 0.1},${s * 0.85} ${s * 0.1},${s * 0.58} L${s * 0.1},${s * 0.2}Z M${half},${s * 0.05} L${half},${s * 0.95}`,
  };
}

function roundRectPath(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
}

interface BadgeOpts {
  primary: string;
  secondary: string;
  pattern: BadgePattern;
  initials: string;
  size?: number;
  symbol?: string | null;
  /** Font pro iniciály. Default = heading font (přes CSS var). */
  font?: string;
}

/**
 * Vygeneruje VNITŘNÍ SVG markup znaku (bez <svg> obalu) — zdroj pravdy pro profilový <BadgePreview>.
 */
export function badgeSvgMarkup({ primary, secondary, pattern, initials, size = 64, symbol, font = "var(--font-heading)" }: BadgeOpts): string {
  const s = size;
  const half = s / 2;
  const hasSymbol = !!symbol;
  const fontSize = hasSymbol ? s * 0.2 : s * 0.28;
  const initialsY = hasSymbol ? s * 0.42 : half + fontSize * 0.35;
  const symbolY = s * 0.68;
  const symbolSize = s * 0.32;
  const sw = s * 0.04;
  const { primaryLight, stroke: rawStroke, textFill } = badgeColors(primary, secondary);
  // Escapuj interpolované hodnoty — markup jde přes dangerouslySetInnerHTML (React auto-escape neplatí)
  const P = escapeXml(primary);
  const stroke = escapeXml(rawStroke);
  const FONT = escapeXml(font);
  const shapes = badgeShapes(s);

  const shapeEl = pattern === "circle"
    ? `<circle cx="${half}" cy="${half}" r="${half * 0.85}" fill="${P}" stroke="${stroke}" stroke-width="${sw}"/>`
    : pattern === "oval"
    ? `<ellipse cx="${half}" cy="${half}" rx="${half * 0.82}" ry="${half * 0.65}" fill="${P}" stroke="${stroke}" stroke-width="${sw}"/>`
    : pattern === "square"
    ? `<rect x="${s * 0.1}" y="${s * 0.1}" width="${s * 0.8}" height="${s * 0.8}" rx="${s * 0.12}" fill="${P}" stroke="${stroke}" stroke-width="${sw}"/>`
    : `<path d="${shapes[pattern as Exclude<BadgePattern, SpecialPattern>]}" fill="${P}" stroke="${stroke}" stroke-width="${sw}" stroke-linejoin="round"/>`;

  const textEl = `<text x="${half}" y="${initialsY}" text-anchor="middle" font-size="${fontSize * 0.85}" font-weight="800" fill="${textFill}" stroke="${primaryLight ? "rgba(0,0,0,0.15)" : "rgba(0,0,0,0.4)"}" stroke-width="${s * 0.02}" paint-order="stroke" font-family="${FONT}" letter-spacing="0.05em">${escapeXml(initials)}</text>`;

  let symbolEl = "";
  if (symbol === "svg:crescent") {
    const cR = symbolSize * 0.42;
    const off = cR * 0.42;
    symbolEl = `<g><circle cx="${half}" cy="${symbolY}" r="${cR}" fill="white"/><circle cx="${half + off}" cy="${symbolY}" r="${cR * 0.92}" fill="${P}"/></g>`;
  } else if (symbol) {
    symbolEl = `<text x="${half}" y="${symbolY}" text-anchor="middle" font-size="${symbolSize}" dominant-baseline="middle" font-family="system-ui, -apple-system, 'Apple Color Emoji', 'Segoe UI Emoji', sans-serif">${escapeXml(symbol)}</text>`;
  }

  return shapeEl + textEl + symbolEl;
}

/**
 * Nakreslí znak PŘÍMO na 2D canvas (synchronně, bez <img>/SVG → žádné tainting).
 * Stejná geometrie i barvy jako badgeSvgMarkup — používá 3D vlajka. Kreslí vycentrovaně na (cx, cy).
 */
export function drawBadgeOnCanvas(
  ctx: CanvasRenderingContext2D,
  { primary, secondary, pattern, initials, symbol, cx, cy, size }:
    { primary: string; secondary: string; pattern: BadgePattern; initials: string; symbol?: string | null; cx: number; cy: number; size: number }
) {
  const s = size;
  const half = s / 2;
  const hasSymbol = !!symbol;
  const fontSize = hasSymbol ? s * 0.2 : s * 0.28;
  const initialsY = hasSymbol ? s * 0.42 : half + fontSize * 0.35;
  const symbolY = s * 0.68;
  const symbolSize = s * 0.32;
  const { primaryLight, stroke, textFill } = badgeColors(primary, secondary);

  ctx.save();
  ctx.translate(cx - half, cy - half); // kresli v boxu 0..s
  ctx.lineJoin = "round";
  ctx.lineWidth = s * 0.04;

  // Tvar
  ctx.beginPath();
  if (pattern === "circle") {
    ctx.arc(half, half, half * 0.85, 0, Math.PI * 2);
  } else if (pattern === "oval") {
    ctx.ellipse(half, half, half * 0.82, half * 0.65, 0, 0, Math.PI * 2);
  } else if (pattern === "square") {
    roundRectPath(ctx, s * 0.1, s * 0.1, s * 0.8, s * 0.8, s * 0.12);
  }
  if (pattern === "circle" || pattern === "oval" || pattern === "square") {
    ctx.fillStyle = primary; ctx.fill();
    ctx.strokeStyle = stroke; ctx.stroke();
  } else {
    const p = new Path2D(badgeShapes(s)[pattern as Exclude<BadgePattern, SpecialPattern>]);
    ctx.fillStyle = primary; ctx.fill(p);
    ctx.strokeStyle = stroke; ctx.stroke(p);
  }

  // Iniciály
  ctx.font = `800 ${fontSize * 0.85}px Arial, Helvetica, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  ctx.lineWidth = s * 0.02;
  ctx.strokeStyle = primaryLight ? "rgba(0,0,0,0.15)" : "rgba(0,0,0,0.4)";
  ctx.strokeText(initials, half, initialsY);
  ctx.fillStyle = textFill;
  ctx.fillText(initials, half, initialsY);

  // Symbol
  if (symbol === "svg:crescent") {
    const cR = symbolSize * 0.42;
    const off = cR * 0.42;
    ctx.beginPath(); ctx.arc(half, symbolY, cR, 0, Math.PI * 2); ctx.fillStyle = "white"; ctx.fill();
    ctx.beginPath(); ctx.arc(half + off, symbolY, cR * 0.92, 0, Math.PI * 2); ctx.fillStyle = primary; ctx.fill();
  } else if (symbol) {
    ctx.font = `${symbolSize}px "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", system-ui, sans-serif`;
    ctx.textBaseline = "middle";
    ctx.fillStyle = "#000";
    ctx.fillText(symbol, half, symbolY);
  }
  ctx.restore();
}

export function BadgePreview({ primary, secondary, pattern, initials, size = 64, symbol }: { primary: string; secondary: string; pattern: BadgePattern; initials: string; size?: number; symbol?: string | null }) {
  const s = size;
  return (
    <svg
      width={s}
      height={s}
      viewBox={`0 0 ${s} ${s}`}
      style={{ verticalAlign: "middle", flexShrink: 0 }}
      dangerouslySetInnerHTML={{ __html: badgeSvgMarkup({ primary, secondary, pattern, initials, size: s, symbol }) }}
    />
  );
}
