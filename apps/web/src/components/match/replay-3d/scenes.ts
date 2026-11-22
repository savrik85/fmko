// 3D záznam je sestřih: každá důležitá událost zápasu má vlastní krátkou scénu, která začíná střihem na rozestavení
// a končí, když ji záznam vystřídá další akcí. Engine neukládá souřadnice, scény se proto skládají
// z uložených událostí; náhoda z id zápasu vybírá jen kosmetiku, takže přehrání vypadá vždy stejně.
import { PITCH } from "../../stadium/stadium-3d/constants";

export const HALF_W = PITCH.width / 2;
export const HALF_L = PITCH.depth / 2;
const GOAL_HALF_W = 3.66, GOAL_H = 2.44, PENALTY_SPOT = PITCH.penaltySpot, BOX_DEPTH = PITCH.penaltyArea.depth;
/** Střídačky stojí u západní lajny. */
const BENCH_X = -HALF_W;
const MAX_SPEED = 9;
/** Klus, kterým hráči bez úkolu drží tvar týmu (m/s). */
const JOG = 4.5;
/** O tolik dřív před střihem figury a míč ještě stojí na starém místě. */
const CUT = 1e-3;
/** Výška výskoku na hlavičku. */
const HOP = 0.7;
/**
 * Délky scén (s). Rozehrání (`SETUP`) a útok (`ATTACK`) trvají přesně jako jejich krok záznamu (SCENE_MS
 * v zaznam/page.tsx), protože na ně další část téže akce navazuje bez střihu. Ostatní scény jsou o kus delší než
 * jejich krok, ať se v nich při střihu na další akci ještě něco děje.
 */
const SETUP = 2, ATTACK = 3.5, GOAL = 6, CHANCE = 3, DRAMA = 4, PENALTY = 7, KICKOFF = 7.5;
/** Jak dlouho drží rozhodčí kartu nad hlavou. */
const CARD_UP = 1.4;

export type Side = "home" | "away";
const SIDES = ["home", "away"] as const;
type Role = "GK" | "DEF" | "MID" | "FWD";
export type Pose = "down" | "diveLeft" | "diveRight" | "celebrate" | "armUp" | "slide" | "shake";
export type ShotResult = "goal" | "saved" | "post" | "bar" | "wide" | "over" | "blocked";
type CardColor = "yellow" | "red";

/** `avatar` = obličej hráče (facesjs) pro titulek u gólu, karty, zranění a střídání. */
export interface ReplayPlayer { id: string; name: string; position: string; skinColor?: string; hairColor?: string | null; height?: number; avatar?: Record<string, unknown> }
export interface ReplayKit { shirt: string; shorts: string; socks: string }
/** Trenér klubu (jeho manažer). `motivation` 1–100 říká, jak moc zápas u lajny prožívá. */
export interface ReplayCoach {
  name: string; motivation: number; skinColor?: string; hairColor?: string | null; avatar?: Record<string, unknown>;
  /** Bilance týmu v soutěži před zápasem; null = první zápas v soutěži. */
  record: { played: number; won: number } | null;
}
/** Před výkopem (sekundy): představení jednoho trenéra, po obou podání rukou. Stejné délky má krok záznamu (SCENE_MS). */
const COACH_INTRO = 4, HANDSHAKE = 2.2;
/** `coach` = null: klub trenéra nemá a u lajny nikdo nestojí. */
export interface ReplayTeam { name: string; kit: ReplayKit; starters: ReplayPlayer[]; subs: ReplayPlayer[]; coach: ReplayCoach | null }
/** Událost zápasu, jak ji ukládá engine (detail zápasu z API). */
export interface ReplayEvent { minute: number; type: string; playerId: number; playerName: string; teamId: number; description: string; detail?: string; source?: string }
/** `winner` = kdo zápas vyhrál (i na penalty), null = remíza. */
export interface ReplayInput { matchId: string; events: ReplayEvent[]; home: ReplayTeam; away: ReplayTeam; winner: Side | null }
export interface Figure { team: Side | "referee"; player: ReplayPlayer; coach?: true }
/** Kdo je ve scéně kromě hráčů: rozhodčí a trenéři. `fire` = jak moc trenér zápas prožívá (0 kliďas, 1 sopka). */
interface Staff { referee: number; coaches: Partial<Record<Side, { figure: number; fire: number }>> }
type Mood = "joy" | "upset" | "anger" | "shout";

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
  /** Gól: úsek klipu se zakončením, který se po oslavě zpomaleně zopakuje. */
  replay: { from: number; to: number } | null;
}
type Window = Omit<Scene, "clip">;

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
const lerp = (a: number, b: number, s: number) => a + (b - a) * s;
const dist = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.z - b.z);
const other = (side: Side): Side => (side === "home" ? "away" : "home");
const sideOf = (teamId: number): Side => (teamId === 1 ? "home" : "away");
/** Tým bez brankáře (v sestavě nebo po vyloučení) má v bráně prvního hráče; engine tam taky někoho postaví. */
const withKeeper = <T extends { role: Role }>(slots: T[]): T[] =>
  slots.length && !slots.some((x) => x.role === "GK") ? [{ ...slots[0], role: "GK" }, ...slots.slice(1)] : slots;
/** Do brány jde `figure`; kdo ji do té doby zaskakoval, vrací se na své místo. */
const soleKeeper = <T extends { figure: number; role: Role; base: { role: Role } }>(slots: T[], figure: number): T[] =>
  slots.map((s) => (s.figure === figure ? { ...s, role: "GK" } : s.role === "GK" && s.base.role !== "GK" ? { ...s, role: s.base.role } : s));
const toRole = (position: string): Role => (position === "GK" || position === "DEF" || position === "FWD" ? position : "MID");
/**
 * Domácí útočí k záporné z: z hlavní tribuny doprava, stejně jako ve 2D záznamu. Scény se tak staví vždy;
 * po přestávce si týmy vymění strany a scéna se zrcadlově otočí (Stage.finish).
 */
const attackSign = (side: Side) => (side === "home" ? -1 : 1);
const goalZ = (side: Side) => attackSign(side) * HALF_L;
/** Bod `gap` metrů od `from` směrem k `to` (záporné = od něj). */
const toward = (from: Point, to: Point, gap: number): Point => {
  const d = dist(from, to) || 1;
  return { x: from.x + ((to.x - from.x) / d) * gap, z: from.z + ((to.z - from.z) / d) * gap };
};
/** u = 0 vlastní branka, 1 soupeřova; v = -1..1 napříč hřištěm. */
const uvToWorld = (side: Side, u: number, v: number): Point => ({ x: attackSign(side) * v * (HALF_W - 2), z: attackSign(side) * (u - 0.5) * PITCH.depth });
/** Kam běží střelec slavit: vedle brány na straně hlavní tribuny, před kameru (ale ne až k lajně, tam kamera nevidí). */
const celebrationSpot = (gz: number): Point => ({ x: HALF_W - 9, z: gz - Math.sign(gz) * 5 });
/** Místo scény posunuté od bližší lajny: pruh pod hlavní tribunou kamera u zastřešené tribuny nevidí. */
const inView = (p: Point): Point => ({ x: Math.min(p.x, 9), z: p.z });
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

