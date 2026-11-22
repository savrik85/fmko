import { describe, expect, it } from "vitest";
import {
  APOLOGY_CLUMSY_KABINA, APOLOGY_REFUSED_KABINA, APOLOGY_SINCERE_KABINA, LAPS_RAN_SMS, LAPS_REFUSED_SMS, LAST_CHANCE_REMINDERS,
  RULE_BROKEN_SMS, TEAM_LAPS_KABINA, apologyTone, clubRuleLines, lapsOutcome, lapsPunishmentCues, missedBefore, missedTrainingsAfter,
  pendingRequestOf, rulePromptLine, ruleText, acceptanceInReply,
} from "./coach-rules";
import { COMMITMENT_HINT_RE, commitmentText, parseDetection, quoteHoldsUp } from "./coach-commitments";
import { vahaPachatele } from "../incidents/pachatel";
import { hracZRadku } from "../incidents/stav-klubu";
import { hrac } from "../incidents/testovaci-stav";

describe("rozpoznání pravidel a trestů v SMS", () => {
  it("síto pustí pravidla, tresty a omluvu kabině", () => {
    for (const t of ["Kdo nebude chodit na tréninky, nebude hrát", "budeš běhat kolečka", "Máš poslední šanci, jedna blbost a letíš!", "Omluvíš se celé kabině"]) {
      expect(COMMITMENT_HINT_RE.test(t)).toBe(true);
    }
  });

  it("podmínka k pravidlu patří, otázka ani váhání pravidlem nejsou", () => {
    expect(quoteHoldsUp("Kdo nebude chodit na tréninky, nebude hrát", "Zase 12 omluvenek. Kdo nebude chodit na tréninky, nebude hrát", "training_rule")).toBe(true);
    expect(quoteHoldsUp("jestli ještě něco provedeš, letíš", "Mas posledni sanci, jestli ještě něco provedeš, letíš.", "last_chance")).toBe(true);
    expect(quoteHoldsUp("budeš běhat kolečka", "Možná budeš běhat kolečka.", "laps_penalty")).toBe(false);
    expect(quoteHoldsUp("Omluvíš se kabině", "Omluvíš se kabině?", "squad_apology")).toBe(false);
  });

  // Lokální E2E 22. 11.: „začínáme v půl šesté a bude hodně běhání“ se zapsalo jako kolečka pro
  // celou kabinu a na tréninku 12 hráčů opravdu ztratilo kondici.
  it("plán tréninku, popis zátěže ani vtip trest nejsou, jen výslovný trest", () => {
    const plan = "Ještě k úternímu tréninku: začínáme v půl šesté a bude hodně běhání.";
    expect(parseDetection({ kind: "laps_penalty", quote: "bude hodně běhání", target: "team" }, "MID", plan)).toBeNull();
    const plan2 = "Ve čtvrtek budeme běhat kolečka na rozcvičku a pak standardky.";
    expect(parseDetection({ kind: "laps_penalty", quote: "budeme běhat kolečka na rozcvičku", target: "team" }, "MID", plan2)).toBeNull();
    const load = "Zítra budeš hodně běhat, tak se pořádně vyspi.";
    expect(parseDetection({ kind: "laps_penalty", quote: "Zítra budeš hodně běhat", target: "self" }, "MID", load)).toBeNull();
    const joke = "Ty bys běhal kolečka i ve spánku 😂";
    expect(parseDetection({ kind: "laps_penalty", quote: "Ty bys běhal kolečka i ve spánku", target: "self" }, "MID", joke)).toBeNull();
    // Výslovný trest platí.
    const real = "Kubo, za tu poslední omluvenku poběžíš zítra na tréninku kolečka.";
    expect(parseDetection({ kind: "laps_penalty", quote: "poběžíš zítra na tréninku kolečka", target: "self" }, "MID", real))
      .toEqual({ kind: "laps_penalty", target: "self" });
    expect(parseDetection({ kind: "laps_penalty", quote: "za trest poběžíš kolečka", target: "self" }, "MID", "Za trest poběžíš kolečka."))
      .toEqual({ kind: "laps_penalty", target: "self" });
  });

  it("celá kabina jen při výslovném „celá kabina“ nebo „všichni“, jinak jen tenhle hráč", () => {
    // V SMS jednomu hráči je „budete“ vykání, ne celá kabina.
    expect(parseDetection({ kind: "laps_penalty", quote: "Za trest budete běhat kolečka", target: "team" }, "MID", "Za trest budete běhat kolečka."))
      .toEqual({ kind: "laps_penalty", target: "self" });
    expect(parseDetection({ kind: "laps_penalty", quote: "za trest celá kabina poběží kolečka", target: "team" }, "MID", "Po tom výkonu za trest celá kabina poběží kolečka."))
      .toEqual({ kind: "laps_penalty", target: "team" });
    // „Kdo se omluví…“ je trest pro omluvené, bez „kdo“ to omluvení nejsou.
    expect(parseDetection({ kind: "laps_penalty", quote: "za omluvenku poběžíš kolečka", target: "absentees" }, "MID", "Za omluvenku poběžíš kolečka."))
      .toEqual({ kind: "laps_penalty", target: "self" });
    expect(lapsPunishmentCues("Kdo se omluví, poběží kolečka.")).toEqual({ punishment: true, wholeSquad: false, plural: false, anyone: true });
  });

  it("kolečka: komu, výchozí jen tenhle hráč", () => {
    const msg = "Kdo nebude moct, bude na tréninku běhat kolečka";
    expect(parseDetection({ kind: "laps_penalty", quote: "bude na tréninku běhat kolečka", target: "absentees" }, "MID", msg))
      .toEqual({ kind: "laps_penalty", target: "absentees" });
    expect(parseDetection({ kind: "laps_penalty", quote: "bude na tréninku běhat kolečka", target: "kdokoli" }, "MID", msg))
      .toEqual({ kind: "laps_penalty", target: "self" });
    expect(parseDetection({ kind: "last_chance", quote: "Poslední šance, letíš", target: null }, "MID", "Poslední šance, letíš.")).toEqual({ kind: "last_chance" });
  });

  it("texty pro hráče i trenéra", () => {
    expect(commitmentText("training_rule")).toBe("Kdo vynechá trénink, nehraje");
    expect(ruleText("laps_penalty", { target: "absentees" })).toBe("Kdo se omluví ze zápasu, běhá na tréninku kolečka");
    expect(clubRuleLines([{ kind: "training_rule", details: {}, dueAt: "2026-12-13T10:00:00Z" }])[0]).toContain("kdo vynechá trénink, nehraje (platí do 13. 12.)");
    expect(clubRuleLines([{ kind: "laps_penalty", details: { target: "absentees", squad: true }, dueAt: "x" }])[0]).toContain("kdo se omluví ze zápasu");
    expect(rulePromptLine("last_chance", "active", {}, "2026-12-15T00:00:00Z")).toContain("POSLEDNÍ ŠANCI");
    expect(rulePromptLine("last_chance", "broken", {}, "x")).toContain("hrozí vyhazov");
    expect(rulePromptLine("training_rule", "active", {}, "x")).toBe("");
  });
});

