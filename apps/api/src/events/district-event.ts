/**
 * Okresní akce (pouť, bál, dožínky…): kdo přijde, zadání pro model a kontrola jeho odpovědi.
 * Čisté funkce bez databáze, zápis a rozeslání dělá district-event-db.ts.
 *
 * Akci spouští ručně admin, když něco vymyslíme. Scény nejsou napsané dopředu: model je
 * vymyslí z lidí, kteří na akci opravdu přišli (povaha hráčů, vztahy trenérů, bratři).
 * Kód jen hlídá meze následků, aby jedna akce nerozbila sezónu.
 */

import type { Rng } from "../generators/rng";

export type EventChoice = "alone" | "with_players" | "skip";
export const EVENT_CHOICES: readonly EventChoice[] = ["alone", "with_players", "skip"];

export interface EventPlayer {
  id: string;
  teamId: string;
  teamName: string;
  firstName: string;
  lastName: string;
  age: number;
  position: string;
  alcohol: number;
  temper: number;
  discipline: number;
  leadership: number;
}

export interface EventCoach {
  teamId: string;
  teamName: string;
  name: string;
  /** Přišel s hráči, nebo sám. */
  withPlayers: boolean;
}

export interface EventTeamInput {
  teamId: string;
  teamName: string;
  coachName: string;
  choice: EventChoice | null;
  /** Hráči, kteří můžou přijít (aktivní, nezranění, bez stopky). */
  squad: EventPlayer[];
}

export interface EventAttendance {
  coaches: EventCoach[];
  players: EventPlayer[];
}

/**
 * Kdo přijde. S trenérem, který bere hráče, jde 3–6 kluků (pijáci spíš). Bez něj se
 * z kádru utrhnou nejvýš dva pijáci, kteří by šli stejně.
 */
export function pickAttendance(teams: EventTeamInput[], rng: Rng): EventAttendance {
  const coaches: EventCoach[] = [];
  const players: EventPlayer[] = [];
  for (const t of teams) {
    if (t.choice === "alone" || t.choice === "with_players") {
      coaches.push({ teamId: t.teamId, teamName: t.teamName, name: t.coachName, withPlayers: t.choice === "with_players" });
    }
    if (t.choice === "with_players") {
      const want = Math.min(t.squad.length, rng.int(3, 6));
      const pool = [...t.squad];
      for (let i = 0; i < want && pool.length > 0; i++) {
        const idx = Number(rng.weighted(Object.fromEntries(pool.map((p, k) => [String(k), 20 + p.alcohol]))));
        players.push(pool[idx]);
        pool.splice(idx, 1);
      }
    } else {
      const drinkers = t.squad.filter((p) => p.alcohol >= 65 && rng.random() < 0.4);
      players.push(...drinkers.slice(0, 2));
    }
  }
  return { coaches, players };
}

// ── Meze následků ──

export const LIMITS = {
  minScenes: 3,
  maxScenes: 10,
  condition: [-15, 5],
  morale: [-8, 8],
  coachBond: [-6, 6],
  injuryDays: [1, 4],
  maxInjuries: 2,
  maxSuspensions: 1,
  respect: [-25, 20],
  heat: [-15, 30],
  squadMorale: [-4, 4],
} as const;

export type PlayerEffectKind = "condition" | "morale" | "hangover" | "injury" | "suspension" | "coach_bond";

export interface SceneEffect {
  playerId: string;
  kind: PlayerEffectKind;
  /** Kondice, nálada, vztah s trenérem: o kolik; zranění: dní. */
  value: number;
}

export interface SceneCoachRelation {
  teamA: string;
  teamB: string;
  respect: number;
  heat: number;
}

/** Kdo ve scéně vystupuje: trenér (id = klub) nebo hráč (id = hráč). */
export interface ScenePerson {
  kind: "coach" | "player";
  id: string;
  teamId: string;
}

