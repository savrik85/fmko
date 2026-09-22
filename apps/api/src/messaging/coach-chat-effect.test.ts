/**
 * Rozhovor, který začne trenér, hýbe vztahem k trenérovi — jen jednou za herní den
 * a jen v mezích. Dřív se nezapočítal vůbec, když ho model hned uzavřel.
 */
import { describe, it, expect } from "vitest";
import { coachChatEffect } from "./ai-player-chat";
import { dopadRozhovoru } from "./coach-initiated";
import { FalesnaD1, jakoD1 } from "../incidents/testovaci-d1";

type Dotaz = { sql: string; params: unknown[] };
const jakoDotaz = (p: D1PreparedStatement) => p as unknown as Dotaz;

describe("dopad rozhovoru z odpovědi modelu", () => {
  it("ořízne čísla na ±6 vztahu a ±3 morálky", () => {
    expect(coachChatEffect({ relationship_delta: 15, morale_delta: -9, summary: "Omluvil se" }))
      .toEqual({ relationshipDelta: 6, moraleDelta: -3, summary: "Omluvil se" });
  });

  it("nesmysl od modelu je nula, chybějící shrnutí má náhradu", () => {
    expect(coachChatEffect({ relationship_delta: "hodně", morale_delta: null }))
      .toEqual({ relationshipDelta: 0, moraleDelta: 0, summary: "Popovídali si" });
  });
});

describe("zápis dopadu rozhovoru", () => {
  const db = (uzDnes: boolean) => new FalesnaD1([
    { sql: /SELECT game_date FROM teams/, first: { game_date: "2026-11-11T16:00:00.000Z" } },
    { sql: /source = 'sms_coach'/, first: uzDnes ? { 1: 1 } : null },
  ]);

  it("zapíše morálku i vztah s důvodem a herním dnem", async () => {
    const prikazy = (await dopadRozhovoru(jakoD1(db(false)), "t", "p", {
      relationshipDelta: 4, moraleDelta: 2, summary: "Trenér se omluvil a pozval ho na pivo",
    })).map(jakoDotaz);
    expect(prikazy.map((p) => p.sql.trim().split(/\s+/).slice(0, 2).join(" "))).toEqual([
      "UPDATE players", "INSERT INTO", "UPDATE players",
    ]);
    const log = prikazy[1];
    expect(log.params).toContain("sms_coach");
    expect(log.params).toContain("Rozhovor v telefonu: Trenér se omluvil a pozval ho na pivo");
    expect(log.params).toContain("2026-11-11");
  });

  it("zlepšení podruhé týž herní den už nic", async () => {
    expect(await dopadRozhovoru(jakoD1(db(true)), "t", "p", { relationshipDelta: 5, moraleDelta: 1, summary: "x" })).toEqual([]);
  });

  it("urážka platí i po dnešním zlepšení", async () => {
    const prikazy = (await dopadRozhovoru(jakoD1(db(true)), "t", "p", {
      relationshipDelta: -5, moraleDelta: -2, summary: "Trenér ho seřval za výkon",
    })).map(jakoDotaz);
    expect(prikazy).toHaveLength(3);
    expect(prikazy[0].params).toEqual([-2, "p"]);
    expect(prikazy[1].params).toContain(-5);
  });

  it("pozdrav o ničem nic nezapíše a strop nespotřebuje", async () => {
    expect(await dopadRozhovoru(jakoD1(db(false)), "t", "p", { relationshipDelta: 0, moraleDelta: 0, summary: "Čus" })).toEqual([]);
  });
});
