/**
 * Tvrdé jádro a rivalita mezi tábory.
 *
 * Obojí vstupuje do rizika výtržnosti a do pokut, takže se to nesmí rozjet ani
 * jedním směrem: jádro nesmí být větší než parta, rivalita nesmí růst donekonečna
 * a bez střetů musí vychladnout.
 */
import { describe, it, expect } from "vitest";
import {
  jadroVelikost, jadroNaVenkovni, jadroZtrata,
  rivalitaKlic, rivalitaPo, rivalitaHorka, rivalitaWord,
  incidentChance, FAN_SKALY,
  type IncidentContext,
} from "./fan-groups";

describe("tvrdé jádro", () => {
  it("rodiny a pamětníci žádné nemají, mezi kočárky se nikdo neperá", () => {
    expect(jadroVelikost({ kind: "rodiny", size: 200, mood: 90, passion: 90 })).toBe(0);
    expect(jadroVelikost({ kind: "pametnici", size: 200, mood: 90, passion: 90 })).toBe(0);
  });

  it("nikdy není větší než celá parta", () => {
    for (const size of [6, 12, 40, 500]) {
      const core = jadroVelikost({ kind: "kotel", size, mood: 100, passion: 100 });
      expect(core).toBeLessThanOrEqual(size);
    }
  });

  it("spokojený kotel má jádro větší než otrávený", () => {
    const spokojeny = jadroVelikost({ kind: "kotel", size: 100, mood: 90, passion: 85 });
    const otraveny = jadroVelikost({ kind: "kotel", size: 100, mood: 10, passion: 85 });
    expect(spokojeny).toBeGreaterThan(otraveny);
  });

  it("pár chlapů není tvrdé jádro", () => {
    expect(jadroVelikost({ kind: "kotel", size: 10, mood: 50, passion: 55 })).toBe(0);
  });

  it("ven jezdí jen část jádra", () => {
    const core = 40;
    const venku = jadroNaVenkovni(core);
    expect(venku).toBeGreaterThan(0);
    expect(venku).toBeLessThan(core);
  });

  it("ztráta po rvačce bolí víc než zavřený sektor a nepřeteče", () => {
    expect(jadroZtrata(40, "rvacka")).toBeGreaterThan(jadroZtrata(40, "zavreny_sektor"));
    expect(jadroZtrata(2, "rvacka")).toBeLessThanOrEqual(2);
    expect(jadroZtrata(0, "rvacka")).toBe(0);
  });
});

describe("rivalita mezi tábory", () => {
  it("dvojice má vždycky stejný klíč, ať se ptá kdokoli", () => {
    const a = rivalitaKlic("tym-b", "tym-a");
    const b = rivalitaKlic("tym-a", "tym-b");
    expect(a.id).toBe(b.id);
    expect(a.a).toBe("tym-a");
  });

  it("rvačka přiloží víc než obyčejná výtržnost a ta víc než samotný zápas", () => {
    expect(rivalitaPo(0, 0, "rvacka")).toBeGreaterThan(rivalitaPo(0, 0, "incident"));
    expect(rivalitaPo(0, 0, "incident")).toBeGreaterThan(rivalitaPo(0, 0, "zapas"));
  });

  it("bez střetu vychladne", () => {
    const po = rivalitaPo(50, 30, null);
    expect(po).toBeLessThan(50);
    expect(po).toBeGreaterThanOrEqual(0);
  });

  it("chladne PŘED přiložením, zápas po roce nestartuje z původní hodnoty", () => {
    const cerstve = rivalitaPo(60, 0, "rvacka");
    const poRoce = rivalitaPo(60, 365, "rvacka");
    expect(poRoce).toBeLessThan(cerstve);
  });

  it("nepřeteče přes strop ani pod nulu", () => {
    expect(rivalitaPo(98, 0, "rvacka")).toBeLessThanOrEqual(FAN_SKALY.RIVALITA.MAX);
    expect(rivalitaPo(1, 10_000, null)).toBe(0);
  });

  it("slovní popis sedí na prahu horka", () => {
    expect(rivalitaHorka(FAN_SKALY.RIVALITA.PRAH_HORKO)).toBe(true);
    expect(rivalitaHorka(FAN_SKALY.RIVALITA.PRAH_HORKO - 1)).toBe(false);
    expect(rivalitaWord(0)).toBe("žádná");
    expect(rivalitaWord(90)).toBe("nesmiřitelná");
  });
});

describe("rivalita v riziku výtržnosti", () => {
  const ctx = (over: Partial<IncidentContext> = {}): IncidentContext => ({
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
  });

  it("vyhrocená rivalita riziko zvedne", () => {
    expect(incidentChance(ctx({ rivalita: 90 }))).toBeGreaterThan(incidentChance(ctx()));
  });

  it("počítá se vedle derby, ne místo něj", () => {
    const jenDerby = incidentChance(ctx({ derby: true }));
    const oboje = incidentChance(ctx({ derby: true, rivalita: 90 }));
    expect(oboje).toBeGreaterThan(jenDerby);
  });

  it("ani s maximální rivalitou se nepřekročí strop", () => {
    const extrem = incidentChance(ctx({
      rivalita: 100, derby: true, homeLosing: true, beerPerAttendee: 1,
      awayUltrasSize: 400, group: { kind: "kotel", aggression: 100, heat: 100, mood: 0, size: 300, sectorClosed: false },
    }));
    expect(extrem).toBeLessThanOrEqual(FAN_SKALY.MAX_RATE);
  });

  it("zavřený sektor vynuluje riziko i při vyhrocené rivalitě", () => {
    expect(incidentChance(ctx({
      rivalita: 100, derby: true,
      group: { kind: "kotel", aggression: 100, heat: 100, mood: 0, size: 200, sectorClosed: true },
    }))).toBe(0);
  });
});
