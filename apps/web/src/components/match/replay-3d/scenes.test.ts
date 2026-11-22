// Spouští se z kořene repa: npx vitest run --root apps/web
// S REPLAY_MATCHES=<soubor JSON s detaily zápasů> projde i všechny zápasy z místní databáze.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { HALF_L, HALF_W, Replay, sampleClip, scenedEvents, sceneTime, shootoutEvents, type Frame, type ReplayEvent, type ReplayInput, type ReplayPlayer, type Scene } from "./scenes";

const kit = { shirt: "#B91C1C", shorts: "#111827", socks: "#B91C1C" };
const squad = (prefix: string): ReplayPlayer[] => ["GK", "DEF", "DEF", "DEF", "DEF", "MID", "MID", "MID", "MID", "FWD", "FWD"]
  .map((position, n) => ({ id: `${prefix}${n}`, name: `${prefix} ${n}`, position }));
const event = (minute: number, type: string, teamId: 1 | 2, slot: number, extra: Partial<ReplayEvent> = {}): ReplayEvent => {
  const playerId = slot + (teamId === 1 ? 1 : 101);
  const playerName = slot >= 11 ? `Sub ${teamId}` : `${teamId === 1 ? "H" : "A"} ${slot}`;
  return { minute, type, playerId, playerName, teamId, description: `${type} ${playerName}`, ...extra };
};
const input = (events: ReplayEvent[]): ReplayInput => ({
  matchId: "test", events,
  home: { name: "Domácí", kit, starters: squad("H"), subs: [{ id: "hs", name: "Sub 1", position: "MID" }] },
  away: { name: "Hosté", kit, starters: squad("A"), subs: [] },
});

/** Projde scénu po 1/30 s a vrátí, co je na ní špatně. */
function problems(replay: Replay, scene: Scene, label: string): string[] {
  const frame: Frame = { figures: replay.figures.map(() => ({ visible: false, x: 0, y: 0, z: 0, pose: null })), ballX: 0, ballY: 0, ballZ: 0, cuts: 0 };
  const found = new Set<string>();
  let prev: { x: number; z: number; visible: boolean }[] | null = null, prevCuts = 0;
  for (let n = 0; scene.start + (n - 1) / 30 < scene.end; n++) {
    const t = Math.min(scene.start + n / 30, sceneTime(scene, false, Infinity));
    sampleClip(scene.clip, t, frame);
    const now = frame.figures.map((f) => ({ x: f.x, z: f.z, visible: f.visible }));
    if (![frame.ballX, frame.ballY, frame.ballZ, ...now.flatMap((f) => (f.visible ? [f.x, f.z] : []))].every(Number.isFinite)) found.add("poloha není číslo");
    if (Math.abs(frame.ballX) > HALF_W + 12 || Math.abs(frame.ballZ) > HALF_L + 14) found.add("míč je daleko mimo hřiště");
    now.forEach((f, i) => {
      if (!f.visible) return;
      if (Math.abs(f.x) > HALF_W + 4 || Math.abs(f.z) > HALF_L + 2) found.add(`figura ${i} je mimo hřiště`);
      const before = prev?.[i];
      if (before?.visible && frame.cuts === prevCuts && Math.hypot(f.x - before.x, f.z - before.z) * 30 > 9.5) found.add(`figura ${i} běží rychleji než 9,5 m/s`);
    });
    prev = now;
    prevCuts = frame.cuts;
  }
  // Na začátku ani na konci scény (ten drží až do další akce) nestojí dva hráči na sobě.
  for (const [when, t] of [["začátku", scene.start], ["konci", sceneTime(scene, false, Infinity)]] as const) {
    sampleClip(scene.clip, t, frame);
    frame.figures.forEach((a, i) => frame.figures.forEach((b, j) => {
      if (j > i && a.visible && b.visible && Math.hypot(a.x - b.x, a.z - b.z) < 0.9) found.add(`figury ${i} a ${j} stojí na ${when} na sobě`);
    }));
  }
  return [...found].map((p) => `${label}: ${p}`);
}

