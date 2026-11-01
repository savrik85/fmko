import { describe, expect, it } from "vitest";
import { cupArticle, cupNotice, drawSms, kickoffPhrase, resultLine, type CupRoundResult } from "./cup-news";

function result(over: Partial<CupRoundResult> = {}): CupRoundResult {
  return {
    homeName: "FK Spůle", awayName: "Sokol Vimperk", homeScore: 2, awayScore: 1, homePens: null, awayPens: null,
    homeWon: true, homeTeamId: "spule", awayTeamId: "vimperk", homeHuman: true, awayHuman: false,
    homeLeagueId: "pt", awayLeagueId: "pt", ...over,
  };
}

describe("pohár po kole", () => {
  it("věta o zápase: vítěz první, penalty jen když rozhodly", () => {
    expect(resultLine(result())).toBe("FK Spůle vyřadil Sokol Vimperk 2:1");
    expect(resultLine(result({ homeWon: false, homeScore: 1, awayScore: 3 }))).toBe("Sokol Vimperk vyřadil FK Spůle 3:1");
    expect(resultLine(result({ homeScore: 1, awayScore: 1, homePens: 3, awayPens: 4, homeWon: false })))
      .toBe("Sokol Vimperk vyřadil FK Spůle až na penalty (1:1, pen. 4:3)");
    expect(resultLine(result(), true)).toBe("FK Spůle porazil Sokol Vimperk 2:1");
  });

  it("článek za kolo: lidské kluby první, góly česky; finále jmenuje vítěze", () => {
    const a = cupArticle([result({ homeHuman: false, homeName: "AI Klub" }), result({ homeName: "Lidský", homeScore: 1, awayScore: 0 })], 3, 6, null);
    expect(a.headline).toBe("Pohár: Osmifinále je dohrané");
    expect(a.body.startsWith("Lidský vyřadil")).toBe(true);
    expect(a.body).toContain("V 2 zápasech padlo 4 gólů".replace("padlo 4 gólů", "padly 4 góly"));
    const f = cupArticle([result()], 6, 6, "FK Spůle");
    expect(f.headline).toBe("Pohár má vítěze: FK Spůle");
    expect(f.body).toContain("FK Spůle porazil Sokol Vimperk 2:1");
  });

  it("upozornění klubu: postup s dalším kolem, vypadnutí, výhra v poháru", () => {
    expect(cupNotice(result(), true, 3, 6)).toEqual({
      title: "🏆 Osmifinále poháru: postup (2:1)", body: "Zápas proti Sokol Vimperk. Příště vás čeká čtvrtfinále.",
    });
    expect(cupNotice(result(), false, 3, 6).body).toBe("Zápas proti FK Spůle. V poháru jste letos skončili.");
    expect(cupNotice(result(), true, 6, 6).title).toBe("🏆 Finále poháru: vítězství (2:1)");
    // Engine ukládá penalty 0:0 i u zápasu bez penalt: v titulku jen u remízy.
    expect(cupNotice(result({ homePens: 0, awayPens: 0 }), true, 1, 6).title).toBe("🏆 1. kolo poháru: postup (2:1)");
    expect(cupNotice(result({ homeScore: 1, awayScore: 1, homePens: 4, awayPens: 3 }), true, 1, 6).title).toBe("🏆 1. kolo poháru: postup (1:1, pen. 4:3)");
  });

  it("SMS o losu: doma/venku, soupeř a termín v poledne", () => {
    expect(kickoffPhrase("2026-11-07T11:00:00.000Z")).toBe("v sobotu 7. 11. ve 12:00");
    expect(drawSms({ roundName: "Osmifinále", home: false, opponent: "Sokol Vimperk", kickoff: "v sobotu 7. 11. ve 12:00" }))
      .toBe("Los poháru je hotový. Osmifinále hrajete venku proti Sokol Vimperk, v sobotu 7. 11. ve 12:00. Sestavu nastavíte jako u ligy.");
  });

  it("v textech nejsou dlouhé pomlčky", () => {
    const texts = [cupArticle([result()], 1, 6, null).body, cupNotice(result(), true, 1, 6).body, drawSms({ roundName: "1. kolo", home: true, opponent: "X", kickoff: "" })];
    for (const t of texts) expect(t).not.toContain("—");
  });
});
