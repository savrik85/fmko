import { describe, expect, it } from "vitest";
import { createRng } from "../generators/rng";
import { gameExpiry } from "../lib/game-time";
import {
  hroziciCin, idHroziciho, pribehyHospody, vyberCin,
  type HostHospody, type IncidentVHospode, type KontextHospody, type VolbyHospody,
} from "./hospoda";
import { BONUS_POLICIE } from "./nastaveni";
import { PROBLEMOVY, hrac, stavKlubu } from "./testovaci-stav";
import type { HracKlubu, Obvineni } from "./typy";

const DNES = "2026-09-16T16:00:00.000Z";
const SVEDEK = hrac({ id: "s", jmeno: "Pepa Kos", alkohol: 80 });
const PACHATEL = hrac({ id: "p", jmeno: "Franta Novák", alkohol: 80 });
const KAMARAD = hrac({ id: "k", jmeno: "Karel Vrba", alkohol: 40 });
const JISTE: VolbyHospody = { trener: false, jiste: true };

function kontext(o: Partial<KontextHospody> = {}): KontextHospody {
  return {
    teamId: "tym-a", leagueId: "liga-1", seasonNumber: 4, nazevKlubu: "TJ Dvory",
    den: "2026-09-16", gameDate: DNES, incidenty: [], svedci: [],
    kadr: new Map([SVEDEK, PACHATEL, KAMARAD].map((h) => [h.id, h])),
    kamaradi: new Map(), rivalove: new Map(), hrozi: new Set(),
    situace: new Map(), idSituaci: new Map(), odmitnuteZalohy: new Set(), ...o,
  };
}

function incident(o: Partial<IncidentVHospode> = {}): IncidentVHospode {
  return {
    id: "inc-1", kind: "vloupani_sklad", category: "kradez", status: "otevreny", severity: 1, den: "2026-09-14",
    culpritType: "hrac", culpritPlayerId: "p", odhalen: false, deadline: "2026-09-21T16:00:00.000Z",
    ztraty: [{ typ: "vybaveni", kategorie: "jerseys", uroven: 2, stav: 70, urovniDolu: 2 }],
    recovered: false, inzerat: false, uzavrenoDne: null, obvineni: [], stopyHospody: [], ...o,
  };
}

function host(h: HracKlubu, o: Partial<HostHospody> = {}): HostHospody {
  const [krestni, ...prijmeni] = h.jmeno.split(" ");
  return { playerId: h.id, krestni, prijmeni: prijmeni.join(" "), alkohol: h.alkohol, teamId: "tym-a", host: false, ...o };
}

const vztah = (a: string, b: string) => new Map([[a, new Set([b])], [b, new Set([a])]]);
const SVEDCI = [{ incidentId: "inc-1", playerId: "s", role: "svedek" as const, vyslech: null }];
const CIZI = { playerId: "v", krestni: "Vašek", prijmeni: "Host", alkohol: 50, teamId: "tym-b", host: true };

describe("hospoda mluví jen o tom, co se stalo", () => {
  it("bez hráčů klubu u stolu se o incidentech nemluví", () => {
    const r = pribehyHospody([CIZI], kontext({ incidenty: [incident({ severity: 3 })] }), JISTE);
    expect(r).toEqual({ pribehy: [], zapisy: [], ohlaseni: null, zlodeji: [] });
  });

  it("o dnešním incidentu hospoda ještě neví", () => {
    const r = pribehyHospody([host(PACHATEL)], kontext({ incidenty: [incident({ den: "2026-09-16", severity: 2 })] }), JISTE);
    expect(r.pribehy).toEqual([]);
  });
});

