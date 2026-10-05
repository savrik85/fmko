import { cache } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";
import type { ClubWebsiteData } from "@okresni-masina/shared";
import { ClubWebsiteClient } from "./ClubWebsiteClient";

export const runtime = "edge";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8787";
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://prales.fun";

type ClubFetch =
  | { status: "ok"; data: ClubWebsiteData }
  | { status: "not_found" }
  | { status: "error" };

/**
 * Data klubu. `cache()` zajistí jediné volání API na jedno vykreslení: metadata
 * i stránka dřív volaly endpoint každá zvlášť. 404 (neznámá adresa) se liší od
 * výpadku API, aby výpadek nevypadal jako smazaný klub.
 */
const fetchClub = cache(async (identifier: string): Promise<ClubFetch> => {
  try {
    const r = await fetch(`${API}/api/teams/${encodeURIComponent(identifier)}/website`, { cache: "no-store" });
    if (r.status === 404) return { status: "not_found" };
    if (!r.ok) {
      console.error("klubový web: API vrátilo chybu", identifier, r.status);
      return { status: "error" };
    }
    const data = (await r.json()) as ClubWebsiteData;
    return data?.team ? { status: "ok", data } : { status: "not_found" };
  } catch (e) {
    console.error("klubový web: načtení dat selhalo", identifier, e);
    return { status: "error" };
  }
});

/**
 * JSON-LD jde do HTML jako surový text uvnitř <script>. Bez escapování by motto
 * s `</script>` ukončilo blok a zbytek by prohlížeč spustil jako HTML (XSS).
 */
function serializeJsonLd(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ teamId: string }>;
}): Promise<Metadata> {
  const { teamId } = await params;
  const result = await fetchClub(decodeURIComponent(teamId));
  if (result.status !== "ok") {
    return {
      title: result.status === "not_found" ? "Klubový web nenalezen · Prales" : "Klubový web · Prales",
      description: "Oficiální klubový web amatérského fotbalového týmu.",
      robots: { index: false, follow: false },
    };
  }

  const { team, website } = result.data;
  const canonicalSlug = website?.customSlug || team.id;
  const canonicalUrl = `${SITE_URL}/klub/${canonicalSlug}`;
  const ogImageUrl = `${SITE_URL}/klub/${team.id}/opengraph-image`;

  const baseName = team.identity.nickname
    ? `${team.name} „${team.identity.nickname}“`
    : team.name;

  const stadiumName = team.stadium?.name || "Místní hřiště";

  const desc =
    team.identity.motto
      ? `${baseName}: ${team.identity.motto}. Oficiální klubový web: ${team.village.name}, okres ${team.village.district}. Sestavy, výsledky, stadion a vstupenky.`
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
      siteName: "Prales · Okresní mašina",
      locale: "cs_CZ",
      type: "website",
      images: [
        {
          url: ogImageUrl,
          width: 1200,
          height: 630,
          alt: `${baseName}: oficiální klubový profil, soupiska a zápasy`,
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
  const identifier = decodeURIComponent(teamId);
  const result = await fetchClub(identifier);

  if (result.status === "not_found") notFound();
  if (result.status === "error") {
    return (
      <main className="min-h-screen flex items-center justify-center bg-[#0a0f0a] text-white p-6">
        <div className="text-center max-w-md">
          <div className="text-6xl mb-4">🔧</div>
          <h1 className="text-3xl font-heading font-[900] mb-2">Klubový web je dočasně nedostupný</h1>
          <p className="text-white/70 text-base mb-8">
            Nepodařilo se načíst data klubu. Zkus to prosím za chvíli znovu.
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

  const data = result.data;
  const { team, website, roster, staff, matches } = data;

  // Stará nebo odhadnutá adresa (např. /klub/brevnov) přesměruje na hlavní, aby každý
  // klub měl jedinou adresu a sdílené odkazy po přejmenování dál fungovaly.
  // Odkazy přes ID necháváme, ty používá hra uvnitř.
  if (website?.customSlug && identifier !== website.customSlug && identifier !== team.id) {
    permanentRedirect(`/klub/${website.customSlug}`);
  }

  const canonicalSlug = website?.customSlug || team.id;
  const canonicalUrl = `${SITE_URL}/klub/${canonicalSlug}`;
  const ogImageUrl = `${SITE_URL}/klub/${team.id}/opengraph-image`;
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
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(jsonLd) }}
      />
      <ClubWebsiteClient data={data} siteUrl={SITE_URL} />
    </>
  );
}
