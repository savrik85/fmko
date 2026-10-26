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
  it("meze: od 60 % tržní hodnoty do tržní hodnoty, po stovkách, dolní nikdy nad horní", () => {
    expect(promiseListingBounds(20_000)).toEqual({ minPrice: 12_000, maxPrice: 20_000 });
    expect(promiseListingBounds(20_050)).toEqual({ minPrice: 12_100, maxPrice: 20_100 });
    // Nejlevnější hráč: počítá se s cenou aspoň 500 Kč.
    expect(promiseListingBounds(100)).toEqual({ minPrice: 300, maxPrice: 300 });
  });

  it("model smí jen celou stovku v mezích, jinak platí tržní hodnota", () => {
    const c = ctx(20_000);
    expect(validatePromiseListing({ price: 15_000, reason: "sell him soon" }, c)).toEqual({ price: 15_000, reason: "sell him soon" });
    expect(validatePromiseListing({ price: "16000", reason: "" }, c)?.price).toBe(16_000);
    expect(validatePromiseListing({ price: 11_900, reason: "" }, c)).toBeNull();
    expect(validatePromiseListing({ price: 20_100, reason: "" }, c)).toBeNull();
    expect(validatePromiseListing({ price: 15_050, reason: "" }, c)).toBeNull();
    expect(validatePromiseListing("nonsense", c)).toBeNull();
    expect(fallbackPromiseListing(c)).toEqual({ price: 20_000, reason: "fallback" });
  });

  it("schéma drží meze a prompt říká, od kolika AI přestup přijme", () => {
    const c = ctx(20_000);
    expect(promiseListingSchema(c)).toMatchObject({ properties: { price: { type: "integer", minimum: 12_000, maximum: 20_000 } } });
    const prompt = renderPromiseListingPrompt(c);
    expect(prompt).toContain("market value 20,000 CZK");
    expect(prompt).toContain("you also accept any transfer offer of at least 12,000 CZK");
    expect(prompt).toContain("between 12,000 CZK and 20,000 CZK");
  });
});
