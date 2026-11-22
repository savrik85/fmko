/**
 * Choreografie 3D záznamu zápasu.
 *
 * Engine ukládá jen události po minutách, bez souřadnic. Tady se z nich zápas odsimuluje dopředu
 * po krocích 1/20 s: scénář (přihrávka, vedení míče, střela, položení míče, čekání) běží popořadě
 * a v každém kroku se každý hráč posune ke svému cíli (místo ze scénáře, jinak místo ve formaci)
 * s omezenou rychlostí i zrychlením. Míč buď letí, nebo ho má hráč u nohy. Výsledek se uloží do
 * polí a `sample(t)` jen prolíná sousední kroky, takže scéna kreslí přesně to, co měří testy.
 * Co se stalo (střelec, výsledek střely, standardka, střídání) určují data; náhoda odvozená
 * z id zápasu vybírá jen kosmetiku, takže každé přehrání vypadá stejně.
 */
import type { MatchEvent } from "@okresni-masina/shared";
import { PITCH } from "../../stadium/stadium-3d/constants";

export const REPLAY_HZ = 20;
const DT = 1 / REPLAY_HZ;
export const HALF_W = PITCH.width / 2;
export const HALF_L = PITCH.depth / 2;
/** Šířka, do které se rozkládá formace (kousek od lajny). */
const SHAPE_HALF_W = HALF_W - 2;
const GOAL_HALF_W = 3.66;
const GOAL_H = 2.44;
const PENALTY_DIST = 11;
/** Střídající hráč vbíhá od střídaček na západní lajně. */
export const BENCH_ENTRY = { x: -(HALF_W + 1), z: 0 };
/** Nejvyšší rychlost hráče (m/s) a zrychlení (m/s²) v herním čase; do formace se jen klusá. */
export const SPRINT = 7.5;
const JOG = 4.5;
export const ACCEL = 5;
/** Místo ve formaci se hráči posune, až když je od toho dosavadního dál než tohle; jinak stojí. */
const HYSTERESIS = 4;
/** Rozestup, který si stojící hráč drží od ostatních. */
const SPACING = 1.7;
/** Na tuhle vzdálenost se hráč mimo scénář začne vyhýbat ostatním. */
const AVOID = 1.4;
const LOOK_AHEAD = 0.4;
const CLOSE = 0.9;
/** Soupeř stojí u rozehrávky aspoň tak daleko od míče. */
const DEAD_BALL_GAP = 4;
/** Titulek visí aspoň takhle dlouho (s), než ho vystřídá další. */
export const CAPTION_GAP = 1.5;
export const POSES = ["run", "down", "diveLeft", "diveRight", "celebrate"] as const;
/** Stav hráče v záznamu: mimo hřiště, na hřišti, odchází (střídání, červená). */
export const OFF = 0, ON = 1, LEAVING = 2;

export type Side = "home" | "away";
type Role = "GK" | "DEF" | "MID" | "FWD";
export type Pose = (typeof POSES)[number];
type Banner = "goal" | "penalty" | "yellow" | "red" | "injury" | "sub";
type ShotResult = "goal" | "saved" | "post" | "bar" | "wide" | "over" | "blocked";
interface Score { home: number; away: number }

export interface ReplayPlayer {
  id: string;
  name: string;
  position: string;
  skinColor?: string;
  hairColor?: string | null;
  height?: number;
}
export interface ReplayKit { shirt: string; shorts: string; socks: string }
export interface ReplayTeam { name: string; kit: ReplayKit; starters: ReplayPlayer[]; subs: ReplayPlayer[] }
export interface ReplayInput {
  matchId: string;
  events: MatchEvent[];
  commentary: string[];
  home: ReplayTeam;
  away: ReplayTeam;
  /** Uložený výsledek; záznam na něm vždy skončí. */
  score: Score;
  shootout?: Score | null;
}

export interface Figure { side: Side; player: ReplayPlayer }
/** Titulek a hráči, o kterých je (scéna je zvýrazní). */
interface Caption { t: number; text: string; banner?: Banner; figures: number[] }
interface Point { x: number; z: number }
interface SlotBase { u: number; v: number; role: Role }
type Layout = { kind: "play" | "kickoff" } | { kind: "box" | "penalty"; attacker: Side };
type Ball =
  | { kind: "held"; owner: number }
  | { kind: "rest" }
  | { kind: "flight"; from: Point & { h: number }; to: Point & { h: number }; arc: number; k0: number; k1: number; receiver: number | null };

interface Actor extends Point {
  side: Side;
  role: Role;
  /** Místo ve formaci (index do `slotBases` týmu). */
  slot: number;
  state: number;
  vx: number;
  vz: number;
  /** Kam hráč naposled běžel; míč u nohy má před sebou. */
  dirX: number;
  dirZ: number;
  /** Místo ze scénáře; null = hráč patří do formace. */
  script: Point | null;
  speed: number;
  /** Místo ve formaci, kde hráč stojí, dokud se formace nepohne dál než o HYSTERESIS. */
  anchor: Point | null;
  pose: number;
  poseUntil: number;
}

/** Odsimulovaný zápas po krocích (REPLAY_HZ); pole hráčů jsou po krocích za sebou: [krok * počet hráčů + hráč]. */
export interface ReplaySamples {
  ticks: number;
  x: Float32Array;
  z: Float32Array;
  state: Uint8Array;
  pose: Uint8Array;
  keeper: Uint8Array;
  ballX: Float32Array;
  ballZ: Float32Array;
  ballH: Float32Array;
  /** Hráč s míčem u nohy, -1 = nikdo. */
  owner: Int16Array;
  /** Krok, kterým začíná druhý poločas (jediný střih v záznamu). */
  cut: number;
  /** Faulující a faulovaný smí být v krocích from–to těsně u sebe. */
  fouls: { a: number; b: number; from: number; to: number }[];
  sentOff: { figure: number; tick: number }[];
}

// ── Pomocné funkce ──

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
const lerp = (a: number, b: number, s: number) => a + (b - a) * s;
const dist = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.z - b.z);
const other = (side: Side): Side => (side === "home" ? "away" : "home");
const sideOfTeam = (teamId: number): Side => (teamId === 1 ? "home" : "away");
const hash01 = (n: number) => {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
};
/** Bod ve vzdálenosti `gap` od `from` směrem k `to`. */
const toward = (from: Point, to: Point, gap: number): Point => {
  const d = dist(from, to) || 1;
  return { x: from.x + ((to.x - from.x) / d) * gap, z: from.z + ((to.z - from.z) / d) * gap };
};

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

const toRole = (position: string): Role => (position === "GK" || position === "DEF" || position === "FWD" ? position : "MID");

/** Domácí útočí v 1. poločase k záporné z, po přestávce se strany mění. */
export const attackSign = (side: Side, half: 1 | 2): 1 | -1 => ((side === "home") === (half === 1) ? -1 : 1);

/** u = 0 vlastní branka, 1 soupeřova; v = -1..1 napříč hřištěm. */
function uvToWorld(side: Side, half: 1 | 2, u: number, v: number): Point {
  const s = attackSign(side, half);
  return { x: s * v * SHAPE_HALF_W, z: s * (u - 0.5) * PITCH.depth };
}

function worldToUv(side: Side, half: 1 | 2, p: Point): { u: number; v: number } {
  const s = attackSign(side, half);
  return { u: p.z / (s * PITCH.depth) + 0.5, v: p.x / (s * SHAPE_HALF_W) };
}

