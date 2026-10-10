import { describe, expect, it } from "vitest";
import type { MatchPlayer } from "../engine/types";
import type { Slot } from "../engine/roles";
import {
  assistantLevel, assistantQuality, buildSquadAnalysis, gameWeekKey, headlineFor, measureSquad,
  type Insight, type LeagueTeam, type LineReport, type Reinforcement, type SquadAnalysisInput, type SquadAnalysisReport, type SquadMember, type TextPart,
} from "./squad-analysis";
import { formationQuotas, pickBestEleven } from "./squad-analysis-data";

const SLOTS_442: Slot[] = ["GK", "DEF", "DEF", "DEF", "DEF", "MID", "MID", "MID", "MID", "FWD", "FWD"];

let nextId = 1;
function player(slot: Slot, level: number, overrides: Partial<MatchPlayer> = {}): MatchPlayer {
  return {
    id: nextId++, firstName: "Jan", lastName: "Hráč", nickname: null, position: slot, matchPosition: slot,
    speed: level, technique: level, shooting: level, passing: level, heading: level, defense: level,
    goalkeeping: slot === "GK" ? level : 10, stamina: level, strength: level, vision: level, creativity: level,
    setPieces: level, experience: level, discipline: 50, alcohol: 30, temper: 40, leadership: 30, workRate: 50,
    aggression: 50, consistency: 50, clutch: 50, condition: 100, morale: 50, height: 180,
    preferredFoot: "right", preferredSide: "center",
    ...overrides,
  };
}

function member(id: string, slot: Slot, level: number, overrides: Partial<MatchPlayer> = {}, extra: Partial<SquadMember> = {}): SquadMember {
  return {
    id, name: `Hráč ${id}`, position: slot, player: player(slot, level, overrides),
    condition: 100, weightCategory: "ideal", injured: false, ...extra,
  };
}

/** Jedenáctka 4-4-2; `tweak` upraví hráče na daném postu. */
function eleven(level: number, tweak: Partial<Record<Slot, Partial<MatchPlayer>>> = {}): SquadMember[] {
  return SLOTS_442.map((slot, i) => member(`own-${i}`, slot, level, tweak[slot] ?? {}));
}

function league(levels: number[] = [34, 37, 40, 43, 46, 49]): LeagueTeam[] {
  return levels.map((level, t) => ({
    id: `team-${t}`,
    name: `Soupeř ${t}`,
    eleven: SLOTS_442.map((slot) => player(slot, level)),
  }));
}

function input(over: Partial<SquadAnalysisInput> = {}, quality = 1): SquadAnalysisInput {
  return {
    teamId: "own",
    eleven: eleven(42),
    others: [],
    lineupSource: "lineup",
    formation: "4-4-2",
    formationFamiliarity: { "4-4-2": 70 },
    opponents: league(),
    assistant: { id: "asst", name: "Marek Mikeš", firstName: "Marek", female: false, quality },
    week: "2026-10-05",
    ...over,
  };
}

function allTexts(r: SquadAnalysisReport): TextPart[][] {
  return [
    ...r.lines.map((l) => l.text),
    ...r.strengths.map((s) => s.text),
    ...r.weaknesses.map((s) => s.text),
    ...r.reinforcements.map((s) => s.text),
    ...r.warnings.map((w) => w.text),
  ];
}

const plain = (parts: TextPart[]) => parts.map((p) => (p.kind === "text" ? p.text : p.name)).join("");

