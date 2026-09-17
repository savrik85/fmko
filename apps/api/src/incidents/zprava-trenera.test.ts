import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./vyslech", () => ({ vyslechni: vi.fn(async () => ({ vysledek: "kryje", novy: true })) }));

import { FalesnaD1, jakoD1, type Pravidlo } from "./testovaci-d1";
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
});
