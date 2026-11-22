import { addressFormOf } from "./address-form";
import { describe, expect, it } from "vitest";
import {
  BROKEN_PLEDGE_SMS, COACH_REST_REASONS, MATCH_ATTEND_PLEDGE_TEXTS, MATCH_SKIP_PLEDGE_TEXTS, SKIP_PLEDGE_REASONS,
  coachGrantsRest, excusedByCoach, isClearPledge, matchPledgeOverrides, pickGroupLine, parseAttendancePledge, pledgeNote, pledgeOutcome, pledgePromptLines, pledgedAttendProb,
  pledgeDayFromText, resolveTrainingPledge, trainingPledgeIntent, trainingScheduleText, weekdaysNamedIn, type TrainingPledge,
} from "./attendance-pledge";
import { simulateAttendance, trainingWeekdays } from "../season/training";
import { createRng } from "../generators/rng";
import type { GeneratedPlayer } from "../generators/player";

// 2026-11-19 je čtvrtek. Tým trénuje v úterý a v pátek.
const THU = "2026-11-19";
const base = { gameDay: THU, trainingDays: [2, 5], at: "2026-11-19T17:25:00Z", convId: "c1" };

describe("odpověď modelu na slib docházky", () => {
  it("bere jen platné schéma, neznámý den znamená nejbližší", () => {
    expect(parseAttendancePledge({ event: "training", intent: "attend", when: "fri" })).toEqual({ event: "training", intent: "attend", when: "fri" });
    expect(parseAttendancePledge({ event: "match", intent: "skip", when: "neděle" })).toEqual({ event: "match", intent: "skip", when: "next" });
    expect(parseAttendancePledge({ event: "party", intent: "attend", when: "next" })).toBeNull();
    expect(parseAttendancePledge({ event: "training", intent: "maybe" })).toBeNull();
    expect(parseAttendancePledge(null)).toBeNull();
    expect(parseAttendancePledge("attend")).toBeNull();
  });
});

describe("slib na herní dny", () => {
  it("„v pátek dorazím“ ve čtvrtek: zítřejší trénink", () => {
    expect(resolveTrainingPledge({ event: "training", intent: "attend", when: "fri" }, base))
      .toMatchObject({ intent: "attend", from: "2026-11-20", until: "2026-11-20", once: true });
  });

  it("„v úterý dorazím a máknu“: nejbližší úterý, ne dnešek", () => {
    expect(resolveTrainingPledge({ event: "training", intent: "attend", when: "tue" }, base))
      .toMatchObject({ from: "2026-11-24", once: true });
  });

  it("den bez tréninku: slib se nezapíše na jiný den", () => {
    // Středa: netrénuje se. Dřív šel slib na páteční trénink a 📝 ukázala jiný den, než hráč řekl.
    expect(resolveTrainingPledge({ event: "training", intent: "attend", when: "wed" }, { ...base, gameDay: "2026-11-17" })).toBeNull();
    // V den zápasu se netrénuje: „v pátek dorazím“ při pátečním zápase taky nic.
    expect(resolveTrainingPledge({ event: "training", intent: "attend", when: "fri" }, { ...base, matchDays: new Set(["2026-11-20"]) })).toBeNull();
  });

  it("„na trénink tenhle týden nečekejte“: všechny tréninky do týdne", () => {
    expect(resolveTrainingPledge({ event: "training", intent: "skip", when: "week" }, base))
      .toMatchObject({ intent: "skip", from: "2026-11-20", until: "2026-11-24", once: false });
  });

  it("v den zápasu se netrénuje: příští trénink je až další", () => {
    expect(resolveTrainingPledge({ event: "training", intent: "attend", when: "next" }, { ...base, matchDays: new Set(["2026-11-20"]) }))
      .toMatchObject({ from: "2026-11-24" });
  });

  it("tým netrénuje: slib nemá na co platit", () => {
    expect(resolveTrainingPledge({ event: "training", intent: "attend", when: "next" }, { ...base, trainingDays: [] })).toBeNull();
    expect(resolveTrainingPledge({ event: "match", intent: "skip", when: "next" }, base)).toBeNull();
  });

  it("platí jen v určené dny a jen dokud nemá výsledek", () => {
    const p = resolveTrainingPledge({ event: "training", intent: "attend", when: "fri" }, base)!;
    expect(trainingPledgeIntent(p, "2026-11-20T00:00:00Z")).toBe("attend");
    expect(trainingPledgeIntent(p, "2026-11-24")).toBeUndefined();
    expect(trainingPledgeIntent({ ...p, outcome: "broken" }, "2026-11-20")).toBeUndefined();
    expect(trainingPledgeIntent(undefined, "2026-11-20")).toBeUndefined();
    // Po přestupu do jiného týmu slib z minulého klubu neplatí.
    expect(trainingPledgeIntent({ ...p, teamId: "club" }, "2026-11-20", "club")).toBe("attend");
    expect(trainingPledgeIntent({ ...p, teamId: "club" }, "2026-11-20", "rival")).toBeUndefined();
  });

  it("výsledek: nepřišel na slíbený trénink = porušeno, týdenní slib běží do konce", () => {
    const once = resolveTrainingPledge({ event: "training", intent: "attend", when: "next" }, base)!;
    expect(pledgeOutcome(once, "2026-11-20", true)).toBe("kept");
    expect(pledgeOutcome(once, "2026-11-20", false)).toBe("broken");
    const week = resolveTrainingPledge({ event: "training", intent: "attend", when: "week" }, base)!;
    expect(pledgeOutcome(week, "2026-11-20", true)).toBeNull();
    expect(pledgeOutcome(week, "2026-11-24", true)).toBe("kept");
    expect(pledgeOutcome(week, "2026-11-20", false)).toBe("broken");
    const skip = resolveTrainingPledge({ event: "training", intent: "skip", when: "next" }, base)!;
    expect(pledgeOutcome(skip, "2026-11-20", true)).toBe("kept");
  });
});

