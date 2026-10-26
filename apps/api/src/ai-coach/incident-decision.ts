/**
 * Rozhodnutí AI trenéra o incidentech v klubu (krádeže, škody, dluhy hráčů, řeči z hospody). Čisté
 * funkce bez databáze: nabídka přípustných možností, popis situace pro model, schéma odpovědi,
 * kontrola odpovědi a náhradní pravidlo podle povahy.
 *
 * Možnosti jsou ty, které má člověk (`dostupneAkce`, `lzeVyslychat` v incidents/vysetrovani.ts,
 * `lzeNahlasit` v incidents/bazar.ts), jen bez zjevného sebepoškození: obvinit jde jen podezřelé ze
 * stop, posledního brankáře nejde vyřadit ani vyhodit a vyhodit nejde hráče, kterého klub pustit
 * nesmí (hostující, minimum kádru). Výslech a rozhovor, které člověk vede v chatu, má AI trenér bez
 * zpráv se stejnými následky (`askWithoutChat`, `talkWithoutChat` v incidents/akce.ts). Koho se
 * zeptat, kód nabídne jen podle toho, co vidí i člověk: podezřelé ze stop, jejich kamarády a rivaly
 * a hráče, kteří trenérovi věří. Kdo co ví, model nikdy nedostane. Provede je ai-coach/incidents.ts
 * stejnými službami jako routa (incidents/akce.ts, incidents/bazar-db.ts, incidents/situace-db.ts).
 */

import type { AkceTrestu } from "../incidents/typy";
import type { AiCoachProfile } from "./profile";
import type { SquadImportance } from "./valuation";
import { styleText } from "./weekly-decision";

export type IncidentStage = "investigate" | "punish" | "advance" | "threat";

export type IncidentAction =
  | { type: "police" }
  | { type: "accuse"; playerId: string }
  | { type: "ask"; playerId: string }
  | { type: "report_listing"; listingId: string }
  | { type: "talk" }
  | { type: "wait" }
  | { type: "punish"; punishment: AkceTrestu; matches?: number }
  | { type: "advance"; lend: boolean };

export interface IncidentOption {
  key: string;
  text: string;
  action: IncidentAction;
}

export interface IncidentPlayer {
  playerId: string;
  name: string;
  position: string;
  age: number;
  rating: number;
  importance: SquadImportance;
  /** Vůdce kabiny nebo aspoň dva silné vztahy (`jeOblibeny` v incidents/tresty.ts). */
  popular: boolean;
}

export interface IncidentSuspect extends IncidentPlayer {
  /** Nalezená stopa ukazuje přímo na něj, ne jen mezi víc podezřelých. */
  directClue: boolean;
}

/** Vztah hráče k trenérovi slovy (`coach_relationship`, člověk ho vidí v profilu hráče). */
export type CoachTrust = "good" | "neutral" | "poor";

export function trustWord(coachRelationship: number): CoachTrust {
  return coachRelationship >= 65 ? "good" : coachRelationship <= 35 ? "poor" : "neutral";
}

/** Proč by se ho trenér zeptal: podezřelý, rival nebo kamarád podezřelého, hráč, který mu věří. */
export type AskReason = "suspect" | "rival" | "friend" | "trusted";

export interface AskCandidate extends IncidentPlayer {
  reason: AskReason;
  /** Podezřelý, se kterým se nesnáší nebo kamarádí (`rival`, `friend`), jinak null. */
  linkedTo: string | null;
  /** U podezřelého: nalezená stopa ukazuje přímo na něj. */
  directClue: boolean;
  trust: CoachTrust;
}

/** Poznaný inzerát s ukradenými věcmi v bazaru, který jde nahlásit policii (`lzeNahlasit`). */
export interface StolenListing {
  listingId: string;
  /** Co v inzerátu je, anglicky. */
  item: string;
  /** Policie na incidentu ještě nešetřila: nahlášení jí předá případ. Jinak se inzerát jen zajistí k šetření. */
  startsPolice: boolean;
}

export interface IncidentClub {
  teamName: string;
  profile: AiCoachProfile;
  budget: number;
  /** Rezerva na provoz podle šetrnosti (`budgetReserve`). */
  reserve: number;
  squadSize: number;
  matchesNext7Days: number;
}

