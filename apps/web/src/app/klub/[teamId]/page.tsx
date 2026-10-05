import type { Metadata } from "next";
import Link from "next/link";
import type { ClubWebsiteData } from "@okresni-masina/shared";
import { ClubWebsiteClient } from "./ClubWebsiteClient";

export const runtime = "edge";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8787";
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

async function fetchSafe<T>(path: string): Promise<T | null> {
  try {
    const r = await fetch(`${API}${path}`, { cache: "no-store" });
    if (!r.ok) return null;
    return r.json();
  } catch (e) {
    console.error("fetchSafe", path, e);
    return null;
  }
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ teamId: string }>;
}): Promise<Metadata> {
  const { teamId } = await params;
  const data = await fetchSafe<ClubWebsiteData>(`/api/teams/${teamId}/website`);
  if (!data?.team) {
    return { title: "Klubový web · Prales" };
  }

  const { team } = data;
  const baseName = team.identity.nickname
    ? `${team.name} (${team.identity.nickname})`
    : team.name;
  const desc =
    team.identity.motto ||
    (team.identity.foundingStory ? team.identity.foundingStory.slice(0, 180) : null) ||
    `Oficiální klubový web ${team.name} z obce ${team.village.name}, okres ${team.village.district}. Sestavy, výsledky, stadion a vstupenky.`;

  return {
    title: `${baseName} · Oficiální klubový web | Prales`,
    description: desc,
    openGraph: {
      title: `${baseName} · Oficiální klubový web`,
      description: desc,
      type: "website",
      siteName: "Prales",
      locale: "cs_CZ",
    },
    twitter: {
      card: "summary_large_image",
      title: `${baseName} · Oficiální klubový web`,
      description: desc,
    },
  };
}

export default async function KlubPublicPage({
  params,
}: {
  params: Promise<{ teamId: string }>;
}) {
  const { teamId } = await params;
  const data = await fetchSafe<ClubWebsiteData>(`/api/teams/${teamId}/website`);

  if (!data || !data.team) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-[#0a0f0a] text-white p-6">
        <div className="text-center max-w-md">
          <div className="text-6xl mb-4">🤷‍♂️</div>
          <h1 className="text-3xl font-heading font-[900] mb-2">Klubový web nenalezen</h1>
          <p className="text-white/60 mb-8">
            Tento odkaz na klubový web je neplatný nebo klub ještě nebyl založen.
          </p>
          <Link
            href="/"
            className="inline-block px-8 py-3 bg-amber-500 hover:bg-amber-400 text-black rounded-full font-heading font-bold shadow-lg transition-transform hover:scale-105"
          >
            Zpět na úvod
          </Link>
        </div>
      </main>
    );
  }

  return <ClubWebsiteClient data={data} siteUrl={SITE_URL} />;
}