describe("vynechané tréninky", () => {
  it("drží posledních šest za 14 dní a pozná týden před zápasem", () => {
    const list = missedTrainingsAfter(["2026-10-01", "2026-11-10", "x", 5], "2026-11-18");
    expect(list).toEqual(["2026-11-10", "2026-11-18"]);
    expect(missedTrainingsAfter(list, "2026-11-18")).toEqual(["2026-11-10", "2026-11-18"]);
    expect(missedBefore(["2026-11-18"], "2026-11-22")).toBe(true);
    expect(missedBefore(["2026-11-14"], "2026-11-22")).toBe(false);
    expect(missedBefore(["2026-11-22"], "2026-11-22")).toBe(false);
    expect(missedBefore(null, "2026-11-22")).toBe(false);
  });
});

describe("povaha a slovo dané trenérovi", () => {
  const calm = { discipline: 60, temper: 40 };
  const rebel = { discipline: 30, temper: 70 };
  it("kolečka: co slíbil, platí; jinak vzdorovitá povaha odmítne", () => {
    expect(lapsOutcome(calm)).toBe("ran");
    expect(lapsOutcome(rebel)).toBe("refused");
    expect(lapsOutcome(rebel, true)).toBe("ran");
    expect(lapsOutcome(calm, false)).toBe("refused");
  });
  it("omluva kabině: upřímná, kostrbatá, nebo žádná", () => {
    expect(apologyTone(calm)).toBe("sincere");
    expect(apologyTone({ discipline: 45, temper: 50 })).toBe("clumsy");
    expect(apologyTone(rebel)).toBe("refused");
    expect(apologyTone(rebel, true)).toBe("clumsy");
    expect(apologyTone(calm, false)).toBe("refused");
  });
  it("na co kývnout: jen čerstvý pokyn jednotlivci bez odpovědi", () => {
    const now = new Date("2026-11-21T10:00:00Z");
    const c = { id: "c1", kind: "laps_penalty", status: "active", details: { target: "self" as const }, madeAt: "2026-11-21T07:25:00Z" };
    expect(pendingRequestOf([c], ["laps_penalty"], now)).toEqual({ commitmentId: "c1", kind: "laps_penalty" });
    expect(pendingRequestOf([{ ...c, details: { target: "self" as const, accepted: true } }], ["laps_penalty"], now)).toBeUndefined();
    expect(pendingRequestOf([{ ...c, details: { target: "team" as const } }], ["laps_penalty"], now)).toBeUndefined();
    expect(pendingRequestOf([{ ...c, madeAt: "2026-11-19T07:00:00Z" }], ["laps_penalty"], now)).toBeUndefined();
  });
});

