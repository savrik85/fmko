import { describe, expect, it } from "vitest";
import {
  decideRequest, exhaustedBelow, MIN_FAVOR, REFUSED_FAVOR, REPEAT_DAYS, requestBlock, requestCap, requestFavorDelta,
  STRANGER_MIN_FAVOR, TOO_SOON_FAVOR, REQUEST_PURPOSES,
} from "./requests";
import { askText, ownerAlreadyAnswered, ownerSmallTalk, requestCheckText, requestReplyText } from "./request-texts";
import { parseAmount, parseRequestText, normalize } from "./request-parse";
import { ownerReplyDelayMs } from "./owner-typing";
import { checkOwnerReply } from "./owner-chat";
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
    // Bez smlouvy jen klub, kterému fandí (80+): „příznivý" (75) nestačí.
    expect(requestBlock({ ...ok, relation: "none", favor: 75 })).toBe("stranger");
    expect(requestBlock({ ...ok, relation: "none", favor: 80 })).toBeNull();
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
  it("doptávání a ostatní odpovědi bez značek a dlouhých pomlček", () => {
    for (const kind of ["purpose", "amount", "both", "tiny"] as const) {
      for (let i = 0; i < 6; i++) {
        const t = askText(kind, "stadium", `a${i}`);
        expect(t).not.toMatch(/[—{}]/);
        if (kind === "amount") expect(t).toContain("stadion");
      }
    }
    expect(ownerSmallTalk("x")).not.toMatch(/[—{}]/);
    expect(ownerAlreadyAnswered("x")).not.toMatch(/[—{}]/);
  });
});

describe("prosba z SMS", () => {
  const amount = (t: string) => parseAmount(normalize(t));
  it("částky v běžných zápisech", () => {
    expect(amount("potřeboval bych 20 000 Kč")).toBe(20000);
    expect(amount("20.000")).toBe(20000);
    expect(amount("20000")).toBe(20000);
    expect(amount("dejte 20 tisíc")).toBe(20000);
    expect(amount("aspoň 15 tis.")).toBe(15000);
    expect(amount("tak 20k")).toBe(20000);
    expect(amount("1,5 milionu")).toBe(1500000);
    expect(amount("500 Kč")).toBe(500);
  });
  it("holé malé číslo není částka (termíny, počty)", () => {
    expect(amount("do 30 dnů")).toBeNull();
    expect(amount("máme 11 hráčů")).toBeNull();
  });
  it("účel podle klíčových slov, bez diakritiky i s ní", () => {
    expect(parseRequestText("Potřeboval bych 20 000 na přestup útočníka").purpose).toBe("transfer");
    expect(parseRequestText("na nove dresy a mice").purpose).toBe("equipment");
    expect(parseRequestText("kurz pro trenéra").purpose).toBe("coach");
    expect(parseRequestText("oprava tribuny").purpose).toBe("stadium");
    expect(parseRequestText("na dorost").purpose).toBe("youth");
  });
  it("víc účelů v jedné zprávě: platí ten zmíněný naposled", () => {
    const p = parseRequestText("na dresy a na stadion");
    expect(p.purpose).toBe("stadium");
    expect(p.purposes.sort()).toEqual(["equipment", "stadium"]);
  });
  it("skutečná zpráva z produkce: mládež je minulost, žádá se o licenci", () => {
    const p = parseRequestText("Dobrý den, dnes jsem úspěšně složil zkoušku z tréninku mládeže, chci sebe a celý klub nadále posouvat a potřeboval bych proto ve studiu pokračovat a chci se zapsat an Licenci C, ale nemáme aktuálně dostatek prostředků. Nemohl byste prosím něco uvolnit?");
    expect(p.purpose).toBe("coach");
    expect(p.intent).toBe(true);
    expect(p.amount).toBeNull();
    expect(parseRequestText("Na Licenci jsem psal").purpose).toBe("coach");
  });
  it("záměr: peníze bez účelu i částky se poznají, pozdrav ne", () => {
    expect(parseRequestText("Nemohl byste nás podpořit?").intent).toBe(true);
    expect(parseRequestText("Dobrý den, jak se máte?").intent).toBe(false);
  });
});

describe("prodleva odpovědi majitele", () => {
  it("jako u hráčů: 2,5 až 14 s, delší zpráva trvá déle", () => {
    expect(ownerReplyDelayMs("ok", 0)).toBeGreaterThanOrEqual(2500);
    expect(ownerReplyDelayMs("x".repeat(2000), 1)).toBeLessThanOrEqual(14000);
    expect(ownerReplyDelayMs("x".repeat(200), 0.5)).toBeGreaterThan(ownerReplyDelayMs("x", 0.5));
  });
});

describe("kontrola odpovědi majitele od modelu", () => {
  it("projde, když říká přesně částku a termín", () => {
    expect(checkOwnerReply("„Dobře, 15 000 Kč na kurz vám pošlu. Do 29. 10. chci vidět, že to šlo tam.“", { amounts: [15000], days: ["2026-10-29"] }))
      .toBe("Dobře, 15 000 Kč na kurz vám pošlu. Do 29. 10. chci vidět, že to šlo tam.");
    expect(checkOwnerReply("Pošlu 15.000, utraťte to do 29.10.", { amounts: [15000], days: ["2026-10-29"] })).not.toBeNull();
  });
  it("neprojde bez částky, bez termínu nebo s vymyšlenou částkou", () => {
    expect(checkOwnerReply("Dobře, něco vám pošlu. Do 29. 10.", { amounts: [15000], days: ["2026-10-29"] })).toBeNull();
    expect(checkOwnerReply("Pošlu 15 000 Kč.", { amounts: [15000], days: ["2026-10-29"] })).toBeNull();
    expect(checkOwnerReply("Pošlu 15 000 Kč, příště klidně 50 000. Do 29. 10.", { amounts: [15000], days: ["2026-10-29"] })).toBeNull();
    expect(checkOwnerReply("Nemám na to, ale dejte vědět.", { allowed: [72600] })).toBe("Nemám na to, ale dejte vědět.");
  });
  it("dlouhou pomlčku nahradí čárkou", () => {
    expect(checkOwnerReply("Dobře — uvidíme.")).toBe("Dobře, uvidíme.");
  });
});
