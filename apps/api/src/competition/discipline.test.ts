import { describe, expect, it } from "vitest";
import { canFine, collectEvidence, DEFAULT_EVIDENCE_LIMITS } from "./discipline";

/**
 * Atrapa D1, která odpovídá podle toho, na co se dotaz ptá. Sbírání důkazů dělá
 * čtyři nezávislé dotazy a pořadí se může změnit — rozlišovat je podle indexu
 * volání by test rozbil při první úpravě.
 */
const dbSOdpovedmi = (odpovedi: {
  pitch?: number | null;
  reds?: number;
  ownerTransfers?: number;
  criticism?: number;
}) => ({
  prepare: (sql: string) => ({
    bind: () => ({
      first: async () => {
        if (sql.includes("pitch_condition")) {
          return odpovedi.pitch === undefined ? null : { pitch_condition: odpovedi.pitch };
        }
        if (sql.includes("red_cards")) return { n: odpovedi.reds ?? 0 };
        if (sql.includes("transfer_offers")) return { n: odpovedi.ownerTransfers ?? 0 };
        if (sql.includes("coach_interviews")) return { n: odpovedi.criticism ?? 0 };
        return null;
      },
    }),
  }),
}) as unknown as D1Database;

const limity = (over: Partial<typeof DEFAULT_EVIDENCE_LIMITS> = {}) =>
  ({ ...DEFAULT_EVIDENCE_LIMITS, ...over });

describe("důkazy pro disciplinárku", () => {
  it("obchod mezi vlastními kluby není skutek, dokud si soutěž zákaz neodhlasuje", async () => {
    // Přepínač `ban_own_owner_transfers` byl dřív mrtvý: hodnota se zapsala do
    // sazebníku, ale sběr důkazů ji nečetl a obvinění šlo podat i v soutěži,
    // kde je převod mezi vlastními kluby dovolený.
    const db = dbSOdpovedmi({ ownerTransfers: 3 });
    const out = await collectEvidence(db, "t1", limity({ ownerTransfersBanned: false }));
    expect(out.find((e) => e.kind === "transfer")).toBeUndefined();
  });

  it("se zapnutým zákazem se týž obchod doložit dá", async () => {
    const db = dbSOdpovedmi({ ownerTransfers: 3 });
    const out = await collectEvidence(db, "t1", limity({ ownerTransfersBanned: true }));
    const hit = out.find((e) => e.kind === "transfer");
    expect(hit).toBeDefined();
    expect(hit?.detail).toContain("3");
  });

  it("zapnutý zákaz sám o sobě obvinění nevyrábí", async () => {
    const db = dbSOdpovedmi({ ownerTransfers: 0 });
    const out = await collectEvidence(db, "t1", limity({ ownerTransfersBanned: true }));
    expect(out.find((e) => e.kind === "transfer")).toBeUndefined();
  });

  it("hranice stavu hřiště je ta, kterou si soutěž odhlasovala", async () => {
    const db = dbSOdpovedmi({ pitch: 40 });
    expect(await collectEvidence(db, "t1", limity({ pitchThreshold: 30 }))).toEqual([]);
    const out = await collectEvidence(db, "t1", limity({ pitchThreshold: 50 }));
    expect(out.find((e) => e.kind === "pitch")?.detail).toContain("40");
  });
});

/**
 * Atrapa pro canFine: `issued` = pokuty do stropu, `sameKind` = platné pokuty
 * téhož skutku. Dotaz na týž skutek se pozná podle `kind = ?`.
 */
const dbProStrop = (o: { issued?: number; open?: number; sameKind?: number }) => ({
  prepare: (sql: string) => ({
    bind: () => ({
      first: async () => {
        if (sql.includes("competition_proposals")) return { n: o.open ?? 0 };
        if (sql.includes("kind = ?")) return { n: o.sameKind ?? 0 };
        return { n: o.issued ?? 0 };
      },
    }),
  }),
}) as unknown as D1Database;

describe("smí se podat návrh na pokutu", () => {
  it("nesportovní chování jde vytknout znovu za jiný incident", async () => {
    // Dřív platilo jednou za sezónu: klub s pokutou za plachtu na jednom zápase
    // byl nedotknutelný i za úplně jiný zápas.
    const r = await canFine(dbProStrop({ issued: 1, sameKind: 1 }), "l", "t", 2, "other");
    expect(r.ok).toBe(true);
  });

  it("strop dvou pokut za sezónu platí i pro nesportovní chování", async () => {
    const r = await canFine(dbProStrop({ issued: 2 }), "l", "t", 2, "other");
    expect(r.ok).toBe(false);
  });

  it("manipulace se sázkami zůstává jednou za sezónu", async () => {
    const r = await canFine(dbProStrop({ sameKind: 1 }), "l", "t", 2, "bet_manipulation");
    expect(r.ok).toBe(false);
    expect(r.reason).toContain("jen jednou za sezónu");
  });

  it("do stropu jednou za sezónu se nepočítají zrušené pokuty", async () => {
    let sql = "";
    const db = {
      prepare: (s: string) => {
        if (s.includes("kind = ?")) sql = s;
        return { bind: () => ({ first: async () => ({ n: 0 }) }) };
      },
    } as unknown as D1Database;
    await canFine(db, "l", "t", 2, "bet_manipulation");
    expect(sql).toContain("status IN ('issued','appealed','paid')");
  });
});
