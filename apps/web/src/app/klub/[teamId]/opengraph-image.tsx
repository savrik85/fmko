import { ImageResponse } from "next/og";

export const runtime = "edge";
export const alt = "Oficiální klubový web · Okresní mašina Prales";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8787";

function initials(name: string): string {
  return name
    .split(" ")
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 3)
    .join("")
    .toUpperCase();
}

export default async function Image({ params }: { params: Promise<{ teamId: string }> }) {
  const { teamId } = await params;

  let name = "Fotbalový klub";
  let nickname = "";
  let motto = "";
  let village = "";
  let district = "";
  let leagueName = "Okresní přebor";
  let stadiumName = "Místní hřiště";
  let capacity = 350;
  let playerCount = 18;
  let primary = "#2D5F2D";
  let secondary = "#FFFFFF";
  let badgeInitials = "";
  let badgeSymbol: string | null = null;
  let foundingYear: number | null = null;

  try {
    const r = await fetch(`${API}/api/teams/${teamId}/website`, { cache: "no-store" });
    if (r.ok) {
      const data = await r.json();
      if (data?.team) {
        const t = data.team;
        name = t.name || name;
        nickname = t.identity?.nickname || "";
        motto = t.identity?.motto || "";
        foundingYear = t.identity?.foundingYear || null;
        village = t.village?.name || "";
        district = t.village?.district || "";
        primary = t.primaryColor || t.badge?.primary || primary;
        secondary = t.secondaryColor || t.badge?.secondary || secondary;
        badgeInitials = t.badge?.customInitials || initials(name);
        badgeSymbol = t.badge?.symbol || null;
        stadiumName = t.stadium?.name || stadiumName;
        capacity = t.stadium?.capacity || capacity;
        playerCount = data.roster?.aTeam?.length || playerCount;
      }
    }
  } catch {
    // fallback
  }

  if (!badgeInitials) {
    badgeInitials = initials(name);
  }

  const nameSize = name.length > 25 ? 44 : name.length > 18 ? 52 : 62;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "50px 60px",
          background: `radial-gradient(circle at 85% 15%, ${primary}66 0%, #07100a 60%, #040805 100%)`,
          fontFamily: "system-ui, -apple-system, sans-serif",
          color: "#ffffff",
          position: "relative",
        }}
      >
        {/* Subtle decorative stadium pitch lines in background */}
        <div
          style={{
            position: "absolute",
            right: "-100px",
            top: "-100px",
            width: "550px",
            height: "550px",
            borderRadius: "50%",
            border: "2px solid rgba(255,255,255,0.06)",
            display: "flex",
          }}
        />
        <div
          style={{
            position: "absolute",
            right: "50px",
            bottom: "-150px",
            width: "400px",
            height: "400px",
            borderRadius: "50%",
            border: "2px solid rgba(255,255,255,0.04)",
            display: "flex",
          }}
        />

        {/* Left Column: Team Crest / Badge */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            width: "320px",
            flexShrink: 0,
            gap: "16px",
          }}
        >
          <div
            style={{
              width: "280px",
              height: "280px",
              borderRadius: "44px",
              background: `linear-gradient(145deg, ${secondary}, #e2e8f0)`,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              border: `8px solid ${primary}`,
              boxShadow: "0 25px 60px rgba(0,0,0,0.6), 0 0 40px rgba(255,255,255,0.15)",
              position: "relative",
            }}
          >
            <div
              style={{
                fontSize: badgeSymbol ? 76 : 104,
                fontWeight: 900,
                color: primary,
                letterSpacing: "2px",
                display: "flex",
                lineHeight: 1,
              }}
            >
              {badgeInitials}
            </div>
            {badgeSymbol && (
              <div
                style={{
                  fontSize: 70,
                  marginTop: "-10px",
                  display: "flex",
                  lineHeight: 1,
                }}
              >
                {badgeSymbol}
              </div>
            )}
          </div>

          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              padding: "6px 18px",
              borderRadius: "20px",
              background: "rgba(0,0,0,0.5)",
              border: "1px solid rgba(255,255,255,0.15)",
              fontSize: "14px",
              fontWeight: 700,
              color: "#f5c542",
              textTransform: "uppercase",
              letterSpacing: "1.5px",
            }}
          >
            {foundingYear ? `Založeno ${foundingYear}` : "Oficiální klub"}
          </div>
        </div>

        {/* Right Column: Club Identity & Information */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            flex: 1,
            marginLeft: "50px",
            minWidth: 0,
            height: "100%",
          }}
        >
          {/* Top badges bar */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "12px",
              marginBottom: "16px",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "6px",
                background: "#dc2626",
                color: "#ffffff",
                padding: "6px 14px",
                borderRadius: "12px",
                fontSize: "13px",
                fontWeight: 900,
                letterSpacing: "1px",
                textTransform: "uppercase",
              }}
            >
              <span>●</span>
              <span>OFICIÁLNÍ WEBOVÁ STRÁNKA</span>
            </div>

            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "6px",
                background: "rgba(255,255,255,0.1)",
                color: "#e2e8f0",
                padding: "6px 14px",
                borderRadius: "12px",
                fontSize: "13px",
                fontWeight: 700,
              }}
            >
              <span>🏆</span>
              <span>{leagueName}</span>
            </div>
          </div>

          {/* Club Name */}
          <div
            style={{
              fontSize: nameSize,
              fontWeight: 900,
              color: "#ffffff",
              lineHeight: 1.1,
              marginBottom: "6px",
              letterSpacing: "-0.5px",
              display: "flex",
            }}
          >
            {name}
          </div>

          {/* Nickname */}
          {nickname && (
            <div
              style={{
                fontSize: "26px",
                fontWeight: 700,
                color: "#f5c542",
                marginBottom: "8px",
                display: "flex",
              }}
            >
              „{nickname}“
            </div>
          )}

          {/* Location */}
          {(village || district) && (
            <div
              style={{
                fontSize: "22px",
                fontWeight: 600,
                color: "rgba(255,255,255,0.85)",
                display: "flex",
                alignItems: "center",
                gap: "8px",
                marginBottom: motto ? "10px" : "18px",
              }}
            >
              <span>📍</span>
              <span>
                {village}
                {district ? ` · okres ${district}` : ""}
              </span>
            </div>
          )}

          {/* Motto */}
          {motto && (
            <div
              style={{
                fontSize: "20px",
                fontStyle: "italic",
                color: "rgba(255,255,255,0.75)",
                marginBottom: "20px",
                display: "flex",
                borderLeft: "4px solid #f5c542",
                paddingLeft: "14px",
              }}
            >
              &ldquo;{motto.length > 85 ? motto.slice(0, 82) + "…" : motto}&rdquo;
            </div>
          )}

          {/* Quick Stats Grid */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "12px",
              marginTop: "auto",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                padding: "8px 16px",
                borderRadius: "14px",
                background: "rgba(0,0,0,0.4)",
                border: "1px solid rgba(255,255,255,0.12)",
                fontSize: "14px",
                fontWeight: 700,
                color: "rgba(255,255,255,0.9)",
              }}
            >
              <span>🏟️</span>
              <span>{stadiumName} ({capacity} míst)</span>
            </div>

            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                padding: "8px 16px",
                borderRadius: "14px",
                background: "rgba(0,0,0,0.4)",
                border: "1px solid rgba(255,255,255,0.12)",
                fontSize: "14px",
                fontWeight: 700,
                color: "rgba(255,255,255,0.9)",
              }}
            >
              <span>👥</span>
              <span>A-tým: {playerCount} hráčů</span>
            </div>

            <div
              style={{
                display: "flex",
                marginLeft: "auto",
                fontSize: "12px",
                fontWeight: 900,
                color: "rgba(255,255,255,0.4)",
                letterSpacing: "3px",
                textTransform: "uppercase",
              }}
            >
              PRALES.FUN
            </div>
          </div>
        </div>
      </div>
    ),
    { ...size },
  );
}
