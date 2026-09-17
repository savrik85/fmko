/**
 * Co model při chatu s hráčem doopravdy dostane.
 *
 * Prompt je jediné místo, kde se rozhoduje, jestli zpráva zní jako od člověka.
 * Testuje se jeho obsah, ne odpověď modelu: ta se lokálně ověřit nedá.
 */
import { describe, it, expect, vi } from "vitest";

vi.mock("../lib/ai-provider", () => ({
  aiContextFromEnv: vi.fn(async () => ({ provider: "gemini" })),
  generateText: vi.fn(async () => JSON.stringify({
    morale_delta: 0, condition_delta: 0, relationship_delta: 0, absence_days: 0, absence_reason: "", summary: "Odešel v klidu.", tone: "neutral",
  })),
}));

import { BEZ_ZNALOSTI, HLAVICKA_ZNALOSTI, type RadekZnalosti } from "../incidents/znalosti";
import { generateText } from "../lib/ai-provider";
import { ZAKAZ_ZIVOTNICH_SITUACI, buildSystemPrompt, evaluateResolution } from "./ai-player-chat";
import { getScenarioById } from "./ai-player-scenarios";
import type { PlayerSnapshot } from "./ai-player-scenarios";

const hrac = (o: Partial<PlayerSnapshot> = {}): PlayerSnapshot => ({
  id: "p-1", firstName: "Franta", lastName: "Novák", age: 31, position: "MID",
  morale: 60, condition: 70, coachRelationship: 55,
  discipline: 50, patriotism: 50, alcohol: 50, temper: 50,
  leadership: 50, workRate: 50, aggression: 50,
  recentMinutes: 200, recentRatingAvg: 6.5, isCelebrity: false,
  occupation: "Zedník", ...o,
});

const tym = { teamName: "TJ Dvory", managerName: "Zdeněk", villageName: "Dvory" };

/** Pražský čas, leden kvůli zimnímu času. */
const kdy = (den: number, hodina: number) =>
  new Date(Date.UTC(2027, 0, 3 + den, hodina - 1, 0, 0));

describe("hráč ví, kolik je hodin", () => {
  it("v noci ho SMS vzbudí a smí se ohnat, koho vzbudil", () => {
    const p = buildSystemPrompt(hrac(), tym, kdy(2, 2));
    expect(p).toContain("SPAL JSI");
    expect(p).toMatch(/psa|kočku/);
  });

  it("v pracovní době stojí v práci a má po ruce svou výmluvu", () => {
    const p = buildSystemPrompt(hrac(), tym, kdy(2, 9));
    expect(p).toContain("V PRÁCI");
    expect(p).toContain("zedník");
  });

  it("v sobotu odpoledne má volno", () => {
    const p = buildSystemPrompt(hrac(), tym, kdy(6, 14));
    expect(p).toContain("volno");
    expect(p).not.toContain("V PRÁCI");
  });

  it("den v týdnu je v promptu", () => {
    expect(buildSystemPrompt(hrac(), tym, kdy(1, 18))).toContain("pondělí");
  });

  it("hospodský je v deset večer za pípou, zedník doma", () => {
    expect(buildSystemPrompt(hrac({ occupation: "Hospodský" }), tym, kdy(2, 22))).toContain("V PRÁCI");
    expect(buildSystemPrompt(hrac({ occupation: "Zedník" }), tym, kdy(2, 22))).toContain("SPAL JSI");
  });
});

describe("hráč píše jako člověk", () => {
  it("mladík dostane povolení na emoji, matador ne", () => {
    expect(buildSystemPrompt(hrac({ age: 19 }), tym, kdy(6, 14))).toContain("Emoji používej běžně");
    expect(buildSystemPrompt(hrac({ age: 41 }), tym, kdy(6, 14))).toContain("Emoji skoro nepoužívej");
  });

  it("míč a branka mezi emoji nepatří, je hráč a ne fanoušek", () => {
    expect(buildSystemPrompt(hrac({ age: 19 }), tym, kdy(6, 14))).toContain("nepatří ⚽");
  });

  it("dostane rámec domácnosti podle věku", () => {
    expect(buildSystemPrompt(hrac({ age: 19 }), tym, kdy(6, 14))).toContain("u rodičů");
    expect(buildSystemPrompt(hrac({ age: 50 }), tym, kdy(6, 14))).toContain("odrostlé");
  });

  it("nemá hlásit hodinu v každé zprávě", () => {
    expect(buildSystemPrompt(hrac(), tym, kdy(2, 9))).toContain("Nezačínej každou zprávu hlášením");
  });

  it("povaha a stará pravidla zůstala", () => {
    const p = buildSystemPrompt(hrac({ temper: 80 }), tym, kdy(6, 14));
    expect(p).toContain("vysoký temperament");
    expect(p).toContain("trenére");
    expect(p).toContain("Zdeněk");
  });
});

const znalost = (o: Partial<RadekZnalosti> = {}): RadekZnalosti => ({
  incidentId: "inc-1", role: "kadr", fact: "Ze skladu zmizelo vybavení: Dresy.", vyslech: null,
  kategorie: "kradez", zavaznost: 1, den: "2027-01-02", predDny: 3, stav: "otevreny", vysledek: null,
  odhalen: false, pachatel: null, pachatelJeOn: false, ...o,
});

describe("hráč ví o dění v klubu jen to, co je v DB", () => {
  it("blok znalostí s pokynem jde do promptu", () => {
    const p = buildSystemPrompt(hrac({
      znalostiIncidentu: [znalost(), znalost({ role: "svedek", fact: "Viděl jsi hráče: Pepa Kos.", vyslech: "prozradil" })],
    }), tym, kdy(2, 18));
    expect(p).toContain(HLAVICKA_ZNALOSTI);
    expect(p).toContain("Ze skladu zmizelo vybavení: Dresy.");
    expect(p).toContain("POKYN: Trenérovi to řekni.");
  });

  it("načtené prázdné znalosti: nic neví a nikoho neobviňuje; nenačtené nepřidají nic", () => {
    expect(buildSystemPrompt(hrac({ znalostiIncidentu: [] }), tym, kdy(2, 18))).toContain(BEZ_ZNALOSTI);
    const bez = buildSystemPrompt(hrac(), tym, kdy(2, 18));
    expect(bez).not.toContain(BEZ_ZNALOSTI);
    expect(bez).not.toContain(HLAVICKA_ZNALOSTI);
  });

  it("bez aktivní životní situace si ji model nesmí vymyslet", () => {
    expect(buildSystemPrompt(hrac(), tym, kdy(2, 18))).toContain(ZAKAZ_ZIVOTNICH_SITUACI);
  });

  it("vyhodnocení rozhovoru nesmí vymyslet životní situaci ani za ni dát volno", async () => {
    await evaluateResolution({}, hrac(), [{ sender: "player", body: "Trenére, potřebuju volno." }], getScenarioById("family_problem")!);
    const prompt = String(vi.mocked(generateText).mock.calls[0][1]);
    expect(prompt).toContain("NEVYMÝŠLEJ narození dítěte");
    expect(prompt).not.toContain("narození dítěte 2-3");
  });
});

describe("scénáře a incidenty", () => {
  it("křivé obvinění se samo nevylosuje", () => {
    expect(getScenarioById("krivde_obvineny")?.weight(hrac({ morale: 10 }))).toBe(0);
  });

  it("rodinné scénáře nenabízí porod, dítě ani nemoc", () => {
    for (const id of ["family_problem", "personal_milestone"]) {
      expect(getScenarioById(id)?.description ?? "").not.toMatch(/narozen[íá]|dítě|nemoc/);
    }
  });
});
