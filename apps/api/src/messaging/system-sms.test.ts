import { describe, expect, it, vi } from "vitest";

vi.mock("./ai-player-spawn", () => ({ getOrCreatePlayerConversation: vi.fn(async () => "konv-1") }));

import { FalesnaD1, jakoD1 } from "../incidents/testovaci-d1";
import { sendPlayerSMS, sendSystemSMS } from "./system-sms";

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
});
