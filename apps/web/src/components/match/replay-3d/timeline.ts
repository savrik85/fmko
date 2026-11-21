/**
 * Choreografie 3D záznamu zápasu.
 *
 * Engine ukládá jen události po minutách, bez souřadnic. Tady se z nich poskládá časová osa:
 * kudy jde míč, kdo kam běží, titulky, skóre a herní čas. Co se stalo (střelec, výsledek
 * střely, standardka, střídání) určují data; náhoda odvozená z id zápasu vybírá jen kosmetiku
 * (strana střely, přesné místo), takže každé přehrání vypadá stejně.
 */
import type { MatchEvent } from "@okresni-masina/shared";
import { PITCH } from "@/components/stadium/stadium-3d/constants";

const HALF_W = PITCH.width / 2;
const HALF_L = PITCH.depth / 2;
/** Šířka, do které se rozkládá formace (kousek od lajny). */
const SHAPE_HALF_W = HALF_W - 2;
const GOAL_HALF_W = 3.66;
const GOAL_H = 2.44;
const PENALTY_DIST = 11;
/** Střídající hráč vbíhá u střídaček na západní lajně. */
const BENCH_ENTRY = { x: -(HALF_W + 1.2), z: 0 };
/** Běh hráče v m/s herního času; stejnou mez má i dobíhání do formace ve scéně. */
export const RUN_SPEED = 7.5;
/** Nejvyšší rychlost na naplánované dráze. */
const SPRINT_SPEED = 9;

export type Side = "home" | "away";
type Role = "GK" | "DEF" | "MID" | "FWD";
type Pose = "run" | "down" | "diveLeft" | "diveRight" | "celebrate";
type CardColor = "yellow" | "red";
type Banner = "goal" | "penalty" | CardColor;
type ShotResult = "goal" | "saved" | "post" | "bar" | "wide" | "over" | "blocked";

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
export interface ReplayInput { matchId: string; events: MatchEvent[]; commentary: string[]; home: ReplayTeam; away: ReplayTeam }

interface Figure { side: Side; player: ReplayPlayer; role: Role }
interface Caption { t: number; text: string; banner?: Banner }
interface Point { x: number; z: number }
interface Key extends Point { t: number; h: number; arc: number }
interface SlotBase { u: number; v: number; role: Role }
interface Span<T> { figure: number; from: number; to: number; value: T }
type Layout =
  | { kind: "play" }
  | { kind: "kickoff" }
  | { kind: "box"; attacker: Side }
  | { kind: "penalty"; attacker: Side };