describe("poslední šance a výběr pachatele", () => {
  it("varovaný hráč je méně podezřelý, recidivista pořád víc než čistý", () => {
    const h = hrac({ id: "h1", recidivista: true });
    expect(vahaPachatele({ ...h, lastChance: true })).toBeCloseTo(vahaPachatele(h) - 0.5, 5);
    expect(vahaPachatele({ ...h, lastChance: true })).toBeGreaterThan(vahaPachatele({ ...h, recidivista: false }));
    const row = { id: "h1", first_name: "Martin", last_name: "Horák", age: 30, personality: "{}", life_context: JSON.stringify({ lastChanceUntil: "2026-11-17" }), coach_relationship: 40 };
    expect(hracZRadku(row).lastChance).toBe(true);
    expect(hracZRadku({ ...row, life_context: "{}" }).lastChance).toBeUndefined();
  });
});

describe("pooly", () => {
  it("aspoň osm variant, bez opakování a bez dlouhé pomlčky", () => {
    for (const pool of [LAPS_RAN_SMS, LAPS_REFUSED_SMS, TEAM_LAPS_KABINA, RULE_BROKEN_SMS, APOLOGY_SINCERE_KABINA, APOLOGY_CLUMSY_KABINA, APOLOGY_REFUSED_KABINA, LAST_CHANCE_REMINDERS]) {
      expect(pool.length).toBeGreaterThanOrEqual(8);
      expect(new Set(pool).size).toBe(pool.length);
      for (const t of pool) expect(t).not.toContain("—");
    }
    for (const t of [...RULE_BROKEN_SMS, ...LAST_CHANCE_REMINDERS]) expect(t).toContain("{name}");
  });
});

// E2E 22. 11. (Bohuslav, dohoda o hubnutí): kývnutí bez „beru“ se nepoznalo a dohoda zůstala
// bez odpovědi. Rozpoznání slibu dodělané hodinovým během (9fc12a96) bere kývnutí z textu.
describe("kývnutí v textu odpovědi", () => {
  it("souhlasné sloveso k věci dohody je kývnutí", () => {
    for (const t of [
      "Těch 3 kila dám dolů, 1000 Kč se mi hodí",
      "Trenére, zhubnu těch 3 kila, mám to pod kontrolou.",
      "Beru to vážně, zhubnu 3 kila do 14 dní.",
      "Trenére, do dvou týdnů zhubnu těch 3 kila, to mám jasno.",
      "Jasně, beru to. Dám do toho vše, chci ty prachy",
      "Platí, jdu do toho.",
      "Dám to, trenére.",
    ]) expect(acceptanceInReply(t), t).toBe(true);
  });

  it("negace je odmítnutí, váhání, otázka a podmínka nic", () => {
    for (const t of ["Ne, těch 3 kila nedám, zapomeň.", "Nezhubnu, to fakt ne.", "Nechci, kašlu na to."]) expect(acceptanceInReply(t), t).toBe(false);
    for (const t of [
      "Trenére, mám to pod kontrolou.",
      // Otázka s „…, ne?“ není odmítnutí ani kývnutí (Bohuslav 19:04).
      "Trenére, tys mi dal 1000 Kč, když zhubnu 3 kila, ne?",
      "Asi to zhubnu, uvidíme.",
      "Možná těch 3 kila dám dolů.",
      "Jasně, asi to zvládnu.",
      "Kdybych zhubnul, dáš mi to?",
    ]) expect(acceptanceInReply(t), t).toBeUndefined();
  });

  // final3 (E2E 22. 11., harness acc.mjs): obě věty vracely true, jako by hráč kývl.
  it("podmínka nebo protinávrh kývnutí není", () => {
    for (const t of [
      "Udělám to, když mi přidáš.",
      "Dám to, ale chci 2000.",
      "Jasně, beru. Ale chci za to 2000.",
      "Zhubnu, ale jen 2 kila.",
      "Platí, ale až po sezóně.",
      "Udělám to. Přidáš mi?",
    ]) expect(acceptanceInReply(t), t).toBeUndefined();
    // Čisté kývnutí dál projde, i se „když to říkáš“.
    for (const t of ["Udělám to, trenére.", "Dám to, slibuju.", "Jasně, když to říkáš, beru.", "Jasně, do dvou týdnů zhubnu 3 kila, dám se za to 1000 Kč od tebe."]) {
      expect(acceptanceInReply(t), t).toBe(true);
    }
  });
});
