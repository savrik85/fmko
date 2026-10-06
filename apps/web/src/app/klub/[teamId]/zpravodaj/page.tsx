import { cache } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";
import type { ClubWebsiteProgramPage } from "@okresni-masina/shared";
import { ProgramClient } from "./ProgramClient";

export const runtime = "edge";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8787";
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://prales.fun";

type ProgramFetch =
  | { status: "ok"; program: ClubWebsiteProgramPage }
  | { status: "not_found" }
  | { status: "error" };

/** Jedno volání API na vykreslení (metadata i stránka). */
const fetchProgram = cache(async (club: string): Promise<ProgramFetch> => {
  try {
    const r = await fetch(`${API}/api/teams/${encodeURIComponent(club)}/website/program`, { cache: "no-store" });
    if (r.status === 404) return { status: "not_found" };
    if (!r.ok) {
      console.error("zpravodaj: API vrátilo chybu", club, r.status);
      return { status: "error" };
    }
    return { status: "ok", program: (await r.json()) as ClubWebsiteProgramPage };
  } catch (e) {
    console.error("zpravodaj: načtení selhalo", club, e);
    return { status: "error" };
  }
});

export async function generateMetadata({
  params,
}: {
  params: Promise<{ teamId: string }>;
}): Promise<Metadata> {
  const { teamId } = await params;
  const result = await fetchProgram(decodeURIComponent(teamId));
  if (result.status !== "ok") {
    return { title: "Zpravodaj · Prales", robots: { index: false, follow: false } };
  }
  const { club, match, home, away } = result.program;
  const url = `${SITE_URL}/klub/${club.slug || club.id}/zpravodaj`;
  const title = match ? `Zpravodaj ke ${match.round}. kolu · ${club.name}` : `Zpravodaj · ${club.name}`;
  const desc = match && home && away
    ? `Zápasový program klubu ${club.name} k utkání ${home.name} proti ${away.name} (${match.round}. kolo, ${match.competitionName}): slovo trenéra, forma obou týmů a soupisky.`
    : `Zápasový program klubu ${club.name} k příštímu utkání.`;
  return {
    metadataBase: new URL(SITE_URL),
    title: `${title} | Prales`,
    description: desc,
    alternates: { canonical: url },
    openGraph: {
      title,
      description: desc,
      url,
      siteName: "Prales · Okresní mašina",
      locale: "cs_CZ",
      type: "article",
      images: [{ url: `${SITE_URL}/klub/${club.id}/opengraph-image`, width: 1200, height: 630 }],
    },
  };
}

export default async function ProgramPage({
  params,
}: {
  params: Promise<{ teamId: string }>;
}) {
  const { teamId } = await params;
  const result = await fetchProgram(decodeURIComponent(teamId));
  if (result.status === "not_found") notFound();
  if (result.status === "error") {
    return (
      <main className="min-h-screen flex items-center justify-center bg-[#0a0f0a] text-white p-6">
        <div className="text-center max-w-md">
          <h1 className="text-3xl font-heading font-[900] mb-2">Zpravodaj je dočasně nedostupný</h1>
          <p className="text-white/70 text-base mb-8">Zkus to prosím za chvíli znovu.</p>
          <Link href={`/klub/${teamId}`} className="inline-block px-8 py-3 bg-amber-500 hover:bg-amber-400 text-black rounded-full font-heading font-bold">
            Zpět na web klubu
          </Link>
        </div>
      </main>
    );
  }
  // Adresa s ID klubu (nebo stará adresa) přesměruje na hezkou adresu webu klubu
  const club = result.program.club;
  if (club.slug && decodeURIComponent(teamId) !== club.slug) {
    permanentRedirect(`/klub/${club.slug}/zpravodaj`);
  }
  return <ProgramClient program={result.program} siteUrl={SITE_URL} />;
}
