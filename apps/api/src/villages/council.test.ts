/**
 * Zasedání zastupitelstva (F18): čistá logika bez databáze. Rozdělení banku, posouzení
 * proslovu pravidlem, rozvrh pozvánek a lhůty, texty starosty a kontrola článku od modelu.
 */
import { describe, expect, it } from "vitest";
import {
  buildJudgePrompt, checkCouncilArticle, clubMinimum, councilPot, councilReplyDueAt, councilSchedule, councilTaste,
  decisionReady, fallbackAiSpeech, fallbackCouncilArticle, favorDelta, headlineNamesVillage, invitationText, parseAiSpeech, parseJudgeAnswer,
  pragueParts, ruleSpeechVerdict, splitCouncilPot, type ArticleFacts, type PotApplicant,
} from "./council";

const NEUTRAL = councilTaste([]);

function sum(m: Map<string, number>): number {
  return [...m.values()].reduce((a, b) => a + b, 0);
}

function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

describe("rozdělení banku", () => {
  it("bank se rozdělí beze zbytku, i když nejde dělit na stovky", () => {
    const rnd = lcg(42);
    for (let i = 0; i < 300; i++) {
      const pot = 5_000 + Math.floor(rnd() * 60_000) + (i % 7);
      const clubs = 1 + Math.floor(rnd() * 3);
      const applicants: PotApplicant[] = [
        { key: "firefighters", kind: "firefighters" },
        { key: "hunters", kind: "hunters" },
        ...Array.from({ length: clubs }, (_, c): PotApplicant => ({
          key: `club-${c}`, kind: "club", favor: Math.floor(rnd() * 100),
          verdict: rnd() < 0.3 ? null : { score: Math.floor(rnd() * 6) - 2, reaction: "" },
        })),
      ];
      const taste = councilTaste(["sportovec", "tradicionalista", "populista", "podnikatel"].slice(0, 1 + (i % 4)));
      const split = splitCouncilPot(pot, applicants, taste);
      expect(sum(split)).toBe(pot);
      for (const v of split.values()) expect(v).toBeGreaterThanOrEqual(0);
      for (const a of applicants.filter((x) => x.kind === "club")) {
        expect(split.get(a.key)).toBeGreaterThanOrEqual(clubMinimum(pot, clubs));
      }
    }
  });

  it("bez proslovu dostane fotbal přesně minimum", () => {
    const pot = 20_000;
    const split = splitCouncilPot(pot, [
      { key: "firefighters", kind: "firefighters" },
      { key: "hunters", kind: "hunters" },
      { key: "club", kind: "club", favor: 90, verdict: null },
    ], NEUTRAL);
    expect(split.get("club")).toBe(clubMinimum(pot, 1));
    expect(clubMinimum(pot, 1)).toBe(1_600);
    expect(sum(split)).toBe(pot);
  });

  it("dva kluby v jedné obci: lepší proslov a vyšší přízeň dostanou víc", () => {
    const split = splitCouncilPot(30_000, [
      { key: "firefighters", kind: "firefighters" },
      { key: "hunters", kind: "hunters" },
      { key: "good", kind: "club", favor: 70, verdict: { score: 2, reaction: "" } },
      { key: "meh", kind: "club", favor: 40, verdict: { score: 0, reaction: "" } },
      { key: "silent", kind: "club", favor: 90, verdict: null },
    ], NEUTRAL);
    expect(split.get("good")!).toBeGreaterThan(split.get("meh")!);
    expect(split.get("meh")!).toBeGreaterThan(split.get("silent")!);
    expect(split.get("silent")).toBe(clubMinimum(30_000, 3));
    expect(sum(split)).toBe(30_000);
  });

  it("urážlivý proslov nedá víc než minimum, ale ani míň", () => {
    const split = splitCouncilPot(20_000, [
      { key: "firefighters", kind: "firefighters" },
      { key: "hunters", kind: "hunters" },
      { key: "rude", kind: "club", favor: 50, verdict: { score: -2, reaction: "" } },
    ], NEUTRAL);
    expect(split.get("rude")).toBe(clubMinimum(20_000, 1));
  });

  it("sportovci v zastupitelstvu přejí fotbalu víc než tradicionalisté", () => {
    const applicants: PotApplicant[] = [
      { key: "firefighters", kind: "firefighters" },
      { key: "hunters", kind: "hunters" },
      { key: "club", kind: "club", favor: 50, verdict: { score: 1, reaction: "" } },
    ];
    const sporty = splitCouncilPot(20_000, applicants, councilTaste(["sportovec", "sportovec", "populista", "podnikatel"]));
    const old = splitCouncilPot(20_000, applicants, councilTaste(["tradicionalista", "tradicionalista", "tradicionalista", "aktivista"]));
    expect(sporty.get("club")!).toBeGreaterThan(old.get("club")!);
    expect(old.get("firefighters")!).toBeGreaterThan(sporty.get("firefighters")!);
  });

  it("minimum se vejde i při čtyřech klubech", () => {
    const min = clubMinimum(12_000, 4);
    expect(min * 4).toBeLessThan(12_000);
    expect(min % 100).toBe(0);
  });

  it("bank podle velikosti obce, zaokrouhlený na tisíce", () => {
    expect(councilPot("hamlet", 1)).toBeLessThan(councilPot("town", 1));
    expect(councilPot("village", 7) % 1000).toBe(0);
    expect(councilPot(null, 3)).toBeGreaterThan(0);
  });
});

