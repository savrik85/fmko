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
import {
  GeminiUnavailableError, OTHER_LIFE_EVENTS_BAN, ZAKAZ_ZIVOTNICH_SITUACI, buildSystemPrompt, evaluateResolution, generateCoachInitiatedReply, finalTurnHint, generateFollowUpMessage, generateInitialMessage, generateReply,
  coachAddressForm, generateSquadGroupReaction, generateUnrestReply, popisZdravi,
} from "./ai-player-chat";
import { getScenarioById } from "./ai-player-scenarios";
import { complainsAboutWaking } from "./chat-kontext";
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
  it("v noci ho SMS vzbudí; na buzení rodiny si stěžuje jen podle losu noci a bez zvířat", () => {
    const p = buildSystemPrompt(hrac(), tym, kdy(2, 2));
    expect(p).toContain("SPAL JSI");
    expect(p).not.toMatch(/kočku|psa nebo|vzbudil i malého/);
    // Třicátník: když si stěžuje, tak na ženu (`wokenAtHome`), jinak nikoho nejmenuje.
    expect(p).toContain(complainsAboutWaking("p-1", kdy(2, 2)) ? "vzbudil i ženu" : "Nikoho dalšího doma nezmiňuj");
  });

  it("v noci u vážné věci (nabídka) nejdřív věcně odpoví a na buzení si nestěžuje", () => {
    const p = buildSystemPrompt(hrac({ pendingOffers: [{ club: "FK FORPSI Čkyně", interest: 2 }] }), tym, kdy(2, 2));
    expect(p).toContain("věcně odpověz");
    expect(p).toContain("Na buzení si nestěžuj");
    expect(p).not.toContain("vzbudil i");
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

  it("kdo před chvílí sám psal, toho SMS nevzbudila", () => {
    const now = kdy(2, 2);
    const fewMinutesAgo = new Date(now.getTime() - 5 * 60_000).toISOString();
    const p = buildSystemPrompt(hrac({ lastOwnMessageAt: fewMinutesAgo }), tym, now);
    expect(p).not.toContain("SPAL JSI");
    expect(p).toContain("napsat můžeš");
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

// Lokální E2E 22. 11.: tentýž hráč trenérovi jednou tykal a jednou vykal („Jo, trenére, to byla
// moje práce. Promiňte to.“, „Trenére… Promiň, byl jsem fakt unavenej.“). Prompt oslovení neurčoval.
describe("tykání a vykání trenérovi", () => {
  it("každý hráč jednotně: mladý vyká, dospělý většinou tyká, stejně pokaždé", () => {
    expect(coachAddressForm({ id: "p-1", age: 18 })).toBe("vy");
    expect(coachAddressForm({ id: "p-1", age: 31 })).toBe(coachAddressForm({ id: "p-1", age: 31 }));
    const adults = Array.from({ length: 200 }, (_, i) => coachAddressForm({ id: `p-${i}`, age: 30 }));
    const formal = adults.filter((f) => f === "vy").length;
    expect(formal).toBeGreaterThan(20);
    expect(formal).toBeLessThan(100);
  });

  it("prompt to řekne a zakáže střídání", () => {
    const young = buildSystemPrompt(hrac({ age: 18 }), tym, kdy(2, 18));
    expect(young).toContain("Trenérovi VYKÁŠ");
    expect(young).toContain("Nestřídej");
    const id = Array.from({ length: 50 }, (_, i) => `p-${i}`).find((x) => coachAddressForm({ id: x, age: 30 }) === "ty")!;
    expect(buildSystemPrompt(hrac({ id, age: 30 }), tym, kdy(2, 18))).toContain("Trenérovi TYKÁŠ");
  });

  // E2E 22. 11.: Král (pokyn TY, v historii vykal) napsal „A vy, trenére?“. Historie má přednost.
  it("tvar z hráčovy historie má přednost před věkem a id", () => {
    const id = Array.from({ length: 50 }, (_, i) => `p-${i}`).find((x) => coachAddressForm({ id: x, age: 27 }) === "ty")!;
    expect(coachAddressForm({ id, age: 27, coachAddress: "vy" })).toBe("vy");
    expect(coachAddressForm({ id: "p-1", age: 18, coachAddress: "ty" })).toBe("ty");
    expect(coachAddressForm({ id, age: 27, coachAddress: null })).toBe("ty");
    expect(buildSystemPrompt(hrac({ id, age: 27, coachAddress: "vy" }), tym, kdy(2, 18))).toContain("Trenérovi VYKÁŠ");
  });
});

describe("cizinec píše lámaně, Slovák slovensky", () => {
  it("Čech má českou hovorovou mluvu a oslovení „trenére“", () => {
    const p = buildSystemPrompt(hrac({ nationality: "CZ" }), tym, kdy(6, 14));
    expect(p).toContain("Mluv neformálně česky");
    expect(p).toContain("slovem 'trenére'");
    expect(p).not.toContain("JAZYK:");
  });

  it("Ukrajinec dostane pokyn k lámané češtině místo české mluvy", () => {
    const p = buildSystemPrompt(hrac({ nationality: "UA" }), tym, kdy(6, 14));
    expect(p).toContain("JAZYK: Jsi cizinec (Ukrajina)");
    expect(p).not.toContain("Mluv neformálně česky");
    expect(p).not.toContain("slovem 'trenére'");
  });

  it("Rom, který mluví i romsky, píše česky a občas romské slovo", () => {
    const p = buildSystemPrompt(hrac({ nationality: "CZ", romani: true }), tym, kdy(6, 14));
    expect(p).toContain("Mluv neformálně česky");
    expect(p).toContain("Jsi Rom z Česka");
    expect(p).toContain("slovem 'trenére'");
    expect(buildSystemPrompt(hrac({ nationality: "CZ" }), tym, kdy(6, 14))).not.toContain("Jsi Rom");
  });

  it("Slovák píše slovensky", () => {
    expect(buildSystemPrompt(hrac({ nationality: "SK" }), tym, kdy(6, 14))).toContain("SLOVENSKY");
  });
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

describe("konverzace začatá trenérem", () => {
  // Bez scénáře zavřel handleAiPlayerReply vlákno na druhou zprávu trenéra bez odpovědi
  // a kredit se strhl. Navazující otázka po „Zeptat se" tak zůstala bez odpovědi.
  it("scénář existuje, aby další výměnu obsloužil handleAiPlayerReply", () => {
    const s = getScenarioById("coach_initiated");
    expect(s).not.toBeNull();
    expect(s?.expectedTurns).toBe(2);
    expect(s?.description).toContain("NEVYMÝŠLEJ");
  });

  it("sám se nevylosuje", () => {
    expect(getScenarioById("coach_initiated")?.weight(hrac({ morale: 10, recentMinutes: 0 }))).toBe(0);
  });
});

describe("životní situace v chatu (spec 17d)", () => {
  it("scénář žádosti o zálohu existuje, sám se nevylosuje a nesmí si vymýšlet částku", () => {
    const s = getScenarioById("zadost_o_zalohu");
    expect(s).not.toBeNull();
    expect(s?.expectedTurns).toBe(2);
    expect(s?.weight(hrac({ morale: 10 }))).toBe(0);
    expect(s?.description).toContain("NEVYMÝŠLEJ");
  });

  it("hráč se situací ji má v promptu a smí o ní mluvit", () => {
    const p = buildSystemPrompt(hrac({ zivotniSituace: { kind: "rozvod", label: "Rozvod" } }), tym, kdy(2, 18));
    expect(p).toContain("Rozvod");
    expect(p).not.toContain(ZAKAZ_ZIVOTNICH_SITUACI);
  });

  it("bez situace zákaz vymýšlet dál platí", () => {
    expect(buildSystemPrompt(hrac(), tym, kdy(2, 18))).toContain(ZAKAZ_ZIVOTNICH_SITUACI);
  });

  it("při rozvodu bydlí jinde", () => {
    const p = buildSystemPrompt(hrac({ age: 32, zivotniSituace: { kind: "rozvod", label: "Rozvod" } }), tym, kdy(2, 18));
    expect(p).toContain("kabin");
    expect(p).not.toContain("Doma máš ženu");
  });
});

describe("popisZdravi", () => {
  it("nenačtené zdraví prompt nezmiňuje", () => {
    expect(popisZdravi(hrac())).toBe("");
  });

  it("fit hráč nepřikyvuje, že byl zraněný", () => {
    expect(popisZdravi(hrac({ injury: null }))).toContain("nepřikyvuj");
  });

  it("zraněný hráč ví, co mu je a jak dlouho", () => {
    const text = popisZdravi(hrac({ injury: { description: "křeče", daysLeft: 3, volno: false, fake: false } }));
    expect(text).toContain("jsi zraněný (křeče), ještě 3 dny");
  });

  it("volno a simulant se od zranění liší", () => {
    expect(popisZdravi(hrac({ injury: { description: "", daysLeft: 1, volno: true, fake: false } }))).toContain("osobní volno, ještě 1 den");
    expect(popisZdravi(hrac({ injury: { description: "záda", daysLeft: 7, volno: false, fake: true } }))).toContain("nepřiznáš");
  });

  it("věta o zdraví je v promptu", () => {
    const prompt = buildSystemPrompt(hrac({ injury: null }), { teamName: "Spůle" } as Parameters<typeof buildSystemPrompt>[1]);
    expect(prompt).toContain("Zdraví: jsi fit");
  });
});

describe("starší rozhovory jsou jen kontext", () => {
  // Skutečný případ z 24. 10.: příslib místa v základu z 13. 10. se propsal do vyhodnocení hospody.
  const historie = [
    { sender: "coach" as const, body: "V příštích zápasech s tebou počítám v základu.", earlier: true },
    { sender: "player" as const, body: "No, tak to je fajn, trenére.", earlier: true },
    { sender: "player" as const, body: "[Fotka: stůl v hospodě plný piv a panáků] trenere pod na jedno" },
    { sender: "coach" as const, body: "Zdar hovada, já chlastám doma." },
  ];

  it("vyhodnocení rozhovoru počítá jen aktuální rozhovor", async () => {
    vi.mocked(generateText).mockClear();
    await evaluateResolution({}, hrac(), historie, getScenarioById("pub_invite")!);
    const prompt = String(vi.mocked(generateText).mock.calls[0][1]);
    expect(prompt).not.toContain("počítám v základu");
    expect(prompt).toContain("já chlastám doma");
    expect(prompt).toContain("[Fotka: stůl v hospodě plný piv a panáků]");
  });

  it("odpověď vidí starší zprávy odděleně, jen jako kontext", async () => {
    vi.mocked(generateText).mockClear();
    vi.mocked(generateText).mockResolvedValueOnce(JSON.stringify({ body: "doma je to nuda", conversation_complete: false }));
    await generateReply({}, hrac(), historie, getScenarioById("pub_invite")!, tym, false);
    const prompt = String(vi.mocked(generateText).mock.calls[0][1]);
    const kontext = prompt.indexOf("DŘÍVĚJŠÍ HOVOR");
    const ted = prompt.indexOf("TEĎ:");
    expect(kontext).toBeGreaterThan(-1);
    expect(prompt.indexOf("počítám v základu")).toBeGreaterThan(kontext);
    expect(prompt.indexOf("počítám v základu")).toBeLessThan(ted);
    expect(prompt.indexOf("já chlastám doma")).toBeGreaterThan(ted);
  });
});


describe("hráč ví, co sám udělal", () => {
  it("po opilé hlasovce nezapírá, o zmeškaném hovoru ví, doléčené zranění zná", () => {
    const p = buildSystemPrompt(hrac({
      drunkVoiceRecently: true,
      missedCall: { count: 2 },
      injury: null,
      recentInjury: { description: "Natažený sval", volno: false, fake: false },
    }), tym, kdy(2, 18));
    expect(p).toContain("OPILOU hlasovku");
    expect(p).toContain("nezapírej");
    expect(p).toContain("2× volal");
    expect(p).toContain("Nedávno jsi byl zraněný (Natažený sval)");
    expect(p).not.toContain("Když trenér tvrdí, že jsi byl zraněný, nepřikyvuj");
  });

  it("čekající nabídku zná i s tím, jak moc ho láká", () => {
    const p = buildSystemPrompt(hrac({ pendingOffers: [{ club: "FK FORPSI Čkyně", interest: 2 }] }), tym, kdy(2, 18));
    expect(p).toContain("NABÍDKA: FK FORPSI Čkyně o tebe stojí");
    expect(p).toContain("dost tě to láká");
  });
});

describe("co hra z odpovědi pozná navíc", () => {
  it("slib „ozvu se pak“ pozná i bez pole v JSON", async () => {
    vi.mocked(generateText).mockResolvedValueOnce(JSON.stringify({ body: "Jsem v práci, ozvu se potom.", conversation_complete: true }));
    const r = await generateReply({}, hrac(), [{ sender: "coach", body: "Zvednu ti plat." }], getScenarioById("coach_initiated")!, tym, false);
    expect(r.writeLater).toBe(true);
  });

  // Lokální E2E 22. 11.: Lysenko („Změnil bych něco na tréninku, ale nevím co.“) a Říha
  // („v pohodě, nějaký změny bych nedělal“) nic neslíbili, model vrátil write_later: true a hra
  // naplánovala odloženou zprávu s pokynem „napsal jsi trenérovi, že se ozveš“, což nebyla pravda.
  it("odložená zpráva jen když hráč v textu opravdu slíbil, že se ozve", async () => {
    for (const body of [
      "Trenér, já myslím, tým jde dobře. Změnil bych něco na tréninku, ale nevím co.",
      "Trenére, v pohodě, nějaký změny bych nedělal, makáme dobře.",
    ]) {
      vi.mocked(generateText).mockResolvedValueOnce(JSON.stringify({ body, conversation_complete: false, write_later: true }));
      const r = await generateReply({}, hrac(), [{ sender: "coach", body: "Co bys na tréninku změnil?" }], getScenarioById("coach_initiated")!, tym, false);
      expect(r.writeLater, body).toBe(false);
    }
    vi.mocked(generateText).mockResolvedValueOnce(JSON.stringify({
      body: "Trenére, mám toho teď moc, řeším tady jízdy. Řeknu ti to večer, jo?", conversation_complete: false, write_later: true,
    }));
    const promised = await generateReply({}, hrac(), [{ sender: "coach", body: "Co bys dělal jinak?" }], getScenarioById("coach_initiated")!, tym, false);
    expect(promised.writeLater).toBe(true);
  });

  it("postoj k nabídce se ptá jen u hráče, na kterého nějaká čeká", async () => {
    vi.mocked(generateText).mockClear();
    vi.mocked(generateText).mockResolvedValueOnce(JSON.stringify({ body: "Zůstávám, odmítněte to.", conversation_complete: true, write_later: false, transfer_stance: "stay" }));
    const s = await generateReply({}, hrac({ pendingOffers: [{ club: "FK FORPSI Čkyně", interest: 2 }] }), [{ sender: "coach", body: "Zůstaň u nás." }], getScenarioById("coach_initiated")!, tym, false);
    expect(s.transferStance).toBe("stay");
    expect(String(vi.mocked(generateText).mock.calls[0][1])).toContain("transfer_stance");

    vi.mocked(generateText).mockClear();
    vi.mocked(generateText).mockResolvedValueOnce(JSON.stringify({ body: "Jasně.", conversation_complete: true, transfer_stance: "stay" }));
    const noOffer = await generateReply({}, hrac(), [{ sender: "coach", body: "Zdar." }], getScenarioById("coach_initiated")!, tym, false);
    expect(String(vi.mocked(generateText).mock.calls[0][1])).not.toContain("transfer_stance");
    expect(noOffer.transferStance).toBeUndefined();
    expect(noOffer.writeLater).toBe(false);
  });
});

describe("hráč neopakuje sám sebe", () => {
  // Prod 25. a 26. 9.: „No potěš koště… Teď si mě vychutná žena.“ hráč opsal ze své zprávy den předtím.
  const own = ["Trenére, to jste mi to teda řekl. No potěš koště. Teď si mě vychutná žena."];

  it("v promptu jsou věty, které trenérovi už napsal, a pravidlo proti ohraným větám", () => {
    const p = buildSystemPrompt(hrac({ ownRecentLines: own }), tym, kdy(2, 18));
    expect(p).toContain("CO UŽ JSI TRENÉROVI NAPSAL");
    expect(p).toContain("„Trenére, to jste mi to teda řekl. No potěš koště. Teď si mě vychutná žena.“");
    expect(p).toContain("„Už mám po šichtě“");
    expect(buildSystemPrompt(hrac(), tym, kdy(2, 18))).not.toContain("CO UŽ JSI TRENÉROVI NAPSAL");
  });

  it("odpověď, která opakuje dřívější větu, se jednou přegeneruje s tou větou zakázanou", async () => {
    vi.mocked(generateText).mockClear();
    vi.mocked(generateText)
      .mockResolvedValueOnce(JSON.stringify({ body: "No potěš koště. Teď si mě vychutná žena.", conversation_complete: false }))
      .mockResolvedValueOnce(JSON.stringify({ body: "Tak to mě teda zabil, ale beru to.", conversation_complete: false }));
    const r = await generateReply({}, hrac({ ownRecentLines: own }), [{ sender: "coach", body: "Můžeš si za to sám." }], getScenarioById("coach_initiated")!, tym, false);
    expect(r.body).toBe("Tak to mě teda zabil, ale beru to.");
    expect(vi.mocked(generateText)).toHaveBeenCalledTimes(2);
    const retryPrompt = String(vi.mocked(generateText).mock.calls[1][1]);
    expect(retryPrompt).toContain("POZOR: tohle jsi trenérovi už napsal");
    expect(retryPrompt).toContain("„No potěš koště.“");
    // Pokyn je před formátem odpovědi, ne za ním.
    expect(retryPrompt.indexOf("POZOR:")).toBeLessThan(retryPrompt.indexOf("Vrať POUZE JSON"));
  });

  it("odložená odpověď bez ohraného „Už mám po šichtě“: když ho model napíše i podruhé, věta se vyškrtne", async () => {
    vi.mocked(generateText).mockClear();
    vi.mocked(generateText)
      .mockResolvedValueOnce(JSON.stringify({ body: "Už mám po šichtě, trenére. Ta noha je v cajku, v sobotu můžu." }))
      .mockResolvedValueOnce(JSON.stringify({ body: "Tak už mám padla, trenére. Ta noha je v cajku, v sobotu můžu." }));
    const r = await generateFollowUpMessage({}, hrac(), tym, [{ sender: "coach", body: "Jak noha?" }], "Odpověz trenérovi.");
    expect(vi.mocked(generateText)).toHaveBeenCalledTimes(2);
    expect(r.body).toBe("Ta noha je v cajku, v sobotu můžu.");
  });

  it("úvodní zpráva i truc hlídají opakování stejně", async () => {
    vi.mocked(generateText).mockClear();
    vi.mocked(generateText)
      .mockResolvedValueOnce("No potěš koště. Zase lavička.")
      .mockResolvedValueOnce("Zase lavička, trenére? Fakt nechápu proč.");
    expect(await generateInitialMessage({}, hrac({ ownRecentLines: own }), getScenarioById("coach_initiated")!, tym, kdy(2, 18)))
      .toBe("Zase lavička, trenére? Fakt nechápu proč.");
    vi.mocked(generateText).mockClear();
    vi.mocked(generateText).mockResolvedValueOnce("Teď si mě vychutná žena. Ale beru to.").mockResolvedValueOnce("Dobře, beru to, uvidíme.");
    expect(await generateUnrestReply({}, hrac({ ownRecentLines: own }), tym, { coachMessage: "Promiň.", unrestReason: "trenér odmítl nabídku", outcome: "partial" }))
      .toBe("Dobře, beru to, uvidíme.");
  });
});

describe("kabina bez opakování (dodělek balíku 1)", () => {
  it("hráč v kabině ví, co už napsal, a opakovanou hlášku přegeneruje", async () => {
    vi.mocked(generateText).mockClear();
    vi.mocked(generateText)
      .mockResolvedValueOnce("Jdeme do toho, trenére, rozsekáme je!")
      .mockResolvedValueOnce("V sobotu jim to nandáme, kluci.");
    const own = ["Jdeme do toho, trenére, rozsekáme je! 💪", "Ty prachy si nech, trenére."];
    const body = await generateSquadGroupReaction({}, hrac({ ownRecentLines: own }), tym, "V sobotu hrajeme doma, chci vidět bojovnost.", []);
    expect(body).toBe("V sobotu jim to nandáme, kluci.");
    expect(vi.mocked(generateText)).toHaveBeenCalledTimes(2);
    const first = String(vi.mocked(generateText).mock.calls[0][1]);
    expect(first).toContain("CO UŽ JSI TRENÉROVI NAPSAL");
    expect(first).toContain("„Ty prachy si nech, trenére.“");
    const retry = String(vi.mocked(generateText).mock.calls[1][1]);
    expect(retry).toContain("POZOR: tohle jsi trenérovi už napsal");
    expect(retry.indexOf("POZOR:")).toBeLessThan(retry.indexOf("Maximálně 120 znaků"));
  });
});

describe("odpověď na dohodu po hádce", () => {
  it("zná historii, ví o hádce a „No tak to je jiná“ přegeneruje", async () => {
    vi.mocked(generateText).mockClear();
    vi.mocked(generateText)
      .mockResolvedValueOnce("No tak to je jiná, trenére! Díky moc.")
      .mockResolvedValueOnce("Beru to, trenére. Ale to předtím mě pořád štve.");
    const body = await generateUnrestReply({}, hrac(), tym, {
      coachMessage: "Dostaneš prémii 2 000 Kč.", unrestReason: "trenér odmítl nabídku od FK Dobrš, o kterou jsi stál", outcome: "calmed",
      history: [{ sender: "coach", body: "Nabídka nebyla dobrá." }, { sender: "player", body: "Takže mi lžeš do očí. Super." }],
      threadEnd: { tone: "negative", summary: "Odchází naštvaný a zklamaný.", minutesAgo: 2 },
    });
    expect(body).toBe("Beru to, trenére. Ale to předtím mě pořád štve.");
    const prompt = String(vi.mocked(generateText).mock.calls[0][1]);
    expect(prompt).toContain("HISTORIE KONVERZACE");
    expect(prompt).toContain("Takže mi lžeš do očí. Super.");
    expect(prompt).toContain("neochotně a skřípavě");
    expect(prompt).toContain("nezačínej „No tak to je jiná“");
    expect(prompt).toContain("<<<Dostaneš prémii 2 000 Kč.>>>");
  });
});

describe("po skončené životní situaci", () => {
  // Po „máme kluka Matyáše“ dřív prompt dál říkal „nevymýšlej si narození dítěte“ a hráč to mohl zapřít.
  const fresh = { kind: "narozeni_ditete", fact: "Před 2 dny jste se vrátili z porodnice, narodil se ti syn Matyáš (3,45 kila). Jsi čerstvý táta, doma máte miminko." };

  it("hráč ví, že je čerstvý táta, a zákaz se týká jen jiných událostí", () => {
    const p = buildSystemPrompt(hrac({ age: 24, recentLifeEvent: fresh }), tym, kdy(2, 18));
    expect(p).toContain(`NEDÁVNO SE TI STALO (víš o tom a mluv o tom normálně, nic dalšího si nevymýšlej): ${fresh.fact}`);
    expect(p).not.toContain(ZAKAZ_ZIVOTNICH_SITUACI);
    expect(p).toContain(OTHER_LIFE_EVENTS_BAN);
    expect(p).toContain("Bydlíš s přítelkyní a teď i s miminkem");
  });

  it("bez události zůstává původní zákaz", () => {
    expect(buildSystemPrompt(hrac(), tym, kdy(2, 18))).toContain(ZAKAZ_ZIVOTNICH_SITUACI);
  });
});

describe("časový rozpočet práce na pozadí", () => {
  it("volání modelu dostane nejvýš zbývající čas, po rozpočtu se model nevolá vůbec", async () => {
    vi.mocked(generateText).mockClear();
    vi.mocked(generateText).mockResolvedValueOnce(JSON.stringify({ body: "Beru to, trenére." }));
    await generateFollowUpMessage({}, hrac(), tym, [], "Trenér ti dal pokutu.", { deadline: Date.now() + 8_000 });
    const timeoutMs = (vi.mocked(generateText).mock.calls[0][2] as { timeoutMs: number }).timeoutMs;
    expect(timeoutMs).toBeLessThanOrEqual(8_000);
    expect(timeoutMs).toBeGreaterThan(7_000);

    vi.mocked(generateText).mockClear();
    await expect(generateFollowUpMessage({}, hrac(), tym, [], "Trenér ti dal pokutu.", { deadline: Date.now() + 500 }))
      .rejects.toBeInstanceOf(GeminiUnavailableError);
    expect(generateText).not.toHaveBeenCalled();
  });

  it("bez rozpočtu platí běžný strop 25 s", async () => {
    vi.mocked(generateText).mockClear();
    vi.mocked(generateText).mockResolvedValueOnce(JSON.stringify({ body: "Beru to, trenére." }));
    await generateFollowUpMessage({}, hrac(), tym, [], "Trenér ti dal pokutu.");
    expect((vi.mocked(generateText).mock.calls[0][2] as { timeoutMs: number }).timeoutMs).toBe(25_000);
  });
});

describe("poslední zpráva vlákna nepřebije odpověď na otázku (E2E 22. 11.: pub_voice 4/4 jen omluvy)", () => {
  it("trenér se ptá: hráč mu nejdřív odpoví, teprve pak se rozloučí", async () => {
    vi.mocked(generateText).mockClear();
    vi.mocked(generateText).mockResolvedValueOnce(JSON.stringify({ body: "Kluci drží spolu, trenére.", conversation_complete: true }));
    await generateReply({}, hrac(), [
      { sender: "player", body: "Promiň, trenére, včera jsem trochu ztratil měřítko." },
      { sender: "coach", body: "To rád slyším. Jak to vidíš s klukama v kabině?" },
    ], getScenarioById("pub_voice")!, tym, true);
    const prompt = String(vi.mocked(generateText).mock.calls[0][1]);
    expect(prompt).toContain("TOTO JE TVOJE POSLEDNÍ ZPRÁVA");
    expect(prompt).toContain("NEJDŘÍV mu na to odpověz");
    expect(prompt).toContain("„To rád slyším. Jak to vidíš s klukama v kabině?“");
    expect(finalTurnHint("Jak to vidíš?")).not.toContain("—");
    expect(finalTurnHint(undefined)).not.toContain("—");
  });

  // E2E 22. 11. (ráno po hlasovce, 3 výměny): prostřední tah 0/4 na otázku neodpověděl,
  // Doležal na „Jak to vidíš s klukama v kabině?“ psal „dneska jsem se vyspal, hlava mě trochu
  // bolí“. Pokyn s otázkou dostával jen poslední tah.
  it("prostřední tah: když se trenér ptá, dostane taky „NEJDŘÍV mu na to odpověz“ s jeho otázkou", async () => {
    const { pubThreadScenario } = await import("./pub-night");
    const morning = pubThreadScenario(getScenarioById("pub_voice")!, "2026-11-21T23:40:00.000Z", new Date("2026-11-22T18:53:00.000Z")).scenario;
    vi.mocked(generateText).mockClear();
    vi.mocked(generateText).mockResolvedValueOnce(JSON.stringify({ body: "Kluci drží spolu, trenére.", conversation_complete: false }));
    await generateReply({}, hrac(), [
      { sender: "coach", body: "Ahoj, jak se máš?" },
      { sender: "player", body: "trochu mě bolí hlava 🍺😁" },
      { sender: "coach", body: "Jak to vidíš s klukama v kabině?" },
    ], morning, tym, false);
    const prompt = String(vi.mocked(generateText).mock.calls[0][1]);
    expect(prompt).toContain("NEJDŘÍV mu na to odpověz");
    expect(prompt).toContain("„Jak to vidíš s klukama v kabině?“");
    expect(prompt).not.toContain("TOTO JE TVOJE POSLEDNÍ ZPRÁVA");

    // Rozhovor od trenéra (Šimánek: „Co říkáš na naši formu?“) stejně, bez otázky nic.
    vi.mocked(generateText).mockClear();
    vi.mocked(generateText).mockResolvedValueOnce(JSON.stringify({ body: "Forma je dobrá.", conversation_complete: false, relationship_delta: 0, morale_delta: 0, summary: "Trenér se ptal." }));
    await generateCoachInitiatedReply({}, hrac(), tym, [{ sender: "coach", body: "Co říkáš na naši formu?" }], false);
    expect(String(vi.mocked(generateText).mock.calls[0][1])).toContain("NEJDŘÍV mu na to odpověz");
    expect(String(vi.mocked(generateText).mock.calls[0][1])).toContain("„Co říkáš na naši formu?“");
    vi.mocked(generateText).mockClear();
    vi.mocked(generateText).mockResolvedValueOnce(JSON.stringify({ body: "Díky.", conversation_complete: false }));
    await generateReply({}, hrac(), [{ sender: "coach", body: "Tak se měj." }], morning, tym, false);
    expect(String(vi.mocked(generateText).mock.calls[0][1])).not.toContain("NEJDŘÍV mu na to odpověz");
  });

  it("bez otázky jen uzavře; rozhovor od trenéra se při poslední zprávě taky nejdřív odpoví", async () => {
    vi.mocked(generateText).mockClear();
    vi.mocked(generateText).mockResolvedValueOnce(JSON.stringify({ body: "Díky, trenére, mějte se.", conversation_complete: true }));
    await generateReply({}, hrac(), [{ sender: "coach", body: "Tak se měj." }], getScenarioById("pub_voice")!, tym, true);
    const closing = String(vi.mocked(generateText).mock.calls[0][1]);
    expect(closing).toContain("TOTO JE TVOJE POSLEDNÍ ZPRÁVA");
    expect(closing).not.toContain("NEJDŘÍV mu na to odpověz");

    vi.mocked(generateText).mockClear();
    vi.mocked(generateText).mockResolvedValueOnce(JSON.stringify({ body: "V úterý dorazím.", conversation_complete: true, relationship_delta: 0, morale_delta: 0, summary: "Trenér se ptal." }));
    await generateCoachInitiatedReply({}, hrac(), tym, [{ sender: "coach", body: "Dorazíš v úterý?" }], true);
    expect(String(vi.mocked(generateText).mock.calls[0][1])).toContain("NEJDŘÍV mu na to odpověz");
  });
});