function checkAll(replay: Replay, events: ReplayEvent[], label: string): string[] {
  const scened = scenedEvents(events);
  return [...problems(replay, replay.kickoff(0), `${label} výkop`), ...problems(replay, replay.kickoff(events.length), `${label} výkop na konci`),
    ...events.flatMap((e, i) => (scened[i] ? problems(replay, replay.scene(i), `${label} #${i} ${e.minute}' ${e.type}${e.detail ? `/${e.detail}` : ""}`) : []))];
}

describe("scény 3D záznamu", () => {
  const events = [
    event(3, "special", 1, 7, { detail: "possession" }),
    event(10, "goal", 1, 9, { detail: "1:0", source: "open_play" }), event(10, "assist", 1, 7),
    event(14, "goal", 2, 10, { detail: "1:1", source: "counter" }),
    ...["vedle", "břevno", "tyč", "chytil brankář", "zblokováno"].map((detail, n) => event(20 + n, "chance", 1, 10, { detail })),
    event(24, "special", 2, 2, { detail: "block" }),
    event(30, "corner", 1, 6, { detail: "taken" }), event(30, "goal", 1, 3, { detail: "2:1", source: "corner" }), event(30, "assist", 1, 6),
    event(33, "corner", 2, 6, { detail: "taken" }),
    event(35, "freekick", 2, 7, { detail: "cross" }), event(35, "chance", 2, 9, { detail: "header_missed", description: "A 9 hlavičkuje, nad břevno" }),
    event(38, "freekick", 1, 8, { detail: "direct" }), event(38, "chance", 1, 8, { detail: "freekick_missed", description: "H 8 pálí přímák, do zdi" }),
    event(41, "penalty", 2, 9, { detail: "awarded" }), event(41, "goal", 2, 9, { detail: "2:2", source: "penalty" }),
    event(50, "penalty", 1, 9, { detail: "awarded" }), event(50, "chance", 1, 9, { detail: "penalty_saved" }), event(50, "special", 2, 0, { detail: "penalty_save" }),
    event(55, "foul", 2, 4), event(55, "card", 2, 4, { detail: "yellow" }),
    event(60, "foul", 1, 2), event(60, "card", 1, 2, { detail: "red" }),
    event(63, "card", 2, 5, { detail: "yellow" }),
    event(70, "injury", 1, 5), event(70, "substitution", 1, 11, { description: "Střídání: Sub 1 za H 5" }),
    event(80, "goal", 1, 11, { detail: "3:2", source: "open_play" }),
    event(90, "special", 1, 0, { detail: "full_time" }),
  ];
  const all = [...events, ...shootoutEvents({ id: "test", home_pens: 4, away_pens: 3, home_name: "Domácí", away_name: "Hosté" })];
  const replay = new Replay(input(all));

  it("každá událost má scénu bez skoků, rychlých běhů a hráčů na sobě", () => {
    expect(checkAll(replay, all, "test")).toEqual([]);
  });

  it("útok končí ve chvíli, kdy míč doletí k bráně, a gól je v síti", () => {
    const goal = replay.scene(1);
    const frame: Frame = { figures: replay.figures.map(() => ({ visible: false, x: 0, y: 0, z: 0, pose: null })), ballX: 0, ballY: 0, ballZ: 0, cuts: 0 };
    expect(goal.split - goal.start).toBeCloseTo(3.5);
    sampleClip(goal.clip, goal.split, frame);
    expect(Math.abs(frame.ballZ)).toBeCloseTo(HALF_L);
    expect(Math.abs(frame.ballX)).toBeLessThan(3.66);
    sampleClip(goal.clip, sceneTime(goal, false, Infinity), frame);
    expect(Math.abs(frame.ballZ)).toBeGreaterThan(HALF_L);
  });

  it("střela vedle a nad skončí za brankovou čárou mimo hřiště", () => {
    const frame: Frame = { figures: replay.figures.map(() => ({ visible: false, x: 0, y: 0, z: 0, pose: null })), ballX: 0, ballY: 0, ballZ: 0, cuts: 0 };
    for (const index of [4, 15]) {
      const scene = replay.scene(index);
      sampleClip(scene.clip, sceneTime(scene, false, Infinity), frame);
      expect(Math.abs(frame.ballZ)).toBeGreaterThan(HALF_L + 3);
    }
  });

  it("vyloučený a vystřídaný hráč v dalších scénách není, střídající ano", () => {
    const frame: Frame = { figures: replay.figures.map(() => ({ visible: false, x: 0, y: 0, z: 0, pose: null })), ballX: 0, ballY: 0, ballZ: 0, cuts: 0 };
    const last = replay.scene(events.length - 1);
    sampleClip(last.clip, last.start, frame);
    const visible = (name: string) => frame.figures[replay.figures.findIndex((f) => f.player.name === name)].visible;
    expect([visible("H 2"), visible("H 5"), visible("Sub 1"), visible("Rozhodčí")]).toEqual([false, false, true, true]);
    expect(frame.figures.filter((f) => f.visible).length).toBe(10 + 11 + 1);
  });

  it("scénu mají jen důležité akce; ostatní události drží konec poslední akce", () => {
    const scened = scenedEvents(all);
    const types = (shown: boolean) => [...new Set(all.filter((_, i) => scened[i] === shown).map((e) => e.detail?.startsWith("shootout:") ? "shootout" : e.type))].sort();
    expect(types(true)).toEqual(["card", "chance", "corner", "foul", "freekick", "goal", "injury", "penalty", "shootout", "substitution"]);
    expect(types(false)).toEqual(["assist", "corner", "special"]);
    // Držení míče před první akcí: výkop. Asistence po gólu: stojící konec gólové scény.
    expect(replay.scene(0).focus).toEqual([]);
    const goal = replay.scene(1), assist = replay.scene(2);
    expect(assist.clip).toBe(goal.clip);
    expect([assist.start, assist.split]).toEqual([goal.end, goal.end]);
  });

  it("rozstřel má pět sérií a sedí na uložený výsledek", () => {
    const kicks = shootoutEvents({ id: "x", home_pens: 4, away_pens: 3 });
    expect(kicks).toHaveLength(10);
    expect(kicks.filter((e) => e.teamId === 1 && e.detail === "shootout:goal")).toHaveLength(4);
    expect(kicks.filter((e) => e.teamId === 2 && e.detail === "shootout:goal")).toHaveLength(3);
    expect(shootoutEvents({ id: "x", home_pens: 0, away_pens: 0 })).toEqual([]);
    expect(shootoutEvents({ id: "x", home_pens: null, away_pens: null })).toEqual([]);
  });

  it("událost hráče, který není v sestavě, je chyba", () => {
    expect(() => new Replay(input([event(5, "goal", 1, 15)])).scene(0)).toThrow(/není v sestavě/);
    expect(() => new Replay(input([event(5, "substitution", 1, 11, { description: "Střídání: Sub 1 za Nikdo" })]))).toThrow(/není na hřišti/);
  });
});

