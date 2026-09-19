import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../messaging/system-sms", () => ({
  sendSystemSMS: vi.fn(async () => undefined),
  sendPlayerSMS: vi.fn(async () => "konv-1"),
}));
vi.mock("./stav-klubu", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./stav-klubu")>()),
  nactiStavKlubu: vi.fn(async () => null),
}));

import { sendPlayerSMS, sendSystemSMS } from "../messaging/system-sms";
import type { HroziciCin } from "./hospoda";
import { nactiKontextHospody, udalostiHospody, zapisHospody, type NavstevnikHospody } from "./hospoda-db";
import { nactiStavKlubu } from "./stav-klubu";
import { FalesnaD1, jakoD1, type Pravidlo } from "./testovaci-d1";
import { hrac, hracRadek, stavKlubu } from "./testovaci-stav";

const DNES = "2026-09-16T16:00:00.000Z";
const TYM = { teamId: "tym-a", leagueId: "liga-1", gameDate: DNES };
const SMS_INCIDENTU = (incidentId: string) => ({ type: "incident", incidentId });

const RADEK_INCIDENTU = {
  id: "inc-1", kind: "vloupani_sklad", category: "kradez", status: "otevreny", severity: 1, game_date: "2026-09-14T16:00:00.000Z",
  deadline: "2026-09-21T16:00:00.000Z", culprit_type: "hrac", culprit_player_id: "p", culprit_revealed: 0,
  loss: JSON.stringify([{ typ: "vybaveni", kategorie: "jerseys", uroven: 2, stav: 70, urovniDolu: 2 }]),
  recovered: 0, resolved_on: null, accused: JSON.stringify([{ playerId: "s", jmeno: "Pepa Kos", den: "2026-09-15", vysledek: "zapira" }]),
  inzerat: 0, stopy_hospody: "nabizi,drb-s",
};

