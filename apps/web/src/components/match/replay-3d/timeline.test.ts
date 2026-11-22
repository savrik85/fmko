import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { MatchEvent } from "@okresni-masina/shared";
import { attackSign, BENCH_ENTRY, CAPTION_GAP, HALF_L, HALF_W, LEAVING, OFF, ON, REPLAY_HZ, ReplayPlan, type ReplayInput, type ReplayPlayer } from "./timeline";
import { replayInputOf } from "./useMatchReplay";
import fixture from "./timeline.fixture.json";

// ── Meze pohybu (fyzika člověka a míče, ne nastavení simulace) ──
const MAX_SPEED = 9;
const MAX_ACCEL = 6;
const CREEP = [0.05, 1.2];
const MAX_CREEP_SHARE = 0.1;
const MAX_BALL_SPEED = 40;
const BALL_REACH = 1;
const MIN_GAP = 0.7;
const MAX_CLOSE_TICKS = 0.5 * REPLAY_HZ;
const BOX = { halfWidth: 11, depth: 18 };
const MIN_KEEPER_IN_BOX = 0.99;

/** Porušení pravidel v odsimulovaném záznamu; prázdný seznam = záznam je v pořádku. */
function violations(input: ReplayInput): string[] {
  const plan = new ReplayPlan(input);
  const s = plan.samples;
  const n = plan.figures.length;
  const out: string[] = [];
  const at = (k: number) => `${(k / REPLAY_HZ).toFixed(2)} s`;
  const fail = (rule: string, k: number, detail = "") => {
    if (out.filter((v) => v.startsWith(rule)).length < 3) out.push(`${rule} @ ${at(k)} ${detail}`);
  };
  const half = (k: number) => (s.cut >= 0 && k >= s.cut ? 2 : 1);
  const starters = { home: input.home.starters.length, away: input.away.starters.length };
  let creep = 0;
  let moving = 0;
  let keeperSamples = 0;
  let keeperIn = 0;
  const close = new Map<string, number>();

  for (let k = 0; k < s.ticks; k++) {
    const onPitch = { home: 0, away: 0 };
    for (let i = 0; i < n; i++) {
      const j = k * n + i;
      const side = plan.figures[i].side;
      if (s.state[j] === ON) onPitch[side]++;
      if (s.state[j] === OFF) continue;
      if (Math.abs(s.x[j]) > HALF_W + 2 || Math.abs(s.z[j]) > HALF_L + 2) fail("mimo hřiště", k, `#${i}`);
      const was = k > 0 && s.state[j - n] !== OFF;
      if (!was && k > 0 && Math.hypot(s.x[j] - BENCH_ENTRY.x, s.z[j] - BENCH_ENTRY.z) > 1.5) fail("náhradník nevběhl od střídaček", k, `#${i}`);
      if (k + 1 < s.ticks && s.state[j + n] === OFF && Math.abs(s.x[j]) < HALF_W) fail("hráč zmizel mimo lajnu", k, `#${i}`);
      if (was && k !== s.cut) {
        const vx = (s.x[j] - s.x[j - n]) * REPLAY_HZ;
        const vz = (s.z[j] - s.z[j - n]) * REPLAY_HZ;
        const v = Math.hypot(vx, vz);
        if (v > MAX_SPEED) fail("rychlost hráče", k, `#${i} ${v.toFixed(1)} m/s`);
        if (v >= CREEP[0] && v < CREEP[1]) creep++;
        moving++;
        if (k > 1 && s.state[j - 2 * n] !== OFF && k - 1 !== s.cut) {
          const a = Math.hypot(vx - (s.x[j - n] - s.x[j - 2 * n]) * REPLAY_HZ, vz - (s.z[j - n] - s.z[j - 2 * n]) * REPLAY_HZ) * REPLAY_HZ;
          if (a > MAX_ACCEL + 1e-3) fail("zrychlení hráče", k, `#${i} ${a.toFixed(1)} m/s²`);
        }
      }
      if (s.keeper[j] && s.state[j] === ON) {
        const own = -attackSign(side, half(k)) * HALF_L;
        keeperSamples++;
        if (Math.abs(s.x[j]) <= BOX.halfWidth && Math.abs(own - s.z[j]) <= BOX.depth) keeperIn++;
        if (Math.sign(s.z[j]) === -Math.sign(own) && Math.abs(s.z[j]) > 0.5) fail("brankář za půlkou", k, `#${i}`);
      }
      for (let i2 = i + 1; i2 < n; i2++) {
        const j2 = k * n + i2;
        if (s.state[j2] === OFF) continue;
        const key = `${i}-${i2}`;
        const near = Math.hypot(s.x[j] - s.x[j2], s.z[j] - s.z[j2]) < MIN_GAP;
        const foul = s.fouls.some((f) => ((f.a === i && f.b === i2) || (f.a === i2 && f.b === i)) && k >= f.from && k <= f.to);
        const ticks = near && !foul ? (close.get(key) ?? 0) + 1 : 0;
        close.set(key, ticks);
        if (ticks === MAX_CLOSE_TICKS + 1) fail("hráči v sobě", k, `#${i} #${i2}`);
      }
    }
    const reds = (side: "home" | "away") => s.sentOff.filter((r) => r.tick <= k && plan.figures[r.figure].side === side).length;
    for (const side of ["home", "away"] as const) {
      if (onPitch[side] !== starters[side] - reds(side)) fail("počet hráčů na hřišti", k, `${side} ${onPitch[side]}`);
    }
    if (k > 0 && k !== s.cut) {
      const v = Math.hypot(s.ballX[k] - s.ballX[k - 1], s.ballZ[k] - s.ballZ[k - 1], s.ballH[k] - s.ballH[k - 1]) * REPLAY_HZ;
      if (v > MAX_BALL_SPEED) fail("rychlost míče", k, `${v.toFixed(1)} m/s`);
    }
    const o = s.owner[k];
    if (o >= 0 && Math.hypot(s.ballX[k] - s.x[k * n + o], s.ballZ[k] - s.z[k * n + o]) > BALL_REACH) fail("míč daleko od hráče", k, `#${o}`);
  }
  for (let i = 0; i < n; i++) {
    let intervals = 0;
    for (let k = 0; k < s.ticks; k++) if (s.state[k * n + i] !== OFF && (k === 0 || s.state[(k - 1) * n + i] === OFF)) intervals++;
    if (intervals > 1) fail("hráč se vrátil na hřiště", 0, `#${i}`);
  }
  if (moving && creep / moving >= MAX_CREEP_SHARE) out.push(`plížení ${((100 * creep) / moving).toFixed(1)} %`);
  if (keeperSamples && keeperIn / keeperSamples < MIN_KEEPER_IN_BOX) out.push(`brankář mimo vápno ${((100 * (1 - keeperIn / keeperSamples))).toFixed(1)} %`);
  const final = plan.scoreAt(plan.duration);
  if (final.home !== input.score.home || final.away !== input.score.away) out.push(`skóre ${final.home}:${final.away} místo ${input.score.home}:${input.score.away}`);
  let minute = 0;
  for (let t = 0; t <= plan.duration; t += 0.25) {
    const m = plan.minuteAt(t);
    if (m < minute) fail("čas jde pozpátku", t * REPLAY_HZ);
    minute = m;
  }
  const times = plan.captionTimes();
  times.forEach((t, i) => i > 0 && t - times[i - 1] < CAPTION_GAP - 1e-9 && fail("titulky moc rychle", t * REPLAY_HZ));
  // Titulek sedí s děním: zraněný leží, vyloučený odchází, při gólu je míč v bráně, střídající u střídaček.
  const captions = (plan as unknown as { captions: { t: number; banner?: string; figures: number[] }[] }).captions;
  const tick = (t: number) => Math.min(s.ticks - 1, Math.round(t * REPLAY_HZ));
  for (const c of captions) {
    const f = c.figures[0];
    const at = (dt: number) => tick(c.t + dt) * n + f;
    if (c.banner === "injury" && s.pose[at(0.5)] !== 1) fail("zraněný při titulku neleží", tick(c.t), `#${f}`);
    if (c.banner === "red" && ![0.5, 1, 1.5].some((dt) => s.state[at(dt)] === LEAVING)) fail("vyloučený při titulku neodchází", tick(c.t), `#${f}`);
    if (c.banner === "sub" && Math.hypot(s.x[at(0)] - BENCH_ENTRY.x, s.z[at(0)] - BENCH_ENTRY.z) > 3) fail("střídající při titulku není u střídaček", tick(c.t), `#${f}`);
    if (c.banner === "goal" && ![-0.2, 0, 0.3].some((dt) => Math.abs(s.ballZ[tick(c.t + dt)]) > HALF_L - 1)) fail("při titulku gólu míč není v bráně", tick(c.t));
  }
  return out;
}

