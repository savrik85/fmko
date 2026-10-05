import type { Metadata } from "next";
import Link from "next/link";
import type { ClubWebsiteData } from "@okresni-masina/shared";
import { ClubWebsiteClient } from "./ClubWebsiteClient";

export const runtime = "edge";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8787";
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://prales.fun";

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
    return {
      title: "Klubový web · Okresní fotbal Prales",
      description: "Oficiální klubový web amatérského fotbalového týmu.",
    };
  }

  const { team, website } = data;
  const canonicalSlug = website?.customSlug || teamId;
  const canonicalUrl = `${SITE_URL}/klub/${canonicalSlug}`;
  const ogImageUrl = `${SITE_URL}/klub/${teamId}/opengraph-image`;

  const baseName = team.identity.nickname
    ? `${team.name} „${team.identity.nickname}“`
    : team.name;

  const stadiumName = team.stadium?.name || "Místní hřiště";

  const desc =
    team.identity.motto
      ? `${baseName} — ${team.identity.motto}. Oficiální klubový web: ${team.village.name}, okres ${team.village.district}. Sestavy, výsledky, stadion a vstupenky.`
      : team.identity.foundingStory
      ? `${team.name} (${team.village.name}, okres ${team.village.district}). ${team.identity.foundingStory.slice(0, 140)}… Sestavy, zápasy, stadion.`
      : `Oficiální klubový web fotbalového týmu ${team.name} z obce ${team.village.name} (okres ${team.village.district}). Aktuální soupiska, výsledky zápasů, stadion a vstupenky.`;

  const keywords = [
    team.name,
    team.village.name,
    team.village.district,
    stadiumName,
    team.identity.nickname,
    "okresní přebor",
    "okresní fotbal",
    "vesnický fotbal",
    "klubový web",
    "soupiska týmu",
    "výsledky zápasů",
    "Prales",
  ].filter(Boolean) as string[];

  return {
    metadataBase: new URL(SITE_URL),
    title: `${baseName} · Oficiální klubový web | Prales`,
    description: desc,
    keywords,
    alternates: {
      canonical: canonicalUrl,
    },
    category: "Sports",
    applicationName: team.name,
    appleWebApp: {
      title: team.name,
      capable: true,
      statusBarStyle: "black-translucent",
    },
    openGraph: {
      title: `${baseName} · Oficiální klubový web`,
      description: desc,
      url: canonicalUrl,
      siteName: "Okresní mašina — Prales",
      locale: "cs_CZ",
      type: "website",
      images: [
        {
          url: ogImageUrl,
          width: 1200,
          height: 630,
          alt: `${baseName} — Oficiální klubový profil, soupiska a zápasy`,
          type: "image/png",
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: `${baseName} · Oficiální klubový web`,
      description: desc,
      images: [ogImageUrl],
      creator: "@okresnimasina",
      site: "@okresnimasina",
    },
    robots: {
      index: true,
      follow: true,
      googleBot: {
        index: true,
        follow: true,
        "max-video-preview": -1,
        "max-image-preview": "large",
        "max-snippet": -1,
      },
    },
    other: {
      "theme-color": team.primaryColor || "#2D5F2D",
      "og:locality": team.village.name,
      "og:region": team.village.district,
      "og:country-name": "Česká republika",
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

  const { team, website, roster, staff, matches } = data;
  const canonicalSlug = website?.customSlug || teamId;
  const canonicalUrl = `${SITE_URL}/klub/${canonicalSlug}`;
  const ogImageUrl = `${SITE_URL}/klub/${teamId}/opengraph-image`;
  const stadiumName = team.stadium?.name || "Místní hřiště";

  const headCoach = staff?.find((s) => s.role === "manager" || s.role === "coach");

  // Schema.org Structured Data Graph (SportsTeam, BreadcrumbList, SportsEvent)
  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": ["SportsTeam", "SportsClub"],
        "@id": `${canonicalUrl}#team`,
        "name": team.name,
        "alternateName": team.identity.nickname || undefined,
        "sport": "Fotbal",
        "description":
          team.identity.motto ||
          `Oficiální klubový web fotbalového týmu ${team.name} z obce ${team.village.name}.`,
        "url": canonicalUrl,
        "logo": ogImageUrl,
        "image": ogImageUrl,
        "slogan": team.identity.motto || undefined,
        "foundingDate": team.identity.foundingYear ? String(team.identity.foundingYear) : undefined,
        "location": {
          "@type": "Place",
          "name": stadiumName,
          "address": {
            "@type": "PostalAddress",
            "addressLocality": team.village.name,
            "addressRegion": team.village.district,
            "addressCountry": "CZ",
          },
        },
        ...(headCoach && {
          coach: {
            "@type": "Person",
            "name": `${headCoach.firstName} ${headCoach.lastName}`,
            "jobTitle": "Hlavní trenér",
          },
        }),
        "member": (roster?.aTeam || []).slice(0, 20).map((p) => ({
          "@type": "Person",
          "name": `${p.firstName} ${p.lastName}`,
          "jobTitle": p.positionName || p.position,
        })),
      },
      {
        "@type": "BreadcrumbList",
        "@id": `${canonicalUrl}#breadcrumb`,
        "itemListElement": [
          {
            "@type": "ListItem",
            "position": 1,
            "name": "Prales",
            "item": SITE_URL,
          },
          {
            "@type": "ListItem",
            "position": 2,
            "name": "Kluby",
            "item": `${SITE_URL}/klub`,
          },
          {
            "@type": "ListItem",
            "position": 3,
            "name": team.name,
            "item": canonicalUrl,
          },
        ],
      },
      ...(matches?.nextMatch
        ? [
            {
              "@type": "SportsEvent",
              "@id": `${canonicalUrl}#next-match`,
              "name": `${matches.nextMatch.isHome ? team.name : matches.nextMatch.opponent.name} vs ${
                matches.nextMatch.isHome ? matches.nextMatch.opponent.name : team.name
              }`,
              "description": `Mistrovské utkání (${matches.nextMatch.round ? `${matches.nextMatch.round}. kolo` : "soutěž"})`,
              "homeTeam": {
                "@type": "SportsTeam",
                "name": matches.nextMatch.isHome ? team.name : matches.nextMatch.opponent.name,
              },
              "awayTeam": {
                "@type": "SportsTeam",
                "name": matches.nextMatch.isHome ? matches.nextMatch.opponent.name : team.name,
              },
              "location": {
                "@type": "Place",
                "name": matches.nextMatch.stadiumName || stadiumName,
                "address": {
                  "@type": "PostalAddress",
                  "addressCountry": "CZ",
                },
              },
            },
          ]
        : []),
    ],
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <ClubWebsiteClient data={data} siteUrl={SITE_URL} />
    </>
  );
}
