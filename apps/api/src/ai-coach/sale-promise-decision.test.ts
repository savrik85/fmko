import { describe, expect, it } from "vitest";
import { generateAiProfile } from "./profile";
import {
  fallbackPromiseListing, promiseListingBounds, promiseListingSchema, renderPromiseListingPrompt, validatePromiseListing,
  type PromiseListingContext,
} from "./sale-promise-decision";

const ctx = (marketValue: number): PromiseListingContext => ({
  teamName: "TJ Netolice", profile: generateAiProfile("promise-unit", null), budget: 60_000, spendable: 40_000,
  player: { position: "FWD", age: 29, rating: 39, importance: "rotation", marketValue },
  daysLeft: 30, ...promiseListingBounds(marketValue),
});

describe("inzerát po slibu prodeje", () => {
  it("meze: od tržní hodnoty do 115 %, po stovkách, dolní nikdy nad horní", () => {
    expect(promiseListingBounds(20_000)).toEqual({ minPrice: 20_000, maxPrice: 23_000 });
    expect(promiseListingBounds(20_050)).toEqual({ minPrice: 20_100, maxPrice: 23_200 });
    // Nejlevnější hráč: počítá se s cenou aspoň 500 Kč.
    expect(promiseListingBounds(100)).toEqual({ minPrice: 500, maxPrice: 600 });
  });

  it("model smí jen celou stovku v mezích; pod tržní hodnotu inzerát nejde", () => {
    const c = ctx(20_000);
    expect(validatePromiseListing({ price: 21_000, reason: "sell him soon" }, c)).toEqual({ price: 21_000, reason: "sell him soon" });
    expect(validatePromiseListing({ price: "22000", reason: "" }, c)?.price).toBe(22_000);
    // Dřív šlo vystavit od 60 % tržní hodnoty: opory pak odcházely pod cenou.
    expect(validatePromiseListing({ price: 15_000, reason: "" }, c)).toBeNull();
    expect(validatePromiseListing({ price: 19_900, reason: "" }, c)).toBeNull();
    expect(validatePromiseListing({ price: 23_100, reason: "" }, c)).toBeNull();
    expect(validatePromiseListing({ price: 21_050, reason: "" }, c)).toBeNull();
    expect(validatePromiseListing("nonsense", c)).toBeNull();
    // Pravidlo (jen režim off): tržní hodnota.
    expect(fallbackPromiseListing(c)).toEqual({ price: 20_000, reason: "fallback" });
  });

  it("schéma drží meze a prompt neslibuje prodej pod cenou", () => {
    const c = ctx(20_000);
    expect(promiseListingSchema(c)).toMatchObject({ properties: { price: { type: "integer", minimum: 20_000, maximum: 23_000 } } });
    const prompt = renderPromiseListingPrompt(c);
    expect(prompt).toContain("market value 20,000 CZK");
    expect(prompt).toContain("never below his market value");
    expect(prompt).not.toContain("you also accept any transfer offer");
    expect(prompt).toContain("between 20,000 CZK and 23,000 CZK");
  });
});
