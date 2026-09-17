import { describe, expect, it } from "vitest";
import type { AbsenceResult } from "../events/absence";
import {
  absencePlatnaKZapisu, denPlus, druhyHracu, duvodyNaTrenink, nactiIncidentniKontext, platneAbsence,
  pridejIncidentniAbsence, prikazAbsence, type IncidentniAbsence, type IncidentProVliv, type NovaAbsence,
} from "./absence-hracu";
import { FalesnaD1, jakoD1 } from "./testovaci-d1";

const radek = (over: Record<string, unknown> = {}) => ({
  player_id: "p", kind: "soud", od_dne: "2026-09-20", do_dne: "2026-09-20", zapasu_zbyva: null,
  duvod: "Soudní jednání", sms: "Mám soud, nemůžu hrát.", ...over,
});

describe("datum", () => {
  it("denPlus posouvá herní den", () => {
    expect(denPlus("2026-09-30", 2)).toBe("2026-10-02");
    expect(denPlus("2026-09-16T16:00:00.000Z", -1)).toBe("2026-09-15");
  });
});

describe("platné absence", () => {
  it("datumová platí jen ve svém okně, vyřazení jen se zbývajícími zápasy", () => {
    const radky = [
      radek(),
      radek({ player_id: "a", kind: "vyrazen", od_dne: null, do_dne: null, zapasu_zbyva: 2, duvod: "Vyřazen trenérem" }),
      radek({ player_id: "b", kind: "vyrazen", od_dne: null, do_dne: null, zapasu_zbyva: 0 }),
    ];
    expect([...platneAbsence(radky, "2026-09-20").keys()].sort()).toEqual(["a", "p"]);
    expect([...platneAbsence(radky, "2026-09-21").keys()]).toEqual(["a"]);
  });

  it("u hráče vyhrává první záznam", () => {
    const mapa = platneAbsence([radek({ kind: "vyslech", duvod: "Výslech na policii" }), radek()], "2026-09-20");
    expect(mapa.get("p")?.druh).toBe("vyslech");
  });

  it("datumová absence vyhrává nad vyřazením i když je řádek s vyřazením v poli první", () => {
    const radky = [
      radek({ player_id: "x", kind: "vyrazen", od_dne: null, do_dne: null, zapasu_zbyva: 2, duvod: "Vyřazen trenérem", sms: "x." }),
      radek({ player_id: "x", kind: "soud" }),
    ];
    expect(platneAbsence(radky, "2026-09-20").get("x")?.druh).toBe("soud");
  });
});

describe("vlivy hráčů", () => {
  const obvineni = (hraci: Array<[string, string, string?]>) =>
    JSON.stringify(hraci.map(([playerId, den, vysledek = "zapira"]) => ({ playerId, jmeno: "X", den, vysledek })));

  it("obvinění, které skončilo zapíráním, počítá i u pachatele — ne jen u nevinného", () => {
    const mapa = druhyHracu([{ culprit_player_id: "p", culprit_revealed: 0, accused: obvineni([["a", "2026-09-10"], ["p", "2026-09-10"]]), game_date: "2026-09-08T16:00:00.000Z" }], "2026-09-20T16:00:00.000Z");
    expect(mapa.get("a")).toEqual(["obvineny"]);
    expect(mapa.get("p")).toEqual(["obvineny"]);
  });

  it("přiznání nebo usvědčení vliv obvineny nezakládá", () => {
    const mapa = druhyHracu([{
      culprit_player_id: "p", culprit_revealed: 0,
      accused: obvineni([["p", "2026-09-10", "priznal"], ["q", "2026-09-10", "usvedcen"]]),
      game_date: "2026-09-08T16:00:00.000Z",
    }], "2026-09-20T16:00:00.000Z");
    expect(mapa.size).toBe(0);
  });

  it("po 14 dnech a před obviněním žádný vliv", () => {
    const inc = { culprit_player_id: null, culprit_revealed: 0, accused: obvineni([["a", "2026-09-01"], ["b", "2026-09-25"]]), game_date: "2026-08-30T16:00:00.000Z" };
    expect(druhyHracu([inc], "2026-09-20").size).toBe(0);
  });

  it("odhalený pachatel do 14 dní od incidentu, neodhalený nikdy", () => {
    const mapa = druhyHracu([
      { culprit_player_id: "p", culprit_revealed: 1, accused: "[]", game_date: "2026-09-10T16:00:00.000Z" },
      { culprit_player_id: "q", culprit_revealed: 0, accused: "[]", game_date: "2026-09-10T16:00:00.000Z" },
    ], "2026-09-20");
    expect(mapa.get("p")).toEqual(["pachatel"]);
    expect(mapa.has("q")).toBe(false);
  });

  it("do losu omluvenek se počítá jen obvinění aspoň minOdstup dní před zápasem", () => {
    const inc = { culprit_player_id: null, culprit_revealed: 0, accused: obvineni([["a", "2026-09-19"]]), game_date: "2026-09-01T16:00:00.000Z" };
    // 2026-09-19 je 1 den před zápasem 2026-09-20: s odstupem 2 dny se ignoruje, bez odstupu se počítá.
    expect(druhyHracu([inc], "2026-09-20", 2).size).toBe(0);
    expect(druhyHracu([inc], "2026-09-20", 0).get("a")).toEqual(["obvineny"]);
  });

  it("obvinění 2 dny před zápasem se do losu už počítá", () => {
    const inc = { culprit_player_id: null, culprit_revealed: 0, accused: obvineni([["a", "2026-09-18"]]), game_date: "2026-09-01T16:00:00.000Z" };
    expect(druhyHracu([inc], "2026-09-20", 2).get("a")).toEqual(["obvineny"]);
  });
});