/** Základní postavení: řady podle pozic ze sestavy, hráči v řadě rovnoměrně napříč. */
function slotBases(starters: ReplayPlayer[]): SlotBase[] {
  const lineU: Record<Role, number> = { GK: 0.03, DEF: 0.2, MID: 0.42, FWD: 0.63 };
  const roles = starters.map((p) => toRole(p.position));
  return roles.map((role, i) => {
    const line = roles.flatMap((r, j) => (r === role ? [j] : []));
    const n = line.length;
    const spread = role === "GK" ? 0 : Math.min(0.78, 0.26 * (n - 1));
    return { u: lineU[role], v: n === 1 ? 0 : -spread + (2 * spread * line.indexOf(i)) / (n - 1), role };
  });
}

/** Výsledek neproměněné šance podle uloženého výsledku, u standardek podle textu enginu. */
function chanceResult(e: MatchEvent): ShotResult {
  switch (e.detail) {
    case "vedle": return "wide";
    case "břevno": return "bar";
    case "tyč": return "post";
    case "chytil brankář": return "saved";
    case "zblokováno": return "blocked";
    case "penalty_saved": return "saved";
    case "penalty_missed": return "wide";
  }
  const d = e.description ?? "";
  if (d.includes("do zdi") || d.includes("zblokováno")) return "blocked";
  if (d.includes("nad břevno")) return "over";
  if (d.includes("chytil brankář") || d.includes("vyráží")) return "saved";
  return "wide";
}

/** Události jedné akce (roh → gól → asistence, šance → zákrok, faul → karta…) jdou spolu. */
function follows(head: MatchEvent, e: MatchEvent): boolean {
  if (e.minute !== head.minute) return false;
  const sameTeam = e.teamId === head.teamId;
  const attackingFollow = sameTeam && (e.type === "goal" || e.type === "chance" || e.type === "assist");
  switch (head.type) {
    case "corner":
    case "freekick": return attackingFollow;
    case "penalty": return attackingFollow || (!sameTeam && e.detail === "penalty_save");
    case "chance": return !sameTeam && (e.detail === "save" || e.detail === "block" || e.detail === "gk_hero");
    case "goal": return sameTeam && e.type === "assist";
    case "foul": return e.type === "card";
    case "injury": return sameTeam && e.type === "substitution";
    default: return false;
  }
}

function groupEvents(events: MatchEvent[]): number[][] {
  const groups: number[][] = [];
  events.forEach((e, i) => {
    const g = groups[groups.length - 1];
    if (g && (follows(events[g[0]], e) || (g.length > 1 && follows(events[g[g.length - 1]], e)))) g.push(i);
    else groups.push([i]);
  });
  return groups;
}

// ── Plán ──

export class ReplayPlan {
  readonly home: ReplayTeam;
  readonly away: ReplayTeam;
  readonly figures: Figure[];
  readonly duration: number;
  readonly samples: ReplaySamples;
  readonly shootout: Score | null;
  private readonly captions: Caption[];
  private readonly scores: (Score & { t: number })[];
  private readonly minutes: { t: number; minute: number }[];

  constructor(input: ReplayInput) {
    this.home = input.home;
    this.away = input.away;
    this.shootout = input.shootout ?? null;
    const built = new Simulation(input);
    built.build();
    this.figures = built.figures;
    this.samples = built.bake();
    this.captions = built.captions;
    this.scores = built.scores;
    this.minutes = built.minutes;
    this.duration = (this.samples.ticks - 1) * DT;
  }

  createFrame() {
    return {
      ballX: 0, ballY: 0, ballZ: 0,
      figures: this.figures.map(() => ({ visible: false, x: 0, z: 0, pose: "run" as Pose, keeper: false })),
    };
  }

  /** Stav v čase t, zapsaný do snímku z `createFrame`: sousední kroky simulace, prolnuté. */
  sample(t: number, out: ReturnType<ReplayPlan["createFrame"]>): void {
    const s = this.samples;
    const f = clamp(t * REPLAY_HZ, 0, s.ticks - 1);
    const k0 = Math.floor(f);
    const k1 = Math.min(k0 + 1, s.ticks - 1);
    const a = k1 === s.cut ? 0 : f - k0;
    const n = this.figures.length;
    out.figures.forEach((fig, i) => {
      const i0 = k0 * n + i;
      const i1 = k1 * n + i;
      fig.visible = s.state[i0] !== OFF;
      fig.x = lerp(s.x[i0], s.x[i1], a);
      fig.z = lerp(s.z[i0], s.z[i1], a);
      fig.pose = POSES[s.pose[i0]];
      fig.keeper = s.keeper[i0] === 1;
    });
    out.ballX = lerp(s.ballX[k0], s.ballX[k1], a);
    out.ballZ = lerp(s.ballZ[k0], s.ballZ[k1], a);
    out.ballY = lerp(s.ballH[k0], s.ballH[k1], a);
  }

  scoreAt(t: number): Score {
    return this.scores.reduce((s, k) => (k.t <= t ? k : s), this.scores[0]);
  }

  minuteAt(t: number): number {
    const keys = this.minutes;
    for (let i = keys.length - 1; i >= 0; i--) {
      if (keys[i].t > t) continue;
      const next = keys[i + 1];
      return next ? Math.floor(lerp(keys[i].minute, next.minute, (t - keys[i].t) / Math.max(0.001, next.t - keys[i].t))) : keys[i].minute;
    }
    return 0;
  }

  /** Titulek, který právě běží (nejdéle 7 s). */
  captionAt(t: number): Caption | null {
    const c = this.captions.reduce<Caption | null>((cur, k) => (k.t <= t ? k : cur), null);
    return c && t - c.t < 7 ? c : null;
  }

  captionTimes(): number[] {
    return this.captions.map((c) => c.t);
  }
}

// ── Simulace ──

class Simulation {
  readonly figures: Figure[] = [];
  readonly captions: Caption[] = [];
  readonly scores: (Score & { t: number })[] = [{ t: 0, home: 0, away: 0 }];
  readonly minutes = [{ t: 0, minute: 0 }];
  private readonly actors: Actor[] = [];
  private readonly rec = { x: [] as number[], z: [] as number[], state: [] as number[], pose: [] as number[], keeper: [] as number[], bx: [] as number[], bz: [] as number[], bh: [] as number[], owner: [] as number[] };
  private readonly fouls: ReplaySamples["fouls"] = [];
  private readonly sentOff: ReplaySamples["sentOff"] = [];
  private readonly bases: Record<Side, SlotBase[]>;
  /** Engine id hráče („home:7“) → figura; náhradník přibude, až přijde na hřiště. */
  private readonly byId = new Map<string, number>();
  private readonly rng: () => number;
  private k = 0;
  private cut = -1;
  private half: 1 | 2 = 1;
  private possession: Side = "home";
  private layout: Layout = { kind: "kickoff" };
  private relayout = true;
  private kickoffPair: number[] = [];
  private ball: Ball = { kind: "rest" };
  private bx = 0;
  private bz = 0;
  private bh = 0;
  private goals: Score = { home: 0, away: 0 };
  private lastMinute = 0;
  /** Titulky bez vlastní akce (rozhodčí, počasí, pokyny…), ukážou se během další hry. */
  private notes: string[] = [];
  private halfTimeText: string | null = null;
  private fullTimeText: string | null = null;
  private text: (i: number) => string = () => "";