describe("drby", () => {
  it("opilý svědek prozradí, co ví: deník jmenuje jen jeho, stopa a SMS i pachatele", () => {
    const r = pribehyHospody([host(SVEDEK)], kontext({ incidenty: [incident()], svedci: SVEDCI }), JISTE);
    expect(r.pribehy).toHaveLength(1);
    expect(r.pribehy[0]).toMatchObject({ type: "drby_o_incidentu", playerIds: ["s"], incidentId: "inc-1" });
    expect(r.pribehy[0].text).toContain("Pepa Kos");
    expect(r.pribehy[0].text).not.toContain("Franta Novák");
    const prozradil = r.zapisy.find((z) => z.typ === "prozradil");
    expect(prozradil).toMatchObject({
      incidentId: "inc-1", svedekId: "s",
      stopa: { zdroj: "hospoda", ukazujeNa: "p", drzitel: "s", sila: 2, bonusPolicie: BONUS_POLICIE.svedek, nalezena: true },
    });
    expect(prozradil?.typ === "prozradil" && prozradil.stopa.text).toContain("Franta Novák");
    expect(prozradil?.typ === "prozradil" && prozradil.stopa.text).toContain("u skladu");
    expect(r.zapisy.find((z) => z.typ === "sms")).toMatchObject({ incidentId: "inc-1", text: expect.stringContaining("Franta Novák") });
  });

  it("vyslechnutý nebo střízlivý svědek ani svědek odhaleného pachatele drby nedají", () => {
    const vyslechnuty = pribehyHospody([host(SVEDEK)], kontext({ incidenty: [incident()], svedci: [{ ...SVEDCI[0], vyslech: "kryje" }] }), JISTE);
    const strizlivy = pribehyHospody([host(SVEDEK, { alkohol: 50 })], kontext({ incidenty: [incident()], svedci: SVEDCI }), JISTE);
    const odhaleny = pribehyHospody([host(SVEDEK)], kontext({ incidenty: [incident({ odhalen: true })], svedci: SVEDCI }), JISTE);
    for (const r of [vyslechnuty, strizlivy, odhaleny]) expect(r.zapisy.filter((z) => z.typ === "prozradil")).toEqual([]);
  });

  it("trenér v hospodě drby zdvojnásobí: co vyjde bez něj, vyjde i s ním", () => {
    let bez = 0;
    let sTrenerem = 0;
    for (let d = 1; d <= 300; d++) {
      const den = new Date(Date.UTC(2026, 9, 1) + d * 86_400_000).toISOString().slice(0, 10);
      const k = kontext({ den, gameDate: `${den}T16:00:00.000Z`, incidenty: [incident({ den: "2026-09-01" })], svedci: SVEDCI });
      const b = pribehyHospody([host(SVEDEK)], k, { trener: false, jiste: false }).pribehy.length;
      const t = pribehyHospody([host(SVEDEK)], k, { trener: true, jiste: false }).pribehy.length;
      if (b > 0) expect(t).toBeGreaterThan(0);
      bez += b;
      sTrenerem += t;
    }
    expect(bez).toBeGreaterThan(30);
    expect(sTrenerem).toBeGreaterThan(bez * 1.4);
  });
});

describe("cizí chlap nabízí zboží", () => {
  const cizi = (o: Partial<IncidentVHospode> = {}) => incident({ culpritType: "cizi", culpritPlayerId: null, ...o });

  it("nevystavené zboží cizího zloděje dá stopu bez jména, poznatelné přidá policii", () => {
    const r = pribehyHospody([host(KAMARAD)], kontext({ incidenty: [cizi()] }), JISTE);
    expect(r.pribehy.map((p) => p.type)).toEqual(["nabizi_zbozi"]);
    expect(r.zapisy.find((z) => z.typ === "stopa")).toMatchObject({
      incidentId: "inc-1", klic: "nabizi", stopa: { zdroj: "hospoda", ukazujeNa: null, sila: 1, bonusPolicie: BONUS_POLICIE.hospodaNabizi },
    });
    const nepoznatelne = pribehyHospody([host(KAMARAD)], kontext({
      incidenty: [cizi({ ztraty: [{ typ: "vybaveni", kategorie: "jerseys", uroven: 1, stav: 70, urovniDolu: 1 }] })],
    }), JISTE);
    expect(nepoznatelne.zapisy.find((z) => z.typ === "stopa")).toMatchObject({ stopa: { bonusPolicie: 0 } });
  });

  it("zboží v bazaru, vrácené, už jednou nabízené nebo u uzavřeného incidentu se nenabízí", () => {
    for (const o of [{ inzerat: true }, { recovered: true }, { stopyHospody: ["nabizi"] }, { status: "uzavreny" as const }]) {
      expect(pribehyHospody([host(KAMARAD)], kontext({ incidenty: [cizi(o)] }), JISTE).pribehy).toEqual([]);
    }
  });
});

