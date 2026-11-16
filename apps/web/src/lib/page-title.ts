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
  "/zamestnanci/skaut": "Skaut",
  "/prestupy": "Přestupy",
  "/sazky": "Sázky",
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
  "/rozpis": "Rozpis",
  "/kalendar": "Kalendář",
  "/hlasovani": "Sněm Pralesu",
  "/novinky": "Co je nového",
  "/muj-klub": "Klubový web",
  "/muj-klub/dres": "Dres",
  "/muj-klub/stadion": "Stadion",
  "/muj-klub/identita": "Identita",
  "/muj-klub/hymna": "Hymna",
  "/muj-klub/maskot": "Maskot",
  "/obec": "Obec",
  "/reputace": "Reputace",
  "/fanousci": "Fanoušci",
  "/u21": "Mládež",
  "/akademie": "Mládež",
  "/pohar": "Pohár",
  "/turnaj": "Turnaj",
  "/rozhodci": "Rozhodčí",
  "/soutez": "Grémium",
  "/vice": "Více",
  "/napoveda": "Nápověda",
  "/aplikace": "Nainstaluj",
  "/pozvat": "Pozvánka",
  "/redakce": "Redakce",
  "/trener": "Trenér",
  "/trener/skripta": "Skripta",
  "/trener/test": "Test",
};

const PREFIX_TITLES: Array<[string, string]> = [
  ["/hrac/", "Hráč"],
  ["/tym/", "Tým"],
  ["/sponzor/", "Sponzor"],
  ["/zapas/", "Zápas"],
  ["/telefon/", "Konverzace"],
  ["/manazer/", "Trenér"],
  ["/rozhodci/", "Rozhodčí"],
  ["/redakce/", "Redakce"],
  ["/zpravodaj/rozhovor/", "Rozhovor"],
  ["/obec/", "Obec"],
  ["/pohar/tym/", "Tým v poháru"],
  ["/prestupy/nabidka/", "Nabídka"],
  ["/prestupy/jednani/", "Jednání"],
];

export function pageTitleFor(pathname: string): string {
  const exact = PAGE_TITLES[pathname];
  if (exact) return exact;
  // Stadion cizího klubu leží pod /tym/{id}/stadion; bez výjimky by se jmenoval „Tým“.
  if (pathname.startsWith("/tym/") && pathname.endsWith("/stadion")) return "Stadion";
  for (const [prefix, title] of PREFIX_TITLES) {
    if (pathname.startsWith(prefix)) return title;
  }
  return "";
}
