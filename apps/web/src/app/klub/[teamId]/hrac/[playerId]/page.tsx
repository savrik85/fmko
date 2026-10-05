import { cache } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";
import type { ClubWebsitePlayerProfile } from "@okresni-masina/shared";
import { PlayerProfileClient } from "./PlayerProfileClient";

export const runtime = "edge";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8787";
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://prales.fun";

type ProfileFetch =
  | { status: "ok"; profile: ClubWebsitePlayerProfile }
  | { status: "not_found" }
  | { status: "error" };

/** Jedno volání API na vykreslení (metadata i stránka). */
const fetchProfile = cache(async (club: string, playerId: string): Promise<ProfileFetch> => {
  try {
    const r = await fetch(
      `${API}/api/teams/${encodeURIComponent(club)}/website/player/${encodeURIComponent(playerId)}`,
      { cache: "no-store" },
    );
    if (r.status === 404) return { status: "not_found" };
    if (!r.ok) {
      console.error("profil hráče: API vrátilo chybu", club, playerId, r.status);
      return { status: "error" };
    }
    return { status: "ok", profile: (await r.json()) as ClubWebsitePlayerProfile };
  } catch (e) {
    console.error("profil hráče: načtení selhalo", club, playerId, e);
    return { status: "error" };
  }
});

export async function generateMetadata({
  params,
}: {
  params: Promise<{ teamId: string; playerId: string }>;
}): Promise<Metadata> {
  const { teamId, playerId } = await params;
  const result = await fetchProfile(decodeURIComponent(teamId), playerId);
  if (result.status !== "ok") {
    return { title: "Hráč · Prales", robots: { index: false, follow: false } };
  }
  const { club, player } = result.profile;
  const name = `${player.firstName} ${player.lastName}`;
  const url = `${SITE_URL}/klub/${club.slug || club.id}/hrac/${player.id}`;
  const desc = `${name}, ${player.positionName.toLowerCase()}, ${player.age} let. Profil hráče na oficiálním webu klubu ${club.name}.`;
  return {
    metadataBase: new URL(SITE_URL),
    title: `${name} · ${club.name} | Prales`,
    description: desc,
    alternates: { canonical: url },
    openGraph: {
      title: `${name} · ${club.name}`,
      description: desc,
      url,
      siteName: "Prales · Okresní mašina",
      locale: "cs_CZ",
      type: "profile",
      images: [{ url: `${SITE_URL}/klub/${club.id}/opengraph-image`, width: 1200, height: 630 }],
    },
  };
}

export default async function PlayerProfilePage({
  params,
}: {
  params: Promise<{ teamId: string; playerId: string }>;
}) {
  const { teamId, playerId } = await params;
  const result = await fetchProfile(decodeURIComponent(teamId), playerId);
  if (result.status === "not_found") notFound();
  if (result.status === "error") {
    return (
      <main className="min-h-screen flex items-center justify-center bg-[#0a0f0a] text-white p-6">
        <div className="text-center max-w-md">
          <h1 className="text-3xl font-heading font-[900] mb-2">Profil hráče je dočasně nedostupný</h1>
          <p className="text-white/70 text-base mb-8">Zkus to prosím za chvíli znovu.</p>
          <Link href={`/klub/${teamId}`} className="inline-block px-8 py-3 bg-amber-500 hover:bg-amber-400 text-black rounded-full font-heading font-bold">
            Zpět na web klubu
          </Link>
        </div>
      </main>
    );
  }
  // Adresa s ID klubu (nebo stará adresa) přesměruje na hezkou adresu webu klubu
  const club = result.profile.club;
  if (club.slug && decodeURIComponent(teamId) !== club.slug) {
    permanentRedirect(`/klub/${club.slug}/hrac/${result.profile.player.id}`);
  }
  return <PlayerProfileClient profile={result.profile} siteUrl={SITE_URL} />;
}
