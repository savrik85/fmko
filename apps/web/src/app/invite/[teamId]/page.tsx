import type { Metadata } from "next";
import { InvitePageClient } from "./client";

export const runtime = "edge";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8787";

interface TeamData {
  id: string;
  name: string;
  village_name: string;
  district: string;
  region: string;
  primary_color: string;
  secondary_color: string;
  badge_pattern: string;
  reputation: number;
  league_id: string;
}

interface ManagerData {
  name: string;
  backstory: string;
  age: number;
  avatar: Record<string, unknown> | null;
}

async function fetchTeam(teamId: string): Promise<TeamData | null> {
  try {
    const r = await fetch(`${API}/api/teams/${teamId}`, { cache: "no-store" });
    if (!r.ok) return null;
    return r.json();
  } catch { return null; }
}

async function fetchManager(teamId: string): Promise<ManagerData | null> {
  try {
    const r = await fetch(`${API}/api/teams/${teamId}/manager`, { cache: "no-store" });
    if (!r.ok) return null;
    return r.json();
  } catch { return null; }
}

async function fetchPosition(teamId: string): Promise<number | null> {
  try {
    const r = await fetch(`${API}/api/teams/${teamId}/standings`, { cache: "no-store" });
    if (!r.ok) return null;
    const standings = await r.json();
    const idx = standings.findIndex?.((t: { team_id: string }) => t.team_id === teamId);
    return idx >= 0 ? idx + 1 : null;
  } catch { return null; }
}

export async function generateMetadata({ params }: { params: Promise<{ teamId: string }> }): Promise<Metadata> {
  const { teamId } = await params;
  const [team, manager] = await Promise.all([fetchTeam(teamId), fetchManager(teamId)]);

  if (!team) {
    return { title: "Prales FM" };
  }

  const managerName = manager?.name ?? "Trener";
  const title = `${team.name} te vyzyvat! | Prales FM`;
  const description = `${managerName} z ${team.village_name} te zve do okresniho preboru ${team.district}. Prijmi vyzvu a zaloz si svuj tym!`;

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      type: "website",
      siteName: "Prales FM",
      locale: "cs_CZ",
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
    },
  };
}

export default async function InvitePage({ params }: { params: Promise<{ teamId: string }> }) {
  const { teamId } = await params;
  const [team, manager, position] = await Promise.all([
    fetchTeam(teamId),
    fetchManager(teamId),
    fetchPosition(teamId),
  ]);

  if (!team) {
    return (
      <main className="min-h-screen bg-auth flex items-center justify-center">
        <div className="text-white text-center">
          <h1 className="text-2xl font-heading font-bold mb-2">Tym nenalezen</h1>
          <p className="text-white/50 mb-6">Tento odkaz je neplatny.</p>
          <a href="/" className="btn btn-primary-dark">Zpet na hlavni stranku</a>
        </div>
      </main>
    );
  }

  return <InvitePageClient team={team} manager={manager} position={position} />;
}
