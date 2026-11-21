import { describe, expect, it } from "vitest";
import { pragueHour } from "../lib/match-tick-schedule";
import {
  PARENT_ARCHETYPES, archetypesForClub, checkParentSms, classifyCoachReply, dealAmount, fallbackDealResultSms,
  fallbackOffendedSms, fallbackParentReply, fallbackParentSms, generateParentIdentity, parentCountFor,
  parentDeliveryTime, parentParticipantId, parentWritesAbout, parseParentReply, topicNeedsReply,
  type ParentFacts,
} from "./parents";

const FACTS: ParentFacts = {
  firstName: "Petr", lastName: "Novák", archetype: "ambitious_father", sonFirstName: "Tomáš", sonLastName: "Novák",
  clubName: "Jiskra Husinec", mood: "calm", firstMessage: true,
};
const LONG_DASH = /[—–]/;

describe("kdy rodič píše", () => {
  it("po zápase napíše s prodlevou, ale ne hned a ne v noci", () => {
    // 18:10 v Praze (zima, UTC+1).
    const after = new Date("2026-11-24T17:10:00.000Z");
    for (let seed = 0; seed < 40; seed++) {
      const at = parentDeliveryTime(after, seed);
      expect(at.getTime() - after.getTime()).toBeGreaterThanOrEqual(25 * 60_000);
      const hour = pragueHour(at)!;
      expect(hour >= 8 && hour < 21).toBe(true);
    }
  });

  it("pozdě večer se SMS posune na ráno", () => {
    const late = new Date("2026-11-24T19:50:00.000Z"); // 20:50 v Praze
    for (let seed = 0; seed < 40; seed++) {
      const at = parentDeliveryTime(late, seed);
      const hour = pragueHour(at)!;
      expect(hour >= 8 && hour < 11).toBe(true);
      expect(at.getTime()).toBeGreaterThan(new Date("2026-11-25T06:59:00.000Z").getTime());
    }
  });

  it("tichý rodič si na lavičku nestěžuje; odpověď čeká jen stížnost a starost", () => {
    expect(parentWritesAbout("quiet", "benched")).toBe(false);
    expect(parentWritesAbout("quiet", "win")).toBe(true);
    expect(parentWritesAbout("worried_mother", "benched")).toBe(true);
    expect(topicNeedsReply("ambitious_father", "benched")).toBe(true);
    expect(topicNeedsReply("worried_mother", "injury")).toBe(true);
    expect(topicNeedsReply("sponsor_dad", "benched")).toBe(true);
    expect(topicNeedsReply("ambitious_father", "win")).toBe(false);
    expect(topicNeedsReply("quiet", "injury")).toBe(false);
  });
});

describe("kdo jsou rodiče", () => {
  it("klub má dva nebo tři rodiče, každý s jinou povahou", () => {
    for (const club of ["club-a", "club-b", "club-c", "club-d", "club-e"]) {
      const n = parentCountFor(club);
      expect([2, 3]).toContain(n);
      const picked = archetypesForClub(club, [], n);
      expect(picked).toHaveLength(n);
      expect(new Set(picked).size).toBe(n);
      for (const a of picked) expect(PARENT_ARCHETYPES).toContain(a);
    }
    // Doplnění: povaha, kterou už klub má, se nezopakuje.
    expect(archetypesForClub("club-a", ["sponsor_dad", "quiet"], 1)[0]).not.toMatch(/sponsor_dad|quiet/);
  });

  it("táta má synovo příjmení, máma přechýlené", () => {
    const dad = generateParentIdentity({ id: "p-1", lastName: "Novák" }, "sponsor_dad");
    expect(dad.lastName).toBe("Novák");
    expect(dad.firstName.length).toBeGreaterThan(2);
    const mum = generateParentIdentity({ id: "p-2", lastName: "Veselý" }, "worried_mother");
    expect(mum.lastName).toBe("Veselá");
    expect(() => JSON.parse(mum.avatar)).not.toThrow();
    expect(parentParticipantId("p-2")).toBe("yp-p-2");
  });

  it("příspěvek táty podnikatele je v rozumných mezích, po pětistovkách", () => {
    for (let seed = 0; seed < 50; seed++) {
      const amount = dealAmount(seed);
      expect(amount).toBeGreaterThanOrEqual(3000);
      expect(amount).toBeLessThanOrEqual(6000);
      expect(amount % 500).toBe(0);
    }
  });
});

