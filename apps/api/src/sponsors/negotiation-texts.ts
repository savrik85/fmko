/**
 * Odpovědi majitele firmy v kole jednání. Fanoušek a patriot tykají, obchodník a opatrný
 * vykají (stejně jako SMS majitelů). Majitelé jsou muži (generateSponsorOwner). Žádná dlouhá pomlčka.
 */
import type { OwnerPersonality } from "./owners";
import type { PromiseKind } from "./promise-kinds";

export const RESPONSE_KINDS = ["accept", "counter_money", "counter_wish", "reject", "insulted", "walked_away"] as const;
export type ResponseKind = (typeof RESPONSE_KINDS)[number];

/** Přání ve 4. pádě pro větu „slib mi …" / „přidejte …". */
export const WISH_ACCUSATIVE: Record<PromiseKind, string> = {
  league_position: "slušné umístění v lize",
  promotion: "postup",
  no_relegation: "záchranu v soutěži",
  cup_round: "pořádnou jízdu v poháru",
  coach_licence: "vyšší trenérskou licenci",
  stadium_upgrade: "modernizaci stadionu",
  jersey_logo: "logo na rukávu dresu",
  sector_exclusivity: "exkluzivitu mého oboru",
  attendance: "plný stadion",
  youth: "víc mladých kluků v sestavě",
  reputation: "dobré jméno klubu",
  no_riots: "klid na tribunách",
};

const TEXTS: Record<OwnerPersonality, Record<ResponseKind, readonly string[]>> = {
  patriot: {
    accept: ["Plácneme si. Pro naše kluky rád.", "Beru. Ať je to vidět na hřišti i v hospodě."],
    counter_money: ["Tolik ti dát nemůžu. Takhle to jde, co ty na to?", "Trochu jsem to přitáhl, víc firma neunese."],
    counter_wish: ["Dám ti, co chceš, když mi slíbíš {wish}.", "Tvůj návrh beru, jen přidej {wish}. To je pro mě srdcovka."],
    reject: ["Tohle nepůjde, jsme malá firma.", "Takhle ne. Zkus to přepočítat."],
    insulted: ["Děláš si ze mě legraci? Takové peníze nemám.", "Tohle mě urazilo. Myslel jsem, že si rozumíme."],
    walked_away: ["Dost. Teď se mi chvíli neozývej.", "Nechme toho, za pár týdnů možná."],
  },
  businessman: {
    accept: ["Dohodnuto. Připravím smlouvu.", "Čísla sedí, jdeme do toho."],
    counter_money: ["Tohle je můj strop. Upravil jsem to, podívejte se.", "V téhle podobě to neprojde. Posílám upravenou verzi."],
    counter_wish: ["Návrh přijmu, pokud k němu přidáte {wish}.", "Za {wish} vám to podepíšu tak, jak to je."],
    reject: ["Tohle se mi nevyplatí.", "Na tyhle podmínky nemám rozpočet."],
    insulted: ["Takovou nabídku nemůžu brát vážně.", "S tímhle za mnou příště nechoďte."],
    walked_away: ["Myslím, že jsme skončili. Ozvěte se za pár týdnů.", "Tady se neshodneme. Odložíme to."],
  },
  fan: {
    accept: ["Jasně, beru! Ať to lítá.", "Plácnem si, na tohle jsem čekal."],
    counter_money: ["Tolik ne. Takhle to dám.", "Kousek jsem ubral, víc to nejde."],
    counter_wish: ["Beru, ale slib mi {wish}. Chci vidět výsledky.", "Dám ti to celé, když přidáš {wish}."],
    reject: ["To je moc i na mě.", "Tohle nedám, přepočítej to."],
    insulted: ["To snad nemyslíš vážně.", "Po tomhle mě chvíli nezvi ani na pivo."],
    walked_away: ["Mám toho dost. Ozvi se za pár týdnů.", "Končím. Za čas uvidíme."],
  },
  cautious: {
    accept: ["Dobře. S tímhle můžu v klidu spát.", "Souhlasím, podmínky jsou rozumné."],
    counter_money: ["Tolik riskovat nechci. Navrhuji tohle.", "Takhle je to pro mě přijatelné."],
    counter_wish: ["Přijmu to, když mi zaručíte {wish}.", "Potřebuji jistotu. Přidejte {wish} a podepíšu."],
    reject: ["To je pro mě moc velké riziko.", "Na tohle nemohu přistoupit."],
    insulted: ["To je nepřiměřené. Jsem zklamaný.", "Takhle se jednat nedá."],
    walked_away: ["Raději to na čas uzavřeme.", "Teď ne. Zkusíme to jindy."],
  },
};

export function ownerResponse(
  personality: OwnerPersonality, kind: ResponseKind, roundIndex: number, wish?: PromiseKind,
): string {
  const pool = TEXTS[personality][kind];
  const text = pool[Math.abs(roundIndex) % pool.length];
  return text.replace("{wish}", wish ? WISH_ACCUSATIVE[wish] : "něco navíc");
}