describe("rozbor kádru: síly a slabiny z modelu rolí", () => {
  it("výborného brankáře vidí jako sílu a slabou zálohu jako slabinu", () => {
    const r = buildSquadAnalysis(input({
      eleven: eleven(42, { GK: { goalkeeping: 80, defense: 70, speed: 70 }, MID: { passing: 18, vision: 18, technique: 18 } }),
    }));
    expect(r.strengths.map((s) => s.aspect)).toContain("gkSaves");
    expect(r.weaknesses.map((s) => s.aspect)).toContain("midControl");
    const gk = r.lines.find((l) => l.line === "GK")!;
    const mid = r.lines.find((l) => l.line === "MID")!;
    expect(["best", "top"]).toContain(gk.verdict);
    expect(["worst", "bottom"]).toContain(mid.verdict);
  });

  it("slabinu zálohy popíše konkrétními vlastnostmi a hráči", () => {
    const r = buildSquadAnalysis(input({ eleven: eleven(42, { MID: { passing: 15, vision: 15 } }) }));
    const mid = r.weaknesses.find((w) => w.aspect === "midControl")!;
    const text = plain(mid.text);
    expect(text).toMatch(/přehled|přihrávk/);
    expect(mid.text.some((p) => p.kind === "player")).toBe(true);
  });

  it("vyrovnaný tým nad průměrem dostane slabiny proti špičce ligy, ne prázdný seznam", () => {
    const r = buildSquadAnalysis(input({ eleven: eleven(47), opponents: league([30, 33, 36, 39, 55, 58]) }));
    expect(r.weaknesses.length).toBeGreaterThan(0);
    expect(r.weaknesses.every((w) => w.scope === "top")).toBe(true);
  });
});

describe("rozbor kádru: kde posílit", () => {
  it("nejvíc doporučí řadu s největší dírou proti lize", () => {
    const weakForwards = buildSquadAnalysis(input({ eleven: eleven(44, { FWD: { speed: 15, shooting: 15, technique: 15, creativity: 15, vision: 15 } }) }));
    expect(weakForwards.reinforcements[0].line).toBe("FWD");
    expect(weakForwards.reinforcements[0].priority).toBe("high");

    const weakKeeper = buildSquadAnalysis(input({ eleven: eleven(44, { GK: { goalkeeping: 12, defense: 12, speed: 12 } }) }));
    expect(weakKeeper.reinforcements[0].line).toBe("GK");
  });

  it("pořadí odpovídá skutečnému zisku z modelu (bez rozptylu asistenta)", () => {
    const i = input({ eleven: eleven(42, { DEF: { defense: 15, strength: 15, heading: 15 } }) });
    const gains = measureSquad(i).upgrades.sort((a, b) => b.gain - a.gain);
    const r = buildSquadAnalysis(i);
    expect(r.reinforcements.map((x) => x.line)).toEqual(gains.filter((g) => g.gain >= 0.01).map((g) => g.line));
  });

  it("když má v kádru lepšího hráče na post, řekne to dřív, než pošle shánět posilu", () => {
    const own = eleven(44, { FWD: { speed: 15, shooting: 15, technique: 15, creativity: 15, vision: 15 } });
    const r = buildSquadAnalysis(input({ eleven: own, others: [member("bench-fwd", "FWD", 55)] }));
    const fwd = r.reinforcements.find((x) => x.line === "FWD")!;
    expect(fwd.text.some((p) => p.kind === "player" && p.id === "bench-fwd")).toBe(true);
  });

  it("zraněného hráče z lavičky místo posily nedoporučí", () => {
    const own = eleven(44, { FWD: { speed: 15, shooting: 15, technique: 15, creativity: 15, vision: 15 } });
    const r = buildSquadAnalysis(input({ eleven: own, others: [member("bench-fwd", "FWD", 55, {}, { injured: true })] }));
    expect(r.reinforcements.flatMap((x) => x.text).some((p) => p.kind === "player" && p.id === "bench-fwd")).toBe(false);
  });
});

