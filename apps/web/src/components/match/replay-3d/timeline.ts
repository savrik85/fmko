// Engine ukládá jen události po minutách bez souřadnic, proto se zápas odsimuluje po krocích 1/20 s; `sample(t)` jen prolíná
// sousední kroky, takže scéna kreslí přesně to, co měří testy. Náhoda z id zápasu vybírá jen kosmetiku, přehrání vypadá vždy stejně.
import type { MatchEvent } from "@okresni-masina/shared";
import { PITCH } from "../../stadium/stadium-3d/constants";

export const REPLAY_HZ = 20;
const DT = 1 / REPLAY_HZ;
export const HALF_W = PITCH.width / 2;
export const HALF_L = PITCH.depth / 2;
const SHAPE_HALF_W = HALF_W - 2;
const GOAL_HALF_W = 3.66, GOAL_H = 2.44;
export const BENCH_ENTRY = { x: -(HALF_W + 1), z: 0 };
/** m/s a m/s² v herním čase; do formace se jen klusá. */
const SPRINT = 7.5, JOG = 4.5, ACCEL = 5;
/** Formace se hráči posune až o tolik metrů, jinak stojí (necuká se s každou přihrávkou). */
const HYSTERESIS = 4;
const SPACING = 1.7, AVOID = 1.4, LOOK_AHEAD = 0.4, CLOSE = 0.9;
/** Ležící hráč je dlouhý jako on, zabírá víc místa. */
const LYING = 1;
/** Soupeř stojí u rozehrávky aspoň tak daleko od míče (pravidla). */
const DEAD_BALL_GAP = 4;
export const CAPTION_GAP = 1.5;
/** Titulek o konkrétním hráči visí déle, ať je vidět, o koho jde. */
const FOCUS_GAP = 3;
const POSES = ["run", "down", "diveLeft", "diveRight", "celebrate"] as const;
export const OFF = 0, ON = 1, LEAVING = 2;

export type Side = "home" | "away";
type Role = "GK" | "DEF" | "MID" | "FWD";
export type Pose = (typeof POSES)[number];
type Banner = "goal" | "penalty" | "yellow" | "red" | "injury" | "sub";
type ShotResult = "goal" | "saved" | "post" | "bar" | "wide" | "over" | "blocked";
interface Score { home: number; away: number }

export interface ReplayPlayer { id: string; name: string; position: string; skinColor?: string; hairColor?: string | null; height?: number }
export interface ReplayKit { shirt: string; shorts: string; socks: string }
export interface ReplayTeam { name: string; kit: ReplayKit; starters: ReplayPlayer[]; subs: ReplayPlayer[] }
export interface ReplayInput { matchId: string; events: MatchEvent[]; commentary: string[]; home: ReplayTeam; away: ReplayTeam; score: Score; shootout?: Score | null }

export interface Figure { side: Side; player: ReplayPlayer }
interface Caption { t: number; text: string; banner?: Banner; figures: number[] }
interface Point { x: number; z: number }
interface SlotBase { u: number; v: number; role: Role }
type Layout = { kind: "play" | "kickoff" } | { kind: "box" | "penalty"; attacker: Side };
type Ball = { kind: "held"; owner: number } | { kind: "rest" }
  | { kind: "flight"; from: Point & { h: number }; to: Point & { h: number }; arc: number; k0: number; k1: number; receiver: number | null };

interface Actor extends Point {
  side: Side; role: Role; state: number; slot: number;
  vx: number; vz: number;
  /** Kam hráč naposled běžel; míč u nohy má před sebou. */
  dirX: number; dirZ: number;
  /** Místo ze scénáře; null = hráč patří do formace. */
  script: Point | null; speed: number;
  anchor: Point | null;
  pose: number; poseFrom: number; poseUntil: number;
}

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
const lerp = (a: number, b: number, s: number) => a + (b - a) * s;
const dist = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.z - b.z);
const other = (side: Side): Side => (side === "home" ? "away" : "home");
const sideOfTeam = (teamId: number): Side => (teamId === 1 ? "home" : "away");
const toRole = (position: string): Role => (position === "GK" || position === "DEF" || position === "FWD" ? position : "MID");
/** Domácí útočí v 1. poločase k záporné z, po přestávce se strany mění. */
export const attackSign = (side: Side, half: 1 | 2): 1 | -1 => ((side === "home") === (half === 1) ? -1 : 1);
const fract = (n: number) => n - Math.floor(n);
const hash01 = (n: number) => fract(Math.sin(n * 127.1 + 311.7) * 43758.5453);
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

/** u = 0 vlastní branka, 1 soupeřova; v = -1..1 napříč hřištěm. */
function uvToWorld(side: Side, half: 1 | 2, u: number, v: number): Point {
  const s = attackSign(side, half);
  return { x: s * v * SHAPE_HALF_W, z: s * (u - 0.5) * PITCH.depth };
}

function worldToUv(side: Side, half: 1 | 2, p: Point): { u: number; v: number } {
  const s = attackSign(side, half);
  return { u: p.z / (s * PITCH.depth) + 0.5, v: p.x / (s * SHAPE_HALF_W) };
}

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

const DETAIL_RESULTS = new Map<string | undefined, ShotResult>([
  ["vedle", "wide"], ["břevno", "bar"], ["tyč", "post"], ["chytil brankář", "saved"], ["zblokováno", "blocked"],
  ["penalty_saved", "saved"], ["penalty_missed", "wide"],
]);