interface IncidentBase {
  incidentId: string;
  kind: string;
  /** Anglický popis incidentu pro model. */
  description: string;
  category: "kradez" | "poskozeni" | "zivotni";
  severity: number;
  /** Hodnota škody v Kč (`hodnotaSkody` v incidents/tresty.ts). */
  damage: number;
  /** Kolik dní zbývá do lhůty, `null` bez lhůty. */
  daysToDeadline: number | null;
}

export interface InvestigateFacts extends IncidentBase {
  stage: "investigate";
  /** Nalezené stopy anglicky, bez skrytých informací (držitelé stop, pachatel). */
  clues: string[];
  suspects: IncidentSuspect[];
  accusationsLeft: number;
  canAccuse: boolean;
  policeAvailable: boolean;
  /** Policie už šetřila a nic nenašla. */
  policeFailed: boolean;
  /** Šance policie 0–1 (`sancePolicie` v incidents/vysetrovani.ts). */
  policeChance: number;
  /** Případ právě šetří policie: obvinit ani volat policii nejde, ptát se a nahlásit inzerát ano. */
  policeInvestigating: boolean;
  /** Za kolik dní přijde výsledek policie, když šetří, jinak null. */
  policeResultInDays: number | null;
  /** Koho se trenér může zeptat, od nejslibnějšího. Prázdné, když se ptát nejde. */
  askCandidates: AskCandidate[];
  /** Koho se už ptal (co mu kdo prozradil, je mezi stopami). */
  askedNames: string[];
  /** Poznaný inzerát s ukradenými věcmi, který jde nahlásit, jinak null. */
  listing: StolenListing | null;
}

export interface PunishFacts extends IncidentBase {
  stage: "punish";
  culprit: IncidentPlayer & { weeklyWage: number; repeatOffender: boolean };
  /** Tresty, které dovolí pravidla (`dostupneAkce(...).tresty`). */
  allowed: AkceTrestu[];
  deduction: number;
  fine: number;
  /** Poslední brankář áčka: vyřadit ani vyhodit ho trenér nesmí. */
  lastGoalkeeper: boolean;
  /** Klub ho smí pustit (není hostující a kádr neklesne pod minimum). */
  canRelease: boolean;
}

export interface AdvanceFacts extends IncidentBase {
  stage: "advance";
  player: IncidentPlayer;
  advanceMin: number;
  advanceMax: number;
}

/** Hráč v hospodě ohlásil čin (spec incidentů 9a); jestli ho udělá, se ukáže po lhůtě. */
export interface ThreatFacts extends IncidentBase {
  stage: "threat";
  player: IncidentPlayer & { trust: CoachTrust };
  /** Co řekl, že udělá, anglicky. */
  threat: string;
}

export type IncidentFacts = InvestigateFacts | PunishFacts | AdvanceFacts | ThreatFacts;

export interface IncidentDecisionContext {
  club: IncidentClub;
  facts: IncidentFacts;
  options: IncidentOption[];
}

/** Incidenty, o kterých se rozhoduje, anglicky. Neznámý druh dostane český popisek z katalogu. */
export const INCIDENT_KIND_TEXT: Record<string, string> = {
  vloupani_sklad: "a break-in at the equipment store, equipment was stolen",
  vitrina: "trophies were stolen from the clubhouse cabinet",
  dodavka_pujcena: "the club van was taken for a ride without permission",
  dodavka_ukradena: "the club van was stolen",
  kradez_kamery: "the security cameras were stolen",
  oslava_v_kabine: "a drunken celebration damaged the dressing room",
  kopnute_dvere: "a player kicked a door in after being sent off",
  koleje_trakturek: "someone drove the mower across the pitch and left ruts",
  pozar_grilu: "the barbecue set the refreshment stand on fire",
  svetlice: "a flare was set off on the pitch",
  kasa_obcerstveni: "money went missing from the refreshment till",
  tombola: "the raffle money was stolen",
  vandal: "vandals damaged the ground",
  dluhy: "a player is in debt",
};

/** Co hráč v hospodě ohlásil (`CINY_HRACE` v incidents/katalog.ts), anglicky jako „said he would …". */
export const THREAT_KIND_TEXT: Record<string, string> = {
  vloupani_sklad: "break into the equipment store and help himself",
  vitrina: "take the trophies from the clubhouse cabinet",
  dodavka_pujcena: "take the club van for a ride without asking",
  koleje_trakturek: "drive the mower across the pitch",
  kopnute_dvere: "kick a door in at the clubhouse",
};

