import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../messaging/system-sms", () => ({ sendPlayerSMS: vi.fn(async () => "konv-1"), sendSystemSMS: vi.fn(async () => undefined) }));
vi.mock("../messaging/ai-player-spawn", () => ({ getOrCreatePlayerConversation: vi.fn(async () => "konv-1") }));
vi.mock("../lib/ai-provider", () => ({ isAiEnabled: vi.fn(async () => true) }));
vi.mock("../season/finance-processor", () => ({ recordTransaction: vi.fn(async () => 1000) }));

import type { Bindings } from "../index";
import { recordTransaction } from "../season/finance-processor";
import { sendPlayerSMS } from "../messaging/system-sms";
import { propadleZalohy, rozhodniZalohu, ukonciSituace, zalozSituaci, zretezDluhy } from "./situace-db";
import { FalesnaD1, jakoD1, type Pravidlo } from "./testovaci-d1";
import { hrac, incidentRadek, stavKlubu } from "./testovaci-stav";
import type { NavrhIncidentu } from "./typy";

const DNES = "2026-09-17T16:00:00.000Z";
const SUBJEKT = hrac({ id: "s", jmeno: "Jan Svědek", vek: 30, alkohol: 70 });
const PARTA = hrac({ id: "k", jmeno: "Karel Vrba", vek: 28, alkohol: 80 });

const navrh = (over: Partial<NavrhIncidentu> = {}): NavrhIncidentu => ({
  kind: "dluhy", category: "zivotni", status: "probiha", severity: 1,
  culpritType: "nikdo", culpritPlayerId: null, culpritRevealed: false,
  subjectPlayerId: "s", dniTrvani: 30, ztraty: [], text: "Jan Svědek se dostal do dluhů.", ...over,
});

function prostredi(dalsi: Pravidlo[] = []) {
  const db = new FalesnaD1([
    ...dalsi,
    { sql: /SELECT id, first_name, last_name, nickname, avatar FROM players/, first: { id: "s", first_name: "Jan", last_name: "Svědek", nickname: null, avatar: null } },
    { sql: /FROM staff_members/, first: { usudek: null } },
  ]);
  return { db, env: { DB: jakoD1(db) } as unknown as Bindings };
}

beforeEach(() => vi.clearAllMocks());

