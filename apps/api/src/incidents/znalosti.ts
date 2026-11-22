/**
 * Co hráči vědí o incidentech a co z toho smí model říct (spec Část 10).
 * Čisté funkce bez DB. Zápis a načtení: `znalosti-db.ts`.
 *
 * Tvrdé pravidlo: model mluví jen z toho, co je v DB. Tajné role (svědek, kamarád,
 * rival, pachatel) se do promptu dostanou jen v rozhovoru o incidentu a vždy s pokynem
 * podle uloženého výsledku výslechu. Jinak by model sám „prozradil" něco, co DB nemá.
 * Výjimka: odhalený pachatel o svém provaleném průšvihu ví v každém hovoru (`isOwnRevealedOffence`).
 */

import type { Rng } from "../generators/rng";
import { gameExpiry } from "../lib/game-time";
import { CATEGORY_LABELS } from "../equipment/equipment-generator";
import { nazevIncidentu } from "./katalog";
import { nactiZtraty } from "./popis";
import {
  MAX_INCIDENTU_V_PROMPTU, OCHOTA_ROLE, ZNALOST_KADR_DNI, ZNALOST_KADR_ZAVAZNA_DNI, ZNALOST_PACHATEL_DNI,
} from "./nastaveni";
import { nazevSituace } from "./situace";
import { MISTO_INCIDENTU, MISTO_TEXT } from "./stopy";
import { text, TEXTY, vypln } from "./texty";
import type { NavrhIncidentu, NavrhStopy, StavKlubu, Ztrata } from "./typy";

export type RoleZnalosti = "kadr" | "svedek" | "kamarad" | "rival" | "pachatel" | "obvineny" | "drb";
export type RoleSvedka = "svedek" | "kamarad" | "rival";
export type VysledekVyslechu = "prozradil" | "kryje" | "zapira" | "priznal";

/** Incident, na který se trenér v konverzaci ptá. `den` = `YYYY-MM-DD` herního dne, kdy se téma nastavilo. */
export interface TemaKonverzace {
  incidentId: string;
  den: string;
}

/** Role, které hráč nese i mimo rozhovor o incidentu. Ostatní jsou tajné (spec 10b). */
export const VEREJNE_ROLE: ReadonlySet<RoleZnalosti> = new Set<RoleZnalosti>(["kadr", "obvineny", "drb"]);

const KLIC_ZNALOSTI = { svedek: "znalost_svedek", kamarad: "znalost_kamarad", rival: "znalost_rival" } as const;
const PORADI_ROLI: Record<RoleZnalosti, number> = { kadr: 0, drb: 1, obvineny: 2, svedek: 3, kamarad: 4, rival: 5, pachatel: 6 };

export interface NovaZnalost {
  playerId: string;
  role: RoleZnalosti;
  fact: string;
  ochota: number;
  /**
   * Herní den ISO, do kdy si to hráč pamatuje. Svědek, kamarád a rival mají den vzniku:
   * jejich znalost platí, dokud je incident otevřený, a týden po uzavření (počítá se při čtení).
   */
  until: string;
}

