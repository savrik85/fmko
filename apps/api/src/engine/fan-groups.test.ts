/**
 * Testy katalogu part, generátoru vůdců a matematiky výtržností — čisté funkce, bez DB.
 */
import { describe, it, expect } from "vitest";
import {
  FAN_GROUPS, FAN_GROUP_KINDS, FAN_LEADER_ARCHETYPES, FAN_INCIDENTS, FAN_SKALY,
  incidentChance, incidentWeights, rollSeverity, fineFor, incidentOutcome,
  groupNoiseShare, fanLeaderArchetypeLabel, fanGroupMatchEffects, NEUTRAL_GROUP_EFFECTS,
  type IncidentContext, type FanIncidentKind, type GroupMatchState,
} from "./fan-groups";
import { generateFanGroups } from "../fans/fan-group-generator";
import { SKALY, calculateFacilityEffects } from "../stadium/stadium-generator";

const SURNAMES: Record<string, number> = {
  "Novák": 45, "Svoboda": 38, "Novotný": 36, "Dvořák": 35, "Černý": 32,
  "Procházka": 30, "Kučera": 28, "Veselý": 25, "Horák": 24, "Němec": 22,
  "Pokorný": 20, "Marek": 19, "Pospíšil": 18, "Hájek": 17, "Jelínek": 16,
};

const OPTS = { obec: "Lenora", okoli: "Volary", surnames: SURNAMES };

/** Základní situace: klidná parta, nic se neděje. */
function ctx(over: Partial<IncidentContext> = {}): IncidentContext {
  return {
    group: { kind: "kotel", aggression: 70, heat: 0, mood: 55, size: 60, sectorClosed: false },
    sector: "kotel",
    leaderRadikalnost: 50,
    derby: false,
    rivalita: 0,
    homeLosing: false,
    beerPerAttendee: 0,
    awayUltrasSize: 0,
    securityRiskReduction: 0,
    sectorSeparation: 0,
    cageBlok: 0,
    tifo: false,
    ...over,
  };
}

describe("katalog part", () => {
  it("každá parta má vůdcovské archetypy, které existují", () => {
    for (const kind of FAN_GROUP_KINDS) {
      const def = FAN_GROUPS[kind];
      expect(def.leaders.length).toBeGreaterThan(0);
      for (const a of def.leaders) expect(FAN_LEADER_ARCHETYPES[a]).toBeDefined();
    }
  });

  it("součet podílů jedné vrstvy nepřeteče přes 100 %", () => {
    for (const tier of ["hardcore", "regular", "casual"] as const) {
      const max = FAN_GROUP_KINDS
        .filter((k) => FAN_GROUPS[k].tier === tier)
        .reduce((s, k) => s + FAN_GROUPS[k].shareRange[1], 0);
      expect(max).toBeLessThanOrEqual(1);
    }
  });

  it("archetypy mají ženské tvary a stejný počet povolání jako mužské", () => {
    for (const [key, def] of Object.entries(FAN_LEADER_ARCHETYPES)) {
      expect(def.labelF.length, key).toBeGreaterThan(0);
      expect(def.bioF.length, key).toBeGreaterThan(0);
      expect(def.hlaskaF.length, key).toBeGreaterThan(0);
      expect(def.occupationsF.length, key).toBe(def.occupations.length);
    }
  });

  it("popisek archetypu se řídí pohlavím", () => {
    expect(fanLeaderArchetypeLabel("stary_kapo", "m")).toBe("Starý kápo");
    expect(fanLeaderArchetypeLabel("stary_kapo", "f")).toBe("Stará kápo");
    expect(fanLeaderArchetypeLabel("neznamy")).toBe("neznamy");
  });
});

