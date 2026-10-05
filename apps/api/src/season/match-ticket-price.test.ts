import { describe, expect, it } from "vitest";
import { matchTicketPrice, stadiumFacilityLevels, getBaseTicketPrice, mapVillageSize } from "./finance-processor";

// Klubový web ukazuje cenu lístku stejnou funkcí, jakou se počítají tržby ze zápasu.
// Kdyby se tyhle dvě cesty rozešly, web by fanouškům tvrdil jinou cenu, než zaplatí.
describe("matchTicketPrice", () => {
  it("bez vlastní ceny bere základ obce a průměrná spokojenost ho nemění", () => {
    expect(matchTicketPrice({ userBasePrice: 0, villageBasePrice: 30, ticketPriceBonus: 0, satisfaction: 50 })).toBe(30);
  });

  it("vlastní cena manažera má přednost před základem obce", () => {
    expect(matchTicketPrice({ userBasePrice: 45, villageBasePrice: 30, ticketPriceBonus: 0, satisfaction: 50 })).toBe(45);
  });

  it("plot přidá bonus a spokojenost násobí 0,7 až 1,3", () => {
    expect(matchTicketPrice({ userBasePrice: 0, villageBasePrice: 40, ticketPriceBonus: 0.1, satisfaction: 100 })).toBe(Math.round(40 * 1.1 * 1.3));
    expect(matchTicketPrice({ userBasePrice: 0, villageBasePrice: 40, ticketPriceBonus: 0, satisfaction: 0 })).toBe(28);
  });

  it("spokojenost mimo 0–100 se ořízne", () => {
    expect(matchTicketPrice({ userBasePrice: 0, villageBasePrice: 20, ticketPriceBonus: 0, satisfaction: 250 }))
      .toBe(matchTicketPrice({ userBasePrice: 0, villageBasePrice: 20, ticketPriceBonus: 0, satisfaction: 100 }));
  });

  it("osada má základ 20 Kč, ne 30 Kč jako dřív ukazoval web", () => {
    expect(getBaseTicketPrice(mapVillageSize("hamlet"))).toBe(20);
    expect(getBaseTicketPrice(mapVillageSize("village"))).toBe(30);
    expect(getBaseTicketPrice(mapVillageSize("town"))).toBe(40);
    expect(getBaseTicketPrice(mapVillageSize("city"))).toBe(50);
  });
});

describe("stadiumFacilityLevels", () => {
  it("bez stadionu vrátí prázdné úrovně", () => {
    expect(stadiumFacilityLevels(null)).toEqual({});
  });

  it("strany tribun čte jen z DB, která sloupce má", () => {
    const levels = stadiumFacilityLevels({ fence: 2, stands: 1, changing_rooms: 1 });
    expect(levels.fence).toBe(2);
    expect(levels.stands).toBe(1);
    expect("stand_main" in levels).toBe(false);
  });
});
