import { describe, expect, it } from "vitest";
import { daysLeft, decisionTexts } from "./decision-alerts";

describe("upozornění na rozhodnutí obce", () => {
  it("zbývající dny počítá z herního dne, nejméně jeden", () => {
    expect(daysLeft("2026-11-02T16:00:00.000Z", "2026-11-16T16:00:00.000Z")).toBe(14);
    expect(daysLeft("2026-11-02T16:00:00.000Z", "2026-11-02T20:00:00.000Z")).toBe(1);
  });

  it("petice řekne, kolik je času a co hrozí, SMS vede na Obec", () => {
    const t = decisionTexts("petition", "Příspěvek hasičům", 14);
    expect(t.title).toBe("🏛️ Petice: Příspěvek hasičům");
    expect(t.body).toContain("máš na ni 14 dní");
    expect(t.body).toContain("přízeň obce klesne");
    expect(t.sms).toContain("stránce Obec");
  });

  it("hospoda nese jméno zastupitele, česky skloňované dny", () => {
    const t = decisionTexts("pub", "Josef Novák sedí v hospodě", 5);
    expect(t.title).toBe("🍺 Josef Novák sedí v hospodě");
    expect(t.sms.startsWith("Josef Novák sedí v hospodě a ptá se po vás.")).toBe(true);
    expect(decisionTexts("pub", "X sedí v hospodě", 2).body).toContain("2 dny");
    expect(decisionTexts("investment", "Parkoviště u stadionu", 1).body).toContain("1 den");
  });

  it("v textech pro hráče nejsou dlouhé pomlčky", () => {
    for (const kind of ["petition", "investment", "pub"] as const) {
      const t = decisionTexts(kind, "Něco", 3);
      expect(`${t.title}${t.body}${t.sms}`).not.toContain("—");
    }
  });
});
