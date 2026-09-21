import type { NextConfig } from "next";

// Stránky hry dřív žily pod /dashboard/… a s anglickými názvy. Staré adresy musí
// přesměrovávat NAPOŘÁD: vedou na ně notifikace uložené v DB, nainstalované PWA
// (start_url), už odeslané push zprávy i záložky hráčů.
// Tady jsou jen sekce, které se přejmenovaly; ostatní jen ztratily /dashboard.
const RENAMED_SECTIONS: Record<string, string> = {
  squad: "kadr",
  training: "trenink",
  transfers: "prestupy",
  watchlist: "sledovani",
  player: "hrac",
  team: "tym",
  manager: "manazer",
  match: "zapas",
  friendly: "pratelaky",
  schedule: "rozpis",
  calendar: "kalendar",
  "hall-of-fame": "sin-slavy",
  phone: "telefon",
  news: "zpravodaj",
  klub: "muj-klub",
  stadium: "stadion",
  fans: "fanousci",
  finances: "finance",
  sponsors: "sponzori",
  equipment: "vybaveni",
  events: "udalosti",
  more: "vice",
  settings: "nastaveni",
  invite: "pozvat",
  app: "aplikace",
};

const nextConfig: NextConfig = {
  transpilePackages: ["@okresni-masina/shared", "@okresni-masina/ui"],
  // Source mapy pro PostHog Error Tracking. CI je po buildu nahraje do PostHogu
  // a z výstupu smaže, na web se nedostanou.
  productionBrowserSourceMaps: true,
  async redirects() {
    return [
      { source: "/dashboard", destination: "/prehled", permanent: true },
      // Podstránky, které se přejmenovaly uvnitř sekce — musí být před obecnými pravidly.
      { source: "/dashboard/transfers/offer/:id", destination: "/prestupy/nabidka/:id", permanent: true },
      { source: "/dashboard/match/:id/replay", destination: "/zapas/:id/zaznam", permanent: true },
      { source: "/dashboard/team/:id/stadium", destination: "/tym/:id/stadion", permanent: true },
      ...Object.entries(RENAMED_SECTIONS).map(([oldName, newName]) => ({
        source: `/dashboard/${oldName}/:path*`,
        destination: `/${newName}/:path*`,
        permanent: true,
      })),
      { source: "/dashboard/:path*", destination: "/:path*", permanent: true },
      { source: "/login", destination: "/prihlaseni", permanent: true },
      { source: "/register", destination: "/registrace", permanent: true },
      { source: "/invite/:id", destination: "/pozvanka/:id", permanent: true },
      { source: "/match-day/:id", destination: "/zapasovy-den/:id", permanent: true },
      { source: "/season-end", destination: "/konec-sezony", permanent: true },
    ];
  },
};

export default nextConfig;
