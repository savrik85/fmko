import type { NextConfig } from "next";

// Stránky hry dřív žily pod /dashboard/… a s anglickými názvy. Staré adresy musí
// přesměrovávat NAPOŘÁD: vedou na ně notifikace uložené v DB, nainstalované PWA
// (start_url), už odeslané push zprávy i záložky hráčů.
//
// Každá stará stránka má právě jedno pravidlo a žádná dvě se nepřekrývají.
// Cloudflare Pages (next-on-pages) totiž nedodržuje pořadí pravidel: obecné
// /dashboard/:path* tam přebilo konkrétní /dashboard/squad → /kadr a hráč
// skončil na /squad (404). Proto žádné zástupné :path*.
const OLD_TO_NEW_PATHS: [string, string][] = [
  ["/dashboard", "/prehled"],
  ["/dashboard/admin", "/admin"],
  ["/dashboard/app", "/aplikace"],
  ["/dashboard/calendar", "/kalendar"],
  ["/dashboard/equipment", "/vybaveni"],
  ["/dashboard/events", "/udalosti"],
  ["/dashboard/fans", "/fanousci"],
  ["/dashboard/fans/vudce/:id", "/fanousci/vudce/:id"],
  ["/dashboard/finances", "/finance"],
  ["/dashboard/friendly", "/pratelaky"],
  ["/dashboard/hall-of-fame", "/sin-slavy"],
  ["/dashboard/hlasovani", "/hlasovani"],
  ["/dashboard/hospoda", "/hospoda"],
  ["/dashboard/incidenty", "/incidenty"],
  ["/dashboard/invite", "/pozvat"],
  // Stránka nikdy neexistovala, ale vede na ni starší notifikace „Kabina".
  ["/dashboard/kadr", "/kadr"],
  ["/dashboard/klub", "/muj-klub"],
  ["/dashboard/klub/:subpage", "/muj-klub/:subpage"],
  ["/dashboard/liga", "/liga"],
  ["/dashboard/manager/:id", "/manazer/:id"],
  ["/dashboard/match", "/zapas"],
  ["/dashboard/match/:id", "/zapas/:id"],
  ["/dashboard/match/:id/replay", "/zapas/:id/zaznam"],
  ["/dashboard/more", "/vice"],
  ["/dashboard/napoveda", "/napoveda"],
  ["/dashboard/news", "/zpravodaj"],
  ["/dashboard/novinky", "/novinky"],
  ["/dashboard/obec", "/obec"],
  ["/dashboard/phone", "/telefon"],
  ["/dashboard/phone/:id", "/telefon/:id"],
  ["/dashboard/player/:id", "/hrac/:id"],
  ["/dashboard/pohar", "/pohar"],
  ["/dashboard/pohar/tym/:id", "/pohar/tym/:id"],
  ["/dashboard/redakce/:id", "/redakce/:id"],
  ["/dashboard/reputace", "/reputace"],
  ["/dashboard/rozhodci", "/rozhodci"],
  ["/dashboard/rozhodci/:id", "/rozhodci/:id"],
  ["/dashboard/sazky", "/sazky"],
  ["/dashboard/schedule", "/rozpis"],
  ["/dashboard/settings", "/nastaveni"],
  ["/dashboard/soutez", "/soutez"],
  ["/dashboard/sponsors", "/sponzori"],
  ["/dashboard/squad", "/kadr"],
  ["/dashboard/stadium", "/stadion"],
  ["/dashboard/team/:id", "/tym/:id"],
  ["/dashboard/team/:id/stadium", "/tym/:id/stadion"],
  ["/dashboard/training", "/trenink"],
  ["/dashboard/transfers", "/prestupy"],
  ["/dashboard/transfers/offer/:id", "/prestupy/nabidka/:id"],
  ["/dashboard/u21", "/u21"],
  ["/dashboard/watchlist", "/sledovani"],
  ["/dashboard/zamestnanci", "/zamestnanci"],
  ["/login", "/prihlaseni"],
  ["/register", "/registrace"],
  ["/invite/:id", "/pozvanka/:id"],
  ["/match-day/:id", "/zapasovy-den/:id"],
  ["/season-end", "/konec-sezony"],
];

const nextConfig: NextConfig = {
  transpilePackages: ["@okresni-masina/shared", "@okresni-masina/ui"],
  // Source mapy pro PostHog Error Tracking. CI je po buildu nahraje do PostHogu
  // a z výstupu smaže, na web se nedostanou.
  productionBrowserSourceMaps: true,
  async redirects() {
    return OLD_TO_NEW_PATHS.map(([source, destination]) => ({ source, destination, permanent: true }));
  },
};

export default nextConfig;
