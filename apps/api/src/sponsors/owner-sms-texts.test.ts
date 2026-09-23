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
  it("má odpověď pro každou povahu a směr", () => {
    for (const p of OWNER_PERSONALITIES) {
      for (const d of [3, 0, -3]) {
        const t = ownerReplyBack(p, d, `k|${p}|${d}`);
        expect(t.length).toBeGreaterThan(0);
        expect(t).not.toContain("—");
      }
      expect(OWNER_REPLY_BACK[p].up.length).toBeGreaterThanOrEqual(3);
    }
  });
});