describe("generátor part", () => {
  const groups = generateFanGroups("team-abc", OPTS);

  it("vygeneruje všechny party klubu", () => {
    expect(groups).toHaveLength(FAN_GROUP_KINDS.length);
    expect(new Set(groups.map((g) => g.kind)).size).toBe(FAN_GROUP_KINDS.length);
  });

  it("je deterministický, stejný klub dá stejné lidi", () => {
    const znovu = generateFanGroups("team-abc", OPTS);
    expect(znovu).toEqual(groups);
  });

  it("jiný klub dostane jiné lidi", () => {
    const jiny = generateFanGroups("team-xyz", OPTS);
    expect(jiny.map((g) => g.leader.id)).not.toEqual(groups.map((g) => g.leader.id));
  });

  it("žádní dva vůdci jednoho klubu se nejmenují stejně", () => {
    const jmena = groups.map((g) => `${g.leader.firstName} ${g.leader.lastName}`);
    expect(new Set(jmena).size).toBe(jmena.length);
  });

  it("parta z okolí nese jméno spádové obce, ostatní jméno domácí obce", () => {
    const okoli = groups.find((g) => g.kind === "parta_z_okoli")!;
    // Šablona nemusí placeholder obsahovat („Autobusáci"), ale když ano, je to Volary.
    if (okoli.name.includes(" z ") || okoli.name.includes("Výjezd")) {
      expect(okoli.name).toContain("Volary");
    }
    expect(okoli.name).not.toContain("{obec}");
    for (const g of groups) expect(g.name).not.toContain("{obec}");
  });

  it("bez spádové obce se parta z okolí jmenuje obecně, ne s prázdnou dírou", () => {
    const bezOkoli = generateFanGroups("team-abc", { ...OPTS, okoli: null });
    const p = bezOkoli.find((g) => g.kind === "parta_z_okoli")!;
    expect(p.name).not.toContain("{obec}");
    expect(p.name.trim()).toBe(p.name);
  });

  it("osy vůdce i party padnou do rozsahů svého archetypu", () => {
    for (const g of groups) {
      const gd = FAN_GROUPS[g.kind];
      expect(g.aggression).toBeGreaterThanOrEqual(gd.aggression[0]);
      expect(g.aggression).toBeLessThanOrEqual(gd.aggression[1]);
      expect(g.share).toBeGreaterThanOrEqual(gd.shareRange[0]);
      expect(g.share).toBeLessThanOrEqual(gd.shareRange[1]);

      const ld = FAN_LEADER_ARCHETYPES[g.leader.archetype];
      expect(g.leader.age).toBeGreaterThanOrEqual(ld.ageRange[0]);
      expect(g.leader.age).toBeLessThanOrEqual(ld.ageRange[1]);
      expect(ld.radikalnost[0]).toBeLessThanOrEqual(g.leader.radikalnost);
      expect(g.leader.radikalnost).toBeLessThanOrEqual(ld.radikalnost[1]);
    }
  });

  it("vůdkyně dostane ženské povolání, bio i příjmení", () => {
    // Projdeme dost klubů, aby na některý vyšla žena — organizátorka jich má 85 %.
    let nasla = false;
    for (let i = 0; i < 40 && !nasla; i++) {
      for (const g of generateFanGroups(`t-${i}`, OPTS)) {
        if (g.leader.gender !== "f") continue;
        nasla = true;
        const d = FAN_LEADER_ARCHETYPES[g.leader.archetype];
        expect(d.occupationsF).toContain(g.leader.occupation);
        expect(g.leader.bio).toBe(d.bioF);
        expect(g.leader.lastName).toMatch(/(á|ová)$/);
      }
    }
    expect(nasla).toBe(true);
  });
});

describe("šance na výtržnost", () => {
  it("malá parta nic neprovede", () => {
    expect(incidentChance(ctx({ group: { ...ctx().group, size: FAN_SKALY.MIN_SIZE - 1 } }))).toBe(0);
  });

  it("uzavřený sektor je nulová šance, lidi se dovnitř nedostanou", () => {
    expect(incidentChance(ctx({ group: { ...ctx().group, sectorClosed: true } }))).toBe(0);
  });

  it("naštvanost, derby, prohra i pivo riziko zvyšují", () => {
    const zaklad = incidentChance(ctx());
    expect(incidentChance(ctx({ group: { ...ctx().group, heat: 100 } }))).toBeGreaterThan(zaklad);
    expect(incidentChance(ctx({ derby: true }))).toBeGreaterThan(zaklad);
    expect(incidentChance(ctx({ homeLosing: true }))).toBeGreaterThan(zaklad);
    expect(incidentChance(ctx({ beerPerAttendee: 1 }))).toBeGreaterThan(zaklad);
    expect(incidentChance(ctx({ awayUltrasSize: 200 }))).toBeGreaterThan(zaklad);
    expect(incidentChance(ctx({ tifo: true }))).toBeGreaterThan(zaklad);
  });

  it("ochranka i oplocení riziko srážejí, každý stupeň o kus víc", () => {
    // Čísla se berou z jediného zdroje — škál stadionu, ne z vlastní kopie v enginu.
    const p = [0, 1, 2, 3].map((l) =>
      incidentChance(ctx({ securityRiskReduction: calculateFacilityEffects({ security: l }).securityRiskReduction })));
    expect(p[0]).toBeGreaterThan(p[1]);
    expect(p[1]).toBeGreaterThan(p[2]);
    expect(p[2]).toBeGreaterThan(p[3]);
    expect(incidentChance(ctx({ sectorSeparation: SKALY.fence.oddeleni[3] })))
      .toBeLessThan(incidentChance(ctx()));
  });

  it("spokojená parta je klidnější než nespokojená", () => {
    const spokojena = incidentChance(ctx({ group: { ...ctx().group, mood: 90 } }));
    const nespokojena = incidentChance(ctx({ group: { ...ctx().group, mood: 10 } }));
    expect(spokojena).toBeLessThan(nespokojena);
  });

  it("ani nejhorší kombinace nepřekročí strop", () => {
    const peklo = incidentChance(ctx({
      group: { kind: "kotel", aggression: 100, heat: 100, mood: 0, size: 500, sectorClosed: false },
      derby: true, homeLosing: true, beerPerAttendee: 1, awayUltrasSize: 500, tifo: true,
      securityRiskReduction: 0, sectorSeparation: 0, cageBlok: 0,
    }));
    expect(peklo).toBeLessThanOrEqual(FAN_SKALY.MAX_RATE);
  });

  it("nesmyslné hodnoty vybavení se oříznou místo pádu na NaN", () => {
    expect(incidentChance(ctx({ securityRiskReduction: 5, sectorSeparation: -3 }))).toBe(0);
    expect(incidentChance(ctx({ securityRiskReduction: -1, sectorSeparation: 2 }))).toBe(0);
  });
});