describe("chlubení", () => {
  it("neodhalený pachatel se pochlubí a tím se prozradí", () => {
    const r = pribehyHospody([host(PACHATEL)], kontext({ incidenty: [incident()] }), JISTE);
    expect(r.pribehy.map((p) => p.type)).toEqual(["chlubi_se"]);
    expect(r.pribehy[0].text).toContain("Franta Novák");
    expect(r.zapisy.find((z) => z.typ === "stopa")).toMatchObject({ klic: "chlubi", stopa: { zdroj: "hospoda", ukazujeNa: "p", sila: 3 } });
    // Pozdější ze stávající lhůty a dneška + 3 dny.
    expect(r.zapisy.find((z) => z.typ === "odhaleni")).toEqual({ typ: "odhaleni", incidentId: "inc-1", deadline: "2026-09-21T16:00:00.000Z" });
    expect(r.zapisy.some((z) => z.typ === "sms")).toBe(true);
  });

  it("pochlubit se může jen skutečný pachatel z kádru", () => {
    expect(pribehyHospody([host(SVEDEK)], kontext({ incidenty: [incident()] }), JISTE).pribehy).toEqual([]);
    expect(pribehyHospody([host(PACHATEL)], kontext({ incidenty: [incident({ culpritType: "cizi", culpritPlayerId: null, ztraty: [] })] }), JISTE).pribehy).toEqual([]);
  });

  it("známý pachatel se chlubí bez nové stopy, po deseti dnech ani u uzavřeného už ne", () => {
    const znamy = pribehyHospody([host(PACHATEL)], kontext({ incidenty: [incident({ odhalen: true })] }), JISTE);
    expect(znamy.pribehy.map((p) => p.type)).toContain("chlubi_se");
    expect(znamy.zapisy.filter((z) => z.typ === "stopa" || z.typ === "odhaleni" || z.typ === "sms")).toEqual([]);
    expect(pribehyHospody([host(PACHATEL)], kontext({ incidenty: [incident({ den: "2026-09-05" })] }), JISTE).pribehy).toEqual([]);
    expect(pribehyHospody([host(PACHATEL)], kontext({ incidenty: [incident({ status: "uzavreny", uzavrenoDne: "2026-09-15" })] }), JISTE).pribehy).toEqual([]);
  });
});

describe("stížnost na trenéra", () => {
  const OBV: Obvineni = { playerId: "s", jmeno: "Pepa Kos", den: "2026-09-10", vysledek: "zapira" };

  it("kdo zapřel obvinění, stěžuje si kamarádům a těm klesne vztah k trenérovi i morálka", () => {
    const k = kontext({ incidenty: [incident({ culpritType: "cizi", culpritPlayerId: null, ztraty: [], obvineni: [OBV] })], kamaradi: vztah("s", "k") });
    const r = pribehyHospody([host(SVEDEK), host(KAMARAD)], k, JISTE);
    const p = r.pribehy.find((x) => x.type === "stezuje_si_na_trenera");
    expect(p?.text).toContain("Pepa Kos");
    expect(p?.effects).toEqual([
      { playerId: "k", type: "vztah", delta: -3, label: "−3 vztah k trenérovi" },
      { playerId: "k", type: "morale", delta: -1, label: "−1 morálka" },
    ]);
  });

  it("bez kamaráda u stolu, u odhaleného pachatele ani po 60 dnech si nestěžuje", () => {
    const zaklad = { culpritType: "cizi" as const, culpritPlayerId: null, ztraty: [] };
    const bezKamarada = pribehyHospody([host(SVEDEK)], kontext({ incidenty: [incident({ ...zaklad, obvineni: [OBV] })], kamaradi: vztah("s", "k") }), JISTE);
    const odhaleny = pribehyHospody([host(SVEDEK), host(KAMARAD)], kontext({
      incidenty: [incident({ culpritPlayerId: "s", odhalen: true, ztraty: [], obvineni: [OBV] })], kamaradi: vztah("s", "k"),
    }), JISTE);
    const davno = pribehyHospody([host(SVEDEK), host(KAMARAD)], kontext({
      incidenty: [incident({ ...zaklad, den: "2026-07-01", obvineni: [{ ...OBV, den: "2026-07-10" }] })], kamaradi: vztah("s", "k"),
    }), JISTE);
    for (const r of [bezKamarada, odhaleny, davno]) expect(r.pribehy.filter((p) => p.type === "stezuje_si_na_trenera")).toEqual([]);
  });
});

