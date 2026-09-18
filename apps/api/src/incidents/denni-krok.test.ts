/**
 * Testy denního kroku (denni-krok.ts): zejména zařazení losování pozitivního incidentu
 * (spec 4d, 4e, Task 5) - vlastní rng stream, běh po všem ostatním, vynechání ve dnech,
 * kdy funkce skončí dřív kvůli útěku nebo splněné hrozbě, a odvozené id pro omluvný dopis.
 *
 * Všechny sousední moduly jsou mockované: denni-krok.ts je jen orchestrace, skutečná
 * losovací logika (losovani.ts) a katalog mají vlastní testy jinde.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../generators/rng", () => ({ createRng: vi.fn((seed: unknown) => ({ seed })) }));
vi.mock("../lib/seed", () => ({ seedFromString: vi.fn((s: string) => s) }));
vi.mock("./vysetrovani-den", () => ({ zpracujVysetrovani: vi.fn(async () => undefined) }));
vi.mock("./krivda", () => ({ ozviSeObvineni: vi.fn(async () => undefined) }));
vi.mock("./bazar-db", () => ({ vystavKradeneZbozi: vi.fn(async () => undefined) }));
vi.mock("./stav-klubu", () => ({ nactiStavKlubu: vi.fn() }));
vi.mock("./situace-db", () => ({
  ukonciSituace: vi.fn(async () => 0),
  propadleZalohy: vi.fn(async () => 0),
  zretezDluhy: vi.fn(async () => false),
  zalozSituaci: vi.fn(async () => null),
}));
vi.mock("./situace", () => ({ vylosujSituaci: vi.fn(() => null) }));
vi.mock("./utek-db", () => ({ zpracujUtek: vi.fn(async () => false) }));
vi.mock("./hrozi-db", () => ({ vyhodnotHrozici: vi.fn(async () => 0) }));
vi.mock("./losovani", () => ({ vylosujIncident: vi.fn(() => null), vylosujPozitivni: vi.fn(() => null) }));
vi.mock("./dopady", () => ({ zapisIncident: vi.fn(async () => null), oznamIncident: vi.fn(async () => undefined) }));

import type { Bindings } from "../index";
import { vystavKradeneZbozi } from "./bazar-db";
import { zpracujIncidentyDne } from "./denni-krok";
import { oznamIncident, zapisIncident } from "./dopady";
import { vyhodnotHrozici } from "./hrozi-db";
import { ozviSeObvineni } from "./krivda";
import { vylosujIncident, vylosujPozitivni } from "./losovani";
import { vylosujSituaci } from "./situace";
import { propadleZalohy, ukonciSituace, zalozSituaci, zretezDluhy } from "./situace-db";
import { nactiStavKlubu } from "./stav-klubu";
import { FalesnaD1, jakoD1 } from "./testovaci-d1";
import { stavKlubu } from "./testovaci-stav";
import type { NavrhIncidentu } from "./typy";
import { zpracujUtek } from "./utek-db";
import { zpracujVysetrovani } from "./vysetrovani-den";

const DEN = "2026-09-16";
const DNES = `${DEN}T16:00:00.000Z`;
const TEAM = { id: "tym-a", league_id: "liga-1" };

function prostredi() {
  const db = new FalesnaD1([{ sql: /FROM seasons/, first: { number: 4 } }]);
  return { db, env: { DB: jakoD1(db) } as unknown as Bindings };
}

function navrh(kind: string, over: Partial<NavrhIncidentu> = {}): NavrhIncidentu {
  return {
    kind, category: "pozitivni", status: "uzavreny", severity: 1,
    culpritType: "nikdo", culpritPlayerId: null, culpritRevealed: false,
    ztraty: [], text: "Text.",
    ...over,
  };
}

/**
 * `resetAllMocks` (ne jen `clearAllMocks`): `mockReturnValue`/`mockResolvedValue` nastavené
 * v jednom testu by jinak přežily do dalšího (clearAllMocks maže jen historii volání, ne
 * implementaci). Proto se výchozí chování musí po resetu nastavit znovu explicitně - včetně
 * funkcí volaných přes `.catch(...)`, které bez vlastní implementace nejsou "thenable" a `.catch`
 * by na nich spadlo.
 */
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(nactiStavKlubu).mockResolvedValue(stavKlubu({ den: DEN, gameDate: DNES }));
  vi.mocked(zpracujVysetrovani).mockResolvedValue({ policie: 0, uzavreno: 0, srazky: 0 });
  vi.mocked(ozviSeObvineni).mockResolvedValue(0);
  vi.mocked(vystavKradeneZbozi).mockResolvedValue(0);
  vi.mocked(ukonciSituace).mockResolvedValue(0);
  vi.mocked(propadleZalohy).mockResolvedValue(0);
  vi.mocked(zretezDluhy).mockResolvedValue(false);
  vi.mocked(zpracujUtek).mockResolvedValue(false);
  vi.mocked(vyhodnotHrozici).mockResolvedValue(0);
  vi.mocked(zalozSituaci).mockResolvedValue(null);
  vi.mocked(vylosujIncident).mockReturnValue(null);
  vi.mocked(vylosujSituaci).mockReturnValue(null);
  vi.mocked(vylosujPozitivni).mockReturnValue(null);
  vi.mocked(zapisIncident).mockResolvedValue(null);
  vi.mocked(oznamIncident).mockResolvedValue(undefined);
});