const dump = process.env.REPLAY_MATCHES;
describe.skipIf(!dump)("zápasy z místní databáze", () => {
  it("všechny jdou přehrát bez chyby", () => {
    type Detail = Record<string, unknown> & { id: string; events: ReplayEvent[]; home_lineup_data: { starters: ReplayPlayer[]; subs: ReplayPlayer[] }; away_lineup_data: { starters: ReplayPlayer[]; subs: ReplayPlayer[] } };
    const matches = JSON.parse(readFileSync(dump!, "utf8")) as Detail[];
    const found: string[] = [];
    for (const m of matches) {
      const events = [...m.events, ...shootoutEvents(m)];
      try {
        const replay = new Replay({
          matchId: m.id, events,
          home: { name: "Domácí", kit, ...m.home_lineup_data }, away: { name: "Hosté", kit, ...m.away_lineup_data },
        });
        found.push(...checkAll(replay, events, `${m.kind} ${m.id.slice(0, 8)}`));
      } catch (e) {
        // Chyba jednoho zápasu nesmí schovat ostatní; test ji vypíše a spadne na ní.
        found.push(`${m.kind} ${m.id.slice(0, 8)}: ${(e as Error).message}`);
      }
    }
    console.log(`zápasů ${matches.length}, problémů ${found.length}`);
    expect(found.slice(0, 40)).toEqual([]);
  }, 120_000);
});