/** Pro každou událost první událost její akce. */
function actionHeads(events: ReplayEvent[]): number[] {
  const heads: number[] = [];
  events.forEach((e, i) => {
    const head = heads[i - 1];
    const chained = i > 0 && (follows(events[head], e) || (head !== i - 1 && follows(events[i - 1], e)));
    heads.push(chained ? head : i);
  });
  return heads;
}

/**
 * Které události mají ve 3D vlastní scénu. Jen důležité akce: šance a góly (i s rohem nebo standardkou, která
 * k nim vedla), penalty, karty (i s faulem před nimi), zranění, střídání a rozstřel. Držení míče, počasí,
 * fauly bez karty a rohy bez zakončení scénu nemají; 3D záznam je přeskakuje a drží konec poslední akce.
 */
export function scenedEvents(events: ReplayEvent[]): boolean[] {
  const heads = actionHeads(events);
  const has = (i: number, ...types: string[]) => events.some((e, j) => heads[j] === heads[i] && types.includes(e.type));
  return events.map((e, i) => {
    switch (e.type) {
      case "goal": case "chance": case "penalty": case "card": case "injury": case "substitution": return true;
      case "corner": case "freekick": return has(i, "goal", "chance");
      case "foul": return has(i, "card");
      default: return !!e.detail?.startsWith("shootout:");
    }
  });
}