export interface EventScene {
  text: string;
  people: ScenePerson[];
  /** Kluby, kterých se scéna týká (uvidí ji v Událostech a v SMS). */
  teamIds: string[];
  effects: SceneEffect[];
  coachRelations: SceneCoachRelation[];
  squadMorale: Array<{ teamId: string; delta: number }>;
  /** Hráč z cizího klubu by šel k trenérovi `toTeamId`. */
  transferHint?: { playerId: string; toTeamId: string };
}

export interface EventReport {
  headline: string;
  body: string;
  scenes: EventScene[];
}

/** Klíče pro model: C1… trenéři, P1… hráči. Model UUID nevidí. */
export interface PromptKeys {
  coaches: Map<string, EventCoach>;
  players: Map<string, EventPlayer>;
}

export function promptKeys(a: EventAttendance): PromptKeys {
  return {
    coaches: new Map(a.coaches.map((c, i) => [`C${i + 1}`, c])),
    players: new Map(a.players.map((p, i) => [`P${i + 1}`, p])),
  };
}

export interface CoachPairInfo {
  teamA: string;
  teamB: string;
  respect: number;
  heat: number;
  brothers: boolean;
}

export interface EventPromptInput {
  title: string;
  place: string;
  description: string;
  district: string;
  keys: PromptKeys;
  /** Vztahy mezi trenéry, kteří přišli. */
  coachPairs: CoachPairInfo[];
  /** Kluby, které pozvánku dostaly, ale trenér nepřišel. */
  absentTeams: string[];
}

function level(v: number): string {
  return v >= 70 ? "vysoký" : v >= 40 ? "střední" : "nízký";
}

export function buildEventPrompt(i: EventPromptInput): string {
  const coachKey = new Map([...i.keys.coaches].map(([k, c]) => [c.teamId, k]));
  const coaches = [...i.keys.coaches].map(([k, c]) =>
    `- ${k}: trenér ${c.name}, klub ${c.teamName}, ${c.withPlayers ? "přišel s hráči" : "přišel sám"}`);
  const players = [...i.keys.players].map(([k, p]) =>
    `- ${k}: ${p.firstName} ${p.lastName}, ${p.age} let, ${p.position}, klub ${p.teamName}; pití ${level(p.alcohol)}, vznětlivost ${level(p.temper)}, disciplína ${level(p.discipline)}, vůdcovství ${level(p.leadership)}`);
  const pairs = i.coachPairs.map((r) => {
    const a = coachKey.get(r.teamA);
    const b = coachKey.get(r.teamB);
    const mood = r.heat >= 60 ? "velká rivalita" : r.respect >= 60 ? "spojenci" : r.respect <= -40 ? "nepřátelé" : "neutrální";
    return `- ${a} a ${b}: respekt ${r.respect}, napětí ${r.heat} (${mood})${r.brothers ? ", jsou to bratři" : ""}`;
  });

  return [
    `Jsi kronikář okresu ${i.district} ve fotbalové manažerské hře o českém okresním fotbale.`,
    `V okrese se konala akce: ${i.title}, místo: ${i.place}. ${i.description}`,
    "",
    "Kdo přišel:",
    "TRENÉŘI:",
    ...(coaches.length ? coaches : ["- nikdo"]),
    "HRÁČI:",
    ...(players.length ? players : ["- nikdo"]),
    pairs.length ? "\nVZTAHY TRENÉRŮ, KTEŘÍ PŘIŠLI:" : "",
    ...pairs,
    i.absentTeams.length ? `\nTrenéři těchto klubů nepřišli: ${i.absentTeams.join(", ")}.` : "",
    "",
    `Vymysli ${LIMITS.minScenes} až ${LIMITS.maxScenes} konkrétních scén z akce podle toho, kolik lidí přišlo. Ať je to pestré a uvěřitelné pro vesnickou akci:`,
    "rvačky, opilost, pomluvy, drby, nová přátelství, trapasy, smíření, sázky, šeptanda o přestupu, hádky trenérů, společné chlastání trenérů.",
    "Dobré i špatné následky. Řiď se povahou: piják pije, vznětlivý se pere, rivalové se spíš chytnou, spojenci a bratři drží spolu.",
    "Kdo nepřišel, ve scénách není. Každá scéna má jména a kluby přesně tak, jak jsou výše, a jen lidi, kteří přišli.",
    "Piš česky, spisovně se správným skloňováním, vtipně, krátce (1 až 3 věty na scénu). Nikdy nepoužívej dlouhou pomlčku.",
    "",
    "Následky (jen pro lidi ze scény):",
    `- hráč "condition" ${LIMITS.condition[0]} až ${LIMITS.condition[1]}, "morale" ${LIMITS.morale[0]} až ${LIMITS.morale[1]}, "coach_bond" (vztah se svým trenérem) ${LIMITS.coachBond[0]} až ${LIMITS.coachBond[1]},`,
    `  "hangover" (kocovina, value 1), "injury" (lehké zranění, value = dny ${LIMITS.injuryDays[0]} až ${LIMITS.injuryDays[1]}, celkem nejvýš ${LIMITS.maxInjuries}), "suspension" (stopka na zápas po vážné rvačce s policií, value 1, nejvýš ${LIMITS.maxSuspensions} a jen výjimečně)`,
    `- dvojice trenérů: respect ${LIMITS.respect[0]} až ${LIMITS.respect[1]}, heat ${LIMITS.heat[0]} až ${LIMITS.heat[1]}`,
    `- nálada celé kabiny klubu, jehož trenér byl ve scéně: ${LIMITS.squadMorale[0]} až ${LIMITS.squadMorale[1]}`,
    "- \"transfer\": hráč z jiného klubu naznačí trenérovi, že by šel k němu (player = klíč hráče, coach = klíč trenéra)",
    "",
    "Odpověz jen JSON objektem:",
    '{"headline": "titulek reportáže do okresního Zpravodaje", "body": "reportáž 3 až 6 vět", "scenes": [',
    '  {"text": "...", "who": ["C1", "P1"], "players": [{"key": "P1", "effects": [{"kind": "hangover", "value": 1}]}],',
    '   "coaches": [{"a": "C1", "b": "C2", "respect": -15, "heat": 20}], "squad_morale": [{"coach": "C1", "delta": 2}],',
    '   "transfer": {"player": "P3", "coach": "C2"}}',
    "]}",
    "Pole who je povinné: klíče všech lidí, kteří ve scéně vystupují. Pole players, coaches, squad_morale a transfer vynech, když je scéna nepotřebuje.",
  ].filter((l) => l !== "").join("\n");
}