describe("odpověď trenéra bez modelu", () => {
  it("kývnutí i dlouhou větou s překlepy", () => {
    expect(classifyCoachReply("jo platí, v nedeli de kluk od zacatku, ať taťka pošle prachy").intent).toBe("accept");
    expect(classifyCoachReply("Dobře, beru. Tomáš nastoupí v základu.").intent).toBe("accept");
  });

  it("odmítnutí přebije kývnutí", () => {
    expect(classifyCoachReply("Ne, sestavu si dělám sám a peníze si nechte.").intent).toBe("decline");
    expect(classifyCoachReply("jasne ze ne, nebude hrat dokud nebude makat").intent).toBe("decline");
  });

  it("hrubost se pozná i s vulgaritou", () => {
    expect(classifyCoachReply("Nestarejte se mi do sestavy, kurva, a neotravujte.").tone).toBe("rude");
    expect(classifyCoachReply("drz hubu").tone).toBe("rude");
  });

  it("vlídná zpráva bez dohody", () => {
    expect(classifyCoachReply("Díky za zprávu, kluk je šikovnej, uvidíme v neděli.")).toEqual({ intent: "none", tone: "kind" });
  });
});

describe("texty pro hráče", () => {
  it("připravené SMS jsou bez dlouhé pomlčky a mluví o synovi jménem", () => {
    for (const archetype of PARENT_ARCHETYPES) {
      for (const topic of ["benched", "injury", "win"] as const) {
        if (!parentWritesAbout(archetype, topic)) continue;
        for (let seed = 0; seed < 6; seed++) {
          const text = fallbackParentSms({ ...FACTS, archetype }, topic, seed, { dealAmount: 4500 });
          expect(text).not.toMatch(LONG_DASH);
          expect(text).toContain("Tomáš");
          expect(text).toMatch(/trenére/i);
        }
      }
    }
  });

  it("táta podnikatel v nabídce řekne přesnou částku", () => {
    const text = fallbackParentSms({ ...FACTS, archetype: "sponsor_dad" }, "benched", 3, { dealAmount: 4500 });
    expect(text.replace(/\s/g, "")).toContain("4500Kč");
  });

  it("uražená máma pohrozí Vimperkem, tichý rodič mlčí", () => {
    expect(fallbackOffendedSms({ ...FACTS, archetype: "worried_mother", firstName: "Jana", lastName: "Nováková" }, 1)).toMatch(/Vimperk/);
    expect(fallbackOffendedSms({ ...FACTS, archetype: "quiet" }, 1)).toBeNull();
  });

  it("výsledek dohody: poděkování s částkou, nebo zklamání bez peněz", () => {
    const kept = fallbackDealResultSms({ ...FACTS, archetype: "sponsor_dad" }, "kept", 5000, 2);
    expect(kept.replace(/\s/g, "")).toContain("5000Kč");
    const broken = fallbackDealResultSms({ ...FACTS, archetype: "sponsor_dad" }, "broken", 5000, 2);
    expect(broken).not.toMatch(/\d/);
    for (const t of [kept, broken]) expect(t).not.toMatch(LONG_DASH);
  });

  it("odpovědi rodiče bez modelu podle toho, co trenér napsal", () => {
    const dad = { ...FACTS, archetype: "sponsor_dad" as const };
    expect(fallbackParentReply(dad, "deal_accepted", 1, 4000).replace(/\s/g, "")).toContain("4000Kč");
    for (const outcome of ["deal_accepted", "deal_declined", "rude", "kind", "neutral"] as const) {
      expect(fallbackParentReply(dad, outcome, 2, 4000)).not.toMatch(LONG_DASH);
    }
  });
});

describe("kontrola textu od modelu", () => {
  it("pomlčky pryč, prázdná nebo dlouhá SMS neprojde", () => {
    expect(checkParentSms({ body: "Trenére — kluk zase seděl." })).toBe("Trenére, kluk zase seděl.");
    expect(checkParentSms({ body: "" })).toBeNull();
    expect(checkParentSms({ body: "x".repeat(700) })).toBeNull();
  });

  it("nabídka bez přesné částky neprojde, máma bez Vimperka taky ne", () => {
    expect(checkParentSms({ body: "Trenére, když bude hrát, něco pošlu." }, { requireAmount: 4500 })).toBeNull();
    expect(checkParentSms({ body: "Trenére, když bude hrát od začátku, pošlu klubu 4 500 Kč." }, { requireAmount: 4500 })).not.toBeNull();
    expect(checkParentSms({ body: "Trenére, tohle si nenechám líbit." }, { requireWord: "Vimperk" })).toBeNull();
  });

  it("odpověď rodiče: text, záměr a tón; neznámé hodnoty jako nic", () => {
    expect(parseParentReply('{"body": "Platí, trenére.", "intent": "accept", "tone": "kind"}'))
      .toEqual({ body: "Platí, trenére.", intent: "accept", tone: "kind" });
    expect(parseParentReply({ body: "Hm.", intent: "maybe", tone: "weird" })).toEqual({ body: "Hm.", intent: "none", tone: "neutral" });
    expect(parseParentReply({ intent: "accept" })).toBeNull();
  });
});