describe("rvačka", () => {
  it("odhalený zloděj a jeho rival u jednoho stolu se poperou", () => {
    const k = kontext({ incidenty: [incident({ odhalen: true, den: "2026-09-01" })], rivalove: vztah("p", "s") });
    const p = pribehyHospody([host(PACHATEL), host(SVEDEK)], k, JISTE).pribehy.find((x) => x.type === "rvacka_kvuli_kradezi");
    expect(p?.playerIds).toEqual(["s", "p"]);
    expect(p?.effects.map((e) => e.playerId)).toEqual(["s", "p"]);
    for (const e of p?.effects ?? []) expect(["injury", "condition"]).toContain(e.type);
  });

  it("neodhalený zloděj ani dávno uzavřená krádež rvačku nevyvolá", () => {
    const rivalove = vztah("p", "s");
    const hoste = [host(PACHATEL), host(SVEDEK)];
    const neodhaleny = pribehyHospody(hoste, kontext({ incidenty: [incident({ den: "2026-09-01" })], rivalove }), JISTE);
    const davno = pribehyHospody(hoste, kontext({
      incidenty: [incident({ odhalen: true, den: "2026-08-01", status: "uzavreny", uzavrenoDne: "2026-08-10" })], rivalove,
    }), JISTE);
    for (const r of [neodhaleny, davno]) expect(r.pribehy.filter((p) => p.type === "rvacka_kvuli_kradezi")).toEqual([]);
  });
});

describe("celá hospoda řeší", () => {
  const zavazny = (o: Partial<IncidentVHospode> = {}) => incident({ severity: 2, culpritType: "cizi", culpritPlayerId: null, ztraty: [], ...o });

  it("závažný incident do tří dnů, bez jmen", () => {
    const r = pribehyHospody([host(KAMARAD)], kontext({ incidenty: [zavazny()] }), JISTE);
    expect(r.pribehy.map((p) => p.type)).toEqual(["cela_hospoda_resi"]);
  });

  it("drobnost ani starší incident ne", () => {
    expect(pribehyHospody([host(KAMARAD)], kontext({ incidenty: [zavazny({ severity: 1 })] }), JISTE).pribehy).toEqual([]);
    expect(pribehyHospody([host(KAMARAD)], kontext({ incidenty: [zavazny({ den: "2026-09-12" })] }), JISTE).pribehy).toEqual([]);
  });
});

describe("vůdci fanoušků poznají zloděje", () => {
  it("odhalený čerstvý zloděj u stolu jde do seznamu", () => {
    const r = pribehyHospody([host(PACHATEL)], kontext({ incidenty: [incident({ odhalen: true, den: "2026-09-01" })] }), JISTE);
    expect(r.zlodeji).toEqual([{ playerId: "p", jmeno: "Franta Novák" }]);
  });
});

