import { describe, expect, it } from "vitest";
import { getOccupationByName, occupationMatchAbsence } from "../generators/occupations";
import { SPONSOR_TYPES } from "./types";
import {
  JOB_BY_TYPE, JOB_MIN_FAVOR, JOB_REPEAT_DAYS, JOB_SLOTS_BY_TYPE, JOB_STRANGER_MIN_FAVOR,
  decideJob, jobForFirm, jobPlayerEffect, jobRequiredFavor, sponsorJobActive, type JobInput,
} from "./player-jobs";
import {
  ALL_JOB_TEMPLATES, jobAskWhoText, jobDuplicateText, jobHiredText, jobInstruction, jobPlayerThanksText, jobRefusedText,
} from "./job-texts";

const BASE: JobInput = {
  favor: 70, relation: "main", personality: "patriot", sponsorType: "construction",
  playerAge: 28, playerOccupation: "Skladník", alreadyAtFirm: false, hiredThisSeason: 0, lastRefusedDaysAgo: null,
};

describe("práce podle oboru firmy", () => {
  it("každý obor má povolání, které hra zná, a aspoň jedno volné místo za sezónu", () => {
    for (const t of SPONSOR_TYPES) {
      expect(getOccupationByName(JOB_BY_TYPE[t]), t).toBeDefined();
      expect(JOB_SLOTS_BY_TYPE[t], t).toBeGreaterThanOrEqual(1);
    }
  });

  it("řemeslník z oboru si nechá svoje řemeslo, ostatní dostanou práci firmy", () => {
    expect(jobForFirm("construction", "Tesař")).toEqual({ occupation: "Tesař", tradeMatch: true });
    expect(jobForFirm("construction", "Hasič")).toEqual({ occupation: "Zedník", tradeMatch: false });
    expect(jobForFirm("woodwork", "Dělník v pile").tradeMatch).toBe(true);
    // Neznámý obor ze starých dat: obecná práce, nic nespadne.
    expect(getOccupationByName(jobForFirm("neco_stareho", "Hasič").occupation)).toBeDefined();
  });

  it("dělnický obor bere snáz než kancelář, řemeslo z oboru pomáhá", () => {
    const labour = jobRequiredFavor({ sponsorType: "construction", relation: "banner", personality: "fan", tradeMatch: false });
    const office = jobRequiredFavor({ sponsorType: "it", relation: "banner", personality: "fan", tradeMatch: false });
    expect(office).toBeGreaterThan(labour);
    expect(jobRequiredFavor({ sponsorType: "construction", relation: "banner", personality: "fan", tradeMatch: true })).toBeLessThan(labour);
  });

  it("hlavní sponzor vezme hráče při nižší oblibě než firma bez smlouvy", () => {
    const main = jobRequiredFavor({ sponsorType: "shop", relation: "main", personality: "businessman", tradeMatch: false });
    const none = jobRequiredFavor({ sponsorType: "shop", relation: "none", personality: "businessman", tradeMatch: false });
    expect(none).toBeGreaterThan(main);
  });
});

describe("decideJob", () => {
  it("s oblibou a volným místem vezme hráče do práce", () => {
    expect(decideJob(BASE)).toEqual({ kind: "hired", occupation: "Zedník", tradeMatch: false });
  });

  it("bez obliby sponzor odmítne", () => {
    expect(decideJob({ ...BASE, favor: JOB_MIN_FAVOR - 1 })).toEqual({ kind: "refused", refusal: "dislike" });
    const required = jobRequiredFavor({ sponsorType: "it", relation: "banner", personality: "cautious", tradeMatch: false });
    expect(decideJob({ ...BASE, sponsorType: "it", relation: "banner", personality: "cautious", favor: required - 1 }))
      .toEqual({ kind: "refused", refusal: "dislike" });
    expect(decideJob({ ...BASE, sponsorType: "it", relation: "banner", personality: "cautious", favor: required }).kind).toBe("hired");
  });

  it("firma bez smlouvy bere jen klubu, kterému fandí", () => {
    expect(decideJob({ ...BASE, relation: "none", favor: JOB_STRANGER_MIN_FAVOR - 1 })).toEqual({ kind: "refused", refusal: "stranger" });
    expect(decideJob({ ...BASE, relation: "none", favor: JOB_STRANGER_MIN_FAVOR + 10 }).kind).toBe("hired");
  });

  it("plná firma, nedávné odmítnutí, kluk, student, důchodce a hráč, který už tam dělá", () => {
    expect(decideJob({ ...BASE, hiredThisSeason: JOB_SLOTS_BY_TYPE.construction })).toEqual({ kind: "refused", refusal: "full" });
    expect(decideJob({ ...BASE, lastRefusedDaysAgo: JOB_REPEAT_DAYS - 1 })).toEqual({ kind: "refused", refusal: "too_soon" });
    expect(decideJob({ ...BASE, lastRefusedDaysAgo: JOB_REPEAT_DAYS }).kind).toBe("hired");
    expect(decideJob({ ...BASE, playerAge: 16 })).toEqual({ kind: "refused", refusal: "too_young" });
    expect(decideJob({ ...BASE, playerOccupation: "Student", playerAge: 20 })).toEqual({ kind: "refused", refusal: "student" });
    expect(decideJob({ ...BASE, playerOccupation: "Důchodce", playerAge: 62 })).toEqual({ kind: "refused", refusal: "retired" });
    expect(decideJob({ ...BASE, alreadyAtFirm: true, favor: 0 })).toEqual({ kind: "refused", refusal: "already_hired" });
  });

  it("malá hospoda vezme za sezónu jednoho, stavebka víc", () => {
    expect(JOB_SLOTS_BY_TYPE.pub).toBe(1);
    expect(JOB_SLOTS_BY_TYPE.construction).toBeGreaterThan(JOB_SLOTS_BY_TYPE.pub);
    expect(decideJob({ ...BASE, sponsorType: "pub", favor: 90, hiredThisSeason: 1 })).toEqual({ kind: "refused", refusal: "full" });
  });
});