describe("rozbor kádru: přesnost podle asistenta", () => {
  it("stejný tým, asistent a týden dají vždy stejný rozbor", () => {
    expect(buildSquadAnalysis(input({}, 0.3))).toEqual(buildSquadAnalysis(input({}, 0.3)));
  });

  it("slabší asistent se v jiném týdnu splete jinak", () => {
    const a = buildSquadAnalysis(input({ week: "2026-10-05" }, 0.25));
    const b = buildSquadAnalysis(input({ week: "2026-10-12" }, 0.25));
    expect(a.lines.map((l) => l.bar)).not.toEqual(b.lines.map((l) => l.bar));
  });

  it("slabý asistent řekne méně, hrubší škálou a bez jmen; výborný víc a přesněji", () => {
    const own = eleven(42, { GK: { goalkeeping: 80, defense: 70 }, MID: { passing: 15, vision: 15 }, FWD: { shooting: 70, speed: 70 } });
    const weak = buildSquadAnalysis(input({ eleven: own }, 0.15));
    const sharp = buildSquadAnalysis(input({ eleven: own }, 0.95));

    expect(weak.assistant.level).toBe("weak");
    expect(sharp.assistant.level).toBe("excellent");
    expect(weak.strengths.length).toBeLessThanOrEqual(2);
    expect(weak.weaknesses.length).toBeLessThanOrEqual(2);
    expect(sharp.strengths.length + sharp.weaknesses.length).toBeGreaterThan(weak.strengths.length + weak.weaknesses.length);
    expect([...weak.strengths, ...weak.weaknesses].some((i) => i.text.some((p) => p.kind === "player"))).toBe(false);
    expect(weak.lines.every((l) => ["aboveAverage", "average", "belowAverage"].includes(l.verdict))).toBe(true);
    expect(weak.reinforcements.length).toBeLessThanOrEqual(2);

    const width = (r: SquadAnalysisReport) => r.lines.reduce((s, l) => s + (l.bar.high - l.bar.low), 0);
    expect(width(weak)).toBeGreaterThan(width(sharp));
  });

  it("kvalita asistenta: trénování a komunikace víc než úsudek, mez 0 až 1", () => {
    const row = (coaching: number, communication: number, judgement: number) => ({
      role: "asistent", coaching, communication, judgement, medicine: 5, maintenance: 5, work_rate: 5, charm: 5,
    });
    const best = assistantQuality(row(19, 15, 8));
    const worst = assistantQuality(row(9, 7, 8));
    expect(best).toBeGreaterThan(worst);
    expect(assistantLevel(best)).toBe("excellent");
    expect(assistantQuality(row(20, 20, 20))).toBe(1);
    expect(assistantQuality(row(1, 1, 1))).toBe(0);
  });
});

describe("rozbor kádru: styl a varování", () => {
  it("doporučí taktiku, na kterou má kádr hráče, a nesedící označí", () => {
    const r = buildSquadAnalysis(input({
      eleven: eleven(30, { MID: { technique: 60, passing: 60, vision: 60 }, FWD: { heading: 8, strength: 8 } }),
    }));
    const possession = r.style.tactics.find((t) => t.tactic === "possession")!;
    const longBall = r.style.tactics.find((t) => t.tactic === "long_ball")!;
    expect(possession.recommended).toBe(true);
    expect(["great", "good"]).toContain(possession.verdict);
    expect(longBall.verdict).toBe("poor");
    expect(r.style.summary).toContain("Držení míče");
  });

  it("sehranost rozestavění pozná a poradí to sehranější", () => {
    const r = buildSquadAnalysis(input({ formation: "3-5-2", formationFamiliarity: { "3-5-2": 20, "4-4-2": 80 } }));
    expect(r.style.formation.familiarity).toBe("low");
    expect(r.style.formation.text).toContain("4-4-2");
  });

  it("varuje před zraněným v sestavě, hráčem mimo post a nadváhou; stejné potíže seskupí", () => {
    const own = eleven(42);
    own[1] = { ...own[1], injured: true };
    own[5] = { ...own[5], position: "DEF" };
    own[2] = { ...own[2], weightCategory: "over" };
    own[3] = { ...own[3], weightCategory: "over" };
    const r = buildSquadAnalysis(input({ eleven: own }));
    const kinds = r.warnings.map((w) => w.kind);
    expect(kinds).toEqual(expect.arrayContaining(["injured", "outOfPosition", "overweight"]));
    const overweight = r.warnings.filter((w) => w.kind === "overweight");
    expect(overweight).toHaveLength(1);
    expect(overweight[0].text.filter((p) => p.kind === "player")).toHaveLength(2);
    expect(plain(overweight[0].text)).toContain("mají nadváhu");
  });

  it("bez uložené sestavy nevaruje před hráčem mimo post", () => {
    const own = eleven(42);
    own[5] = { ...own[5], position: "DEF" };
    const r = buildSquadAnalysis(input({ eleven: own, lineupSource: "best11" }));
    expect(r.warnings.some((w) => w.kind === "outOfPosition")).toBe(false);
  });
});