describe("ohlášení činu", () => {
  const SVATY = hrac({ id: "x", jmeno: "Jan Svatý", alkohol: 90, disciplina: 95, vernost: 95, vztahKTrenerovi: 90 });

  it("opilý hráč s povahou pachatele čin ohlásí, disciplinovaný ne", () => {
    const k = kontext({ kadr: new Map([[PROBLEMOVY.id, PROBLEMOVY], [SVATY.id, SVATY]]) });
    expect(pribehyHospody([host(PROBLEMOVY)], k, JISTE).ohlaseni).toEqual({ playerId: "p", obvineny: false });
    expect(pribehyHospody([host(SVATY)], k, JISTE).ohlaseni).toBeNull();
  });

  it("zapřené obvinění stačí i bez povahy pachatele, alkohol ale musí být", () => {
    const obv: Obvineni = { playerId: "x", jmeno: "Jan Svatý", den: "2026-09-10", vysledek: "zapira" };
    const k = kontext({ kadr: new Map([[SVATY.id, SVATY]]), incidenty: [incident({ culpritType: "cizi", culpritPlayerId: null, ztraty: [], obvineni: [obv] })] });
    expect(pribehyHospody([host(SVATY, { alkohol: 75 })], k, JISTE).ohlaseni).toEqual({ playerId: "x", obvineny: true });
    expect(pribehyHospody([host(SVATY, { alkohol: 60 })], k, JISTE).ohlaseni).toBeNull();
  });

  it("kdo už jeden čin ohlásil, druhý neohlásí; admin může ohlášení vynutit", () => {
    const k = kontext({ kadr: new Map([[PROBLEMOVY.id, PROBLEMOVY], [KAMARAD.id, KAMARAD]]) });
    expect(pribehyHospody([host(PROBLEMOVY)], { ...k, hrozi: new Set(["p"]) }, JISTE).ohlaseni).toBeNull();
    expect(pribehyHospody([host(PROBLEMOVY), host(KAMARAD)], k, { ...JISTE, ohlasi: "k" }).ohlaseni).toEqual({ playerId: "k", obvineny: false });
  });
});

describe("jaký čin a kdo o něm dá vědět", () => {
  it("nikdy neohlásí čin, na který klub nemá", () => {
    const jenDresy = stavKlubu({ vybaveni: { jerseys: 2 } });
    for (let s = 1; s <= 50; s++) expect(vyberCin(jenDresy, true, createRng(s))).toBe("vloupani_sklad");
    expect(vyberCin(stavKlubu(), true, createRng(1))).toBeNull();
  });

  it("kopnout do dveří jde jen obviněnému a jen s šatnami", () => {
    const s = stavKlubu({ stadion: { changing_rooms: 1, pitch_condition: 70 } });
    expect(vyberCin(s, false, createRng(1))).toBeNull();
    expect(vyberCin(s, true, createRng(1))).toBe("kopnute_dvere");
  });

  it("hrozící čin: lhůta 1 až 3 dny, znalost jen pro něj, posel kamarád s dobrým vztahem", () => {
    const dobry = hrac({ id: "d", jmeno: "Dan Dobrý", vztahKTrenerovi: 70 });
    const zly = hrac({ id: "z", jmeno: "Zdeněk Zlý", vztahKTrenerovi: 30 });
    const k = kontext({ kadr: new Map([PACHATEL, dobry, zly].map((h) => [h.id, h])) });
    const cin = hroziciCin(k, [host(PACHATEL), host(dobry), host(zly)], "p", "vitrina", createRng(3));
    expect(cin?.id).toBe(idHroziciho("tym-a", "vitrina", "2026-09-16", "p"));
    expect(cin?.id).toBe("inc-tym-a-vitrina-2026-09-16-hrozi-p");
    expect([1, 2, 3].map((n) => gameExpiry(DNES, n))).toContain(cin?.deadline);
    expect(cin?.text).toContain("Franta Novák");
    expect(cin?.znalost).toMatchObject({ playerId: "p", role: "pachatel", until: cin?.deadline });
    expect(cin?.posel).toEqual({ id: "d", firstName: "Dan", lastName: "Dobrý" });
    expect(hroziciCin(kontext(), [host(PACHATEL)], "p", "vitrina", createRng(3))?.posel).toBeNull();
    expect(hroziciCin(kontext(), [], "nikdo", "vitrina", createRng(3))).toBeNull();
  });
});

