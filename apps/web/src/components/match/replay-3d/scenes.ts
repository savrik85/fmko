// 3D záznam je sestřih: každá událost zápasu má vlastní krátkou scénu, která začíná střihem na rozestavení
// a končí, když ji 2D záznam vystřídá další událostí. Engine neukládá souřadnice, scény se proto skládají
// z uložených událostí; náhoda z id zápasu vybírá jen kosmetiku, takže přehrání vypadá vždy stejně.
import { PITCH } from "../../stadium/stadium-3d/constants";

export const HALF_W = PITCH.width / 2;
export const HALF_L = PITCH.depth / 2;
const GOAL_HALF_W = 3.66, GOAL_H = 2.44, PENALTY_SPOT = 11, BOX_DEPTH = 18;
/** Střídačky stojí u západní lajny. */
const BENCH_X = -HALF_W;
const MAX_SPEED = 9;
/** O tolik dřív před střihem figury a míč ještě stojí na starém místě. */
const CUT = 1e-3;
/** Výška výskoku na hlavičku. */
const HOP = 0.7;
/** Jak dlouho drží jednotlivé kroky 2D záznam na „Živě“ (zaznam/page.tsx); scény jsou napsané na tyhle délky. */
const PLAIN = 3.5, ATTACK = 3.5, GOAL = 6, CHANCE = 3, DRAMA = 4, PENALTY = 7;

export type Side = "home" | "away";
type Role = "GK" | "DEF" | "MID" | "FWD";
export type Pose = "down" | "diveLeft" | "diveRight" | "celebrate" | "armUp";
export type ShotResult = "goal" | "saved" | "post" | "bar" | "wide" | "over" | "blocked";
type CardColor = "yellow" | "red";

export interface ReplayPlayer { id: string; name: string; position: string; skinColor?: string; hairColor?: string | null; height?: number }
export interface ReplayKit { shirt: string; shorts: string; socks: string }
export interface ReplayTeam { name: string; kit: ReplayKit; starters: ReplayPlayer[]; subs: ReplayPlayer[] }
/** Událost zápasu, jak ji ukládá engine (detail zápasu z API). */
export interface ReplayEvent { minute: number; type: string; playerId: number; playerName: string; teamId: number; description: string; detail?: string; source?: string }
export interface ReplayInput { matchId: string; events: ReplayEvent[]; home: ReplayTeam; away: ReplayTeam }
export interface Figure { team: Side | "referee"; player: ReplayPlayer }

interface Point { x: number; z: number }
/** Kruh, kde se scéna odehraje; hráči bez úkolu v něm nestojí. */
interface Zone extends Point { r: number }
interface Key extends Point { t: number }
interface BallKey extends Point { t: number; h: number; arc: number }
interface Span { from: number; to: number; pose: Pose }
interface SlotBase { u: number; v: number; role: Role }
interface Slot { figure: number; base: SlotBase; role: Role }
type Roster = Record<Side, Slot[]>;
/** `hops` = časy vrcholu výskoku; `until` = od kdy figura ve scéně není (po střihu na jiné rozestavení); `keepers` = kdo má brankářský dres. */
export interface Clip { tracks: Key[][]; poses: Span[][]; hops: number[][]; until: number[]; ball: BallKey[]; cuts: number[]; keepers: Set<number> }

/** Úsek klipu, který patří jedné události: útok běží od `start` po `split`, zbytek do `end`. */
export interface Scene {
  clip: Clip; start: number; split: number; end: number;
  /** Hráči, o které ve scéně jde (kroužek pod nohama). */
  focus: number[];
  card: { at: number; color: CardColor } | null;
  result: ShotResult | null;
  /** Scéna o jednom hráči (faul, karta, zranění, střídání): kamera si ji přiblíží. */
  close: boolean;
}
type Window = Omit<Scene, "clip">;

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
const lerp = (a: number, b: number, s: number) => a + (b - a) * s;
const dist = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.z - b.z);
const other = (side: Side): Side => (side === "home" ? "away" : "home");
const sideOf = (teamId: number): Side => (teamId === 1 ? "home" : "away");
const toRole = (position: string): Role => (position === "GK" || position === "DEF" || position === "FWD" ? position : "MID");
/** Domácí útočí celý zápas k záporné z: z hlavní tribuny doprava, stejně jako ve 2D záznamu. */
const attackSign = (side: Side) => (side === "home" ? -1 : 1);
const goalZ = (side: Side) => attackSign(side) * HALF_L;
/** Bod `gap` metrů od `from` směrem k `to` (záporné = od něj). */
const toward = (from: Point, to: Point, gap: number): Point => {
  const d = dist(from, to) || 1;
  return { x: from.x + ((to.x - from.x) / d) * gap, z: from.z + ((to.z - from.z) / d) * gap };
};
/** u = 0 vlastní branka, 1 soupeřova; v = -1..1 napříč hřištěm. */
const uvToWorld = (side: Side, u: number, v: number): Point => ({ x: attackSign(side) * v * (HALF_W - 2), z: attackSign(side) * (u - 0.5) * PITCH.depth });
/** Kam běží střelec slavit: k rohovému praporku pod hlavní tribunou, před kameru. */
const celebrationSpot = (gz: number): Point => ({ x: HALF_W - 4, z: gz - Math.sign(gz) * 5 });
/** Bod před brankou `gz`: `across` metrů do strany, `out` metrů do hřiště. */
const inFront = (gz: number, across: number, out: number): Point => ({ x: across, z: gz - Math.sign(gz) * out });