describe("vlivy životních situací", () => {
  const dnes = "2026-09-17";
  const situace = (kind: string, over: Partial<IncidentProVliv> = {}): IncidentProVliv => ({
    culprit_player_id: null, culprit_revealed: 0, accused: "[]", game_date: "2026-09-10",
    status: "probiha", kind, subject_player_id: "s", ends_on: "2026-10-05", ...over,
  });

  it("běžící situace dá hráči svůj druh vlivu", () => {
    expect(druhyHracu([situace("dluhy")], dnes).get("s")).toEqual(["dluhy"]);
    expect(druhyHracu([situace("rozvod")], dnes).get("s")).toEqual(["rozvod"]);
  });

  it("skončená ani uzavřená situace už nepůsobí", () => {
    expect(druhyHracu([situace("dluhy", { ends_on: "2026-09-16" })], dnes).has("s")).toBe(false);
    expect(druhyHracu([situace("dluhy", { status: "uzavreny" })], dnes).has("s")).toBe(false);
  });

  it("situace, které na nic nenapojujeme, druh nedávají", () => {
    expect(druhyHracu([situace("svatba_spoluhrace")], dnes).has("s")).toBe(false);
  });
});

describe("dodatečný průchod omluvenek", () => {
  const vylosovane: AbsenceResult[] = [
    { playerIndex: 0, category: "personal", timing: "day_before", reason: "Osobní", emoji: "👫", smsText: "Nemůžu." },
    { playerIndex: 2, category: "health", timing: "day_before", reason: "Zdraví", emoji: "🤒", smsText: "Jsem nemocný." },
  ];
  const soud: IncidentniAbsence = { playerId: "b", druh: "soud", duvod: "Soudní jednání", sms: "Mám soud, nemůžu hrát." };

  it("bez incidentní absence vrací tentýž los", () => {
    expect(pridejIncidentniAbsence(vylosovane, ["a", "b", "c"], new Map(), "day_before")).toEqual(vylosovane);
  });

  it("přidá incidentní absenci a ostatní omluvenky nechá být", () => {
    const vysledek = pridejIncidentniAbsence(vylosovane, ["a", "b", "c"], new Map([["b", soud]]), "day_before");
    expect(vysledek.slice(0, 2)).toEqual(vylosovane);
    expect(vysledek[2]).toEqual({ playerIndex: 1, category: "incident", timing: "day_before", reason: "Soudní jednání", emoji: "⚖️", smsText: "Mám soud, nemůžu hrát." });
  });

  it("vylosovanou omluvenku hráče nahradí incidentní", () => {
    const vysledek = pridejIncidentniAbsence(vylosovane, ["a", "b", "c"], new Map([["c", { ...soud, playerId: "c" }]]), "match_day");
    expect(vysledek.map((a) => [a.playerIndex, a.category])).toEqual([[0, "personal"], [2, "incident"]]);
  });

  it("hráče mimo losovaný kádr (zraněný, stopka) ignoruje", () => {
    expect(pridejIncidentniAbsence(vylosovane, ["a", "b", "c"], new Map([["z", { ...soud, playerId: "z" }]]), "day_before")).toEqual(vylosovane);
  });

  it("na trénink nepustí jen výslech a soud", () => {
    const mapa = new Map<string, IncidentniAbsence>([
      ["a", { playerId: "a", druh: "vyslech", duvod: "Výslech na policii", sms: "x." }],
      ["b", { playerId: "b", druh: "vyrazen", duvod: "Vyřazen trenérem", sms: "x." }],
    ]);
    expect(duvodyNaTrenink(["a", "b", "c"], mapa)).toEqual(["Byl na výslechu na policii", undefined, undefined]);
  });
});

