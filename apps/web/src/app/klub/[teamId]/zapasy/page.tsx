import { cache } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";
import type { ClubWebsiteMatchesPage } from "@okresni-masina/shared";
import { MatchesClient } from "./MatchesClient";

export const runtime = "edge";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8787";
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://prales.fun";

type MatchesFetch =
  | { status: "ok"; page: ClubWebsiteMatchesPage }
  | { status: "not_found" }
  | { status: "error" };

/** Jedno volání API na vykreslení (metadata i stránka). */
const fetchMatches = cache(async (club: string): Promise<MatchesFetch> => {
  try {
    const r = await fetch(`${API}/api/teams/${encodeURIComponent(club)}/website/matches`, { cache: "no-store" });
    if (r.status === 404) return { status: "not_found" };
    if (!r.ok) {
      console.error("zápasy klubu: API vrátilo chybu", club, r.status);
      return { status: "error" };
    }
    return { status: "ok", page: (await r.json()) as ClubWebsiteMatchesPage };
  } catch (e) {
    console.error("zápasy klubu: načtení selhalo", club, e);
    return { status: "error" };
  }
});

export async function generateMetadata({
  params,
}: {
  params: Promise<{ teamId: string }>;
}): Promise<Metadata> {
  const { teamId } = await params;
  const result = await fetchMatches(decodeURIComponent(teamId));
  if (result.status !== "ok") {
    return { title: "Zápasy a výsledky · Prales", robots: { index: false, follow: false } };
  }
  const { club, seasonNumber } = result.page;
  const url = `${SITE_URL}/klub/${club.slug || club.id}/zapasy`;
  const season = seasonNumber ? `${seasonNumber}. sezóny` : "sezóny";
  const league = club.leagueName ? ` (${club.leagueName})` : "";
  const desc = `Rozpis zápasů a výsledky ${season}${league}, mistrovská utkání i pohár. Oficiální web klubu ${club.name}.`;
  return {
    metadataBase: new URL(SITE_URL),
    title: `Zápasy a výsledky · ${club.name} | Prales`,
    description: desc,
    alternates: { canonical: url },
    openGraph: {
      title: `Zápasy a výsledky · ${club.name}`,
      description: desc,
      url,
      siteName: "Prales · Okresní mašina",
      locale: "cs_CZ",
      type: "website",
      images: [{ url: `${SITE_URL}/klub/${club.id}/opengraph-image`, width: 1200, height: 630 }],
    },
  };
}

export default async function ClubMatchesPage({
  params,
}: {
  params: Promise<{ teamId: string }>;
}) {
  const { teamId } = await params;
  const result = await fetchMatches(decodeURIComponent(teamId));
  if (result.status === "not_found") notFound();
  if (result.status === "error") {
    return (
      <main className="min-h-screen flex items-center justify-center bg-[#0a0f0a] text-white p-6">
        <div className="text-center max-w-md">
          <h1 className="text-3xl font-heading font-[900] mb-2">Zápasy jsou dočasně nedostupné</h1>
          <p className="text-white/70 text-base mb-8">Zkus to prosím za chvíli znovu.</p>
          <Link href={`/klub/${teamId}`} className="inline-block px-8 py-3 bg-amber-500 hover:bg-amber-400 text-black rounded-full font-heading font-bold">
            Zpět na web klubu
          </Link>
        </div>
      </main>
    );
  }
  // Adresa s ID klubu (nebo stará adresa) přesměruje na hezkou adresu webu klubu
  const club = result.page.club;
  if (club.slug && decodeURIComponent(teamId) !== club.slug) {
    permanentRedirect(`/klub/${club.slug}/zapasy`);
  }
  return <MatchesClient page={result.page} siteUrl={SITE_URL} />;
}