describe("výběr a závažnost skutku", () => {
  it("rvačka s hosty se nabídne jen když hostující kotel dorazil", () => {
    expect(incidentWeights("kotel", { awayUltrasPresent: false, sector: "kotel" })).not.toHaveProperty("bitka_kotle");
    expect(incidentWeights("kotel", { awayUltrasPresent: true, sector: "kotel" })).toHaveProperty("bitka_kotle");
  });

  it("rodiny bordel nedělají", () => {
    expect(Object.keys(incidentWeights("rodiny", { awayUltrasPresent: true, sector: "hlavni" }))).toHaveLength(0);
  });

  it("pamětníci umí leda vynadat rozhodčímu", () => {
    expect(Object.keys(incidentWeights("pametnici", { awayUltrasPresent: true, sector: "hlavni" }))).toEqual(["vyhrozovani"]);
  });

  it("závažnost zůstane v rozsahu skutku", () => {
    for (const kind of Object.keys(FAN_INCIDENTS) as FanIncidentKind[]) {
      const [lo, hi] = FAN_INCIDENTS[kind].severityRange;
      for (const roll of [0, 0.5, 0.999]) {
        for (const agg of [0, 50, 100]) {
          const s = rollSeverity(roll, 1, kind, { aggression: agg, leaderRadikalnost: agg, severityDropChance: 0 });
          expect(s, `${kind} roll=${roll} agg=${agg}`).toBeGreaterThanOrEqual(lo);
          expect(s).toBeLessThanOrEqual(hi);
        }
      }
    }
  });

  it("profesionální ochranka věc uhasí dřív, srazí stupeň", () => {
    const drop = calculateFacilityEffects({ security: 3 }).securitySeverityDrop;
    const bez = rollSeverity(1, 1, "bitka_kotle", { aggression: 100, leaderRadikalnost: 100, severityDropChance: 0 });
    const s = rollSeverity(1, 0, "bitka_kotle", { aggression: 100, leaderRadikalnost: 100, severityDropChance: drop });
    expect(s).toBe(bez - 1);
  });

  it("radikální vůdce tlačí závažnost nahoru", () => {
    const klid = rollSeverity(0.5, 1, "hazeni", { aggression: 50, leaderRadikalnost: 0, severityDropChance: 0 });
    const radikal = rollSeverity(0.5, 1, "hazeni", { aggression: 50, leaderRadikalnost: 100, severityDropChance: 0 });
    expect(radikal).toBeGreaterThanOrEqual(klid);
  });
});

