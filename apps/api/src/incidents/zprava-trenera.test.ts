import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./vyslech", () => ({ vyslechni: vi.fn(async () => ({ vysledek: "kryje", novy: true })) }));
vi.mock("../messaging/coach-commitments", () => ({ recordInquiryTask: vi.fn(async () => "task-1") }));
vi.mock("./restitution", () => ({ tryRestitution: vi.fn(async () => null) }));

import { FalesnaD1, jakoD1, type Pravidlo } from "./testovaci-d1";
import { recordInquiryTask } from "../messaging/coach-commitments";
import { tryRestitution } from "./restitution";
import { vyslechni } from "./vyslech";
import { zpracujZpravuTrenera } from "./zprava-trenera";

const DNES = "2026-09-16T16:00:00.000Z";
const DRESY = JSON.stringify([{ typ: "vybaveni", kategorie: "jerseys", uroven: 2, stav: 70, urovniDolu: 2 }]);

function db(stav: unknown, dalsi: Pravidlo[] = []) {
  return new FalesnaD1([
    ...dalsi,
    { sql: /FROM conversations c JOIN teams t/, first: { ai_thread_state: stav === null ? null : JSON.stringify(stav), game_date: DNES, sezona: 4 } },
    { sql: /FROM club_incidents\s+WHERE team_id = \?/, all: [{ id: "inc-2", kind: "vandal", loss: "[]" }, { id: "inc-1", kind: "vloupani_sklad", loss: DRESY }] },
  ]);
}

const zprava = (d: FalesnaD1, text: string) =>
  zpracujZpravuTrenera(jakoD1(d), { teamId: "tym-a", convId: "konv-1", playerId: "s", text });

beforeEach(() => vi.clearAllMocks());