function seededRng(seed: string) {
  let a = 0;
  for (let i = 0; i < seed.length; i++) a = (Math.imul(a, 31) + seed.charCodeAt(i)) | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Řady podle rolí: brankář, obrana, záloha, útok; hráči jedné řady vedle sebe. */
function slotBases(starters: ReplayPlayer[]): SlotBase[] {
  const lineU: Record<Role, number> = { GK: 0.03, DEF: 0.2, MID: 0.42, FWD: 0.63 };
  const roles = starters.map((p) => toRole(p.position));
  return roles.map((role, i) => {
    const line = roles.flatMap((r, j) => (r === role ? [j] : []));
    const spread = role === "GK" ? 0 : Math.min(0.78, 0.26 * (line.length - 1));
    return { u: lineU[role], v: line.length === 1 ? 0 : -spread + (2 * spread * line.indexOf(i)) / (line.length - 1), role };
  });
}

const DETAIL_RESULTS = new Map<string | undefined, ShotResult>([
  ["vedle", "wide"], ["břevno", "bar"], ["tyč", "post"], ["chytil brankář", "saved"], ["zblokováno", "blocked"],
  ["penalty_saved", "saved"], ["penalty_missed", "wide"], ["shootout:saved", "saved"], ["shootout:wide", "wide"], ["shootout:goal", "goal"],
]);

/** U standardek engine výsledek neukládá, pozná se jen z textu. */
function chanceResult(e: ReplayEvent): ShotResult {
  const d = e.description;
  return DETAIL_RESULTS.get(e.detail) ?? (/do zdi|zblokováno/.test(d) ? "blocked" : d.includes("nad břevno") ? "over" : /chytil brankář|vyráží/.test(d) ? "saved" : "wide");
}

/** Události jedné akce (roh → gól → asistence, šance → zákrok, faul → karta…) tvoří jeden klip. */
function follows(head: ReplayEvent, e: ReplayEvent): boolean {
  if (e.minute !== head.minute) return false;
  const sameTeam = e.teamId === head.teamId;
  const finish = sameTeam && (e.type === "goal" || e.type === "chance" || e.type === "assist");
  switch (head.type) {
    case "corner":
    case "freekick": return finish;
    case "penalty": return finish || (!sameTeam && e.detail === "penalty_save");
    case "chance": return !sameTeam && (e.detail === "save" || e.detail === "block" || e.detail === "gk_hero");
    case "goal": return sameTeam && e.type === "assist";
    case "foul": return e.type === "card";
    case "injury": return sameTeam && e.type === "substitution";
    default: return false;
  }
}

/**
 * Penaltový rozstřel jako události na konec záznamu. Uložený je jen výsledek rozstřelu, pořadí proměněných
 * a neproměněných kopů se proto dopočítá: oba týmy kopou stejně, poražený zahazuje naposled.
 */
export function shootoutEvents(detail: Record<string, unknown>): ReplayEvent[] {
  const pens = { home: detail.home_pens, away: detail.away_pens };
  // Pohár ukládá u zápasu bez rozstřelu 0:0, turnaj NULL.
  if (typeof pens.home !== "number" || typeof pens.away !== "number" || pens.home + pens.away === 0) return [];
  const goals = pens as Record<Side, number>;
  const rounds = Math.max(5, goals.home, goals.away);
  const rng = seededRng(`${detail.id}:shootout`);
  const scored = { home: 0, away: 0 };
  const events: ReplayEvent[] = [];
  for (let round = 0; round < rounds; round++) {
    for (const side of ["home", "away"] as const) {
      const loser = goals[side] < goals[other(side)];
      // Poražený zahazuje v posledních kolech, vítěz kdykoli (dokud mu góly vycházejí).
      const left = rounds - round, need = goals[side] - scored[side];
      const goal = need > 0 && (loser || need >= left || rng() < need / left);
      if (goal) scored[side]++;
      const name = (detail[`${side}_name`] as string) ?? (side === "home" ? "Domácí" : "Hosté");
      events.push({
        minute: 90, type: "special", playerId: 0, playerName: name, teamId: side === "home" ? 1 : 2,
        description: `Rozstřel, ${round + 1}. série: ${name} ${goal ? "proměňují" : "nedávají"} (${scored.home}:${scored.away})`,
        detail: goal ? "shootout:goal" : rng() < 0.6 ? "shootout:saved" : "shootout:wide",
      });
    }
  }
  return events;
}

/**
 * Čas v klipu `elapsed` sekund po začátku kroku 2D záznamu: útočná fáze běží po `split`, zbytek scény od něj.
 * Na konci scéna drží poslední snímek, těsně před případným střihem další scény.
 */
export function sceneTime(scene: Scene, attack: boolean, elapsed: number): number {
  return attack ? Math.min(scene.start + elapsed, scene.split) : Math.min(scene.split + elapsed, scene.end - 2 * CUT);
}

/** Stav klipu v čase `t`, zapsaný do `out`. */
export interface Frame {
  figures: { visible: boolean; x: number; y: number; z: number; pose: Pose | null }[];
  ballX: number; ballY: number; ballZ: number;
  /** Kolik střihů už v klipu proběhlo; při změně hráči neběží, ale stojí rovnou na místě. */
  cuts: number;
}

export function sampleClip(clip: Clip, t: number, out: Frame): void {
  clip.tracks.forEach((keys, i) => {
    const f = out.figures[i];
    f.visible = keys.length > 0 && t >= keys[0].t && t < clip.until[i];
    if (!f.visible) return;
    const n = keys.findIndex((k) => k.t > t);
    const k1 = keys[n < 0 ? keys.length - 1 : n], k0 = n > 0 ? keys[n - 1] : k1;
    const s = k1.t > k0.t ? clamp((t - k0.t) / (k1.t - k0.t), 0, 1) : 1;
    f.x = lerp(k0.x, k1.x, s);
    f.z = lerp(k0.z, k1.z, s);
    f.y = clip.hops[i].reduce((y, peak) => Math.max(y, HOP * (1 - ((t - peak) / 0.35) ** 2)), 0);
    f.pose = clip.poses[i].findLast((p) => p.from <= t && t < p.to)?.pose ?? null;
  });
  const n = clip.ball.findIndex((k) => k.t > t);
  const k1 = clip.ball[n < 0 ? clip.ball.length - 1 : n], k0 = n > 0 ? clip.ball[n - 1] : k1;
  const s = k1.t > k0.t ? clamp((t - k0.t) / (k1.t - k0.t), 0, 1) : 1;
  out.ballX = lerp(k0.x, k1.x, s);
  out.ballZ = lerp(k0.z, k1.z, s);
  out.ballY = lerp(k0.h, k1.h, s) + k1.arc * 4 * s * (1 - s);
  out.cuts = clip.cuts.filter((c) => c <= t).length;
}

/** Rozestavení a pohyb v jednom klipu. Čas `t` běží dopředu přes `wait`; pohyby začínají v `t` (+ `delay`). */
class Stage {
  t = 0;
  readonly clip: Clip;
  /** Kdo od posledního střihu dostal pohyb ze scénáře; ostatní na konci popojdou za míčem. */
  private scripted = new Set<number>();
  private react: ((slot: Slot, side: Side, ball: Point) => Point) | null = null;

  constructor(figures: number, private roster: Roster, readonly rng: () => number, private readonly referee: number) {
    const lists = <T>() => Array.from({ length: figures }, (): T[] => []);
    this.clip = { tracks: lists(), poses: lists(), hops: lists(), until: Array.from({ length: figures }, () => Infinity), ball: [], cuts: [], keepers: new Set() };
  }

  /**
   * Střih: všichni stojí rovnou na místech. `fixed` jsou místa ze scénáře (i pro rozhodčího a střídajícího),
   * ostatní dostanou místo z `spotOf`, rozestoupí se a uhnou ze zón `keep`, kde se scéna odehraje.
   * S `react` hráči bez úkolu na konci popojdou za míčem.
   */
  layout(ball: Point, spotOf: (slot: Slot, side: Side) => Point, fixed: Map<number, Point>, keep: Zone[] = [], react: Stage["react"] = null) {
    const spots = new Map(fixed);
    const free: number[] = [];
    for (const side of ["home", "away"] as const) {
      for (const slot of this.roster[side]) {
        if (spots.has(slot.figure)) continue;
        spots.set(slot.figure, spotOf(slot, side));
        free.push(slot.figure);
      }
    }
    const referee = spots.get(this.referee) ?? { x: ball.x + 5, z: ball.z + (ball.z > 0 ? -7 : 7) };
    spots.set(this.referee, { x: clamp(referee.x, -HALF_W + 2, HALF_W - 2), z: clamp(referee.z, -HALF_L + 3, HALF_L - 3) });
    // Volní hráči si udělají místo mezi sebou, kolem hráčů ze scénáře i kolem zón, kde se scéna odehraje.
    // V každém kole se sečtou všechny odstrky najednou; postupné odstrkování se ve vápně plném hráčů neustálilo.
    for (let round = 0; round < 60; round++) {
      const pushes = free.map((i) => {
        const p = spots.get(i)!;
        const push = { x: 0, z: 0 };
        const around: [number, Zone][] = [...[...spots].map(([j, q]): [number, Zone] => [j, { ...q, r: 1.8 }]), ...keep.map((q): [number, Zone] => [-1, q])];
        for (const [j, q] of around) {
          const d = dist(p, q);
          if (j === i || d >= q.r) continue;
          // Dva volní si ustoupí napůl, pevnému místu ustupuje jen volný.
          const share = (q.r - d) * (free.includes(j) ? 0.5 : 1);
          push.x += (d < 0.01 ? Math.cos(i) : (p.x - q.x) / d) * share;
          push.z += (d < 0.01 ? Math.sin(i) : (p.z - q.z) / d) * share;
        }
        return push;
      });
      if (pushes.every((v) => v.x === 0 && v.z === 0)) break;
      free.forEach((i, n) => {
        const p = spots.get(i)!;
        p.x = clamp(p.x + pushes[n].x, -HALF_W + 0.5, HALF_W - 0.5);
        p.z = clamp(p.z + pushes[n].z, -HALF_L + 0.5, HALF_L - 0.5);
      });
    }
    if (this.t > 0) this.clip.cuts.push(this.t);
    for (const side of ["home", "away"] as const) this.clip.keepers.add(this.keeper(side));
    this.clip.tracks.forEach((keys, i) => {
      const p = spots.get(i);
      if (p && keys.length) keys.push({ ...keys[keys.length - 1], t: this.t - CUT });
      if (p) keys.push({ t: this.t, x: p.x, z: p.z });
      else if (keys.length) this.clip.until[i] = Math.min(this.clip.until[i], this.t);
      this.clip.poses[i] = this.clip.poses[i].map((s) => ({ ...s, to: Math.min(s.to, this.t) }));
    });
    const last = this.clip.ball[this.clip.ball.length - 1];
    if (last) this.clip.ball.push({ ...last, t: this.t - CUT, arc: 0 });
    this.clip.ball.push({ t: this.t, ...ball, h: 0, arc: 0 });
    this.scripted = new Set(fixed.keys());
    this.react = react;
  }

  pos(i: number, t = Infinity): Point {
    const keys = this.clip.tracks[i];
    if (!keys.length) throw new Error(`Figura ${i} ve scéně není`);
    const n = keys.findIndex((k) => k.t > t);
    const k1 = keys[n < 0 ? keys.length - 1 : n], k0 = n > 0 ? keys[n - 1] : k1;
    const s = k1.t > k0.t ? clamp((t - k0.t) / (k1.t - k0.t), 0, 1) : 1;
    return { x: lerp(k0.x, k1.x, s), z: lerp(k0.z, k1.z, s) };
  }

  get ball(): Point { return this.clip.ball[this.clip.ball.length - 1]; }

  go(i: number, to: Point, seconds: number, delay = 0) {
    const keys = this.clip.tracks[i];
    const start = this.t + delay;
    const from = this.pos(i);
    if (start < keys[keys.length - 1].t - 1e-6) throw new Error(`Figura ${i} má v čase ${start} už jiný pohyb`);
    if (dist(from, to) / seconds > MAX_SPEED) throw new Error(`Figura ${i} by běžela ${(dist(from, to) / seconds).toFixed(1)} m/s`);
    keys.push({ t: start, ...from }, { t: start + seconds, x: to.x, z: to.z });
    this.scripted.add(i);
  }

  /** Běží k místu, jak daleko to za daný čas stihne (obránce, který dobíhá akci). */
  chase(i: number, to: Point, seconds: number, delay = 0) {
    const from = this.pos(i);
    this.go(i, toward(from, to, Math.min(dist(from, to), 7 * seconds)), seconds, delay);
  }

  /** Výskok na hlavičku: nahoře je hráč v čase `t` + `delay`. */
  jump(i: number, delay = 0) { this.clip.hops[i].push(this.t + delay); }

  pose(i: number, pose: Pose, seconds = Infinity, delay = 0) {
    this.clip.poses[i].push({ from: this.t + delay, to: this.t + delay + seconds, pose });
    this.scripted.add(i);
  }

  ballTo(to: Point, seconds: number, opts: { h?: number; arc?: number } = {}, delay = 0) {
    const ball = this.clip.ball, last = ball[ball.length - 1];
    const start = this.t + delay;
    if (start < last.t - 1e-6) throw new Error(`Míč má v čase ${start} už jiný pohyb`);
    if (start > last.t) ball.push({ ...last, t: start, arc: 0 });
    ball.push({ t: start + seconds, x: to.x, z: to.z, h: opts.h ?? 0, arc: opts.arc ?? 0 });
  }

  /** Hráč běží s míčem; míč má kousek před sebou. */
  dribble(i: number, to: Point, seconds: number) {
    this.go(i, to, seconds);
    this.ballTo(toward(to, this.pos(i, this.t), -0.7), seconds);
  }

  /** Přihrávka před nohy hráči tam, kde v tu chvíli bude. */
  pass(i: number, seconds: number, opts: { h?: number; arc?: number } = {}) {
    this.ballTo(toward(this.pos(i, this.t + seconds), this.ball, 0.5), seconds, opts);
  }

  wait(seconds: number) { this.t += seconds; }
  /** Další rozestavení už počítá s jiným obsazením (druhé střídání v jedné akci). */
  recast(roster: Roster) { this.roster = roster; }
  slot(i: number): Slot {
    const slot = [...this.roster.home, ...this.roster.away].find((s) => s.figure === i);
    if (!slot) throw new Error(`Figura ${i} není na hřišti`);
    return slot;
  }

  slots(side: Side, roles?: Role[]): Slot[] { return this.roster[side].filter((s) => !roles || roles.includes(s.role)); }
  /** Brankář; tým bez brankáře v sestavě má v bráně prvního hráče (stejně jako engine). */
  keeper(side: Side): number { return (this.slots(side, ["GK"])[0] ?? this.roster[side][0]).figure; }
  outfield(side: Side, exclude: number[] = []): number[] {
    const keeper = this.keeper(side);
    return this.roster[side].map((s) => s.figure).filter((f) => f !== keeper && !exclude.includes(f));
  }
  /** Náhodný hráč z pole, nejraději z daných řad; null, když tým nikoho takového na hřišti nemá. */
  pick(side: Side, exclude: number[], roles: Role[]): number | null {
    const outfield = this.outfield(side, exclude);
    const preferred = outfield.filter((f) => this.slots(side, roles).some((s) => s.figure === f));
    const list = preferred.length ? preferred : outfield;
    return list.length ? list[Math.floor(this.rng() * list.length)] : null;
  }
  /** Nejbližší hráč z pole; null, když tým v poli nikoho nemá. */
  nearest(side: Side, p: Point, exclude: number[] = []): number | null {
    return this.outfield(side, exclude).reduce<number | null>((best, f) => (best === null || dist(this.pos(f), p) < dist(this.pos(best), p) ? f : best), null);
  }

  /** Konec klipu: hráči bez úkolu popojdou tam, kam patří podle míče (nestojí jako sochy). */
  finish(): Clip {
    const react = this.react;
    const cut = this.clip.cuts[this.clip.cuts.length - 1] ?? 0;
    if (react && this.t > cut) {
      const shown = this.clip.tracks.flatMap((keys, i) => (keys.length && this.clip.until[i] === Infinity ? [i] : []));
      for (const side of ["home", "away"] as const) {
        for (const slot of this.roster[side]) {
          if (this.scripted.has(slot.figure)) continue;
          const from = this.pos(slot.figure);
          const to = react(slot, side, this.ball);
          const reach = Math.min(dist(from, to), 2.2 * (this.t - cut), 6);
          // Jen tak daleko, aby cestou ani na konci nikomu nevběhl do těla.
          const step = [1, 0.66, 0.33].map((k) => toward(from, to, reach * k)).find((p) => [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1].every((k) => {
            const at = { x: lerp(from.x, p.x, k), z: lerp(from.z, p.z, k) };
            return shown.every((j) => j === slot.figure || dist(at, this.pos(j, lerp(cut, this.t, k))) > 1.8);
          }));
          if (step) this.clip.tracks[slot.figure].push({ t: this.t, ...step });
        }
      }
    }
    return this.clip;
  }
}

export class Replay {
  readonly figures: Figure[] = [];
  readonly referee: number;
  private readonly events: ReplayEvent[];
  /** Engine id hráče („home:7“) → figura. */
  private readonly ids = new Map<string, number>();
  /** Kdo je na hřišti před každou událostí. */
  private readonly rosters: Roster[] = [];
  private readonly swaps = new Map<number, { incoming: number; outgoing: number }>();
  /** Pro každou událost první událost její akce. */
  private readonly heads: number[] = [];
  private readonly clips = new Map<number, { clip: Clip; windows: Map<number, Window> }>();

  constructor(private readonly input: ReplayInput) {
    this.events = input.events;
    let roster: Roster = { home: [], away: [] };
    for (const side of ["home", "away"] as const) {
      const bases = slotBases(input[side].starters);
      input[side].starters.forEach((player, n) => {
        const figure = this.figures.push({ team: side, player }) - 1;
        // Engine čísluje domácí od 1 a hosty od 101 v pořadí sestavy.
        this.ids.set(`${side}:${n + (side === "home" ? 1 : 101)}`, figure);
        roster[side].push({ figure, base: bases[n], role: bases[n].role });
      });
    }
    this.referee = this.figures.push({ team: "referee", player: { id: "referee", name: "Rozhodčí", position: "MID", skinColor: "#E0B48C", hairColor: "#3B2F2F" } }) - 1;

    this.events.forEach((e, i) => {
      this.rosters.push(roster);
      const head = this.heads[i - 1];
      const chained = i > 0 && (follows(this.events[head], e) || (head !== i - 1 && follows(this.events[i - 1], e)));
      this.heads.push(chained ? head : i);
      const side = sideOf(e.teamId);
      if (e.type === "substitution") {
        // „X za Y“, u vyloučeného brankáře „X jde do brány za vyloučeného gólmana, ven jde Y“.
        const outName = e.description.match(/(?: za | ven jde )([^,]+)$/)?.[1].trim();
        const out = roster[side].find((s) => this.figures[s.figure].player.name === outName);
        if (!out) throw new Error(`Střídání v ${e.minute}. minutě: hráč „${outName}“ není na hřišti`);
        // Vzhled z uložené lavičky; starší pohárové a turnajové zápasy v ní střídající hráče nemají.
        const player = input[side].subs.find((p) => p.name === e.playerName) ?? { id: "", name: e.playerName, position: out.role };
        const figure = this.figures.push({ team: side, player }) - 1;
        this.ids.set(`${side}:${e.playerId}`, figure);
        this.swaps.set(i, { incoming: figure, outgoing: out.figure });
        // Náhradní brankář jde do brány jen za brankáře nebo když to engine napíše.
        const role = e.description.includes("do brány") ? "GK" : out.role;
        roster = { ...roster, [side]: roster[side].map((s) => (s === out ? { figure, base: out.base, role } : s)) };
      } else if (e.type === "card" && e.detail === "red") {
        const figure = this.figureOf(e);
        roster = { ...roster, [side]: roster[side].filter((s) => s.figure !== figure) };
      } else if (e.detail === "emergency_gk") {
        const figure = this.figureOf(e);
        roster = { ...roster, [side]: roster[side].map((s) => (s.figure === figure ? { ...s, role: "GK" as const } : s)) };
      }
    });
  }

  private figureOf(e: ReplayEvent): number {
    const figure = this.ids.get(`${sideOf(e.teamId)}:${e.playerId}`);
    if (figure === undefined) throw new Error(`Událost ${e.type} v ${e.minute}. minutě: hráč ${e.playerName} (${e.playerId}) není v sestavě`);
    return figure;
  }

  /** Scéna události `index`. */
  scene(index: number): Scene {
    const head = this.heads[index];
    let built = this.clips.get(head);
    if (!built) {
      const group = this.heads.flatMap((h, i) => (h === head ? [i] : []));
      const stage = new Stage(this.figures.length, this.rosters[head], seededRng(`${this.input.matchId}:${head}`), this.referee);
      const windows = new Map<number, Window>();
      this.play(stage, group, windows);
      built = { clip: stage.finish(), windows };
      this.clips.set(head, built);
    }
    // Událost bez vlastního úseku (asistence, zákrok brankáře) drží konec akce.
    const last = [...built.windows.values()].reduce((a, b) => (b.end > a.end ? b : a));
    return { clip: built.clip, ...(built.windows.get(index) ?? { ...last, start: last.end, split: last.end }) };
  }

  /** Rozestavení na výkop (začátek zápasu a poločasu) s hráči, kteří jsou na hřišti před událostí `index`. */
  kickoff(index: number): Scene {
    const roster = this.rosters[Math.min(index, this.rosters.length - 1)];
    const stage = new Stage(this.figures.length, roster, seededRng(this.input.matchId), this.referee);
    // Dva nejvýš postavení domácí stojí u míče.
    const pair = roster.home.filter((s) => s.role !== "GK").sort((a, b) => b.base.u - a.base.u).slice(0, 2);
    const fixed = new Map<number, Point>([[this.referee, { x: 4, z: 5 }], ...pair.map((s, n): [number, Point] => [s.figure, { x: n * 2.5 - 0.6, z: 0.7 }])]);
    stage.layout({ x: 0, z: 0 }, (slot, side) => uvToWorld(side, Math.min(slot.base.u * 0.8, 0.42), slot.base.v), fixed);
    stage.wait(PLAIN);
    return { clip: stage.finish(), start: 0, split: 0, end: PLAIN, focus: [], card: null, result: null, close: false };
  }

  /** Kam hráč patří v otevřené hře podle míče a držení. */
  private playSpot(possession: Side) {
    return (slot: Slot, side: Side, ball: Point): Point => {
      const s = attackSign(side);
      const bu = ball.z / (s * PITCH.depth) + 0.5, bv = ball.x / (s * (HALF_W - 2));
      if (slot.role === "GK") return uvToWorld(side, 0.03 + clamp((bu - 0.3) * 0.08, 0, 0.06), clamp(bv * 0.2, -0.15, 0.15));
      const shift = (bu - 0.5) * 0.5 + (possession === side ? 0.06 : -0.06);
      // Kousek dopředu či dozadu podle hráče, ať řada nestojí jako u stolního fotbalu.
      const stagger = 0.05 * (((slot.figure * 7919) % 13) / 13 - 0.5);
      return uvToWorld(side, clamp(slot.base.u + shift + stagger, 0.08, 0.92), clamp(slot.base.v * 0.85 + bv * 0.3, -1.05, 1.05));
    };
  }

  private open(stage: Stage, ball: Point, possession: Side, fixed: [number, Point][], keep: Zone[]) {
    const spot = this.playSpot(possession);
    stage.layout(ball, (slot, side) => spot(slot, side, ball), new Map(fixed), keep, spot);
  }

  private onPitch(st: Stage, e: ReplayEvent): number {
    const figure = this.figureOf(e);
    st.slot(figure);
    return figure;
  }

  private play(st: Stage, group: number[], windows: Map<number, Window>) {
    const events = this.events;
    const [head, ...rest] = group;
    const e = events[head];
    const side = sideOf(e.teamId);
    const find = (...types: string[]) => rest.find((i) => types.includes(events[i].type));
    const window = (i: number, start: number, w: Partial<Window> = {}) => windows.set(i, { start, split: start, end: st.t, focus: [], card: null, result: null, close: false, ...w });
    const finisher = find("goal", "chance");
    const result = finisher === undefined ? null : events[finisher].type === "goal" ? "goal" : chanceResult(events[finisher]);

    switch (e.type) {
      case "goal":
      case "chance": {
        const shotResult = e.type === "goal" ? "goal" : chanceResult(e);
        const shooter = this.onPitch(st, e);
        const assist = find("assist");
        const block = rest.find((i) => events[i].detail === "block");
        const split = this.openPlay(st, side, shooter, shotResult, e.source === "counter",
          assist === undefined ? null : this.onPitch(st, events[assist]), block === undefined ? null : this.onPitch(st, events[block]));
        return window(head, 0, { split, focus: [shooter], result: shotResult });
      }
      case "corner":
      case "freekick": {
        const taker = this.onPitch(st, e);
        const header = finisher === undefined ? null : this.onPitch(st, events[finisher]);
        const direct = e.detail === "direct";
        this.setPiece(st, side, taker, header, e.type === "corner" ? "corner" : direct ? "direct" : "cross");
        window(head, 0, { focus: [taker] });
        if (finisher === undefined || header === null || result === null) return;
        const start = st.t;
        const split = direct ? this.directKick(st, side, taker, result) : this.header(st, side, taker, header, result);
        return window(finisher, start, { split, focus: [header], result });
      }
      case "penalty": {
        const kicker = this.onPitch(st, e);
        this.penaltyFoul(st, side, kicker);
        window(head, 0, { focus: [kicker] });
        if (finisher === undefined || result === null) return;
        const start = st.t;
        const scored = result === "goal";
        const split = this.penaltyKick(st, side, kicker, result, scored ? ATTACK : 1.6, scored ? GOAL : DRAMA - 1.6, goalZ(side), false);
        // Zahozenou penaltu 2D záznam ukáže bez útočné fáze, celý kop se odehraje najednou.
        return window(finisher, start, { split: scored ? split : start, focus: [kicker], result });
      }
      case "foul": {
        const fouler = this.onPitch(st, e);
        this.foul(st, side, fouler);
        window(head, 0, { focus: [fouler], close: true });
        const card = find("card");
        if (card === undefined) return;
        const start = st.t;
        const carded = this.onPitch(st, events[card]);
        const color = events[card].detail === "red" ? "red" : "yellow";
        return window(card, start, { focus: [carded], close: true, card: { at: this.showCard(st, carded, color), color } });
      }
      case "card": {
        // Karta bez faulu (protesty): hráč stojí proti rozhodčímu.
        const carded = this.onPitch(st, e);
        const ball = uvToWorld(side, 0.3 + st.rng() * 0.4, (st.rng() - 0.5) * 1.2);
        const at = this.playSpot(other(side))(st.slot(carded), side, ball);
        this.open(st, ball, other(side), [[carded, at], [this.referee, { x: at.x + 2.6, z: at.z + 2 }]], [{ ...at, r: 3.5 }]);
        const color = e.detail === "red" ? "red" : "yellow";
        return window(head, 0, { focus: [carded], close: true, card: { at: this.showCard(st, carded, color), color } });
      }
      case "injury": {
        const injured = this.onPitch(st, e);
        this.injury(st, side, injured);
        window(head, 0, { focus: [injured], close: true });
        for (const i of rest.filter((n) => events[n].type === "substitution")) {
          const start = st.t;
          window(i, start, { focus: this.substitution(st, i), close: true });
        }
        return;
      }
      case "substitution":
        return window(head, 0, { focus: this.substitution(st, head), close: true });
    }
    if (e.detail?.startsWith("shootout:")) {
      // Rozstřel se kope na jednu bránu; kdo kopal, uložené není, jde některý hráč z pole.
      const kicker = st.pick(side, [], ["FWD", "MID", "DEF"]) ?? st.keeper(side);
      const shotResult = chanceResult(e);
      this.penaltyKick(st, side, kicker, shotResult, 1.5, PLAIN - 1.5, -HALF_L, true);
      return window(head, 0, { focus: [kicker], result: shotResult });
    }
    this.ambient(st, e);
    window(head, 0);
  }

  /** Hra v poli u události bez vlastní scény (držení míče, počasí, diváci…): tým z události si přihraje. */
  private ambient(st: Stage, e: ReplayEvent) {
    const side = sideOf(e.teamId), fwd = attackSign(side);
    const at = uvToWorld(side, e.detail === "possession" ? 0.6 + st.rng() * 0.12 : 0.42 + st.rng() * 0.16, (st.rng() * 2 - 1) * 0.7);
    // Míč má hráč z události, pokud je v poli; jinak (týmová událost, brankář, hráč mimo hřiště) spoluhráč.
    const named = this.ids.get(side + ":" + e.playerId);
    const holder = named !== undefined && st.outfield(side).includes(named) ? named : st.pick(side, [], ["MID", "FWD"]) ?? st.keeper(side);
    this.open(st, at, side, [[holder, at]], [{ x: at.x, z: at.z + fwd * 3, r: 3 }, { x: at.x + 1.5, z: at.z + fwd * 5.5, r: 2 }]);
    st.dribble(holder, { x: at.x, z: at.z + fwd * 3 }, 1.2);
    // Nejbližší soupeř jde míč napadnout.
    const presser = st.nearest(other(side), at);
    if (presser !== null) st.chase(presser, { x: at.x + 1.5, z: at.z + fwd * 5.5 }, 1.6);
    st.wait(1.2);
    const mates = st.outfield(side, [holder]);
    if (mates.length) {
      const mate = mates.reduce((best, f) => (dist(st.pos(f), st.ball) < dist(st.pos(best), st.ball) ? f : best));
      const from = st.pos(mate);
      st.go(mate, { x: from.x, z: from.z + fwd * 2 }, 1);
      st.pass(mate, 1);
      st.wait(1);
      st.dribble(mate, { x: from.x, z: from.z + fwd * 6 }, PLAIN - 2.2);
    }
    st.t = PLAIN;
  }

  /** Střela od nohy (nebo hlavy) střelce, u kterého míč právě je. Vrací čas, kdy míč doletí k bráně. */
  private shoot(st: Stage, side: Side, shooter: number, result: ShotResult, after: number, gz: number, blocker: number | null): number {
    const s = Math.sign(gz), sgn = st.rng() < 0.5 ? -1 : 1, fly = 0.5;
    const gk = st.keeper(other(side));
    const split = st.t + fly;
    const line = (x: number): Point => ({ x, z: gz });
    // Brankář stihne jen pár kroků, zbytek je skok.
    const reach = (x: number) => toward(st.pos(gk), { x, z: gz - s * 0.8 }, Math.min(dist(st.pos(gk), { x, z: gz - s * 0.8 }), 2.6));
    const keeperTo = (x: number) => st.go(gk, reach(x), 0.35, fly - 0.35);
    const dive = (x: number) => st.pose(gk, x > 0 ? "diveRight" : "diveLeft", 2.2, fly - 0.3);
    if (result === "goal") {
      const x = sgn * (1 + st.rng() * 2.2);
      keeperTo(-Math.sign(x) * 1.6);
      dive(-x);
      st.ballTo(line(x), fly, { h: 0.4 + st.rng() * 1.5, arc: 0.4 });
      st.wait(fly);
      st.ballTo({ x: x * 0.9, z: gz + s * 1.4 }, 0.25, { h: 0.2 });
      // Střelec běží slavit k rohovému praporku, nejbližší spoluhráči za ním.
      const corner = celebrationSpot(gz);
      const mates = st.outfield(side, [shooter]).sort((a, b) => dist(st.pos(a), corner) - dist(st.pos(b), corner)).slice(0, 3);
      st.go(shooter, corner, Math.max(2.5, dist(st.pos(shooter), corner) / 6), 0.3);
      st.pose(shooter, "celebrate", Infinity, 0.3);
      mates.forEach((m, n) => {
        // Do půlkruhu kolem střelce, ať nestojí na sobě.
        const angle = Math.atan2(-corner.x, -corner.z + gz * 0.5) + (n - 1) * 0.9;
        const to = { x: corner.x + Math.sin(angle) * 2.4, z: corner.z + Math.cos(angle) * 2.4 };
        st.go(m, to, Math.max(3, dist(st.pos(m), to) / 6), 0.6);
        st.pose(m, "celebrate", Infinity, 2.5);
      });
    } else if (result === "saved") {
      const side = sgn * (0.6 + st.rng() * 2);
      const at = reach(clamp(st.pos(gk).x + side, -GOAL_HALF_W + 0.4, GOAL_HALF_W - 0.4));
      keeperTo(at.x);
      if (Math.abs(side) > 1.2) dive(side);
      st.ballTo(at, fly, { h: 0.5 + st.rng() * 0.7, arc: 0.3 });
      st.wait(fly);
      st.ballTo(at, 0.4, { h: 0.3 });
    } else if (result === "post" || result === "bar") {
      const x = result === "post" ? sgn * GOAL_HALF_W : (st.rng() - 0.5) * 5;
      keeperTo(Math.sign(x) * 1.4);
      dive(x);
      st.ballTo(line(x), fly, { h: result === "bar" ? GOAL_H : 0.5 + st.rng() * 1.2, arc: 0.3 });
      st.wait(fly);
      // Tyč odrazí míč do zámezí vedle brány, břevno ho pošle za bránu.
      st.ballTo(result === "post" ? { x: sgn * (GOAL_HALF_W + 6), z: gz + s * 4 } : { x: x * 1.3, z: gz + s * 8 }, 1.1, { arc: result === "bar" ? 2.5 : 0.6 });
    } else if (result === "blocked") {
      // Obránce (v týmu bez hráčů v poli brankář) stojí v ráně; odražený míč skončí v autu.
      const by = blocker ?? gk;
      const at = toward(st.ball, line(0), clamp(dist(st.pos(by), st.ball) - 0.4, 2.4, 9));
      st.go(by, toward(at, line(0), 0.4), Math.max(0.5, dist(st.pos(by), at) / 7));
      st.wait(fly - 0.2);
      st.ballTo(at, 0.2, { h: 0.5 });
      st.wait(0.2);
      st.ballTo({ x: sgn * (HALF_W + 3), z: at.z - s * 3 }, 1.3, { arc: 1.8 });
    } else {
      // Vedle nebo nad: míč letí dál za brankovou čáru, ven ze hřiště.
      const x = result === "over" ? (st.rng() - 0.5) * 5 : sgn * (GOAL_HALF_W + 1 + st.rng() * 2.5);
      if (result === "wide") {
        keeperTo(Math.sign(x) * 1.6);
        dive(x);
      }
      st.ballTo(line(x), fly, { h: result === "over" ? 3.6 : 0.3 + st.rng(), arc: 0.4 });
      st.wait(fly);
      st.ballTo({ x: x * 1.2, z: gz + s * (result === "over" ? 10 : 7) }, 0.7, { arc: result === "over" ? 0.6 : 0 });
    }
    st.t = split + after;
    return split;
  }

  /** Akce ze hry: přihrávka do běhu a střela, u brejku sprint přes půl hřiště. */
  private openPlay(st: Stage, side: Side, shooter: number, result: ShotResult, counter: boolean, assister: number | null, blocker: number | null): number {
    const gz = goalZ(side), fwd = attackSign(side), wing = st.rng() < 0.5 ? -1 : 1;
    const shotSpot = inFront(gz, wing * st.rng() * 5, 11 + st.rng() * 4);
    const celebration = { ...celebrationSpot(gz), r: 3.6 };
    let marker: number | null;
    const helper = counter ? null : assister ?? st.pick(side, [shooter], ["MID", "FWD"]);
    if (helper === null) {
      const from = uvToWorld(side, 0.48, wing * 0.4);
      this.open(st, from, side, [[shooter, from]], [{ ...shotSpot, r: 4.5 }, celebration]);
      // Jeden obránce se stihne postavit do rány, další dva dobíhají zezadu.
      const chasers = st.outfield(other(side), blocker === null ? [] : [blocker]).sort((a, b) => dist(st.pos(a), from) - dist(st.pos(b), from));
      marker = blocker ?? chasers.shift() ?? null;
      if (marker !== null) st.chase(marker, toward(shotSpot, { x: 0, z: gz }, 3), 3);
      chasers.slice(0, 2).forEach((c, n) => st.chase(c, toward(shotSpot, from, 3 + n * 2), 3));
      st.dribble(shooter, toward(from, shotSpot, dist(from, shotSpot) / 2), 1.5);
      st.wait(1.5);
      st.dribble(shooter, shotSpot, 1.5);
      st.wait(1.5);
    } else {
      const start = inFront(gz, -wing * (7 + st.rng() * 5), 23 + st.rng() * 4), runFrom = inFront(gz, wing * 4, 21);
      this.open(st, start, side, [[helper, start], [shooter, runFrom]], [{ ...shotSpot, r: 4.5 }, { x: start.x, z: start.z + fwd * 5, r: 2.5 }, celebration]);
      marker = blocker ?? st.nearest(other(side), shotSpot);
      if (marker !== null) st.chase(marker, toward(shotSpot, { x: 0, z: gz }, 3), 2.6);
      st.dribble(helper, { x: start.x, z: start.z + fwd * 5 }, 1.4);
      st.go(shooter, toward(shotSpot, runFrom, 1.5), 2.6);
      st.wait(1.4);
      st.pass(shooter, 1.2);
      st.wait(1.2);
      st.dribble(shooter, shotSpot, 0.4);
      st.wait(0.4);
    }
    return this.shoot(st, side, shooter, result, result === "goal" ? GOAL : CHANCE, gz, marker);
  }

  /** Roh, centr ze strany nebo přímý kop: střih na rozestavení ve vápně. Bez zakončení centr odvrátí obrana. */
  private setPiece(st: Stage, side: Side, taker: number, header: number | null, kind: "corner" | "cross" | "direct") {
    const gz = goalZ(side), s = Math.sign(gz), sgn = st.rng() < 0.5 ? -1 : 1, def = other(side);
    const goal = { x: 0, z: gz };
    const ball = kind === "corner" ? { x: sgn * (HALF_W - 0.4), z: gz - s * 0.4 }
      : kind === "cross" ? inFront(gz, sgn * (13 + st.rng() * 4), 15 + st.rng() * 5)
      : inFront(gz, (st.rng() - 0.5) * 10, BOX_DEPTH + 3 + st.rng() * 3);
    const target = inFront(gz, -sgn * st.rng() * 3, 6 + st.rng() * 2.5);
    const fixed = new Map<number, Point>([[taker, kind === "direct" ? toward(ball, goal, -2.6) : toward(ball, target, -1.5)]]);
    // Zakončující si nabíhá zpoza penalty; do vápna jdou útočníci a střední obránci.
    if (header !== null && header !== taker) fixed.set(header, toward(target, { x: 0, z: 0 }, 4.5));
    /** Místa ve vápně: hráči na nich začnou a rozestoupí se. */
    const box = new Map<number, Point>();
    const order: Record<Role, number> = { FWD: 0, DEF: 1, MID: 2, GK: 3 };
    const boxSpots = [[-2.5, 7], [3, 8.5], [0.5, 11.5], [-5.5, 10.5]].map(([across, out]) => inFront(gz, across, out));
    st.slots(side, ["FWD", "DEF", "MID"]).filter((x) => !fixed.has(x.figure))
      .sort((a, b) => order[a.role] - order[b.role] || Math.abs(a.base.v) - Math.abs(b.base.v))
      .slice(0, kind === "direct" ? 3 : 4).forEach((x, n) => box.set(x.figure, boxSpots[n]));
    // Každého ve vápně si bere obránce ze strany od brány; u přímého kopu stojí jeden v ráně.
    const markers = st.outfield(def).sort((a, b) => order[st.slot(b).role] - order[st.slot(a).role]);
    // Strážce zakončujícího stojí vedle něj, ne v jeho náběhu.
    [...fixed, ...box].filter(([f]) => f !== taker).forEach(([f, p], n) => {
      if (markers[n] !== undefined) box.set(markers[n], f === header ? { x: p.x - Math.sign(p.x || 1) * 2, z: p.z } : toward(p, goal, 1.6));
    });
    const inTheWay = markers.at(-1);
    if (kind === "direct" && inTheWay !== undefined) fixed.set(inTheWay, toward(ball, goal, 8));
    fixed.set(st.keeper(def), { x: clamp(ball.x * 0.08, -1.5, 1.5), z: gz - s * 0.8 });
    fixed.set(this.referee, inFront(gz, -sgn * 9, BOX_DEPTH - 2));
    // Ostatní: útočící za vápnem a obránci vzadu na půlce, bránící před brankou a útočník nahoře.
    st.layout(ball, (slot, sd) => box.get(slot.figure) ?? (slot.role === "GK" ? uvToWorld(sd, 0.1, 0)
      : sd === side ? inFront(gz, slot.base.v * 12, slot.role === "DEF" ? 34 : BOX_DEPTH + 4)
      : inFront(gz, slot.base.v * 7, slot.role === "FWD" ? 30 : 4 + slot.base.u * 14)), fixed,
      [{ ...target, r: 2.6 }, { ...celebrationSpot(gz), r: 3.6 }]);
    st.pose(taker, "armUp", 1, 1);
    if (header === null && kind !== "direct") {
      // Centr bez zakončení: obránce ho ve výskoku odhlavičkuje do zámezí.
      st.wait(1.4);
      st.go(taker, toward(ball, target, -0.5), 0.3);
      st.wait(0.4);
      const defender = st.nearest(def, target) ?? st.keeper(def);
      st.go(defender, target, Math.max(1, dist(st.pos(defender), target) / 6));
      st.ballTo(target, 1.1, { h: 2.1, arc: 3.5 });
      st.jump(defender, 1.1);
      st.wait(1.1);
      st.ballTo({ x: -sgn * (HALF_W + 3), z: gz - s * 22 }, 1.4, { arc: 4 });
    }
    st.t = PLAIN;
  }

  /** Centr ze standardky na hlavu zakončujícího. */
  private header(st: Stage, side: Side, taker: number, header: number, result: ShotResult): number {
    const gz = goalZ(side);
    const target = toward(st.pos(header), { x: 0, z: 0 }, -4.5);
    const marker = st.nearest(other(side), st.pos(header));
    st.wait(ATTACK - 2.4);
    st.go(taker, toward(st.ball, target, -0.5), 0.4);
    st.wait(0.5);
    st.ballTo(target, 1.4, { h: 2.2, arc: 3.5 });
    st.go(header, target, 1.1, 0.3);
    if (marker !== null) {
      st.chase(marker, toward(target, { x: 0, z: gz }, 1.2), 1.1, 0.3);
      st.jump(marker, 1.45);
    }
    st.jump(header, 1.4);
    st.wait(1.4);
    return this.shoot(st, side, header, result, result === "goal" ? GOAL : CHANCE, gz, marker);
  }

  private directKick(st: Stage, side: Side, kicker: number, result: ShotResult): number {
    const goal = { x: 0, z: goalZ(side) };
    // „Do zdi“: ránu zblokuje obránce, který stojí v ráně.
    const inTheWay = st.nearest(other(side), toward(st.ball, goal, 8));
    st.pose(this.referee, "armUp", 0.8, 1.2);
    st.wait(ATTACK - 1.2);
    st.go(kicker, toward(st.ball, goal, -0.5), 0.6);
    st.wait(0.7);
    return this.shoot(st, side, kicker, result, result === "goal" ? GOAL : CHANCE, goal.z, inTheWay);
  }

  /** Penalta začíná faulem ve vápně: útočník padá, rozhodčí ukazuje na značku. */
  private penaltyFoul(st: Stage, side: Side, kicker: number) {
    const gz = goalZ(side), wing = st.rng() < 0.5 ? -1 : 1;
    const from = inFront(gz, wing * 6, BOX_DEPTH + 3), to = inFront(gz, wing * 3, 11);
    this.open(st, from, side, [[kicker, from], [this.referee, inFront(gz, -wing * 6, BOX_DEPTH + 6)]], [{ ...to, r: 4.5 }]);
    const fouler = st.nearest(other(side), to) ?? st.keeper(other(side));
    st.go(fouler, { x: to.x + wing * 0.8, z: to.z }, Math.max(1.5, dist(st.pos(fouler), to) / 7));
    st.dribble(kicker, to, 1.5);
    st.go(this.referee, toward(to, st.pos(this.referee), 4), 2.2);
    st.wait(1.5);
    st.pose(kicker, "down", 3.5);
    st.ballTo(toward(st.ball, { x: 0, z: gz }, 3), 0.6);
    st.pose(this.referee, "armUp", 2.5, 0.7);
    st.t = PENALTY;
  }

  /** Penalta (i v rozstřelu): střih, míč na značce, rozběh a kop v čase `lead`. */
  private penaltyKick(st: Stage, side: Side, kicker: number, result: ShotResult, lead: number, after: number, gz: number, shootout: boolean): number {
    const s = Math.sign(gz);
    const spot = inFront(gz, 0, PENALTY_SPOT);
    const fixed = new Map<number, Point>([[kicker, inFront(gz, 1.2, PENALTY_SPOT + 3)], [st.keeper(other(side)), { x: 0, z: gz - s * 0.3 }], [this.referee, inFront(gz, 8, PENALTY_SPOT + 2)]]);
    let n = 0;
    // Penalta ze hry: všichni v oblouku za vápnem. Rozstřel: ostatní čekají ve středovém kruhu.
    st.layout(spot, () => {
      const row = Math.floor(n / 10), across = (n++ % 10) - 4.5;
      if (shootout) return { x: across * 2.2, z: row * 2.4 - 1.2 };
      const radius = 10 + row * 2.2;
      return inFront(gz, Math.sin(across * 0.16) * radius, Math.max(BOX_DEPTH + 1 + row * 2, PENALTY_SPOT + Math.cos(across * 0.16) * radius));
    }, fixed, [{ ...celebrationSpot(gz), r: 3.6 }]);
    st.wait(lead - 1.2);
    st.go(kicker, toward(spot, { x: 0, z: gz }, -0.5), 0.7);
    st.wait(0.7);
    return this.shoot(st, side, kicker, result, after, gz, null);
  }

  private foul(st: Stage, side: Side, fouler: number) {
    const victimSide = other(side), fwd = attackSign(victimSide), wing = st.rng() < 0.5 ? -1 : 1;
    const at = uvToWorld(victimSide, 0.35 + st.rng() * 0.35, (st.rng() * 2 - 1) * 0.7);
    const contact = { x: at.x, z: at.z + fwd * 4 };
    const victim = st.pick(victimSide, [], ["MID", "FWD"]) ?? st.keeper(victimSide);
    this.open(st, at, victimSide, [[victim, at], [fouler, { x: contact.x + wing * 4, z: contact.z + fwd * 2.5 }], [this.referee, { x: at.x + wing * 7, z: at.z - fwd * 4 }]], [{ ...contact, r: 5 }, { x: contact.x + wing * 4, z: contact.z - fwd * 2.4, r: 2.4 }]);
    st.dribble(victim, contact, 1.2);
    st.go(fouler, { x: contact.x + wing * 0.8, z: contact.z + fwd * 0.2 }, 1.2);
    // Rozhodčí dobíhá ze strany faulujícího, ať ke kartě nejde přes ležícího.
    st.go(this.referee, { x: contact.x + wing * 4, z: contact.z - fwd * 2.4 }, 1.6, 0.2);
    st.wait(1.2);
    st.pose(victim, "down");
    st.ballTo({ x: contact.x - wing * 2.5, z: contact.z + fwd * 2.5 }, 0.6);
    st.go(fouler, { x: contact.x + wing * 2.6, z: contact.z + fwd * 0.6 }, 0.8, 0.3);
    st.pose(this.referee, "armUp", 1.2, 0.6);
    st.t = PLAIN;
  }

  /** Rozhodčí dojde k hráči a zvedne kartu; vyloučený odchází ke střídačkám. Vrací čas, kdy je karta nahoře. */
  private showCard(st: Stage, carded: number, color: CardColor): number {
    const end = st.t + DRAMA;
    const at = toward(st.pos(carded), st.pos(this.referee), 1.7);
    const walk = Math.max(0.9, dist(st.pos(this.referee), at) / 5);
    st.go(this.referee, at, walk);
    st.wait(walk);
    const shown = st.t;
    st.pose(this.referee, "armUp");
    if (color === "red") {
      const from = st.pos(carded), exit = { x: BENCH_X - 2, z: from.z * 0.3 };
      const seconds = end - shown - 0.8;
      st.go(carded, toward(from, exit, Math.min(dist(from, exit), 2.4 * seconds)), seconds, 0.8);
    }
    st.t = end;
    return shown;
  }

  private injury(st: Stage, side: Side, injured: number) {
    const ball = uvToWorld(side, 0.3 + st.rng() * 0.4, (st.rng() * 2 - 1) * 0.5);
    const at = this.playSpot(other(side))(st.slot(injured), side, ball);
    const down = { x: at.x + 1.2, z: at.z + 0.6 };
    this.open(st, ball, other(side), [[injured, at], [this.referee, { x: at.x - 6, z: at.z - 5 }]], [{ ...down, r: 3.2 }]);
    st.go(injured, down, 0.6);
    st.pose(injured, "down", Infinity, 0.6);
    st.outfield(side, [injured]).sort((a, b) => dist(st.pos(a), at) - dist(st.pos(b), at)).slice(0, 2)
      .forEach((m, n) => st.go(m, toward(down, st.pos(m), 1.9 + n * 0.3), Math.max(1.6, dist(st.pos(m), at) / 5), 0.8));
    st.go(this.referee, { x: at.x - 1.4, z: at.z - 1.6 }, 1.5, 0.7);
    st.pose(this.referee, "armUp", 1.2, 1);
    st.t = DRAMA;
  }

  /** Střídání: střih k postranní čáře u střídaček, hráči si plácnou a vymění se. Vrací [přicházející, odcházející]. */
  private substitution(st: Stage, index: number): number[] {
    const { incoming, outgoing } = this.swaps.get(index)!;
    const end = st.t + PLAIN;
    const z = (st.rng() - 0.5) * 6;
    const ball = { x: 3, z: z + 9 };
    const spot = this.playSpot("home");
    st.recast(this.rosters[index]);
    st.layout(ball, (slot, side) => spot(slot, side, ball), new Map([[outgoing, { x: BENCH_X + 7, z: z + 1 }], [incoming, { x: BENCH_X - 1.6, z }], [this.referee, { x: BENCH_X + 4, z: z - 4 }]]), [{ x: BENCH_X + 4, z: z + 1, r: 5 }]);
    st.go(outgoing, { x: BENCH_X + 0.5, z }, 1.9);
    st.wait(1.6);
    st.pose(outgoing, "armUp", 0.6);
    st.pose(incoming, "armUp", 0.6);
    st.wait(0.4);
    st.go(incoming, { x: BENCH_X + 8, z: z + 1.5 }, 1.5);
    st.go(outgoing, { x: BENCH_X - 2.5, z: z + 2 }, 1.2);
    st.t = end;
    return [incoming, outgoing];
  }
}
