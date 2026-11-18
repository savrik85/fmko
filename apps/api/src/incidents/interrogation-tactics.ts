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

/** Trenér hráče žádá, ať se poptá nebo zjistí víc („zkus se nenápadně optat“, „zjisti, kdo to byl“). */
const INQUIRY_RE = /\b(poptej|poptat|poptas|optat|vyptat|vyptej|zeptej se (kluku|ostatnich|v hospode)|zjisti|zjistis|zjistit|porozhledni|porozhlednes|vyzvidej|vyzvidat|optej se|ozvi se kdyz neco zjistis|dej vedet kdyz neco)\b/;

export function isInquiryRequest(text: string): boolean {
  return INQUIRY_RE.test(plain(text));
}