  constructor(private readonly input: ReplayInput) {
    this.rng = seededRng(input.matchId);
    this.bases = { home: slotBases(input.home.starters), away: slotBases(input.away.starters) };
    for (const side of ["home", "away"] as const) {
      const team = input[side];
      team.starters.forEach((player, slot) => {
        this.byId.set(`${side}:${slot + (side === "home" ? 1 : 101)}`, this.addFigure(side, player, toRole(player.position), slot, ON));
      });
      for (const player of team.subs) this.addFigure(side, player, toRole(player.position), 0, OFF);
    }
    // Náhradník, který v uložené lavičce chybí (starší pohár a turnaj), dostane figuru bez vzhledu.
    for (const e of input.events) {
      const side = sideOfTeam(e.teamId);
      if (e.type === "substitution" && this.benchByName(side, e.playerName) === null) {
        this.addFigure(side, { id: `sub-${side}-${e.playerId}`, name: e.playerName ?? "", position: "MID" }, "MID", 0, OFF);
      }
    }
  }

  private addFigure(side: Side, player: ReplayPlayer, role: Role, slot: number, state: number): number {
    this.figures.push({ side, player });
    const s = attackSign(side, 1);
    this.actors.push({ side, role, slot, state, x: BENCH_ENTRY.x, z: BENCH_ENTRY.z, vx: 0, vz: 0, dirX: 0, dirZ: s, script: null, speed: JOG, anchor: null, pose: 0, poseUntil: 0 });
    return this.actors.length - 1;
  }