describe("texty k práci pro hráče", () => {
  const REFUSALS = ["dislike", "stranger", "full", "too_soon", "too_young", "student", "retired", "already_hired"] as const;

  it("bez dlouhé pomlčky; po doplnění nezůstane žádná značka", () => {
    for (const t of ALL_JOB_TEMPLATES) expect(t).not.toMatch(/[—–]/);
    const vars = { player: "Jan Novák", job: "Truhlář", firm: "Pila Kučera" };
    const out = [
      jobHiredText(vars, "k1"), jobAskWhoText(true, "k2"), jobAskWhoText(false, "k3"), jobDuplicateText("k4"),
      jobPlayerThanksText(true, vars, "k5"), jobPlayerThanksText(false, vars, "k6"),
      ...REFUSALS.map((r) => jobRefusedText(r, vars, `k-${r}`)),
      ...REFUSALS.map((r) => jobInstruction({ kind: "refused", refusal: r }, vars.player)),
      jobInstruction({ kind: "hired", job: "Truhlář" }, vars.player), jobInstruction({ kind: "duplicate" }, vars.player),
    ];
    for (const t of out) {
      expect(t).not.toMatch(/[{}—–]/);
      expect(t.length).toBeGreaterThan(5);
    }
    expect(jobHiredText(vars, "k1")).toContain("Jan Novák");
    expect(jobHiredText(vars, "k1")).toContain("truhlář");
  });
});

describe("práce u sponzora a zápasy", () => {
  it("šéf ze sponzorské firmy pustí hráče na zápas: šance na absenci kvůli práci klesne", () => {
    for (const before of ["Hasič", "Hospodský", "Zemědělec", "Zedník", "Řidič autobusu"]) {
      const job = jobForFirm("construction", before).occupation;
      expect(occupationMatchAbsence(job, { sponsorJob: true }), before).toBeLessThan(occupationMatchAbsence(before));
    }
    // Večerní provoz v hospodě by jinak bral zápasy, u sponzora ne.
    expect(occupationMatchAbsence("Číšník", { sponsorJob: true })).toBeLessThan(occupationMatchAbsence("Číšník"));
    expect(occupationMatchAbsence("Číšník", { sponsorJob: true })).toBeLessThanOrEqual(0);
  });

  it("kdo byl bez práce, má větší radost než ten, kdo jen mění místo", () => {
    expect(jobPlayerEffect(true).morale).toBeGreaterThan(jobPlayerEffect(false).morale);
    expect(jobPlayerEffect(true).relation).toBeGreaterThan(0);
  });
});

describe("práce u sponzora platí jen v klubu, kde ji trenér sehnal", () => {
  const job = { sponsorId: 1, firm: "Pila", since: "2026-11-20", previous: "Hasič", teamIds: ["club", "club-u21"] };
  it("v áčku i v U21 klubu ano, po přestupu jinam ne", () => {
    expect(sponsorJobActive(job, "club")).toBe(true);
    expect(sponsorJobActive(job, "club-u21")).toBe(true);
    expect(sponsorJobActive(job, "jiny-klub")).toBe(false);
  });
  it("bez práce ne, starší záznam bez týmů a neznámý tým hráče ano", () => {
    expect(sponsorJobActive(undefined, "club")).toBe(false);
    expect(sponsorJobActive({ ...job, teamIds: undefined }, "jiny-klub")).toBe(true);
    expect(sponsorJobActive(job, null)).toBe(true);
  });
});