describe("rozbor kádru: pravidla českých textů", () => {
  const cases = [
    input(),
    input({ eleven: eleven(42, { GK: { goalkeeping: 80 }, MID: { passing: 15, vision: 15 } }) }, 0.5),
    input({ eleven: eleven(30), others: [member("b", "MID", 60)] }, 0.8),
    input({ eleven: eleven(55), opponents: league([20, 25, 30]) }, 0.2),
  ];

  it("žádná dlouhá pomlčka a jméno nikdy za předložkou", () => {
    for (const c of cases) {
      const r = buildSquadAnalysis(c);
      const texts = [
        ...allTexts(r).map(plain),
        ...r.strengths.map((s) => s.title), ...r.weaknesses.map((s) => s.title),
        r.style.summary, r.style.hardness.text, r.style.formation.text, r.assistant.note,
        ...r.style.tactics.map((t) => t.reason ?? ""),
      ];
      for (const t of texts) expect(t).not.toContain("—");
      for (const parts of allTexts(r)) {
        parts.forEach((p, i) => {
          if (p.kind === "text" || i === 0) return;
          const before = parts[i - 1];
          if (before.kind !== "text") return;
          expect(before.text).not.toMatch(/\s(v|ve|s|se|k|ke|u|od|do|pro|za|na|o|po)\s$/);
        });
      }
    }
  });

  it("asistentka mluví v ženském rodě", () => {
    const r = buildSquadAnalysis(input({
      eleven: eleven(30, { FWD: { heading: 5, strength: 5, shooting: 5, speed: 5 } }),
      assistant: { id: "a", name: "Martina Toušková", firstName: "Martina", female: true, quality: 0.9 },
    }));
    expect(r.assistant.female).toBe(true);
    if (r.style.summary.includes("nezkoušel")) expect(r.style.summary).toContain("nezkoušela");
  });
});

describe("rozbor kádru: pomocné funkce", () => {
  it("týden začíná pondělím", () => {
    expect(gameWeekKey("2026-10-10T16:00:00.000Z")).toBe("2026-10-05");
    expect(gameWeekKey("2026-10-11")).toBe("2026-10-05");
    expect(gameWeekKey("2026-10-12")).toBe("2026-10-12");
  });

  it("rozestavění na kvóty řad", () => {
    expect(formationQuotas("4-3-3")).toEqual({ GK: 1, DEF: 4, MID: 3, FWD: 3 });
    expect(formationQuotas("5-3-2")).toEqual({ GK: 1, DEF: 5, MID: 3, FWD: 2 });
    expect(formationQuotas("4-4-3")).toBeNull();
    expect(formationQuotas("nesmysl")).toBeNull();
  });

  it("nejlepší jedenáctka bere nejlepší na postech a díry doplní nejlepšími zbylými", () => {
    const rows = [
      { id: "gk1", position: "GK", overall_rating: 30 }, { id: "gk2", position: "GK", overall_rating: 50 },
      ...Array.from({ length: 5 }, (_, i) => ({ id: `d${i}`, position: "DEF", overall_rating: 20 + i })),
      ...Array.from({ length: 2 }, (_, i) => ({ id: `m${i}`, position: "MID", overall_rating: 40 + i })),
      ...Array.from({ length: 3 }, (_, i) => ({ id: `f${i}`, position: "FWD", overall_rating: 30 + i })),
    ];
    const picked = pickBestEleven(rows);
    expect(picked).toHaveLength(11);
    expect(picked.find((p) => p.slot === "GK")!.row.id).toBe("gk2");
    expect(picked.filter((p) => p.slot === "DEF").map((p) => p.row.id)).toEqual(expect.arrayContaining(["d4", "d3", "d2", "d1"]));
    // Záložníci jsou jen dva: zbylá místa doplní nejlepší zbylí hráči na svých postech.
    expect(new Set(picked.map((p) => p.row.id)).size).toBe(11);
  });
});

