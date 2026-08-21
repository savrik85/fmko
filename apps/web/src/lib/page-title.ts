/**
 * Názvy stránek na jednom místě.
 *
 * Dřív žila mapa uvnitř FMTopBar a na mobilu se název vůbec nezobrazoval
 * (`hidden sm:flex`), takže po přechodu na Reputaci nebo Události nebylo
 * z čeho poznat, kde hráč je. Teď titulek nese hlavička stránky — na všech
 * šířkách stejně — a horní lišta zůstává jen na navigaci a peníze.
 */

const PAGE_TITLES: Record<string, string> = {
  "/dashboard": "Domů",
  "/dashboard/squad": "Kádr",
  "/dashboard/match": "Sestava",
  "/dashboard/friendly": "Přáteláky",
  "/dashboard/training": "Tréninky",
  "/dashboard/zamestnanci": "Zaměstnanci",
  "/dashboard/transfers": "Přestupy",
  "/dashboard/watchlist": "Sledovaní hráči",
  "/dashboard/finances": "Finance",
  "/dashboard/sponsors": "Sponzoři",
  "/dashboard/equipment": "Vybavení",
  "/dashboard/stadium": "Stadion",
  "/dashboard/events": "Události",
  "/dashboard/hospoda": "Hospoda",
  "/dashboard/hall-of-fame": "Síň slávy",
  "/dashboard/news": "Zpravodaj",
  "/dashboard/phone": "Zprávy",
  "/dashboard/liga": "Liga",
  "/dashboard/settings": "Nastavení",
  "/dashboard/admin": "Administrace",
  "/dashboard/schedule": "Rozpis zápasů",
  "/dashboard/calendar": "Kalendář",
  "/dashboard/hlasovani": "Sněm Pralesu",
  "/dashboard/novinky": "Co je nového",
  "/dashboard/klub": "Klub",
  "/dashboard/klub/dres": "Dres",
  "/dashboard/klub/stadion": "Stadion klubu",
  "/dashboard/klub/identita": "Identita klubu",
  "/dashboard/klub/hymna": "Hymna",
  "/dashboard/klub/maskot": "Maskot",
  "/dashboard/obec": "Obec",
  "/dashboard/reputace": "Reputace",
  "/dashboard/fans": "Fanoušci",
  "/dashboard/u21": "U21",
  "/dashboard/pohar": "Pohár",
  "/dashboard/rozhodci": "Rozhodčí",
  "/dashboard/soutez": "Grémium soutěže",
  "/dashboard/more": "Více",
  "/dashboard/napoveda": "Nápověda",
  "/dashboard/app": "Nainstaluj",
  "/dashboard/invite": "Pozvi kamaráda",
  "/dashboard/redakce": "Redakce",
};

const PREFIX_TITLES: Array<[string, string]> = [
  ["/dashboard/player/", "Profil hráče"],
  ["/dashboard/team/", "Profil týmu"],
  ["/dashboard/match/", "Výsledek zápasu"],
  ["/dashboard/phone/", "Konverzace"],
  ["/dashboard/manager/", "Profil trenéra"],
  ["/dashboard/rozhodci/", "Rozhodčí"],
  ["/dashboard/redakce/", "Redakce"],
  ["/dashboard/pohar/tym/", "Tým v poháru"],
  ["/dashboard/transfers/offer/", "Nabídka"],
];

export function pageTitleFor(pathname: string): string {
  const exact = PAGE_TITLES[pathname];
  if (exact) return exact;
  for (const [prefix, title] of PREFIX_TITLES) {
    if (pathname.startsWith(prefix)) return title;
  }
  return "";
}