/** Znalosti nového incidentu pro aktivní kádr (spec 10a). `stopy` jen ty, které se opravdu zapíšou. */
export function znalostiIncidentu(stav: StavKlubu, navrh: NavrhIncidentu, stopy: readonly NavrhStopy[], rng: Rng): NovaZnalost[] {
  const kadrDo = gameExpiry(stav.gameDate, navrh.severity >= 3 ? ZNALOST_KADR_ZAVAZNA_DNI : ZNALOST_KADR_DNI);
  const znalosti: NovaZnalost[] = stav.kadr.map((h): NovaZnalost => ({
    playerId: h.id, role: "kadr", fact: navrh.text, ochota: 50, until: kadrDo,
  }));

  // Životní situace: kádr zná veřejný text, dotčený hráč to prožívá sám (spec 10a).
  if (navrh.category === "zivotni") {
    if (!navrh.subjectPlayerId) return znalosti;
    znalosti.push({
      playerId: navrh.subjectPlayerId, role: "pachatel", ochota: 0,
      // Kádr zná veřejný text ve třetí osobě (`navrh.text`), dotčený hráč sám sebe ve svém
      // vlastním chatu ne — proto krátký název situace, ne cizí věta o něm ve třetí osobě.
      fact: vypln(TEXTY.znalost_situace[0], { nazev: nazevSituace(navrh.kind) }),
      until: gameExpiry(stav.gameDate, navrh.dniTrvani ?? ZNALOST_KADR_DNI),
    });
    return znalosti;
  }

  const pachatel = navrh.culpritType === "hrac" ? stav.kadr.find((h) => h.id === navrh.culpritPlayerId) ?? null : null;
  if (!pachatel) return znalosti;
  znalosti.push({
    playerId: pachatel.id, role: "pachatel", ochota: 0,
    fact: vypln(TEXTY.znalost_pachatel[0], { nazev: nazevIncidentu(navrh.kind) }),
    until: gameExpiry(stav.gameDate, ZNALOST_PACHATEL_DNI),
  });

  const misto = MISTO_INCIDENTU[navrh.kind];
  const hodnoty = { hrac: pachatel.jmeno, misto: misto ? MISTO_TEXT[misto] : "u hřiště" };
  const zapsane = new Set<string>();
  for (const s of stopy) {
    if (s.zdroj !== "svedek" && s.zdroj !== "kamarad" && s.zdroj !== "rival") continue;
    if (!s.drzitel || s.ukazujeNa !== pachatel.id) continue;
    // Klíč tabulky je (incident, hráč, role): druhá stopa téhož držitele nic nového neví.
    const klic = `${s.drzitel}|${s.zdroj}`;
    if (zapsane.has(klic)) continue;
    zapsane.add(klic);
    const [min, max] = OCHOTA_ROLE[s.zdroj];
    znalosti.push({
      playerId: s.drzitel, role: s.zdroj,
      fact: text(rng, KLIC_ZNALOSTI[s.zdroj], hodnoty),
      ochota: rng.int(min, max),
      until: stav.gameDate,
    });
  }
  return znalosti;
}

/** Řádek dotazu `nactiZnalostiHrace` (znalost + incident + jméno odhaleného pachatele). */
export interface RadekZnalostiDb {
  incident_id: string;
  role: RoleZnalosti;
  fact: string;
  interrogation: VysledekVyslechu | null;
  kind: string;
  category: string;
  severity: number;
  game_date: string;
  status: string;
  resolution: string | null;
  culprit_revealed: number;
  culprit_player_id: string | null;
  /** Lup je zpátky v klubu (vrácený, dopadený policií). Starší dotazy ho nemají. */
  recovered?: number | null;
  /** JSON ztrát incidentu (typ `Ztrata`): co pachatel vzal. Starší dotazy ho nemají. */
  loss?: string | null;
  /** Kdy incident vznikl (skutečný čas): od té doby se hledá, jestli pachatel v SMS zapíral. */
  created_at?: string | null;
  /** Kdy životní situace končí (herní den). Starší dotazy ho nemají. */
  ends_on?: string | null;
  pachatel_jmeno: string | null;
  pachatel_prijmeni: string | null;
}

export interface RadekZnalosti {
  incidentId: string;
  role: RoleZnalosti;
  fact: string;
  /** Uložený výsledek výslechu, `null` = hráč ještě nebyl vyslechnut. */
  vyslech: VysledekVyslechu | null;
  kategorie: string;
  zavaznost: number;
  /** `YYYY-MM-DD` herního dne incidentu. */
  den: string;
  /** Kolik herních dní uplynulo od incidentu. */
  predDny: number;
  stav: string;
  vysledek: string | null;
  odhalen: boolean;
  /** Jméno odhaleného pachatele, jinak `null`. */
  pachatel: string | null;
  /** Hráč, o jehož prompt jde, je sám odhalený pachatel. */
  pachatelJeOn: boolean;
  /** Lup je zpátky v klubu. Nenačtené = ne. */
  recovered?: boolean;
  /** Co se u krádeže vzalo, slovy („dresy“, „31 696 Kč“). Jinak nic. */
  loot?: string;
  /** Kdy incident vznikl (skutečný čas). */
  createdAt?: string;
  /** Odhalený pachatel to dřív trenérovi v SMS zapíral (`znalosti-db.ts`). */
  deniedBefore?: boolean;
  /** Životní situace už skončila (uzavřená, nebo po `ends_on`): jako probíhající do promptu nepatří. */
  situationOver?: boolean;
}

