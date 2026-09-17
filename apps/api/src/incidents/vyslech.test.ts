import { describe, expect, it } from "vitest";
import type { IncidentRadek } from "./incident-db";
import { FalesnaD1, jakoD1, type Pravidlo } from "./testovaci-d1";
import { hrac, hracRadek, incidentRadek } from "./testovaci-stav";
import { rozhodniPachatele, rozhodniSvedka, sanceProzrazeni, vyslechni } from "./vyslech";

const DNES = "2026-09-16T16:00:00.000Z";

describe("šance a rozhodnutí výslechu", () => {
  it("rival mluví ochotněji, kamarád kryje, vztah k trenérovi pomáhá (spec 7a)", () => {
    expect(sanceProzrazeni("svedek", 50, 50)).toBe(50);
    expect(sanceProzrazeni("rival", 50, 50)).toBe(65);
    expect(sanceProzrazeni("kamarad", 50, 50)).toBe(30);
    expect(sanceProzrazeni("svedek", 50, 90)).toBe(70);
    expect(sanceProzrazeni("kamarad", 0, 0)).toBe(0);
    expect(sanceProzrazeni("rival", 100, 100)).toBe(100);
  });

  it("hráč s víc rolemi odpoví podle té nejméně ochotné", () => {
    expect(rozhodniSvedka([{ role: "svedek", ochota: 70 }, { role: "kamarad", ochota: 20 }], 50, 0.01)).toBe("kryje");
    expect(rozhodniSvedka([{ role: "svedek", ochota: 70 }], 50, 0.01)).toBe("prozradil");
  });

  it("pachatel se přizná podle disciplíny, temperamentu, vztahu a stopy", () => {
    // (90 + 90 + 80) / 3 − 20 = 66,7; se stopou 96,7
    const hodny = hrac({ disciplina: 90, temperament: 10, vztahKTrenerovi: 80 });
    expect(rozhodniPachatele(hodny, false, 0.5)).toBe("priznal");
    expect(rozhodniPachatele(hodny, false, 0.7)).toBe("zapira");
    expect(rozhodniPachatele(hodny, true, 0.7)).toBe("priznal");
  });
});

type Role = { role: string; willingness: number; interrogation: string | null };

function prostredi(opts: { incident?: IncidentRadek; role: Role[]; hracOver?: Record<string, unknown>; dalsi?: Pravidlo[] }) {
  return new FalesnaD1([
    ...(opts.dalsi ?? []),
    { sql: /FROM club_incidents WHERE id = \? AND team_id = \?/, first: opts.incident ?? incidentRadek() },
    { sql: /SELECT role, willingness, interrogation FROM club_incident_knowledge/, all: opts.role },
    { sql: /FROM players WHERE id = \? AND team_id = \?/, first: hracRadek("s", "Jan", "Svědek", opts.hracOver) },
    { sql: /SELECT COUNT\(\*\) AS n FROM relationships/, first: { n: 0 } },
    // Pachatel "p" je defaultně pořád v kádru, vztahy se tak posouvají jako dřív.
    { sql: /SELECT 1 AS ano FROM players WHERE id = \?/, first: { ano: 1 } },
  ]);
}

const zeptej = (db: FalesnaD1, playerId = "s") =>
  vyslechni(jakoD1(db), { teamId: "tym-a", incidentId: "inc-1", playerId, gameDate: DNES });

