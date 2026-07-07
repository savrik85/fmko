// apps/web/src/app/kotel-foto/route.tsx
// 2D "fotka" kotle pohledem ze hřiště — plachta s reálným textem, dav v barvách klubu.
// next/og (satori): jen CSS/flex, žádný canvas/WebGL. Deterministické z query paramů → CDN cache.
import { ImageResponse } from "next/og";

export const runtime = "edge";

function isLight(hex: string): boolean {
  const c = hex.replace("#", "");
  const r = parseInt(c.substring(0, 2), 16) || 0;
  const g = parseInt(c.substring(2, 4), 16) || 0;
  const b = parseInt(c.substring(4, 6), 16) || 0;
  return (r * 299 + g * 587 + b * 114) / 1000 > 150;
}
function hex(v: string | null, fallback: string): string {
  return v && /^#[0-9A-Fa-f]{6}$/.test(v) ? v : fallback;
}
// Bez Intl, který je na Workers omezený — viz apps/api/src/news/ultras-report.ts
function fmtNum(n: number): string {
  return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
}

export async function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  const text = (q.get("text") ?? "").slice(0, 22).toUpperCase();
  const primary = hex(q.get("p"), "#2D5F2D");
  const secondary = hex(q.get("s"), "#ffffff");
  const bannerBg = hex(q.get("bg"), primary);
  const bannerFg = hex(q.get("fg"), isLight(bannerBg) ? "#1a1a1a" : "#ffffff");
  const lvl = Math.max(1, Math.min(3, parseInt(q.get("lvl") ?? "1", 10) || 1));
  const att = Math.max(0, parseInt(q.get("att") ?? "0", 10) || 0);
  const team = (q.get("team") ?? "").slice(0, 40);
  const cap = (q.get("cap") ?? "").slice(0, 60);
  const flags = [0, 4, 6, 8][lvl];

  // Dav: deterministický počet teček dle levelu (stabilní URL → stabilní obrázek → cache).
  const dotCount = 60 + lvl * 40;
  const dots = Array.from({ length: dotCount }, (_, i) => (i % 3 === 0 ? secondary : primary));

  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", background: "linear-gradient(180deg, #1b2a4a 0%, #2f4a6b 45%, #0e1a2e 100%)", fontFamily: "system-ui, sans-serif" }}>
        {/* Kicker */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "24px 40px 8px", color: "rgba(255,255,255,0.6)", fontSize: 22, letterSpacing: 4, textTransform: "uppercase" }}>
          🔥 Prales Ultras
        </div>
        {/* Kotel: dav + vlajky + buben */}
        <div style={{ display: "flex", flex: 1, flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "0 40px" }}>
          <div style={{ display: "flex", gap: 12, marginBottom: 12 }}>
            {Array.from({ length: flags }, (_, i) => (
              <span key={i} style={{ fontSize: 40 }}>🚩</span>
            ))}
            {lvl >= 2 && <span style={{ fontSize: 40 }}>🥁</span>}
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", width: 900, justifyContent: "center", gap: 8, marginBottom: 22 }}>
            {dots.map((c, i) => (
              <div key={i} style={{ width: 18, height: 18, borderRadius: 9, background: c, opacity: 0.55 + ((i * 7) % 5) * 0.09 }} />
            ))}
          </div>
          {/* Plachta */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 1000, minHeight: 130, background: bannerBg, borderRadius: 14, boxShadow: "0 16px 50px rgba(0,0,0,0.5)", padding: "18px 30px" }}>
            <div style={{ fontSize: text.length > 14 ? 58 : 78, fontWeight: 900, color: bannerFg, textAlign: "center", lineHeight: 1.05 }}>
              {text || team.toUpperCase()}
            </div>
          </div>
        </div>
        {/* Spodní lišta */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "18px 40px 26px", background: "rgba(0,0,0,0.35)" }}>
          <div style={{ display: "flex", fontSize: 34, fontWeight: 800, color: "#fff" }}>{team}</div>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end" }}>
            <div style={{ display: "flex", fontSize: 40, fontWeight: 900, color: "#fff" }}>{fmtNum(att)} diváků</div>
            {cap && <div style={{ display: "flex", fontSize: 22, color: "rgba(255,255,255,0.7)" }}>{cap}</div>}
          </div>
        </div>
      </div>
    ),
    { width: 1200, height: 630, headers: { "Cache-Control": "public, max-age=86400, immutable" } },
  );
}