describe("zápis absence", () => {
  const zaklad: NovaAbsence = {
    incidentId: "inc-1", teamId: "tym-a", playerId: "p", druh: "vyslech",
    od: "2026-09-18", do: "2026-09-18", zapasu: null, ohlaseno: "2026-09-16", sms: "Mám výslech.",
  };

  it("datumová absence musí být ohlášená aspoň 2 dny dopředu", () => {
    expect(absencePlatnaKZapisu(zaklad)).toBe(true);
    expect(absencePlatnaKZapisu({ ...zaklad, od: "2026-09-17", do: "2026-09-17" })).toBe(false);
    expect(absencePlatnaKZapisu({ ...zaklad, od: null })).toBe(false);
  });

  it("vyřazení jen na 1 až 3 zápasy", () => {
    const vyrazeni = { ...zaklad, druh: "vyrazen" as const, od: null, do: null };
    expect(absencePlatnaKZapisu({ ...vyrazeni, zapasu: 1 })).toBe(true);
    expect(absencePlatnaKZapisu({ ...vyrazeni, zapasu: 3 })).toBe(true);
    expect(absencePlatnaKZapisu({ ...vyrazeni, zapasu: 0 })).toBe(false);
    expect(absencePlatnaKZapisu({ ...vyrazeni, zapasu: 4 })).toBe(false);
  });

  it("příkaz má deterministické id a neplatnou absenci nezapíše", () => {
    const db = new FalesnaD1();
    const prikaz = prikazAbsence(jakoD1(db), zaklad) as unknown as { sql: string; params: unknown[] };
    expect(prikaz.sql).toMatch(/INSERT OR IGNORE INTO club_incident_absences/);
    expect(prikaz.params).toEqual(["inc-1-abs-1", "inc-1", "tym-a", "p", "vyslech", "2026-09-18", "2026-09-18", null, "2026-09-16", "Výslech na policii", "Mám výslech."]);
    expect(prikazAbsence(jakoD1(db), { ...zaklad, od: "2026-09-16" })).toBeNull();
  });
});

describe("načtení kontextu", () => {
  it("spojí absence a vlivy pro datum zápasu", async () => {
    const db = new FalesnaD1([
      { sql: /FROM club_incident_absences/, all: [radek()] },
      { sql: /FROM club_incidents/, all: [{ culprit_player_id: "p", culprit_revealed: 1, accused: "[]", game_date: "2026-09-15T16:00:00.000Z" }] },
    ]);
    const kontext = await nactiIncidentniKontext(jakoD1(db), "tym-a", "2026-09-20T15:00:00.000Z");
    expect(kontext.absence.get("p")?.duvod).toBe("Soudní jednání");
    expect(kontext.druhy.get("p")).toEqual(["pachatel"]);
    const dotaz = db.dotazy.find((d) => /FROM club_incident_absences/.test(d.sql));
    expect(dotaz?.params).toEqual(["tym-a", "2026-09-20", "2026-09-20"]);
  });
});