/** Kde začínají akce, které mají scénu (roh před gólem, faul před kartou…): sem skáče „předchozí/další akce“. */
export function actionStarts(events: ReplayEvent[]): number[] {
  const heads = actionHeads(events), scened = scenedEvents(events);
  return events.flatMap((_, i) => (scened[i] && !scened.slice(heads[i], i).some(Boolean) ? [i] : []));
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
    for (const side of SIDES) {
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
 * Čas v klipu `elapsed` sekund po začátku záběru: útočná fáze běží po `split`, zbytek scény od něj.
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
  /** Kdo od posledního střihu dostal místo nebo pohyb ze scénáře; ostatní drží tvar týmu podle míče. */
  private scripted = new Set<number>();
  private shape: ((slot: Slot, side: Side, ball: Point) => Point) | null = null;
  /** Čas posledního střihu. */
  private from = 0;
  private keep: Zone[] = [];

  /** `mirror` = druhý poločas: týmy mají vyměněné strany. */
  constructor(figures: number, private roster: Roster, readonly rng: () => number, private readonly staff: Staff, private readonly mirror: boolean) {
    const lists = <T>() => Array.from({ length: figures }, (): T[] => []);
    this.clip = { tracks: lists(), poses: lists(), hops: lists(), until: Array.from({ length: figures }, () => Infinity), ball: [], cuts: [], keepers: new Set() };
  }

  /**
   * Střih: všichni stojí rovnou na místech. `fixed` jsou místa ze scénáře (i pro rozhodčího a střídajícího),
   * ostatní dostanou místo z `spotOf`, rozestoupí se a uhnou ze zón `keep`, kde se scéna odehraje.
   * Se `shape` pak hráči bez úkolu drží tvar týmu podle toho, kde je míč.
   */
  layout(ball: Point, spotOf: (slot: Slot, side: Side) => Point, fixed: Map<number, Point>, keep: Zone[] = [], shape: Stage["shape"] = null) {
    this.follow();
    const spots = new Map(fixed);
    const free: number[] = [];
    for (const side of SIDES) {
      for (const slot of this.roster[side]) {
        if (spots.has(slot.figure)) continue;
        spots.set(slot.figure, spotOf(slot, side));
        free.push(slot.figure);
      }
    }
    const referee = spots.get(this.staff.referee) ?? { x: ball.x + 5, z: ball.z + (ball.z > 0 ? -7 : 7) };
    spots.set(this.staff.referee, { x: clamp(referee.x, -HALF_W + 2, HALF_W - 2), z: clamp(referee.z, -HALF_L + 3, HALF_L - 3) });
    for (const side of SIDES) {
      const coach = this.staff.coaches[side];
      if (coach) spots.set(coach.figure, this.bench(side));
    }
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
    for (const side of SIDES) this.clip.keepers.add(this.keeper(side));
    this.clip.tracks.forEach((keys, i) => {
      const p = spots.get(i);
      if (keys.length) {
        // Do střihu figura dojde, kam stihne; pohyb naplánovaný za střih se zahodí.
        const before = this.pos(i, this.t - CUT);
        keys.splice(keys.findLastIndex((k) => k.t < this.t - CUT) + 1, Infinity, { t: this.t - CUT, ...before });
      }
      if (p) keys.push({ t: this.t, x: p.x, z: p.z });
      else if (keys.length) this.clip.until[i] = Math.min(this.clip.until[i], this.t);
      this.clip.poses[i] = this.clip.poses[i].map((s) => ({ ...s, to: Math.min(s.to, this.t) }));
    });
    const flight = this.clip.ball;
    if (flight.length) {
      const last = flight[flight.length - 1];
      if (last.t > this.t - CUT) throw new Error(`Míč má v čase ${last.t} pohyb za střihem v ${this.t}`);
      flight.push({ ...last, t: this.t - CUT, arc: 0 });
    }
    flight.push({ t: this.t, ...ball, h: 0, arc: 0 });
    this.scripted = new Set(fixed.keys());
    this.shape = shape;
    this.keep = keep;
    this.from = this.t;
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
  /**
   * Od teď se hraje: tvar týmu drží všichni, i hráči, kteří měli úkol ze scénáře (kromě `busy`). Výkop: do hvizdu
   * se stojí. Po zahozené šanci nebo kartě: scéna nekončí stojícím obrazem, hra běží dál.
   */
  release(shape: NonNullable<Stage["shape"]>, busy: number[] = []) {
    this.follow();
    this.shape = shape;
    this.keep = [];
    this.from = this.t;
    this.scripted = new Set(busy);
  }
  /** Místo trenéra před střídačkou jeho týmu (domácí ji mají na záporné z). Střídačky si týmy o přestávce nemění. */
  bench(side: Side): Point {
    return { x: BENCH_X - 0.7, z: (side === "home" ? -7.5 : 7.5) * (this.mirror ? -1 : 1) };
  }

  /** Trenér týmu `side` prožívá, co se děje, podle své povahy: kliďas stojí, sopka skáče, mává a padá na kolena. */
  coach(side: Side, mood: Mood, delay = 0) {
    const coach = this.staff.coaches[side];
    if (!coach) return;
    const { figure, fire } = coach;
    if (mood === "joy") {
      this.pose(figure, "celebrate", 2 + 3 * fire, delay);
      if (fire > 0.6) [0.4, 1.2, 2].forEach((at) => this.jump(figure, delay + at));
    } else if (mood === "upset") {
      if (fire > 0.75) this.pose(figure, "slide", 2.5, delay);
      else if (fire > 0.4) this.pose(figure, "armUp", 0.9, delay);
    } else if (fire > 0.35) {
      // Protest nebo pokyny: krok k lajně a ruka nahoře.
      this.go(figure, { x: BENCH_X - 0.1, z: this.pos(figure).z }, 0.5, delay);
      this.pose(figure, "armUp", mood === "anger" ? 1 + 2 * fire : 1, delay);
    }
  }

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

  /**
   * Hráči bez úkolu drží od posledního střihu tvar týmu: po půl vteřinách dobíhají klusem tam, kam podle míče
   * patří (obrana ustupuje před útokem, tým se posouvá za míčem). Do zón, kde se scéna odehrává, nevstupují
   * a nikomu nevběhnou do těla, ani tam, kde hráč ze scénáře teprve skončí.
   */
  private follow() {
    // Výbušný trenér, který zrovna nic neprožívá, přechází před střídačkou.
    for (const side of SIDES) {
      const coach = this.staff.coaches[side];
      if (!coach || coach.fire < 0.5 || this.scripted.has(coach.figure)) continue;
      const base = this.bench(side);
      for (let t = this.from + 0.5, n = 0; t + 2 < this.t; t += 3.5, n++) {
        this.clip.tracks[coach.figure].push({ t, ...this.pos(coach.figure) }, { t: t + 2, x: base.x, z: base.z + (n % 2 ? -1.5 : 1.5) });
      }
    }
    const shape = this.shape;
    if (!shape) return;
    const shown = this.clip.tracks.flatMap((keys, i) => (keys.length && this.clip.until[i] === Infinity ? [i] : []));
    const idle = SIDES.flatMap((side) => this.roster[side].filter((slot) => !this.scripted.has(slot.figure)).map((slot) => ({ slot, side })));
    const ends = [...this.scripted].map((j) => this.pos(j));
    const ball = this.clip.ball;
    // Poslední krok končí těsně před koncem úseku, ať se nepotká se střihem.
    for (let t = this.from + 0.5; t < this.t - 0.05; t += 0.5) {
      const n = ball.findIndex((k) => k.t > t);
      const k1 = ball[n < 0 ? ball.length - 1 : n], k0 = n > 0 ? ball[n - 1] : k1;
      const s = k1.t > k0.t ? clamp((t - k0.t) / (k1.t - k0.t), 0, 1) : 1;
      const at = { x: lerp(k0.x, k1.x, s), z: lerp(k0.z, k1.z, s) };
      for (const { slot, side } of idle) {
        // Kdo ještě dobíhá pohyb ze scénáře, přidá se až po něm.
        if (this.clip.tracks[slot.figure].at(-1)!.t > t - 0.5 + 1e-6) continue;
        const from = this.pos(slot.figure), to = shape(slot, side, at);
        // Kvůli metru se nikdo nehýbe (jinak by se celý tým pořád vrtěl).
        if (dist(from, to) < 1) continue;
        const step = toward(from, to, Math.min(dist(from, to), JOG * 0.5));
        const free = this.keep.every((zone) => dist(step, zone) > zone.r) && ends.every((q) => dist(step, q) > 1.8)
          && shown.every((j) => j === slot.figure || dist(step, this.pos(j, t)) > 1.8);
        if (free) this.clip.tracks[slot.figure].push({ t: t - 0.5, ...from }, { t, ...step });
      }
    }
  }

  finish(): Clip {
    this.follow();
    if (this.mirror) for (const keys of [...this.clip.tracks, this.clip.ball]) for (const key of keys) key.z = -key.z;
    return this.clip;
  }
}

export class Replay {
  readonly figures: Figure[] = [];
  readonly referee: number;
  private readonly events: ReplayEvent[];
  private readonly staff: Staff;
  /** První událost druhého poločasu (-1, když záznam druhý poločas nemá); od ní mají týmy vyměněné strany. */
  private readonly secondHalf: number;
  /** Engine id hráče („home:7“) → figura. */
  private readonly ids = new Map<string, number>();
  /** Kdo je na hřišti před každou událostí a kdo po té poslední. */
  private readonly rosters: Roster[] = [];
  private readonly finalRoster: Roster;
  private readonly swaps = new Map<number, { incoming: number; outgoing: number }>();
  private readonly heads: number[];
  private readonly scened: boolean[];
  private readonly clips = new Map<number, { clip: Clip; windows: Map<number, Window> }>();
  private readonly scenes = new Map<number, Scene>();
  private introScene: Scene | null = null;
  private readonly kickoffs = new Map<number, Scene>();
  private closing: Scene | null = null;

  constructor(private readonly input: ReplayInput) {
    this.events = input.events;
    this.heads = actionHeads(input.events);
    this.scened = scenedEvents(input.events);
    this.secondHalf = input.events.findIndex((e) => e.minute > 45);
    let roster: Roster = { home: [], away: [] };
    for (const side of SIDES) {
      const bases = slotBases(input[side].starters);
      input[side].starters.forEach((player, n) => {
        const figure = this.figures.push({ team: side, player }) - 1;
        // Engine čísluje domácí od 1 a hosty od 101 v pořadí sestavy.
        this.ids.set(`${side}:${n + (side === "home" ? 1 : 101)}`, figure);
        roster[side].push({ figure, base: bases[n], role: bases[n].role });
      });
      roster[side] = withKeeper(roster[side]);
    }
    this.referee = this.figures.push({ team: "referee", player: { id: "referee", name: "Rozhodčí", position: "MID", skinColor: "#E0B48C", hairColor: "#3B2F2F" } }) - 1;
    this.staff = { referee: this.referee, coaches: {} };
    for (const side of SIDES) {
      const coach = input[side].coach;
      if (!coach) continue;
      const figure = this.figures.push({ team: side, coach: true, player: { id: "coach", position: "MID", ...coach } }) - 1;
      // Motivátor zápas prožívá: s motivací 20 a míň je kliďas, od 80 sopka.
      this.staff.coaches[side] = { figure, fire: clamp((coach.motivation - 20) / 60, 0, 1) };
    }

    this.events.forEach((e, i) => {
      this.rosters.push(roster);
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
        const swapped = roster[side].map((s) => (s === out ? { figure, base: out.base, role } : s));
        roster = { ...roster, [side]: role === "GK" ? soleKeeper(swapped, figure) : swapped };
      } else if (e.type === "card" && e.detail === "red") {
        const figure = this.figureOf(e);
        roster = { ...roster, [side]: withKeeper(roster[side].filter((s) => s.figure !== figure)) };
      } else if (e.detail === "emergency_gk") {
        const figure = this.figureOf(e);
        roster = { ...roster, [side]: soleKeeper(roster[side], figure) };
      }
    });
    this.finalRoster = roster;
  }

  private stage(roster: Roster, seed: string | number, mirror: boolean): Stage {
    return new Stage(this.figures.length, roster, seededRng(`${this.input.matchId}:${seed}`), this.staff, mirror);
  }

  private figureOf(e: ReplayEvent): number {
    const figure = this.ids.get(`${sideOf(e.teamId)}:${e.playerId}`);
    if (figure === undefined) throw new Error(`Událost ${e.type} v ${e.minute}. minutě: hráč ${e.playerName} (${e.playerId}) není v sestavě`);
    return figure;
  }

  /** Scéna události `index`. Pro stejnou událost vrací stejný objekt: podle něj přehrávání pozná, že má hrát dál totéž. */
  scene(index: number): Scene {
    const cached = this.scenes.get(index);
    if (cached) return cached;
    const head = this.heads[index];
    let built = this.clips.get(head);
    if (!built) {
      const group = this.heads.flatMap((h, i) => (h === head ? [i] : []));
      const stage = this.stage(this.rosters[head], head, this.secondHalf >= 0 && head >= this.secondHalf);
      const windows = new Map<number, Window>();
      this.play(stage, group, windows);
      built = { clip: stage.finish(), windows };
      this.clips.set(head, built);
    }
    const window = built.windows.get(index);
    if (!window) throw new Error(`Událost ${index} (${this.events[index].type}) scénu nemá`);
    const scene = { clip: built.clip, ...window };
    this.scenes.set(index, scene);
    return scene;
  }

  /**
   * Co je v obraze před událostí `next`: poslední akce téhož poločasu, a když v něm ještě žádná nebyla, výkop.
   * Události bez vlastní scény (držení míče, počasí…) tak obraz nemění, poslední akce v něm běží dál.
   */
  before(next: number): Scene {
    const kickoff = this.secondHalf >= 0 && next >= this.secondHalf ? this.secondHalf : 0;
    // Záporný začátek by lastIndexOf počítal od konce pole: před první událostí by vrátil poslední akci zápasu.
    const shown = next > 0 ? this.scened.lastIndexOf(true, next - 1) : -1;
    return shown < kickoff ? this.kickoff(kickoff) : this.scene(shown);
  }

  /**
   * Před výkopem: trenéři jdou od střídaček na středový bod, záznam je cestou jednoho po druhém představí,
   * a podají si ruce. Týmy stojí na svých polovinách.
   */
  intro(): Scene {
    if (this.introScene) return this.introScene;
    const st = this.stage(this.rosters[0] ?? this.finalRoster, "intro", false);
    const walk = 2 * COACH_INTRO;
    const coaches = SIDES.flatMap((side) => {
      const coach = this.staff.coaches[side];
      return coach ? [{ figure: coach.figure, from: st.bench(side), to: { x: 0, z: side === "home" ? -0.7 : 0.7 } }] : [];
    });
    // Hráči nestojí trenérům v cestě.
    const paths = coaches.flatMap(({ from, to }) => [0.2, 0.4, 0.6, 0.8].map((s) => ({ x: lerp(from.x, to.x, s), z: lerp(from.z, to.z, s), r: 2.2 })));
    st.layout({ x: 0, z: 0 }, (slot, sd) => uvToWorld(sd, Math.min(slot.base.u * 0.8, 0.42), slot.base.v), new Map([[this.referee, { x: -4, z: 0 }]]), [{ x: 0, z: 0, r: 6 }, ...paths]);
    for (const { figure, to } of coaches) {
      st.go(figure, to, walk);
      if (coaches.length === 2) st.pose(figure, "shake", HANDSHAKE, walk);
    }
    st.t = walk + HANDSHAKE;
    return this.introScene = { clip: st.finish(), start: 0, split: 0, end: st.t, focus: [], card: null, result: null, replay: null };
  }

  /**
   * Výkop před událostí `index` (0 = začátek zápasu, jinak druhý poločas): rozehrávka ze středového bodu. Hvizd,
   * ťuk spoluhráči, míč dozadu na záložníka a od něj na křídlo, které s ním běží dál; scéna je delší než její
   * krok záznamu, takže při střihu na první akci se pořád hraje. První poločas rozehrávají domácí, druhý hosté.
   */
  kickoff(index: number): Scene {
    const cached = this.kickoffs.get(index);
    if (cached) return cached;
    const second = index > 0;
    const side: Side = second ? "away" : "home", fwd = attackSign(side);
    const roster = index < this.rosters.length ? this.rosters[index] : this.finalRoster;
    const st = this.stage(roster, `kickoff:${second}`, second);
    // Nejvýš postavení hráči: dva u míče, třetí čeká na přihrávku dozadu, čtvrtý vyběhne po křídle.
    const [taker, partner, back, wide] = roster[side].filter((x) => x.role !== "GK").sort((a, b) => b.base.u - a.base.u).map((x) => x.figure);
    const fixed = new Map<number, Point>([[this.referee, { x: -4, z: -fwd * 4 }]]);
    [taker, partner].forEach((f, n) => { if (f !== undefined) fixed.set(f, { x: n * 2.4 - 0.5, z: -fwd * 0.8 }); });
    if (back !== undefined) fixed.set(back, { x: 3, z: -fwd * 9 });
    const wing = { x: -13, z: fwd * 5 };
    st.layout({ x: 0, z: 0 }, (slot, sd) => uvToWorld(sd, Math.min(slot.base.u * 0.8, 0.42), slot.base.v), fixed,
      [{ x: 0, z: 0, r: 6 }, { x: 3, z: -fwd * 9, r: 3 }, { x: 3, z: -fwd * 4, r: 2.6 }, { x: 8, z: fwd * 13, r: 2.6 }, { x: -7, z: fwd * 13, r: 2.6 }, { ...wing, r: 2.6 }]);
    st.pose(this.referee, "armUp", 0.8, 0.3);
    SIDES.forEach((sd) => st.coach(sd, "shout", 0.3));
    st.wait(1.2);
    if (partner !== undefined) {
      st.pass(partner, 0.4);
      st.wait(0.4);
    }
    // Od rozehrání se hraje a oba týmy se dají do pohybu.
    st.release(this.playSpot(side));
    if (back !== undefined) {
      st.pass(back, 0.9);
      [taker, partner].forEach((f, n) => { if (f !== undefined) st.go(f, { x: n ? 8 : -7, z: fwd * 13 }, 3.4); });
      st.wait(0.9);
      st.dribble(back, { x: 3, z: -fwd * 4 }, 1.2);
      if (wide !== undefined) {
        st.chase(wide, wing, 2.5);
        st.wait(1.2);
        st.pass(wide, 1.3, { arc: 1.2 });
        st.wait(1.3);
        st.dribble(wide, { x: st.pos(wide).x, z: st.pos(wide).z + fwd * 10 }, 2.5);
      }
    }
    st.t = KICKOFF;
    const scene: Scene = { clip: st.finish(), start: 0, split: 0, end: KICKOFF, focus: [], card: null, result: null, replay: null };
    this.kickoffs.set(index, scene);
    return scene;
  }

  /**
   * Konec zápasu ve třech záběrech se střihem mezi nimi, jako v televizi:
   * 1. závěrečný hvizd, vítězové zvedají ruce a poražení klesají na trávník;
   * 2. po zápase: unavení hráči sedí a leží na trávě, soupeři k nim chodí a podávají jim ruku;
   * 3. vítězové slaví v hloučku, poražení odcházejí ke střídačkám (při remíze třetí záběr není).
   */
  finale(): Scene {
    if (this.closing) return this.closing;
    const roster = this.finalRoster, winner = this.input.winner;
    const st = this.stage(roster, "finale", this.secondHalf >= 0);
    // Při remíze „hostují“ domácí: chodí za soupeři, ale nikdo neslaví.
    const up: Side = winner ?? "home", down = other(up);
    const figures = (side: Side) => roster[side].map((x) => x.figure);

    // 1. Hvizd.
    const ball = { x: 0, z: 4 };
    const spot = this.playSpot("home");
    st.layout(ball, (slot, side) => spot(slot, side, ball), new Map([[this.referee, { x: -4, z: 0 }]]), [{ x: -4, z: 0, r: 2.5 }]);
    st.pose(this.referee, "armUp", 1.6, 0.2);
    if (winner) {
      figures(up).forEach((f, n) => { st.pose(f, "celebrate", Infinity, 0.9 + (n % 4) * 0.1); [1.6, 2.5].forEach((at) => st.jump(f, at + (n % 3) * 0.2)); });
      st.coach(up, "joy", 0.9);
      st.coach(down, "upset", 1.2);
    }
    // Kdo je na dně, klekne si nebo si lehne.
    const tired = (side: Side) => figures(side).forEach((f, n) => { if (n % 3 !== 2) st.pose(f, n % 3 ? "slide" : "down", Infinity, 1 + (n % 5) * 0.25); });
    tired(down);
    if (!winner) tired(up);
    st.wait(3.5);

    // 2. Po zápase: každý z poražených má své místo na trávě, někdo ze soupeřů za ním přijde a podá mu ruku.
    // Místa jsou rozházená (kousek náhody), ne v řadách.
    const rests = figures(down).map((_, n): Point => ({ x: -10 + (n % 4) * 6 + (Math.floor(n / 4) % 2) * 3 + (st.rng() - 0.5) * 1.6, z: -12 + Math.floor(n / 4) * 9 + (st.rng() - 0.5) * 2.4 }));
    const fixed = new Map<number, Point>([[this.referee, { x: -17, z: 12 }]]);
    figures(down).forEach((f, n) => fixed.set(f, rests[n]));
    // Kdo ze soupeřů nemá protějšek (poražení dohrávali v méně), stojí opodál.
    figures(up).forEach((f, n) => fixed.set(f, rests[n] ? { x: rests[n].x + 2.6, z: rests[n].z + 3.2 } : { x: -8 + (n - rests.length) * 3, z: 14.5 }));
    st.layout({ x: 0, z: -3 }, () => { throw new Error("V závěrečné scéně má každý své místo"); }, fixed);
    figures(down).forEach((f, n) => { if (n % 3 !== 2) st.pose(f, n % 3 ? "slide" : "down"); });
    figures(up).forEach((f, n) => {
      if (!rests[n]) return;
      const wait = 0.4 + (n % 4) * 0.6;
      st.go(f, { x: rests[n].x + 0.9, z: rests[n].z + 1 }, 1.6, wait);
      st.pose(f, "armUp", 1.2, wait + 1.6);
      // Kdo stojí, ruku podá taky; kdo sedí nebo leží, tomu ji soupeř podá dolů.
      if (n % 3 === 2 && figures(down)[n] !== undefined) st.pose(figures(down)[n], "armUp", 1.2, wait + 1.6);
    });
    st.wait(6);

    if (winner) {
      // 3. Vítězové skáčou v hloučku před hlavní tribunou, poražení odcházejí ke střídačkám.
      const side = attackSign(winner), huddle = { x: 5, z: -side * 8 };
      const last = new Map<number, Point>([[this.referee, { x: -13, z: -side * 3 }]]);
      figures(up).forEach((f, n) => {
        const angle = (n / figures(up).length) * Math.PI * 2;
        last.set(f, { x: huddle.x + Math.sin(angle) * (2 + (n % 2)), z: huddle.z + Math.cos(angle) * (2 + (n % 2)) });
      });
      figures(down).forEach((f, n) => last.set(f, { x: -2 - (n % 4) * 2.8 + (st.rng() - 0.5) * 1.4, z: side * 6 + (Math.floor(n / 4) - 1) * 3.6 + (st.rng() - 0.5) * 1.8 }));
      st.layout(huddle, () => { throw new Error("V závěrečné scéně má každý své místo"); }, last);
      figures(up).forEach((f, n) => { st.pose(f, "celebrate"); [0.6, 1.5, 2.4, 3.3, 4.2, 5.1].forEach((at) => st.jump(f, at + (n % 3) * 0.15)); });
      st.coach(up, "joy", 0.5);
      // Zastaví se před lajnou, kde stojí trenéři.
      figures(down).forEach((f) => st.go(f, { x: Math.max(BENCH_X + 1.5, st.pos(f).x - 9), z: st.pos(f).z }, 5.6, 0.2));
      st.go(this.referee, { x: -19, z: -side * 3 }, 5);
      st.wait(6);
    }
    this.closing = { clip: st.finish(), start: 0, split: 0, end: st.t, focus: [], card: null, result: null, replay: null };
    return this.closing;
  }

  /**
   * Kam hráč patří v otevřené hře. Bránící tým stojí ve dvou sevřených řadách mezi míčem a svou brankou
   * a s míčem ustupuje, útočící má obranu za míčem a útočníky na hraně soupeřovy obrany.
   */
  private playSpot(possession: Side) {
    return (slot: Slot, side: Side, ball: Point): Point => {
      const dir = attackSign(side), own = -goalZ(side);
      /** Jak daleko je míč od vlastní brankové čáry. */
      const out = (ball.z - own) * dir;
      if (slot.role === "GK") return { x: clamp(ball.x * 0.12, -2.5, 2.5), z: own + dir * clamp(out * 0.12 - 1, 1, 5) };
      const defending = side !== possession;
      const depth = slot.role === "DEF" ? (defending ? clamp(out - 7, 7, 28) : clamp(out - 10, 12, 34))
        : slot.role === "MID" ? (defending ? clamp(out - 1, 13, 36) : clamp(out - 4, 18, 48))
        : defending ? clamp(out + 9, 24, 44) : clamp(out + 7, 28, 54);
      // Čím blíž vlastní brance, tím víc se bránící tým stahuje do středu.
      const width = defending ? lerp(9, 15, clamp(depth / 36, 0, 1)) : 16;
      // Kousek dopředu či dozadu podle hráče, ať řada nestojí jako u stolního fotbalu.
      const stagger = (((slot.figure * 7919) % 13) / 13 - 0.5) * 2.5;
      return { x: clamp(dir * slot.base.v * width + ball.x * 0.35, -HALF_W + 1, HALF_W - 1), z: own + dir * (depth + stagger) };
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
    const window = (i: number, start: number, w: Partial<Window> = {}) => windows.set(i, { start, split: start, end: st.t, focus: [], card: null, result: null, replay: null, ...w });
    /** Gól: po oslavě se zopakuje zakončení (od rozběhu ke střele po míč v síti). */
    const goalShots = (split: number) => ({ replay: { from: split - 1.8, to: split + 0.6 } });
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
        return window(head, 0, { split, focus: [shooter], result: shotResult, ...(e.type === "goal" ? goalShots(split) : {}) });
      }
      case "corner":
      case "freekick": {
        const taker = this.onPitch(st, e);
        if (finisher === undefined || result === null) throw new Error(`Standardka v ${e.minute}. minutě nemá zakončení`);
        const header = this.onPitch(st, events[finisher]);
        const direct = e.detail === "direct";
        this.setPiece(st, side, taker, header, e.type === "corner" ? "corner" : direct ? "direct" : "cross");
        window(head, 0, { focus: [taker] });
        const start = st.t;
        const split = direct ? this.directKick(st, side, taker, result) : this.header(st, side, taker, header, result);
        return window(finisher, start, { split, focus: [header], result, ...(result === "goal" ? goalShots(split) : {}) });
      }
      case "penalty": {
        const kicker = this.onPitch(st, e);
        this.penaltyFoul(st, side, kicker);
        window(head, 0, { focus: [kicker] });
        if (finisher === undefined || result === null) return;
        const start = st.t;
        const scored = result === "goal";
        const split = this.penaltyKick(st, side, kicker, result, scored ? ATTACK : 1.6, scored ? GOAL : DRAMA - 1.6, goalZ(side), false);
        // Zahozenou penaltu záznam ukáže bez útočné fáze, celý kop se odehraje najednou.
        return window(finisher, start, { split: scored ? split : start, focus: [kicker], result, ...(scored ? goalShots(split) : {}) });
      }
      case "foul": {
        const fouler = this.onPitch(st, e);
        this.foul(st, side, fouler);
        window(head, 0, { focus: [fouler] });
        const card = find("card");
        if (card === undefined) throw new Error(`Faul v ${e.minute}. minutě nemá kartu`);
        const start = st.t;
        const carded = this.onPitch(st, events[card]);
        const color = events[card].detail === "red" ? "red" : "yellow";
        return window(card, start, { focus: [carded], card: { at: this.showCard(st, sideOf(events[card].teamId), carded, color), color } });
      }
      case "card": {
        // Karta bez faulu (protesty): hráč stojí proti rozhodčímu.
        const carded = this.onPitch(st, e);
        const ball = uvToWorld(side, 0.3 + st.rng() * 0.4, (st.rng() - 0.5) * 1.2);
        const at = inView(this.playSpot(other(side))(st.slot(carded), side, ball));
        this.open(st, ball, other(side), [[carded, at], [this.referee, { x: at.x + 2.6, z: at.z + 2 }]], [{ ...at, r: 3.5 }]);
        const color = e.detail === "red" ? "red" : "yellow";
        return window(head, 0, { focus: [carded], card: { at: this.showCard(st, side, carded, color), color } });
      }
      case "injury": {
        const injured = this.onPitch(st, e);
        this.injury(st, side, injured);
        window(head, 0, { focus: [injured] });
        for (const i of rest.filter((n) => events[n].type === "substitution")) {
          const start = st.t;
          window(i, start, { focus: this.substitution(st, i) });
        }
        return;
      }
      case "substitution":
        return window(head, 0, { focus: this.substitution(st, head) });
    }
    if (e.detail?.startsWith("shootout:")) {
      // Rozstřel se kope na jednu bránu; kdo kopal, uložené není, jde některý hráč z pole.
      const kicker = st.pick(side, [], ["FWD", "MID", "DEF"]) ?? st.keeper(side);
      const shotResult = chanceResult(e);
      this.penaltyKick(st, side, kicker, shotResult, 1.5, DRAMA - 1.5, -HALF_L, true);
      return window(head, 0, { focus: [kicker], result: shotResult });
    }
    throw new Error(`Událost ${e.type} v ${e.minute}. minutě scénu nemá`);
  }

  /**
   * Střela od nohy (nebo hlavy) střelce, u kterého míč právě je. Vrací čas, kdy míč doletí k bráně.
   * S `playsOn` se po nevyužité šanci hraje dál (v rozstřelu ne): bránící tým vyráží od brány a útočící se vrací.
   */
  private shoot(st: Stage, side: Side, shooter: number, result: ShotResult, after: number, gz: number, blocker: number | null, playsOn: boolean): number {
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
      this.celebrate(st, side, shooter, gz);
      st.coach(side, "joy", 0.2);
      st.coach(other(side), "upset", 0.4);
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
      // Míč trefí obránce, který stojí v ráně (v týmu bez hráčů v poli brankáře), a odrazí se do autu.
      const at = toward(st.pos(blocker ?? gk), st.ball, 0.4);
      st.wait(fly - 0.2);
      st.ballTo(at, 0.2, { h: 0.7 });
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
    if (playsOn && result !== "goal") {
      const spot = this.playSpot(other(side)), restart = { x: 0, z: gz * 0.3 };
      st.t = split + 0.5;
      st.release((slot, sd) => spot(slot, sd, restart), [gk]);
    }
    if (result !== "goal") st.coach(side, "upset");
    st.t = split + after;
    return split;
  }

  /** Oslava gólu, pokaždé jedna ze tří: běh před tribunu se spoluhráči, skluz po kolenou, nebo hlouček, který skáče. */
  private celebrate(st: Stage, side: Side, shooter: number, gz: number) {
    const spot = celebrationSpot(gz);
    const style = Math.floor(st.rng() * 3);
    // Spoluhráči, kteří to mají blízko (nikdo neběží přes celé hřiště).
    const mates = st.outfield(side, [shooter]).filter((m) => dist(st.pos(m), spot) < 22).sort((a, b) => dist(st.pos(a), spot) - dist(st.pos(b), spot)).slice(0, 3);
    const run = Math.max(2.2, dist(st.pos(shooter), spot) / 6.5);
    if (style === 1) {
      // Skluz po kolenou: rozběh a posledních pár metrů po kolenou se zakloněným tělem.
      st.go(shooter, toward(spot, st.pos(shooter), 3.5), run, 0.3);
      st.go(shooter, spot, 1.4, 0.3 + run);
      st.pose(shooter, "slide", 2.6, 0.3 + run);
      st.pose(shooter, "celebrate", Infinity, 2.9 + run);
    } else {
      st.go(shooter, spot, run, 0.3);
      st.pose(shooter, "celebrate", Infinity, 0.3);
    }
    mates.forEach((m, n) => {
      // Do půlkruhu kolem střelce, ať nestojí na sobě.
      const angle = Math.atan2(-spot.x, -spot.z + gz * 0.5) + (n - 1) * 0.9;
      const to = { x: spot.x + Math.sin(angle) * 2.4, z: spot.z + Math.cos(angle) * 2.4 };
      const arrive = Math.max(run + 0.4, dist(st.pos(m), to) / 6.5);
      st.go(m, to, arrive, 0.6);
      st.pose(m, "celebrate", Infinity, arrive);
      // Hlouček skáče (při skluzu a hloučku), při běhu před tribunu jen zvednou ruce.
      if (style > 0) [0.5, 1.3].forEach((at) => st.jump(m, 0.6 + arrive + at));
    });
    if (style === 2) [1.1, 1.9].forEach((at) => st.jump(shooter, 0.3 + run + at));
  }

  /** Akce ze hry: přihrávka do běhu a střela, u brejku sprint přes půl hřiště. */
  private openPlay(st: Stage, side: Side, shooter: number, result: ShotResult, counter: boolean, assister: number | null, blocker: number | null): number {
    const gz = goalZ(side), fwd = attackSign(side), wing = st.rng() < 0.5 ? -1 : 1;
    const shotSpot = inFront(gz, wing * st.rng() * 5, BOX_DEPTH - 1 + st.rng() * 4);
    const celebration = { ...celebrationSpot(gz), r: 3.6 };
    const refereeSpot = { ...toward(shotSpot, { x: -6, z: 0 }, 11), r: 2.4 };
    let marker: number | null;
    const helper = counter ? null : assister ?? st.pick(side, [shooter], ["MID", "FWD"]);
    if (helper === null) {
      const from = uvToWorld(side, 0.48, wing * 0.4);
      this.open(st, from, side, [[shooter, from]], [{ ...shotSpot, r: 4.5 }, celebration, refereeSpot]);
      // Jeden obránce se stihne postavit do rány, další dva dobíhají zezadu.
      const chasers = st.outfield(other(side), blocker === null ? [] : [blocker]).sort((a, b) => dist(st.pos(a), from) - dist(st.pos(b), from));
      marker = blocker ?? chasers.shift() ?? null;
      if (marker !== null) st.chase(marker, toward(shotSpot, { x: 0, z: gz }, 3), 3);
      // Každý z jedné strany, ať se jim cesty nekříží a neskončí na sobě.
      const behind = toward(shotSpot, from, 4);
      chasers.slice(0, 2).sort((a, b) => st.pos(a).x - st.pos(b).x).forEach((c, n) => st.chase(c, { x: behind.x + (n ? 2.5 : -2.5), z: behind.z }, 3));
      st.dribble(shooter, toward(from, shotSpot, dist(from, shotSpot) / 2), 1.5);
      st.wait(1.5);
      st.dribble(shooter, shotSpot, 1.5);
      st.wait(1.5);
    } else {
      const start = inView(inFront(gz, -wing * (7 + st.rng() * 5), 23 + st.rng() * 4)), runFrom = inFront(gz, wing * 4, 21);
      this.open(st, start, side, [[helper, start], [shooter, runFrom]], [{ ...shotSpot, r: 4.5 }, { x: start.x, z: start.z + fwd * 5, r: 2.5 }, celebration, refereeSpot]);
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
    st.chase(this.referee, refereeSpot, 3, -3);
    return this.shoot(st, side, shooter, result, result === "goal" ? GOAL : CHANCE, gz, marker, true);
  }

  /** Roh, centr ze strany nebo přímý kop: střih na rozestavení ve vápně; hráč, který kope, se hlásí o míč. */
  private setPiece(st: Stage, side: Side, taker: number, header: number, kind: "corner" | "cross" | "direct") {
    // Rohy a centry se kopou od vzdálenější lajny: pruh pod hlavní tribunou kamera nevidí.
    const gz = goalZ(side), s = Math.sign(gz), sgn = -1, def = other(side);
    const goal = { x: 0, z: gz };
    const ball = kind === "corner" ? { x: sgn * (HALF_W - 0.4), z: gz - s * 0.4 }
      : kind === "cross" ? inFront(gz, sgn * (13 + st.rng() * 4), 15 + st.rng() * 5)
      : inFront(gz, (st.rng() - 0.5) * 10, BOX_DEPTH + 3 + st.rng() * 3);
    const target = inFront(gz, -sgn * st.rng() * 3, 6 + st.rng() * 2.5);
    const fixed = new Map<number, Point>([[taker, kind === "direct" ? toward(ball, goal, -2.6) : toward(ball, target, -1.5)]]);
    // Zakončující si nabíhá zpoza penalty; do vápna jdou útočníci a střední obránci.
    if (header !== taker) fixed.set(header, toward(target, { x: 0, z: 0 }, 4.5));
    /** Místa ve vápně: hráči na nich začnou a rozestoupí se. */
    const box = new Map<number, Point>();
    const order: Record<Role, number> = { FWD: 0, DEF: 1, MID: 2, GK: 3 };
    const boxSpots = [[-2.5, 5.5], [3, 7], [0.5, 9.5], [-5.5, 8.5]].map(([across, out]) => inFront(gz, across, out));
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
      [{ ...target, r: 2.6 }, { ...ball, r: 3 }, { ...celebrationSpot(gz), r: 3.6 }]);
    st.pose(taker, "armUp", 0.9, 0.6);
    st.t = SETUP;
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
    return this.shoot(st, side, header, result, result === "goal" ? GOAL : CHANCE, gz, marker, true);
  }

  private directKick(st: Stage, side: Side, kicker: number, result: ShotResult): number {
    const goal = { x: 0, z: goalZ(side) };
    // „Do zdi“: ránu zblokuje obránce, který stojí v ráně.
    const inTheWay = st.nearest(other(side), toward(st.ball, goal, 8));
    st.pose(this.referee, "armUp", 0.8, 1.2);
    st.wait(ATTACK - 1.2);
    st.go(kicker, toward(st.ball, goal, -0.5), 0.6);
    st.wait(0.7);
    return this.shoot(st, side, kicker, result, result === "goal" ? GOAL : CHANCE, goal.z, inTheWay, true);
  }

  /** Penalta začíná faulem ve vápně: útočník padá, rozhodčí ukazuje na značku. */
  private penaltyFoul(st: Stage, side: Side, kicker: number) {
    const gz = goalZ(side), wing = st.rng() < 0.5 ? -1 : 1;
    const from = inFront(gz, wing * 6, BOX_DEPTH + 3), to = inFront(gz, wing * 3, BOX_DEPTH - 2.5);
    this.open(st, from, side, [[kicker, from], [this.referee, inFront(gz, -wing * 6, BOX_DEPTH + 6)]], [{ ...to, r: 5 }]);
    const fouler = st.nearest(other(side), to) ?? st.keeper(other(side));
    st.go(fouler, { x: to.x + wing * 0.8, z: to.z }, Math.max(1.5, dist(st.pos(fouler), to) / 7));
    st.dribble(kicker, to, 1.5);
    st.go(this.referee, toward(to, st.pos(this.referee), 4), 2.2);
    st.wait(1.5);
    st.pose(kicker, "down", 3.5);
    st.ballTo(toward(st.ball, { x: 0, z: gz }, 3), 0.6);
    st.go(fouler, { x: to.x + wing * 2.8, z: to.z - Math.sign(gz) * 1 }, 0.9, 0.3);
    st.pose(this.referee, "armUp", 2.5, 0.7);
    st.coach(other(side), "anger", 0.9);
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
      const radius = 8 + row * 2.2;
      return inFront(gz, Math.sin(across * 0.22) * radius, Math.max(BOX_DEPTH + 1 + row * 2, PENALTY_SPOT + Math.cos(across * 0.22) * radius));
    }, fixed, [{ ...celebrationSpot(gz), r: 3.6 }]);
    st.wait(lead - 1.2);
    st.go(kicker, toward(spot, { x: 0, z: gz }, -0.5), 0.7);
    st.wait(0.7);
    return this.shoot(st, side, kicker, result, after, gz, null, !shootout);
  }

  private foul(st: Stage, side: Side, fouler: number) {
    const victimSide = other(side), fwd = attackSign(victimSide), wing = st.rng() < 0.5 ? -1 : 1;
    const at = inView(uvToWorld(victimSide, 0.35 + st.rng() * 0.35, (st.rng() * 2 - 1) * 0.7));
    const contact = { x: at.x, z: at.z + fwd * 4 };
    const victim = st.pick(victimSide, [], ["MID", "FWD"]) ?? st.keeper(victimSide);
    this.open(st, at, victimSide, [[victim, at], [fouler, { x: contact.x + wing * 4, z: contact.z + fwd * 2.5 }], [this.referee, { x: at.x + wing * 7, z: at.z - fwd * 4 }]], [{ ...contact, r: 5 }, { x: contact.x + wing * 4, z: contact.z - fwd * 2.4, r: 2.4 }]);
    st.dribble(victim, contact, 1.2);
    st.go(fouler, { x: contact.x + wing * 0.8, z: contact.z + fwd * 0.2 }, 1.2);
    // Rozhodčí dobíhá ze strany faulujícího, ať ke kartě nejde přes ležícího.
    st.go(this.referee, { x: contact.x + wing * 4, z: contact.z - fwd * 2.4 }, 1.6, 0.2);
    st.wait(1.2);
    // Faulovaný vstane, než rozhodčí schová kartu.
    st.pose(victim, "down", SETUP + CARD_UP - 0.4);
    st.ballTo({ x: contact.x - wing * 2.5, z: contact.z + fwd * 2.5 }, 0.6);
    st.go(fouler, { x: contact.x + wing * 2.6, z: contact.z + fwd * 0.6 }, 0.8, 0.3);
    st.pose(this.referee, "armUp", 0.6, 0.4);
    st.t = SETUP;
  }

  /**
   * Rozhodčí dojde k hráči týmu `side` a zvedne kartu (je vidět, dokud má ruku nahoře); vyloučený odchází ke
   * střídačkám. Pak se hraje dál: týmy se rozbíhají na rozehrání. Vrací čas, kdy je karta nahoře.
   */
  private showCard(st: Stage, side: Side, carded: number, color: CardColor): number {
    const end = st.t + DRAMA;
    const stood = st.pos(carded);
    const at = toward(stood, st.pos(this.referee), 1.7);
    const walk = Math.max(0.9, dist(st.pos(this.referee), at) / 5);
    st.go(this.referee, at, walk);
    st.wait(walk);
    const shown = st.t;
    st.pose(this.referee, "armUp", CARD_UP);
    st.coach(side, "anger");
    if (color === "red") {
      const exit = { x: BENCH_X - 2, z: stood.z * 0.3 };
      const seconds = end - shown - 0.8;
      st.go(carded, toward(stood, exit, Math.min(dist(stood, exit), 2.4 * seconds)), seconds, 0.8);
    }
    st.wait(CARD_UP);
    // Rozehrává soupeř potrestaného, o kus dál směrem k jeho bráně.
    const spot = this.playSpot(other(side));
    const restart = { x: st.ball.x, z: clamp(st.ball.z + attackSign(other(side)) * 12, -HALF_L + 8, HALF_L - 8) };
    st.release((slot, sd) => spot(slot, sd, restart), color === "red" ? [carded] : []);
    st.t = end;
    return shown;
  }

  private injury(st: Stage, side: Side, injured: number) {
    const ball = uvToWorld(side, 0.3 + st.rng() * 0.4, (st.rng() * 2 - 1) * 0.5);
    const at = inView(this.playSpot(other(side))(st.slot(injured), side, ball));
    const down = { x: at.x + 1.2, z: at.z + 0.6 };
    this.open(st, ball, other(side), [[injured, at], [this.referee, { x: at.x - 6, z: at.z - 5 }]], [{ ...down, r: 4.4 }]);
    st.go(injured, down, 0.6);
    st.pose(injured, "down", Infinity, 0.6);
    // Dva nejbližší spoluhráči k němu dojdou, každý z jiné strany (kdo je daleko, zůstane stát).
    st.outfield(side, [injured]).sort((a, b) => dist(st.pos(a), at) - dist(st.pos(b), at)).slice(0, 2).filter((m) => dist(st.pos(m), at) < 14)
      .forEach((m, n) => st.go(m, { x: down.x + (n ? -1.7 : 1.9), z: down.z + (n ? 1.6 : -1.2) }, 3, 0.8));
    st.go(this.referee, { x: at.x - 1.4, z: at.z - 1.6 }, 1.5, 0.7);
    st.pose(this.referee, "armUp", 1.2, 1);
    st.coach(side, "shout", 1);
    st.t = DRAMA;
  }

  /** Střídání: střih k postranní čáře u střídaček, hráči si plácnou a vymění se. Vrací [přicházející, odcházející]. */
  private substitution(st: Stage, index: number): number[] {
    const { incoming, outgoing } = this.swaps.get(index)!;
    const end = st.t + DRAMA;
    const z = (st.rng() - 0.5) * 6;
    const ball = { x: 3, z: z + 9 };
    const spot = this.playSpot("home");
    st.recast(this.rosters[index]);
    st.layout(ball, (slot, side) => spot(slot, side, ball), new Map([[outgoing, { x: BENCH_X + 7, z: z + 1 }], [incoming, { x: BENCH_X - 1.6, z }], [this.referee, { x: BENCH_X + 4, z: z - 4 }]]), [{ x: BENCH_X + 4, z: z + 1, r: 5 }]);
    st.coach(sideOf(this.events[index].teamId), "shout", 1.8);
    st.go(outgoing, { x: BENCH_X + 0.5, z }, 1.9);
    st.wait(1.6);
    st.pose(outgoing, "armUp", 0.6);
    st.pose(incoming, "armUp", 0.6);
    st.wait(0.4);
    st.go(incoming, { x: BENCH_X + 8, z: z + 1.5 }, 2.2);
    st.go(outgoing, { x: BENCH_X - 2.5, z: z + 2 }, 1.2);
    st.t = end;
    return [incoming, outgoing];
  }
}
