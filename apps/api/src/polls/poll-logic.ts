/**
 * Anketa Fotbalista okresu: čisté funkce bez databáze.
 *
 * Nominace z odehrané sezóny (nejvýš dva hráči z klubu), rozpoznání hlasu z volné SMS
 * („dávám Horáka z Volar“, „trojka“, „Pepu Nováka“), sečtení hlasů a termíny.
 */

export const NOMINEES = 10;
export const MAX_PER_CLUB = 2;
/** Kolik hráčů dostane redaktor (model) na výběr. */
export const SHORTLIST = 25;
export const FAN_GROUP_WEIGHT = 0.5;
/** Nominace 24 dní před posledním kolem (4. 1. při konci 28. 1.), uzávěrka den před ním večer. */
export const NOMINATE_DAYS_BEFORE = 24;
export const CLOSE_DAYS_BEFORE = 1;
export const CLOSE_HOUR = 19;

export interface SeasonPlayer {
  playerId: string;
  name: string;
  nickname: string | null;
  teamId: string;
  teamName: string;
  position: string;
  goals: number;
  assists: number;
  avgRating: number;
  apps: number;
}

/** Stejné skóre jako u ocenění sezóny (season-awards.ts). */
export function seasonScore(p: Pick<SeasonPlayer, "avgRating" | "goals" | "assists" | "apps">): number {
  return p.avgRating + p.goals * 0.08 + p.assists * 0.04 + p.apps * 0.03;
}

export function rankPlayers<T extends SeasonPlayer>(players: T[]): T[] {
  return [...players].sort((a, b) => seasonScore(b) - seasonScore(a) || a.playerId.localeCompare(b.playerId));
}

/**
 * Deset kandidátů: nejdřív ti, které vybral redaktor (platná id, nejvýš dva z klubu),
 * zbytek se doplní podle skóre sezóny se stejným omezením.
 */
export function pickNominees<T extends SeasonPlayer>(shortlist: T[], editorPicks: string[] = []): T[] {
  const ranked = rankPlayers(shortlist);
  const byId = new Map(ranked.map((p) => [p.playerId, p]));
  const out: T[] = [];
  const perClub = new Map<string, number>();
  const tryAdd = (p: T | undefined) => {
    if (!p || out.includes(p) || out.length >= NOMINEES) return;
    if ((perClub.get(p.teamId) ?? 0) >= MAX_PER_CLUB) return;
    perClub.set(p.teamId, (perClub.get(p.teamId) ?? 0) + 1);
    out.push(p);
  };
  for (const id of editorPicks) tryAdd(byId.get(id));
  for (const p of ranked) tryAdd(p);
  return out;
}

/** Popisek kandidáta bez modelu: góly, asistence, zápasy. */
export function plainBlurb(p: Pick<SeasonPlayer, "goals" | "assists" | "apps" | "position">): string {
  const goals = p.goals === 1 ? "1 gól" : p.goals >= 2 && p.goals <= 4 ? `${p.goals} góly` : `${p.goals} gólů`;
  const apps = p.apps === 1 ? "1 zápas" : p.apps >= 2 && p.apps <= 4 ? `${p.apps} zápasy` : `${p.apps} zápasů`;
  if (p.position === "GK") return `${apps} v bráně`;
  return p.assists > 0 ? `${goals}, ${p.assists} asist., ${apps}` : `${goals}, ${apps}`;
}

export function normalize(text: string): string {
  return text.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
}

/** Kmen jména pro skloňování: Horák → hora, Nováka → nova (první 4 znaky, u krátkých celé bez koncovky). */
function stem(word: string): string {
  const w = normalize(word);
  if (w.length <= 4) return w.slice(0, Math.max(3, w.length - 1));
  return w.slice(0, Math.max(4, w.length - 2));
}

export interface VoteCandidate {
  playerId: string;
  name: string;
  nickname?: string | null;
  teamName: string;
  rank: number;
}

const NUMBER_WORDS: Record<string, number> = {
  jednicka: 1, jednicku: 1, dvojka: 2, dvojku: 2, trojka: 3, trojku: 3, ctyrka: 4, ctyrku: 4, petka: 5, petku: 5,
  sestka: 6, sestku: 6, sedmicka: 7, sedmicku: 7, osmicka: 8, osmicku: 8, devitka: 9, devitku: 9, desitka: 10, desitku: 10,
};