const clamp = (v: number, [lo, hi]: readonly [number, number]) => Math.max(lo, Math.min(hi, Math.round(v)));
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const LONG_DASH = /\s*[—–]\s*/g;
const cleanText = (s: unknown, max: number) =>
  typeof s === "string" ? s.replace(LONG_DASH, ", ").replace(/\s+/g, " ").trim().slice(0, max) : "";

/**
 * Odpověď modelu → reportáž se scénami. Neznámé klíče a efekty se zahodí, čísla se
 * stáhnou do mezí, zranění a stopky se ořežou na limit. Bez aspoň jedné scény null.
 */
export function sanitizeEventReport(raw: Record<string, unknown> | null, keys: PromptKeys): EventReport | null {
  if (!raw || !Array.isArray(raw.scenes)) return null;
  let injuries = 0;
  let suspensions = 0;
  const scenes: EventScene[] = [];

  for (const s of raw.scenes.slice(0, LIMITS.maxScenes)) {
    if (!isObj(s)) continue;
    const text = cleanText(s.text, 600);
    if (!text) continue;
    const teamIds = new Set<string>();
    const effects: SceneEffect[] = [];
    const coachRelations: SceneCoachRelation[] = [];
    const squadMorale: Array<{ teamId: string; delta: number }> = [];

    for (const p of Array.isArray(s.players) ? s.players : []) {
      if (!isObj(p)) continue;
      const player = keys.players.get(String(p.key));
      if (!player) continue;
      teamIds.add(player.teamId);
      for (const e of Array.isArray(p.effects) ? p.effects : []) {
        if (!isObj(e)) continue;
        const value = Number(e.value);
        switch (e.kind) {
          case "condition": if (Number.isFinite(value) && value !== 0) effects.push({ playerId: player.id, kind: "condition", value: clamp(value, LIMITS.condition) }); break;
          case "morale": if (Number.isFinite(value) && value !== 0) effects.push({ playerId: player.id, kind: "morale", value: clamp(value, LIMITS.morale) }); break;
          case "coach_bond": if (Number.isFinite(value) && value !== 0) effects.push({ playerId: player.id, kind: "coach_bond", value: clamp(value, LIMITS.coachBond) }); break;
          case "hangover": effects.push({ playerId: player.id, kind: "hangover", value: 1 }); break;
          case "injury":
            if (injuries < LIMITS.maxInjuries) { injuries++; effects.push({ playerId: player.id, kind: "injury", value: clamp(Number.isFinite(value) ? value : 1, LIMITS.injuryDays) }); }
            break;
          case "suspension":
            if (suspensions < LIMITS.maxSuspensions) { suspensions++; effects.push({ playerId: player.id, kind: "suspension", value: 1 }); }
            break;
        }
      }
    }

    for (const c of Array.isArray(s.coaches) ? s.coaches : []) {
      if (!isObj(c)) continue;
      const a = keys.coaches.get(String(c.a));
      const b = keys.coaches.get(String(c.b));
      if (!a || !b || a.teamId === b.teamId) continue;
      teamIds.add(a.teamId);
      teamIds.add(b.teamId);
      const respect = clamp(Number(c.respect) || 0, LIMITS.respect);
      const heat = clamp(Number(c.heat) || 0, LIMITS.heat);
      if (respect !== 0 || heat !== 0) coachRelations.push({ teamA: a.teamId, teamB: b.teamId, respect, heat });
    }

    for (const m of Array.isArray(s.squad_morale) ? s.squad_morale : []) {
      if (!isObj(m)) continue;
      const coach = keys.coaches.get(String(m.coach));
      const delta = clamp(Number(m.delta) || 0, LIMITS.squadMorale);
      if (!coach || delta === 0) continue;
      teamIds.add(coach.teamId);
      squadMorale.push({ teamId: coach.teamId, delta });
    }

    let transferHint: EventScene["transferHint"];
    if (isObj(s.transfer)) {
      const player = keys.players.get(String(s.transfer.player));
      const coach = keys.coaches.get(String(s.transfer.coach));
      if (player && coach && player.teamId !== coach.teamId) {
        transferHint = { playerId: player.id, toTeamId: coach.teamId };
        teamIds.add(player.teamId);
        teamIds.add(coach.teamId);
      }
    }

    // Kdo ve scéně vystupuje (i bez číselných následků), aby ji jeho klub viděl.
    const people = new Map<string, ScenePerson>();
    const addCoach = (c: EventCoach) => people.set(`c:${c.teamId}`, { kind: "coach", id: c.teamId, teamId: c.teamId });
    const addPlayer = (p: EventPlayer) => people.set(`p:${p.id}`, { kind: "player", id: p.id, teamId: p.teamId });
    let named = 0;
    for (const k of Array.isArray(s.who) ? s.who : []) {
      const coach = keys.coaches.get(String(k));
      const player = keys.players.get(String(k));
      if (coach) addCoach(coach);
      if (player) addPlayer(player);
      if (coach || player) { teamIds.add((coach ?? player)!.teamId); named++; }
    }
    for (const e of effects) {
      const p = [...keys.players.values()].find((x) => x.id === e.playerId);
      if (p) addPlayer(p);
    }
    for (const r of coachRelations) {
      for (const c of keys.coaches.values()) if (c.teamId === r.teamA || c.teamId === r.teamB) addCoach(c);
    }
    // Pojistka jen když model `who` vynechá: jméno v textu, i skloňované (kmen bez koncovky).
    // Podle textu se plete stejné příjmení v různých klubech, proto až jako poslední možnost.
    if (named === 0) {
      const mentions = (name: string) => text.includes(name.length > 4 ? name.slice(0, -1) : name);
      for (const c of keys.coaches.values()) if (mentions(c.name) || text.includes(c.teamName)) teamIds.add(c.teamId);
      for (const p of keys.players.values()) if (mentions(p.lastName)) teamIds.add(p.teamId);
    }

    if (transferHint) {
      const p = [...keys.players.values()].find((x) => x.id === transferHint!.playerId);
      const c = [...keys.coaches.values()].find((x) => x.teamId === transferHint!.toTeamId);
      if (p) addPlayer(p);
      if (c) addCoach(c);
    }
    scenes.push({ text, people: [...people.values()], teamIds: [...teamIds], effects, coachRelations, squadMorale, ...(transferHint ? { transferHint } : {}) });
  }

  if (!scenes.length) return null;
  const headline = cleanText(raw.headline, 140) || "Z okresní akce";
  const body = cleanText(raw.body, 1500);
  return { headline, body, scenes };
}