describe("následky", () => {
  it("pokuta roste s reputací a je zaokrouhlená na stovky", () => {
    const mala = fineFor("pyro", 2, 20);
    const velka = fineFor("pyro", 2, 90);
    expect(mala).toBeLessThan(velka);
    expect(mala % 100).toBe(0);
    expect(velka % 100).toBe(0);
  });

  it("závažnost mimo rozsah se ořízne místo pádu na undefined", () => {
    expect(fineFor("pyro", 0, 50)).toBe(fineFor("pyro", 1, 50));
    expect(fineFor("pyro", 9, 50)).toBe(fineFor("pyro", 3, 50));
  });

  it("rvačka zavře sektor a odežene lidi, pyro na jedničku ne", () => {
    const rvacka = incidentOutcome("bitka_kotle", 3, { reputation: 50, groupSize: 100 });
    expect(rvacka.closeSectorMatches).toBeGreaterThan(0);
    expect(rvacka.fansLost).toBeGreaterThan(0);
    expect(rvacka.moraleDelta).toBeLessThan(0);

    const pyro = incidentOutcome("pyro", 1, { reputation: 50, groupSize: 100 });
    expect(pyro.closeSectorMatches).toBe(0);
    // Světlice po gólu mužstvo nakopne — proto smí být morálka v plusu.
    expect(pyro.moraleDelta).toBeGreaterThan(0);
  });

  it("každý skutek má pokutu i text pro všechny své stupně", () => {
    for (const [kind, def] of Object.entries(FAN_INCIDENTS)) {
      expect(def.texty.length, kind).toBeGreaterThan(0);
      for (let s = def.severityRange[0]; s <= def.severityRange[1]; s++) {
        expect(def.fine[s], `${kind} sev ${s}`).toBeGreaterThan(0);
      }
      expect(Object.keys(def.weightByGroup).length, kind).toBeGreaterThan(0);
    }
  });
});

describe("hlas skupiny", () => {
  it("uzavřený sektor nechá jen ozvěnu", () => {
    const otevreny = groupNoiseShare({ noise: 90, mood: 70, sectorClosed: false });
    const zavreny = groupNoiseShare({ noise: 90, mood: 70, sectorClosed: true });
    expect(zavreny).toBeCloseTo(otevreny * FAN_SKALY.CLOSED_SECTOR_NOISE, 5);
  });

  it("lepší nálada = hlasitější parta", () => {
    expect(groupNoiseShare({ noise: 80, mood: 90, sectorClosed: false }))
      .toBeGreaterThan(groupNoiseShare({ noise: 80, mood: 10, sectorClosed: false }));
  });
});

describe("texty výtržností jsou česky", () => {
  /** Slova, po kterých smí stát neskloňovatelný název party. */
  const NOSICI_PADU = ["parta ", "party ", "stojí "];

  it("název party nikdy nestojí sám v pádu, který by musel skloňovat", () => {
    for (const [kind, def] of Object.entries(FAN_INCIDENTS)) {
      for (const t of def.texty) {
        const i = t.indexOf("{skupina}");
        if (i < 0) continue;
        const pred = t.slice(0, i);
        expect(
          NOSICI_PADU.some((n) => pred.endsWith(n)),
          `${kind}: „${t}", {skupina} je neskloňovatelné jméno, musí stát po ${NOSICI_PADU.join(" / ")}`,
        ).toBe(true);
      }
    }
  });

  it("po vůdci je jen přítomný čas, může to být žena", () => {
    // Minulý čas se v češtině shoduje v rodě, takže „{vudce} nezastavil" by
    // u organizátorky bylo špatně. Přítomný čas tenhle problém nemá.
    const MINULY = /^\{vudce\}\s+\S*(l|la|lo|li|ly)\b/;
    for (const [kind, def] of Object.entries(FAN_INCIDENTS)) {
      for (const t of def.texty) {
        expect(MINULY.test(t), `${kind}: „${t}" — po {vudce} patří přítomný čas`).toBe(false);
      }
    }
  });

  it("každý text končí tečkou a nemá zbylý placeholder", () => {
    for (const [kind, def] of Object.entries(FAN_INCIDENTS)) {
      for (const t of def.texty) {
        expect(t.trim(), kind).toMatch(/[.!?]$/);
        expect(t, kind).not.toMatch(/\{(?!skupina|vudce)[a-z]+\}/);
      }
    }
  });
});