/** Věci, které okradený klub v bazaru pozná (`jePoznatelne` v incidents/bazar.ts), anglicky. */
const STOLEN_ITEM_TEXT: Record<string, string> = {
  jerseys: "club jerseys",
  team_van: "club van",
  trophy_case: "trophies",
  fan_drums: "fans' drums and flags",
};

export function stolenItemText(category: string): string {
  return STOLEN_ITEM_TEXT[category] ?? "stolen equipment";
}

const CLUE_SOURCE: Record<string, string> = {
  kamera: "the security camera",
  spravce: "your groundsman",
  soused: "a neighbour",
  svedek: "a witness",
  kamarad: "a friend of the culprit",
  rival: "a rival in the squad",
  hospoda: "talk in the pub",
  bazar: "a second-hand market listing",
  policie: "the police",
  priznani: "a confession",
};

export interface ClueFacts {
  zdroj: string;
  ukazujeNa: string | null;
  podezreli: string[] | null;
  sila: number;
}

/** Nalezená stopa jednou větou. Kdo ji drží, se neříká (to by manažer zjistil až výslechem). */
export function clueLine(c: ClueFacts, nameOf: (playerId: string) => string): string {
  const source = CLUE_SOURCE[c.zdroj] ?? "a clue";
  if (c.ukazujeNa) return `${source} points at ${nameOf(c.ukazujeNa)}`;
  if (c.podezreli && c.podezreli.length > 0) return `${source} narrows it down to ${c.podezreli.map(nameOf).join(", ")}`;
  if (c.zdroj === "bazar") return "your stolen equipment turned up in a local second-hand market listing (this helps the police)";
  return `${source} noticed something, but no name (${c.sila >= 2 ? "a useful" : "a weak"} clue)`;
}

function czk(n: number): string {
  return `${Math.round(n).toLocaleString("en-US")} CZK`;
}

export function chanceWord(chance: number): "low" | "moderate" | "good" {
  return chance >= 0.5 ? "good" : chance >= 0.25 ? "moderate" : "low";
}

