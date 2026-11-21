/**
 * Druhý život legend (F5): kdo je legenda, jakou roli dostane, když model mlčí,
 * a texty pro hráče (bez dlouhé pomlčky, nálada slovy).
 */
import { describe, expect, it } from "vitest";
import {
  checkFarewell, checkLegendSms, fallbackFarewell, fallbackLegendReply, fallbackLegendRole, fallbackLegendSms,
  firstSmsDelayHours, isLegend, LEGEND_PARTICIPANT_PREFIX, legendParticipantId, legendRank, parseRoleAnswer,
  parseTraits, seasonsInClub, traitWords, type LegendFacts, type LegendTraits,
} from "./legends";

const NEUTRAL: LegendTraits = { discipline: 50, patriotism: 50, alcohol: 50, temper: 50, leadership: 50, workRate: 50, aggression: 50 };

function facts(over: Partial<LegendFacts> = {}): LegendFacts {
  return {
    firstName: "Josef",
    lastName: "Kouba",
    nickname: null,
    age: 34,
    position: "DEF",
    seasonsInClub: 3,
    teamName: "Jiskra Husinec",
    role: "referee",
    place: "okres Prachatice",
    traits: NEUTRAL,
    ...over,
  };
}

describe("kdo je legenda", () => {
  it("mladý hráč s jednou sezónou legendou není", () => {
    expect(isLegend({ age: 24, seasonsInClub: 1 })).toBe(false);
    expect(isLegend({ age: 29, seasonsInClub: 0 })).toBe(false);
  });

  it("třicítka nebo dvě sezóny v klubu stačí", () => {
    expect(isLegend({ age: 30, seasonsInClub: 0 })).toBe(true);
    expect(isLegend({ age: 22, seasonsInClub: 2 })).toBe(true);
  });

  it("sezóny v klubu se počítají od sezóny příchodu včetně té skončené", () => {
    expect(seasonsInClub(1, 1)).toBe(1);
    expect(seasonsInClub(3, 1)).toBe(3);
    // Bez smlouvy nevíme nic, platí jen věk.
    expect(seasonsInClub(3, null)).toBe(0);
    // Smlouva z budoucnosti (přestup po rolloveru) není záporná délka.
    expect(seasonsInClub(1, 2)).toBe(0);
  });

  it("v klubu zůstane legendou ten, kdo tam byl nejdéle", () => {
    const old = legendRank({ seasonsInClub: 1, age: 36, overallRating: 40 });
    const loyal = legendRank({ seasonsInClub: 4, age: 31, overallRating: 35 });
    expect(loyal).toBeGreaterThan(old);
  });
});

describe("povaha", () => {
  it("chybějící hodnoty jsou průměr, nesmysl se ignoruje", () => {
    expect(parseTraits("{}")).toEqual(NEUTRAL);
    expect(parseTraits("nesmysl")).toEqual(NEUTRAL);
    expect(parseTraits(JSON.stringify({ discipline: 90, alcohol: "hodně" })).discipline).toBe(90);
    expect(parseTraits(JSON.stringify({ discipline: 90, alcohol: "hodně" })).alcohol).toBe(50);
  });

  it("povaha slovy, bez čísel", () => {
    const words = traitWords({ ...NEUTRAL, discipline: 85, temper: 80, alcohol: 75 });
    expect(words).toContain("disciplinovaný");
    expect(words).toContain("horká hlava");
    expect(words).not.toMatch(/\d/);
    expect(traitWords(NEUTRAL)).not.toMatch(/\d/);
  });
});

describe("role podle pravidla, když model mlčí", () => {
  const all = ["referee", "fan_leader", "pub_owner", "youth_coach"] as const;

  it("disciplinovaný klidný třicátník půjde pískat", () => {
    expect(fallbackLegendRole(32, { ...NEUTRAL, discipline: 90, temper: 15, alcohol: 20 }, [...all])).toBe("referee");
  });

  it("vůdce a patriot bude trénovat žáky", () => {
    expect(fallbackLegendRole(36, { ...NEUTRAL, leadership: 95, patriotism: 90, alcohol: 20, temper: 30 }, [...all])).toBe("youth_coach");
  });

  it("pivař převezme hospodu", () => {
    expect(fallbackLegendRole(41, { ...NEUTRAL, alcohol: 95, discipline: 20 }, [...all])).toBe("pub_owner");
  });

  it("horká hlava a patriot povede kotel", () => {
    expect(fallbackLegendRole(33, { ...NEUTRAL, patriotism: 95, temper: 90, aggression: 80, discipline: 30 }, [...all])).toBe("fan_leader");
  });

  it("bere jen volné role, bez nich nic", () => {
    const ref = { ...NEUTRAL, discipline: 90, temper: 15, alcohol: 20 };
    expect(fallbackLegendRole(32, ref, ["pub_owner"])).toBe("pub_owner");
    expect(fallbackLegendRole(32, ref, [])).toBeNull();
  });
});