// Jitona trénuje v neděli, ve středu, v pátek a v sobotu (E2E 22. 11.). V sobotu 28. 11. pohár,
// v pondělí 30. 11. liga: v ty dny se netrénuje.
const JITONA_DAYS = [0, 3, 5, 6];

describe("den jmenovaný v textu má přednost (E2E 22. 11.)", () => {
  it("Beran v pátek 27. 11.: „Ve středu jsem tam“ je středa 2. 12., ne neděle 29. 11.", () => {
    const raw = pledgeDayFromText({ event: "training", intent: "attend", when: "next" }, {
      replyBody: "Ve středu jsem tam, trenére! Standardky mi jdou 👍",
      coachText: "Honzo, dorazíš ve středu na trénink? Potřebuju tě na standardky.", gameDay: "2026-11-27",
    })!;
    expect(raw.when).toBe("wed");
    expect(resolveTrainingPledge(raw, { ...base, gameDay: "2026-11-27", trainingDays: JITONA_DAYS, matchDays: new Set(["2026-11-28"]) }))
      .toMatchObject({ from: "2026-12-02", until: "2026-12-02", once: true });
  });

  it("Hovorka v neděli 29. 11.: „Dorazím v pátek!“ je pátek 4. 12., ne středa 2. 12.", () => {
    const raw = pledgeDayFromText({ event: "training", intent: "attend", when: "next" }, {
      replyBody: "Dorazím v pátek! Standardky budou dobré, jsem připravenej.",
      coachText: "Kubo, dorazíš v pátek na trénink? Budeme dělat standardky.", gameDay: "2026-11-29",
    })!;
    expect(resolveTrainingPledge(raw, { ...base, gameDay: "2026-11-29", trainingDays: JITONA_DAYS, matchDays: new Set(["2026-11-30"]) }))
      .toMatchObject({ from: "2026-12-04" });
  });

  it("model vrátí jiný den, než hráč napsal: platí text", () => {
    expect(pledgeDayFromText({ event: "training", intent: "attend", when: "sun" }, {
      replyBody: "Ve středu jsem tam, trenére!", coachText: "", gameDay: "2026-11-27",
    })).toMatchObject({ when: "wed" });
  });

  it("hráč den nejmenuje: platí den z otázky trenéra", () => {
    expect(pledgeDayFromText({ event: "training", intent: "attend", when: "next" }, {
      replyBody: "Jasně, budu tam!", coachText: "Kubo, dorazíš v pátek na trénink? Budeme dělat standardky.", gameDay: "2026-11-29",
    })).toMatchObject({ when: "fri" });
  });

  it("obecné „přijdu na trénink“ bez dne: nejbližší trénink, jak řekl model", () => {
    const raw = { event: "training", intent: "attend", when: "next" } as const;
    expect(pledgeDayFromText(raw, { replyBody: "Jasně, na trénink přijdu.", coachText: "Přijdeš na trénink?", gameDay: "2026-11-29" })).toEqual(raw);
  });

  it("jmenovaný den bez tréninku: slib nikam jinam (úterý u Jitony)", () => {
    const raw = pledgeDayFromText({ event: "training", intent: "attend", when: "next" }, {
      replyBody: "V úterý dorazím, trenére.", coachText: "", gameDay: "2026-11-29",
    })!;
    expect(resolveTrainingPledge(raw, { ...base, gameDay: "2026-11-29", trainingDays: JITONA_DAYS })).toBeNull();
  });

  it("víc dnů a model žádný z nich: nejasné; „do pátku“ je lhůta, ne den; „zítra“ podle herního dne", () => {
    expect(pledgeDayFromText({ event: "training", intent: "attend", when: "next" }, {
      replyBody: "Ve středu nemůžu, ale v pátek dorazím.", coachText: "", gameDay: "2026-11-29",
    })).toBeNull();
    expect(pledgeDayFromText({ event: "training", intent: "attend", when: "fri" }, {
      replyBody: "Ve středu nemůžu, ale v pátek dorazím.", coachText: "", gameDay: "2026-11-29",
    })).toMatchObject({ when: "fri" });
    expect(weekdaysNamedIn("Do pátku to mám nabitý, nedělej si starosti, uprostřed týdne nic.", "2026-11-29")).toEqual(new Set());
    expect(weekdaysNamedIn("Zítra jsem tam.", "2026-11-29")).toEqual(new Set(["mon"]));
    expect(weekdaysNamedIn("Na páteční trénink ale nepřijdu.", "2026-11-29")).toEqual(new Set(["fri"]));
  });
});