describe("posouzení proslovu pravidlem (AI vypnutá)", () => {
  it("konkrétní proslov o dětech, hřišti a obci je dobrý", () => {
    const v = ruleSpeechVerdict(
      "Vážení zastupitelé, za peníze bychom koupili nové branky a míče pro žáky, opravili kabiny a na jaře uspořádáme "
      + "brigádu na úklid obce s hasiči. Fotbal tu hraje celá vesnice a děti mají kam chodit místo mobilu.",
    );
    expect(v.score).toBeGreaterThanOrEqual(2);
    expect(v.reaction).not.toMatch(/\d/);
  });

  it("sprostý proslov s překlepy zastupitele urazí", () => {
    const v = ruleSpeechVerdict("dejte nam ty prachy vy kurvy, stejne je prochlastate na hodech, debilove");
    expect(v.score).toBe(-2);
  });

  it("dvě slova jsou prázdné fráze", () => {
    expect(ruleSpeechVerdict("Dejte nám peníze.").score).toBe(0);
  });
});

describe("posouzení proslovu modelem", () => {
  it("prompt nese povahy zastupitelů, přízeň slovy a proslov", () => {
    const p = buildJudgePrompt({
      village: "Husinec", teamName: "Jiskra Husinec", favor: 80,
      officials: [{ role: "starosta", name: "Josef Novák", personality: "sportovec" }, { role: "zastupitel_1", name: "Eva Malá", personality: "aktivista" }],
      speech: "Chceme nové sítě pro žáky.",
    });
    expect(p).toContain("Josef Novák");
    expect(p).toContain("sportovec");
    expect(p).toContain("Chceme nové sítě pro žáky.");
    expect(p).not.toMatch(/přízeň[^\n]*\d/);
  });

  it("odpověď se ořízne do rozsahu a reakce s čísly neprojde", () => {
    expect(parseJudgeAnswer('{"score": 7, "reaction": "Zastupitelé tleskali."}')).toEqual({ score: 3, reaction: "Zastupitelé tleskali." });
    expect(parseJudgeAnswer('{"score": -1, "reaction": "Dali mu 3 body z 5."}')?.reaction).not.toMatch(/\d/);
    expect(parseJudgeAnswer("nevím")).toBeNull();
    expect(parseJudgeAnswer(null)).toBeNull();
  });

  it("proslov AI klubu od modelu musí mít rozumnou délku", () => {
    expect(parseAiSpeech('{"speech": "Pane starosto, dáme peníze na míče pro děti a na brigády pomůžeme."}')).toContain("míče");
    expect(parseAiSpeech('{"speech": "ok"}')).toBeNull();
    expect(fallbackAiSpeech({ ambition: 20, youthFocus: 80, building: 20 })).toMatch(/dět|žák/);
    expect(fallbackAiSpeech({ ambition: 50, youthFocus: 50, building: 50 })).not.toMatch(/\d/);
  });
});

describe("rozvrh zasedání", () => {
  it("pondělní tick v noci: pozvánka dopoledne, proslov do středy do šesti večer", () => {
    const now = new Date("2026-11-23T03:00:00Z"); // pondělí 4:00 v Praze
    const s = councilSchedule(now, 37);
    const invite = pragueParts(new Date(s.inviteDueAt));
    expect(invite.date).toBe("2026-11-23");
    expect(invite.hour).toBeGreaterThanOrEqual(9);
    expect(invite.hour).toBeLessThan(12);
    expect(s.deadlineAt).toBe("2026-11-25T17:00:00.000Z");
    expect(s.sessionOffsetDays).toBe(2);
  });

  it("tick spuštěný odpoledne pošle pozvánku hned, večerní až ráno", () => {
    const afternoon = new Date("2026-11-23T14:00:00Z");
    expect(councilSchedule(afternoon, 5).inviteDueAt).toBe(afternoon.toISOString());
    const late = councilSchedule(new Date("2026-11-23T20:30:00Z"), 5);
    expect(pragueParts(new Date(late.inviteDueAt)).date).toBe("2026-11-24");
    expect(late.deadlineAt).toBe("2026-11-26T17:00:00.000Z");
    expect(late.sessionOffsetDays).toBe(3);
  });

  it("výsledek až po zasedání a jen přes den", () => {
    const deadline = "2026-11-25T17:00:00.000Z";
    expect(decisionReady(new Date("2026-11-25T18:00:00Z"), deadline)).toBe(false);
    expect(decisionReady(new Date("2026-11-25T19:30:00Z"), deadline)).toBe(true);
    expect(decisionReady(new Date("2026-11-25T21:30:00Z"), deadline)).toBe(false);
    expect(decisionReady(new Date("2026-11-26T07:30:00Z"), deadline)).toBe(true);
  });

  it("starosta odpoví za pár minut, v noci až ráno", () => {
    const day = new Date("2026-11-23T10:00:00Z");
    const due = councilReplyDueAt(day, 11);
    expect(due.getTime() - day.getTime()).toBeGreaterThanOrEqual(5 * 60_000);
    expect(due.getTime() - day.getTime()).toBeLessThanOrEqual(40 * 60_000);
    const night = councilReplyDueAt(new Date("2026-11-23T22:30:00Z"), 11);
    const p = pragueParts(night);
    expect(p.date).toBe("2026-11-24");
    expect(p.hour).toBe(8);
  });
});