describe("založení situace", () => {
  it("dluhy: lhůta na zálohu, SMS hráče a vlákno v chatu", async () => {
    const { db, env } = prostredi();
    const stav = stavKlubu({ gameDate: DNES, den: "2026-09-17", kadr: [SUBJEKT, PARTA] });
    expect(await zalozSituaci(env, stav, navrh())).toMatch(/^inc-/);
    const lhuta = db.dotazy.find((d) => /UPDATE club_incidents SET deadline/.test(d.sql));
    expect(lhuta?.sql).toContain("deadline IS NULL");
    expect(sendPlayerSMS).toHaveBeenCalledWith(expect.anything(), "tym-a", expect.objectContaining({ id: "s" }), expect.stringContaining("zálohu"), expect.objectContaining({ type: "incident" }));
    expect(db.pocet(/UPDATE conversations SET ai_thread_active/)).toBe(1);
  });

  it("narození dítěte založí incidentní absenci ohlášenou dopředu, rozvod stěhování", async () => {
    const { db, env } = prostredi();
    const stav = stavKlubu({ gameDate: DNES, den: "2026-09-17", kadr: [SUBJEKT] });
    await zalozSituaci(env, stav, navrh({ kind: "narozeni_ditete", dniTrvani: 4, text: "Jan Svědek čeká narození dítěte." }));
    const abs = db.davky.flat().find((d) => /INSERT OR IGNORE INTO club_incident_absences/.test(d.sql));
    expect(abs?.params).toContain("porod");
    // od_dne je aspoň dva dny po ohlášení (spec 17a)
    const od = String(abs?.params[5]);
    expect(od >= "2026-09-19").toBe(true);
  });

  it("svatba dá kocovinu jen pijákům z kádru, ženich nepije za trest", async () => {
    const { db, env } = prostredi();
    const stav = stavKlubu({ gameDate: DNES, den: "2026-09-17", kadr: [SUBJEKT, PARTA, hrac({ id: "a", jmeno: "Abstinent Nový", alkohol: 20 })] });
    await zalozSituaci(env, stav, navrh({ kind: "svatba_spoluhrace", dniTrvani: 1, text: "Jan Svědek se ženil." }));
    const kondice = db.davky.flat().filter((d) => /json_set\(life_context, '\$\.condition'/.test(d.sql));
    expect(kondice.map((d) => d.params[d.params.length - 1])).toEqual(["k"]);
  });
});

describe("dluhy po ztrátě práce", () => {
  // Losy jsou pevné: seed `dluhy-po-praci|<id>`. Prvnímu vyjde 0,217 (< 0,3) a den +6,
  // druhému 0,700, takže dluhy nepřijdou nikdy.
  const ZDROJ_ANO = "inc-tym-a-prisel_o_praci-2026-09-10";
  const ZDROJ_NE = "inc-tym-a-prisel_o_praci-2026-09-11";
  const zdroj = (id: string) => ({ id, subject_player_id: "s", game_date: "2026-09-10T16:00:00.000Z" });
  const praceRule = (id: string): Pravidlo => ({ sql: /kind = 'prisel_o_praci'/, all: [zdroj(id)] });
  const stav = (over: Partial<Parameters<typeof stavKlubu>[0]> = {}) => stavKlubu({
    gameDate: "2026-09-16T16:00:00.000Z", den: "2026-09-16", kadr: [SUBJEKT, PARTA],
    situace: new Map([["s", "prisel_o_praci"]]), ...over,
  });
  const insert = (db: FalesnaD1) => db.dotazy.find((d) => /INSERT OR IGNORE INTO club_incidents/.test(d.sql));

  it("v den, na který los padl, hráč dostane dluhy", async () => {
    const { db, env } = prostredi([praceRule(ZDROJ_ANO)]);
    expect(await zretezDluhy(env, stav())).toBe(true);
    expect(insert(db)?.params).toContain(`${ZDROJ_ANO}-dluhy`);
    expect(insert(db)?.params).toContain("dluhy");
    expect(insert(db)?.params).toContain("s");
    expect(sendPlayerSMS).toHaveBeenCalled();
  });

  it("řetězení zavře původní ztrátu práce, ať hráč nedrží dva sloty naráz", async () => {
    const { db, env } = prostredi([praceRule(ZDROJ_ANO)]);
    expect(await zretezDluhy(env, stav())).toBe(true);
    const uzavreni = db.dotazy.find((d) => /resolution = 'prerostla_v_dluhy'/.test(d.sql));
    expect(uzavreni?.sql).toContain("status = 'probiha'");
    expect(uzavreni?.params).toEqual(["2026-09-16T16:00:00.000Z", ZDROJ_ANO, "tym-a"]);
  });

  it("jiný den než vylosovaný nic nedělá", async () => {
    const { db, env } = prostredi([praceRule(ZDROJ_ANO)]);
    expect(await zretezDluhy(env, stav({ gameDate: "2026-09-15T16:00:00.000Z", den: "2026-09-15" }))).toBe(false);
    expect(insert(db)).toBeUndefined();
  });

  it("los, který nepadl, dluhy nepřinese ani jeden den", async () => {
    for (let i = 0; i <= 8; i++) {
      const { db, env } = prostredi([praceRule(ZDROJ_NE)]);
      const den = `2026-09-${String(10 + i).padStart(2, "0")}`;
      expect(await zretezDluhy(env, stav({ gameDate: `${den}T16:00:00.000Z`, den }))).toBe(false);
      expect(insert(db)).toBeUndefined();
    }
  });

  it("plný limit klubu, cooldown druhu ani odchod hráče řetězení nevynutí", async () => {
    const plno = new Map([["s", "prisel_o_praci"], ["k", "rozvod"]]);
    const { db, env } = prostredi([praceRule(ZDROJ_ANO)]);
    expect(await zretezDluhy(env, stav({ situace: plno }))).toBe(false);

    const cooldown = prostredi([praceRule(ZDROJ_ANO)]);
    expect(await zretezDluhy(cooldown.env, stav({ posledniVyskyt: { dluhy: "2026-09-05" } }))).toBe(false);

    const pryc = prostredi([praceRule(ZDROJ_ANO)]);
    expect(await zretezDluhy(pryc.env, stav({ kadr: [PARTA] }))).toBe(false);
    expect([insert(db), insert(cooldown.db), insert(pryc.db)]).toEqual([undefined, undefined, undefined]);
  });

  it("druhý průchod týmž dnem už nic nepřidá", async () => {
    const { db, env } = prostredi([praceRule(ZDROJ_ANO), { sql: /INSERT OR IGNORE INTO club_incidents/, changes: 0 }]);
    expect(await zretezDluhy(env, stav())).toBe(false);
    expect(db.pocet(/UPDATE club_incidents SET deadline/)).toBe(0);
    expect(sendPlayerSMS).not.toHaveBeenCalled();
  });
});

describe("konec situace a propadlá lhůta zálohy", () => {
  it("situace s ends_on do dneška se uzavře jako skončila", async () => {
    const { db, env } = prostredi([{ sql: /status = 'uzavreny', resolution = 'skoncila'/, all: [{ id: "inc-1", kind: "rozvod", subject_player_id: "s" }] }]);
    expect(await ukonciSituace(env, { teamId: "tym-a", gameDate: DNES })).toBe(1);
    const dotaz = db.dotazy.find((d) => /resolution = 'skoncila'/.test(d.sql));
    expect(dotaz?.sql).toContain("status = 'probiha'");
    expect(dotaz?.sql).toContain("ends_on <= ?");
  });

  it("situace prodaného hráče se uzavře taky, ať klubu nedrží slot", async () => {
    const { db, env } = prostredi([{ sql: /resolution = 'hrac_odesel'/, all: [{ id: "inc-2", kind: "dluhy", subject_player_id: "pryc" }] }]);
    expect(await ukonciSituace(env, { teamId: "tym-a", gameDate: DNES })).toBe(1);
    const dotaz = db.dotazy.find((d) => /resolution = 'hrac_odesel'/.test(d.sql));
    expect(dotaz?.sql).toContain("status = 'probiha'");
    expect(dotaz?.sql).toContain("NOT EXISTS");
    expect(dotaz?.sql).toContain("p.team_id = club_incidents.team_id");
    expect(dotaz?.params).toEqual([DNES, "tym-a"]);
  });

  it("hráče, který v kádru pořád je, neuzavírá (druhý průchod dnem nic nepřidá)", async () => {
    const { db, env } = prostredi();
    expect(await ukonciSituace(env, { teamId: "tym-a", gameDate: DNES })).toBe(0);
    expect(db.pocet(/resolution = 'hrac_odesel'/)).toBe(1);
  });

  it("nerozhodnutá záloha po lhůtě propadne jako odmítnutí", async () => {
    const { db, env } = prostredi([{ sql: /FROM club_incidents\s+WHERE team_id = \? AND status = 'probiha' AND kind = 'dluhy'/, all: [{ id: "inc-1", subject_player_id: "s" }] }]);
    expect(await propadleZalohy(env, { teamId: "tym-a", gameDate: DNES })).toBe(1);
    const zapis = db.dotazy.find((d) => /\$\.zaloha/.test(d.sql) && /UPDATE club_incidents/.test(d.sql));
    expect(zapis?.sql).toContain("json_extract(resolution_data, '$.zaloha') IS NULL");
    expect(sendPlayerSMS).toHaveBeenCalled();
  });
});

describe("rozhodnutí o záloze", () => {
  const dluhy = incidentRadek({ id: "inc-1", kind: "dluhy", category: "zivotni", status: "probiha", culprit_type: null, culprit_player_id: null, loss: "[]" });

  it("půjčka strhne peníze, nastaví splátky a pošle SMS", async () => {
    const { db, env } = prostredi([
      { sql: /FROM club_incidents WHERE id = \? AND team_id = \?/, first: { ...dluhy, subject_player_id: "s" } },
      { sql: /SELECT game_date FROM teams/, first: { game_date: DNES } },
    ]);
    const r = await rozhodniZalohu(env, "tym-a", "inc-1", "pujcit");
    expect(r).toMatchObject({ ok: true });
    const castka = r.ok ? r.castka ?? 0 : 0;
    expect(castka).toBeGreaterThanOrEqual(3000);
    expect(castka).toBeLessThanOrEqual(8000);
    expect(recordTransaction).toHaveBeenCalledWith(expect.anything(), "tym-a", "incident_advance", -castka, expect.stringContaining("Záloha"), DNES, "zaloha-inc-1");
    const zapis = db.dotazy.find((d) => /UPDATE club_incidents SET resolution_data/.test(d.sql));
    expect(zapis?.sql).toContain("json_extract(resolution_data, '$.zaloha') IS NULL");
    expect(zapis?.sql).toContain("status = 'probiha'");
  });

  it("když výplata selže, nárok se vrátí a splátky se nenaplánují", async () => {
    const { db, env } = prostredi([
      { sql: /FROM club_incidents WHERE id = \? AND team_id = \?/, first: { ...dluhy, subject_player_id: "s" } },
      { sql: /SELECT game_date FROM teams/, first: { game_date: DNES } },
    ]);
    vi.mocked(recordTransaction).mockRejectedValueOnce(new Error("transakce se nezapsala"));

    expect(await rozhodniZalohu(env, "tym-a", "inc-1", "pujcit")).toMatchObject({ ok: false, kod: 500 });
    const vraceni = db.dotazy.find((d) => /UPDATE club_incidents SET resolution_data = NULL/.test(d.sql));
    expect(vraceni?.sql).toContain("json_extract(resolution_data, '$.zaloha') = 'pujceno'");
    expect(vraceni?.params).toEqual(["inc-1", "tym-a"]);
    // Žádné splátky, žádná odměna za půjčku, žádná SMS o vyplacené záloze.
    expect(db.dotazy.filter((d) => /tydnuZbyva/.test(JSON.stringify(d.params))).length).toBe(1);
    expect(sendPlayerSMS).not.toHaveBeenCalled();
  });

  it("odmítnutí nesahá na peníze a druhé rozhodnutí je 409", async () => {
    const { db, env } = prostredi([
      { sql: /FROM club_incidents WHERE id = \? AND team_id = \?/, first: { ...dluhy, subject_player_id: "s" } },
      { sql: /SELECT game_date FROM teams/, first: { game_date: DNES } },
      { sql: /UPDATE club_incidents SET resolution_data/, changes: 0 },
    ]);
    expect(await rozhodniZalohu(env, "tym-a", "inc-1", "odmitnout")).toMatchObject({ ok: false, kod: 409 });
    expect(recordTransaction).not.toHaveBeenCalled();
    expect(db.pocet(/UPDATE club_incidents SET resolution_data/)).toBe(1);
  });

  it("u jiného než dluhového incidentu 409", async () => {
    const { env } = prostredi([
      { sql: /FROM club_incidents WHERE id = \? AND team_id = \?/, first: incidentRadek() },
      { sql: /SELECT game_date FROM teams/, first: { game_date: DNES } },
    ]);
    expect(await rozhodniZalohu(env, "tym-a", "inc-1", "pujcit")).toMatchObject({ ok: false, kod: 409 });
  });
});
