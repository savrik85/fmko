import { describe, expect, it } from "vitest";
import { accountLines } from "./match-day-economics";

describe("zápasový účet", () => {
  it("položky zápasu podle typu, od největšího příjmu; splátka půjčky do účtu nepatří", () => {
    const lines = accountLines([
      { type: "match_income", amount: 5344, description: "Vstupné: 269 × 20 Kč" },
      { type: "concession_income_self", amount: 120073, description: "Tržby z vlastního občerstvení" },
      { type: "bus_subsidy", amount: -2000, description: "Stará Karosa z Vimperk" },
      { type: "bus_subsidy", amount: -2000, description: "Stará Karosa z Čkyně" },
      { type: "cash_loan_repayment", amount: -4446, description: "Splátka půjčky (1/26)" },
    ]);
    expect(lines.map((l) => [l.label, l.amount])).toEqual([
      ["Bufet, tržby", 120073],
      ["Vstupné", 5344],
      ["Autobus", -4000],
    ]);
    // Víc položek stejného typu: popis jedné by klamal, proto žádný.
    expect(lines.find((l) => l.label === "Autobus")?.detail).toBeNull();
    expect(lines.find((l) => l.label === "Vstupné")?.detail).toBe("Vstupné: 269 × 20 Kč");
  });

  it("neznámý typ si nese popis z účetnictví", () => {
    expect(accountLines([{ type: "something_new", amount: 100, description: "Něco nového" }])[0].label).toBe("Něco nového");
  });
});