// ── Vstupy ──

const base = replayInputOf(fixture as unknown as Record<string, unknown>)!;
const clone = (): ReplayInput => JSON.parse(JSON.stringify(base));
const ev = (minute: number, type: MatchEvent["type"], teamId: number, playerId: number, extra: Partial<MatchEvent> = {}): MatchEvent =>
  ({ minute, type, teamId, playerId, playerName: "", description: "", ...extra });
const player = (id: string, position: string): ReplayPlayer => ({ id, name: `Hráč ${id}`, position });
const lineup = (prefix: string) => ["GK", "DEF", "DEF", "DEF", "DEF", "MID", "MID", "MID", "MID", "FWD", "FWD"].map((p, i) => player(`${prefix}${i}`, p));
/** Zápas má šance průběžně celých 90 minut, ať je délka záznamu jako u skutečného. */
const filler = Array.from({ length: 15 }, (_, i) => ev(i * 6 + 2, "chance", 1 + (i % 2), i % 2 ? 110 : 10, { detail: "vedle", description: "Šance, vedle." }));
const hand = (events: MatchEvent[], score = { home: 0, away: 0 }): ReplayInput => ({
  matchId: "ruční", events: [...filler, ...events].sort((a, b) => a.minute - b.minute), commentary: [], score,
  home: { name: "Domácí", kit: { shirt: "#1E5AA8", shorts: "#fff", socks: "#1E5AA8" }, starters: lineup("h"), subs: [player("h-s1", "MID")] },
  away: { name: "Hosté", kit: { shirt: "#D94032", shorts: "#000", socks: "#D94032" }, starters: lineup("a"), subs: [player("a-s1", "FWD")] },
});