describe("zpráva trenéra hráči", () => {
  it("téma z tlačítka platí celý herní den i bez klíčových slov", async () => {
    const d = db({ incidentId: "inc-1", incidentDen: "2026-09-16" });
    expect(await zprava(d, "A kde přesně?")).toEqual({ incidentId: "inc-1", vyslech: "kryje" });
    expect(d.pocet(/FROM club_incidents/)).toBe(0);
    expect(vyslechni).toHaveBeenCalledWith(expect.anything(), { teamId: "tym-a", incidentId: "inc-1", playerId: "s", gameDate: DNES });
  });

  it("včerejší téma neplatí, otázka na věc najde incident a uloží ho do vlákna", async () => {
    const d = db({ awaiting: "coach", incidentId: "inc-9", incidentDen: "2026-09-15" });
    expect(await zprava(d, "Kam zmizely dresy?")).toEqual({ incidentId: "inc-1", vyslech: "kryje" });
    const tema = d.dotazy.find((q) => /UPDATE conversations SET ai_thread_state = CASE WHEN ai_thread_active = 1/.test(q.sql));
    // Obě větve: json_set pro běžící vlákno, json_object pro nahrazení starého stavu.
    expect(tema?.sql).toContain("json_set");
    expect(tema?.sql).toContain("json_object");
    expect(tema?.params).toEqual(["inc-1", "2026-09-16", "inc-1", "2026-09-16", "konv-1"]);
  });

  it("běžná zpráva nic nenastaví a nikoho nevyslýchá", async () => {
    const d = db(null);
    expect(await zprava(d, "Zdar, jak se máš?")).toBeNull();
    expect(d.pocet(/UPDATE conversations/)).toBe(0);
    expect(vyslechni).not.toHaveBeenCalled();
  });

  it("hledá jen otevřené neodhalené krádeže a poškození aktuální sezóny", async () => {
    const d = db(null);
    expect((await zprava(d, "Kdo to byl?"))?.incidentId).toBe("inc-2");
    const dotaz = d.dotazy.find((q) => /FROM club_incidents/.test(q.sql));
    expect(dotaz?.params).toEqual(["tym-a", 4]);
    expect(dotaz?.sql).toContain("culprit_revealed = 0");
    expect(dotaz?.sql).toContain("status IN ('otevreny', 'policie')");
  });

  it("řeči z hospody: zpráva hráči, který ohlásil čin, nastaví téma a zapíše rozhovor", async () => {
    vi.mocked(vyslechni).mockResolvedValueOnce(null);
    const d = db(null, [{ sql: /status = 'hrozi' AND culprit_player_id = \?/, first: { id: "inc-h", kind: "vitrina" } }]);
    expect(await zprava(d, "Co to bylo včera v hospodě za řeči?")).toEqual({ incidentId: "inc-h", vyslech: null });
    expect(d.dotazy.find((q) => /UPDATE conversations/.test(q.sql))?.params.slice(0, 2)).toEqual(["inc-h", "2026-09-16"]);
    expect(d.dotazy.find((q) => /\$\.promluvil/.test(q.sql))?.params).toEqual(["2026-09-16", "inc-h", "tym-a", "s"]);
  });

  it("hráč bez ohlášeného činu: řeči o hospodě nic nenastaví", async () => {
    const d = db(null);
    expect(await zprava(d, "Co to bylo včera v hospodě?")).toBeNull();
    expect(d.pocet(/UPDATE club_incidents/)).toBe(0);
    expect(d.pocet(/UPDATE conversations/)).toBe(0);
  });

  it("téma z tlačítka u hrozícího činu: výslech nic nevrátí, zapíše se rozhovor", async () => {
    vi.mocked(vyslechni).mockResolvedValueOnce(null);
    const d = db({ incidentId: "inc-h", incidentDen: "2026-09-16" });
    expect(await zprava(d, "Tak co, Franto?")).toEqual({ incidentId: "inc-h", vyslech: null });
    expect(d.pocet(/\$\.promluvil/)).toBe(1);
  });

  it("„nepoptal by ses mi, kdo by mohl vykrást tu kasu?“ najde kasu a založí úkol pátrání (Geomapping 19. 11.)", async () => {
    const cashLoss = JSON.stringify([{ typ: "penize", castka: 2528 }]);
    const d = new FalesnaD1([
      { sql: /FROM conversations c JOIN teams t/, first: { ai_thread_state: null, game_date: DNES, sezona: 4 } },
      { sql: /FROM club_incidents\s+WHERE team_id = \?/, all: [{ id: "inc-party", kind: "oslava_v_kabine", loss: "[]" }, { id: "inc-cash", kind: "kasa_obcerstveni", loss: cashLoss }] },
    ]);
    const text = "Ahoj Tome, měl bych prosbu, nepoptal by ses mi, kdo by mohl vykrást tu kasu?";
    expect((await zprava(d, text))?.incidentId).toBe("inc-cash");
    expect(recordInquiryTask).toHaveBeenCalledWith(expect.anything(), {
      teamId: "tym-a", convId: "konv-1", playerId: "s", incidentId: "inc-cash", coachMessage: text,
    });
  });

  it("Hrdlička (E2E 22. 11.): otázka na odhalenou krádež, za kterou se mu strhává, založí téma a nikoho nevyslýchá", async () => {
    const d = new FalesnaD1([
      { sql: /FROM conversations c JOIN teams t/, first: { ai_thread_state: null, game_date: DNES, sezona: 4 } },
      // Otevřené neodhalené krádeže: žádná. Ta jeho je uzavřená se srážkou.
      { sql: /FROM club_incidents\s+WHERE team_id = \?/, all: [] },
      { sql: /FROM club_incidents i\s+WHERE i\.team_id = \?/, all: [{ id: "inc-sklad", kind: "vloupani_sklad", loss: DRESY }] },
    ]);
    expect(await zprava(d, "Tak co, ukradl jsi ty dresy, nebo ne?")).toEqual({ incidentId: "inc-sklad", vyslech: null });
    expect(d.dotazy.find((q) => /UPDATE conversations SET ai_thread_state/.test(q.sql))?.params.slice(0, 2)).toEqual(["inc-sklad", "2026-09-16"]);
    const dotaz = d.dotazy.find((q) => /FROM club_incidents i\s+WHERE/.test(q.sql));
    expect(dotaz?.sql).toContain("culprit_revealed = 1");
    expect(dotaz?.sql).toContain("json_each");
    expect(dotaz?.params).toEqual(["tym-a", 4, DNES, 60, "s", "s", "pachatel", "obvineny", "svedek", "kamarad", "rival", "s"]);
    expect(vyslechni).not.toHaveBeenCalled();
  });

  it("zapletený hráč a otázka o něčem jiném: žádné téma", async () => {
    const d = new FalesnaD1([
      { sql: /FROM conversations c JOIN teams t/, first: { ai_thread_state: null, game_date: DNES, sezona: 4 } },
      { sql: /FROM club_incidents\s+WHERE team_id = \?/, all: [] },
      { sql: /FROM club_incidents i\s+WHERE i\.team_id = \?/, all: [{ id: "inc-sklad", kind: "vloupani_sklad", loss: DRESY }] },
    ]);
    expect(await zprava(d, "Dorazíš v úterý na trénink?")).toBeNull();
    expect(d.pocet(/UPDATE conversations/)).toBe(0);
  });

  it("Procházka (E2E 22. 11.): zpráva, po které vrátil lup, se stává tématem (odpověď přijde)", async () => {
    vi.mocked(tryRestitution).mockResolvedValueOnce({ outcome: "returned", amount: 31696, incidentId: "inc-kasa" });
    const d = db(null);
    expect(await zprava(d, "Ptám se znovu. Dáš to klukům zpátky, nebo nic?")).toEqual({ incidentId: "inc-kasa", vyslech: null });
    expect(d.dotazy.find((q) => /UPDATE conversations SET ai_thread_state/.test(q.sql))?.params.slice(0, 2)).toEqual(["inc-kasa", "2026-09-16"]);
    expect(vyslechni).not.toHaveBeenCalled();
  });

  it("odhalený pachatel vrácení odmítl: téma taky (ve znalostech má, že odmítl); neodhalený ne", async () => {
    vi.mocked(tryRestitution).mockResolvedValueOnce({ outcome: "refused", incidentId: "inc-kasa" });
    const revealed = db(null, [{ sql: /SELECT culprit_revealed FROM club_incidents/, first: { culprit_revealed: 1 } }]);
    expect(await zprava(revealed, "Vrať ty prachy.")).toEqual({ incidentId: "inc-kasa", vyslech: null });

    vi.mocked(tryRestitution).mockResolvedValueOnce({ outcome: "refused", incidentId: "inc-kasa" });
    const hidden = db(null, [{ sql: /SELECT culprit_revealed FROM club_incidents/, first: { culprit_revealed: 0 } }]);
    expect(await zprava(hidden, "Vrať ty prachy.")).toBeNull();
    expect(hidden.pocet(/UPDATE conversations/)).toBe(0);
  });
});
