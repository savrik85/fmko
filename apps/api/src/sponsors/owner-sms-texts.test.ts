/**
 * Šablony SMS od majitelů: úplnost poolů, žádné zbylé značky, žádná dlouhá pomlčka,
 * výběr bez opakování a správné tvary počtů.
 */
import { describe, expect, it } from "vitest";
import { OWNER_PERSONALITIES } from "./owners";
import {
  OWNER_REPLY_BACK, OWNER_SMS_OCCASIONS, OWNER_SMS_TEXTS, ownerReplyBack, proherTvar, renderOwnerSms, replyOptions,
} from "./owner-sms-texts";

const VARS = { skore: "2:1", serie: 4 };

describe("OWNER_SMS_TEXTS", () => {
  it("každá příležitost má pro každou povahu aspoň tři věty (skandál jen opatrný)", () => {
    for (const o of OWNER_SMS_OCCASIONS) {
      for (const p of OWNER_PERSONALITIES) {
        const pool = OWNER_SMS_TEXTS[o][p];
        if (o === "scandal" && p !== "cautious") {
          expect(pool, `${o}/${p}`).toBeUndefined();
          continue;
        }
        expect(pool?.length ?? 0, `${o}/${p}`).toBeGreaterThanOrEqual(3);
      }
    }
  });

  it("vyrenderovaný text nemá zbylé značky ani dlouhou pomlčku", () => {
    for (const o of OWNER_SMS_OCCASIONS) {
      for (const p of OWNER_PERSONALITIES) {
        for (const t of OWNER_SMS_TEXTS[o][p] ?? []) {
          const out = renderOwnerSms(o, p, VARS, `test|${t}`, (OWNER_SMS_TEXTS[o][p] ?? []).filter((x) => x !== t)
            .map((x) => x.replace("{skore}", "2:1").replace("{serie}", "4 prohry")));
          expect(out, `${o}/${p}`).not.toBeNull();
          expect(out).not.toMatch(/[{}]/);
          expect(out).not.toContain("—");
        }
      }
    }
  });

  it("skandál od neopatrného majitele nevznikne", () => {
    expect(renderOwnerSms("scandal", "fan", {}, "k", [])).toBeNull();
  });

  it("zpráva po zápase bez skóre nevznikne", () => {
    expect(renderOwnerSms("after_win", "fan", {}, "k", [])).toBeNull();
  });

  it("vynechá nedávno odeslané texty", () => {
    const pool = OWNER_SMS_TEXTS.match_eve.fan ?? [];
    const recent = pool.slice(0, pool.length - 1);
    expect(renderOwnerSms("match_eve", "fan", {}, "cokoli", recent)).toBe(pool[pool.length - 1]);
  });

  it("je deterministický podle klíče", () => {
    expect(renderOwnerSms("riot", "cautious", {}, "riot:m1", [])).toBe(renderOwnerSms("riot", "cautious", {}, "riot:m1", []));
  });

  it("zpráva o sérii proher bez počtu proher nevznikne", () => {
    expect(renderOwnerSms("losing_streak", "fan", {}, "k", [])).toBeNull();
  });

  it("série proher se vyrenderuje pro 3 i 5 proher u každé povahy", () => {
    for (const p of OWNER_PERSONALITIES) {
      for (const serie of [3, 5]) {
        const out = renderOwnerSms("losing_streak", p, { serie }, `serie|${p}|${serie}`, []);
        expect(out, `${p}/${serie}`).not.toBeNull();
        expect(out).not.toMatch(/[{}]/);
        expect(out).not.toContain("—");
      }
    }
  });
});

describe("proherTvar", () => {
  it("skloňuje počet proher", () => {
    expect(proherTvar(3)).toBe("3 prohry");
    expect(proherTvar(4)).toBe("4 prohry");
    expect(proherTvar(5)).toBe("5 proher");
    expect(proherTvar(11)).toBe("11 proher");
  });
});

describe("replyOptions", () => {
  it("vždy tři možnosti v pořadí vlídně, věcně, odbýt, bez dlouhé pomlčky", () => {
    for (const o of OWNER_SMS_OCCASIONS) {
      const opts = replyOptions(o);
      expect(opts.map((x) => x.id)).toEqual(["warm", "neutral", "dismissive"]);
      for (const x of opts) {
        expect(x.text.length).toBeGreaterThan(3);
        expect(x.text).not.toContain("—");
      }
    }
  });
});