function playerLine(p: IncidentPlayer): string {
  const role = p.importance === "key" ? "a key player" : p.importance === "rotation" ? "a rotation player" : "a fringe player";
  return `${p.name} (${p.position}, age ${p.age}, rating ${p.rating}, ${role}${p.popular ? ", popular in the dressing room" : ""})`;
}

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? "" : word.endsWith("ch") ? "es" : "s"}`;
}

export function investigateOptions(f: InvestigateFacts): IncidentOption[] {
  const out: IncidentOption[] = [];
  if (f.policeAvailable) {
    out.push({
      key: "police", action: { type: "police" },
      text: `Call the police (free). They investigate for 3 to 7 days; your estimate of their chance to solve it: ${chanceWord(f.policeChance)}. If one of your players did it, he will miss an interrogation day and a court day.`,
    });
  }
  if (f.listing) {
    const item = f.listing.item;
    out.push({
      key: "report_listing", action: { type: "report_listing", listingId: f.listing.listingId },
      text: f.listing.startsPolice
        ? `Report the second-hand market listing with your ${item} to the police (free): the police take over the case for 3 to 7 days (your estimate of their chance to solve it: ${chanceWord(f.policeChance)}) and the listing is taken down, so nobody else can buy your ${item}. If one of your players did it, he will miss an interrogation day and a court day.`
        : `Report the second-hand market listing with your ${item} to the police: the listing is taken down and your ${item} become part of the police investigation, so nobody else can buy them.`,
    });
  }
  if (f.canAccuse) {
    f.suspects.forEach((s, i) => out.push({
      key: `accuse_${i + 1}`, action: { type: "accuse", playerId: s.playerId },
      text: `Accuse ${playerLine(s)}. ${s.directClue ? "A clue points straight at him." : `He is one of ${f.suspects.length} suspects the clues point at.`} If he did it, the clues convict him; if he is innocent, his morale drops by 12 and his trust in you by 20, his friends lose 3 morale and the rest of the squad 2.`,
    }));
  }
  f.askCandidates.forEach((c, i) => out.push({
    key: `ask_${i + 1}`, action: { type: "ask", playerId: c.playerId }, text: askText(c),
  }));
  out.push({
    key: "wait", action: { type: "wait" },
    text: f.policeInvestigating
      ? `Do nothing and wait for the police result${f.policeResultInDays !== null ? ` (in ${plural(f.policeResultInDays, "day")})` : ""}.`
      : `Do nothing for now. If nobody is caught by the deadline${f.daysToDeadline !== null ? ` (${plural(f.daysToDeadline, "day")})` : ""}, the case is closed as unsolved.`,
  });
  return out;
}

/** Možnost „zeptat se" jednou větou podle toho, proč by se ho trenér ptal. Nikdy neprozradí, kdo co ví. */
function askText(c: AskCandidate): string {
  const who = playerLine(c);
  const trust = `his relationship with you is ${c.trust}`;
  switch (c.reason) {
    case "suspect":
      return `Ask ${who} about it in private (it costs nothing). He is ${c.directClue ? "the player a clue points at" : "one of the suspects"}: if he did it, he may own up${c.directClue ? ", more likely with the clue against him" : ""}, the more so the better he gets on with you (${trust}); if he did not, he can only tell you what he knows.`;
    case "rival":
      return `Ask ${who} whether he knows anything (it costs nothing). He does not get on with suspect ${c.linkedTo ?? "the suspect"}, so if he knows something, he will probably tell you; ${trust}.`;
    case "friend":
      return `Ask ${who} whether he knows anything (it costs nothing). He is a close friend of suspect ${c.linkedTo ?? "the suspect"}: he may well know, but friends tend to cover for each other; ${trust}.`;
    case "trusted":
      return `Ask ${who} whether he saw or heard anything (it costs nothing). You have no suspect yet; he gets on well with you, so he would tell you if he knew.`;
  }
}

export function threatOptions(f: ThreatFacts): IncidentOption[] {
  return [
    {
      key: "talk", action: { type: "talk" },
      text: `Have a word with him and tell him not to do anything stupid (it costs nothing). That makes it much less likely that he really does it, the more so the better he gets on with you (his relationship with you is ${f.player.trust}).`,
    },
    {
      key: "wait", action: { type: "wait" },
      text: "Leave it: drunk talk often comes to nothing, but he may really do it.",
    },
  ];
}

export function punishOptions(f: PunishFacts, club: Pick<IncidentClub, "matchesNext7Days">): IncidentOption[] {
  const c = f.culprit;
  const allowed = (a: AkceTrestu) => f.allowed.includes(a);
  const out: IncidentOption[] = [];
  if (allowed("odpustit")) {
    out.push({
      key: "forgive", action: { type: "punish", punishment: "odpustit" },
      text: `Forgive him: his morale +5, his trust in you +8${f.severity >= 2 ? "; the rest of the squad loses 2 morale (they find it too soft)" : ""}${c.repeatOffender ? "; he did something like this recently, forgiving a repeat offender costs you authority" : ""}.`,
    });
  }
  if (allowed("srazka")) {
    out.push({
      key: "deduct", action: { type: "punish", punishment: "srazka" },
      text: `Dock his wages: ${czk(f.deduction)} back to the club over 4 weeks; his morale -6, his trust in you -4.`,
    });
  }
  if (allowed("pokuta")) {
    out.push({
      key: "fine", action: { type: "punish", punishment: "pokuta" },
      text: `Fine him ${czk(f.fine)} at once; his morale -8, his trust in you -6.`,
    });
  }
  if (allowed("vyradit") && !f.lastGoalkeeper) {
    for (let n = 1; n <= 3; n++) {
      out.push({
        key: `ban_${n}`, action: { type: "punish", punishment: "vyradit", matches: n },
        text: `Drop him for the next ${plural(n, "league match")} (also cup matches and friendlies in that time; you play ${plural(club.matchesNext7Days, "competitive match")} in the next 7 days); his morale -10${c.popular ? "" : "; the squad gains 1 morale"}.`,
      });
    }
  }
  if (allowed("vyhodit") && f.canRelease && !f.lastGoalkeeper) {
    out.push({
      key: "sack", action: { type: "punish", punishment: "vyhodit" },
      text: `Sack him: he leaves the club as a free agent and you get nothing for him; ${c.popular ? "he is popular, the squad loses 4 morale" : "the squad gains 1 morale"}.`,
    });
  }
  if (allowed("policie")) {
    out.push({
      key: "report", action: { type: "punish", punishment: "policie" },
      text: `Hand him over to the police: a certain conviction (probation) in 3 to 7 days, he misses an interrogation day and a court day${c.popular ? "; he is popular, so the squad loses 3 morale and your reputation drops by 1" : ""}.`,
    });
  }
  if (allowed("nechat_byt")) {
    out.push({ key: "let_go", action: { type: "punish", punishment: "nechat_byt" }, text: "Let it go and do nothing about it." });
  }
  return out;
}

export function advanceOptions(f: AdvanceFacts): IncidentOption[] {
  return [
    {
      key: "lend", action: { type: "advance", lend: true },
      text: `Lend him an advance of ${czk(f.advanceMin)} to ${czk(f.advanceMax)}, repaid from his wages over the next 4 Mondays; his morale +6, his trust in you +8. If he leaves before paying it back, the rest is lost.`,
    },
    {
      key: "refuse", action: { type: "advance", lend: false },
      text: "Refuse: his morale -5, his trust in you -5; a player in debt who was refused is more tempted to steal from the club.",
    },
  ];
}

export function incidentOptions(facts: IncidentFacts, club: IncidentClub): IncidentOption[] {
  if (facts.stage === "investigate") return investigateOptions(facts);
  if (facts.stage === "punish") return punishOptions(facts, club);
  if (facts.stage === "threat") return threatOptions(facts);
  return advanceOptions(facts);
}

export const INCIDENT_SYSTEM_PROMPT = [
  "You are the head coach and manager of an amateur Czech district football club in a football management game.",
  "Something happened at your club and you decide how to deal with it: a theft, damage at the ground, a player in money trouble, or a player who threatened something in the pub.",
  "Think like a sensible real manager with YOUR personality: discipline and fairness, the mood in the dressing room, money and the next matches.",
  "The game has already checked the rules, so every listed option is allowed.",
  "Answer with exactly one JSON object and nothing else.",
].join(" ");

export function renderIncidentPrompt(ctx: IncidentDecisionContext): string {
  const { club, facts } = ctx;
  const p = club.profile;
  const L: string[] = [
    "YOUR PERSONALITY (0-100):",
    `ambition ${p.ambition}, thrift ${p.thrift}, risk ${p.risk}, patience ${p.patience}, youth focus ${p.youthFocus}.`,
    `YOUR STYLE: ${styleText(p)}`,
    "",
    `CLUB ${club.teamName}: budget ${czk(club.budget)} (you like to keep at least ${czk(club.reserve)} in reserve), ${club.squadSize} players in the squad, ${plural(club.matchesNext7Days, "competitive match")} in the next 7 days.`,
    "",
  ];
  if (facts.stage === "advance") {
    L.push(`SITUATION: ${playerLine(facts.player)} is in debt and asks you for an advance on his wages.`);
  } else if (facts.stage === "threat") {
    L.push(`SITUATION: in the pub, ${playerLine(facts.player)} said while drunk that he would ${facts.threat}. Nobody knows yet whether he means it.`);
  } else {
    L.push(`INCIDENT: ${facts.description} (${facts.category === "kradez" ? "theft" : "damage"}), seriousness ${facts.severity}/3, damage worth about ${czk(facts.damage)}.`);
  }
  if (facts.daysToDeadline !== null) L.push(`You have ${plural(facts.daysToDeadline, "day")} left to decide.`);
  if (facts.stage === "investigate") {
    L.push(facts.clues.length > 0 ? `CLUES FOUND:\n${facts.clues.map((c) => `- ${c}`).join("\n")}` : "CLUES FOUND: none so far.");
    if (facts.policeInvestigating) {
      L.push(`The police are investigating the case${facts.policeResultInDays !== null ? ` and report back in ${plural(facts.policeResultInDays, "day")}` : ""}. Until then you cannot accuse anyone, but you can still ask your players.`);
    } else {
      L.push(`Accusations left: ${facts.accusationsLeft} of 2.${facts.policeFailed ? " The police already investigated and found nothing." : ""}`);
    }
    if (facts.askedNames.length > 0) L.push(`ALREADY ASKED: ${facts.askedNames.join(", ")} (anything they told you is among the clues above).`);
  } else if (facts.stage === "punish") {
    const c = facts.culprit;
    L.push(`CULPRIT (known): ${playerLine(c)}, weekly wage ${czk(c.weeklyWage)}${c.repeatOffender ? ", a repeat offender (another incident in the last two months)" : ""}.`);
  }
  L.push("", "OPTIONS (key: what happens):");
  for (const o of ctx.options) L.push(`- ${o.key}: ${o.text}`);
  L.push("", 'Return {"choice": one of the option keys, "reason": "one short English sentence"}.');
  return L.join("\n");
}

/** Schéma odpovědi. Volající model nevolá, když možnost není víc než jedna (enum nesmí být prázdný). */
export function incidentDecisionSchema(ctx: IncidentDecisionContext): Record<string, unknown> {
  return {
    type: "object",
    properties: {
      choice: { type: "string", enum: ctx.options.map((o) => o.key) },
      reason: { type: "string" },
    },
    required: ["choice", "reason"],
    additionalProperties: false,
  };
}

/** Model smí vybrat jen nabídnutou možnost. Jinak null a platí náhradní pravidlo. */
export function validateIncidentDecision(raw: unknown, ctx: IncidentDecisionContext): { option: IncidentOption; reason: string } | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.choice !== "string") return null;
  const key = r.choice.trim();
  const option = ctx.options.find((o) => o.key === key);
  if (!option) return null;
  return { option, reason: typeof r.reason === "string" ? r.reason.trim().slice(0, 300) : "" };
}

/**
 * Náhradní pravidlo podle povahy (výpadek modelu, neplatná odpověď, režim off). Vrací vždy
 * některou z nabídnutých možností.
 *
 * - Vyšetřování: stopa ukazuje přímo na hráče → obvinit ho; poznaný inzerát s ukradenými věcmi →
 *   nahlásit (policie a k tomu stažený inzerát); jinak policie, je-li ještě k mání; pak se zeptat
 *   nejslibnějšího hráče; teprve potom (nebo poslední den před lhůtou) odvážný trenér obviní
 *   podezřelého, opatrný to nechá být.
 * - Trest: vážný průšvih nebo recidiva → vyhodit, když nejde o oporu; oporu a oblíbence trenér
 *   nevyřadí (peníze, nebo odpuštění); šetrný strhává ze mzdy, ostatní dávají pokutu; trpělivý
 *   drobnost odpustí; kde peníze nejdou, vyřadit na zápas nebo dva.
 * - Záloha: půjčit, když na ni klub má nad rezervou a trenér není škudlil (oporu podrží i škudlil).
 * - Řeči z hospody: promluvit si s ním (nic to nestojí a šanci, že to udělá, to výrazně sníží).
 */
export function fallbackIncidentDecision(ctx: IncidentDecisionContext): IncidentOption {
  const pick = (key: string): IncidentOption | null => ctx.options.find((o) => o.key === key) ?? null;
  const p = ctx.club.profile;
  const f = ctx.facts;
  const idle = pick("wait") ?? pick("let_go") ?? ctx.options[0];

  if (f.stage === "investigate") {
    const direct = f.suspects.findIndex((s) => s.directClue);
    const accuseDirect = direct >= 0 ? pick(`accuse_${direct + 1}`) : null;
    if (accuseDirect) return accuseDirect;
    const report = pick("report_listing");
    if (report) return report;
    const police = pick("police");
    if (police) return police;
    // Poslední den před lhůtou už odvážný trenér nečeká, co kdo řekne, a obviní.
    const lastDay = f.daysToDeadline !== null && f.daysToDeadline <= 1;
    const riskyAccuse = p.risk >= 60 ? pick("accuse_1") : null;
    if (lastDay && riskyAccuse) return riskyAccuse;
    // Kandidáti na otázku jsou seřazení od nejslibnějšího (podezřelý s přímou stopou první).
    const ask = pick("ask_1");
    if (ask) return ask;
    return riskyAccuse ?? idle;
  }

  if (f.stage === "threat") return pick("talk") ?? idle;

  if (f.stage === "advance") {
    const affordable = ctx.club.budget - f.advanceMax >= ctx.club.reserve;
    const valued = f.player.importance === "key" || f.player.popular;
    return (affordable && (p.thrift < 70 || valued) ? pick("lend") : pick("refuse")) ?? ctx.options[0];
  }

  const c = f.culprit;
  const serious = f.severity >= 3 || (c.repeatOffender && f.severity >= 2);
  if (serious && c.importance !== "key") {
    const sack = pick("sack");
    if (sack) return sack;
  }
  const deduct = f.deduction > 0 ? pick("deduct") : null;
  const fine = f.fine > 0 ? pick("fine") : null;
  const money = p.thrift >= 50 ? (deduct ?? fine) : (fine ?? deduct);
  if (c.importance === "key" || c.popular) return money ?? pick("forgive") ?? idle;
  if (!c.repeatOffender && f.severity <= 1 && p.patience >= 65) {
    const forgive = pick("forgive");
    if (forgive) return forgive;
  }
  if (money) return money;
  return pick(f.severity >= 2 ? "ban_2" : "ban_1") ?? pick("forgive") ?? idle;
}
