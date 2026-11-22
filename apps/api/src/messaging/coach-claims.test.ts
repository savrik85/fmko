/**
 * Oznámení trenéra v SMS (vyhazov, prodej, policie, páska, plat): co je oznámení a co jen
 * výhrůžka, otázka nebo zápor. Věty jsou ze skutečných SMS trenérů na produkci (9–11/2026).
 */
import { describe, expect, it } from "vitest";
import { NOT_COUNTED_ON_RE } from "../hearsay/effects";
import {
  claimHolds, claimNote, claimPromptLines, detectCoachClaims, type ClaimKind, type ClaimState, type CoachClaimMemory,
} from "./coach-claims";

const kinds = (text: string) => detectCoachClaims(text).map((c) => c.kind);

describe("oznámení akce v SMS trenéra", () => {
  it.each<[string, ClaimKind[]]>([
    ["Vrat poháry, sbal se a vypadni.", ["dismissal"]],
    ["Tady už si nezahraješ, takovýhle přístup neztrpím a ty poháry okamžitě zpět!", ["dismissal"]],
    ["Tak půjdeš z týmu", ["dismissal"]],
    ["Hledej si klub, tady končíš.", ["dismissal"]],
    ["Ok jak chces. Mohli jsme to vyresit v klidu jako chlapy. Predal jsem to policii", ["police"]],
    ["Policii jsem to nahlásil, uvidíme co dál", ["police"]],
    ["Celou věc jsem předal policii k prošetření.", ["police"]],
    ["Řeší to policie. Jestli víš něco bližšího budu rád za každou informaci.", ["police"]],
    ["Beru ti pásku magore! Tohle neni normalni", ["captaincy"]],
    ["Dobře. Dávám tě na seznam nepotřebných hráčů určených k prodeji a po sezoně tě připustíme. S platem nepočítej", ["transfer_list", "wage_cut"]],
    ["Půjčím tě na hostování do Dobrše.", ["loan_list"]],
    ["Měl jsi šanci tu si prosral. Já tě nebudu stavět a ani na trénink chodit nemusíš", ["not_counted_on"]],
    // E2E 22. 11. (C7): běžný slovosled a vložená slova.
    ["Milane, po tom, co jsi předvedl, ti beru pásku.", ["captaincy"]],
    ["Pásku ti beru, kapitánem nebudeš.", ["captaincy"]],
    ["Odebírám ti kapitánskou pásku.", ["captaincy"]],
    ["Vzal jsem ti pásku, smiř se s tím.", ["captaincy"]],
    ["Kubo, ty světlice na trávníku jsem už předal policii.", ["police"]],
    ["Honzo, kvůli té kase jsem volal policii, třeba něco zjistí.", ["police"]],
    ["Už jsem zavolal policii.", ["police"]],
    ["Volal jsem už policajty, ať si to vyřeší.", ["police"]],
    ["Nahlásil jsem to policajtům.", ["police"]],
    ["Dal jsem to fízlům.", ["police"]],
    ["Policajtům jsem to už nahlásil.", ["police"]],
  ])("%s", (text, expected) => {
    expect(kinds(text).sort()).toEqual([...expected].sort());
  });

  it("výhrůžka s podmínkou, otázka a zápor oznámení nejsou", () => {
    for (const t of [
      "Ještě ti dávám poslední šanci. Přečti si cos psal a omluv se všem, jinak si nemáme o čem povídat a jdeš z týmu",
      "Zkus to znovu a volam policii!!!",
      "Jestli ty pomůcky zítra nebudou, udávám tě policii!",
      "Tak se seber a vypadni jestli se hodláš chovat takhle.",
      "Ještě jednou něco provedeš a na hodinu tě propustím.",
      "Takže končíš?",
      "Nebudu tě dávat na prodej, neboj.",
      "Neboj, pásku ti neberu.",
      "Ok, zavolám policii",
      "Nechci volat policajty ani to šířit.",
      "Jestli to uděláš ještě jednou, beru ti pásku.",
      "Jestli to nevrátíš, předám to policii.",
      "Policii jsem nevolal, neboj.",
      "Pásku ti zatím nechám.",
      "Zítra to předám fízlům.",
    ]) expect(kinds(t), t).toEqual([]);
  });

  it("o někom jiném a popis hostování oznámení nejsou", () => {
    for (const t of [
      "Vyreseno vyhodil jsem ho. Ted se ale chci zeptat jestli neco nevis o tom rozrytem travniku?",
      "Jsi výborný fotbalista a myslím že i fajn chlap, jsi tu na hostování a byla by škoda si to tady rozjebat.",
      "Neprodám tě, jsi náš.",
    ]) expect(kinds(t), t).toEqual([]);
  });

  it("vyhazov nebo prodej v sobě „nepočítám s tebou“ mají, zvlášť se neuvádí", () => {
    expect(kinds("Hledej si klub. Prodám tě.")).toEqual(["transfer_list"]);
    expect(detectCoachClaims("Tak půjdeš z týmu")[0].quote).toBe("Tak půjdeš z týmu");
  });
});