  build() {
    const { events, commentary } = this.input;
    // Pořadí podle minut (stabilně); poločas se pozná podle minuty, ne podle události „poločas“.
    const order = events.map((_, i) => i).sort((a, b) => events[a].minute - events[b].minute || a - b);
    const sorted = order.map((i) => events[i]);
    this.text = (i) => (commentary[order[i]] ?? sorted[i].description ?? "").replace(/^\d+'\s*[—-]\s*/, "");
    this.setLayout({ kind: "kickoff" }, "home");
    for (const a of this.actors) {
      if (a.state !== ON) continue;
      Object.assign(a, this.spot(a, this.actors.indexOf(a), { x: 0, z: 0 }));
    }
    this.caption("Výkop!");
    this.runFor(1.5);
    this.takeBall("home", this.kickoffPair[0] ?? null);
    this.pendingEvents = sorted;
    for (const group of groupEvents(sorted)) {
      if (sorted[group[0]].minute > 45 && this.half === 1) this.halfTime();
      this.playGroup(group);
    }
    if (this.half === 1) this.halfTime();
    this.fullTime();
  }

  private pendingEvents: MatchEvent[] = [];

  bake(): ReplaySamples {
    const r = this.rec;
    return {
      ticks: this.k,
      x: Float32Array.from(r.x), z: Float32Array.from(r.z), state: Uint8Array.from(r.state),
      pose: Uint8Array.from(r.pose), keeper: Uint8Array.from(r.keeper),
      ballX: Float32Array.from(r.bx), ballZ: Float32Array.from(r.bz), ballH: Float32Array.from(r.bh), owner: Int16Array.from(r.owner),
      cut: this.cut, fouls: this.fouls, sentOff: this.sentOff,
    };
  }

  // ── Krok simulace ──

  private get now() {
    return this.k * DT;
  }

  private tick() {
    const focus = this.ball.kind === "flight" ? this.ball.to : { x: this.bx, z: this.bz };
    const targets = this.actors.map((a, i): Point | null => {
      if (a.pose && this.k >= a.poseUntil) a.pose = 0;
      if (a.state === OFF) return null;
      if (a.state === LEAVING) return { x: Math.sign(a.x || 1) * (HALF_W + 1), z: a.z };
      if (a.pose === 1) return a;
      if (a.script) return a.script;
      const spot = this.spot(a, i, focus);
      if (this.relayout || !a.anchor || dist(spot, a.anchor) > (a.role === "GK" ? 2.5 : HYSTERESIS)) a.anchor = spot;
      return a.anchor;
    });
    this.relayout = false;
    // Stojící hráči si rozestoupí místa (po dvojicích, pár kol); místa ze scénáře se nehýbou, soupeř ustoupí od míče u rozehrávky.
    const idle = this.actors.map((a, i) => a.state === ON && !a.script && a.pose !== 1 && !!targets[i]);
    targets.forEach((t, i) => idle[i] && (targets[i] = { ...t! }));
    const ball = { x: this.bx, z: this.bz };
    for (let round = 0; round < 4; round++) {
      targets.forEach((p, i) => {
        if (!idle[i] || !p) return;
        targets.forEach((q, j) => {
          if (!q || j === i || (idle[j] && j < i)) return;
          const d = dist(p, q);
          if (d >= SPACING) return;
          const push = (SPACING - d) / (idle[j] ? 2 : 1);
          const nx = d < 0.01 ? Math.cos(i) : (p.x - q.x) / d;
          const nz = d < 0.01 ? Math.sin(i) : (p.z - q.z) / d;
          p.x += nx * push;
          p.z += nz * push;
          if (idle[j]) {
            q.x -= nx * push;
            q.z -= nz * push;
          }
        });
        if (this.ball.kind === "rest" && this.actors[i].side !== this.possession && dist(p, ball) < DEAD_BALL_GAP) Object.assign(p, toward(ball, p, DEAD_BALL_GAP));
      });
    }
    targets.forEach((p, i) => {
      if (!idle[i] || !p) return;
      this.actors[i].anchor = targets[i] = { x: clamp(p.x, -HALF_W + 0.5, HALF_W - 0.5), z: clamp(p.z, -HALF_L + 0.5, HALF_L - 0.5) };
    });
    this.actors.forEach((a, i) => {
      const t = targets[i];
      if (!t) return;
      // Hráč se cestou vyhne ostatním; dva ze scénáře (faul, souboj o míč) se míjet nemusí.
      const avoid = this.actors.filter((b) => b !== a && b.state !== OFF && dist(a, b) < 4 && (!a.script || !b.script));
      this.move(a, t, a.script ? a.speed : a.state === LEAVING ? JOG * 0.8 : JOG, avoid);
      if (a.state === LEAVING && Math.abs(a.x) >= HALF_W + 0.9) a.state = OFF;
    });
    this.moveBall();
    this.record();
  }

  /** Krok k cíli: zrychlení nejvýš ACCEL, před cílem plynule brzdí a zastaví přesně na místě. */
  private move(a: Actor, t: Point, vmax: number, avoid: Actor[]) {
    const dx = t.x - a.x;
    const dz = t.z - a.z;
    const d = Math.hypot(dx, dz);
    // Brzdí tak, aby po krocích s úbytkem rychlosti ACCEL·DT zastavil přesně na místě.
    const v = d < 1e-4 ? 0 : Math.min(vmax, ACCEL * DT * (Math.sqrt((2 * d) / (ACCEL * DT * DT) + 0.25) - 0.5));
    let wx = d < 1e-4 ? 0 : (dx / d) * v;
    let wz = d < 1e-4 ? 0 : (dz / d) * v;
    // Stojící hráč neuhýbá; kdo běží, obejde ho po straně blíž ke svému cíli (dva v pohybu se tak minou).
    const standing = d < 0.3 && Math.hypot(a.vx, a.vz) < 0.5;
    for (const b of avoid) {
      if (standing && Math.hypot(b.vx, b.vz) > 0.5 && dist(a, b) > CLOSE) continue;
      // Kde budou oba za chvíli; kdo je už teď těsně u druhého, ustoupí přímo od něj.
      const now = Math.max(0.05, dist(a, b));
      if (now < CLOSE) {
        wx += ((a.x - b.x) / now) * (CLOSE - now) * 20;
        wz += ((a.z - b.z) / now) * (CLOSE - now) * 20;
      }
      const rx = a.x + a.vx * LOOK_AHEAD - b.x - b.vx * LOOK_AHEAD;
      const rz = a.z + a.vz * LOOK_AHEAD - b.z - b.vz * LOOK_AHEAD;
      const gap = Math.max(0.05, Math.hypot(rx, rz));
      if (gap >= AVOID) continue;
      const nx = rx / gap;
      const nz = rz / gap;
      const side = -nz * dx + nx * dz < 0 ? -0.8 : 0.8;
      wx += (nx - nz * side) * (AVOID - gap) * 12;
      wz += (nz + nx * side) * (AVOID - gap) * 12;
    }
    let ax = (wx - a.vx) / DT;
    let az = (wz - a.vz) / DT;
    const am = Math.hypot(ax, az);
    if (am > ACCEL) {
      ax *= ACCEL / am;
      az *= ACCEL / am;
    }
    a.vx += ax * DT;
    a.vz += az * DT;
    a.x += a.vx * DT;
    a.z += a.vz * DT;
    const speed = Math.hypot(a.vx, a.vz);
    if (speed > 1) {
      a.dirX = a.vx / speed;
      a.dirZ = a.vz / speed;
    }
  }

  private moveBall() {
    const b = this.ball;
    if (b.kind === "held") {
      const o = this.actors[b.owner];
      this.bx = o.x + o.dirX * 0.5;
      this.bz = o.z + o.dirZ * 0.5;
      // Míč přijatý ve výšce (hlavička, chycení) klesá k zemi postupně.
      this.bh = Math.max(0, this.bh - 4 * DT);
    } else if (b.kind === "flight") {
      const s = clamp((this.k - b.k0) / (b.k1 - b.k0), 0, 1);
      this.bx = lerp(b.from.x, b.to.x, s);
      this.bz = lerp(b.from.z, b.to.z, s);
      this.bh = lerp(b.from.h, b.to.h, s) + b.arc * 4 * s * (1 - s);
      if (this.k < b.k1) return;
      if (b.receiver === null) {
        this.ball = { kind: "rest" };
        return;
      }
      // Míč doletí k příjemci tam, kde opravdu je: dráhu letu přepočítáme na jeho skutečné místo.
      const o = this.actors[b.receiver];
      const end = { x: o.x + o.dirX * 0.5, z: o.z + o.dirZ * 0.5 };
      for (let k = b.k0 + 1; k < b.k1; k++) {
        const s2 = (k - b.k0) / (b.k1 - b.k0);
        this.rec.bx[k] = lerp(b.from.x, end.x, s2);
        this.rec.bz[k] = lerp(b.from.z, end.z, s2);
      }
      this.ball = { kind: "held", owner: b.receiver };
      this.bx = end.x;
      this.bz = end.z;
    }
  }

  private record() {
    const r = this.rec;
    for (const a of this.actors) {
      r.x.push(a.x);
      r.z.push(a.z);
      r.state.push(a.state);
      r.pose.push(a.state === OFF ? 0 : a.pose);
      r.keeper.push(a.role === "GK" ? 1 : 0);
    }
    r.bx.push(this.bx);
    r.bz.push(this.bz);
    r.bh.push(this.bh);
    r.owner.push(this.ball.kind === "held" ? this.ball.owner : -1);
    this.k++;
  }

  private runFor(seconds: number) {
    const end = this.k + Math.round(seconds * REPLAY_HZ);
    while (this.k < end) this.tick();
  }

  private runUntil(done: () => boolean, maxSeconds: number) {
    const end = this.k + Math.round(maxSeconds * REPLAY_HZ);
    while (this.k < end && !done()) this.tick();
  }

  // ── Formace ──

  private setLayout(layout: Layout, possession: Side) {
    // Hráči se přestaví hned jen při změně situace (výkop, roh, penalta); v otevřené hře platí HYSTERESIS.
    this.relayout ||= layout.kind !== this.layout.kind || layout.kind !== "play";
    this.layout = layout;
    this.possession = possession;
    if (layout.kind === "kickoff") {
      const outfield = this.onPitch(possession).filter((f) => this.actors[f].role !== "GK");
      const pair = outfield.sort((a, b) => this.base(this.actors[b]).u - this.base(this.actors[a]).u).slice(0, 2);
      // K míči jde ten, kdo je mu blíž, ať se dvojice cestou nezkříží.
      this.kickoffPair = pair.length === 2 && this.actors[pair[1]].x < this.actors[pair[0]].x ? [pair[1], pair[0]] : pair;
    }
  }

  private base(a: Actor): SlotBase {
    return this.bases[a.side][a.slot] ?? { u: 0.42, v: 0, role: "MID" };
  }

  /** Kam hráč patří podle polohy míče, držení a druhu situace (brankář podle své role, ne místa). */
  private spot(a: Actor, i: number, ball: Point): Point {
    const { side } = a;
    const base = this.base(a);
    const seed = a.slot * 1.7 + (side === "home" ? 0 : 0.9);
    const b = worldToUv(side, this.half, ball);
    const L = this.layout;
    let u: number;
    let v: number;
    if (a.role === "GK") {
      const attacking = (L.kind === "box" || L.kind === "penalty") && side === L.attacker;
      u = L.kind === "penalty" && !attacking ? 0.005 : attacking ? 0.12 : 0.03 + clamp((b.u - 0.3) * 0.08, 0, 0.06);
      v = L.kind === "penalty" ? 0 : clamp(b.v * 0.2, -0.15, 0.15);
    } else if (L.kind === "kickoff") {
      const pair = this.kickoffPair.indexOf(i);
      if (side === this.possession && pair >= 0) return { x: pair * 2.5, z: -attackSign(side, this.half) * (pair ? 0.4 : 0.5) };
      u = Math.min(base.u * 0.85, side === this.possession ? 0.44 : 0.38);
      v = base.v;
    } else if (L.kind === "penalty") {
      u = side === L.attacker ? 0.64 : 0.34;
      v = -0.6 + 1.2 * hash01(seed * 3.7);
    } else if (L.kind === "box") {
      // Roh a centr: útočníci a stopeři ve vápně, krajní obránci vzadu; bránící ve vlastním vápně, útočník nahoře.
      const staysBack = side === L.attacker ? base.role === "DEF" && Math.abs(base.v) >= 0.5 : base.role === "FWD";
      if (staysBack) {
        u = side === L.attacker ? 0.52 : 0.38;
        v = base.v * 0.6;
      } else {
        u = side === L.attacker ? 0.8 + 0.1 * hash01(seed) : 0.05 + 0.13 * hash01(seed * 3.1);
        v = (-0.5 + hash01(seed * 5.7)) * 0.7;
      }
    } else {
      const shift = (b.u - 0.5) * 0.5 + (this.possession === side ? 0.06 : -0.06);
      u = clamp(base.u + shift, 0.08, 0.92);
      v = clamp(base.v * 0.85 + b.v * 0.3, -1.05, 1.05);
    }
    return uvToWorld(side, this.half, u, v);
  }

  // ── Hráči ──

  private onPitch(side: Side): number[] {
    return this.actors.flatMap((a, i) => (a.side === side && a.state === ON ? [i] : []));
  }

  private keeper(side: Side): number | null {
    return this.onPitch(side).find((f) => this.actors[f].role === "GK") ?? null;
  }

  private teammate(side: Side, exclude: (number | null)[], roles: Role[]): number | null {
    const outfield = this.onPitch(side).filter((f) => !exclude.includes(f) && this.actors[f].role !== "GK");
    const preferred = outfield.filter((f) => roles.includes(this.actors[f].role));
    const list = preferred.length ? preferred : outfield;
    return list.length ? list[Math.floor(this.rng() * list.length)] : null;
  }

  private nearest(side: Side, p: Point, outfieldOnly = true): number | null {
    const list = this.onPitch(side).filter((f) => !outfieldOnly || this.actors[f].role !== "GK");
    return list.reduce<number | null>((best, f) => (best === null || dist(this.actors[f], p) < dist(this.actors[best], p) ? f : best), null);
  }

  /**
   * Hráč události; kdo zrovna na hřišti není (nesoulad v datech), toho zastoupí spoluhráč na hřišti.
   * Brankář zůstává ve vápně: akci v poli (faul, střela, standardka) za něj odehraje spoluhráč.
   */
  private actor(e: MatchEvent | undefined, keeperOk = false): number | null {
    if (!e) return null;
    const side = sideOfTeam(e.teamId);
    const f = this.byId.get(`${side}:${e.playerId}`) ?? this.benchByName(side, e.playerName);
    if (f !== null && f !== undefined && this.actors[f].state === ON && (keeperOk || this.actors[f].role !== "GK")) return f;
    return this.teammate(side, [], f !== null && f !== undefined ? [this.actors[f].role] : ["MID", "FWD"]);
  }

  private benchByName(side: Side, name: string | undefined): number | null {
    const i = this.figures.findIndex((f, j) => f.side === side && f.player.name === name && this.actors[j].state === OFF && !this.used.has(j));
    return i >= 0 ? i : null;
  }

  private readonly used = new Set<number>();

  private send(i: number, to: Point, speed = SPRINT) {
    this.actors[i].script = to;
    this.actors[i].speed = speed;
  }

  /** Všichni ze scénáře zpět do formace (kromě vyjmenovaných); stojí, dokud se formace nepohne. */
  private freeAll(...keep: (number | null)[]) {
    this.actors.forEach((a, i) => {
      if (!a.script || keep.includes(i)) return;
      a.script = null;
      a.anchor = { x: a.x, z: a.z };
    });
  }

  private setPose(i: number, pose: Pose, seconds: number) {
    this.actors[i].pose = POSES.indexOf(pose);
    this.actors[i].poseUntil = this.k + Math.round(seconds * REPLAY_HZ);
  }

  private settled() {
    return this.actors.every((a) => a.state !== ON || (Math.hypot(a.vx, a.vz) < 0.3 && dist(a, a.script ?? a.anchor ?? a) < 1));
  }

  private goalZ(side: Side): number {
    return attackSign(side, this.half) * HALF_L;
  }

  private sign(): 1 | -1 {
    return this.rng() < 0.5 ? -1 : 1;
  }

  // ── Titulky, skóre, minuty ──

  /** Titulky jdou do fronty, aby se každý dal přečíst. */
  private caption(text: string, banner?: Banner, figures: (number | null)[] = []) {
    const last = this.captions[this.captions.length - 1];
    this.captions.push({ t: last ? Math.max(this.now, last.t + CAPTION_GAP) : this.now, text, banner, figures: figures.filter((f): f is number => f !== null) });
  }

  private flushNotes() {
    for (const text of this.notes) this.caption(text);
    this.notes = [];
  }

  private minute(minute: number) {
    const last = this.minutes[this.minutes.length - 1];
    this.minutes.push({ t: Math.max(this.now, last.t), minute: Math.max(minute, last.minute) });
  }

  private scored(side: Side, text: string | null, scorer: number | null = null) {
    this.goals = { ...this.goals, [side]: this.goals[side] + 1 };
    this.scores.push({ t: this.now, ...this.goals });
    this.caption(text ?? "Gól!", "goal", [scorer]);
  }

  // ── Míč ──

  private fly(to: Point, h: number, arc: number, seconds: number, receiver: number | null) {
    const k0 = this.k - 1;
    this.ball = { kind: "flight", from: { x: this.bx, z: this.bz, h: this.bh }, to: { ...to, h }, arc, k0, k1: k0 + Math.max(1, Math.round(seconds * REPLAY_HZ)), receiver };
    this.runUntil(() => this.ball.kind !== "flight", seconds + 1);
  }

  private eta(i: number, p: Point): number {
    // Rozběh i brzdění se zrychlením ACCEL (viz move).
    const d = dist(this.actors[i], p);
    return d < (SPRINT * SPRINT) / ACCEL ? 2 * Math.sqrt(d / ACCEL) : d / SPRINT + SPRINT / ACCEL;
  }

  /** Přihrávka: míč letí na místo a příjemce si pro něj doběhne; míč skončí u jeho nohy. */
  private pass(receiver: number, spot: Point, opts: { arc?: number; h?: number; speed?: number } = {}) {
    const d = dist({ x: this.bx, z: this.bz }, spot);
    const seconds = clamp(Math.max(d / (opts.speed ?? 15), this.eta(receiver, spot)), 0.4, 3);
    this.freeAll(receiver);
    this.send(receiver, spot);
    this.fly(spot, opts.h ?? 0, opts.arc ?? 0, seconds, receiver);
  }

  /** Vedení míče: hráč s míčem běží na místo. */
  private carry(i: number, to: Point, minSeconds: number, speed = JOG + 1) {
    const start = this.k;
    this.send(i, to, speed);
    this.runUntil(() => this.k - start >= minSeconds * REPLAY_HZ && dist(this.actors[i], to) < 0.5, Math.max(minSeconds, 5));
  }

  /** Mrtvý míč doletí na místo rozehrávky (výkop, roh, penalta…). */
  private placeBall(to: Point) {
    this.freeAll();
    this.ball = { kind: "rest" };
    const d = dist({ x: this.bx, z: this.bz }, to);
    if (d > 0.05) this.fly(to, 0, Math.min(4, d * 0.12), Math.max(0.4, d / 14), null);
  }

  /** Míč má hráč týmu: ležící si nejbližší doběhne, soupeři ho vezme přihrávkou mimo. */
  private takeBall(side: Side, who: number | null = null): number | null {
    const b = this.ball;
    if (b.kind === "held" && this.actors[b.owner].side === side && (who === null || who === b.owner)) return b.owner;
    const ballPos = { x: this.bx, z: this.bz };
    const taker = who ?? this.nearest(side, ballPos, b.kind !== "rest" || dist(ballPos, { x: 0, z: this.goalZ(other(side)) }) > 14);
    if (taker === null) return null;
    if (b.kind === "held") {
      this.pass(taker, toward(this.actors[taker], ballPos, Math.min(4, dist(this.actors[taker], ballPos) / 2)));
      return taker;
    }
    const a = this.actors[taker];
    const at = toward(ballPos, a, 0.5);
    this.send(taker, at);
    this.runUntil(() => dist(a, at) < 0.1 && Math.hypot(a.vx, a.vz) < 1, 10);
    const d = dist(a, ballPos) || 1;
    a.dirX = (ballPos.x - a.x) / d;
    a.dirZ = (ballPos.z - a.z) / d;
    this.ball = { kind: "held", owner: taker };
    return taker;
  }

  // ── Události ──

  private playGroup([head, ...rest]: number[]) {
    const events = this.pendingEvents;
    const e = events[head];
    const side = sideOfTeam(e.teamId);
    const find = (type: string) => rest.find((i) => events[i].type === type);
    const textOf = (i: number | undefined) => (i === undefined ? null : this.text(i));
    const goalsBefore = this.goals.home + this.goals.away;
    this.freeAll();

    switch (e.type) {
      case "goal": {
        const counter = e.source === "counter";
        this.buildUp(e.minute, counter ? other(side) : side, counter ? 0.6 : 0.55);
        const assist = find("assist");
        this.openPlayShot(e, side, this.actor(events[assist ?? -1]), "goal", this.text(head), textOf(assist));
        break;
      }
      case "chance": {
        this.buildUp(e.minute, side, 0.55);
        const block = rest.find((i) => events[i].detail === "block");
        this.openPlayShot(e, side, null, chanceResult(e), this.text(head), textOf(rest[0]), this.actor(events[block ?? -1]));
        break;
      }
      case "corner":
      case "freekick": {
        this.buildUp(e.minute, side, 0.72);
        const finisher = find("goal") ?? find("chance");
        const result = finisher === undefined ? null : events[finisher].type === "goal" ? "goal" : chanceResult(events[finisher]);
        if (e.type === "freekick" && e.detail === "direct") {
          const gz = this.goalZ(side);
          const spot = { x: (this.rng() - 0.5) * 14, z: gz - Math.sign(gz) * (19 + this.rng() * 3) };
          this.placedShot(e, side, spot, result ?? "wide", this.text(head), textOf(finisher));
        } else this.crossSetPiece(e, side, finisher === undefined ? undefined : events[finisher], result, this.text(head), textOf(finisher));
        break;
      }
      case "penalty": {
        this.buildUp(e.minute, side, 0.75);
        const finisher = find("goal") ?? find("chance");
        const result = finisher === undefined ? "wide" : events[finisher].type === "goal" ? "goal" : chanceResult(events[finisher]);
        const gz = this.goalZ(side);
        this.placedShot(e, side, { x: 0, z: gz - Math.sign(gz) * PENALTY_DIST }, result, this.text(head), textOf(finisher));
        break;
      }
      case "foul": {
        const card = find("card");
        // Drobné fauly jsou jen titulek, pokud z nich nepadla karta.
        if (e.detail === "petty" && card === undefined) return this.note(e, this.text(head));
        this.buildUp(e.minute, other(side), 0.5);
        this.foul(e, side, this.text(head), card === undefined ? null : { event: events[card], text: this.text(card) });
        break;
      }
      case "card":
        this.buildUp(e.minute, other(side), 0.5);
        this.card(e, this.text(head));
        break;
      case "injury": {
        this.buildUp(e.minute, this.possession, 0.5);
        const injured = this.injury(e, this.text(head));
        const sub = find("substitution");
        if (sub !== undefined) this.substitution(events[sub], this.text(sub), injured, sub);
        break;
      }
      case "substitution":
        this.buildUp(e.minute, this.possession, 0.5);
        this.substitution(e, this.text(head), null, head);
        break;
      default:
        if (e.detail === "half_time") this.halfTimeText = this.text(head);
        else if (e.detail === "full_time") this.fullTimeText = this.text(head);
        else {
          // Do brány jde hráč z pole (vyloučený brankář, nikdo na lavičce).
          if (e.detail === "emergency_gk") {
            const f = this.actor(e, true);
            if (f !== null) this.actors[f].role = "GK";
          }
          this.note(e, this.text(head));
        }
        return;
    }
    // Gól, který scéna nezobrazila (chybí střelec v datech), se aspoň započítá.
    const shown = this.goals.home + this.goals.away - goalsBefore;
    [head, ...rest].filter((i) => events[i].type === "goal").slice(shown).forEach((i) => this.scored(sideOfTeam(events[i].teamId), this.text(i)));
  }

  private note(e: MatchEvent, text: string) {
    if (text) this.notes.push(text);
    this.lastMinute = Math.max(this.lastMinute, e.minute);
  }

  /** Hra mezi událostmi: přihrávky týmu, který jde do další akce, míč se posouvá k jejímu místu. */
  private buildUp(minute: number, side: Side, targetU: number) {
    const seconds = clamp(Math.max((minute - this.lastMinute) * 1.1, this.notes.length * 2.4), 1.6, 12);
    this.setLayout({ kind: "play" }, side);
    this.minute(this.lastMinute);
    this.flushNotes();
    const end = this.k + seconds * REPLAY_HZ;
    const startU = worldToUv(side, this.half, { x: this.bx, z: this.bz }).u;
    if (this.takeBall(side) !== null) {
      while (this.k < end - 0.9 * REPLAY_HZ) {
        const progress = clamp((this.k - end) / (seconds * REPLAY_HZ) + 1, 0, 1);
        const desired = uvToWorld(side, this.half, lerp(startU, targetU, progress), (this.rng() * 2 - 1) * 0.7);
        const owner = this.ball.kind === "held" ? this.ball.owner : null;
        const candidates = this.onPitch(side).filter((f) => f !== owner && (this.actors[f].role !== "GK" || progress < 0.15));
        if (!candidates.length) break;
        const receiver = candidates.reduce((best, f) => (dist(this.actors[f], desired) < dist(this.actors[best], desired) ? f : best));
        const r = this.actors[receiver];
        this.pass(receiver, toward(r, desired, Math.min(5, dist(r, desired))));
        const z = this.bz + attackSign(side, this.half) * (2 + this.rng() * 3);
        this.carry(receiver, { x: clamp(this.bx + (this.rng() - 0.5) * 3, -HALF_W + 2, HALF_W - 2), z: clamp(z, -HALF_L + 3, HALF_L - 3) }, 0.4);
      }
    }
    this.lastMinute = minute;
    this.minute(minute);
  }

  /** Střela: míč letí na cíl, brankář reaguje, pak dohra podle výsledku. */
  private shot(side: Side, result: ShotResult, opts: { blocker?: number | null; speed?: number } = {}) {
    const gz = this.goalZ(side);
    const s = Math.sign(gz);
    const defending = other(side);
    const gk = this.keeper(defending);
    const from = { x: this.bx, z: this.bz };
    const flight = (to: Point) => clamp(dist(from, to) / (opts.speed ?? 24), 0.3, 1.4);
    const gkSpot = (x: number): Point => ({ x, z: gz - s * 0.8 });
    const dive = (x: number): Pose => (x > 0 ? "diveRight" : "diveLeft");
    this.freeAll();
    this.ball = { kind: "rest" };

    if (result === "goal") {
      const x = this.sign() * (1 + this.rng() * 2.3);
      if (gk !== null) {
        this.send(gk, gkSpot(-Math.sign(x) * 1.6));
        this.setPose(gk, dive(-Math.sign(x)), 1.6);
      }
      this.fly({ x, z: gz }, 0.3 + this.rng() * 1.7, 0.4, flight({ x, z: gz }), null);
      this.fly({ x: x * 0.9, z: gz + s * 1.3 }, 0.15, 0, 0.25, null);
      return;
    }
    if (result === "saved" && gk !== null) {
      const x = this.sign() * (0.4 + this.rng() * 2.2);
      if (Math.abs(x) > 1.2) this.setPose(gk, dive(x), 1.2);
      this.pass(gk, gkSpot(x), { h: 0.4 + this.rng() * 0.6, arc: 0.3, speed: opts.speed ?? 24 });
      this.runFor(1.1);
      return this.clearance(defending);
    }
    if (result === "post" || result === "bar") {
      const x = result === "post" ? this.sign() * GOAL_HALF_W : (this.rng() - 0.5) * 5;
      this.fly({ x, z: gz }, result === "bar" ? GOAL_H : 0.5 + this.rng() * 1.3, 0.4, flight({ x, z: gz }), null);
      const defender = this.teammate(defending, [], ["DEF"]);
      const rebound = { x: x * 1.6, z: gz - s * (7 + this.rng() * 4) };
      if (defender === null) return this.placeBall(rebound);
      this.pass(defender, rebound, { arc: result === "bar" ? 2.5 : 0.8, speed: 14 });
      return this.clearance(defending);
    }
    if (result === "blocked") {
      const blocker = opts.blocker ?? this.nearest(defending, from);
      if (blocker !== null) {
        const blockAt = toward(from, { x: 0, z: gz }, 2.2);
        this.send(blocker, blockAt);
        this.runUntil(() => dist(this.actors[blocker], blockAt) < 0.8, 1.2);
        this.pass(blocker, { x: this.actors[blocker].x, z: this.actors[blocker].z }, { h: 0.4, speed: 30 });
        this.runFor(0.3);
        return this.clearance(defending);
      }
    }
    // Vedle, nad (nebo „chycená“ střela bez brankáře): míč za lajnou, brankář rozehraje od malého vápna.
    const x = result === "over" ? (this.rng() - 0.5) * 6 : this.sign() * (GOAL_HALF_W + 0.8 + this.rng() * 3);
    this.fly({ x, z: gz }, result === "over" ? 3.3 : 0.4 + this.rng(), 0.5, flight({ x, z: gz }), null);
    this.fly({ x, z: gz + s * 3 }, 0.2, 0, 0.35, null);
    this.runFor(0.8);
    this.setLayout({ kind: "play" }, defending);
    this.placeBall({ x: this.sign() * 3, z: gz - s * 5 });
    if (this.takeBall(defending, gk) !== null) this.clearance(defending);
  }

  /** Odkop k vlastnímu hráči do středu hřiště. */
  private clearance(side: Side) {
    const owner = this.ball.kind === "held" ? this.ball.owner : null;
    const receiver = this.teammate(side, [owner], ["MID", "FWD"]);
    if (receiver === null || owner === null) return;
    this.pass(receiver, toward(this.actors[receiver], uvToWorld(side, this.half, 0.45, (this.rng() - 0.5) * 1.2), 6), { arc: 6, speed: 20 });
  }

  /** Gól: skóre, titulek, střelec slaví u rohového praporku, pak výkop soupeře. */
  private goalScored(scorer: number | null, side: Side, text: string | null, afterText: string | null) {
    this.scored(side, text, scorer);
    if (afterText) this.caption(afterText);
    const gz = this.goalZ(side);
    if (scorer !== null) {
      this.send(scorer, { x: Math.sign(this.actors[scorer].x || 1) * (HALF_W - 3), z: gz - Math.sign(gz) * 3 });
      this.setPose(scorer, "celebrate", 3.4);
    }
    this.runFor(3.4);
    this.freeAll();
    this.kickoff(other(side));
  }

  /** Výkop: míč doletí na střed, oba týmy se postaví do svých polovin. */
  private kickoff(side: Side) {
    this.setLayout({ kind: "kickoff" }, side);
    this.placeBall({ x: 0, z: 0 });
    this.runUntil(() => this.settled(), 10);
    this.takeBall(side, this.kickoffPair[0] ?? null);
  }

  private openPlayShot(e: MatchEvent, side: Side, assister: number | null, result: ShotResult, text: string, afterText: string | null, blocker: number | null = null) {
    const shooter = this.actor(e);
    if (shooter === null) return this.note(e, text);
    // U gólu se titulek ukáže až s gólem, ať se nic nevyzradí předem.
    if (result !== "goal") this.caption(text, undefined, [shooter]);
    const half = this.half;
    const shotU = e.source === "scramble" ? 0.9 : this.actors[shooter].role === "FWD" ? 0.83 : 0.78;
    const shotSpot = uvToWorld(side, half, shotU, clamp(worldToUv(side, half, this.actors[shooter]).v * 0.5, -0.35, 0.35));
    const helper = assister !== shooter ? assister ?? this.teammate(side, [shooter], ["MID", "FWD"]) : null;
    this.takeBall(side, e.source === "counter" ? null : helper ?? shooter);
    if (e.source === "counter" || helper === null) {
      // Brejk: zisk míče a sprint k bráně.
      if (this.ball.kind === "held" && this.ball.owner !== shooter) this.pass(shooter, toward(this.actors[shooter], shotSpot, 4), { speed: 14 });
    } else {
      const cross = e.source === "cross";
      const helperSpot = cross ? uvToWorld(side, half, 0.82, (Math.sign(worldToUv(side, half, this.actors[helper]).v) || this.sign()) * 0.9) : uvToWorld(side, half, 0.66, (this.rng() - 0.5) * 0.8);
      this.carry(helper, helperSpot, 0.8, SPRINT);
      this.pass(shooter, toward(this.actors[shooter], shotSpot, Math.min(dist(this.actors[shooter], shotSpot), 6)), cross ? { arc: 3, h: 1, speed: 17 } : {});
    }
    if (dist(this.actors[shooter], shotSpot) > 3) this.carry(shooter, shotSpot, 0.3, SPRINT);
    this.runFor(0.2);
    this.shot(side, result, { blocker });
    if (result === "goal") return this.goalScored(shooter, side, text, afterText);
    if (afterText) this.caption(afterText, undefined, [result === "saved" ? this.keeper(other(side)) : blocker]);
    this.runFor(0.4);
  }

  /** Roh nebo centr ze standardky: rozestavení do vápna, centr, hlavička (nebo obrana odhlavičkuje). */
  private crossSetPiece(e: MatchEvent, side: Side, finisherEvent: MatchEvent | undefined, result: ShotResult | null, text: string, finisherText: string | null) {
    const taker = this.actor(e);
    if (taker === null) return this.note(e, text);
    const finisher = finisherEvent ? this.actor(finisherEvent) : null;
    const gz = this.goalZ(side);
    const s = Math.sign(gz);
    const spot = e.type === "corner"
      ? { x: this.sign() * (HALF_W - 0.3), z: gz - s * 0.3 }
      : { x: this.sign() * (11 + this.rng() * 5), z: gz - s * (12 + this.rng() * 6) };
    this.caption(text, undefined, [taker]);
    this.setLayout({ kind: "box", attacker: side }, side);
    this.placeBall(spot);
    const target = { x: (this.rng() - 0.5) * 6, z: gz - s * (5 + this.rng() * 3) };
    if (finisher !== null && finisher !== taker) this.send(finisher, { x: target.x * 0.7, z: target.z - s * 3 });
    this.runUntil(() => this.settled(), 6);
    this.takeBall(side, taker);
    this.runFor(0.6);
    const cross = { arc: 4, h: 1.9, speed: 16 };
    if (finisher === null || finisher === taker || result === null) {
      const defender = this.nearest(other(side), target);
      if (defender !== null) {
        this.pass(defender, target, cross);
        this.clearance(other(side));
      }
      return;
    }
    this.pass(finisher, target, cross);
    this.shot(side, result, { speed: 18 });
    if (result === "goal") return this.goalScored(finisher, side, finisherText, null);
    if (finisherText) this.caption(finisherText, undefined, [finisher]);
    this.runFor(0.4);
  }

  /** Penalta nebo přímý kop: míč na místě, rozběh, střela. */
  private placedShot(e: MatchEvent, side: Side, spot: Point, result: ShotResult, text: string, afterText: string | null) {
    const kicker = this.actor(e);
    if (kicker === null) return this.note(e, text);
    const isPenalty = e.type === "penalty";
    this.caption(text, isPenalty ? "penalty" : undefined, [kicker]);
    this.setLayout(isPenalty ? { kind: "penalty", attacker: side } : { kind: "box", attacker: side }, side);
    this.placeBall(spot);
    const goal = { x: 0, z: this.goalZ(side) };
    const back = toward(spot, goal, -2.8);
    const runUp = { x: back.x + (goal.z - spot.z > 0 ? 1.2 : -1.2), z: back.z };
    this.send(kicker, runUp);
    this.runUntil(() => this.settled(), 8);
    this.runFor(0.6);
    this.takeBall(side, kicker);
    this.shot(side, result, { speed: isPenalty ? 26 : 20 });
    if (result === "goal") return this.goalScored(kicker, side, afterText, null);
    if (afterText) this.caption(afterText);
    this.runFor(0.4);
  }

  private foul(e: MatchEvent, side: Side, text: string, card: { event: MatchEvent; text: string } | null) {
    const fouler = this.actor(e);
    if (fouler === null) return this.note(e, text);
    this.caption(text, undefined, [fouler]);
    const owner = this.ball.kind === "held" ? this.ball.owner : null;
    // Faulovaný je hráč u míče, jinak nejbližší soupeř.
    const victim = owner !== null && this.actors[owner].side !== side ? owner : this.nearest(other(side), { x: this.bx, z: this.bz });
    const from = this.k;
    if (victim !== null) {
      const v = this.actors[victim];
      this.send(victim, { x: v.x, z: v.z });
      const contact = toward(v, this.actors[fouler], 0.6);
      this.send(fouler, contact);
      this.runUntil(() => dist(this.actors[fouler], contact) < 0.2, 4);
      this.setPose(victim, "down", 1.7);
    }
    this.ball = { kind: "rest" };
    this.setLayout({ kind: "play" }, other(side));
    const red = card?.event.detail === "red";
    this.runFor(0.8);
    if (card) this.caption(card.text, red ? "red" : "yellow", [fouler]);
    this.runFor(card ? 2.2 : 1);
    // Po faulu se dvojice rozestoupí až v další akci.
    if (victim !== null) this.fouls.push({ a: fouler, b: victim, from, to: this.k + 2 * REPLAY_HZ });
    this.lastMinute = e.minute;
    if (red) this.sendOff(card ? this.actor(card.event, true) ?? fouler : fouler);
  }

  private card(e: MatchEvent, text: string) {
    const figure = this.actor(e, true);
    this.caption(text, e.detail === "red" ? "red" : "yellow", [figure]);
    if (e.detail === "red" && figure !== null) this.sendOff(figure);
  }

  /** Vyloučený hráč odejde k nejbližší lajně a jeho místo zůstane prázdné. */
  private sendOff(figure: number) {
    this.freeAll();
    this.actors[figure].state = LEAVING;
    this.sentOff.push({ figure, tick: this.k });
    this.runFor(1.5);
  }

  private injury(e: MatchEvent, text: string): number | null {
    const figure = this.actor(e, true);
    if (figure === null) {
      this.note(e, text);
      return null;
    }
    this.caption(text, "injury", [figure]);
    this.ball = { kind: "rest" };
    this.setPose(figure, "down", 3.2);
    this.runFor(3.2);
    this.lastMinute = e.minute;
    return figure;
  }

  /** Střídání: odcházející jde k nejbližší lajně, nový hráč vběhne od střídaček na jeho místo. */
  private substitution(e: MatchEvent, text: string, injured: number | null, index: number) {
    const side = sideOfTeam(e.teamId);
    // „X za Y“, u vyloučeného brankáře „X jde do brány za vyloučeného gólmana, ven jde Y“.
    const outName = e.description?.match(/(?: za | ven jde )([^,]+)$/)?.[1]?.trim();
    const onPitch = this.onPitch(side);
    let outgoing = onPitch.find((f) => this.figures[f].player.name === outName) ?? (injured !== null && this.actors[injured].state === ON ? injured : null);
    if (outgoing === null) {
      // Jméno odcházejícího chybí: jde ten z pole, kdo už v zápase nic neudělá.
      const later = this.pendingEvents.slice(index + 1).filter((x) => sideOfTeam(x.teamId) === side);
      const idle = onPitch.filter((f) => this.actors[f].role !== "GK" && !later.some((x) => this.byId.get(`${side}:${x.playerId}`) === f));
      outgoing = idle[idle.length - 1] ?? null;
    }
    if (outgoing === null) return this.note(e, text);
    const incoming = this.benchByName(side, e.playerName);
    if (incoming === null) return this.note(e, text);
    this.used.add(incoming);
    this.byId.set(`${side}:${e.playerId}`, incoming);
    this.caption(text, "sub", [incoming, outgoing]);
    this.freeAll();
    this.ball = { kind: "rest" };
    const out = this.actors[outgoing];
    const inc = this.actors[incoming];
    Object.assign(inc, { ...BENCH_ENTRY, vx: 0, vz: 0, state: ON, slot: out.slot, anchor: null, script: null, role: e.description?.includes("do brány") || this.figures[incoming].player.position === "GK" ? "GK" : out.role });
    out.state = LEAVING;
    // Brankář běží do prázdné branky sprintem, hráč do pole klusem.
    if (inc.role === "GK") this.send(incoming, this.spot(inc, incoming, { x: this.bx, z: this.bz }));
    this.runUntil(() => dist(inc, inc.script ?? inc.anchor ?? BENCH_ENTRY) < 2, 8);
    this.lastMinute = e.minute;
  }

  private halfTime() {
    this.flushNotes();
    this.runUntil(() => this.actors.every((a) => a.state !== LEAVING), 8);
    this.minute(45);
    this.caption(this.halfTimeText ?? `Poločas ${this.goals.home}:${this.goals.away}`);
    this.runFor(1.5);
    // Přestávka je jediný střih: hráči stojí rovnou na místech pro výkop druhého poločasu.
    this.half = 2;
    this.lastMinute = 45;
    this.setLayout({ kind: "kickoff" }, "away");
    this.ball = { kind: "rest" };
    this.bx = this.bz = this.bh = 0;
    this.actors.forEach((a, i) => {
      if (a.state === LEAVING) a.state = OFF;
      if (a.state !== ON) return;
      Object.assign(a, this.spot(a, i, { x: 0, z: 0 }), { vx: 0, vz: 0, script: null, anchor: null, pose: 0, dirX: 0, dirZ: attackSign(a.side, 2) });
    });
    this.cut = this.k;
    this.runFor(2);
    this.minute(46);
    this.takeBall("away", this.kickoffPair[0] ?? null);
  }

  private fullTime() {
    this.flushNotes();
    this.ball = { kind: "rest" };
    // Po hvizdu všichni zastaví, kde jsou.
    this.freeAll();
    for (const a of this.actors) {
      const stop = Math.hypot(a.vx, a.vz) / (2 * ACCEL);
      a.anchor = { x: a.x + a.vx * stop, z: a.z + a.vz * stop };
    }
    this.runUntil(() => this.actors.every((a) => a.state !== LEAVING), 8);
    const final = this.input.score;
    this.minute(Math.max(90, this.lastMinute));
    if (final.home !== this.goals.home || final.away !== this.goals.away) this.scores.push({ t: this.now, ...final });
    const { home, away, shootout } = this.input;
    this.caption(this.fullTimeText ?? `Konec zápasu! ${home.name} ${final.home}:${final.away} ${away.name}`);
    if (shootout) this.caption(`Penalty ${shootout.home}:${shootout.away}`);
    this.runFor(4);
  }
}
