import { ImageResponse } from "next/og";

export const runtime = "edge";
export const alt = "Profil klubu — Prales FM";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8787";

function isLight(hex: string): boolean {
  const c = hex.replace("#", "");
  const r = parseInt(c.substring(0, 2), 16);
  const g = parseInt(c.substring(2, 4), 16);
  const b = parseInt(c.substring(4, 6), 16);
  return (r * 299 + g * 587 + b * 114) / 1000 > 160;
}

function initials(name: string): string {
  return name.split(" ").map((w) => w[0]).filter(Boolean).slice(0, 3).join("").toUpperCase();
}

export default async function Image({ params }: { params: Promise<{ teamId: string }> }) {
  const { teamId } = await params;

  let name = "Prales FM";
  let nickname = "";
  let motto = "";
  let village = "";
  let district = "";
  let primary = "#2D5F2D";
  let secondary = "#FFFFFF";
  let badgeInitials = "P";
  let badgeSymbol: string | null = null;

  try {
    const r = await fetch(`${API}/api/teams/${teamId}/club`);
    if (r.ok) {
      const club = await r.json();
      name = club.name || name;
      nickname = club.identity?.nickname || "";
      motto = club.identity?.motto || "";
      village = club.village?.name || "";
      district = club.village?.district || "";
      primary = club.badge?.primary || club.primaryColor || primary;
      secondary = club.badge?.secondary || club.secondaryColor || secondary;
      badgeInitials = club.badge?.customInitials || initials(name);
      badgeSymbol = club.badge?.symbol || null;
    }
  } catch { /* fallback */ }

  const light = isLight(primary);
  const textColor = light ? "#1a1a1a" : "#ffffff";
  const subColor = light ? "rgba(0,0,0,0.7)" : "rgba(255,255,255,0.75)";
  const mutedColor = light ? "rgba(0,0,0,0.5)" : "rgba(255,255,255,0.5)";

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "center",
          gap: 60,
          padding: 60,
          background: `linear-gradient(135deg, ${primary} 0%, ${primary} 55%, ${secondary}55 100%)`,
          fontFamily: "system-ui, sans-serif",
        }}
      >
        {/* Badge */}
        <div
          style={{
            width: 320,
            height: 320,
            borderRadius: 40,
            background: secondary,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            boxShadow: "0 20px 60px rgba(0,0,0,0.35)",
            flexShrink: 0,
          }}
        >
          <div style={{ fontSize: badgeSymbol ? 80 : 120, fontWeight: 900, color: primary, letterSpacing: 2 }}>
            {badgeInitials}
          </div>
          {badgeSymbol && (
            <div style={{ fontSize: 90, marginTop: -10, display: "flex" }}>{badgeSymbol}</div>
          )}
        </div>

        {/* Text */}
        <div style={{ display: "flex", flexDirection: "column", flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 22, color: mutedColor, letterSpacing: 4, marginBottom: 8, textTransform: "uppercase" }}>
            Profil klubu
          </div>
          <div style={{ fontSize: 72, fontWeight: 900, color: textColor, lineHeight: 1.05, marginBottom: 10 }}>
            {name}
          </div>
          {nickname && (
            <div style={{ fontSize: 36, fontWeight: 700, color: subColor, marginBottom: 12 }}>
              {nickname}
            </div>
          )}
          {(village || district) && (
            <div style={{ fontSize: 26, color: subColor, marginBottom: motto ? 20 : 0 }}>
              {village}{district ? ` · ${district}` : ""}
            </div>
          )}
          {motto && (
            <div style={{ fontSize: 28, fontStyle: "italic", color: subColor, marginTop: 14, display: "flex" }}>
              &ldquo;{motto.length > 100 ? motto.slice(0, 97) + "…" : motto}&rdquo;
            </div>
          )}
          <div style={{ fontSize: 20, color: mutedColor, marginTop: "auto", letterSpacing: 3, textTransform: "uppercase" }}>
            Prales FM
          </div>
        </div>
      </div>
    ),
    { ...size },
  );
}