/** Co pachatel vzal, pro prompt: věci malým písmenem, hotovost v Kč, poháry z vitríny poznáme. */
export function stolenWhat(kind: string, losses: readonly Ztrata[]): string {
  const items = losses.flatMap((z) => z.typ === "vybaveni"
    ? [kind === "vitrina" ? "poháry z vitríny" : lowerFirst(CATEGORY_LABELS[z.kategorie] ?? z.kategorie)]
    : []);
  const cash = losses.flatMap((z) => (z.typ === "penize" && z.castka > 0 ? [`${z.castka.toLocaleString("cs-CZ")} Kč`] : []));
  return [...new Set(items), ...cash].join(", ");
}

function lowerFirst(s: string): string {
  return s.charAt(0).toLowerCase() + s.slice(1);
}

/**
 * Pachatel v SMS zapírá („nic sem neukradl“, „v životě bych dresy nevzal“, „nebyl jsem to“).
 * Hrdlička (Kávoviny) zapíral 21. 11. a model se pak držel vlastní historie i proti pokynu
 * „nezapírej“: 4 ze 4 zapřel, s větou „dřív jsi zapíral, to už neplatí“ 3 ze 3 přiznal (E2E 22. 11.).
 */
const DENIAL_RE = /\b(neukradl|nevzal|nebral|nerozbil|neudelal jsem|nebyl jsem to|to jsem nebyl|ja to nebyl|to nebylo ode me|nemam s tim nic|o nicem nevim|nevim o cem mluvis|nic nevim o (zadn\w*|tom|tem)|(je|bude) to (nejakej |nejaky )?omyl)\b/;

export function deniesOffence(text: string): boolean {
  return DENIAL_RE.test(text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase());
}

function dnyMezi(od: string, do_: string): number {
  return Math.max(0, Math.round((Date.parse(do_.slice(0, 10)) - Date.parse(od.slice(0, 10))) / 86_400_000));
}

export function radekZnalosti(r: RadekZnalostiDb, playerId: string, dnes: string): RadekZnalosti {
  const odhalen = r.culprit_revealed === 1;
  const jmeno = [r.pachatel_jmeno, r.pachatel_prijmeni].filter(Boolean).join(" ");
  return {
    incidentId: r.incident_id, role: r.role, fact: r.fact, vyslech: r.interrogation,
    kategorie: r.category, zavaznost: r.severity, den: r.game_date.slice(0, 10), predDny: dnyMezi(r.game_date, dnes),
    stav: r.status, vysledek: r.resolution, odhalen,
    // Neodhaleného pachatele prompt znát nesmí, i kdyby dotaz jméno vrátil.
    pachatel: odhalen && jmeno ? jmeno : null,
    pachatelJeOn: odhalen && r.culprit_player_id === playerId,
    recovered: r.recovered === 1,
    ...(r.category === "kradez" && r.loss ? { loot: stolenWhat(r.kind, nactiZtraty(r.loss)) || undefined } : {}),
    ...(r.created_at ? { createdAt: r.created_at } : {}),
    ...(lifeSituationOver(r, dnes) ? { situationOver: true } : {}),
  };
}