describe("verdikt asistenta nahoře v záložce", () => {
  const line = (slot: "GK" | "DEF" | "MID" | "FWD", verdict: LineReport["verdict"]): LineReport => ({
    line: slot, label: slot, verdict, vague: false, text: [], bestTeam: null, bar: { low: 0, high: 1, average: 0.5, best: 1 },
  });
  const signing: Reinforcement = { line: "FWD", priority: "high", text: [], attributes: [] };

  it("řekne celkový dojem, o co se opřít, co drží zpátky a kam posilu, s rodem podle asistenta", () => {
    const lines = [line("GK", "aboveAverage"), line("DEF", "average"), line("MID", "best"), line("FWD", "belowAverage")];
    const he = headlineFor(lines, [], [signing], false).map((p) => (p.kind === "text" ? p.text : p.name)).join("");
    const she = headlineFor(lines, [], [signing], true).map((p) => (p.kind === "text" ? p.text : p.name)).join("");
    expect(he).toContain("Nejvíc se můžeme opřít o zálohu, zpátky nás drží útok.");
    expect(he).toContain("Posilu bych hledal do útoku.");
    expect(she).toContain("Posilu bych hledala do útoku.");
    expect(he).not.toContain("—");
  });

  it("u vyrovnaných řad sáhne po hlavní slabině", () => {
    const lines = [line("GK", "average"), line("DEF", "average"), line("MID", "aboveAverage"), line("FWD", "average")];
    const weak: Insight = { aspect: "fwdMovement", line: "FWD", scope: "league", title: "Útok je čitelný, náběhy chybí", text: [] } as Insight;
    const text = headlineFor(lines, [weak], [], false).map((p) => (p.kind === "text" ? p.text : "")).join("");
    expect(text).toContain("Nejvíc nás brzdí tohle: útok je čitelný, náběhy chybí.");
    expect(text).not.toContain("Posilu");
  });
});

describe("rozbor kádru: tabulky řad a perspektiva", () => {
  it("útoku se slabou střelbou řekne, že chybí střelba, a označí každého útočníka", () => {
    const r = buildSquadAnalysis(input({ eleven: eleven(42, { FWD: { shooting: 20 } }) }));
    const fwd = r.lineTables.find((t) => t.line === "FWD");
    expect(fwd).toBeDefined();
    const shooting = fwd!.attributes.find((a) => a.skill === "shooting");
    expect(shooting?.verdict).toBe("weak");
    expect(plain(fwd!.lookFor)).toContain("Útoku chybí hlavně");
    expect(plain(fwd!.lookFor)).toContain("střelb");
    for (const p of fwd!.players.filter((x) => x.starter)) {
      expect(p.values.find((v) => v.skill === "shooting")?.verdict).toBe("weak");
    }
    // Brankáři se tabulka dívá na chytání, ne na střelbu
    const gk = r.lineTables.find((t) => t.line === "GK")!;
    expect(gk.attributes.map((a) => a.skill)).toContain("goalkeeping");
    expect(gk.attributes.map((a) => a.skill)).not.toContain("shooting");
  });

  it("perspektiva spočítá mladé, opory přes 30 a kdo na tréninku roste", () => {
    const xi = SLOTS_442.map((slot, i) => member(`own-${i}`, slot, 42, { age: i < 4 ? 19 : i < 8 ? 25 : 33 }));
    const r = buildSquadAnalysis(input({ eleven: xi, growth: { "own-0": 20, "own-1": 7, "own-2": 2 } }));
    expect(r.outlook.ages).toMatchObject({ under21: 4, prime: 4, over30: 3 });
    expect(r.outlook.youngsters.map((y) => y.id)).toEqual(["own-0", "own-1", "own-2", "own-3"]);
    expect(r.outlook.veterans).toHaveLength(3);
    expect(r.outlook.growing.map((g) => [g.id, g.pace])).toEqual([["own-0", "fast"], ["own-1", "steady"]]);
    expect(plain(r.outlook.verdict)).toContain("jsou 3 hráči přes 30");
    expect(plain(r.outlook.verdict)).not.toContain("—");
  });
});
