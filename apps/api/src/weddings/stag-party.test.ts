import { describe, expect, it } from "vitest";
import { INCIDENT_KIND_TEXT } from "../ai-coach/incident-decision";
import { createRng } from "../generators/rng";
import { KATALOG_PODLE_KIND } from "../incidents/katalog";
import { vylosujIncident } from "../incidents/losovani";
import { SANCE_SPOUSTENYCH } from "../incidents/nastaveni";
import { MISTO_INCIDENTU } from "../incidents/stopy";
import { jeOtazkaNaIncident } from "../incidents/tema";
import { hrac, stavKlubu } from "../incidents/testovaci-stav";
import type { StavKlubu, Ztrata } from "../incidents/typy";

const GROOM = hrac({ id: "z", jmeno: "Franta Ženich", alkohol: 70 });
const DRINKER_1 = hrac({ id: "p1", jmeno: "Pepa Pivař", alkohol: 90 });
const DRINKER_2 = hrac({ id: "p2", jmeno: "Karel Rum", alkohol: 65 });
const SOBER = hrac({ id: "s", jmeno: "Jan Střízlivý", alkohol: 20 });

function state(over: Partial<StavKlubu> = {}): StavKlubu {
  return stavKlubu({
    den: "2026-11-24", gameDate: "2026-11-24T16:00:00.000Z",
    kadr: [GROOM, DRINKER_1, DRINKER_2, SOBER],
    stadion: { changing_rooms: 2, pitch_condition: 70 },
    upcomingWedding: { groomId: "z", date: "2026-11-27" },
    ...over,
  });
}

const stag = () => {
  const d = KATALOG_PODLE_KIND.get("stag_party");
  if (!d) throw new Error("chybí stag_party v katalogu");
  return d;
};

describe("rozlučka se svobodou: spouštěný incident podle vzoru oslavy v kabině", () => {
  it("je spouštěná, mimo náhodný los a má vlastní šanci", () => {
    expect(stag()).toMatchObject({ spousteny: true, vaha: 0, category: "poskozeni" });
    expect(SANCE_SPOUSTENYCH.stag_party).toBeGreaterThan(0);
    expect(SANCE_SPOUSTENYCH.stag_party).toBeLessThan(1);
  });

  it("jen pár dní před svatbou, se dvěma pijáky kromě ženicha a s kabinou", () => {
    expect(stag().muze(state())).toBe(true);
    expect(stag().muze(state({ den: "2026-11-26" }))).toBe(true);
    expect(stag().muze(state({ upcomingWedding: null }))).toBe(false);
    // Svatba je za týden, na rozlučku je brzo.
    expect(stag().muze(state({ upcomingWedding: { groomId: "z", date: "2026-12-04" } }))).toBe(false);
    // V den svatby už se neloučí.
    expect(stag().muze(state({ den: "2026-11-27" }))).toBe(false);
    expect(stag().muze(state({ stadion: { pitch_condition: 70 } }))).toBe(false);
    expect(stag().muze(state({ kadr: [GROOM, DRINKER_1, SOBER] }))).toBe(false);
  });

  it("pachatelem je nejtvrdší piják, ženich je v textu a rozbije se jen kabina", () => {
    const s = state({ stadion: { changing_rooms: 1, showers: 1, toilets: 1, refreshments: 3, pitch_condition: 70 } });
    for (let seed = 1; seed <= 200; seed++) {
      const n = stag().vytvor(s, createRng(seed));
      expect(n).toMatchObject({ kind: "stag_party", category: "poskozeni", status: "otevreny", culpritType: "hrac", culpritPlayerId: "p1", culpritRevealed: false });
      expect(n?.text).toContain("Franta Ženich");
      expect(n?.text).not.toContain("—");
      const z = n?.ztraty[0] as Extract<Ztrata, { typ: "stadion" }>;
      expect(["changing_rooms", "showers", "toilets"]).toContain(z.zarizeni);
      expect(z.urovni).toBe(1);
    }
  });

  it("v losu dne se občas stane, bez svatby nikdy", () => {
    let withWedding = 0;
    let without = 0;
    for (let seed = 1; seed <= 500; seed++) {
      if (vylosujIncident(state(), createRng(seed))?.kind === "stag_party") withWedding++;
      if (vylosujIncident(state({ upcomingWedding: null }), createRng(seed))?.kind === "stag_party") without++;
    }
    expect(withWedding).toBeGreaterThan(50);
    expect(without).toBe(0);
  });

  it("je zaregistrovaná pro stopy, otázky v chatu i AI trenéra", () => {
    expect(MISTO_INCIDENTU.stag_party).toBe("kabiny");
    expect(INCIDENT_KIND_TEXT.stag_party).toMatch(/stag/);
    const incident = { kind: "stag_party", ztraty: [{ typ: "stadion", zarizeni: "changing_rooms", urovni: 1 }] as Ztrata[] };
    expect(jeOtazkaNaIncident("Kdo to na tý rozlučce v kabině rozmlátil, vy dobytci?", incident)).toBe(true);
    expect(jeOtazkaNaIncident("Co se dělo na rozlučce se svobodou? Kdo to rozbil?", incident)).toBe(true);
    expect(jeOtazkaNaIncident("Sraz v kabině v pět.", incident)).toBe(false);
  });
});