/** Popisek následku pro Události a SMS. */
export function effectLabel(e: SceneEffect): string {
  switch (e.kind) {
    case "condition": return `${e.value > 0 ? "+" : ""}${e.value} kondice`;
    case "morale": return `${e.value > 0 ? "+" : ""}${e.value} nálada`;
    case "coach_bond": return e.value > 0 ? "lepší vztah s trenérem" : "horší vztah s trenérem";
    case "hangover": return "kocovina";
    case "injury": return `lehké zranění (${e.value} ${e.value === 1 ? "den" : e.value < 5 ? "dny" : "dní"})`;
    case "suspension": return "stopka na 1 zápas";
  }
}

// ── Pozvánka a odpověď trenéra ──

export function buildInvitationPrompt(title: string, place: string, description: string): string {
  return [
    "Napiš krátkou SMS pozvánku pro trenéra okresního fotbalového klubu na zítřejší akci v okrese.",
    `Akce: ${title}, místo: ${place}. ${description}`,
    "Pozvánka je od pořadatelů, 2 až 3 věty, hovorově, s chutí. Zmiň, že tam budou trenéři i hráči z celého okresu,",
    "a na konci se zeptej, jestli přijde. Česky se správným skloňováním, bez dlouhé pomlčky, bez uvozovek. Vrať jen text SMS.",
  ].join("\n");
}