describe("denní krok: pozitivní incident", () => {
  it("los běží s vlastním rng streamem, odděleným od losu problému a situace", async () => {
    const { env } = prostredi();
    await zpracujIncidentyDne(env, TEAM, DNES);

    expect(vylosujPozitivni).toHaveBeenCalledTimes(1);
    const rngPozitivni = vi.mocked(vylosujPozitivni).mock.calls[0][1];
    const rngIncident = vi.mocked(vylosujIncident).mock.calls[0][1];
    expect(rngPozitivni).toEqual({ seed: `pozitivni|tym-a|${DEN}` });
    expect(rngIncident).toEqual({ seed: `incident|tym-a|${DEN}` });
    expect(rngPozitivni).not.toBe(rngIncident);
  });

  it("nic se nezapíše, když los nevrátí kandidáta", async () => {
    const { env } = prostredi();
    await zpracujIncidentyDne(env, TEAM, DNES);
    expect(zapisIncident).not.toHaveBeenCalled();
    expect(oznamIncident).not.toHaveBeenCalled();
  });

  it("pozitivní incident se zapíše a oznámí, když los něco vrátí", async () => {
    const n = navrh("hrdina");
    vi.mocked(vylosujPozitivni).mockReturnValue(n);
    vi.mocked(zapisIncident).mockResolvedValue({ id: "inc-poz-1", nalezeneStopy: [], odhalen: false });
    const { env } = prostredi();

    await zpracujIncidentyDne(env, TEAM, DNES);

    expect(zapisIncident).toHaveBeenCalledWith(env.DB, expect.anything(), n, undefined);
    expect(oznamIncident).toHaveBeenCalledWith(env, "tym-a", n, { id: "inc-poz-1", nalezeneStopy: [], odhalen: false });
  });

  it("pozitivní incident padne i ve dni, kdy padl problém - nesoupeří o stejnou zprávu dne", async () => {
    const problem = navrh("vloupani_sklad", { category: "kradez", status: "otevreny" });
    const pozitivni = navrh("dedictvi");
    vi.mocked(vylosujIncident).mockReturnValue(problem);
    vi.mocked(vylosujPozitivni).mockReturnValue(pozitivni);
    vi.mocked(zapisIncident)
      .mockResolvedValueOnce({ id: "inc-problem", nalezeneStopy: [], odhalen: false })
      .mockResolvedValueOnce({ id: "inc-poz", nalezeneStopy: [], odhalen: false });
    const { env } = prostredi();

    await zpracujIncidentyDne(env, TEAM, DNES);

    expect(zapisIncident).toHaveBeenCalledTimes(2);
    expect(oznamIncident).toHaveBeenCalledTimes(2);
    expect(oznamIncident).toHaveBeenNthCalledWith(1, env, "tym-a", problem, expect.objectContaining({ id: "inc-problem" }));
    expect(oznamIncident).toHaveBeenNthCalledWith(2, env, "tym-a", pozitivni, expect.objectContaining({ id: "inc-poz" }));
  });

  it("pozitivní incident padne i ve dni, kdy padla životní situace", async () => {
    vi.mocked(vylosujSituaci).mockReturnValue(navrh("nemoc", { category: "zivotni", subjectPlayerId: "h1" }));
    vi.mocked(vylosujPozitivni).mockReturnValue(navrh("anonymni_obalka"));
    vi.mocked(zapisIncident).mockResolvedValue({ id: "inc-poz", nalezeneStopy: [], odhalen: false });
    const { env } = prostredi();

    await zpracujIncidentyDne(env, TEAM, DNES);

    expect(vylosujSituaci).toHaveBeenCalledTimes(1);
    expect(vylosujPozitivni).toHaveBeenCalledTimes(1);
    expect(oznamIncident).toHaveBeenCalledTimes(1);
  });

  it("pozitivní incident padne i ve dni, kdy se problém neztloskoval, ale dluhy se řetězily (zretezeno)", async () => {
    vi.mocked(zretezDluhy).mockResolvedValue(true);
    vi.mocked(vylosujPozitivni).mockReturnValue(navrh("anonymni_obalka"));
    vi.mocked(zapisIncident).mockResolvedValue({ id: "inc-poz", nalezeneStopy: [], odhalen: false });
    const { env } = prostredi();

    await zpracujIncidentyDne(env, TEAM, DNES);

    // Řetězení dluhů blokuje jen situaci (limit jedné za den), ne pozitivní los.
    expect(vylosujSituaci).not.toHaveBeenCalled();
    expect(vylosujPozitivni).toHaveBeenCalledTimes(1);
    expect(oznamIncident).toHaveBeenCalledTimes(1);
  });

  it("los se NESPUSTÍ, když klub utekl s penězi - útěk je jediná zpráva dne", async () => {
    vi.mocked(zpracujUtek).mockResolvedValue(true);
    const { env } = prostredi();

    await zpracujIncidentyDne(env, TEAM, DNES);

    expect(vylosujPozitivni).not.toHaveBeenCalled();
  });

  it("los se NESPUSTÍ, když se splnila hrozba z hospody - to je jediná zpráva dne", async () => {
    vi.mocked(vyhodnotHrozici).mockResolvedValue(1);
    const { env } = prostredi();

    await zpracujIncidentyDne(env, TEAM, DNES);

    expect(vylosujPozitivni).not.toHaveBeenCalled();
  });

  it("omluvný dopis dostane odvozené id z útěku, ne výchozí id dne", async () => {
    const utek = { id: "inc-tym-a-utek_s_penezi-2026-01-01", castka: 10000 };
    vi.mocked(nactiStavKlubu).mockResolvedValue(stavKlubu({ den: DEN, gameDate: DNES, utekBezDopisu: utek }));
    const n = navrh("omluvny_dopis", { ztraty: [{ typ: "dar", castka: 3000 }] });
    vi.mocked(vylosujPozitivni).mockReturnValue(n);
    vi.mocked(zapisIncident).mockResolvedValue({ id: `dopis-${utek.id}`, nalezeneStopy: [], odhalen: false });
    const { env } = prostredi();

    await zpracujIncidentyDne(env, TEAM, DNES);

    expect(zapisIncident).toHaveBeenCalledWith(env.DB, expect.objectContaining({ utekBezDopisu: utek }), n, `dopis-${utek.id}`);
  });

  it("ostatních sedm pozitivních incidentů jde s výchozím id dne (žádné id navíc)", async () => {
    const n = navrh("anonymni_obalka");
    vi.mocked(vylosujPozitivni).mockReturnValue(n);
    vi.mocked(zapisIncident).mockResolvedValue({ id: "inc-tym-a-anonymni_obalka-2026-09-16", nalezeneStopy: [], odhalen: false });
    const { env } = prostredi();

    await zpracujIncidentyDne(env, TEAM, DNES);

    expect(zapisIncident).toHaveBeenCalledWith(env.DB, expect.anything(), n, undefined);
  });

  it("dopis ke stejnému útěku podruhé nevznikne: odvozené id je stejné napříč dny, druhý zápis je no-op", async () => {
    const utek = { id: "inc-tym-a-utek_s_penezi-2026-01-01", castka: 10000 };
    const n = navrh("omluvny_dopis", { ztraty: [{ typ: "dar", castka: 3000 }] });
    vi.mocked(vylosujPozitivni).mockReturnValue(n);
    vi.mocked(zapisIncident)
      .mockResolvedValueOnce({ id: `dopis-${utek.id}`, nalezeneStopy: [], odhalen: false })
      // Druhý pokus: INSERT OR IGNORE na stejné id nic nezměnil, řádek už existuje.
      .mockResolvedValueOnce(null);

    vi.mocked(nactiStavKlubu).mockResolvedValue(stavKlubu({ den: DEN, gameDate: DNES, utekBezDopisu: utek }));
    const { env: env1 } = prostredi();
    await zpracujIncidentyDne(env1, TEAM, DNES);

    // Jiný herní den, ale stejný útěk bez dopisu (obrana do hloubky - kdyby vyřazení
    // útěku s dopisem v nactiStavKlubu selhalo nebo se zpozdilo).
    const DEN2 = "2026-09-17";
    const DNES2 = `${DEN2}T16:00:00.000Z`;
    vi.mocked(nactiStavKlubu).mockResolvedValue(stavKlubu({ den: DEN2, gameDate: DNES2, utekBezDopisu: utek }));
    const { env: env2 } = prostredi();
    await zpracujIncidentyDne(env2, TEAM, DNES2);

    expect(zapisIncident).toHaveBeenCalledTimes(2);
    const id1 = vi.mocked(zapisIncident).mock.calls[0][3];
    const id2 = vi.mocked(zapisIncident).mock.calls[1][3];
    expect(id1).toBe(`dopis-${utek.id}`);
    expect(id2).toBe(`dopis-${utek.id}`);
    expect(id1).toBe(id2);
    // Druhý dopis se nezapsal (zapisIncident vrátil null), takže se ani neoznámil.
    expect(oznamIncident).toHaveBeenCalledTimes(1);
  });
});