describe("3D záznam: pohyb podle pravidel", () => {
  it("ručně složené události", () => {
    const cases: [string, ReplayInput][] = [
      ["gól, roh, penalta", hand([
        ev(10, "goal", 1, 10, { detail: "1:0" }),
        ev(30, "corner", 2, 108), ev(30, "goal", 2, 110, { detail: "1:1" }),
        ev(60, "penalty", 1, 11), ev(60, "chance", 1, 11, { detail: "penalty_saved" }),
        ev(80, "freekick", 2, 108, { detail: "direct" }), ev(80, "goal", 2, 108),
      ], { home: 1, away: 2 })],
      ["červená a střídání", hand([
        ev(20, "foul", 1, 3), ev(20, "card", 1, 3, { detail: "red" }),
        ev(50, "substitution", 2, 112, { playerName: "Hráč a-s1", description: "Střídání: Hráč a-s1 za Hráč a9" }),
        ev(70, "card", 2, 102, { detail: "red" }),
      ])],
      ["vyloučený brankář", hand([
        ev(30, "card", 1, 1, { detail: "red" }),
        ev(30, "substitution", 1, 12, { playerName: "Hráč h-s1", description: "Hráč h-s1 jde do brány za vyloučeného gólmana, ven jde Hráč h9" }),
        ev(70, "chance", 2, 110, { detail: "chytil brankář" }),
      ])],
      ["bez událostí v druhém poločase", hand([ev(5, "chance", 1, 10, { detail: "vedle" })])],
    ];
    for (const [name, input] of cases) expect(violations(input), name).toEqual([]);
  }, 60_000);

  it("skutečný zápas a jeho porušené kopie", () => {
    const usedSubs = new Set(base.events.filter((e) => e.type === "substitution").map((e) => e.playerName));
    const mutations: [string, (m: ReplayInput) => void][] = [
      ["beze změny", () => {}],
      ["střídající chybí v lavičce", (m) => { for (const t of [m.home, m.away]) t.subs = t.subs.filter((p) => !usedSubs.has(p.name)); }],
      ["bez poločasu a konce", (m) => { m.events = m.events.filter((e) => e.detail !== "half_time" && e.detail !== "full_time"); }],
      ["góly bez skóre", (m) => { for (const e of m.events) if (e.type === "goal") delete e.detail; }],
      ["bez komentáře", (m) => { m.commentary = []; }],
      ["neznámý typ události", (m) => { m.events.splice(5, 0, ev(m.events[5].minute, "mystery" as MatchEvent["type"], 1, 4, { description: "?" })); }],
      ["prázdná lavička", (m) => { m.home.subs = []; m.away.subs = []; }],
      ["sedm v základu", (m) => { m.home.starters = m.home.starters.slice(0, 7); m.away.starters = m.away.starters.slice(0, 7); }],
      ["nečitelné střídání", (m) => { for (const e of m.events) if (e.type === "substitution") e.description = "Střídání"; }],
    ];
    for (const [name, mutate] of mutations) {
      const m = clone();
      mutate(m);
      expect(violations(m), name).toEqual([]);
    }
  }, 120_000);

  const dump = process.env.REPLAY_MATCHES;
  it.skipIf(!dump)("každý odehraný zápas z lokální databáze", () => {
    const matches = JSON.parse(readFileSync(dump!, "utf8")) as Record<string, unknown>[];
    const failed: string[] = [];
    let played = 0;
    let empty = 0;
    for (const m of matches) {
      // Zápas bez událostí (kontumace, zkrácený pohár) nejde přehrát ani ve 2D.
      if (!(m.events as unknown[] | undefined)?.length) {
        empty++;
        continue;
      }
      const input = replayInputOf(m);
      if (!input) {
        failed.push(`${m.competition} ${m.id}: nejde přehrát ve 3D`);
        continue;
      }
      played++;
      const v = violations(input);
      if (v.length) failed.push(`${m.competition} ${m.id}: ${v.join("; ")}`);
    }
    const by = (c: string) => matches.filter((m) => m.competition === c && (m.events as unknown[] | undefined)?.length).length;
    console.log(`3D záznam: ${played} zápasů (liga ${by("league")}, přáteláky ${by("friendly")}, pohár ${by("cup")}, turnaj ${by("tournament")}), ${empty} bez událostí, ${failed.length} s porušením`);
    expect(failed).toEqual([]);
  }, 1_800_000);
});
