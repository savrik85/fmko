/**
 * Co skaut o hráči napíše: plusy a minusy do hlášení a SMS. Jména a názvy vždy v 1. pádě,
 * bez dlouhých pomlček (pravidla pro texty hráčům).
 */

import type { Rng } from "../generators/rng";

const POST_SLOVEM: Record<string, string> = { GK: "brankář", DEF: "obránce", MID: "záložník", FWD: "útočník" };

const SKILL_LABELS: Record<string, string> = {
  speed: "rychlost", technique: "technika", shooting: "střelba", passing: "přihrávka",
  heading: "hlavičky", defense: "obrana", goalkeeping: "chytání", stamina: "výdrž",
  strength: "síla", vision: "přehled", creativity: "kreativita", setPieces: "standardky",
};

/** Dovednosti, na kterých na daném postu záleží (skaut se dívá jen na ně). */
const POSITION_SKILLS: Record<string, string[]> = {
  GK: ["goalkeeping", "strength", "speed", "passing"],
  DEF: ["defense", "heading", "strength", "speed", "passing"],
  MID: ["passing", "technique", "vision", "stamina", "creativity", "defense"],
  FWD: ["shooting", "speed", "technique", "heading", "strength"],
};

export interface ReportSubject {
  position: string;
  age: number;
  skills: Record<string, number>;
  personality: Record<string, number>;
  distanceKm: number;
}

export function reportPros(p: ReportSubject): string[] {
  const keys = POSITION_SKILLS[p.position] ?? POSITION_SKILLS.MID;
  const ranked = keys.filter((k) => typeof p.skills[k] === "number").sort((a, b) => p.skills[b] - p.skills[a]);
  const pros: string[] = [];
  if (ranked[0]) pros.push(`Silná stránka: ${SKILL_LABELS[ranked[0]]}`);
  if (ranked[1] && p.skills[ranked[1]] >= p.skills[ranked[0]] - 4) pros.push(`Dobrá i ${SKILL_LABELS[ranked[1]]}`);
  const pers = p.personality ?? {};
  if ((pers.leadership ?? 0) >= 70) pros.push("Umí strhnout kabinu");
  if ((pers.workRate ?? 0) >= 70) pros.push("Maká celý zápas");
  if ((pers.discipline ?? 0) >= 75) pros.push("Na trénink chodí jako hodinky");
  if (p.age <= 21) pros.push("Mladý, má kam růst");
  if (p.distanceKm <= 10) pros.push("Bydlí kousek od vás");
  return pros.slice(0, 4);
}

export function reportCons(p: ReportSubject): string[] {
  const keys = POSITION_SKILLS[p.position] ?? POSITION_SKILLS.MID;
  const ranked = keys.filter((k) => typeof p.skills[k] === "number").sort((a, b) => p.skills[a] - p.skills[b]);
  const cons: string[] = [];
  if (ranked[0]) cons.push(`Slabina: ${SKILL_LABELS[ranked[0]]}`);
  const pers = p.personality ?? {};
  if ((pers.discipline ?? 100) <= 30) cons.push("Na tréninky chodí, jak se mu chce");
  if ((pers.alcohol ?? 0) >= 70) cons.push("Po zápase nevynechá žádnou hospodu");
  if ((pers.temper ?? 0) >= 75) cons.push("Horká hlava, sbírá karty");
  if (p.age >= 32) cons.push("Nejlepší léta má za sebou");
  if (p.distanceKm > 30) cons.push(`Dojíždět by měl ${p.distanceKm} km`);
  return cons.slice(0, 3);
}

const range = (lo: number, hi: number) => (lo === hi ? `${lo}` : `${lo} až ${hi}`);
const kc = (v: number) => `${v.toLocaleString("cs-CZ")} Kč`;

export interface ReportSmsInput {
  name: string;
  age: number;
  position: string;
  ratingLo: number;
  ratingHi: number;
  potentialLo: number | null;
  potentialHi: number | null;
  youth: boolean;
  source: "village_club" | "free_agent";
  clubName: string | null;
  villageName: string | null;
  district: string | null;
  askHint: number | null;
}

export function reportSms(rng: Rng, r: ReportSmsInput): string {
  const post = POST_SLOVEM[r.position] ?? r.position;
  const where = r.source === "free_agent"
    ? `Volný hráč z okresu ${r.district ?? "?"}`
    : rng.pick([`Byl jsem se podívat na ${r.clubName} (${r.villageName})`, `Byl jsem na zápase v obci ${r.villageName}, hrál ${r.clubName}`]);
  const head = `🔍 ${where}. ${r.name}, ${r.age} let, ${post}. Hodnocení odhaduju na ${range(r.ratingLo, r.ratingHi)}.`;
  const youth = r.youth && r.potentialLo != null && r.potentialHi != null
    ? ` Dotáhnout by to mohl na ${range(r.potentialLo, r.potentialHi)}.`
    : "";
  const price = r.source === "free_agent"
    ? " Je bez klubu, podepsat ho jde rovnou."
    : r.askHint ? ` Klub si o něj řekne asi ${kc(r.askHint)}.` : "";
  return `${head}${youth}${price}`;
}

export function emptyWeekSms(rng: Rng, villageNames: string[]): string {
  const list = villageNames.length <= 1
    ? villageNames.join("")
    : `${villageNames.slice(0, -1).join(", ")} a ${villageNames[villageNames.length - 1]}`;
  const where = list ? `Objel jsem obce ${list}.` : "Objížděl jsem okolí.";
  return `🚗 ${where} ${rng.pick([
    "Nikoho, kdo by ti pomohl, jsem neviděl.",
    "Nic, co by stálo za řeč. Jedu dál.",
    "Samí průměrní, na ty škoda peněz.",
  ])}`;
}

export function revisitSms(r: { name: string; ratingLo: number; ratingHi: number; potentialLo: number | null; potentialHi: number | null; youth: boolean }): string {
  const youth = r.youth && r.potentialLo != null && r.potentialHi != null ? ` Strop vidím na ${range(r.potentialLo, r.potentialHi)}.` : "";
  return `👀 Znovu jsem viděl hrát: ${r.name}. Teď odhaduju ${range(r.ratingLo, r.ratingHi)}.${youth}`;
}

/** „1 klub", „3 kluby", „5 klubů". */
function clubsWord(n: number): string {
  if (n === 1) return "1 klub";
  if (n >= 2 && n <= 4) return `${n} kluby`;
  return `${n} klubů`;
}

export function finishedSms(clubs: number, reports: number): string {
  return `🏁 Úkol je hotový. Objel jsem ${clubsWord(clubs)} a poslal ${reports} hlášení. Dej vědět, kam dál.`;
}