describe("rozpis tréninků", () => {
  it("dny z plánu, vlastní dny, podle počtu, lidský klub bez typu netrénuje", () => {
    const team = { user_id: "u1", training_type: "conditioning", training_sessions: 3, training_days: null };
    expect(trainingWeekdays(team, { 2: {}, 4: {} })).toEqual([2, 4]);
    expect(trainingWeekdays({ ...team, training_days: "[1,5]" }, null)).toEqual([1, 5]);
    expect(trainingWeekdays(team, null)).toEqual([1, 3, 5]);
    expect(trainingWeekdays({ ...team, training_type: null }, null)).toEqual([]);
    expect(trainingWeekdays({ ...team, training_type: null, user_id: "ai" }, null)).toEqual([1, 3, 5]);
  });

  it("pro hráče česky a s předložkou", () => {
    expect(trainingScheduleText([4, 2])).toBe("v úterý a ve čtvrtek");
    expect(trainingScheduleText([1, 3, 5])).toBe("v pondělí, ve středu a v pátek");
    expect(trainingScheduleText([0])).toBe("v neděli");
    expect(trainingScheduleText([])).toBe("");
  });
});

describe("docházka se slibem", () => {
  const player = (o: Partial<GeneratedPlayer> & Record<string, unknown> = {}) => ({
    firstName: "Petr", lastName: "Šimek", age: 26, discipline: 30, alcohol: 40, morale: 50, occupation: "", ...o,
  }) as unknown as GeneratedPlayer;
  const attendedShare = (p: GeneratedPlayer, runs = 400) => {
    let n = 0;
    for (let i = 0; i < runs; i++) if (simulateAttendance(createRng(1000 + i), [p], "balanced")[0].attended) n++;
    return n / runs;
  };

  it("šance: slib zvedne průměrného hráče na úroveň nejspolehlivějších, „nepřijdu“ skoro jistě chybí", () => {
    expect(pledgedAttendProb(0.65, "attend")).toBeCloseTo(0.895, 3);
    expect(pledgedAttendProb(0.3, "attend")).toBeCloseTo(0.79, 3);
    expect(pledgedAttendProb(0.9, "attend")).toBe(0.95);
    expect(pledgedAttendProb(0.9, "skip")).toBe(0.05);
  });

  it("slíbil přijít: chodí výrazně víc než bez slibu, i když trucuje", () => {
    const without = attendedShare(player());
    const pledged = attendedShare(player({ attendancePledge: "attend", leftOutSulk: true }));
    expect(without).toBeLessThan(0.65);
    expect(pledged).toBeGreaterThan(0.78);
  });

  it("řekl, že nepřijde: chybí a v docházce je, že to hlásil předem", () => {
    const p = player({ discipline: 90, attendancePledge: "skip" });
    expect(attendedShare(p)).toBeLessThan(0.1);
    const miss = Array.from({ length: 30 }, (_, i) => simulateAttendance(createRng(i), [p], "balanced")[0]).find((a) => !a.attended)!;
    expect(miss.pledge).toBe("skip");
    expect(SKIP_PLEDGE_REASONS).toContain(miss.reason);
  });

  it("volno od trenéra: chybí s důvodem „dal jsi mu volno“, ne jako vynechaný trénink (Jan Černý, E2E 22. 11.)", () => {
    const p = player({ discipline: 90, attendancePledge: "skip", attendancePledgeRest: true });
    const miss = Array.from({ length: 30 }, (_, i) => simulateAttendance(createRng(i), [p], "balanced")[0]).find((a) => !a.attended)!;
    expect(COACH_REST_REASONS).toContain(miss.reason);
    expect(miss.restByCoach).toBe(true);
  });

  it("volno od trenéra pozná ze slibu; vlastní „nepřijdu“ je pořád vynechaný trénink", () => {
    const pledge = (o: Partial<TrainingPledge>) => ({ intent: "skip", from: "2026-11-22", until: "2026-11-22", once: true, at: "x", convId: "c", teamId: "club", ...o });
    expect(excusedByCoach(pledge({ coachGranted: true }), "2026-11-22", "club")).toBe(true);
    expect(excusedByCoach(pledge({}), "2026-11-22", "club")).toBe(false);
    expect(excusedByCoach(pledge({ coachGranted: true, intent: "attend" }), "2026-11-22", "club")).toBe(false);
    expect(excusedByCoach(pledge({ coachGranted: true }), "2026-11-24", "club")).toBe(false);
    expect(pledgePromptLines({ trainingPledge: pledge({ coachGranted: true }) as TrainingPledge })[0]).toContain("sám dal volno");
    for (const t of [
      "Honzo, slyšíš? Zítra si dej od tréninku pauzu, potřebuju tě v pondělí čerstvýho. Takže zítra nepřijdeš, jo?",
      "Hele, zítra v Hradčanech tě nechám odpočinout, zůstaneš doma.", "Klidně ho vynech, odpočiň si.", "Dám ti volno, ať se dáš do kupy.",
    ]) expect(coachGrantsRest(t), t).toBe(true);
    for (const t of ["Nedám ti volno, přijdeš.", "Zítra trénink v pět, dorazíš?", "Jestli nepřijdeš, letíš."]) expect(coachGrantsRest(t), t).toBe(false);
  });

  it("výslech přebije i slib", () => {
    const a = simulateAttendance(createRng(1), [player({ attendancePledge: "attend" })], "balanced", undefined, 0, 40, ["Výslech na policii"]);
    expect(a[0]).toMatchObject({ attended: false, reason: "Výslech na policii" });
  });
});