describe("jeden zdroj slov s NOT_COUNTED_ON_RE (left-out)", () => {
  it("vyhazov je taky „nepočítám s tebou“, popis hostování ne", () => {
    expect(NOT_COUNTED_ON_RE.test("Vrat poháry, sbal se a vypadni.")).toBe(true);
    expect(NOT_COUNTED_ON_RE.test("Tady už si nezahraješ")).toBe(true);
    expect(NOT_COUNTED_ON_RE.test("jsi tu na hostování a byla by škoda si to tady rozjebat")).toBe(false);
    expect(NOT_COUNTED_ON_RE.test("Neprodám tě, jsi náš.")).toBe(false);
  });
});

const state = (o: Partial<ClaimState> = {}): ClaimState => ({
  firstName: "Radek", lastName: "Študlar", inClub: true, listing: null, loanedOut: false, policeOnCase: false,
  openIncidentId: null, culpritIncidentId: null, wearsArmband: true, wageCut: false, ...o,
});

describe("stalo se to ve hře?", () => {
  it("podle kádru, listiny, policie, pásky a srážek", () => {
    expect(claimHolds("dismissal", state())).toBe(false);
    expect(claimHolds("dismissal", state({ inClub: false }))).toBe(true);
    expect(claimHolds("transfer_list", state({ listing: "transfer" }))).toBe(true);
    expect(claimHolds("loan_list", state({ loanedOut: true }))).toBe(true);
    expect(claimHolds("police", state({ policeOnCase: true }))).toBe(true);
    expect(claimHolds("captaincy", state())).toBe(false);
    expect(claimHolds("captaincy", state({ wearsArmband: false }))).toBe(true);
    expect(claimHolds("wage_cut", state({ wageCut: true }))).toBe(true);
    expect(claimHolds("not_counted_on", state())).toBe(true);
    // Nevíme (dotaz selhal): neposuzuje se.
    expect(claimHolds("police", state({ policeOnCase: null }))).toBeNull();
  });
});

describe("co hráč ví", () => {
  const claim = (kind: ClaimKind, holds: boolean, quote = "Tak půjdeš z týmu"): CoachClaimMemory => ({ kind, quote, on: "2026-09-26", holds });

  it("neprovedené oznámení je výhrůžka, ne hotová věc", () => {
    const [line] = claimPromptLines([claim("dismissal", false)]);
    expect(line).toContain("Trenér ti 26. 9. napsal „Tak půjdeš z týmu“");
    expect(line).toContain("pořád jsi v kádru");
    expect(line).toContain("Ber to jako výhrůžku");
    expect(claimPromptLines([claim("police", false, "Predal jsem to policii")])[0]).toContain("Nevymýšlej si policajty ani výslech.");
    expect(claimPromptLines([claim("captaincy", false, "Beru ti pásku magore!")])[0]).toContain("Kapitánskou pásku ale zatím pořád máš ty.");
  });

  it("provedené oznámení je fakt; listinu a hostování řeší řádek o trhu", () => {
    expect(claimPromptLines([claim("captaincy", true)])[0]).toContain("kapitánem už nejsi");
    expect(claimPromptLines([claim("police", true)])[0]).toContain("případ řeší policie");
    expect(claimPromptLines([claim("transfer_list", true), claim("loan_list", true)])).toEqual([]);
    expect(claimPromptLines([claim("not_counted_on", true, "Já tě nebudu stavět")])[0]).toContain("nediv se, že nehraješ");
  });
});

describe("poznámka pro trenéra", () => {
  it("říká, že se ve hře nic nestalo, a vede tam, kde to udělá", () => {
    expect(claimNote("dismissal", state(), "p1")).toEqual({
      body: "ℹ️ Ve hře se zatím nic nezměnilo, Radek Študlar je pořád v kádru. Propustit ho můžeš na jeho kartě.",
      href: "/hrac/p1", label: "Otevřít kartu hráče",
    });
    expect(claimNote("police", state({ openIncidentId: "inc-1" }), "p1")).toMatchObject({ href: "/incidenty?id=inc-1", label: "Otevřít incident" });
    expect(claimNote("police", state(), "p1")).toMatchObject({ href: null });
    expect(claimNote("captaincy", state(), "p1")).toMatchObject({ href: "/zapas", label: "Otevřít sestavu" });
    expect(claimNote("wage_cut", state({ culpritIncidentId: "inc-2" }), "p1")?.href).toBe("/incidenty?id=inc-2");
    expect(claimNote("not_counted_on", state(), "p1")).toBeNull();
  });

  it("texty bez dlouhé pomlčky", () => {
    for (const k of ["dismissal", "transfer_list", "loan_list", "police", "captaincy", "wage_cut"] as const) {
      expect(claimNote(k, state({ openIncidentId: "i" }), "p1")?.body).not.toContain("—");
      expect(claimPromptLines([{ kind: k, quote: "x", on: "2026-11-01", holds: false }]).join(" ")).not.toContain("—");
    }
  });
});
