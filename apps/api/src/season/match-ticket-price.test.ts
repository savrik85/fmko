import { describe, expect, it } from "vitest";
import { matchTicketPrice, stadiumFacilityLevels, getBaseTicketPrice, mapVillageSize, websiteBannerWeeklyBonus } from "./finance-processor";

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

describe("websiteBannerWeeklyBonus", () => {
  it("bez partnerů na bannerech nic", () => {
    expect(websiteBannerWeeklyBonus(0, 1)).toBe(0);
  });

  it("5 % z týdenních plateb bannerů a stadionu, stejný přepočet jako sponzorské příjmy", () => {
    // 27 800 Kč/měs je průměr lidských klubů na produ (2026-10)
    expect(websiteBannerWeeklyBonus(27800, 1)).toBe(Math.round((27800 / 4.3) * 2 * 0.05));
    expect(websiteBannerWeeklyBonus(27800, 1)).toBe(647);
  });

  it("ekonom bonus zvedá stejně jako ostatní sponzorské příjmy", () => {
    expect(websiteBannerWeeklyBonus(10000, 1.2)).toBe(Math.round((10000 / 4.3) * 2 * 1.2 * 0.05));
  });
});