function pravidlaKontextu(): Pravidlo[] {
  return [
    { sql: /SELECT t\.name/, all: [{ name: "TJ Dvory", sezona: 4 }] },
    { sql: /status = 'hrozi' AND culprit_player_id IS NOT NULL/, all: [{ id: "h" }] },
    { sql: /EXISTS \(SELECT 1 FROM equipment_listings/, all: [RADEK_INCIDENTU] },
    { sql: /SELECT DISTINCT culprit_player_id/, all: [{ id: "p" }] },
    { sql: /FROM club_incident_knowledge/, all: [{ incident_id: "inc-1", player_id: "s", role: "svedek", interrogation: null }] },
    { sql: /FROM relationships/, all: [
      { player_a_id: "s", player_b_id: "k", type: "drinking_buddies" },
      { player_a_id: "p", player_b_id: "s", type: "rivals" },
    ] },
    { sql: /FROM players WHERE team_id = \?/, all: [hracRadek("s", "Pepa", "Kos"), hracRadek("p", "Franta", "Novák"), hracRadek("k", "Karel", "Vrba")] },
    { sql: /status = 'probiha' AND category = 'zivotni'/, all: [{ player_id: "s", incident_id: "inc-dluhy-s", kind: "dluhy", zaloha: "odmitnuto" }] },
  ];
}

const navstevnik = (id: string, jmeno: string, prijmeni: string, o: Partial<NavstevnikHospody> = {}): NavstevnikHospody => ({
  playerId: id, firstName: jmeno, lastName: prijmeni, alcohol: 80, teamId: "tym-a", isVisitor: false, ...o,
});

beforeEach(() => vi.clearAllMocks());

describe("kontext hospody z DB", () => {
  it("načte incidenty, svědky, vztahy oběma směry, recidivisty a hrozící hráče", async () => {
    const db = new FalesnaD1(pravidlaKontextu());
    const k = await nactiKontextHospody(jakoD1(db), TYM, ["s", "p"]);
    expect(k).toMatchObject({ teamId: "tym-a", leagueId: "liga-1", seasonNumber: 4, nazevKlubu: "TJ Dvory", den: "2026-09-16", gameDate: DNES });
    expect(k?.incidenty[0]).toMatchObject({
      id: "inc-1", den: "2026-09-14", odhalen: false, inzerat: false, recovered: false, uzavrenoDne: null, stopyHospody: ["nabizi", "drb-s"],
    });
    expect(k?.incidenty[0].obvineni[0].playerId).toBe("s");
    expect(k?.incidenty[0].ztraty).toHaveLength(1);
    expect(k?.svedci).toEqual([{ incidentId: "inc-1", playerId: "s", role: "svedek", vyslech: null }]);
    expect(k?.kamaradi.get("k")?.has("s")).toBe(true);
    expect(k?.rivalove.get("s")?.has("p")).toBe(true);
    expect(k?.hrozi.has("h")).toBe(true);
    expect(k?.kadr.get("p")?.recidivista).toBe(true);
    expect(k?.situace.get("s")).toBe("dluhy");
    expect(k?.idSituaci.get("s")).toBe("inc-dluhy-s");
    expect(k?.odmitnuteZalohy.has("s")).toBe(true);
    const dotaz = db.davky[0].find((d) => /EXISTS \(SELECT 1 FROM equipment_listings/.test(d.sql));
    expect(dotaz?.sql).toContain("status != 'hrozi'");
    expect(dotaz?.sql).toContain("'nestalo_se'");
  });

  it("bez hráčů klubu v hospodě nic nenačítá a nic nevrací", async () => {
    const db = new FalesnaD1(pravidlaKontextu());
    const r = await udalostiHospody(jakoD1(db), TYM, [
      navstevnik("coach-m1", "Trenér", "Novák", { isCoach: true }),
      navstevnik("fan-l1", "Vůdce", "Kotle"),
      navstevnik("v", "Vašek", "Host", { teamId: "tym-b", isVisitor: true }),
    ], { trener: false, jiste: true });
    expect(r).toEqual({ pribehy: [], zapisy: [], zlodeji: [], seasonNumber: null });
    expect(db.dotazy).toHaveLength(0);
    expect(db.davky).toHaveLength(0);
  });

  it("spadlé načtení hospodu neshodí", async () => {
    const db = new FalesnaD1();
    db.batch = async () => { throw new Error("D1 nedostupná"); };
    expect(await udalostiHospody(jakoD1(db), TYM, [navstevnik("s", "Pepa", "Kos")], { trener: false, jiste: true }))
      .toEqual({ pribehy: [], zapisy: [], zlodeji: [], seasonNumber: null });
  });

  it("vynucené ohlášení vybere čin nad stavem klubu a přidá příhodu do deníku", async () => {
    vi.mocked(nactiStavKlubu).mockResolvedValueOnce(stavKlubu({ gameDate: DNES, den: "2026-09-16", vybaveni: { trophy_case: 2 }, kadr: [hrac({ id: "k", jmeno: "Karel Vrba" })] }));
    const db = new FalesnaD1(pravidlaKontextu());
    const r = await udalostiHospody(jakoD1(db), TYM, [navstevnik("k", "Karel", "Vrba")], { trener: false, jiste: false, ohlasi: "k" });
    const hrozi = r.zapisy.find((z) => z.typ === "hrozi");
    expect(hrozi?.typ === "hrozi" && hrozi.cin.kind).toBe("vitrina");
    expect(r.pribehy.find((p) => p.type === "ohlasuje_cin")).toMatchObject({ playerIds: ["k"], incidentId: "inc-tym-a-vitrina-2026-09-16-hrozi-k" });
    expect(r.seasonNumber).toBe(4);
  });

  it("nový klub bez odehraných zápasů ohlášení nedostane (ochrana jako v losování)", async () => {
    vi.mocked(nactiStavKlubu).mockResolvedValueOnce(stavKlubu({ gameDate: DNES, den: "2026-09-16", vybaveni: { trophy_case: 2 }, kadr: [hrac({ id: "k", jmeno: "Karel Vrba" })], odehranychZapasu: 0 }));
    const db = new FalesnaD1(pravidlaKontextu());
    const r = await udalostiHospody(jakoD1(db), TYM, [navstevnik("k", "Karel", "Vrba")], { trener: false, jiste: false, ohlasi: "k" });
    expect(r.zapisy.find((z) => z.typ === "hrozi")).toBeUndefined();
    expect(r.pribehy.find((p) => p.type === "ohlasuje_cin")).toBeUndefined();
  });
});

describe("zápis následků hospody", () => {
  const PROZRADIL = {
    typ: "prozradil" as const, incidentId: "inc-1", svedekId: "s",
    stopa: { zdroj: "hospoda" as const, ukazujeNa: "p", podezreli: null, drzitel: "s", sila: 2 as const, bonusPolicie: 0.1, text: "Pepa Kos vykládal.", nalezena: true },
  };

  it("prozrazení: svědkova stopa se promění ve stopu z hospody, výslech je rozhodnutý, SMS až po zápisu", async () => {
    const db = new FalesnaD1();
    await zapisHospody(jakoD1(db), { ...TYM, seasonNumber: 4 }, [PROZRADIL, { typ: "sms", incidentId: "inc-1", text: "🍺 Pepa Kos vykládal." }]);
    const [smazani, stopa, vyslech] = db.davky[0];
    expect(smazani.sql).toMatch(/DELETE FROM club_incident_clues/);
    expect(smazani.sql).toContain("found = 0");
    expect(smazani.params).toEqual(["inc-1", "s"]);
    expect(stopa.params[0]).toBe("inc-1-hospoda-drb-s");
    expect(vyslech.sql).toContain("interrogation IS NULL");
    expect(vyslech.params).toEqual([DNES, "inc-1", "s", "tym-a"]);
    expect(sendSystemSMS).toHaveBeenCalledWith(expect.anything(), "tym-a", "Hospodský", "🍺 Pepa Kos vykládal.", SMS_INCIDENTU("inc-1"));
  });

  it("spadlá dávka: žádná SMS o něčem, co se nezapsalo", async () => {
    const db = new FalesnaD1();
    db.batch = async () => { throw new Error("D1 spadla"); };
    await zapisHospody(jakoD1(db), { ...TYM, seasonNumber: 4 }, [PROZRADIL, { typ: "sms", incidentId: "inc-1", text: "🍺 Pepa Kos vykládal." }]);
    expect(sendSystemSMS).not.toHaveBeenCalled();
  });

  it("odhalení jen neodhaleného a neuzavřeného; drb se zapíše klubu hosta", async () => {
    const db = new FalesnaD1();
    await zapisHospody(jakoD1(db), { ...TYM, seasonNumber: 4 }, [
      { typ: "odhaleni", incidentId: "inc-1", deadline: "2026-09-21T16:00:00.000Z" },
      { typ: "drb", incidentId: "inc-1", teamId: "tym-b", znalost: { playerId: "v", role: "drb", fact: "Drb.", ochota: 50, until: "2026-09-30T16:00:00.000Z" } },
    ]);
    const [odhaleni, drb] = db.davky[0];
    expect(odhaleni.sql).toContain("culprit_revealed = 0");
    expect(odhaleni.sql).toContain("status IN ('otevreny', 'policie')");
    expect(odhaleni.params).toEqual(["2026-09-21T16:00:00.000Z", "inc-1", "tym-a"]);
    expect(drb.params.slice(0, 4)).toEqual(["inc-1", "v", "tym-b", "drb"]);
  });

  it("hrozící čin: záznam ve stavu hrozi bez odhalení, znalost pro něj, SMS od kamaráda, bez kamaráda od hospodského", async () => {
    const cin: HroziciCin = {
      id: "inc-h", kind: "vitrina", playerId: "p", text: "Franta Novák tvrdil, že poháry by doma vypadaly líp.",
      deadline: "2026-09-18T16:00:00.000Z",
      znalost: { playerId: "p", role: "pachatel", fact: "V hospodě jsi opilý vykládal.", ochota: 0, until: "2026-09-18T16:00:00.000Z" },
      posel: { id: "d", firstName: "Dan", lastName: "Dobrý" },
    };
    const db = new FalesnaD1();
    await zapisHospody(jakoD1(db), { ...TYM, seasonNumber: 4 }, [{ typ: "hrozi", cin }]);
    const vlozeni = db.davky[0].find((d) => /INSERT OR IGNORE INTO club_incidents/.test(d.sql));
    expect(vlozeni?.sql).toContain("'hrozi'");
    // Předposlední parametr je posel: kdo čin donesl trenérovi, ne kdo se jím chlubil v hospodě.
    expect(vlozeni?.params).toEqual(["inc-h", "tym-a", "liga-1", 4, "vitrina", "kradez", DNES, "2026-09-18T16:00:00.000Z", "p", "d", cin.text]);
    expect(db.davky[0].some((d) => /club_incident_knowledge/.test(d.sql) && d.params.includes("pachatel"))).toBe(true);
    expect(sendPlayerSMS).toHaveBeenCalledWith(expect.anything(), "tym-a", cin.posel, expect.stringContaining(cin.text), SMS_INCIDENTU("inc-h"));

    const bezPosla = new FalesnaD1();
    await zapisHospody(jakoD1(bezPosla), { ...TYM, seasonNumber: 4 }, [{ typ: "hrozi", cin: { ...cin, posel: null } }]);
    expect(sendSystemSMS).toHaveBeenCalledWith(expect.anything(), "tym-a", "Hospodský", expect.stringContaining(cin.text), SMS_INCIDENTU("inc-h"));
    // Bez posla zůstane sloupec prázdný, ať UI neukáže jako ohlašovatele pachatele.
    const bezPoslaVlozeni = bezPosla.davky[0].find((d) => /INSERT OR IGNORE INTO club_incidents/.test(d.sql));
    expect(bezPoslaVlozeni?.params).toEqual(["inc-h", "tym-a", "liga-1", 4, "vitrina", "kradez", DNES, "2026-09-18T16:00:00.000Z", "p", null, cin.text]);
  });

  it("hlídaný zápis, který nic nezměnil (souběh), SMS nepošle", async () => {
    const db = new FalesnaD1([
      { sql: /INSERT OR IGNORE INTO club_incident_clues/, changes: 0 },
      { sql: /UPDATE club_incident_knowledge/, changes: 0 },
    ]);
    await zapisHospody(jakoD1(db), { ...TYM, seasonNumber: 4 }, [PROZRADIL, { typ: "sms", incidentId: "inc-1", text: "🍺 Pepa Kos vykládal." }]);
    expect(sendSystemSMS).not.toHaveBeenCalled();

    const cin: HroziciCin = {
      id: "inc-h", kind: "vitrina", playerId: "p", text: "Franta Novák tvrdil, že poháry by doma vypadaly líp.",
      deadline: "2026-09-18T16:00:00.000Z",
      znalost: { playerId: "p", role: "pachatel", fact: "V hospodě jsi opilý vykládal.", ochota: 0, until: "2026-09-18T16:00:00.000Z" },
      posel: { id: "d", firstName: "Dan", lastName: "Dobrý" },
    };
    const db2 = new FalesnaD1([
      { sql: /INSERT OR IGNORE INTO club_incidents/, changes: 0 },
    ]);
    await zapisHospody(jakoD1(db2), { ...TYM, seasonNumber: 4 }, [{ typ: "hrozi", cin }]);
    expect(sendPlayerSMS).not.toHaveBeenCalled();
    expect(sendSystemSMS).not.toHaveBeenCalled();
  });
});
