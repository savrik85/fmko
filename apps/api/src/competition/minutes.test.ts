import { describe, expect, it } from "vitest";
import { sestavZapis, type MinutesInput } from "./minutes";
import type { Journalist } from "../news/journalists";

const redaktor = (style: Journalist["style"]) => ({ style } as Journalist);

const vstup = (over: Partial<MinutesInput> = {}): MinutesInput => ({
  leagueId: "l1",
  leagueName: "Přebor Prahy",
  seasonNumber: 4,
  gameDate: "2026-09-02T16:00:00.000Z",
  attendance: { voters: 8, active: 6, quorum: 4 },
  hlasovalo: 5,
  balance: 1_337_299,
  items: [
    { kind: "win_bonus", title: "Odměna za výhru: 500 Kč → 600 Kč", status: "passed", pro: 4, proti: 1, zdrzel: 0 },
  ],
  protiHlasy: { "Odměna za výhru: 500 Kč → 600 Kč": ["Tatran Michle"] },
  prezident: { managerName: "Klement Testovič", teamName: "FK Duplex Břevnov" },
  ...over,
});

describe("zápis ze zasedání", () => {
  it("uvede účast, výsledek s poměrem i jmenovitě ty proti", () => {
    const { body } = sestavZapis(redaktor("seriozni"), vstup());
    expect(body).toContain("se do hlasování zapojilo 5");
    expect(body).toContain("k usnesení bylo potřeba 4");
    expect(body).toContain("prošlo (4:1)");
    expect(body).toContain("Proti byli: Tatran Michle.");
  });

  it("stav pokladny je v článku vždycky", () => {
    // toLocaleString sype nezlomitelné mezery, tak porovnávej bez nich.
    const { body } = sestavZapis(redaktor("seriozni"), vstup());
    expect(body.replace(/\s/g, " ")).toContain("1 337 299 Kč");
  });

  it("počty klubů se česky skloňují i se slovesem", () => {
    expect(sestavZapis(redaktor("seriozni"), vstup({ hlasovalo: 6 })).body).toContain("2 kluby nehlasovaly");
    expect(sestavZapis(redaktor("seriozni"), vstup({ hlasovalo: 3 })).body).toContain("5 klubů nehlasovalo");
    expect(sestavZapis(redaktor("seriozni"), vstup({ hlasovalo: 7 })).body).toContain("1 klub nehlasoval");
  });

  it("citace patří prezidentovi, a když není, řekne se to", () => {
    expect(sestavZapis(redaktor("seriozni"), vstup()).body)
      .toContain("prezident soutěže Klement Testovič (FK Duplex Břevnov)");
    expect(sestavZapis(redaktor("seriozni"), vstup({ prezident: null })).body)
      .toContain("Prezident soutěže zatím zvolený není");
  });

  it("volbu nikdy nedoprovodí poměr hlasů — je tajná", () => {
    const { body } = sestavZapis(redaktor("seriozni"), vstup({
      items: [{ kind: "election", title: "Volba: Prezident soutěže", status: "passed", resultNote: "Zvolen Petr Novák. Získal 2 z 3 hlasů." }],
      protiHlasy: {},
    }));
    expect(body).toContain("Zvolen Petr Novák");
    expect(body).not.toMatch(/\(\d+:\d+\)/);
  });

  it("tón se liší podle redaktora, čísla ne", () => {
    const b = sestavZapis(redaktor("bulvar"), vstup());
    const s = sestavZapis(redaktor("seriozni"), vstup());
    expect(b.headline).not.toBe(s.headline);
    expect(b.body).toContain("prošlo (4:1)");
    expect(s.body).toContain("prošlo (4:1)");
  });

  it("zasedání bez přijatého bodu má vlastní titulek", () => {
    const { headline } = sestavZapis(redaktor("seriozni"), vstup({
      items: [{ kind: "win_bonus", title: "Něco", status: "no_quorum", pro: 1, proti: 0, zdrzel: 0 }],
    }));
    expect(headline).toContain("bez usnesení");
  });
});
