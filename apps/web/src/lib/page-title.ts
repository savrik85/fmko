/**
 * Názvy stránek na jednom místě.
 *
 * Dřív žila mapa uvnitř FMTopBar a na mobilu se název vůbec nezobrazoval
 * (`hidden sm:flex`), takže po přechodu na Reputaci nebo Události nebylo
 * z čeho poznat, kde hráč je. Teď titulek nese hlavička stránky — na všech
 * šířkách stejně — a horní lišta zůstává jen na navigaci a peníze.
 */

const PAGE_TITLES: Record<string, string> = {
  "/prehled": "Domů",
  "/kadr": "Kádr",
  "/zapas": "Sestava",
  "/pratelaky": "Přáteláky",
  "/trenink": "Tréninky",
  "/zamestnanci": "Zaměstnanci",
  "/prestupy": "Přestupy",
  "/sledovani": "Sledovaní hráči",
  "/sazky": "Sázková kancelář",
  "/finance": "Finance",
  "/sponzori": "Sponzoři",
  "/vybaveni": "Vybavení",
  "/stadion": "Stadion",
  "/udalosti": "Události",
  "/hospoda": "Hospoda",
  "/sin-slavy": "Síň slávy",
  "/zpravodaj": "Zpravodaj",
  "/telefon": "Telefon",
  "/liga": "Liga",
  "/nastaveni": "Nastavení",
  "/admin": "Administrace",
  "/rozpis": "Rozpis zápasů",
  "/kalendar": "Kalendář",
  "/hlasovani": "Sněm Pralesu",
  "/novinky": "Co je nového",
  "/muj-klub": "Klub",
  "/muj-klub/dres": "Dres",
  "/muj-klub/stadion": "Stadion klubu",
  "/muj-klub/identita": "Identita klubu",
  "/muj-klub/hymna": "Hymna",
  "/muj-klub/maskot": "Maskot",
  "/obec": "Obec",
  "/reputace": "Reputace",
  "/fanousci": "Fanoušci",
  "/u21": "U21",
  "/pohar": "Pohár",
  "/rozhodci": "Rozhodčí",
  "/soutez": "Grémium soutěže",
  "/vice": "Více",
  "/napoveda": "Nápověda",
  "/aplikace": "Nainstaluj",
  "/pozvat": "Pozvi kamaráda",
  "/redakce": "Redakce",
  "/trener": "Profil trenéra",
  "/trener/skripta": "Skripta",
  "/trener/test": "Závěrečný test",
};

const PREFIX_TITLES: Array<[string, string]> = [
  ["/hrac/", "Profil hráče"],
  ["/tym/", "Profil týmu"],
  ["/sponzor/", "Sponzor"],
  ["/zapas/", "Výsledek zápasu"],
  ["/telefon/", "Konverzace"],
  ["/manazer/", "Profil trenéra"],
  ["/rozhodci/", "Rozhodčí"],
  ["/redakce/", "Redakce"],
  ["/pohar/tym/", "Tým v poháru"],
  ["/prestupy/nabidka/", "Nabídka"],
];

export function pageTitleFor(pathname: string): string {
  const exact = PAGE_TITLES[pathname];
  if (exact) return exact;
  for (const [prefix, title] of PREFIX_TITLES) {
    if (pathname.startsWith(prefix)) return title;
  }
  return "";
}
