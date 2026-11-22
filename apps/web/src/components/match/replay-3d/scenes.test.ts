// Spouští se z kořene repa: npx vitest run --root apps/web
import { describe, expect, it } from "vitest";
import { actionStarts, emptyFrame, HALF_L, HALF_W, Replay, sampleClip, scenedEvents, sceneTime, shootoutEvents, substitutionsTogether, type ReplayEvent, type ReplayInput, type ReplayPlayer, type Scene } from "./scenes";

const squad = (prefix: string): ReplayPlayer[] => ["GK", "DEF", "DEF", "DEF", "DEF", "MID", "MID", "MID", "MID", "FWD", "FWD"]
  .map((position, n) => ({ name: `${prefix} ${n}`, position }));
const event = (minute: number, type: string, teamId: 1 | 2, slot: number, extra: Partial<ReplayEvent> = {}): ReplayEvent => {
  const playerId = slot + (teamId === 1 ? 1 : 101);
  const playerName = slot >= 11 ? `Sub ${teamId}` : `${teamId === 1 ? "H" : "A"} ${slot}`;
  return { minute, type, playerId, playerName, teamId, description: `${type} ${playerName}`, ...extra };
};
const input = (events: ReplayEvent[]): ReplayInput => ({
  matchId: "test", events, winner: "home", goodTerms: true,
  // Domácí trenér je sopka, hostující kliďas.
  home: { starters: squad("H"), subs: [{ name: "Sub 1", position: "MID" }], coach: { name: "Trenér D", motivation: 90, record: null } },
  away: { starters: squad("A"), subs: [], coach: { name: "Trenér H", motivation: 25, record: null } },
});

/** Projde scénu po 1/30 s a vrátí, co je na ní špatně. */
function problems(replay: Replay, scene: Scene, label: string): string[] {
  const frame = emptyFrame(replay.figures.length);
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
      // Náhradníci na střídačce sedí vedle sebe těsněji, trenéři v objetí stojí u sebe.
      if (j > i && a.visible && b.visible && !(a.pose === b.pose && (a.pose === "sit" || a.pose === "hug")) && Math.hypot(a.x - b.x, a.z - b.z) < 0.9) found.add(`figury ${i} a ${j} stojí na ${when} na sobě`);
    }));
  }
  return [...found].map((p) => `${label}: ${p}`);
}