describe("texty starosty a redakce", () => {
  it("pozvánka: den, lhůta, bank, ostatní spolky a výchozí výsledek, bez dlouhé pomlčky", () => {
    const t = invitationText({
      mayorFirstName: "Josef", mayorLastName: "Novák", personality: "tradicionalista", pot: 20_000,
      deadlineAt: "2026-11-25T17:00:00.000Z", otherClubs: ["Sokol Husinec"],
    });
    expect(t).toContain("ve středu");
    expect(t).toContain("do středy");
    expect(t).toMatch(/20\s000 Kč/);
    expect(t).toContain("hasiči a myslivci");
    expect(t).toContain("Sokol Husinec");
    expect(t).toContain("jen základ");
    expect(t).not.toMatch(/[—–]/);
    expect(t.replace(/20\s000/, "")).not.toMatch(/\d/);
  });

  it("přízeň se po zasedání pohne jen po výrazném proslovu", () => {
    expect(favorDelta(null)).toBe(0);
    expect(favorDelta({ score: 1, reaction: "" })).toBe(0);
    expect(favorDelta({ score: 3, reaction: "" })).toBeGreaterThan(0);
    expect(favorDelta({ score: -2, reaction: "" })).toBeLessThan(0);
  });
});

describe("článek ze zastupitelstva", () => {
  const facts: ArticleFacts = {
    village: "Husinec", weekdayAdjective: "středečním", mayorName: "Josef Novák", pot: 20_000,
    firefighters: 9_100, hunters: 6_400,
    clubs: [
      { teamName: "Jiskra Husinec", coachName: "Petr Vrba", amount: 4_500, spoke: true, reaction: "Zastupitelé pokývali.", speechExcerpt: "Míče pro žáky." },
    ],
  };

  it("titulek od modelu musí zmínit obec, stačí skloňovaný tvar", () => {
    expect(headlineNamesVillage("Husinec: obecní kasa se dělila mezi spolky", "Husinec")).toBe(true);
    expect(headlineNamesVillage("V Kunraticích se dělily obecní peníze", "Kunratice")).toBe(true);
    expect(headlineNamesVillage("Na Břevnově rozdělili peníze spolkům", "Břevnov")).toBe(true);
    expect(headlineNamesVillage("Dotace pro spolky", "Kunratice")).toBe(false);
    expect(headlineNamesVillage("Zastupitelstvo rozhodlo o dotacích pro spolky", "Michle")).toBe(false);
  });

  it("připravený článek uvede všechny částky a titulek je bez čísel", () => {
    const a = fallbackCouncilArticle(facts, 3);
    expect(a.headline).not.toMatch(/\d/);
    for (const n of ["20 000", "9 100", "6 400", "4 500"]) expect(a.body.replace(/[\u00a0\u202f]/g, " ")).toContain(n);
    expect(`${a.headline} ${a.body}`).not.toMatch(/[—–]/);
    expect(checkCouncilArticle(JSON.stringify(a), facts)).not.toBeNull();
  });

  it("článek od modelu s vymyšlenou částkou nebo číslem v titulku neprojde", () => {
    const ok = JSON.stringify({ headline: "Hasiči berou nejvíc", body: "Zastupitelstvo obce Husinec rozdělilo 20 000 Kč. Hasiči dostali 9 100 Kč, myslivci 6 400 Kč a Jiskra 4 500 Kč, protože trenér poslal proslov o míčích." });
    expect(checkCouncilArticle(ok, facts)).not.toBeNull();
    const invented = JSON.stringify({ headline: "Hasiči berou nejvíc", body: "Zastupitelstvo obce Husinec rozdělilo 20 000 Kč. Hasiči dostali 12 000 Kč a myslivci zbytek, fotbal jen drobné, i když trenér poslal dlouhý proslov." });
    expect(checkCouncilArticle(invented, facts)).toBeNull();
    const digits = JSON.stringify({ headline: "Fotbal dostal 4 500 Kč", body: "Zastupitelstvo obce Husinec rozdělilo 20 000 Kč. Hasiči dostali 9 100 Kč, myslivci 6 400 Kč a Jiskra 4 500 Kč, protože trenér poslal proslov." });
    expect(checkCouncilArticle(digits, facts)).toBeNull();
  });
});
