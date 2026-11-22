import { describe, expect, it, vi } from "vitest";

vi.mock("./ai-player-spawn", () => ({ getOrCreatePlayerConversation: vi.fn(async () => "konv-1") }));

import { FalesnaD1, jakoD1 } from "../incidents/testovaci-d1";
import { sendPlayerSMS, sendPlayerTemplateSMS, sendSystemSMS } from "./system-sms";
import { reasonSmsVariants } from "../transfers/unrest-reasons";

const ODKAZ = { type: "incident", incidentId: "inc-1" };

describe("SMS s daty pro telefon", () => {
  it("systémová zpráva uloží metadata jako JSON, bez nich NULL", async () => {
    const db = new FalesnaD1([{ sql: /SELECT id FROM conversations/, first: { id: "konv-k" } }]);
    await sendSystemSMS(jakoD1(db), "tym-a", "Kustod", "Zmizely dresy.", ODKAZ);
    await sendSystemSMS(jakoD1(db), "tym-a", "Kustod", "Nic.");
    const vlozene = db.dotazy.filter((d) => /INSERT INTO messages/.test(d.sql));
    expect(vlozene[0].params[4]).toBe(JSON.stringify(ODKAZ));
    expect(vlozene[1].params[4]).toBeNull();
  });

  it("zpráva od hráče taky", async () => {
    const db = new FalesnaD1();
    await sendPlayerSMS(jakoD1(db), "tym-a", { id: "a", firstName: "Adam", lastName: "Kos" }, "Já to nebyl.", ODKAZ);
    const vlozena = db.dotazy.find((d) => /INSERT INTO messages/.test(d.sql));
    expect(vlozena?.params[5]).toBe(JSON.stringify(ODKAZ));
  });

  // Lokální E2E 22. 11. (Sedláček, B1): „Dávali za mě takové peníze, že mě tam fakt chtěli.“
  // přišlo doslova ve dvou SMS po sobě. Věta o důvodu se vybírá z těch, které hráč ještě nenapsal.
  it("věta o důvodu za šablonou: nepoužitá, a když řekl všechny, žádná", async () => {
    const money = reasonSmsVariants("money", undefined);
    expect(money.length).toBeGreaterThan(1);
    const sent = async (previous: string[]) => {
      const db = new FalesnaD1([{ sql: /SELECT body, sent_at FROM messages/, all: [...previous].reverse().map((body) => ({ body })) }]);
      const r = await sendPlayerTemplateSMS(jakoD1(db), "tym-a", { id: "a", firstName: "Vojtěch", lastName: "Sedláček" },
        ["Trenére, FK E.ON Rudolfov mě chtěl a vy jste to zařízl."], { seed: "s", suffix: money, convId: "konv-1" });
      return r.body;
    };
    expect(await sent([])).toBe(`Trenére, FK E.ON Rudolfov mě chtěl a vy jste to zařízl. ${money[0]}`);
    const second = await sent([`Proč jste mi neřekl o té nabídce? ${money[0]}`]);
    expect(second).not.toContain(money[0]);
    expect(money.some((m) => second.endsWith(m))).toBe(true);
    expect(await sent(money.map((m) => `Zklamání. ${m}`))).toBe("Trenére, FK E.ON Rudolfov mě chtěl a vy jste to zařízl.");
  });
});