/**
 * Skončená životní situace: „Oliver Mráz se chystá do porodnice“ zůstal v promptu (znalost
 * kádru platí 14 dní) i vedle „vrátili jste se z porodnice“ (E2E 22. 11.). Co se stalo potom,
 * zná hráč z `loadRecentLifeEvent` (life-news.ts). Konec = incident uzavřený, nebo už je po
 * `ends_on` (denní tick ho uzavře až ráno).
 */
function lifeSituationOver(r: Pick<RadekZnalostiDb, "category" | "status" | "ends_on">, dnes: string): boolean {
  if (r.category !== "zivotni") return false;
  if (r.status !== "probiha") return true;
  return !!r.ends_on && r.ends_on.slice(0, 10) <= dnes.slice(0, 10);
}

/**
 * Pachatel, na kterého se přišlo (incident ho odhalil, nebo se trenérovi přiznal). Svůj průšvih
 * nese po celou platnost role i mimo téma hovoru: veřejná znalost kádru vyprší za 14 dní a bez
 * tohoto řádku by do promptu šlo „o žádné krádeži nevíš“ a hráč by zapřel, k čemu se přiznal.
 * Hrozba z hospody a životní situace sem nepatří, ty nejsou provalený čin.
 */
export function isOwnRevealedOffence(r: RadekZnalosti): boolean {
  return r.role === "pachatel" && r.kategorie !== "zivotni" && r.stav !== "hrozi"
    && (r.odhalen || r.vyslech === "priznal");
}

/**
 * Tajné role jen k incidentu v tématu (kromě vlastního provaleného průšvihu), nejvýš 3 incidenty:
 * téma, pak vlastní provalený průšvih, pak závažnost, pak nejnovější.
 */
export function vyberZnalosti(radky: readonly RadekZnalosti[], temaId: string | null): RadekZnalosti[] {
  const skupiny = new Map<string, RadekZnalosti[]>();
  for (const r of radky) {
    if (r.situationOver) continue;
    if (!VEREJNE_ROLE.has(r.role) && r.incidentId !== temaId && !isOwnRevealedOffence(r)) continue;
    skupiny.set(r.incidentId, [...(skupiny.get(r.incidentId) ?? []), r]);
  }
  const hasOwnOffence = (skupina: readonly RadekZnalosti[]) => Number(skupina.some(isOwnRevealedOffence));
  return [...skupiny.values()]
    .sort((a, b) =>
      Number(b[0].incidentId === temaId) - Number(a[0].incidentId === temaId)
      || hasOwnOffence(b) - hasOwnOffence(a)
      || b[0].zavaznost - a[0].zavaznost
      || b[0].den.localeCompare(a[0].den))
    .slice(0, MAX_INCIDENTU_V_PROMPTU)
    .flatMap((skupina) => [...skupina].sort((a, b) => PORADI_ROLI[a.role] - PORADI_ROLI[b.role]));
}

export const HLAVICKA_ZNALOSTI =
  "CO VÍŠ O DĚNÍ V KLUBU (jen tohle, nic dalšího si nevymýšlej, nic jiného se nestalo; jména z tohoto bloku smíš zmínit):";
export const BEZ_ZNALOSTI = "- O žádné krádeži, škodě ani jiném průšvihu v klubu nevíš. Když se trenér ptá, řekni, že nic nevíš, a nikoho neobviňuj.";

