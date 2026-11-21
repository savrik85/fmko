/**
 * Taktiky výslechu (bod 4 rozboru SMS z produ, docs/analyza-sms-manazeru-2026-11-18.md).
 *
 * Manažeři hrají vyšetřování jako detektivku: blafují („mám záznam z kamer“, „mám dva
 * svědky“), slibují mírnější trest („když se přizná hned, zmírním trest“), vyhrožují policií
 * nebo podplácejí („zkus se nenápadně optat, koupím ti rum“). Výslech dřív rozhodl jednou
 * a nic z toho na výsledek nemělo vliv. Teď každá taktika dá hráči, který zapírá nebo kryje,
 * jednu novou šanci (vyslech.ts); urážka šanci sníží.
 */

export type InterrogationTactic = "evidence" | "leniency" | "police" | "bribe" | "insult";

function plain(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ");
}

const TACTIC_PATTERNS: Array<[InterrogationTactic, RegExp]> = [
  ["insult", /\b(kurv\w*|pic\w*|kokot\w*|debil\w*|zmrd\w*|hovad\w*|sracu?|lhar\w*|zlodej\w*|parchant\w*)\b/],
  ["evidence", /\b(kamer\w*|zaznam\w*|svedk\w*|svedek|dukaz\w*|vim ze jsi|vim, ze jsi|videli te|videl te|mam fotk\w*|mam to nafocen\w*|otisk\w*)\b/],
  ["leniency", /\b(kdyz se priznas|priznej se a|zmirnim|zmirni\w*|nebude se to resit|nebudu to resit|odpustim|bez trestu|nic se ti nestane|budu shovivav\w*)\b/],
  ["police", /\b(polici\w*|policajt\w*|fizl\w*|benga|bengo|udam te|udavam)\b/],
  ["bribe", /\b(koupim ti|zaplatim ti|dam ti (pivo|rum|panaka|stovku|petistovku|litr)|pivo za to|rum za to|panaka za to|odmenim te)\b/],
];

/** Taktika ve zprávě trenéra, nebo null. Urážka má přednost: kdo nadává, ten nepřemlouvá. */
export function tacticOf(text: string): InterrogationTactic | null {
  const t = plain(text);
  for (const [tactic, re] of TACTIC_PATTERNS) if (re.test(t)) return tactic;
  return null;
}

/** O kolik procentních bodů taktika posune šanci, že pachatel se přizná / svědek prozradí. */
export function tacticBonus(tactic: InterrogationTactic, role: "culprit" | "witness", clueOnHim: boolean): number {
  if (tactic === "insult") return -15;
  if (role === "culprit") {
    if (tactic === "evidence") return clueOnHim ? 25 : 10;
    if (tactic === "leniency") return 20;
    if (tactic === "police") return 10;
    return 0;
  }
  if (tactic === "bribe") return 20;
  if (tactic === "police") return 15;
  return 5;
}

/** Lidé a místa, kde se hráč poptá: „zeptej se kluků“, „i v hospodě“, „na tréninku“. */
const ASK_AROUND = String.raw`(?:kluku|ostatnich|lidi|kamosu|chlapu|party|kolem|v hospode|v kabine|v satne|na treninku|u piva)`;

/**
 * Trenér hráče žádá, ať se poptá nebo zjistí víc („zkus se nenápadně optat“, „zjisti, kdo to byl“).
 * I podmiňovací a zdvořilé tvary: „nepoptal by ses mi…“, „mohl by ses zeptat kluků“, „zkus se
 * zeptat kluků“, „nezjistil bys…“, „dej mi vědět, kdybys něco slyšel“ (FK Geomapping 19.–20. 11.:
 * dřív žádný úkol, ačkoli hráč slíbil, že se poptá).
 */
const INQUIRY_RE = new RegExp([
  String.raw`\b(?:poptej|poptat|poptas|optat|vyptat|vyptej|zjisti|zjistis|zjistit|porozhledni|porozhlednes|vyzvidej|vyzvidat|optej se|ozvi se kdyz neco zjistis|dej vedet kdyz neco)\b`,
  String.raw`\b(?:ne)?(?:poptal|zeptal|optal|vyptal|zjistil)a? (?:by ses|bys)\b`,
  String.raw`\bmohla? (?:by ses|bys se) zeptat\b`,
  String.raw`\bzkus(?:te)? se (?:nenapadne |taky |i )?zeptat\b`,
  String.raw`\b(?:zeptej se|se zeptej) (?:i |taky |tez )?${ASK_AROUND}`,
  String.raw`\bdej (?:mi )?vedet,? (?:kdybys|kdyby ses|kdyz|jestli) (?:\w+ )?(?:neco )?(?:slysel|zjistil|dozvedel|zaslechl|uslysis|zjistis|dozvis)\b`,
  String.raw`\bnastraz(?:is)? usi\b`,
].join("|"));

export function isInquiryRequest(text: string): boolean {
  // „Zavolám policii, třeba něco zjistí“: třetí osoba není prosba („zjisti“ bez čárky je).
  return INQUIRY_RE.test(plain(text.toLowerCase().replace(/zjistí(?![\p{L}])/gu, " ")));
}

/**
 * Hráč v odpovědi slíbí, že se poptá („poptám se v šatně“, „zkusím to zjistit“, „u piva nastražím
 * uši“). Bez úkolu by slib zůstal bez dopadu (messaging/ai-player-spawn.ts `afterPlayerReply`).
 * „Zeptám se“ jen s lidmi nebo místem, kde se ptá („zeptám se doma, jestli můžu“ slib není).
 */
const PLAYER_INQUIRY_RE = new RegExp([
  String.raw`\b(?:poptam se|optam se|vyptam se|zjistim|nastrazim usi|porozhlednu se|vyzvidnu)\b`,
  String.raw`\b(?:zeptam se|budu se ptat) (?:\w+ ){0,2}?${ASK_AROUND}`,
  String.raw`\bzkusim (?:se )?(?:to )?(?:poptat|optat|vyptat|zjistit|vyzvidet|zeptat)\b`,
].join("|"));

export function promisesInquiry(text: string): boolean {
  return PLAYER_INQUIRY_RE.test(plain(text));
}