describe("výslech v DB", () => {
  it("rival, který práskne: uloží výsledek, najde jeho stopu a rivalita zesílí", async () => {
    const db = prostredi({
      role: [{ role: "rival", willingness: 100, interrogation: null }],
      hracOver: { coach_relationship: 100 },
      dalsi: [{ sql: /SELECT id, strength FROM relationships/, first: { id: "v1", strength: 50 } }],
    });
    expect(await zeptej(db)).toEqual({ vysledek: "prozradil", novy: true });
    const narok = db.dotazy.find((d) => /UPDATE club_incident_knowledge SET interrogation/.test(d.sql));
    expect(narok?.params).toEqual(["prozradil", DNES, "inc-1", "s", "tym-a"]);
    // Kritické následky (stopa) a vztahy jdou ve dvou oddělených dávkách (spec 7a).
    expect(db.davky).toHaveLength(2);
    const davka = db.davky.flat();
    expect(davka.find((d) => /UPDATE club_incident_clues SET found = 1/.test(d.sql))?.params).toEqual([DNES, "inc-1", "s"]);
    expect(davka.find((d) => /UPDATE relationships SET strength/.test(d.sql))?.params).toEqual([65, "v1"]);
  });

  it("kamarád, který kryje: stopa zůstane skrytá a kamarádství zesílí", async () => {
    const db = prostredi({
      role: [{ role: "kamarad", willingness: 0, interrogation: null }],
      hracOver: { coach_relationship: 0 },
      dalsi: [{ sql: /SELECT id, strength FROM relationships/, first: { id: "v1", strength: 60 } }],
    });
    expect(await zeptej(db)).toEqual({ vysledek: "kryje", novy: true });
    // "Kryje" nemá kritické následky (žádná stopa, žádné odhalení) - jen dávka vztahů.
    expect(db.davky).toHaveLength(1);
    const davka = db.davky.flat();
    expect(davka.some((d) => /club_incident_clues/.test(d.sql))).toBe(false);
    expect(davka.find((d) => /UPDATE relationships SET strength/.test(d.sql))?.params).toEqual([70, "v1"]);
  });

  it("kamarád, který práskne: kamarádství zeslábne a vznikne rivalita", async () => {
    const db = prostredi({
      role: [{ role: "kamarad", willingness: 100, interrogation: null }],
      hracOver: { coach_relationship: 100 },
      dalsi: [
        { sql: /type IN \(\?\)/, first: null },
        { sql: /SELECT id, strength FROM relationships/, first: { id: "v1", strength: 45 } },
      ],
    });
    expect((await zeptej(db))?.vysledek).toBe("prozradil");
    expect(db.davky).toHaveLength(2);
    const davka = db.davky.flat();
    expect(davka.find((d) => /UPDATE relationships SET strength/.test(d.sql))?.params).toEqual([25, "v1"]);
    expect(davka.find((d) => /INSERT INTO relationships/.test(d.sql))?.params.slice(1)).toEqual(["p", "s", "rivals", 40]);
  });

  it("kamarád, který práskne, když pachatel už v kádru není: kritická dávka jde, vztahy ne", async () => {
    const db = prostredi({
      role: [{ role: "kamarad", willingness: 100, interrogation: null }],
      hracOver: { coach_relationship: 100 },
      dalsi: [{ sql: /SELECT 1 AS ano FROM players WHERE id = \?/, first: null }],
    });
    expect((await zeptej(db))?.vysledek).toBe("prozradil");
    expect(db.dotazy.some((d) => /SELECT 1 AS ano FROM players/.test(d.sql))).toBe(true);
    expect(db.davky).toHaveLength(1);
    const davka = db.davky.flat();
    expect(davka.some((d) => /UPDATE club_incident_clues SET found = 1/.test(d.sql))).toBe(true);
    expect(davka.some((d) => /relationships/i.test(d.sql))).toBe(false);
  });

  it("pachatel se stopou na sebe se přizná: odhalení, lhůta a stopa přiznání", async () => {
    const db = new FalesnaD1([
      { sql: /FROM club_incidents WHERE id = \? AND team_id = \?/, first: incidentRadek() },
      { sql: /SELECT role, willingness, interrogation FROM club_incident_knowledge/, all: [{ role: "pachatel", willingness: 0, interrogation: null }] },
      { sql: /FROM players WHERE id = \? AND team_id = \?/, first: hracRadek("p", "Pepa", "Průšvih", {
        personality: JSON.stringify({ discipline: 100, temper: 0 }), coach_relationship: 100,
      }) },
      { sql: /SELECT COUNT\(\*\) AS n FROM relationships/, first: { n: 0 } },
      { sql: /FROM club_incident_clues WHERE incident_id/, all: [{
        id: "c1", source: "soused", points_to_player_id: null, suspects: JSON.stringify(["p", "s"]), holder_player_id: null,
        strength: 1, police_bonus: 0.15, text: "Soused.", found: 1,
      }] },
    ]);
    expect(await zeptej(db, "p")).toEqual({ vysledek: "priznal", novy: true });
    // Pachatel obviňuje sám sebe (playerId === culprit_player_id), vztahy se pro něj neposouvají.
    expect(db.davky).toHaveLength(1);
    const davka = db.davky.flat();
    expect(davka.find((d) => /UPDATE club_incidents SET culprit_revealed = 1/.test(d.sql))?.params)
      .toEqual(["2026-09-21T16:00:00.000Z", "inc-1", "tym-a"]);
    expect(davka.some((d) => /INSERT OR IGNORE INTO club_incident_clues/.test(d.sql) && d.params[3] === "priznani")).toBe(true);
  });

  it("uložený výsledek se jen vrátí, nic se nepočítá znovu", async () => {
    const db = prostredi({ role: [{ role: "svedek", willingness: 50, interrogation: "kryje" }] });
    expect(await zeptej(db)).toEqual({ vysledek: "kryje", novy: false });
    expect(db.pocet(/UPDATE club_incident_knowledge/)).toBe(0);
    expect(db.davky).toHaveLength(0);
  });

  it("uložený prozradil u neodhaleného incidentu znovu pošle UPDATE stopy, ale žádný posun vztahu", async () => {
    const db = prostredi({ role: [{ role: "kamarad", willingness: 100, interrogation: "prozradil" }] });
    expect(await zeptej(db)).toEqual({ vysledek: "prozradil", novy: false });
    expect(db.pocet(/UPDATE club_incident_knowledge SET interrogation/)).toBe(0);
    expect(db.davky).toHaveLength(1);
    const davka = db.davky.flat();
    expect(davka.find((d) => /UPDATE club_incident_clues SET found = 1/.test(d.sql))?.params).toEqual([DNES, "inc-1", "s"]);
    expect(davka.some((d) => /relationships/i.test(d.sql))).toBe(false);
  });

  it("odhalený incident ani hráč bez tajné znalosti se nevyslýchá", async () => {
    expect(await zeptej(prostredi({ incident: incidentRadek({ culprit_revealed: 1 }), role: [{ role: "svedek", willingness: 50, interrogation: null }] }))).toBeNull();
    expect(await zeptej(prostredi({ role: [] }))).toBeNull();
  });

  it("souběh: výsledek zabral jiný požadavek, následky se neprovedou", async () => {
    const db = prostredi({
      role: [{ role: "rival", willingness: 100, interrogation: null }],
      dalsi: [{ sql: /UPDATE club_incident_knowledge SET interrogation/, changes: 0 }],
    });
    expect(await zeptej(db)).toBeNull();
    expect(db.davky).toHaveLength(0);
  });
});
