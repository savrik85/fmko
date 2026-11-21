import { describe, expect, it } from "vitest";
import { createRng } from "../generators/rng";
import {
  WEDDING_GIFT_DEFAULT, WEDDING_GIFT_MAX, WEDDING_GIFT_MIN, WEDDING_MAX_ABSENT, WEDDING_MIN_LEAD_DAYS,
  canAnnounceHangover, checkModelWeddingReply, clampWeddingGift, czechDayWords, czechDeadlineWords, decisionClosesOn,
  decisionEffect, mightBeWeddingReply, parseGiftAmount, planHangover, planWeddingDate, readWeddingReplyByRules,
  weddingArticleFallback, weddingDecisionFromReply, weddingNoteText, ATTEND_EFFECT,
} from "./wedding";

const TODAY = "2026-11-16"; // pondělí
const SATURDAYS = ["2026-11-21", "2026-11-28", "2026-12-05"];

describe("datum svatby", () => {
  it("často pátek před zápasem, nikdy dřív než pár dní po ohlášení", () => {
    let eve = 0;
    for (let seed = 1; seed <= 300; seed++) {
      const plan = planWeddingDate({ today: TODAY, matchDays: SATURDAYS, rng: createRng(seed) });
      const lead = (Date.parse(plan.weddingDate) - Date.parse(TODAY)) / 86_400_000;
      expect(lead, `seed ${seed}`).toBeGreaterThanOrEqual(WEDDING_MIN_LEAD_DAYS);
      if (plan.matchDate) {
        eve++;
        expect(new Date(`${plan.weddingDate}T12:00:00Z`).getUTCDay(), `seed ${seed}`).toBe(5);
        expect(SATURDAYS).toContain(plan.matchDate);
      } else {
        // Bez zápasu druhý den: svatba ani den po ní nepadne na zápas.
        const after = new Date(Date.parse(`${plan.weddingDate}T12:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
        expect(SATURDAYS, `seed ${seed}`).not.toContain(plan.weddingDate);
        expect(SATURDAYS, `seed ${seed}`).not.toContain(after);
      }
    }
    expect(eve).toBeGreaterThan(180);
    expect(eve).toBeLessThan(300);
  });

  it("první sobotní zápas je moc brzo, svatba padne až na další pátek", () => {
    const plan = planWeddingDate({ today: "2026-11-18", matchDays: SATURDAYS, rng: { random: () => 0 } as never });
    expect(plan).toEqual({ weddingDate: "2026-11-27", matchDate: "2026-11-28" });
  });

  it("bez zápasů v dosahu sobota bez zápasu a match_date null", () => {
    const plan = planWeddingDate({ today: TODAY, matchDays: [], rng: createRng(3) });
    expect(plan.matchDate).toBeNull();
    expect(new Date(`${plan.weddingDate}T12:00:00Z`).getUTCDay()).toBe(6);
  });

  it("je deterministické", () => {
    expect(planWeddingDate({ today: TODAY, matchDays: SATURDAYS, rng: createRng(9) }))
      .toEqual(planWeddingDate({ today: TODAY, matchDays: SATURDAYS, rng: createRng(9) }));
  });

  it("rozhodnutí se uzavře den před svatbou a absence jde nahlásit jen dva dny dopředu", () => {
    expect(decisionClosesOn("2026-11-27")).toBe("2026-11-26");
    expect(canAnnounceHangover("2026-11-26", "2026-11-28")).toBe(true);
    expect(canAnnounceHangover("2026-11-27", "2026-11-28")).toBe(false);
    expect(canAnnounceHangover("2026-11-26", null)).toBe(false);
  });

  it("den svatby a lhůta česky", () => {
    expect(czechDayWords("2026-11-27")).toBe("v pátek 27. 11.");
    expect(czechDayWords("2026-11-25")).toBe("ve středu 25. 11.");
    expect(czechDayWords("2026-11-26")).toBe("ve čtvrtek 26. 11.");
    expect(czechDeadlineWords("2026-11-25")).toBe("do středy");
    expect(czechDeadlineWords("2026-11-26")).toBe("do čtvrtka");
  });
});

describe("kocovina po svatbě", () => {
  const guests = [
    { id: "a", alcohol: 95 }, { id: "b", alcohol: 85 }, { id: "c", alcohol: 80 }, { id: "d", alcohol: 78 },
    { id: "e", alcohol: 60 }, { id: "f", alcohol: 55 }, { id: "abstinent", alcohol: 20 },
  ];

  it("nikdo neodpověděl nebo dar: nejtvrdší pijáci na zápas nepřijdou, ostatní pijáci ztratí kondici", () => {
    for (const choice of ["none", "gift"] as const) {
      const plan = planHangover(guests, choice, createRng(1));
      expect(plan.absent).toEqual(["a", "b", "c"].slice(0, WEDDING_MAX_ABSENT));
      expect(plan.conditionDrops.map((d) => d.playerId)).toEqual(["d", "e", "f"]);
      for (const d of plan.conditionDrops) {
        expect(d.drop).toBeGreaterThanOrEqual(10);
        expect(d.drop).toBeLessThanOrEqual(20);
      }
    }
  });

  it("přijdu a pohlídám kluky: poloviční kocovina", () => {
    const full = planHangover(guests, "none", createRng(7));
    const half = planHangover(guests, "attend", createRng(7));
    expect(half.absent).toEqual(full.absent.slice(0, Math.floor(full.absent.length / 2)));
    expect(half.absent.length).toBe(1);
    // Kdo by jinak chyběl, dostane aspoň poloviční ztrátu kondice; ostatní přesně polovinu.
    const fullDrop = new Map(full.conditionDrops.map((d) => [d.playerId, d.drop]));
    for (const d of half.conditionDrops) {
      if (fullDrop.has(d.playerId)) expect(d.drop).toBe(Math.round(fullDrop.get(d.playerId)! / 2));
      else expect(d.drop).toBeGreaterThanOrEqual(5);
    }
    expect(half.conditionDrops.map((d) => d.playerId).sort()).toEqual(["b", "c", "d", "e", "f"]);
    const sum = (p: typeof full) => p.conditionDrops.reduce((s, d) => s + d.drop, 0) + p.absent.length * 100;
    expect(sum(half)).toBeLessThan(sum(full));
  });

  it("zákaz pití: žádná kocovina", () => {
    expect(planHangover(guests, "ban", createRng(1))).toEqual({ absent: [], conditionDrops: [] });
  });

  it("abstinent se nikdy neopije", () => {
    const plan = planHangover(guests, "none", createRng(2));
    expect([...plan.absent, ...plan.conditionDrops.map((d) => d.playerId)]).not.toContain("abstinent");
  });
});

describe("odpověď trenéra na pozvánku: pravidlo bez modelu", () => {
  it.each([
    "Jasně že přijdu, to si nenechám ujít, a na kluky dohlídnu ať to v sobotu nevypadá jak minule u Vency",
    "no to je paráda franto!! doražim urcite i se zenou, a pohlidam ty magory at se neztriskaj jak dobytek",
    "Gratuluju ty vole, budu tam, kurva to bude jízda, už se těšim na řízky",
    "jasne jdu, vemu si oblek co sem mel na pohrbu strejdy, snad se do nej jeste vejdu haha",
  ])("přijde: %s", (text) => {
    expect(mightBeWeddingReply(text)).toBe(true);
    const r = readWeddingReplyByRules(text);
    expect(r).toMatchObject({ attend: true, ban: false });
    expect(weddingDecisionFromReply(r!)).toMatchObject({ choice: "attend", giftAmount: null });
  });

  it.each([
    "Gratuluju, ale v sobotu hrajem o všechno, takže kluci na svatbě ani kapku, jasný? Žádnej chlast, jen kofola.",
    "Hele svatba super ale zakazuju jim chlastat, kdo se ožere ten v sobotu nehraje a ještě platí pokutu do kasy",
    "nikam nejezděte vy kreténi, v sobotu je derby s Lhotou a nechci aby se nikdo zkurvil jak posledně",
    "Kluci nesmí na tý svatbě pít, to jim vyřiď, jinak si mě nepřej",
  ])("zákaz: %s", (text) => {
    expect(mightBeWeddingReply(text)).toBe(true);
    const r = readWeddingReplyByRules(text);
    expect(r?.ban).toBe(true);
    expect(weddingDecisionFromReply(r!)?.choice).toBe("ban");
  });

  it.each([
    ["Nemůžu přijít, mám tu fofr v práci, ale pošlu ti obálku, dva litry, a užijte si to", 2000],
    ["pošlu ti dar 5000 Kč, gratuluju a ať vám to vydrží líp než mně", 5000],
    ["Dorazit nestihnu sorry kámo, posílám aspoň tisícovku na svatební cestu", 1000],
    ["Na svatbu nedorazim, mam smenu, ale dostanes ode me darek 3 tisice", 3000],
  ])("dar: %s", (text, amount) => {
    const r = readWeddingReplyByRules(text);
    expect(r).toMatchObject({ attend: false, ban: false, gift: true });
    expect(weddingDecisionFromReply(r!)).toEqual({ choice: "gift", giftAmount: amount });
  });

  it("dar bez částky dostane obvyklou částku", () => {
    const r = readWeddingReplyByRules("Přijít nemůžu, ale nějakej dárek ti pošlu, neboj");
    expect(weddingDecisionFromReply(r!)).toEqual({ choice: "gift", giftAmount: WEDDING_GIFT_DEFAULT });
  });

  it("přijdu s obálkou: přijde a dar navíc", () => {
    const r = readWeddingReplyByRules("Přijdu a přinesu obálku, 3 tisíce, ať máte na začátek");
    expect(weddingDecisionFromReply(r!)).toEqual({ choice: "attend", giftAmount: 3000 });
  });

  it("přijdu, ale chlastat se nebude: zákaz vyhrává", () => {
    const r = readWeddingReplyByRules("Přijdu rád, ale chlastat se nebude, v sobotu hrajeme o postup");
    expect(weddingDecisionFromReply(r!)?.choice).toBe("ban");
  });

  it.each([
    "Díky za pozvání, ještě nevím, uvidím jak to vyjde s prací, možná dorazím",
    "Nepřijdu, mám směnu, sorry",
    "Gratuluju!!! To je super zpráva",
    "na svatbě nesmím chybět, to dá rozum",
  ])("nic nerozhodl: %s", (text) => {
    const r = readWeddingReplyByRules(text);
    const d = r ? weddingDecisionFromReply(r) : null;
    // „Nesmím chybět“ je slib, že přijde, ne zákaz.
    if (text.includes("chybět")) expect(d?.choice).toBe("attend");
    else expect(d).toBeNull();
  });

  it("běžná zpráva projde sítem bez povšimnutí", () => {
    expect(mightBeWeddingReply("zítra trénink v šest, nezapomeň kopačky a chrániče")).toBe(false);
    expect(readWeddingReplyByRules("zítra trénink v šest, nezapomeň kopačky a chrániče")).toBeNull();
  });
});

describe("částka daru", () => {
  it.each([
    ["dám ti 2 000 Kč", 2000], ["obálka 2.000", 2000], ["pošlu 5k", 5000], ["pět tisíc", 5000],
    ["tisícovku", 1000], ["dva litry", 2000], ["pětistovku", 500], ["3 táce", 3000], ["litr", 1000],
    ["dvě tisícovky", 2000], ["přijdu v sobotu", null],
  ] as const)("%s", (text, amount) => {
    expect(parseGiftAmount(text)).toBe(amount);
  });

  it("dar má meze", () => {
    expect(clampWeddingGift(100_000)).toBe(WEDDING_GIFT_MAX);
    expect(clampWeddingGift(100)).toBe(WEDDING_GIFT_MIN);
    expect(clampWeddingGift(2500)).toBe(2500);
  });
});

describe("odpověď modelu", () => {
  it("model smí rozhodnout jen to, pro co je ve zprávě opora", () => {
    const text = "Jasně, přijdu a dohlídnu na ně, gratuluju";
    expect(checkModelWeddingReply({ attend: true, ban: true, gift: true, amount: 9000 }, text))
      .toEqual({ attend: true, ban: false, gift: false, amount: null });
  });

  it("částku od modelu vezme, když je ve zprávě", () => {
    expect(checkModelWeddingReply({ attend: false, ban: false, gift: true, amount: 3000 }, "posílám obálku se třema tácama"))
      .toEqual({ attend: false, ban: false, gift: true, amount: 3000 });
  });

  it("nesmysl od modelu je null", () => {
    expect(checkModelWeddingReply("ano", "přijdu")).toBeNull();
    expect(checkModelWeddingReply(null, "přijdu")).toBeNull();
  });
});

describe("dopady a texty", () => {
  it("zákaz zhorší vztah ženicha, dar ho zlepší, přijít se počítá až po svatbě", () => {
    expect(decisionEffect("ban", null)?.relation).toBeLessThan(0);
    expect(decisionEffect("gift", 5000)?.relation).toBeGreaterThan(decisionEffect("gift", 500)!.relation);
    expect(decisionEffect("attend", null)).toBeNull();
    expect(decisionEffect("none", null)).toBeNull();
    expect(ATTEND_EFFECT.relation).toBeGreaterThan(0);
  });

  it("vztah a nálada jen slovy, bez dlouhé pomlčky", () => {
    const texts = [
      weddingNoteText("Franta", "attend", null), weddingNoteText("Franta", "ban", null),
      weddingNoteText("Franta", "gift", 2000), weddingNoteText("Franta", "attend", 1000),
      decisionEffect("ban", null)!.description, decisionEffect("gift", 2000)!.description, ATTEND_EFFECT.description,
      ...(["attend", "gift", "ban", "none"] as const).flatMap((c) => {
        const a = weddingArticleFallback({ groom: "Franta Novák", teamName: "Sokol Lhota", choice: c }, createRng(1));
        return [a.headline, a.text];
      }),
    ];
    for (const t of texts) {
      expect(t).not.toContain("—");
      expect(t.length).toBeGreaterThan(0);
    }
    expect(weddingNoteText("Franta", "gift", 2000)).toContain("2 000 Kč");
  });
});