interface Segment {
  start: number;
  end: number;
  half: 1 | 2;
  possession: Side;
  layout: Layout;
  /** Hráči na začátku úseku skočí na místo (po poločase), místo aby přebíhali. */
  snap: boolean;
  slots: Record<Side, (number | null)[]>;
  ball: Key[];
  /** Naplánované dráhy hráčů; ostatní stojí ve formaci. */
  actors: Map<number, Key[]>;
  /** Hráči odcházející z hřiště (střídání, červená). */
  leaving: number[];
  poses: Span<Pose>[];
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
const attackSign = (side: Side, half: 1 | 2): 1 | -1 => ((side === "home") === (half === 1) ? -1 : 1);

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

/** Kam patří hráč podle polohy míče, držení a druhu situace (brankář podle své role, ne místa). */
function shapeTarget(base: SlotBase, side: Side, role: Role, ball: Point, seg: Pick<Segment, "half" | "possession" | "layout">, time: number, seed: number): Point {
  const b = worldToUv(side, seg.half, ball);
  const layout = seg.layout;
  let u: number;
  let v: number;
  if (role === "GK") {
    const attacking = layout.kind !== "play" && layout.kind !== "kickoff" && side === layout.attacker;
    u = attacking ? 0.12 : 0.03 + clamp((b.u - 0.3) * 0.08, 0, 0.06);
    v = clamp(b.v * 0.2, -0.15, 0.15);
    return uvToWorld(side, seg.half, u, v);
  }
  if (layout.kind === "kickoff") {
    u = Math.min(base.u * 0.85, 0.46);
    v = base.v;
  } else if (layout.kind === "penalty") {
    u = side === layout.attacker ? 0.66 : 0.34;
    v = -0.55 + 1.1 * hash01(seed * 3.7);
  } else if (layout.kind === "box") {
    // Roh a centr: útočníci a stopeři ve vápně, krajní obránci vzadu; bránící ve vlastním vápně, útočník nahoře.
    const staysBack = side === layout.attacker ? base.role === "DEF" && Math.abs(base.v) >= 0.5 : base.role === "FWD";
    if (staysBack) {
      u = side === layout.attacker ? 0.52 : 0.38;
      v = base.v * 0.6;
    } else {
      u = side === layout.attacker ? 0.84 + 0.08 * hash01(seed) : 0.05 + 0.1 * hash01(seed * 3.1);
      v = -0.5 + hash01(seed * 5.7);
    }
  } else {
    const shift = (b.u - 0.5) * 0.5 + (seg.possession === side ? 0.06 : -0.06);
    u = clamp(base.u + shift, 0.08, 0.92);
    v = clamp(base.v * 0.85 + b.v * 0.3, -1.05, 1.05);
  }
  u += 0.012 * Math.sin(time * 0.6 + seed * 2.1);
  v += 0.03 * Math.sin(time * 0.45 + seed * 3.3);
  return uvToWorld(side, seg.half, u, v);
}

function sampleTrack(keys: Key[], tau: number): Key {
  if (tau <= keys[0].t) return keys[0];
  for (let i = 1; i < keys.length; i++) {
    const k1 = keys[i];
    if (tau <= k1.t) {
      const k0 = keys[i - 1];
      const s = (tau - k0.t) / Math.max(0.0001, k1.t - k0.t);
      return { t: tau, x: lerp(k0.x, k1.x, s), z: lerp(k0.z, k1.z, s), h: lerp(k0.h, k1.h, s) + k1.arc * 4 * s * (1 - s), arc: 0 };
    }
  }
  return keys[keys.length - 1];
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
  const d = e.description;
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
  private readonly bases: Record<Side, SlotBase[]>;
  private readonly segments: Segment[];
  private readonly captions: Caption[];
  private readonly scores: { t: number; home: number; away: number }[];
  private readonly minutes: { t: number; minute: number }[];
  private cursor = 0;

  constructor(input: ReplayInput) {
    this.home = input.home;
    this.away = input.away;
    const teamFigures = (side: Side, team: ReplayTeam): Figure[] =>
      [...team.starters, ...team.subs].map((player) => ({ side, player, role: toRole(player.position) }));
    this.figures = [...teamFigures("home", input.home), ...teamFigures("away", input.away)];
    this.bases = { home: slotBases(input.home.starters), away: slotBases(input.away.starters) };
    const built = new PlanBuilder(input, this.figures, this.bases);
    built.build();
    this.segments = built.segments;
    this.captions = built.captions;
    this.scores = built.scores;
    this.minutes = built.minutes;
    this.duration = this.segments[this.segments.length - 1].end;
  }

  createFrame() {
    return {
      ballX: 0, ballY: 0, ballZ: 0, snap: true,
      figures: this.figures.map(() => ({ visible: false, x: 0, z: 0, exact: false, pose: "run" as Pose })),
    };
  }

  /** Stav v čase t, zapsaný do snímku z `createFrame`. `exact` = hráč jede po naplánované dráze. */
  sample(t: number, out: ReturnType<ReplayPlan["createFrame"]>): void {
    const seg = this.segmentAt(t);
    const tau = t - seg.start;
    const ball = sampleTrack(seg.ball, tau);
    out.ballX = ball.x;
    out.ballZ = ball.z;
    out.ballY = ball.h;
    out.snap = seg.snap && tau < 0.05;
    for (const f of out.figures) {
      f.visible = false;
      f.exact = false;
      f.pose = "run";
    }

    for (const side of ["home", "away"] as const) {
      seg.slots[side].forEach((figure, slot) => {
        if (figure === null) return;
        const f = out.figures[figure];
        f.visible = true;
        const track = seg.actors.get(figure);
        f.exact = track !== undefined && tau >= track[0].t && tau <= track[track.length - 1].t;
        const p = f.exact && track
          ? sampleTrack(track, tau)
          : shapeTarget(this.bases[side][slot], side, this.figures[figure].role, ball, seg, t, slot * 1.7 + (side === "home" ? 0 : 0.9));
        f.x = p.x;
        f.z = p.z;
      });
    }
    for (const figure of seg.leaving) {
      const track = seg.actors.get(figure);
      if (!track || tau > track[track.length - 1].t) continue;
      const p = sampleTrack(track, tau);
      Object.assign(out.figures[figure], { visible: true, exact: true, x: p.x, z: p.z });
    }
    for (const span of seg.poses) if (tau >= span.from && tau <= span.to) out.figures[span.figure].pose = span.value;
  }

  scoreAt(t: number): { home: number; away: number } {
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

  private segmentAt(t: number): Segment {
    const segs = this.segments;
    if (segs[this.cursor].start > t) this.cursor = 0;
    while (this.cursor < segs.length - 1 && segs[this.cursor].end <= t) this.cursor++;
    return segs[this.cursor];
  }
}

// ── Sestavení časové osy ──

class PlanBuilder {
  readonly segments: Segment[] = [];
  readonly captions: Caption[] = [];
  readonly scores = [{ t: 0, home: 0, away: 0 }];
  readonly minutes = [{ t: 0, minute: 0 }];
  private t = 0;
  private half: 1 | 2 = 1;
  private ball: Point = { x: 0, z: 0 };
  private owner: number | null = null;
  private possession: Side = "home";
  private lastMinute = 0;
  /** Titulky bez vlastní akce (rozhodčí, počasí, pokyny…), ukážou se během další hry. */
  private pendingNotes: string[] = [];
  /** Kde hráč skončil svou poslední dráhu (absolutní čas); další dráha začne tam, ne ve formaci. */
  private readonly known = new Map<number, Point & { t: number }>();
  private readonly slots: Record<Side, (number | null)[]>;
  private readonly offsets: Record<Side, number>;
  private readonly rng: () => number;

  constructor(private readonly input: ReplayInput, private readonly figures: Figure[], private readonly bases: Record<Side, SlotBase[]>) {
    this.rng = seededRng(input.matchId);
    const homeCount = input.home.starters.length + input.home.subs.length;
    this.offsets = { home: 0, away: homeCount };
    this.slots = { home: input.home.starters.map((_, i) => i), away: input.away.starters.map((_, i) => homeCount + i) };
  }

  build() {
    const { events, commentary } = this.input;
    const text = (i: number) => (commentary[i] ?? events[i].description).replace(/^\d+'\s*[—-]\s*/, "");
    this.kickoff("home", 2);
    this.caption(0, "Výkop!");
    for (const group of groupEvents(events)) this.playGroup(group, text);
  }

  // ── Události ──

  private playGroup([headIndex, ...rest]: number[], text: (i: number) => string) {
    const { events } = this.input;
    const head = events[headIndex];
    const side = sideOfTeam(head.teamId);
    const find = (type: string) => rest.find((i) => events[i].type === type);
    const textOf = (i: number | undefined) => (i === undefined ? null : text(i));

    switch (head.type) {
      case "goal": {
        const counter = head.source === "counter";
        this.buildUp(head.minute, counter ? other(side) : side, counter ? 0.6 : 0.55);
        const assist = find("assist");
        return this.openPlayShot(head, side, assist === undefined ? null : this.figureOf(events[assist]), "goal", text(headIndex), textOf(assist));
      }
      case "chance": {
        this.buildUp(head.minute, side, 0.55);
        const block = rest.find((i) => events[i].detail === "block");
        return this.openPlayShot(head, side, null, chanceResult(head), text(headIndex), textOf(rest[0]), block === undefined ? null : this.figureOf(events[block]));
      }
      case "corner":
      case "freekick": {
        this.buildUp(head.minute, side, 0.72);
        const finisher = find("goal") ?? find("chance");
        const result = finisher === undefined ? null : events[finisher].type === "goal" ? "goal" : chanceResult(events[finisher]);
        if (head.type === "freekick" && head.detail === "direct") {
          const gz = this.goalZ(side);
          const spot = { x: (this.rng() - 0.5) * 16, z: gz - Math.sign(gz) * (19 + this.rng() * 4) };
          return this.placedShot(head, side, spot, result ?? "wide", text(headIndex), textOf(finisher), finisher);
        }
        return this.crossSetPiece(head, side, finisher, result, text(headIndex), textOf(finisher));
      }
      case "penalty": {
        this.buildUp(head.minute, side, 0.75);
        const finisher = find("goal") ?? find("chance");
        const result = finisher === undefined ? "wide" : events[finisher].type === "goal" ? "goal" : chanceResult(events[finisher]);
        const gz = this.goalZ(side);
        return this.placedShot(head, side, { x: 0, z: gz - Math.sign(gz) * PENALTY_DIST }, result, text(headIndex), textOf(finisher), finisher);
      }
      case "foul": {
        const card = find("card");
        // Drobné fauly jsou jen titulek, pokud z nich nepadla karta.
        if (head.detail === "petty" && card === undefined) return this.note(head, text(headIndex));
        this.buildUp(head.minute, other(side), 0.5);
        return this.foul(head, side, text(headIndex), card === undefined ? null : { event: events[card], text: text(card) });
      }
      case "card":
        this.buildUp(head.minute, other(side), 0.5);
        return this.card(head, text(headIndex));
      case "injury": {
        this.buildUp(head.minute, this.possession, 0.5);
        this.injury(head, text(headIndex));
        const sub = find("substitution");
        if (sub !== undefined) this.substitution(events[sub], text(sub));
        return;
      }
      case "substitution":
        this.buildUp(head.minute, this.possession, 0.5);
        return this.substitution(head, text(headIndex));
    }
    if (head.detail === "half_time") return this.halfTime(text(headIndex));
    if (head.detail === "full_time") return this.fullTime(head.minute, text(headIndex));
    // Do brány jde hráč z pole (vyloučený brankář, nikdo na lavičce).
    if (head.detail === "emergency_gk") {
      const figure = this.figureOf(head);
      if (figure !== null) this.figures[figure].role = "GK";
    }
    this.note(head, text(headIndex));
  }

  /** Engine id → figura: domácí 1.., hosté 101.., v pořadí uložené sestavy (základ, pak lavička). */
  private figureOf(e: MatchEvent): number | null {
    if (!e.playerId) return null;
    const side = sideOfTeam(e.teamId);
    const team = this.input[side];
    const index = e.playerId - (side === "home" ? 1 : 101);
    return index >= 0 && index < team.starters.length + team.subs.length ? this.offsets[side] + index : null;
  }

  private sideOfFigure(figure: number): Side {
    return figure < this.offsets.away ? "home" : "away";
  }

  private onPitch(side: Side): number[] {
    return this.slots[side].filter((f): f is number => f !== null);
  }

  private keeper(side: Side): number | null {
    return this.onPitch(side).find((f) => this.figures[f].role === "GK") ?? null;
  }

  private teammate(side: Side, exclude: (number | null)[], roles: Role[]): number | null {
    const outfield = this.onPitch(side).filter((f) => !exclude.includes(f) && this.figures[f].role !== "GK");
    const preferred = outfield.filter((f) => roles.includes(this.figures[f].role));
    const list = preferred.length ? preferred : outfield;
    return list.length ? list[Math.floor(this.rng() * list.length)] : null;
  }

  private goalZ(side: Side): number {
    return attackSign(side, this.half) * HALF_L;
  }

  private sign(): 1 | -1 {
    return this.rng() < 0.5 ? -1 : 1;
  }

  private note(e: MatchEvent, text: string) {
    this.pendingNotes.push(text);
    this.lastMinute = Math.max(this.lastMinute, e.minute);
  }

  private flushNotes(at: number, spacing = 0) {
    this.pendingNotes.forEach((text, i) => this.caption(at + i * spacing, text));
    this.pendingNotes = [];
  }

  private caption(t: number, text: string, banner?: Banner) {
    this.captions.push({ t, text, banner });
  }

  // ── Úseky a dráhy ──

  private open(layout: Layout, possession: Side, snap = false): Segment {
    this.possession = possession;
    return {
      start: this.t, end: this.t, half: this.half, possession, layout, snap,
      slots: { home: [...this.slots.home], away: [...this.slots.away] },
      ball: [{ t: 0, x: this.ball.x, z: this.ball.z, h: 0, arc: 0 }],
      actors: new Map(), leaving: [], poses: [],
    };
  }

  private close(seg: Segment, duration: number) {
    seg.end = seg.start + duration;
    this.ball = this.ballAt(seg);
    for (const [figure, track] of seg.actors) {
      const k = track[track.length - 1];
      this.known.set(figure, { x: k.x, z: k.z, t: seg.start + k.t });
    }
    this.segments.push(seg);
    this.t = seg.end;
  }

  private ballAt(seg: Segment): Key {
    return seg.ball[seg.ball.length - 1];
  }

  private ballKey(seg: Segment, tau: number, p: Point, h = 0, arc = 0) {
    seg.ball.push({ t: tau, x: p.x, z: p.z, h, arc });
  }

  /** Míč leží do času tau. */
  private holdBall(seg: Segment, tau: number) {
    const b = this.ballAt(seg);
    if (tau > b.t) this.ballKey(seg, tau, b, b.h);
  }

  private shape(seg: Segment, figure: number, ball: Point, tau: number): Point {
    const side = this.sideOfFigure(figure);
    const slot = Math.max(0, seg.slots[side].indexOf(figure));
    return shapeTarget(this.bases[side][slot], side, this.figures[figure].role, ball, seg, seg.start + tau, slot * 1.7 + (side === "home" ? 0 : 0.9));
  }

  /** Kde hráč v čase tau je: na své dráze, na konci čerstvé dráhy z minula, jinak ve formaci. */
  private startOf(seg: Segment, figure: number, tau: number): Point {
    const track = seg.actors.get(figure);
    if (track) return sampleTrack(track, tau);
    const known = this.known.get(figure);
    return known && seg.start + tau - known.t < 0.6 ? known : this.shape(seg, figure, this.ballAt(seg), tau);
  }

  /** Hráč doběhne na místo v čase tau1, nejdřív ale tak, jak stihne sprintem. Vrací čas doběhnutí. */
  private run(seg: Segment, figure: number, tau0: number, tau1: number, to: Point): number {
    const from = this.startOf(seg, figure, tau0);
    const track = (seg.actors.get(figure) ?? []).filter((k) => k.t < tau0);
    const arrive = Math.max(tau1, tau0 + dist(from, to) / SPRINT_SPEED);
    track.push({ t: tau0, x: from.x, z: from.z, h: 0, arc: 0 }, { t: arrive, x: to.x, z: to.z, h: 0, arc: 0 });
    seg.actors.set(figure, track);
    return arrive;
  }

  /** Přihrávka: míč letí na místo a příjemce tam (0,5 m za míčem) doběhne. Vrací čas příjmu. */
  private pass(seg: Segment, tau: number, receiver: number, spot: Point, opts: { arc?: number; h?: number; speed?: number } = {}): number {
    this.holdBall(seg, tau);
    const from = this.ballAt(seg);
    const d = Math.max(0.001, dist(from, spot));
    const stand = { x: spot.x + ((spot.x - from.x) / d) * 0.5, z: spot.z + ((spot.z - from.z) / d) * 0.5 };
    const runTime = dist(this.startOf(seg, receiver, tau), stand) / RUN_SPEED;
    const duration = clamp(Math.max(d / (opts.speed ?? 15), runTime), 0.45, 2.6);
    this.ballKey(seg, tau + duration, spot, opts.h ?? 0, opts.arc ?? 0);
    this.run(seg, receiver, tau, tau + duration, stand);
    this.owner = receiver;
    return tau + duration;
  }

  /** Vedení míče: hráč běží, míč půl metru před ním. */
  private carry(seg: Segment, tau: number, minDuration: number, figure: number, to: Point): number {
    this.holdBall(seg, tau);
    const from = this.ballAt(seg);
    const d = Math.max(0.001, dist(from, to));
    const duration = Math.max(minDuration, d / (RUN_SPEED - 1));
    this.ballKey(seg, tau + duration, to);
    this.run(seg, figure, tau, tau + duration, { x: to.x - ((to.x - from.x) / d) * 0.5, z: to.z - ((to.z - from.z) / d) * 0.5 });
    return tau + duration;
  }

  private kickoff(side: Side, duration: number, snap = false) {
    this.ball = { x: 0, z: 0 };
    this.owner = null;
    this.close(this.open({ kind: "kickoff" }, side, snap), duration);
  }

  /** Hra mezi událostmi: přihrávky týmu, který jde do další akce, míč se posouvá k jejímu místu. */
  private buildUp(minute: number, side: Side, targetU: number) {
    const duration = clamp(Math.max((minute - this.lastMinute) * 1.1, this.pendingNotes.length * 2.4), 1.6, 7.5);
    const seg = this.open({ kind: "play" }, side);
    this.flushNotes(this.t, duration / Math.max(1, this.pendingNotes.length));
    this.minutes.push({ t: this.t, minute: this.lastMinute });

    let tau = 0;
    const startU = worldToUv(side, this.half, this.ball).u;
    while (tau < duration - 0.9) {
      const progress = clamp((tau + 1.5) / duration, 0, 1);
      const desired = uvToWorld(side, this.half, lerp(startU, targetU, progress), (this.rng() * 2 - 1) * 0.7);
      const candidates = this.onPitch(side).filter((f) => f !== this.owner && (this.figures[f].role !== "GK" || progress < 0.15));
      if (!candidates.length) break;
      const receiver = candidates.reduce((best, f) =>
        dist(this.shape(seg, f, desired, tau), desired) < dist(this.shape(seg, best, desired, tau), desired) ? f : best);
      const spot = this.shape(seg, receiver, desired, tau + 1);
      tau = this.pass(seg, tau, receiver, { x: spot.x + (this.rng() - 0.5) * 2, z: spot.z + (this.rng() - 0.5) * 2 });
      const b = this.ballAt(seg);
      tau = this.carry(seg, tau, 0.5 + this.rng() * 0.6, receiver, { x: b.x + (this.rng() - 0.5) * 1.5, z: b.z + attackSign(side, this.half) * (1 + this.rng() * 2) });
    }
    this.lastMinute = minute;
    this.close(seg, Math.max(tau, 0.8));
    this.minutes.push({ t: this.t, minute });
  }

  /**
   * Střela: míč letí na cíl, brankář reaguje, pak dohra podle výsledku.
   * Vrací, kdy míč dorazil k bráně, a kdy dohra skončila.
   */
  private shot(seg: Segment, tau: number, side: Side, result: ShotResult, opts: { blocker?: number | null; speed?: number } = {}) {
    const gz = this.goalZ(side);
    const s = Math.sign(gz);
    const defending = other(side);
    const gk = this.keeper(defending);
    this.holdBall(seg, tau);
    const from = this.ballAt(seg);
    const flight = (to: Point) => clamp(dist(from, to) / (opts.speed ?? 24), 0.3, 1.1);
    const gkSpot = (x: number): Point => ({ x, z: gz - s * 0.6 });
    const dive = (x: number): Pose => (x > 0 ? "diveRight" : "diveLeft");
    if (gk !== null) this.run(seg, gk, Math.max(0, tau - 0.4), tau, gkSpot(clamp(from.x * 0.15, -1, 1)));

    if (result === "goal") {
      const x = this.sign() * (1 + this.rng() * 2.3);
      const arrive = tau + flight({ x, z: gz });
      this.ballKey(seg, arrive, { x, z: gz }, 0.3 + this.rng() * 1.7, 0.4);
      this.ballKey(seg, arrive + 0.25, { x: x * 0.9, z: gz + s * 1.3 }, 0.15);
      if (gk !== null) {
        const wrongWay = -Math.sign(x) * 1.6;
        this.run(seg, gk, tau, arrive, gkSpot(wrongWay));
        seg.poses.push({ figure: gk, from: tau + 0.1, to: arrive + 1.2, value: dive(wrongWay) });
      }
      return { arrive, end: arrive + 0.6 };
    }
    if (result === "saved" && gk !== null) {
      const catchAt = gkSpot(this.sign() * (0.4 + this.rng() * 2.2));
      const arrive = tau + flight(catchAt);
      this.ballKey(seg, arrive, catchAt, 0.5 + this.rng(), 0.3);
      this.run(seg, gk, tau, arrive, catchAt);
      if (Math.abs(catchAt.x) > 1.2) seg.poses.push({ figure: gk, from: tau + 0.1, to: arrive + 0.6, value: dive(catchAt.x) });
      this.holdBall(seg, arrive + 1.1);
      this.owner = gk;
      return { arrive, end: this.clearance(seg, arrive + 1.1, defending) };
    }
    if (result === "post" || result === "bar") {
      const x = result === "post" ? this.sign() * GOAL_HALF_W : (this.rng() - 0.5) * 5;
      const arrive = tau + flight({ x, z: gz });
      this.ballKey(seg, arrive, { x, z: gz }, result === "bar" ? GOAL_H : 0.5 + this.rng() * 1.3, 0.4);
      const rebound = { x: x * 1.6, z: gz - s * (7 + this.rng() * 4) };
      this.ballKey(seg, arrive + 0.8, rebound, 0, result === "bar" ? 2.5 : 0.8);
      const defender = this.teammate(defending, [], ["DEF"]);
      if (defender === null) return { arrive, end: arrive + 1.2 };
      this.run(seg, defender, tau, arrive + 0.8, rebound);
      this.owner = defender;
      return { arrive, end: this.clearance(seg, arrive + 1.1, defending) };
    }
    if (result === "blocked") {
      const blocker = opts.blocker ?? this.teammate(defending, [], ["DEF"]);
      const toGoal = Math.max(0.001, dist(from, { x: 0, z: gz }));
      const blockAt = { x: from.x - (from.x / toGoal) * 2.6, z: from.z + ((gz - from.z) / toGoal) * 2.6 };
      if (blocker !== null) this.run(seg, blocker, Math.max(0, tau - 1.6), tau + 0.15, blockAt);
      this.ballKey(seg, tau + 0.15, blockAt, 0.4);
      this.ballKey(seg, tau + 0.9, { x: clamp(blockAt.x + this.sign() * 7, -HALF_W + 1, HALF_W - 1), z: blockAt.z + s * 5 }, 0, 1.5);
      this.owner = null;
      return { arrive: tau + 0.15, end: tau + 1.6 };
    }
    // Vedle, nad (nebo „chycená“ střela bez brankáře): míč za lajnou, od malého vápna se kope dál.
    const x = result === "over" ? (this.rng() - 0.5) * 6 : this.sign() * (GOAL_HALF_W + 0.8 + this.rng() * 3);
    const arrive = tau + flight({ x, z: gz });
    this.ballKey(seg, arrive, { x, z: gz }, result === "over" ? 3.3 : 0.4 + this.rng(), 0.5);
    this.ballKey(seg, arrive + 0.35, { x, z: gz + s * 3 }, 0.2);
    this.holdBall(seg, arrive + 1.4);
    const restart = { x: this.sign() * 3, z: gz - s * 5 };
    this.ballKey(seg, arrive + 1.45, restart);
    if (gk !== null) {
      this.run(seg, gk, arrive + 0.3, arrive + 1.8, { x: restart.x, z: restart.z + s * 0.6 });
      this.owner = gk;
    }
    return { arrive, end: this.clearance(seg, arrive + 2, defending) };
  }

  /** Odkop k vlastnímu hráči do středu hřiště. */
  private clearance(seg: Segment, tau: number, side: Side): number {
    const receiver = this.teammate(side, [this.owner], ["MID", "FWD"]);
    if (receiver === null) return tau;
    return this.pass(seg, tau, receiver, uvToWorld(side, this.half, 0.45, (this.rng() - 0.5) * 1.2), { arc: 6, speed: 20 });
  }

  /** Gól: skóre z události (detail „h:a“), titulek, střelec slaví u rohového praporku, pak výkop soupeře. */
  private goalScored(seg: Segment, tau: number, goal: MatchEvent, scorer: number | null, side: Side, text: string | null, end: number) {
    const [home, away] = (goal.detail ?? "").split(":").map(Number);
    this.scores.push({ t: seg.start + tau, home, away });
    this.caption(seg.start + tau, text ?? "Gól!", "goal");
    if (scorer !== null) {
      const gz = this.goalZ(side);
      this.run(seg, scorer, tau, tau + 2.6, { x: Math.sign(this.ballAt(seg).x || 1) * (HALF_W - 3), z: gz - Math.sign(gz) * 3 });
      seg.poses.push({ figure: scorer, from: tau + 0.8, to: tau + 3.6, value: "celebrate" });
    }
    this.close(seg, Math.max(end, tau + 3.6));
    this.kickoff(other(side), 2.4);
  }

  private openPlayShot(e: MatchEvent, side: Side, assister: number | null, result: ShotResult, text: string, afterText: string | null, blocker: number | null = null) {
    const shooter = this.figureOf(e);
    if (shooter === null) return this.note(e, text);
    const seg = this.open({ kind: "play" }, side);
    // U gólu se titulek ukáže až s gólem, ať se nic nevyzradí předem.
    if (result !== "goal") this.caption(this.t, text);
    const fwd = attackSign(side, this.half);
    const laneOf = (figure: number) => worldToUv(side, this.half, this.shape(seg, figure, this.ball, 0)).v;
    const shotU = e.source === "scramble" ? 0.92 : this.figures[shooter].role === "FWD" ? 0.86 : 0.8;
    const shotSpot = uvToWorld(side, this.half, shotU, clamp(laneOf(shooter) * 0.5, -0.35, 0.35));
    const helper = assister ?? this.teammate(side, [shooter], ["MID", "FWD"]);

    let tau: number;
    if (e.source === "counter") {
      // Brejk: zisk míče ve vlastní polovině a sprint k bráně.
      tau = this.pass(seg, 0, shooter, uvToWorld(side, this.half, 0.45, -worldToUv(side, this.half, this.ball).v), { speed: 12 });
      tau = this.carry(seg, tau, 2.4, shooter, shotSpot);
    } else if (helper !== null) {
      const cross = e.source === "cross";
      const helperSpot = cross
        ? uvToWorld(side, this.half, 0.86, (Math.sign(laneOf(helper)) || this.sign()) * 0.9)
        : uvToWorld(side, this.half, 0.7, (this.rng() - 0.5) * 0.8);
      tau = this.pass(seg, 0, helper, helperSpot);
      const b = this.ballAt(seg);
      tau = this.carry(seg, tau, 0.8, helper, { x: b.x * 0.92, z: b.z + fwd * 1.5 });
      tau = this.pass(seg, tau, shooter, shotSpot, cross ? { arc: 3.2, h: 1.0, speed: 17 } : {});
    } else {
      tau = this.carry(seg, 0, 2.2, shooter, shotSpot);
    }
    const { arrive, end } = this.shot(seg, tau + 0.3, side, result, { blocker });
    if (result === "goal") {
      if (afterText) this.caption(seg.start + arrive + 2.2, afterText);
      return this.goalScored(seg, arrive, e, shooter, side, text, end);
    }
    if (afterText) this.caption(seg.start + arrive + 0.3, afterText);
    this.close(seg, end + 0.4);
  }

  /** Roh nebo centr ze standardky: rozestavení do vápna, centr, hlavička (nebo obrana odhlavičkuje). */
  private crossSetPiece(e: MatchEvent, side: Side, finisherIndex: number | undefined, result: ShotResult | null, text: string, finisherText: string | null) {
    const taker = this.figureOf(e);
    if (taker === null) return this.note(e, text);
    const finisherEvent = finisherIndex === undefined ? null : this.input.events[finisherIndex];
    const finisher = finisherEvent ? this.figureOf(finisherEvent) : null;
    const gz = this.goalZ(side);
    const s = Math.sign(gz);
    this.ball = e.type === "corner"
      ? { x: this.sign() * (HALF_W - 0.3), z: gz - s * 0.3 }
      : { x: this.sign() * (13 + this.rng() * 5), z: gz - s * (12 + this.rng() * 6) };
    const seg = this.open({ kind: "box", attacker: side }, side);
    this.caption(this.t, text);
    const target = { x: (this.rng() - 0.5) * 6, z: gz - s * (5 + this.rng() * 3) };
    const takerReady = this.run(seg, taker, 0, 1.2, { x: this.ball.x * 1.03, z: this.ball.z + s * 0.6 });
    const finisherReady = finisher !== null ? this.run(seg, finisher, 0, 1.2, { x: target.x * 0.7, z: target.z - s * 2 }) : 0;
    const kick = Math.max(2.4, takerReady + 0.4, finisherReady);
    const cross = { arc: 4, h: 1.9, speed: 16 };
    if (finisher === null || result === null || finisherEvent === null) {
      const defender = this.teammate(other(side), [], ["DEF"]);
      if (defender !== null) this.pass(seg, kick, defender, target, cross);
      return this.close(seg, this.clearance(seg, this.ballAt(seg).t, other(side)) + 0.3);
    }
    const tau = this.pass(seg, kick, finisher, target, cross);
    const { arrive, end } = this.shot(seg, tau, side, result, { speed: 18 });
    if (result === "goal") return this.goalScored(seg, arrive, finisherEvent, finisher, side, finisherText, end);
    if (finisherText) this.caption(seg.start + arrive, finisherText);
    this.close(seg, end + 0.4);
  }

  /** Penalta nebo přímý kop: míč na místě, rozběh, střela. */
  private placedShot(e: MatchEvent, side: Side, spot: Point, result: ShotResult, text: string, afterText: string | null, finisherIndex: number | undefined) {
    const kicker = this.figureOf(e);
    if (kicker === null) return this.note(e, text);
    const isPenalty = e.type === "penalty";
    this.ball = spot;
    const seg = this.open(isPenalty ? { kind: "penalty", attacker: side } : { kind: "play" }, side);
    this.caption(this.t, text, isPenalty ? "penalty" : undefined);
    const toGoal = Math.max(0.001, dist(spot, { x: 0, z: this.goalZ(side) }));
    const dir = { x: -spot.x / toGoal, z: (this.goalZ(side) - spot.z) / toGoal };
    const ready = this.run(seg, kicker, 0, 2, { x: spot.x - dir.x * 2.8 - dir.z * 1.2, z: spot.z - dir.z * 2.8 + dir.x * 1.2 });
    const kick = this.run(seg, kicker, ready + 0.6, ready + 1.6, { x: spot.x - dir.x * 0.5, z: spot.z - dir.z * 0.5 });
    const { arrive, end } = this.shot(seg, kick, side, result, { speed: isPenalty ? 26 : 20 });
    if (result === "goal" && finisherIndex !== undefined) return this.goalScored(seg, arrive, this.input.events[finisherIndex], kicker, side, afterText, end);
    if (afterText) this.caption(seg.start + arrive, afterText);
    this.close(seg, end + 0.4);
  }

  private foul(e: MatchEvent, side: Side, text: string, card: { event: MatchEvent; text: string } | null) {
    const fouler = this.figureOf(e);
    if (fouler === null) return this.note(e, text);
    const seg = this.open({ kind: "play" }, other(side));
    this.caption(this.t, text);
    const b = this.ballAt(seg);
    // Faulovaný je hráč u míče, jinak nejbližší soupeř.
    const victim = this.owner !== null && this.sideOfFigure(this.owner) !== side
      ? this.owner
      : this.onPitch(other(side)).sort((x, y) => dist(this.startOf(seg, x, 0), b) - dist(this.startOf(seg, y, 0), b))[0] ?? null;
    const contact = this.run(seg, fouler, 0, 0.65, { x: b.x + 0.6, z: b.z + 0.4 });
    if (victim !== null) {
      this.run(seg, victim, 0, contact, b);
      this.run(seg, victim, contact, contact + 1.8, b);
      seg.poses.push({ figure: victim, from: contact, to: contact + 1.7, value: "down" });
    }
    const red = card?.event.detail === "red";
    if (card) this.caption(seg.start + contact + 0.8, card.text, red ? "red" : "yellow");
    const duration = contact + (card ? 3 : 1.8);
    this.holdBall(seg, duration);
    this.lastMinute = e.minute;
    this.close(seg, duration);
    if (red) this.sendOff(fouler);
  }

  private card(e: MatchEvent, text: string) {
    const figure = this.figureOf(e);
    this.caption(this.t, text, e.detail === "red" ? "red" : "yellow");
    if (e.detail === "red" && figure !== null) this.sendOff(figure);
  }

  /** Vyloučený hráč odejde k nejbližší lajně a jeho místo zůstane prázdné. */
  private sendOff(figure: number) {
    const side = this.sideOfFigure(figure);
    const seg = this.open({ kind: "play" }, this.possession);
    this.leave(seg, figure, 3);
    this.slots[side] = this.slots[side].map((f) => (f === figure ? null : f));
    seg.slots[side] = [...this.slots[side]];
    this.holdBall(seg, 3);
    this.close(seg, 3);
  }

  private leave(seg: Segment, figure: number, duration: number) {
    const from = this.startOf(seg, figure, 0);
    seg.actors.set(figure, [
      { t: 0, x: from.x, z: from.z, h: 0, arc: 0 },
      { t: duration, x: Math.sign(from.x || 1) * (HALF_W + 1.5), z: from.z, h: 0, arc: 0 },
    ]);
    seg.leaving.push(figure);
  }

  private injury(e: MatchEvent, text: string) {
    const figure = this.figureOf(e);
    if (figure === null) return this.note(e, text);
    const seg = this.open({ kind: "play" }, this.possession);
    this.caption(this.t, text);
    this.run(seg, figure, 0, 3.2, this.startOf(seg, figure, 0));
    seg.poses.push({ figure, from: 0.3, to: 3.2, value: "down" });
    this.holdBall(seg, 3.2);
    this.lastMinute = e.minute;
    this.close(seg, 3.2);
  }

  /** Střídání: odcházející jde k nejbližší lajně, nový hráč vběhne od střídaček na jeho místo. */
  private substitution(e: MatchEvent, text: string) {
    const incoming = this.figureOf(e);
    const side = sideOfTeam(e.teamId);
    // „X za Y“, u vyloučeného brankáře „X jde do brány za vyloučeného gólmana, ven jde Y“.
    const outName = e.description.match(/(?: za | ven jde )([^,]+)$/)?.[1]?.trim();
    const outgoing = this.onPitch(side).find((f) => this.figures[f].player.name === outName) ?? null;
    if (incoming === null || outgoing === null) return this.note(e, text);
    const seg = this.open({ kind: "play" }, this.possession);
    this.caption(this.t, text);
    this.leave(seg, outgoing, 3.4);
    this.figures[incoming].role = e.description.includes("do brány") ? "GK" : this.figures[outgoing].role;
    this.slots[side] = this.slots[side].map((f) => (f === outgoing ? incoming : f));
    seg.slots[side] = [...this.slots[side]];
    const target = this.shape(seg, incoming, this.ballAt(seg), 3.4);
    const entry = { x: BENCH_ENTRY.x + 1, z: BENCH_ENTRY.z };
    const arrive = Math.max(3.4, 0.6 + dist(entry, target) / RUN_SPEED);
    seg.actors.set(incoming, [
      { t: 0, ...BENCH_ENTRY, h: 0, arc: 0 },
      { t: 0.6, ...entry, h: 0, arc: 0 },
      { t: arrive, ...target, h: 0, arc: 0 },
    ]);
    this.holdBall(seg, arrive);
    this.lastMinute = e.minute;
    this.close(seg, arrive);
  }

  private halfTime(text: string) {
    this.flushNotes(this.t);
    this.minutes.push({ t: this.t, minute: 45 });
    this.caption(this.t, text);
    this.half = 2;
    this.lastMinute = 45;
    this.kickoff("away", 3.5, true);
    this.minutes.push({ t: this.t, minute: 46 });
  }

  private fullTime(minute: number, text: string) {
    this.flushNotes(this.t);
    this.minutes.push({ t: this.t, minute: Math.max(minute, 90) });
    const seg = this.open({ kind: "play" }, this.possession);
    this.caption(this.t, text);
    this.holdBall(seg, 3);
    this.close(seg, 3);
  }
}