function checkAll(replay: Replay, events: ReplayEvent[], label: string): string[] {
  const scened = scenedEvents(events);
  return [...problems(replay, replay.intro(), `${label} trenéři`), ...problems(replay, replay.kickoff(0), `${label} výkop`), ...problems(replay, replay.finale(), `${label} konec`),
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

  it("po přestávce si týmy vymění strany, střídačky ne", () => {
    const frame = emptyFrame(replay.figures.length);
    const keeper = replay.figures.findIndex((f) => f.player.name === "H 0"), coach = replay.figures.findIndex((f) => f.coach && f.team === "home");
    const at = (scene: Scene) => { sampleClip(scene.clip, scene.start, frame); return [Math.sign(frame.figures[keeper].z), Math.sign(frame.figures[coach].z)]; };
    // Domácí brankář hájí v prvním poločase bránu na kladné z, ve druhém na záporné; trenér stojí pořád u své střídačky.
    expect(at(replay.kickoff(0))).toEqual([1, 1]);
    expect(at(replay.scene(1))).toEqual([1, 1]);
    const secondHalf = all.findIndex((e) => e.minute > 45);
    expect(at(replay.kickoff(secondHalf))).toEqual([-1, 1]);
    expect(at(replay.scene(secondHalf))).toEqual([-1, 1]);
    expect(at(replay.finale())).toEqual([-1, 1]);
  });

  it("útok končí ve chvíli, kdy míč doletí k bráně, a gól je v síti", () => {
    const goal = replay.scene(1);
    const frame = emptyFrame(replay.figures.length);
    expect(goal.split - goal.start).toBeCloseTo(3.5);
    sampleClip(goal.clip, goal.split, frame);
    expect(Math.abs(frame.ballZ)).toBeCloseTo(HALF_L);
    expect(Math.abs(frame.ballX)).toBeLessThan(3.66);
    sampleClip(goal.clip, sceneTime(goal, false, Infinity), frame);
    expect(Math.abs(frame.ballZ)).toBeGreaterThan(HALF_L);
  });

  it("střela vedle a nad skončí za brankovou čárou mimo hřiště", () => {
    const frame = emptyFrame(replay.figures.length);
    for (const index of [4, 15]) {
      const scene = replay.scene(index);
      sampleClip(scene.clip, sceneTime(scene, false, Infinity), frame);
      expect(Math.abs(frame.ballZ)).toBeGreaterThan(HALF_L + 3);
    }
  });

  it("vyloučený a vystřídaný hráč v dalších scénách není, střídající ano", () => {
    const frame = emptyFrame(replay.figures.length);
    const last = replay.before(events.length);
    sampleClip(last.clip, last.start, frame);
    const visible = (name: string) => frame.figures[replay.figures.findIndex((f) => f.player.name === name)].visible;
    expect([visible("H 2"), visible("H 5"), visible("Sub 1"), visible("Rozhodčí")]).toEqual([false, false, true, true]);
    // Deset domácích (jeden vyloučený), jedenáct hostů, rozhodčí a dva trenéři.
    expect(frame.figures.filter((f) => f.visible).length).toBe(10 + 11 + 1 + 2);
  });

  it("scénu mají jen důležité akce; ostatní události obraz nemění", () => {
    const scened = scenedEvents(all);
    const types = (shown: boolean) => [...new Set(all.filter((_, i) => scened[i] === shown).map((e) => e.detail?.startsWith("shootout:") ? "shootout" : e.type))].sort();
    expect(types(true)).toEqual(["card", "chance", "corner", "foul", "freekick", "goal", "injury", "penalty", "shootout", "substitution"]);
    expect(types(false)).toEqual(["assist", "corner", "special"]);
    // Držení míče před první akcí: běží výkop. Asistence po gólu: běží dál gólová scéna. Druhý poločas začíná výkopem.
    expect(replay.before(0)).toBe(replay.kickoff(0));
    expect(replay.before(1)).toBe(replay.kickoff(0));
    expect(replay.before(3)).toBe(replay.scene(1));
    const secondHalf = all.findIndex((e) => e.minute > 45);
    expect(replay.before(secondHalf)).toBe(replay.kickoff(secondHalf));
    expect(replay.before(secondHalf + 1)).toBe(replay.scene(secondHalf));
  });

  it("akce začínají první událostí se scénou: roh před gólem, faul před kartou, zranění před střídáním", () => {
    const starts = actionStarts(all).filter((i) => i < events.length);
    expect(starts.map((i) => all[i].type)).toEqual(["goal", "goal", "chance", "chance", "chance", "chance", "chance", "corner", "freekick", "freekick",
      "penalty", "penalty", "foul", "foul", "card", "injury", "substitution", "goal"]);
  });

  it("rozstřel má pět sérií a sedí na uložený výsledek", () => {
    const kicks = shootoutEvents({ id: "x", home_pens: 4, away_pens: 3, home_name: "Domácí", away_name: "Hosté" });
    expect(kicks).toHaveLength(10);
    expect(kicks.filter((e) => e.teamId === 1 && e.detail === "shootout:goal")).toHaveLength(4);
    expect(kicks.filter((e) => e.teamId === 2 && e.detail === "shootout:goal")).toHaveLength(3);
    expect(shootoutEvents({ id: "x", home_pens: 0, away_pens: 0 })).toEqual([]);
    expect(shootoutEvents({ id: "x", home_pens: null, away_pens: null })).toEqual([]);
  });

  it("za vyloučeného brankáře jde do brány ten, koho určí engine", () => {
    const keepers = (after: ReplayEvent) => {
      const events = [event(20, "card", 1, 0, { detail: "red" }), after, event(30, "chance", 2, 9, { detail: "vedle" })];
      const replay = new Replay(input(events));
      return [...replay.scene(2).clip.keepers].map((f) => replay.figures[f].player.name).sort();
    };
    expect(keepers(event(20, "special", 1, 5, { detail: "emergency_gk" }))).toEqual(["A 0", "H 5"]);
    expect(keepers(event(20, "substitution", 1, 11, { description: "Střídání: Sub 1 jde do brány za vyloučeného gólmana, ven jde H 7" }))).toEqual(["A 0", "Sub 1"]);
  });

  it("rozzuřený trenér vbíhá do hřiště směrem k rozhodčímu, v prvním i druhém poločase", () => {
    for (const minute of [30, 60]) {
      let runs = 0;
      for (let n = 0; n < 20; n++) {
        const replay = new Replay({ ...input([event(minute, "card", 1, 5, { detail: "yellow" })]), matchId: `anger${n}` });
        const scene = replay.scene(0), frame = emptyFrame(replay.figures.length);
        const coach = frame.figures[replay.figures.findIndex((f) => f.coach && f.team === "home")], referee = frame.figures[replay.referee];
        sampleClip(scene.clip, scene.start, frame);
        const bench = coach.z;
        // Nejdál v hřišti je ve chvíli, kdy na rozhodčího křičí.
        let far = { x: coach.x, z: coach.z, referee: referee.z };
        for (let t = scene.start; t < scene.end; t += 0.1) {
          sampleClip(scene.clip, t, frame);
          if (coach.x > far.x) far = { x: coach.x, z: coach.z, referee: referee.z };
        }
        // Někdy jen protestuje od lajny.
        if (far.x < -HALF_W + 2) continue;
        runs++;
        expect(Math.sign(far.z - bench)).toBe(Math.sign(far.referee - bench));
      }
      expect(runs).toBeGreaterThan(5);
    }
  });

  it("střídání za zraněného je vždy samo, ostatní střídání týmu ve stejné minutě jsou jedno hromadné", () => {
    const sub = (minute: number, teamId: 1 | 2) => event(minute, "substitution", teamId, 11);
    const list = [event(75, "injury", 1, 5), sub(75, 1), sub(75, 1), sub(75, 1), sub(75, 2), sub(76, 1)];
    expect(list.map((_, i) => substitutionsTogether(list, i))).toEqual([1, 1, 2, 2, 1, 1]);
    expect(actionStarts(list)).toEqual([0, 1, 2, 4, 5]);
  });

  it("trenéři, kteří spolu vycházejí, se po podání ruky obejmou; ostatní ne", () => {
    const poses = (goodTerms: boolean) => {
      const replay = new Replay({ ...input([event(5, "goal", 1, 9)]), goodTerms }), scene = replay.intro(), frame = emptyFrame(replay.figures.length);
      sampleClip(scene.clip, sceneTime(scene, false, Infinity), frame);
      return replay.figures.flatMap((f, i) => (f.coach ? [frame.figures[i].pose] : []));
    };
    expect(poses(true)).toEqual(["hug", "hug"]);
    expect(poses(false)).toEqual(["shake", "shake"]);
  });

  it("událost hráče, který není v sestavě, je chyba", () => {
    expect(() => new Replay(input([event(5, "goal", 1, 15)])).scene(0)).toThrow(/není v sestavě/);
    expect(() => new Replay(input([event(5, "substitution", 1, 11, { description: "Střídání: Sub 1 za Nikdo" })]))).toThrow(/není na hřišti/);
  });
});
