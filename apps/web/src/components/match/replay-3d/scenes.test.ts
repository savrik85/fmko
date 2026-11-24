// Spouští se z kořene repa: npx vitest run --root apps/web
import { describe, expect, it } from "vitest";
import { actionStarts, breakOf, emptyFrame, HALF_L, HALF_W, Replay, replayOrder, sampleClip, scenedEvents, sceneTime, shootoutEvents, substitutionsTogether, type ReplayEvent, type ReplayInput, type ReplayPlayer, type Scene } from "./scenes";

const squad = (prefix: string): ReplayPlayer[] => ["GK", "DEF", "DEF", "DEF", "DEF", "MID", "MID", "MID", "MID", "FWD", "FWD"]
  .map((position, n) => ({ name: `${prefix} ${n}`, position }));
const event = (minute: number, type: string, teamId: 1 | 2, slot: number, extra: Partial<ReplayEvent> = {}): ReplayEvent => {
  const playerId = slot + (teamId === 1 ? 1 : 101);
  const playerName = slot >= 11 ? `Sub ${teamId}` : `${teamId === 1 ? "H" : "A"} ${slot}`;
  return { minute, type, playerId, playerName, teamId, description: `${type} ${playerName}`, ...extra };
};
const input = (events: ReplayEvent[]): ReplayInput => ({
  matchId: "test", events, winner: "home", goodTerms: true, refereeGrade: 3.5,
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
      // Rozhodčí po zápase odchází z areálu.
      if (!(scene.drive && i === replay.referee) && (Math.abs(f.x) > HALF_W + 4 || Math.abs(f.z) > HALF_L + 2)) found.add(`figura ${i} je mimo hřiště`);
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

  // Náhoda z id zápasu vybírá rozestavení a varianty scén: zkouší se víc zápasů, ne jedno šťastné id.
  it("každá událost má scénu bez skoků, rychlých běhů a hráčů na sobě", () => {
    for (let n = 0; n < 10; n++) {
      const matchId = `match${n}`;
      expect(checkAll(new Replay({ ...input(all), matchId }), all, matchId)).toEqual([]);
    }
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

  it("hlavičkující trefí míč ve výskoku, míč je u jeho hlavy", () => {
    const scene = replay.scene(all.findIndex((e) => e.minute === 30 && e.type === "goal"));
    const frame = emptyFrame(replay.figures.length);
    // Míč letí od hlavy k bráně půl vteřiny.
    sampleClip(scene.clip, scene.split - 0.5, frame);
    const header = frame.figures[replay.figures.findIndex((f) => f.player.name === "H 3")];
    expect(header.y).toBeGreaterThan(0.6);
    // Hlava stojící figury je 2 m nad zemí, míč se měří od spodku (poloměr 0,28 m).
    expect(frame.ballY + 0.28 - header.y).toBeCloseTo(2, 1);
    // Míč je před ním ve směru náběhu, ne za ním.
    const ball = { x: frame.ballX, z: frame.ballZ }, at = { x: header.x, z: header.z };
    expect(Math.hypot(ball.x - at.x, ball.z - at.z)).toBeCloseTo(0.4, 1);
    sampleClip(scene.clip, scene.start, frame);
    expect(Math.hypot(ball.x - header.x, ball.z - header.z)).toBeCloseTo(Math.hypot(at.x - header.x, at.z - header.z) + 0.4, 1);
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

  it("po zakončení standardky je další šance nebo gól týmu ve stejné minutě nová akce s vlastní scénou", () => {
    const pieces = [
      [event(49, "penalty", 1, 9), event(49, "chance", 1, 9, { detail: "penalty_missed" }), event(49, "chance", 1, 8, { detail: "vedle" })],
      [event(37, "penalty", 1, 9), event(37, "goal", 1, 9, { detail: "1:0", source: "penalty" }), event(37, "goal", 1, 8, { detail: "2:0", source: "open_play" }), event(37, "assist", 1, 7)],
      [event(20, "freekick", 2, 6, { detail: "direct" }), event(20, "chance", 2, 6, { detail: "vedle" }), event(20, "goal", 2, 9, { detail: "0:1", source: "open_play" })],
      [event(60, "corner", 1, 6), event(60, "chance", 1, 3, { detail: "vedle" }), event(60, "chance", 1, 9, { detail: "tyč" })],
    ];
    for (const list of pieces) {
      expect(actionStarts(list)).toEqual([0, 2]);
      expect(checkAll(new Replay(input(list)), list, list[0].type)).toEqual([]);
    }
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

  it("plánované střídání ve 45. minutě se odehraje o přestávce před výkopem a nikdo při něm neodchází", () => {
    const planned = event(45, "substitution", 1, 11, { description: "Plánované střídání: Sub 1 za H 5" });
    // Střídající je ve zbytku 45. minuty ještě v drobné události bez scény: ta se vypíše dřív, než nastoupí.
    const list = [event(40, "chance", 1, 9, { detail: "vedle" }), planned, event(45, "special", 1, 11, { detail: "possession" }),
      event(45, "special", 1, 0, { detail: "half_time" }), event(46, "chance", 2, 9, { detail: "vedle" }), event(60, "chance", 1, 9, { detail: "vedle" })];
    expect(replayOrder(list)).toEqual([0, 2, 3, 1, 4, 5]);
    // Karta střídajícího ve zbytku minuty má scénu, střídání proto zůstává na místě. Zůstává i střídání
    // za zraněného a plánované střídání ve 46. minutě.
    expect(replayOrder(list.with(2, event(45, "card", 1, 11, { detail: "yellow" })))).toEqual([0, 1, 2, 3, 4, 5]);
    expect(replayOrder(list.with(1, { ...planned, description: "Střídání: Sub 1 za H 5" }))).toEqual([0, 1, 2, 3, 4, 5]);
    expect(replayOrder([list[0], list[3], list[4], { ...planned, minute: 46 }, list[5]])).toEqual([0, 1, 2, 3, 4]);

    const ordered = replayOrder(list).map((i) => list[i]);
    expect(breakOf(ordered)).toEqual({ start: 3, end: 4 });
    expect(breakOf(list)).toEqual({ start: 4, end: 4 });
    const replay = new Replay(input(ordered));
    expect(checkAll(replay, ordered, "přestávka")).toEqual([]);
    const figure = (name: string) => replay.figures.findIndex((f) => f.player.name === name);
    const frame = emptyFrame(replay.figures.length);
    const onPitch = (scene: Scene, name: string) => {
      sampleClip(scene.clip, sceneTime(scene, false, Infinity), frame);
      const f = frame.figures[figure(name)];
      return f.visible && f.x > -HALF_W;
    };
    // O přestávce stojí týmy před výkopem bez střídaného, ten je v kabině; střídající je ještě na střídačce.
    const hold = replay.before(3), sub = replay.scene(3), kickoff = replay.before(4);
    expect([onPitch(hold, "H 5"), onPitch(hold, "Sub 1")]).toEqual([false, false]);
    expect(replay.before(4, true)).toBe(sub);
    expect(sub.focus).toEqual([figure("Sub 1")]);
    expect([onPitch(sub, "H 5"), onPitch(sub, "Sub 1")]).toEqual([false, true]);
    // Střídající nejde doprostřed, ale volným klusem na svoje místo: k tomu, kde při výkopu stojí.
    const place = (scene: Scene, t: number) => { sampleClip(scene.clip, t, frame); const f = frame.figures[figure("Sub 1")]; return { x: f.x, z: f.z }; };
    const post = place(kickoff, kickoff.start), gap = (p: { x: number; z: number }) => Math.hypot(p.x - post.x, p.z - post.z);
    expect(gap(place(sub, sceneTime(sub, false, Infinity)))).toBeLessThan(gap(place(sub, sub.start)) - 3);
    // Výkop druhého poločasu přijde až po střídání a drží se v obraze do první akce.
    expect(kickoff).not.toBe(hold);
    expect([onPitch(kickoff, "H 5"), onPitch(kickoff, "Sub 1")]).toEqual([false, true]);
    expect([replay.shownBefore(4), replay.shownBefore(5), replay.shownBefore(6)]).toEqual([-1, 4, 5]);
  });

  it("událost hráče, který není v sestavě, je chyba", () => {
    expect(() => new Replay(input([event(5, "goal", 1, 15)])).scene(0)).toThrow(/není v sestavě/);
    expect(() => new Replay(input([event(5, "substitution", 1, 11, { description: "Střídání: Sub 1 za Nikdo" })]))).toThrow(/není na hřišti/);
  });
});