/**
 * Pozná, koho trenér volí. Vrací id kandidáta, `null` když nikoho, `"ambiguous"` když sedí
 * víc lidí stejně (pak rozhodne model nebo se redaktor doptá).
 * Pořadí: číslo ze seznamu, příjmení (i skloňované), přezdívka, křestní jméno s klubem.
 */
export function matchVote(text: string, candidates: VoteCandidate[]): string | "ambiguous" | null {
  const t = ` ${normalize(text)} `;
  const words = t.trim().split(" ");
  const byRank = (n: number) => candidates.find((c) => c.rank === n)?.playerId ?? null;
  for (const w of words) {
    if (NUMBER_WORDS[w]) return byRank(NUMBER_WORDS[w]);
  }
  const numbers = words.filter((w) => /^\d{1,2}$/.test(w)).map(Number).filter((n) => n >= 1 && n <= candidates.length);
  if (numbers.length === 1 && words.length <= 6) return byRank(numbers[0]);

  const scores = candidates.map((c) => {
    const parts = normalize(c.name).split(" ");
    const surname = parts[parts.length - 1] ?? "";
    const first = parts[0] ?? "";
    let score = 0;
    if (surname.length >= 3 && words.some((w) => w.startsWith(stem(surname)))) score += 3;
    if (c.nickname && words.some((w) => w.startsWith(stem(c.nickname!)))) score += 3;
    if (first.length >= 3 && words.some((w) => w.startsWith(stem(first)))) score += 1;
    const teamWords = normalize(c.teamName).split(" ").filter((w) => w.length >= 4);
    if (teamWords.some((tw) => words.some((w) => w.length >= 4 && w.startsWith(stem(tw))))) score += 1;
    return { id: c.playerId, score };
  });
  const best = Math.max(0, ...scores.map((s) => s.score));
  if (best < 3) return null;
  const top = scores.filter((s) => s.score === best);
  return top.length === 1 ? top[0].id : "ambiguous";
}

export interface Ballot {
  voterKind: "team" | "fan_group";
  voterId: string;
  playerId: string | null;
  weight: number;
}

export interface TallyRow {
  playerId: string;
  points: number;
  votes: number;
}

/** Součet hlasů. Při rovnosti vyhraje lépe nominovaný (nižší rank = lepší sezóna). */
export function tallyBallots(ballots: Ballot[], candidates: Array<Pick<VoteCandidate, "playerId" | "rank">>): TallyRow[] {
  const rows = new Map(candidates.map((c) => [c.playerId, { playerId: c.playerId, points: 0, votes: 0 }]));
  for (const b of ballots) {
    const row = b.playerId ? rows.get(b.playerId) : undefined;
    if (!row) continue;
    row.points += b.weight;
    row.votes += 1;
  }
  const rank = new Map(candidates.map((c) => [c.playerId, c.rank]));
  return [...rows.values()].sort((a, b) => b.points - a.points || (rank.get(a.playerId) ?? 99) - (rank.get(b.playerId) ?? 99));
}

function addDays(date: string, days: number): string {
  const d = new Date(`${date.slice(0, 10)}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Termíny ankety z data posledního kola sezóny (YYYY-MM-DD). */
export function pollSchedule(lastRoundDate: string): { nominateOn: string; closeOn: string } {
  return { nominateOn: addDays(lastRoundDate, -NOMINATE_DAYS_BEFORE), closeOn: addDays(lastRoundDate, -CLOSE_DAYS_BEFORE) };
}

/** Hlas AI klubu nebo kotle bez modelu: kotel volí svého, klub nejlepšího cizího. */
export function fallbackVote(
  voter: { kind: "team" | "fan_group"; teamId: string },
  candidates: Array<{ playerId: string; teamId: string; rank: number }>,
): string | null {
  const sorted = [...candidates].sort((a, b) => a.rank - b.rank);
  if (voter.kind === "fan_group") return (sorted.find((c) => c.teamId === voter.teamId) ?? sorted[0])?.playerId ?? null;
  return sorted.find((c) => c.teamId !== voter.teamId)?.playerId ?? null;
}
