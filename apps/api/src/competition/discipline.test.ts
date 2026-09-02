import { describe, expect, it } from "vitest";
import { collectEvidence, DEFAULT_EVIDENCE_LIMITS } from "./discipline";

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