/** Jak incident dopadl: [o někom jiném, o tobě]. */
const VYSLEDEK_V_PROMPTU: Record<string, readonly [string, string]> = {
  odpustit: ["Trenér mu odpustil.", "Trenér ti odpustil."],
  srazka: ["Trenér mu strhává peníze ze mzdy.", "Trenér ti strhává peníze ze mzdy."],
  pokuta: ["Trenér mu dal pokutu.", "Trenér ti dal pokutu."],
  vyradit: ["Trenér ho vyřadil ze zápasů.", "Trenér tě vyřadil ze zápasů."],
  vyhodit: ["Trenér ho vyhodil z klubu.", "Trenér tě vyhodil z klubu."],
  policie: ["Trenér ho předal policii.", "Trenér tě předal policii."],
  nechat_byt: ["Trenér to nechal být.", "Trenér to nechal být."],
  nevyreseno: ["Nevyřešilo se to.", "Nevyřešilo se to."],
  konec_sezony: ["Nevyřešilo se to.", "Nevyřešilo se to."],
  vyreseno_policii: ["Policie pachatele dopadla.", "Policie pachatele dopadla."],
  nehoda: ["Nakonec se ukázalo, že to byla nehoda.", "Nakonec se ukázalo, že to byla nehoda."],
  nestalo_se: ["Nakonec z toho nic nebylo.", "Nakonec jsi nic neudělal."],
  vratil: ["Lup vrátil.", "Lup jsi vrátil."],
  nahradil: ["Škodu zaplatil ze svého.", "Škodu jsi zaplatil ze svého."],
  opravil: ["Škodu s brigádou opravil.", "Škodu jsi s brigádou opravil."],
};

function kdy(dni: number): string {
  if (dni <= 0) return "dnes";
  if (dni === 1) return "včera";
  return `před ${dni} dny`;
}

function verejnyFakt(r: RadekZnalosti): string {
  const casti = [r.fact, `Stalo se to ${kdy(r.predDny)}.`];
  const vysetruje = r.kategorie === "kradez" || r.kategorie === "poskozeni";
  if (r.pachatelJeOn) casti.push("Přišlo se na to, že jsi to byl ty.");
  else if (r.pachatel) casti.push(`Udělal to ${r.pachatel}.`);
  else if (vysetruje && r.vysledek !== "vyreseno_policii" && r.vysledek !== "nehoda" && r.vysledek !== "nestalo_se") {
    casti.push("Kdo to byl, se v klubu neví.");
  }
  const vysledek = r.vysledek ? VYSLEDEK_V_PROMPTU[r.vysledek] : undefined;
  if (vysledek) casti.push(vysledek[r.pachatelJeOn ? 1 : 0]);
  else if (r.stav === "policie") casti.push("Vyšetřuje to policie.");
  return casti.join(" ");
}

function pokynSvedka(r: RadekZnalosti): string {
  if (r.odhalen) return "Už se ví, kdo to byl, klidně o tom mluv.";
  if (r.vyslech === "prozradil") {
    return r.role === "kamarad" ? "Trenérovi to řekni, i když je ti blbé práskat kamaráda." : "Trenérovi to řekni.";
  }
  // Bez uloženého výsledku mlčí: co DB nemá jako nalezenou stopu, model prozradit nesmí.
  return r.role === "kamarad"
    ? "Kryješ kamaráda. Vykrucuj se a jméno trenérovi neřekni."
    : "Nechceš se do toho plést. Vykrucuj se a jméno trenérovi neřekni.";
}

function pokynPachatele(r: RadekZnalosti): string {
  // Životní situace není průšvih: není co zapírat ani přiznávat (spec 4c).
  if (r.kategorie === "zivotni") return "Je to tvoje starost. Když se trenér zeptá, mluv o tom normálně.";
  // Čin ohlášený v hospodě se ještě nestal (spec 9a).
  if (r.stav === "hrozi") return "Byl jsi v hospodě opilý a vykládal jsi to. Zlehčuj to, a když ti trenér domluví, slib, že nic neuděláš.";
  if (r.odhalen || r.vyslech === "priznal") {
    // Model drží vlastní historii: kdo dřív zapíral, musí výslovně slyšet, že to už neplatí.
    const denied = r.deniedBefore
      ? "Dřív jsi to trenérovi zapíral, to už neplatí: přiznej, že jsi lhal."
      : "Jestli jsi to trenérovi dřív zapíral, to už neplatí: přiznej, že jsi lhal.";
    return `Už se na to přišlo, nezapírej. Když na to přijde řeč, přiznej to a nevykrucuj se, i když je ti to trapné. ${denied}`;
  }
  return "Zapírej, nic nepřiznávej.";
}

