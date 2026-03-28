import { ImageResponse } from "next/og";

export const runtime = "edge";
export const alt = "Prales FM - Pozvanka";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8787";

export default async function Image({ params }: { params: Promise<{ teamId: string }> }) {
  const { teamId } = await params;

  let teamName = "Prales FM";
  let villageName = "";
  let district = "";
  let managerName = "";
  let color = "#2D5F2D";
  let initials = "P";

  try {
    const [teamRes, mgrRes] = await Promise.all([
      fetch(`${API}/api/teams/${teamId}`).then((r) => r.json()).catch(() => null),
      fetch(`${API}/api/teams/${teamId}/manager`).then((r) => r.json()).catch(() => null),
    ]);
    if (teamRes?.name) {
      teamName = teamRes.name;
      villageName = teamRes.village_name || "";
      district = teamRes.district || "";
      color = teamRes.primary_color || "#2D5F2D";
      initials = teamName.split(" ").map((w: string) => w[0]).filter(Boolean).slice(0, 3).join("").toUpperCase();
    }
    if (mgrRes?.name) managerName = mgrRes.name;
  } catch { /* fallback values */ }

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: "linear-gradient(135deg, #0f170f 0%, #1e2d1e 50%, #0f170f 100%)",
          fontFamily: "system-ui, sans-serif",
        }}
      >
        {/* Logo */}
        <div style={{ display: "flex", fontSize: 24, color: "rgba(255,255,255,0.3)", letterSpacing: 4, marginBottom: 24 }}>
          PRALES FM
        </div>

        {/* Badge */}
        <div
          style={{
            width: 100,
            height: 100,
            borderRadius: 24,
            background: color,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 36,
            fontWeight: 800,
            color: "white",
            marginBottom: 24,
            boxShadow: `0 0 60px ${color}66`,
          }}
        >
          {initials}
        </div>

        {/* Team name */}
        <div style={{ fontSize: 48, fontWeight: 800, color: "white", marginBottom: 8 }}>
          {teamName}
        </div>

        {/* Location */}
        <div style={{ fontSize: 20, color: "rgba(255,255,255,0.4)", marginBottom: 32 }}>
          {villageName}{district ? ` \u00B7 ${district}` : ""}
        </div>

        {/* Challenge */}
        <div
          style={{
            display: "flex",
            background: "rgba(255,255,255,0.05)",
            borderRadius: 16,
            padding: "20px 40px",
            border: "1px solid rgba(255,255,255,0.1)",
          }}
        >
          <div style={{ fontSize: 24, color: "rgba(255,255,255,0.8)" }}>
            {managerName ? `${managerName} te vyzyvat!` : "Prijmi vyzvu!"}
          </div>
        </div>

        {/* CTA */}
        <div
          style={{
            display: "flex",
            marginTop: 32,
            background: "#2D5F2D",
            borderRadius: 12,
            padding: "14px 32px",
            fontSize: 20,
            fontWeight: 700,
            color: "white",
          }}
        >
          Zaloz si svuj tym zdarma
        </div>
      </div>
    ),
    { ...size },
  );
}
