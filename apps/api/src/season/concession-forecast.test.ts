import { describe, expect, it } from "vitest";
import { CONCESSION_PRODUCT_KEYS, concessionDemandHints } from "./concession-catalog";

/** Teploty krajních fází sezóny — viz `season-weather.ts`. */
const LETO = 24;
const ZIMA = -2;

/**
 * Tipy k předpovědi. Bez nich manažer neví, na co se má naskladnit,
 * ale nevidí, kam mířit — musel by si počasí dohledávat na jiné stránce
 * a poměry v hlavě přepočítávat na kusy.
 */
describe("tipy k naskladnění podle předpovědi", () => {
  it("vrací všechny produkty z katalogu", () => {
    const h = concessionDemandHints("cloudy", 11);
    expect(h.map((x) => x.key).sort()).toEqual([...CONCESSION_PRODUCT_KEYS].sort());
  });

  it("řadí sestupně — co naskladnit nejvíc, je první", () => {
    const h = concessionDemandHints("snow", ZIMA);
    for (let i = 1; i < h.length; i++) {
      expect(h[i - 1].factor).toBeGreaterThanOrEqual(h[i].factor);
    }
  });

  it("v prosinci ve sněhu vede svařák a limonáda je poslední", () => {
    const h = concessionDemandHints("snow", ZIMA);
    expect(h[0].key).toBe("mulled_wine");
    expect(h[h.length - 1].key).toBe("lemonade");
  });

  it("v červenci na slunci je svařák poslední", () => {
    const h = concessionDemandHints("sunny", LETO);
    expect(h[h.length - 1].key).toBe("mulled_wine");
    expect(h[0].key).toBe("lemonade");
  });

  it("každý tip má český popis a nechybí diakritika", () => {
    for (const w of ["sunny", "cloudy", "rain", "wind", "snow"] as const) {
      for (const m of [LETO, 11, ZIMA]) {
        for (const t of concessionDemandHints(w, m)) {
          expect(t.hint.length, `${w}/${m}C/${t.key}`).toBeGreaterThan(3);
          expect(t.label.length, `${w}/${m}C/${t.key}`).toBeGreaterThan(0);
          expect(/^[a-zA-Z ]+$/.test(t.hint), `${t.hint} nemá vypadat anglicky`).toBe(false);
        }
      }
    }
  });

  it("krajní situace dostanou výrazný popis, průměrné mírný", () => {
    const zima = concessionDemandHints("snow", ZIMA).find((x) => x.key === "mulled_wine")!;
    const leto = concessionDemandHints("sunny", LETO).find((x) => x.key === "mulled_wine")!;
    expect(zima.hint).not.toBe(leto.hint);
    const bezne = concessionDemandHints("cloudy", 11).find((x) => x.key === "beer")!;
    expect(bezne.factor).toBeGreaterThan(0.85);
    expect(bezne.factor).toBeLessThan(1.15);
  });
});