describe("drb do cizích klubů", () => {
  it("host z jiného klubu si drb odnese, jen veřejný fakt na 14 dní", () => {
    const k = kontext({ incidenty: [incident({ severity: 2, culpritType: "cizi", culpritPlayerId: null, ztraty: [] })] });
    const drb = pribehyHospody([host(KAMARAD), CIZI], k, JISTE).zapisy.find((z) => z.typ === "drb");
    expect(drb).toMatchObject({ incidentId: "inc-1", teamId: "tym-b", znalost: { playerId: "v", role: "drb", until: gameExpiry(DNES, 14) } });
    expect(drb?.typ === "drb" && drb.znalost.fact).toContain("TJ Dvory");
  });

  it("bez příhody žádný drb", () => {
    expect(pribehyHospody([host(KAMARAD), CIZI], kontext(), JISTE).zapisy).toEqual([]);
  });

  it("životní situace (např. pití na sekeru) se do cizích klubů nedrbe", () => {
    // `k.incidenty` může situaci obsahovat (dotaz v hospoda-db.ts kategorii nefiltruje),
    // ale drb ze životní situace není: není to průšvih.
    const situace = incident({
      id: "inc-dluhy-s", kind: "dluhy", category: "zivotni", culpritType: null, culpritPlayerId: null, ztraty: [],
    });
    const k = kontext({
      incidenty: [situace], situace: new Map([[SVEDEK.id, "dluhy"]]), idSituaci: new Map([[SVEDEK.id, "inc-dluhy-s"]]),
    });
    const r = pribehyHospody([host(SVEDEK), CIZI], k, JISTE);
    expect(r.pribehy.some((p) => p.type === "pije_na_sekeru" && p.incidentId === "inc-dluhy-s")).toBe(true);
    expect(r.zapisy.filter((z) => z.typ === "drb")).toEqual([]);
  });
});

describe("co už dnes zaznělo, se nezopakuje", () => {
  it("klíč typ|incident příhodu přeskočí", () => {
    const r = pribehyHospody([host(PACHATEL)], kontext({ incidenty: [incident()] }), { ...JISTE, uzZaznelo: new Set(["chlubi_se|inc-1"]) });
    expect(r.pribehy).toEqual([]);
    expect(r.zapisy).toEqual([]);
  });
});

describe("dluhy v hospodě", () => {
  it("hospodský už nechce nalévat na sekeru a je to varování", () => {
    const k = kontext({ situace: new Map([[SVEDEK.id, "dluhy"]]) });
    const r = pribehyHospody([host(SVEDEK)], k, JISTE);
    const p = r.pribehy.find((x) => x.type === "pije_na_sekeru");
    expect(p?.text).toContain("Pepa Kos");
    expect(p?.effects).toEqual([]);
    expect(r.zapisy).toEqual([]);
  });

  it("bez dluhů se na sekeru nepije", () => {
    expect(pribehyHospody([host(SVEDEK)], kontext(), JISTE).pribehy.filter((p) => p.type === "pije_na_sekeru")).toEqual([]);
  });

  it("hráč s odmítnutou zálohou smí ohlásit čin i bez povahy pachatele, ale nikoho neobviňuje", () => {
    const svaty = hrac({ id: "x", jmeno: "Jan Svatý", alkohol: 90, disciplina: 95, vernost: 95, vztahKTrenerovi: 90 });
    const k = kontext({ kadr: new Map([[svaty.id, svaty]]), situace: new Map([[svaty.id, "dluhy"]]), odmitnuteZalohy: new Set([svaty.id]) });
    const ohlaseni = pribehyHospody([host(svaty)], k, JISTE).ohlaseni;
    // Odmítnutá záloha ho namíchne, ale nikdo ho z ničeho neobvinil: obvineny musí zůstat false,
    // jinak by mu vyšla kopnutá dvířka a jejich text o obvinění, které nikdo nevznesl.
    expect(ohlaseni).toEqual({ playerId: "x", obvineny: false });
    const s = stavKlubu({ stadion: { changing_rooms: 1, pitch_condition: 70 } });
    for (let seed = 1; seed <= 30; seed++) expect(vyberCin(s, ohlaseni!.obvineny, createRng(seed))).not.toBe("kopnute_dvere");
  });

  it("každý hráč s dluhy nese incidentId své vlastní situace, ne cizí ani náhodně vybrané", () => {
    // Návnada v `incidenty`, jejíž id taky obsahuje „dluhy", ale nepatří žádnému z nich:
    // starý kód `k.incidenty.find(i => i.id.includes("dluhy"))` by ji chybně přiřadil oběma.
    const navnada = incident({ id: "inc-dluhy-jiny", culpritType: null, culpritPlayerId: null, category: "zivotni", ztraty: [] });
    const k = kontext({
      incidenty: [navnada],
      situace: new Map([[SVEDEK.id, "dluhy"], [PACHATEL.id, "dluhy"]]),
      idSituaci: new Map([[SVEDEK.id, "inc-dluhy-s"], [PACHATEL.id, "inc-dluhy-p"]]),
    });
    const svedekuv = pribehyHospody([host(SVEDEK)], k, JISTE).pribehy.find((p) => p.type === "pije_na_sekeru");
    const pachateluv = pribehyHospody([host(PACHATEL)], k, JISTE).pribehy.find((p) => p.type === "pije_na_sekeru");
    expect(svedekuv?.incidentId).toBe("inc-dluhy-s");
    expect(pachateluv?.incidentId).toBe("inc-dluhy-p");
  });
});