/** U standardek engine výsledek neukládá, pozná se jen z textu. */
function chanceResult(e: MatchEvent): ShotResult {
  const d = e.description ?? "";
  return DETAIL_RESULTS.get(e.detail) ?? (/do zdi|zblokováno/.test(d) ? "blocked" : d.includes("nad břevno") ? "over" : /chytil brankář|vyráží/.test(d) ? "saved" : "wide");
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

/** Pole hráčů jsou [krok * počet hráčů + hráč], `owner` -1 = míč nemá nikdo u nohy. */
export type ReplaySamples = ReturnType<Simulation["bake"]>;

export class ReplayPlan {
  readonly home: ReplayTeam;
  readonly away: ReplayTeam;
  readonly shootout: Score | null;
  readonly figures: Figure[];
  readonly samples: ReplaySamples;
  readonly duration: number;
  private readonly captions: Caption[];
  private readonly scores: (Score & { t: number })[];
  private readonly minutes: { t: number; minute: number }[];

  constructor(input: ReplayInput) {
    const sim = new Simulation(input);
    this.home = input.home;
    this.away = input.away;
    this.shootout = input.shootout ?? null;
    this.figures = sim.figures;
    this.samples = sim.bake();
    this.captions = sim.captions;
    this.scores = sim.scores;
    this.minutes = sim.minutes;
    this.duration = (this.samples.ticks - 1) * DT;
  }

  createFrame() {
    const figures = this.figures.map(() => ({ visible: false, x: 0, z: 0, pose: "run" as Pose, keeper: false }));
    return { ballX: 0, ballY: 0, ballZ: 0, figures };
  }

  sample(t: number, out: ReturnType<ReplayPlan["createFrame"]>): void {
    const s = this.samples;
    const f = clamp(t * REPLAY_HZ, 0, s.ticks - 1);
    const k0 = Math.floor(f);
    const k1 = Math.min(k0 + 1, s.ticks - 1);
    const a = k1 === s.cut ? 0 : f - k0;
    const n = this.figures.length;
    out.figures.forEach((fig, i) => {
      const i0 = k0 * n + i, i1 = k1 * n + i;
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

  scoreAt(t: number): Score { return this.scores.findLast((k) => k.t <= t) ?? this.scores[0]; }
  minuteAt(t: number): number {
    const i = this.minutes.findLastIndex((k) => k.t <= t);
    if (i < 0) return 0;
    const key = this.minutes[i], next = this.minutes[i + 1];
    return next ? Math.floor(lerp(key.minute, next.minute, (t - key.t) / Math.max(0.001, next.t - key.t))) : key.minute;
  }

  /** Nejdéle 5 s, ať titulek nepřetrvá do další akce. */
  captionAt(t: number): Caption | null {
    const c = this.captions.findLast((k) => k.t <= t);
    return c && t - c.t < 5 ? c : null;
  }
  captionTimes(): number[] { return this.captions.map((c) => c.t); }
}

class Simulation {
  readonly figures: Figure[] = [];
  readonly captions: Caption[] = [];
  readonly scores: (Score & { t: number })[] = [{ t: 0, home: 0, away: 0 }];
  readonly minutes = [{ t: 0, minute: 0 }];
  private readonly actors: Actor[] = [];
  private readonly rec: Record<"x" | "z" | "state" | "pose" | "keeper" | "bx" | "bz" | "bh" | "owner", number[]> =
    { x: [], z: [], state: [], pose: [], keeper: [], bx: [], bz: [], bh: [], owner: [] };
  /** Faulující a faulovaný smí být v krocích from–to těsně u sebe. */
  private readonly fouls: { a: number; b: number; from: number; to: number }[] = [];
  private readonly sentOff: { figure: number; tick: number }[] = [];
  private readonly bases: Record<Side, SlotBase[]>;
  /** Engine id hráče („home:7“) → figura. */
  private readonly byId = new Map<string, number>();
  private readonly used = new Set<number>();
  private readonly rng: () => number;
  private readonly events: MatchEvent[];
  private readonly text: (i: number) => string;
  private k = 0;
  /** Krok, kterým začíná druhý poločas (jediný střih v záznamu). */
  private cut = -1;
  /** Faulující a faulovaný se srazí, jinak se hráči vyhýbají. */
  private contact: number[] = [];
  private half: 1 | 2 = 1;
  private possession: Side = "home";
  private layout: Layout = { kind: "kickoff" };
  private relayout = true;
  private kickoffPair: number[] = [];
  private ball: Ball = { kind: "rest" };
  /** Poloha míče; vždy se přiřadí nový objekt, takže uložený odkaz zůstane snímkem. */
  private ballAt = { x: 0, z: 0, h: 0 };
  private goals: Score = { home: 0, away: 0 };
  private lastMinute = 0;
  /** Titulky bez vlastní akce (rozhodčí, počasí…) se ukážou během další hry. */
  private notes: string[] = [];
  private halfTimeText: string | null = null;
  private fullTimeText: string | null = null;

  constructor(private readonly input: ReplayInput) {
    this.rng = seededRng(input.matchId);
    this.bases = { home: slotBases(input.home.starters), away: slotBases(input.away.starters) };
    this.caption("Výkop!");
    for (const side of ["home", "away"] as const) {
      const team = input[side];
      const n = team.starters.length;
      team.starters.forEach((player, slot) => this.byId.set(`${side}:${slot + (side === "home" ? 1 : 101)}`, this.addFigure(side, player, slot, ON)));
      for (const player of team.subs) this.addFigure(side, player, 0, OFF);
      if (n < 11) this.caption(`${team.name} nastupuje jen v počtu ${n} ${n === 1 ? "hráče" : "hráčů"}.`);
    }
    // Náhradník, který v uložené lavičce chybí (starší pohár a turnaj), dostane figuru bez vzhledu.
    for (const e of input.events.filter((x) => x.type === "substitution")) {
      const side = sideOfTeam(e.teamId);
      const player = { id: `sub-${side}-${e.playerId}`, name: e.playerName ?? "", position: "MID" };
      if (this.benchByName(side, e.playerName) === null) this.addFigure(side, player, 0, OFF);
    }
    // Pořadí podle minut (stabilně); poločas se pozná podle minuty, ne podle události „poločas“.
    const { events, commentary } = input;
    const order = events.map((_, i) => i).sort((a, b) => events[a].minute - events[b].minute || a - b);
    this.events = order.map((i) => events[i]);
    // Komentář jde po řádcích s událostmi; výtržnosti fanoušků (fans:*) vlastní řádek nemají.
    const fans = (e: MatchEvent) => !!e.detail?.startsWith("fans:");
    const line = events.map((_, i) => i - events.slice(0, i).filter(fans).length);
    this.text = (i) => ((fans(this.events[i]) ? undefined : commentary[line[order[i]]]) ?? this.events[i].description ?? "").replace(/^\d+'\s*[—-]\s*/, "");
    this.setLayout({ kind: "kickoff" }, "home");
    this.actors.forEach((a, i) => {
      if (a.state === ON) Object.assign(a, this.spot(a, i, { x: 0, z: 0 }));
    });
    this.run(1.5);
    this.takeBall("home", this.kickoffPair[0] ?? null);
    for (const group of groupEvents(this.events)) {
      if (this.events[group[0]].minute > 45 && this.half === 1) this.halfTime();
      this.playGroup(group);
    }
    if (this.half === 1) this.halfTime();
    this.fullTime();
  }

  private addFigure(side: Side, player: ReplayPlayer, slot: number, state: number): number {
    this.figures.push({ side, player });
    this.actors.push({ side, role: toRole(player.position), slot, state, ...BENCH_ENTRY, vx: 0, vz: 0, dirX: 0, dirZ: attackSign(side, 1),
      script: null, speed: JOG, anchor: null, pose: 0, poseFrom: 0, poseUntil: 0 });
    return this.actors.length - 1;
  }

  bake() {
    const r = this.rec;
    return {
      ticks: this.k, cut: this.cut, fouls: this.fouls, sentOff: this.sentOff, owner: Int16Array.from(r.owner),
      x: Float32Array.from(r.x), z: Float32Array.from(r.z), state: Uint8Array.from(r.state), pose: Uint8Array.from(r.pose),
      keeper: Uint8Array.from(r.keeper), ballX: Float32Array.from(r.bx), ballZ: Float32Array.from(r.bz), ballH: Float32Array.from(r.bh),
    };
  }

  private tick() {
    const focus = this.ball.kind === "flight" ? this.ball.to : this.ballAt;
    const targets = this.actors.map((a, i): Point | null => {
      if (a.pose && this.k >= a.poseUntil) a.pose = 0;
      if (a.state === OFF) return null;
      if (a.state === LEAVING) return { x: Math.sign(a.x || 1) * (HALF_W + 1), z: a.z };
      if (a.pose === 1) return a;
      if (a.script) return a.script;
      const spot = this.spot(a, i, focus);
      if (this.relayout || !a.anchor || dist(spot, a.anchor) > (a.role === "GK" ? 2.5 : HYSTERESIS)) a.anchor = spot;
      return { ...a.anchor };
    });
    this.relayout = false;
    // Stojící hráči si rozestoupí místa (po dvojicích, pár kol); místa ze scénáře se nehýbou, soupeř ustoupí od míče u rozehrávky.
    const idle = this.actors.map((a) => a.state === ON && !a.script && a.pose !== 1);
    const ball = this.ballAt;
    for (let round = 0; round < 4; round++) {
      targets.forEach((p, i) => {
        if (!idle[i] || !p) return;
        targets.forEach((q, j) => {
          if (!q || j === i || (idle[j] && j < i)) return;
          const d = dist(p, q);
          const room = SPACING + (this.lying(this.actors[j]) ? LYING : 0);
          if (d >= room) return;
          const push = (room - d) / (idle[j] ? 2 : 1);
          const nx = d < 0.01 ? Math.cos(i) : (p.x - q.x) / d, nz = d < 0.01 ? Math.sin(i) : (p.z - q.z) / d;
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
      if (idle[i] && p) this.actors[i].anchor = targets[i] = { x: clamp(p.x, -HALF_W + 0.5, HALF_W - 0.5), z: clamp(p.z, -HALF_L + 0.5, HALF_L - 0.5) };
    });
    this.actors.forEach((a, i) => {
      const t = targets[i];
      if (!t) return;
      const avoid = this.actors.filter((b, j) => b !== a && b.state !== OFF && dist(a, b) < 4 && !(this.contact.includes(i) && this.contact.includes(j)));
      this.move(a, t, a.script ? a.speed : a.state === LEAVING ? JOG * 0.8 : this.layout.kind === "penalty" ? SPRINT : JOG, avoid);
      if (a.state === LEAVING && Math.abs(a.x) >= HALF_W + 0.9) a.state = OFF;
    });
    this.moveBall();
    this.record();
  }

  /** Krok k cíli: zrychlení nejvýš ACCEL, před cílem brzdí tak, aby po krocích s úbytkem rychlosti ACCEL·DT zastavil přesně na místě. */
  private move(a: Actor, t: Point, vmax: number, avoid: Actor[]) {
    const dx = t.x - a.x, dz = t.z - a.z;
    const d = Math.hypot(dx, dz);
    const v = d < 1e-4 ? 0 : Math.min(vmax, ACCEL * DT * (Math.sqrt((2 * d) / (ACCEL * DT * DT) + 0.25) - 0.5));
    let wx = d < 1e-4 ? 0 : (dx / d) * v, wz = d < 1e-4 ? 0 : (dz / d) * v;
    // Stojící hráč neuhýbá; kdo běží, obejde ho po straně blíž ke svému cíli (dva v pohybu se tak minou).
    const standing = d < 0.3 && Math.hypot(a.vx, a.vz) < 0.5;
    for (const b of avoid) {
      if (standing && Math.hypot(b.vx, b.vz) > 0.5 && dist(a, b) > CLOSE) continue;
      // Kde budou oba za chvíli; kdo je už teď těsně u druhého, ustoupí přímo od něj.
      const lying = this.lying(b) ? LYING : 0;
      const now = Math.max(0.05, dist(a, b) - lying);
      if (now < CLOSE) {
        wx += ((a.x - b.x) / now) * (CLOSE - now) * 20;
        wz += ((a.z - b.z) / now) * (CLOSE - now) * 20;
      }
      const rx = a.x + a.vx * LOOK_AHEAD - b.x - b.vx * LOOK_AHEAD, rz = a.z + a.vz * LOOK_AHEAD - b.z - b.vz * LOOK_AHEAD;
      const gap = Math.max(0.05, Math.hypot(rx, rz) - lying);
      if (gap >= AVOID) continue;
      const nx = rx / gap, nz = rz / gap;
      const side = -nz * dx + nx * dz < 0 ? -0.8 : 0.8;
      wx += (nx - nz * side) * (AVOID - gap) * 12;
      wz += (nz + nx * side) * (AVOID - gap) * 12;
    }
    // Úhyb nesmí hráče rozběhnout nad sprint.
    const w = Math.hypot(wx, wz);
    if (w > SPRINT) {
      wx *= SPRINT / w;
      wz *= SPRINT / w;
    }
    const ax = (wx - a.vx) / DT, az = (wz - a.vz) / DT;
    const limit = Math.min(1, ACCEL / Math.hypot(ax, az));
    a.vx += ax * limit * DT;
    a.vz += az * limit * DT;
    a.x += a.vx * DT;
    a.z += a.vz * DT;
    const speed = Math.hypot(a.vx, a.vz);
    if (speed > 1) Object.assign(a, { dirX: a.vx / speed, dirZ: a.vz / speed });
  }

  private moveBall() {
    const b = this.ball;
    if (b.kind === "held") {
      // Míč přijatý ve výšce (hlavička, chycení) klesá k zemi postupně.
      this.ballAt = { ...this.atFoot(b.owner), h: Math.max(0, this.ballAt.h - 4 * DT) };
    } else if (b.kind === "flight") {
      const s = clamp((this.k - b.k0) / (b.k1 - b.k0), 0, 1);
      this.ballAt = { x: lerp(b.from.x, b.to.x, s), z: lerp(b.from.z, b.to.z, s), h: lerp(b.from.h, b.to.h, s) + b.arc * 4 * s * (1 - s) };
      if (this.k < b.k1) return;
      if (b.receiver === null) {
        this.ball = { kind: "rest" };
        return;
      }
      // Míč doletí k příjemci tam, kde opravdu je: dráhu letu přepočítáme na jeho skutečné místo.
      const end = this.atFoot(b.receiver);
      for (let k = b.k0 + 1; k < b.k1; k++) {
        const s2 = (k - b.k0) / (b.k1 - b.k0);
        this.rec.bx[k] = lerp(b.from.x, end.x, s2);
        this.rec.bz[k] = lerp(b.from.z, end.z, s2);
      }
      this.ball = { kind: "held", owner: b.receiver };
      this.ballAt = { ...end, h: this.ballAt.h };
    }
  }

  private record() {
    const r = this.rec;
    for (const a of this.actors) {
      r.x.push(a.x);
      r.z.push(a.z);
      r.state.push(a.state);
      r.pose.push(a.state === OFF || this.k < a.poseFrom ? 0 : a.pose);
      r.keeper.push(a.role === "GK" ? 1 : 0);
    }
    r.bx.push(this.ballAt.x);
    r.bz.push(this.ballAt.z);
    r.bh.push(this.ballAt.h);
    r.owner.push(this.ball.kind === "held" ? this.ball.owner : -1);
    this.k++;
  }

  private run(seconds: number, done = () => false) {
    const end = this.k + Math.round(seconds * REPLAY_HZ);
    while (this.k < end && !done()) this.tick();
  }

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

  /** Kam hráč patří podle míče, držení a situace; brankář podle své role, ne podle místa. */
  private spot(a: Actor, i: number, ball: Point): Point {
    const { side } = a;
    const base = this.base(a);
    const seed = a.slot * 1.7 + (side === "home" ? 0 : 0.9);
    const b = worldToUv(side, this.half, ball);
    const L = this.layout;
    let u: number, v: number;
    if (a.role === "GK") {
      const attacking = (L.kind === "box" || L.kind === "penalty") && side === L.attacker;
      u = L.kind === "penalty" && !attacking ? 0.005 : attacking ? 0.12 : 0.03 + clamp((b.u - 0.3) * 0.08, 0, 0.06);
      v = L.kind === "penalty" ? 0 : clamp(b.v * 0.2, -0.15, 0.15);
    } else if (L.kind === "kickoff") {
      const pair = this.kickoffPair.indexOf(i);
      if (side === this.possession && pair >= 0) return { x: pair * 2.5, z: -attackSign(side, this.half) * (pair ? 0.4 : 0.5) };
      u = side === this.possession ? Math.min(base.u * 0.85, 0.44) : 0.1 + base.u * 0.45;
      v = base.v;
    } else if (L.kind === "penalty") {
      // Za vápnem v oblouku kolem penaltového bodu, oba týmy promíchaně.
      const gz = attackSign(L.attacker, this.half) * HALF_L;
      const r = 19.5 + 3.5 * hash01(seed * 2.3);
      const angle = -1.1 + 2.2 * hash01(seed * 3.7);
      return { x: r * Math.sin(angle), z: gz - Math.sign(gz) * r * Math.cos(angle) };
    } else if (L.kind === "box") {
      // Roh a centr: útočníci a stopeři ve vápně, krajní obránci vzadu; bránící ve vlastním vápně, útočník nahoře.
      const attacking = side === L.attacker;
      const staysBack = attacking ? base.role === "DEF" && Math.abs(base.v) >= 0.5 : base.role === "FWD";
      u = staysBack ? (attacking ? 0.52 : 0.38) : attacking ? 0.8 + 0.1 * hash01(seed) : 0.05 + 0.13 * hash01(seed * 3.1);
      v = staysBack ? base.v * 0.6 : (-0.5 + hash01(seed * 5.7)) * 0.7;
    } else {
      const shift = (b.u - 0.5) * 0.5 + (this.possession === side ? 0.06 : -0.06);
      u = clamp(base.u + shift, 0.08, 0.92);
      v = clamp(base.v * 0.85 + b.v * 0.3, -1.05, 1.05);
    }
    return uvToWorld(side, this.half, u, v);
  }

  private get now() { return this.k * DT; }
  private base(a: Actor): SlotBase { return this.bases[a.side][a.slot]; }
  private atFoot(i: number): Point { return { x: this.actors[i].x + this.actors[i].dirX * 0.5, z: this.actors[i].z + this.actors[i].dirZ * 0.5 }; }
  private onPitch(side: Side): number[] { return this.actors.flatMap((a, i) => (a.side === side && a.state === ON ? [i] : [])); }
  private keeper(side: Side): number | null { return this.onPitch(side).find((f) => this.actors[f].role === "GK") ?? null; }
  private send(i: number, to: Point, speed = SPRINT) { Object.assign(this.actors[i], { script: to, speed }); }
  private settled() { return this.actors.every((a) => a.state !== ON || (Math.hypot(a.vx, a.vz) < 0.3 && dist(a, a.script ?? a.anchor ?? a) < 1)); }
  private goalZ(side: Side) { return attackSign(side, this.half) * HALF_L; }
  private sign() { return this.rng() < 0.5 ? -1 : 1; }
  /** Další akce počká, až se dočtou titulky té předchozí (jinak by titulky utíkaly za děním). */
  private drain() { this.run(15, () => this.now >= this.captionFree()); }

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

  /** Kdo na hřišti není (nesoulad v datech), toho zastoupí spoluhráč; akci v poli za brankáře odehraje spoluhráč. */
  private actor(e: MatchEvent | undefined, keeperOk = false): number | null {
    if (!e) return null;
    const side = sideOfTeam(e.teamId);
    const f = this.byId.get(`${side}:${e.playerId}`) ?? this.benchByName(side, e.playerName);
    if (f !== null && this.actors[f].state === ON && (keeperOk || this.actors[f].role !== "GK")) return f;
    return this.teammate(side, [], f !== null ? [this.actors[f].role] : ["MID", "FWD"]);
  }

  private benchByName(side: Side, name: string | undefined): number | null {
    const i = this.figures.findIndex((f, j) => f.side === side && f.player.name === name && this.actors[j].state === OFF && !this.used.has(j));
    return i >= 0 ? i : null;
  }

  /** Zpět do formace; hráč stojí, dokud se formace nepohne. */
  private freeAll(keep: number | null = null) {
    this.actors.forEach((a, i) => {
      if (a.script && i !== keep) Object.assign(a, { script: null, anchor: { x: a.x, z: a.z } });
    });
  }

  /** `delay`: brankář skočí, až když míč přilétá. */
  private setPose(i: number, pose: Pose, seconds: number, delay = 0) {
    const a = this.actors[i];
    a.pose = POSES.indexOf(pose);
    a.poseFrom = this.k + Math.round(Math.max(0, delay) * REPLAY_HZ);
    a.poseUntil = a.poseFrom + Math.round(seconds * REPLAY_HZ);
  }
  /** Leží na zemi (faulovaný, zraněný, brankář po skoku). */
  private lying(a: Actor) { return a.pose >= 1 && a.pose <= 3 && this.k >= a.poseFrom; }
  /** Míč od padlého hráče odskočí kousek dál, ať mu neleží na těle. */
  private looseBall(from: Point) {
    this.ball = { kind: "rest" };
    this.fly(toward(from, this.ballAt, 2.8), 0, 0.3, 0.5);
  }

  /** Titulky jdou do fronty, ať se dají přečíst; titulek o hráči počká i s děním, ať se ukáže s ním; gól hned. */
  private caption(text: string, banner?: Banner, figures: (number | null)[] = []) {
    const about = figures.filter((f): f is number => f !== null);
    if (about.length && banner !== "goal") this.drain();
    this.captions.push({ t: banner === "goal" ? this.now : Math.max(this.now, this.captionFree()), text, banner, figures: about });
  }

  private captionFree() {
    const last = this.captions[this.captions.length - 1];
    return last ? last.t + (last.figures.length ? FOCUS_GAP : CAPTION_GAP) : 0;
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

  private fly(to: Point, h: number, arc: number, seconds: number, receiver: number | null = null) {
    const k0 = this.k - 1;
    this.ball = { kind: "flight", from: this.ballAt, to: { ...to, h }, arc, k0, k1: k0 + Math.max(1, Math.round(seconds * REPLAY_HZ)), receiver };
    this.run(seconds + 1, () => this.ball.kind !== "flight");
  }

  private pass(receiver: number, spot: Point, opts: { arc?: number; h?: number; speed?: number } = {}) {
    const d = dist(this.ballAt, spot);
    // Kdy tam příjemce doběhne: rozběh i brzdění se zrychlením ACCEL (viz move).
    const toGo = dist(this.actors[receiver], spot);
    const eta = toGo < (SPRINT * SPRINT) / ACCEL ? 2 * Math.sqrt(toGo / ACCEL) : toGo / SPRINT + SPRINT / ACCEL;
    const seconds = clamp(Math.max(d / (opts.speed ?? 15), eta), 0.4, 3);
    this.freeAll(receiver);
    this.send(receiver, spot);
    this.fly(spot, opts.h ?? 0, opts.arc ?? 0, seconds, receiver);
  }

  private carry(i: number, to: Point, minSeconds: number, speed = JOG + 1) {
    const start = this.k;
    this.send(i, to, speed);
    this.run(Math.max(minSeconds, 5), () => this.k - start >= minSeconds * REPLAY_HZ && dist(this.actors[i], to) < 0.5);
  }

  private placeBall(to: Point, keep: number | null = null) {
    this.freeAll(keep);
    this.ball = { kind: "rest" };
    const d = dist(this.ballAt, to);
    if (d > 0.05) this.fly(to, 0, Math.min(4, d * 0.12), Math.max(0.4, d / 14));
  }

  /** Míč má hráč týmu: ležící si nejbližší doběhne, soupeři ho vezme přihrávkou mimo. */
  private takeBall(side: Side, who: number | null = null): number | null {
    const b = this.ball;
    if (b.kind === "held" && this.actors[b.owner].side === side && (who === null || who === b.owner)) return b.owner;
    const ballPos = this.ballAt;
    const taker = who ?? this.nearest(side, ballPos, b.kind !== "rest" || dist(ballPos, { x: 0, z: this.goalZ(other(side)) }) > 14);
    if (taker === null) return null;
    if (b.kind === "held") {
      this.pass(taker, toward(this.actors[taker], ballPos, Math.min(4, dist(this.actors[taker], ballPos) / 2)));
      return taker;
    }
    const a = this.actors[taker];
    const at = toward(ballPos, a, 0.5);
    this.send(taker, at);
    this.run(10, () => dist(a, at) < 0.1 && Math.hypot(a.vx, a.vz) < 1);
    const d = dist(a, ballPos) || 1;
    Object.assign(a, { dirX: (ballPos.x - a.x) / d, dirZ: (ballPos.z - a.z) / d });
    this.ball = { kind: "held", owner: taker };
    return taker;
  }

  private playGroup([head, ...rest]: number[]) {
    const events = this.events;
    const e = events[head];
    const side = sideOfTeam(e.teamId);
    const text = this.text(head);
    const find = (type: string) => rest.find((i) => events[i].type === type);
    const textOf = (i: number | undefined) => (i === undefined ? null : this.text(i));
    const finisher = find("goal") ?? find("chance");
    const result = finisher === undefined ? null : events[finisher].type === "goal" ? "goal" : chanceResult(events[finisher]);
    const goalsBefore = this.goals.home + this.goals.away;
    this.freeAll();
    if (e.type !== "special") this.drain();
    switch (e.type) {
      case "goal": {
        const counter = e.source === "counter";
        this.buildUp(e.minute, counter ? other(side) : side, counter ? 0.6 : 0.55);
        const assist = find("assist");
        this.openPlayShot(e, side, this.actor(events[assist ?? -1]), "goal", text, textOf(assist));
        break;
      }
      case "chance": {
        this.buildUp(e.minute, side, 0.55);
        const block = rest.find((i) => events[i].detail === "block");
        this.openPlayShot(e, side, null, chanceResult(e), text, textOf(rest[0]), this.actor(events[block ?? -1]));
        break;
      }
      case "corner":
      case "freekick":
      case "penalty": {
        this.buildUp(e.minute, side, e.type === "penalty" ? 0.75 : 0.72);
        const cross = e.type === "corner" || (e.type === "freekick" && e.detail !== "direct");
        if (cross) this.crossSetPiece(e, side, events[finisher ?? -1], result, text, textOf(finisher));
        else this.placedShot(e, side, result ?? "wide", text, textOf(finisher));
        break;
      }
      case "foul": {
        const card = find("card");
        // Drobné fauly jsou jen titulek, pokud z nich nepadla karta.
        if (e.detail === "petty" && card === undefined) return this.note(e, text);
        this.buildUp(e.minute, other(side), 0.5);
        this.foul(e, side, text, card === undefined ? null : { event: events[card], text: this.text(card) });
        break;
      }
      case "card": {
        this.buildUp(e.minute, other(side), 0.5);
        const figure = this.actor(e, true);
        this.caption(text, e.detail === "red" ? "red" : "yellow", [figure]);
        if (e.detail === "red" && figure !== null) this.sendOff(figure);
        break;
      }
      case "injury":
      case "substitution": {
        this.buildUp(e.minute, this.possession, 0.5);
        const injured = e.type === "injury" ? this.injury(e, text) : null;
        for (const sub of e.type === "injury" ? rest.filter((i) => events[i].type === "substitution") : [head]) this.substitution(events[sub], this.text(sub), injured, sub);
        break;
      }
      default: {
        if (e.detail === "half_time") this.halfTimeText = text;
        else if (e.detail === "full_time") this.fullTimeText = text;
        else this.note(e, text);
        // Do brány jde hráč z pole (vyloučený brankář, nikdo na lavičce).
        const keeper = e.detail === "emergency_gk" ? this.actor(e, true) : null;
        if (keeper !== null) this.actors[keeper].role = "GK";
        return;
      }
    }
    // Gól, který scéna nezobrazila (chybí střelec v datech), se aspoň započítá.
    const shown = this.goals.home + this.goals.away - goalsBefore;
    [head, ...rest].filter((i) => events[i].type === "goal").slice(shown).forEach((i) => this.scored(sideOfTeam(events[i].teamId), this.text(i)));
  }

  private note(e: MatchEvent, text: string): null {
    if (text) this.notes.push(text);
    this.lastMinute = Math.max(this.lastMinute, e.minute);
    return null;
  }

  /** Hra mezi událostmi: přihrávky týmu, který jde do další akce, míč se posouvá k jejímu místu. */
  private buildUp(minute: number, side: Side, targetU: number) {
    const seconds = clamp(Math.max((minute - this.lastMinute) * 1.1, this.notes.length * 2.4), 1.6, 12);
    this.setLayout({ kind: "play" }, side);
    this.minute(0);
    this.flushNotes();
    const end = this.k + seconds * REPLAY_HZ;
    const startU = worldToUv(side, this.half, this.ballAt).u;
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
        const z = this.ballAt.z + attackSign(side, this.half) * (2 + this.rng() * 3);
        this.carry(receiver, { x: clamp(this.ballAt.x + (this.rng() - 0.5) * 3, -HALF_W + 2, HALF_W - 2), z: clamp(z, -HALF_L + 3, HALF_L - 3) }, 0.4);
      }
    }
    this.lastMinute = minute;
    this.minute(minute);
  }

  private shot(side: Side, result: ShotResult, speed = 24, blocker: number | null = null) {
    const gz = this.goalZ(side);
    const s = Math.sign(gz);
    const defending = other(side);
    const gk = this.keeper(defending);
    const from = this.ballAt;
    const flight = (to: Point) => clamp(dist(from, to) / speed, 0.3, 1.4);
    const gkSpot = (x: number): Point => ({ x, z: gz - s * 0.8 });
    const dive = (x: number): Pose => (x > 0 ? "diveRight" : "diveLeft");
    this.freeAll();
    this.ball = { kind: "rest" };
    if (result === "goal") {
      const x = this.sign() * (1 + this.rng() * 2.3);
      if (gk !== null) {
        this.send(gk, gkSpot(-Math.sign(x) * 1.6));
        this.setPose(gk, dive(-Math.sign(x)), 1.2, flight({ x, z: gz }) - 0.5);
      }
      this.fly({ x, z: gz }, 0.3 + this.rng() * 1.7, 0.4, flight({ x, z: gz }));
      this.fly({ x: x * 0.9, z: gz + s * 1.3 }, 0.15, 0, 0.25);
      return;
    }
    if (result === "saved" && gk !== null) {
      const x = this.sign() * (0.4 + this.rng() * 2.2);
      if (Math.abs(x) > 1.2) this.setPose(gk, dive(x), 1.2, dist(from, gkSpot(x)) / speed - 0.5);
      this.pass(gk, gkSpot(x), { h: 0.4 + this.rng() * 0.6, arc: 0.3, speed });
      this.run(1.1);
      return this.clearance(defending);
    }
    if (result === "post" || result === "bar") {
      const x = result === "post" ? this.sign() * GOAL_HALF_W : (this.rng() - 0.5) * 5;
      this.fly({ x, z: gz }, result === "bar" ? GOAL_H : 0.5 + this.rng() * 1.3, 0.4, flight({ x, z: gz }));
      const defender = this.teammate(defending, [], ["DEF"]);
      const rebound = { x: x * 1.6, z: gz - s * (7 + this.rng() * 4) };
      if (defender === null) return this.placeBall(rebound);
      this.pass(defender, rebound, { arc: result === "bar" ? 2.5 : 0.8, speed: 14 });
      return this.clearance(defending);
    }
    const blockedBy = result === "blocked" ? blocker ?? this.nearest(defending, from) : null;
    if (blockedBy !== null) {
      const blockAt = toward(from, { x: 0, z: gz }, 2.2);
      this.send(blockedBy, blockAt);
      this.run(1.2, () => dist(this.actors[blockedBy], blockAt) < 0.8);
      this.pass(blockedBy, { x: this.actors[blockedBy].x, z: this.actors[blockedBy].z }, { h: 0.4, speed: 30 });
      this.run(0.3);
      return this.clearance(defending);
    }
    // Vedle, nad (nebo „chycená“ střela bez brankáře): míč za lajnou, brankář rozehraje od malého vápna.
    const x = result === "over" ? (this.rng() - 0.5) * 6 : this.sign() * (GOAL_HALF_W + 0.8 + this.rng() * 3);
    this.fly({ x, z: gz }, result === "over" ? 3.3 : 0.4 + this.rng(), 0.5, flight({ x, z: gz }));
    this.fly({ x, z: gz + s * 3 }, 0.2, 0, 0.35);
    this.run(0.8);
    this.setLayout({ kind: "play" }, defending);
    this.placeBall({ x: this.sign() * 3, z: gz - s * 5 });
    if (this.takeBall(defending, gk) !== null) this.clearance(defending);
  }

  private clearance(side: Side) {
    const owner = this.ball.kind === "held" ? this.ball.owner : null;
    const receiver = this.teammate(side, [owner], ["MID", "FWD"]);
    if (receiver === null || owner === null) return;
    this.pass(receiver, toward(this.actors[receiver], uvToWorld(side, this.half, 0.45, (this.rng() - 0.5) * 1.2), 6), { arc: 6, speed: 20 });
  }

  private goalScored(scorer: number | null, side: Side, text: string | null, afterText: string | null) {
    this.scored(side, text, scorer);
    if (afterText) this.caption(afterText);
    const gz = this.goalZ(side);
    if (scorer !== null) {
      this.send(scorer, { x: Math.sign(this.actors[scorer].x || 1) * (HALF_W - 3), z: gz - Math.sign(gz) * 3 });
      this.setPose(scorer, "celebrate", 3.4);
    }
    this.run(3.4);
    this.freeAll();
    this.setLayout({ kind: "kickoff" }, other(side));
    this.placeBall({ x: 0, z: 0 });
    this.run(10, () => this.settled());
    this.takeBall(other(side), this.kickoffPair[0] ?? null);
  }

  private openPlayShot(e: MatchEvent, side: Side, assister: number | null, result: ShotResult, text: string, afterText: string | null, blocker: number | null = null) {
    const shooter = this.actor(e);
    if (shooter === null) return this.note(e, text);
    const half = this.half;
    const shotU = e.source === "scramble" ? 0.9 : this.actors[shooter].role === "FWD" ? 0.83 : 0.78;
    const shotSpot = uvToWorld(side, half, shotU, clamp(worldToUv(side, half, this.actors[shooter]).v * 0.5, -0.35, 0.35));
    const helper = assister !== shooter ? assister ?? this.teammate(side, [shooter], ["MID", "FWD"]) : null;
    this.takeBall(side, e.source === "counter" ? null : helper ?? shooter);
    if (e.source === "counter" || helper === null) {
      // Brejk: zisk míče a sprint k bráně.
      if (this.ball.kind === "held" && this.ball.owner !== shooter) this.pass(shooter, toward(this.actors[shooter], shotSpot, 4), { speed: 14 });
    } else {
      this.carry(helper, uvToWorld(side, half, 0.66, (this.rng() - 0.5) * 0.8), 0.8, SPRINT);
      this.pass(shooter, toward(this.actors[shooter], shotSpot, Math.min(dist(this.actors[shooter], shotSpot), 6)));
    }
    const marker = this.nearest(other(side), shotSpot);
    if (marker !== null && marker !== blocker) this.send(marker, toward(shotSpot, { x: 0, z: this.goalZ(side) }, 2.5));
    if (dist(this.actors[shooter], shotSpot) > 3) this.carry(shooter, shotSpot, 0.3, SPRINT);
    // Titulek šance až se střelou (u gólu až s gólem), ať se nic nevyzradí předem.
    if (result !== "goal") this.caption(text, undefined, [shooter]);
    else this.drain();
    this.shot(side, result, 24, blocker);
    if (result === "goal") return this.goalScored(shooter, side, text, afterText);
    if (afterText) this.caption(afterText, undefined, [result === "saved" ? this.keeper(other(side)) : blocker]);
    this.run(0.4);
  }

  /** Bez zakončení (nebo bez výsledku) obrana centr odhlavičkuje. */
  private crossSetPiece(e: MatchEvent, side: Side, finisherEvent: MatchEvent | undefined, result: ShotResult | null, text: string, finisherText: string | null) {
    const finisher = finisherEvent ? this.actor(finisherEvent) : null;
    // Zakončil ten, kdo kopal? Pak centruje spoluhráč a on běží do vápna.
    const named = this.actor(e);
    const taker = named !== null && named === finisher ? this.teammate(side, [finisher], ["MID", "DEF"]) : named;
    if (taker === null) return this.note(e, text);
    const gz = this.goalZ(side);
    const s = Math.sign(gz);
    const spot = e.type === "corner"
      ? { x: this.sign() * (HALF_W - 0.3), z: gz - s * 0.3 }
      : { x: this.sign() * (11 + this.rng() * 5), z: gz - s * (12 + this.rng() * 6) };
    this.setLayout({ kind: "box", attacker: side }, side);
    const target = { x: (this.rng() - 0.5) * 6, z: gz - s * (5 + this.rng() * 3) };
    const stand = toward(spot, target, -0.6);
    this.send(taker, stand);
    this.placeBall(spot, taker);
    if (finisher !== null && finisher !== taker) this.send(finisher, { x: target.x * 0.7, z: target.z - s * 3 });
    this.run(10, () => this.settled() && dist(this.actors[taker], stand) < 0.3);
    this.caption(text, undefined, [taker]);
    this.takeBall(side, taker);
    this.run(0.6);
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
    this.drain();
    this.shot(side, result, 18);
    if (result === "goal") return this.goalScored(finisher, side, finisherText, null);
    if (finisherText) this.caption(finisherText, undefined, [finisher]);
    this.run(0.4);
  }

  private placedShot(e: MatchEvent, side: Side, result: ShotResult, text: string, afterText: string | null) {
    const isPenalty = e.type === "penalty";
    const gz = this.goalZ(side);
    const spot = isPenalty ? { x: 0, z: gz - Math.sign(gz) * 11 } : { x: (this.rng() - 0.5) * 14, z: gz - Math.sign(gz) * (19 + this.rng() * 3) };
    const kicker = this.actor(e);
    if (kicker === null) return this.note(e, text);
    if (isPenalty) {
      // Exekutora ve vápně podrazí obránce; penalta se ohlásí hned, komentář (často s výsledkem) až při rozběhu.
      this.takeBall(side, kicker);
      this.carry(kicker, toward(spot, { x: 0, z: gz }, -3), 0.5, SPRINT);
      const fouler = this.nearest(other(side), this.actors[kicker]);
      if (fouler !== null) {
        this.send(fouler, toward(this.actors[kicker], this.actors[fouler], 0.6));
        this.contact = [fouler, kicker];
        this.run(3, () => dist(this.actors[fouler], this.actors[kicker]) < 0.8);
        this.contact = [];
        this.fouls.push({ a: fouler, b: kicker, from: this.k - 3 * REPLAY_HZ, to: this.k + 3 * REPLAY_HZ });
        this.setPose(kicker, "down", 1.5);
        this.send(fouler, toward(this.actors[kicker], this.actors[fouler], 2), JOG);
      }
      this.ball = { kind: "rest" };
      this.caption(`Penalta pro ${this.input[side].name}!`, "penalty", [kicker]);
      this.run(1.5);
    }
    this.setLayout({ kind: isPenalty ? "penalty" : "box", attacker: side }, side);
    const back = toward(spot, { x: 0, z: gz }, -2.8);
    const runUp = { x: back.x + (gz - spot.z > 0 ? 1.2 : -1.2), z: back.z };
    this.send(kicker, runUp);
    this.placeBall(spot, kicker);
    this.run(12, () => this.settled() && dist(this.actors[kicker], runUp) < 0.3);
    this.caption(text, undefined, [kicker]);
    this.run(0.6);
    this.takeBall(side, kicker);
    this.drain();
    this.shot(side, result, isPenalty ? 26 : 20);
    if (result === "goal") return this.goalScored(kicker, side, afterText, null);
    if (afterText) this.caption(afterText);
    this.run(0.4);
  }

  private foul(e: MatchEvent, side: Side, text: string, card: { event: MatchEvent; text: string } | null) {
    const fouler = this.actor(e);
    if (fouler === null) return this.note(e, text);
    this.caption(text, undefined, [fouler]);
    const owner = this.ball.kind === "held" ? this.ball.owner : null;
    const victim = owner !== null && this.actors[owner].side !== side ? owner : this.nearest(other(side), this.ballAt);
    const from = this.k;
    if (victim !== null) {
      const v = this.actors[victim];
      this.send(victim, { x: v.x, z: v.z });
      const contact = toward(v, this.actors[fouler], 0.6);
      this.send(fouler, contact);
      this.contact = [fouler, victim];
      this.run(4, () => dist(this.actors[fouler], contact) < 0.2);
      this.contact = [];
      this.setPose(victim, "down", 2.6);
      this.send(fouler, toward(v, this.actors[fouler], 1.8), JOG);
      this.looseBall(v);
    }
    this.ball = { kind: "rest" };
    this.setLayout({ kind: "play" }, other(side));
    const red = card?.event.detail === "red";
    // Kartu dostane (a kroužek má) ten, koho jmenuje karta, obvykle faulující.
    const carded = card ? this.actor(card.event, true) ?? fouler : fouler;
    this.run(0.5);
    if (card) this.caption(card.text, red ? "red" : "yellow", [carded]);
    if (!red) this.run(card ? 2 : 1);
    // Po faulu se dvojice rozestoupí až v další akci.
    if (victim !== null) this.fouls.push({ a: fouler, b: victim, from, to: this.k + 2 * REPLAY_HZ });
    if (card && red) this.sendOff(carded);
  }

  /** Vyloučený hráč odejde k nejbližší lajně a jeho místo zůstane prázdné. */
  private sendOff(figure: number) {
    this.freeAll();
    this.actors[figure].state = LEAVING;
    this.sentOff.push({ figure, tick: this.k });
    this.run(1.5);
  }

  private injury(e: MatchEvent, text: string): number | null {
    const figure = this.actor(e, true);
    if (figure === null) return this.note(e, text);
    this.caption(text, "injury", [figure]);
    this.ball = { kind: "rest" };
    this.setPose(figure, "down", 3.6);
    if (dist(this.ballAt, this.actors[figure]) < 1.5) this.looseBall(this.actors[figure]);
    this.freeAll();
    const a = this.actors[figure];
    const near = this.onPitch(a.side).filter((f) => f !== figure && this.actors[f].role !== "GK").sort((x, y) => dist(this.actors[x], a) - dist(this.actors[y], a));
    if (near[0] !== undefined) this.send(near[0], toward(a, this.actors[near[0]], 2.4), JOG);
    this.run(3.6);
    return figure;
  }

  private substitution(e: MatchEvent, text: string, injured: number | null, index: number) {
    const side = sideOfTeam(e.teamId);
    // „X za Y“, u vyloučeného brankáře „X jde do brány za vyloučeného gólmana, ven jde Y“.
    const outName = e.description?.match(/(?: za | ven jde )([^,]+)$/)?.[1]?.trim();
    const onPitch = this.onPitch(side);
    // Jméno odcházejícího chybí: jde ten z pole, kdo už v zápase nic neudělá.
    const later = this.events.slice(index + 1).filter((x) => sideOfTeam(x.teamId) === side);
    const idle = onPitch.filter((f) => this.actors[f].role !== "GK" && !later.some((x) => this.byId.get(`${side}:${x.playerId}`) === f));
    const named = onPitch.find((f) => this.figures[f].player.name === outName) ?? (injured !== null && this.actors[injured].state === ON ? injured : null);
    const outgoing = named ?? idle.at(-1) ?? null;
    const incoming = this.benchByName(side, e.playerName);
    if (outgoing === null || incoming === null) return this.note(e, text);
    this.used.add(incoming);
    this.byId.set(`${side}:${e.playerId}`, incoming);
    this.caption(text, "sub", [incoming, outgoing]);
    this.freeAll();
    this.ball = { kind: "rest" };
    const out = this.actors[outgoing], inc = this.actors[incoming];
    // Náhradní brankář jde do pole, když střídá hráče z pole; do brány jen za brankáře nebo „jde do brány“.
    const role = e.description?.includes("do brány") ? "GK" : out.role;
    Object.assign(inc, { ...BENCH_ENTRY, vx: 0, vz: 0, state: ON, slot: out.slot, anchor: null, script: null, role });
    out.state = LEAVING;
    // Brankář běží do prázdné branky sprintem, hráč do pole klusem.
    if (inc.role === "GK") this.send(incoming, this.spot(inc, incoming, this.ballAt));
    this.run(8, () => dist(inc, inc.script ?? inc.anchor ?? BENCH_ENTRY) < 2);
  }

  private halfTime() {
    this.flushNotes();
    this.drain();
    this.run(8, () => this.actors.every((a) => a.state !== LEAVING));
    this.minute(45);
    this.caption(this.halfTimeText ?? `Poločas ${this.goals.home}:${this.goals.away}`);
    this.run(1.5);
    // Přestávka je jediný střih: hráči stojí rovnou na místech pro výkop druhého poločasu.
    this.half = 2;
    this.lastMinute = 45;
    this.setLayout({ kind: "kickoff" }, "away");
    this.ball = { kind: "rest" };
    this.ballAt = { x: 0, z: 0, h: 0 };
    this.actors.forEach((a, i) => {
      if (a.state === LEAVING) a.state = OFF;
      if (a.state !== ON) return;
      Object.assign(a, this.spot(a, i, { x: 0, z: 0 }), { vx: 0, vz: 0, script: null, anchor: null, pose: 0, dirX: 0, dirZ: attackSign(a.side, 2) });
    });
    this.cut = this.k;
    this.caption("Začíná 2. poločas");
    this.run(2);
    this.minute(46);
    this.takeBall("away", this.kickoffPair[0] ?? null);
  }

  private fullTime() {
    if (this.layout.kind === "kickoff") this.buildUp(this.lastMinute, this.possession, 0.45);
    this.flushNotes();
    this.ball = { kind: "rest" };
    // Po hvizdu všichni zastaví, kde jsou.
    this.freeAll();
    for (const a of this.actors) {
      const stop = Math.hypot(a.vx, a.vz) / (2 * ACCEL);
      a.anchor = { x: a.x + a.vx * stop, z: a.z + a.vz * stop };
    }
    this.run(8, () => this.actors.every((a) => a.state !== LEAVING));
    this.drain();
    const { home, away, score, shootout } = this.input;
    this.minute(Math.max(90, this.lastMinute));
    if (score.home !== this.goals.home || score.away !== this.goals.away) this.scores.push({ t: this.now, ...score });
    this.caption(this.fullTimeText ?? `Konec zápasu! ${home.name} ${score.home}:${score.away} ${away.name}`);
    if (shootout) this.caption(`Penaltový rozstřel ${shootout.home}:${shootout.away}, dál jde ${shootout.home > shootout.away ? home.name : away.name}.`);
    this.run(4);
  }
}