describe("kabina zápasu podle slibu", () => {
  const life = (intent: string, matchKey = "cal1", teamId = "club") => JSON.stringify({ matchPledge: { intent, matchKey, matchDay: "2026-11-22", at: "x", convId: "c", teamId } });

  it("„v neděli nemůžu“ omluví, „přijdu“ vrátí z losu, incident nepřebije", () => {
    const out = matchPledgeOverrides([
      { id: "a", life_context: life("skip") },
      { id: "b", life_context: life("attend") },
      { id: "c", life_context: life("attend") },
      { id: "d", life_context: life("skip", "jiny-zapas") },
      { id: "e", life_context: "{neplatný" },
      // Slíbil u nás, pak přestoupil k soupeři v téže lize (stejné kolo v kalendáři): u něj neplatí.
      { id: "f", life_context: life("skip", "cal1", "rival") },
    ], new Map([["b", { category: "personal" }], ["c", { category: "incident" }]]), "cal1", "club");
    expect([...out.skip.keys()]).toEqual(["a"]);
    expect(MATCH_SKIP_PLEDGE_TEXTS).toContain(out.skip.get("a"));
    expect([...out.attend]).toEqual(["b"]);
  });
});

describe("kabina zápasu bez doslovných kopií (E2E 22. 11.)", () => {
  it("šest omluvených slibem v nové kabině: každý jinou větou a bez tvaru oslovení", () => {
    const life = JSON.stringify({ matchPledge: { intent: "skip", matchKey: "cal1", matchDay: "2026-11-22", at: "x", convId: "c", teamId: "club" } });
    const out = matchPledgeOverrides(["a", "b", "c", "d", "e", "f"].map((id) => ({ id, life_context: life })), new Map(), "cal1", "club");
    const texts = [...out.skip.values()];
    expect(new Set(texts).size).toBe(6);
    for (const t of texts) expect(addressFormOf(t), t).toBeNull();
  });

  it("věta k trenérovi drží tvar oslovení, neznámý tvar dostane jen větu bez tvaru", () => {
    for (const pool of [MATCH_ATTEND_PLEDGE_TEXTS, MATCH_SKIP_PLEDGE_TEXTS]) {
      expect(pool.filter((t) => addressFormOf(t) === null).length).toBeGreaterThanOrEqual(8);
      expect(pool.some((t) => addressFormOf(t) === "ty")).toBe(true);
      expect(pool.some((t) => addressFormOf(t) === "vy")).toBe(true);
      for (const seed of ["a", "b", "c", "d", "e", "f", "g", "h"]) {
        expect(addressFormOf(pickGroupLine([pool], [], seed, "ty"))).not.toBe("vy");
        expect(addressFormOf(pickGroupLine([pool], [], seed, "vy"))).not.toBe("ty");
        expect(addressFormOf(pickGroupLine([pool], [], seed, null))).toBeNull();
      }
    }
  });

  it("když je pool v kabině vyčerpaný, bere se z dalšího", () => {
    expect(pickGroupLine([["Hlava třeští, ale přijdu."], ["Beru zpátky, budu tam."]], ["Hlava třeští, ale přijdu."], "s")).toBe("Beru zpátky, budu tam.");
  });
});

