import { describe, expect, it } from "vitest";
import {
  decideRequest, exhaustedBelow, MIN_FAVOR, REFUSED_FAVOR, REPEAT_DAYS, requestBlock, requestCap, requestFavorDelta,
  STRANGER_MIN_FAVOR, TOO_SOON_FAVOR, REQUEST_PURPOSES,
} from "./requests";
import { coachRequestText, requestCheckText, requestReplyText } from "./request-texts";
import type { OwnerPersonality } from "./owners";

const BASE = { monthlyB: 40000, favor: 60, relation: "main" as const, personality: "fan" as const, purpose: "equipment" as const };

describe("requestCap", () => {
  it("pod minimální náklonností nedá nic, cizí majitel až od vyšší", () => {
    expect(requestCap({ ...BASE, favor: MIN_FAVOR - 1 })).toBe(0);
    expect(requestCap({ ...BASE, relation: "none", favor: STRANGER_MIN_FAVOR - 1 })).toBe(0);
    expect(requestCap({ ...BASE, relation: "none", favor: STRANGER_MIN_FAVOR })).toBeGreaterThan(0);
  });

  it("roste s náklonností a klesá se slabším vztahem", () => {
    const warm = requestCap({ ...BASE, favor: 90 });
    const cool = requestCap({ ...BASE, favor: 45 });
    expect(warm).toBeGreaterThan(cool);
    const main = requestCap(BASE);
    const stadium = requestCap({ ...BASE, relation: "stadium" });
    const banner = requestCap({ ...BASE, relation: "banner" });
    expect(main).toBeGreaterThan(stadium);
    expect(stadium).toBeGreaterThan(banner);
  });

  it("povaha vůči účelu: fanoušek dá víc na přestup, patriot na mládež, obchodník na trenéra", () => {
    const cap = (personality: OwnerPersonality, purpose: (typeof REQUEST_PURPOSES)[number]) => requestCap({ ...BASE, personality, purpose });
    expect(cap("fan", "transfer")).toBeGreaterThan(cap("fan", "coach"));
    expect(cap("patriot", "youth")).toBeGreaterThan(cap("patriot", "transfer"));
    expect(cap("businessman", "coach")).toBeGreaterThan(cap("businessman", "youth"));
  });

  it("hlavní sponzor s náklonností 100 dá nejvýš dvě měsíční platby, zaokrouhleno na stovky", () => {
    const cap = requestCap({ ...BASE, favor: 100, purpose: "equipment" });
    expect(cap).toBe(80000);
    expect(requestCap({ ...BASE, favor: 57 }) % 100).toBe(0);
  });
});

describe("requestBlock", () => {
  const ok = { favor: 60, relation: "main" as const, lastRequestDaysAgo: null, brokenThisSeason: false };
  it("pořadí důvodů: porušená prosba, pak příliš brzy, pak nechuť", () => {
    expect(requestBlock(ok)).toBeNull();
    expect(requestBlock({ ...ok, brokenThisSeason: true, lastRequestDaysAgo: 1, favor: 10 })).toBe("broken");
    expect(requestBlock({ ...ok, lastRequestDaysAgo: REPEAT_DAYS - 1, favor: 10 })).toBe("too_soon");
    expect(requestBlock({ ...ok, lastRequestDaysAgo: REPEAT_DAYS })).toBeNull();
    expect(requestBlock({ ...ok, favor: MIN_FAVOR - 1 })).toBe("dislike");
    expect(requestBlock({ ...ok, relation: "none", favor: 50 })).toBe("stranger");
  });
});

describe("decideRequest", () => {
  it("dá celou částku, když se vejde do zbytku", () => {
    expect(decideRequest({ asked: 10000, cap: 50000, given: 20000, block: null })).toEqual({ kind: "granted", amount: 10000 });
  });
  it("dá jen zbytek, když chce klub víc", () => {
    expect(decideRequest({ asked: 40000, cap: 50000, given: 20000, block: null })).toEqual({ kind: "partial", amount: 30000 });
  });
  it("odmítne, když už dal skoro všechno", () => {
    expect(decideRequest({ asked: 5000, cap: 50000, given: 50000 - exhaustedBelow(50000) + 100, block: null }))
      .toEqual({ kind: "refused", refusal: "exhausted" });
  });
  it("blok má přednost před částkou", () => {
    expect(decideRequest({ asked: 1000, cap: 50000, given: 0, block: "too_soon" })).toEqual({ kind: "refused", refusal: "too_soon" });
  });
  it("náklonnost: odmítnutí −2, otravování −4, splněná prosba nic", () => {
    expect(requestFavorDelta({ kind: "refused", refusal: "exhausted" })).toBe(REFUSED_FAVOR);
    expect(requestFavorDelta({ kind: "refused", refusal: "too_soon" })).toBe(TOO_SOON_FAVOR);
    expect(requestFavorDelta({ kind: "granted", amount: 5000 })).toBe(0);
    expect(requestFavorDelta({ kind: "partial", amount: 5000 })).toBe(0);
  });
});

describe("texty prosby", () => {
  const personalities: OwnerPersonality[] = ["fan", "patriot", "businessman", "cautious"];
  it("žádná dlouhá pomlčka ani nevyplněná značka, částka a termín v textu", () => {
    for (const p of personalities) {
      for (const kind of ["granted", "partial"] as const) {
        for (let i = 0; i < 10; i++) {
          const t = requestReplyText(kind, p, { castka: 12300, ucel: "coach", termin: "2026-10-29" }, null, `k${i}`).replace(/\s/g, " ");
          expect(t).not.toMatch(/[—{}]/);
          expect(t).toContain("12 300 Kč");
          expect(t).toContain("29. 10.");
        }
      }
    }
    for (const refusal of ["broken", "too_soon", "dislike", "stranger", "exhausted"] as const) {
      const t = requestReplyText("refused", "fan", { castka: 5000, ucel: "youth", kdy: "2026-11-02" }, refusal, "x");
      expect(t).not.toMatch(/[—{}]/);
      expect(t).not.toMatch(/\.\./);
    }
    expect(requestReplyText("refused", "fan", { kdy: "2026-11-02" }, "exhausted", "x")).toContain("2. 11.");
    for (const kept of [true, false]) {
      expect(requestCheckText(kept, { castka: 5000, ucel: "stadium" }, "y")).not.toMatch(/[—{}]/);
    }
  });
  it("zpráva trenéra nese částku, účel a poznámku", () => {
    expect(coachRequestText({ castka: 15000, ucel: "transfer" }, "Chceme útočníka.").replace(/\s/g, " "))
      .toBe("Dobrý den, chtěl bych vás poprosit o příspěvek 15 000 Kč na přestup. Chceme útočníka.");
  });
});