describe("odpověď modelu na roli", () => {
  it("platná role z nabídky projde i s důvodem", () => {
    expect(parseRoleAnswer({ role: "pub_owner", reason: "Rád čepuje." }, ["pub_owner", "referee"]))
      .toEqual({ role: "pub_owner", reason: "Rád čepuje." });
    expect(parseRoleAnswer('```json\n{"role": "referee"}\n```', ["referee"])).toEqual({ role: "referee", reason: "" });
  });

  it("role mimo nabídku nebo nesmysl = null", () => {
    expect(parseRoleAnswer({ role: "youth_coach" }, ["referee"])).toBeNull();
    expect(parseRoleAnswer({ role: "starosta" }, ["referee"])).toBeNull();
    expect(parseRoleAnswer("nevím", ["referee"])).toBeNull();
    expect(parseRoleAnswer(null, ["referee"])).toBeNull();
  });
});

describe("texty pro hráče", () => {
  it("SMS z modelu bez dlouhé pomlčky a bez uvozovek, prázdná nebo dlouhá neprojde", () => {
    expect(checkLegendSms({ body: "„Ahoj trenére — v neděli vám pískám.“" })).toBe("Ahoj trenére, v neděli vám pískám.");
    expect(checkLegendSms({ body: "" })).toBeNull();
    expect(checkLegendSms({ body: "a".repeat(700) })).toBeNull();
    expect(checkLegendSms("nic")).toBeNull();
  });

  it("náhradní SMS pro každou roli a téma: bez pomlčky a čísel nálady", () => {
    for (const role of ["referee", "fan_leader", "pub_owner", "youth_coach"] as const) {
      for (const topic of ["first", "chat"] as const) {
        for (let seed = 0; seed < 6; seed++) {
          const text = fallbackLegendSms(facts({ role }), topic, seed, {});
          expect(text.length).toBeGreaterThan(10);
          expect(text).not.toMatch(/[—–]/);
        }
      }
    }
  });

  it("sudí-legenda ohlásí, že bude pískat, a žádnou protekci", () => {
    const text = fallbackLegendSms(facts({ role: "referee" }), "whistle", 1, { whistle: { opponent: "Sokol Lhenice", day: "v neděli" } });
    expect(text).toContain("pískám");
    expect(text.toLowerCase()).toContain("protekc");
    expect(text).toContain("Sokol Lhenice");
  });

  it("náhradní odpověď trenérovi je krátká a bez pomlčky", () => {
    for (let seed = 0; seed < 5; seed++) {
      expect(fallbackLegendReply(seed)).not.toMatch(/[—–]/);
    }
  });

  it("rozloučení ve Zpravodaji: jméno, klub a nová role, bez pomlčky", () => {
    for (const role of ["referee", "fan_leader", "pub_owner", "youth_coach"] as const) {
      const a = fallbackFarewell(facts({ role, place: role === "pub_owner" ? "Hospoda U Lípy" : "okres Prachatice" }));
      expect(a.headline).toContain("Kouba");
      expect(a.body).toContain("Jiskra Husinec");
      expect(`${a.headline} ${a.body}`).not.toMatch(/[—–]/);
    }
    expect(fallbackFarewell(facts({ role: "pub_owner", place: "Hospoda U Lípy" })).body).toContain("Hospoda U Lípy");
  });

  it("článek z modelu musí jmenovat legendu a mít rozumnou délku", () => {
    const body = "Josef Kouba končí. ".repeat(8);
    expect(checkFarewell({ headline: "Sbohem, Pepo — díky za všechno", body }, facts())?.headline).toBe("Sbohem, Pepo, díky za všechno");
    expect(checkFarewell({ headline: "Sbohem", body: "Krátké." }, facts())).toBeNull();
    expect(checkFarewell({ headline: "Sbohem, Pepo", body: "Někdo končí. ".repeat(10) }, facts())).toBeNull();
    expect(checkFarewell(null, facts())).toBeNull();
  });
});

describe("Telefon", () => {
  it("legenda má vlastní předponu kontaktu", () => {
    expect(LEGEND_PARTICIPANT_PREFIX).toBe("ex-");
    expect(legendParticipantId("p-1")).toBe("ex-p-1");
  });

  it("první SMS přijde za dva až čtyři dny", () => {
    for (let seed = 0; seed < 50; seed++) {
      const h = firstSmsDelayHours(seed);
      expect(h).toBeGreaterThanOrEqual(48);
      expect(h).toBeLessThanOrEqual(96);
    }
  });
});