describe("texty", () => {
  it("poznámka pro trenéra a řádky do promptu", () => {
    const p: TrainingPledge = { intent: "attend", from: "2026-11-20", until: "2026-11-20", once: true, at: "x", convId: "c" };
    expect(pledgeNote("Petr", p)).toBe("📝 Petr slíbil, že přijde na trénink v pátek 20. 11.");
    expect(pledgeNote("Radek", { ...p, intent: "skip", once: false, until: "2026-11-24" })).toBe("📝 Radek na tréninky do 24. 11. nepřijde.");
    expect(pledgeNote("Tomáš", { intent: "skip", matchKey: "cal1", matchDay: "2026-11-22", at: "x", convId: "c" })).toBe("📝 Tomáš na zápas v neděli 22. 11. nepřijde.");
    expect(pledgePromptLines({ trainingPledge: p })[0]).toContain("slíbil, že přijdeš na trénink v pátek 20. 11.");
    expect(pledgePromptLines({ trainingPledge: { ...p, outcome: "broken", outcomeDay: "2026-11-20" } })[0]).toContain("nepřišel");
    expect(pledgePromptLines({})).toEqual([]);
  });

  it("pooly mají aspoň osm variant a žádnou dlouhou pomlčku", () => {
    for (const pool of [SKIP_PLEDGE_REASONS, MATCH_SKIP_PLEDGE_TEXTS, MATCH_ATTEND_PLEDGE_TEXTS, BROKEN_PLEDGE_SMS]) {
      expect(pool.length).toBeGreaterThanOrEqual(8);
      expect(new Set(pool).size).toBe(pool.length);
      for (const t of pool) expect(t).not.toContain("—");
    }
  });
});

// Lokální E2E 22. 11. (C2, Marek): „…takže asi těžko. 🤕“ dostalo 📝 „nepřijde“. Váhání se hlídalo
// jen ve větě se slovesem docházky a eliptické „asi těžko“, „spíš ne“ sloveso nemají.
describe("váhání bez slovesa docházky", () => {
  const coach = "Matěji, v sobotu je trénink. Přijdeš?";
  it.each([
    "Zranění mi ještě nezhejtlo, takže asi těžko. 🤕",
    "Spíš ne, uvidíme, jak skončím v lese.",
    "Asi ne, trenére.",
    "Nevím, mám šichtu.",
    "Možná, záleží na práci.",
  ])("„%s“ slib není", (reply) => {
    expect(isClearPledge(reply, coach)).toBe(false);
  });

  it("jasná odpověď slib je", () => {
    expect(isClearPledge("Jo, ve středu přijdu.", coach)).toBe(true);
    expect(isClearPledge("V sobotu nemůžu, mám šichtu do večera.", coach)).toBe(true);
  });
});