describe("dopady part na zápas", () => {
  /** Průměrná parta — nikde se neliší od neutrálu. */
  const bezna = (o: Partial<GroupMatchState> = {}): GroupMatchState => ({
    size: 100, mood: 50, passion: 55, spending: 55, noise: 42,
    sector: "hlavni", sectorClosed: false, ticketDiscount: 0, ...o,
  });

  it("klub bez part se nehne, neutrál, ne nula", () => {
    expect(fanGroupMatchEffects([])).toEqual(NEUTRAL_GROUP_EFFECTS);
    expect(fanGroupMatchEffects([bezna({ size: 0 })])).toEqual(NEUTRAL_GROUP_EFFECTS);
  });

  it("samé průměrné party ekonomikou nehnou", () => {
    const fx = fanGroupMatchEffects([bezna(), bezna(), bezna()]);
    expect(fx.attendanceMul).toBeCloseTo(1, 5);
    expect(fx.concessionMul).toBeCloseTo(1, 5);
    expect(fx.ticketRevenueMul).toBe(1);
    expect(fx.lockedOut).toBe(0);
  });

  it("zavřený sektor ubere lidi z návštěvy i z hlasu", () => {
    const otevreno = fanGroupMatchEffects([bezna({ size: 60 }), bezna({ size: 40, noise: 90 })]);
    const zavreno = fanGroupMatchEffects([
      bezna({ size: 60 }),
      bezna({ size: 40, noise: 90, sectorClosed: true }),
    ]);
    expect(zavreno.attendanceMul).toBeLessThan(otevreno.attendanceMul);
    expect(zavreno.noiseBonus).toBeLessThan(otevreno.noiseBonus);
    expect(zavreno.lockedOut).toBe(40);
  });

  it("sleva pro sektor ubere z tržby a přitáhne lidi", () => {
    const bez = fanGroupMatchEffects([bezna({ size: 50 }), bezna({ size: 50 })]);
    const se = fanGroupMatchEffects([bezna({ size: 50, ticketDiscount: 0.5 }), bezna({ size: 50 })]);
    expect(se.ticketRevenueMul).toBeLessThan(bez.ticketRevenueMul);
    expect(se.attendanceMul).toBeGreaterThan(bez.attendanceMul);
  });

  it("štamgasti zvednou bufet, rodiny s kočárky ne tolik", () => {
    const utratni = fanGroupMatchEffects([bezna({ spending: 90 })]);
    const skoupi = fanGroupMatchEffects([bezna({ spending: 25 })]);
    expect(utratni.concessionMul).toBeGreaterThan(1);
    expect(skoupi.concessionMul).toBeLessThan(1);
  });

  it("hlasitý kotel v kotli je slyšet víc než na hlavní tribuně", () => {
    const vKotli = fanGroupMatchEffects([bezna({ noise: 100, sector: "kotel" })]);
    const naTribune = fanGroupMatchEffects([bezna({ noise: 100, sector: "hlavni" })]);
    expect(vKotli.noiseBonus).toBeGreaterThan(naTribune.noiseBonus);
  });

  it("nespokojená parta chodí míň než nadšená", () => {
    expect(fanGroupMatchEffects([bezna({ mood: 5 })]).attendanceMul)
      .toBeLessThan(fanGroupMatchEffects([bezna({ mood: 95 })]).attendanceMul);
  });

  it("ani extrémy nevyhodí ekonomiku z kloubů", () => {
    const peklo = fanGroupMatchEffects([
      bezna({ size: 1000, mood: 0, passion: 0, spending: 0, noise: 0, sectorClosed: true }),
      bezna({ size: 1000, mood: 100, passion: 100, spending: 100, noise: 100, ticketDiscount: 0.5, sector: "kotel" }),
    ]);
    expect(peklo.attendanceMul).toBeGreaterThanOrEqual(0.4);
    expect(peklo.attendanceMul).toBeLessThanOrEqual(1.4);
    expect(peklo.concessionMul).toBeGreaterThanOrEqual(0.6);
    expect(peklo.ticketRevenueMul).toBeGreaterThanOrEqual(0.5);
    expect(Math.abs(peklo.noiseBonus)).toBeLessThanOrEqual(1);
  });
});

describe("sektor party", () => {
  const zaklad = (sector: "kotel" | "hlavni" | "za_branou"): IncidentContext => ({
    group: { kind: "kotel", aggression: 70, heat: 0, mood: 55, size: 60, sectorClosed: false },
    sector,
    leaderRadikalnost: 50, derby: false, rivalita: 0, homeLosing: false, beerPerAttendee: 0,
    awayUltrasSize: 0, securityRiskReduction: 0, sectorSeparation: 0, cageBlok: 0, tifo: false,
  });

  it("u hostů je riziko nejvyšší, na hlavní tribuně nejnižší", () => {
    expect(incidentChance(zaklad("za_branou"))).toBeGreaterThan(incidentChance(zaklad("kotel")));
    expect(incidentChance(zaklad("hlavni"))).toBeLessThan(incidentChance(zaklad("kotel")));
  });

  it("od hlavní tribuny se k hostujícímu kotli nikdo nedostane", () => {
    expect(incidentWeights("kotel", { awayUltrasPresent: true, sector: "hlavni" }))
      .not.toHaveProperty("bitka_kotle");
    expect(incidentWeights("kotel", { awayUltrasPresent: true, sector: "za_branou" }))
      .toHaveProperty("bitka_kotle");
  });
});
