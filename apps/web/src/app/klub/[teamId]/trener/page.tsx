import { cache } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";
import type { ClubWebsiteCoachPage } from "@okresni-masina/shared";
import { CoachClient } from "./CoachClient";

export const runtime = "edge";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8787";
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://prales.fun";

type CoachFetch =
  | { status: "ok"; page: ClubWebsiteCoachPage }
  | { status: "not_found" }
  | { status: "error" };

/** Jedno volání API na vykreslení (metadata i stránka). */
const fetchCoachPage = cache(async (club: string): Promise<CoachFetch> => {
  try {
    const r = await fetch(`${API}/api/teams/${encodeURIComponent(club)}/website/coach`, { cache: "no-store" });
    if (r.status === 404) return { status: "not_found" };
    if (!r.ok) {
      console.error("trenér na webu klubu: API vrátilo chybu", club, r.status);
      return { status: "error" };
    }
    return { status: "ok", page: (await r.json()) as ClubWebsiteCoachPage };
  } catch (e) {
    console.error("trenér na webu klubu: načtení selhalo", club, e);
    return { status: "error" };
  }
});

export async function generateMetadata({
  params,
}: {
  params: Promise<{ teamId: string }>;
}): Promise<Metadata> {
  const { teamId } = await params;
  const result = await fetchCoachPage(decodeURIComponent(teamId));
  if (result.status !== "ok") {
    return { title: "Trenér a realizační tým · Prales", robots: { index: false, follow: false } };
  }
  const { club, coach } = result.page;
  const url = `${SITE_URL}/klub/${club.slug || club.id}/trener`;
  const desc = coach
    ? `${coach.name}, hlavní trenér klubu ${club.name}. Bilance u klubu, rozhovory a realizační tým na oficiálním webu klubu.`
    : `Realizační tým klubu ${club.name} na oficiálním webu klubu.`;
  return {
    metadataBase: new URL(SITE_URL),
    title: `Trenér a realizační tým · ${club.name} | Prales`,
    description: desc,
    alternates: { canonical: url },
    openGraph: {
      title: `Trenér a realizační tým · ${club.name}`,
      description: desc,
      url,
      siteName: "Prales · Okresní mašina",
      locale: "cs_CZ",
      type: "website",
      images: [{ url: `${SITE_URL}/klub/${club.id}/opengraph-image`, width: 1200, height: 630 }],
    },
  };
}

export default async function CoachPage({ params }: { params: Promise<{ teamId: string }> }) {
  const { teamId } = await params;
  const result = await fetchCoachPage(decodeURIComponent(teamId));
  if (result.status === "not_found") notFound();
  if (result.status === "error") {
    return (
      <main className="min-h-screen flex items-center justify-center bg-[#0a0f0a] text-white p-6">
        <div className="text-center max-w-md">
          <h1 className="text-3xl font-heading font-[900] mb-2">Stránka trenéra je dočasně nedostupná</h1>
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
    permanentRedirect(`/klub/${club.slug}/trener`);
  }
  return <CoachClient page={result.page} siteUrl={SITE_URL} />;
}