describe("pachatel peněžního incidentu platí rundy (spec 9)", () => {
  it("odhalený pachatel krádeže peněz kupuje rundu", () => {
    const k = kontext({ incidenty: [incident({ id: "i1", kind: "kasa_obcerstveni", culpritPlayerId: SVEDEK.id, odhalen: true, den: "2026-09-17" })] });
    const r = pribehyHospody([host(SVEDEK)], k, JISTE);
    expect(r.pribehy.find((p) => p.type === "utraci_za_rundy")?.text).toContain("Pepa Kos");
  });

  it("neodhalený pachatel se rundami neprozradí", () => {
    const k = kontext({ incidenty: [incident({ id: "i1", kind: "kasa_obcerstveni", culpritPlayerId: SVEDEK.id, odhalen: false, den: "2026-09-17" })] });
    expect(pribehyHospody([host(SVEDEK)], k, JISTE).pribehy.filter((p) => p.type === "utraci_za_rundy")).toEqual([]);
  });

  it("u nepeněžního incidentu se rundy neplatí", () => {
    const k = kontext({ incidenty: [incident({ id: "i1", kind: "vloupani_sklad", culpritPlayerId: SVEDEK.id, odhalen: true, den: "2026-09-17" })] });
    expect(pribehyHospody([host(SVEDEK)], k, JISTE).pribehy.filter((p) => p.type === "utraci_za_rundy")).toEqual([]);
  });
});

describe("hospodský a trenér svědčí rundám víc (spec 9)", () => {
  // Incident daleko v budoucnu: `rundy()` čte přímo `k.incidenty` bez okna „už bylo",
  // takže s ním `dnyMezi(inc.den, k.den)` vyjde vždy hodně záporné, tedy pod RUNDY_DNI,
  // a den hospody (`k.den`) se dá volně měnit pro nové losy bez ovlivnění podmínky.
  const kontextSRundou = (den: string, kadrNavic: HracKlubu[]) => kontext({
    den, gameDate: `${den}T16:00:00.000Z`,
    kadr: new Map([SVEDEK, PACHATEL, KAMARAD, ...kadrNavic].map((h) => [h.id, h])),
    incidenty: [incident({ id: "i1", kind: "kasa_obcerstveni", culpritPlayerId: SVEDEK.id, odhalen: true, den: "2030-01-01" })],
  });
  const kolikrat = (kadrNavic: HracKlubu[], trener: boolean) => {
    let n = 0;
    for (let d = 1; d <= 300; d++) {
      const den = new Date(Date.UTC(2026, 9, 1) + d * 86_400_000).toISOString().slice(0, 10);
      const k = kontextSRundou(den, kadrNavic);
      if (pribehyHospody([host(SVEDEK)], k, { trener, jiste: false }).pribehy.some((p) => p.type === "utraci_za_rundy")) n++;
    }
    return n;
  };

  it("s hospodským v kádru padne runda častěji", () => {
    const sHospodskym = kolikrat([hrac({ id: "hs", jmeno: "Bedřich Výčep", povolani: "Hospodský" })], false);
    const bezneho = kolikrat([], false);
    expect(sHospodskym).toBeGreaterThan(bezneho);
  });

  it("s trenérem v hospodě padne runda častěji", () => {
    const sTrenerem = kolikrat([], true);
    const bezneho = kolikrat([], false);
    expect(sTrenerem).toBeGreaterThan(bezneho);
  });
});