/** Pozvánka, když model nepíše: složená jen ze zadání akce. */
export function plainInvitation(title: string, place: string, description: string): string {
  return `Zítra: ${title}. Místo: ${place}. ${description} Budou tam trenéři i hráči z celého okresu. Přijdete?`.replace(LONG_DASH, ", ");
}

export function cleanInvitation(text: string | null): string | null {
  const t = cleanText(text?.replace(/^["„]|["“]$/g, ""), 500);
  return t.length >= 20 ? t : null;
}

export const EVENT_REPLY_OPTIONS: Array<{ id: EventChoice; label: string; text: string }> = [
  { id: "with_players", label: "Přijdu s hráči", text: "Přijdu a beru s sebou kluky!" },
  { id: "alone", label: "Přijdu sám", text: "Přijdu, ale sám." },
  { id: "skip", label: "Nepřijdu", text: "Tentokrát nepřijdu." },
];

export const EVENT_CONFIRMATIONS: Record<EventChoice, string> = {
  with_players: "Počítáme s vámi i s klukama.",
  alone: "Počítáme s vámi.",
  skip: "Škoda. Kdo z kluků bude chtít, ten dorazí i bez vás.",
};

/** Odpověď trenéra z volného textu (tlačítka posílají volbu rovnou). */
export function classifyEventReply(text: string): EventChoice {
  const t = text.toLowerCase();
  if (/(^|\s)(ne|nep[řr]ijdu|nejdu|nem[uů][žz]u|nedorazím|nedorazim)(\s|$|[,.!])/.test(t)) return "skip";
  if (/(kluk|hr[aá][čc]|partou|partu|v[šs]ichni|kabin|t[ýy]mem)/.test(t)) return "with_players";
  return "alone";
}

export function isEventChoice(v: unknown): v is EventChoice {
  return typeof v === "string" && (EVENT_CHOICES as readonly string[]).includes(v);
}