/**
 * Výsledky, po kterých lup v klubu je (vrátil ho pachatel nebo policie), nebo se vracet nedá
 * (předal ho policii, vyhodil ho): stejné jako `SETTLED_RESOLUTIONS` v restitution.ts, jinak by
 * hráč slíbil vrácení, které hra nezapíše.
 */
const LOOT_BACK = new Set(["vratil", "nahradil", "vyreseno_policii", "nestalo_se", "nehoda", "opravil", "vyhodit", "bez_skody", "policie"]);

/**
 * U uzavřené krádeže, kde lup zůstal u pachatele: ať nesliboval, co hra neumí. Turek po srážce
 * za poháry slíbil „V pondělí je máš v kabině“ a nic se nestalo (Výškovice, 24. 10.). Vrátit
 * je teď může, když ho o to trenér požádá a on kývne (restitution.ts, amends.ts). Když slíbí
 * sám, slib se zapíše taky (`recordPromisedAmends`), pokyn ho od toho jen odrazuje.
 */
export function lootLine(r: Pick<RadekZnalosti, "kategorie" | "stav" | "vysledek" | "recovered">): string {
  if (r.kategorie !== "kradez" || r.stav !== "uzavreny" || LOOT_BACK.has(r.vysledek ?? "")) return "";
  return r.recovered
    ? "Co jsi vzal, jsi pak klubu vrátil."
    : "Co jsi vzal, máš pořád u sebe, klub to zpátky nedostal. Vrácení trenérovi sám nenabízej ani neslibuj, dokud tě o to výslovně nepožádá. "
      + "Co mu slíbíš, hra zapíše a bere vážně.";
}

/** Provalený vlastní průšvih: co, kdy, jak se na to přišlo a jak to dopadlo, s pokynem nezapírat. */
function ownOffenceLine(r: RadekZnalosti): string {
  const parts = [
    r.fact,
    // „Vloupání do skladu“ samo neříká, co zmizelo: na „ty dresy“ by to model nespojil.
    ...(r.loot ? [`Vzal jsi: ${r.loot}.`] : []),
    `Stalo se to ${kdy(r.predDny)}.`,
    r.odhalen ? "Přišlo se na to, že jsi to byl ty." : "Trenérovi ses k tomu přiznal.",
  ];
  const outcome = r.vysledek ? VYSLEDEK_V_PROMPTU[r.vysledek] : undefined;
  if (outcome) parts.push(outcome[1]);
  else if (r.stav === "policie") parts.push("Vyšetřuje to policie.");
  const loot = lootLine(r);
  if (loot) parts.push(loot);
  return `- ${parts.join(" ")} POKYN: ${pokynPachatele(r)}`;
}

export function radekDoPromptu(r: RadekZnalosti): string {
  switch (r.role) {
    case "kadr":
      return `- ${verejnyFakt(r)}`;
    case "drb":
      // Drb z cizího klubu: co a kdy, případně kdo. Výsledek ne, model by ho vztáhl na vlastního trenéra.
      return `- ${[r.fact, `Stalo se to ${kdy(r.predDny)}.`, ...(r.pachatel ? [`Udělal to ${r.pachatel}.`] : [])].join(" ")}`;
    case "obvineny":
      return `- ${r.fact}`;
    case "pachatel":
      return isOwnRevealedOffence(r) ? ownOffenceLine(r) : `- ${r.fact} POKYN: ${pokynPachatele(r)}`;
    case "svedek":
    case "kamarad":
    case "rival":
      return `- ${r.fact} POKYN: ${pokynSvedka(r)}`;
  }
}

/** Blok do `buildSystemPrompt`. Nenačtené znalosti (`undefined`) nepřidají nic. */
export function blokZnalosti(radky: readonly RadekZnalosti[] | undefined): string {
  if (radky === undefined) return "";
  if (radky.length === 0) return BEZ_ZNALOSTI;
  return [HLAVICKA_ZNALOSTI, ...radky.map(radekDoPromptu)].join("\n");
}