describe("ownerReplyBack", () => {
  it("má odpověď pro každou povahu, náladu příležitosti a směr", () => {
    for (const p of OWNER_PERSONALITIES) {
      for (const o of OWNER_SMS_OCCASIONS) {
        for (const d of [3, 0, -3]) {
          const t = ownerReplyBack(p, o, d, `k|${p}|${o}|${d}`);
          expect(t.length).toBeGreaterThan(0);
          expect(t).not.toContain("—");
        }
      }
      expect(OWNER_REPLY_BACK[p].positive.up.length).toBeGreaterThanOrEqual(3);
      expect(OWNER_REPLY_BACK[p].positive.down.length).toBeGreaterThanOrEqual(3);
      expect(OWNER_REPLY_BACK[p].negative.up.length).toBeGreaterThanOrEqual(3);
      expect(OWNER_REPLY_BACK[p].negative.down.length).toBeGreaterThanOrEqual(3);
      expect(OWNER_REPLY_BACK[p].positive.neutral.length).toBeGreaterThanOrEqual(2);
      expect(OWNER_REPLY_BACK[p].negative.neutral.length).toBeGreaterThanOrEqual(2);
    }
  });

  it("nulová delta (věcná odpověď bez pohybu náklonnosti) vybere z neutrálního poolu, ne z 'up'", () => {
    for (const p of OWNER_PERSONALITIES) {
      for (const mood of ["positive", "negative"] as const) {
        const occasion = mood === "positive" ? "after_win" : "after_loss";
        const t = ownerReplyBack(p, occasion, 0, `neutral|${p}|${occasion}`);
        expect(OWNER_REPLY_BACK[p][mood].neutral, `${p}/${mood}`).toContain(t);
        expect(OWNER_REPLY_BACK[p][mood].up, `${p}/${mood}`).not.toContain(t);
      }
    }
  });

  it("kladná příležitost nikdy nevrátí větu ze záporného poolu", () => {
    const positiveOccasions = ["match_eve", "after_win", "main_new", "season_thanks"] as const;
    for (const p of OWNER_PERSONALITIES) {
      const negativePool = [...OWNER_REPLY_BACK[p].negative.up, ...OWNER_REPLY_BACK[p].negative.down, ...OWNER_REPLY_BACK[p].negative.neutral];
      for (const o of positiveOccasions) {
        for (const d of [3, 0, -3]) {
          const t = ownerReplyBack(p, o, d, `pos|${p}|${o}|${d}`);
          expect(negativePool, `${p}/${o}/${d}`).not.toContain(t);
        }
      }
    }
  });

  it("konec smlouvy nezní jako pokračování spolupráce", () => {
    for (const p of OWNER_PERSONALITIES) {
      for (const d of [3, 0, -3]) {
        const t = ownerReplyBack(p, "main_lost", d, `main_lost|${p}|${d}`);
        expect(t).not.toContain("Jdeme dál");
        expect(t).not.toMatch(/budeme pokračovat/i);
      }
    }
  });
});

describe("oslovení trenéra", () => {
  // Složený minulý čas ve 2. osobě potřebuje pomocné sloveso „jsi"/„jste" u příčestí na
  // -l/-la/-li/-ly (v obou pořadích: „udělal jsi" i „jsi udělal"). Bez pomocného slovesa jde
  // buď o 3. osobu (netýká se trenéra), nebo o přítomný/budoucí čas, který je v pořádku —
  // regex proto necílí na každé „jste"/„jsi" (to by chytalo i běžné „Jste v pořádku?"), ale
  // jen na dvojici pomocné sloveso + příčestí vedle sebe.
  const pastAddressRegex = /\b(?:jste|jsi)\s+\S*l[aiy]?\b|\b\S*l[aiy]?\s+(?:jste|jsi)\b/i;

  it("žádná věta v OWNER_SMS_TEXTS neosloví trenéra v minulém čase", () => {
    for (const o of OWNER_SMS_OCCASIONS) {
      for (const p of OWNER_PERSONALITIES) {
        for (const t of OWNER_SMS_TEXTS[o][p] ?? []) {
          expect(t).not.toMatch(pastAddressRegex);
        }
      }
    }
  });

  it("žádná věta v OWNER_REPLY_BACK neosloví trenéra v minulém čase", () => {
    for (const p of OWNER_PERSONALITIES) {
      for (const mood of ["positive", "negative"] as const) {
        for (const t of [...OWNER_REPLY_BACK[p][mood].up, ...OWNER_REPLY_BACK[p][mood].down, ...OWNER_REPLY_BACK[p][mood].neutral]) {
          expect(t).not.toMatch(pastAddressRegex);
          expect(t).not.toContain("—");
        }
      }
    }
  });
});
