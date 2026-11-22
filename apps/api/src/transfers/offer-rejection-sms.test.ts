/**
 * SMS hráče po odmítnuté nabídce: co model ví a předem napsané varianty, když nejede.
 * Dřív 9 vět (2–3 na postoj) dělalo 29 % všech šablon a jeden trenér dostal tutéž pětkrát.
 */
import { describe, expect, it } from "vitest";
import {
  REJECTION_POOLS, rejectionSmsInstruction, squadRoleText, type RejectionSmsFacts, type RejectionStance,
} from "./offer-rejection-impact";

const facts = (over: Partial<RejectionSmsFacts> = {}): RejectionSmsFacts => ({
  teamName: "FK Junior Strakonice", amount: 14000, isLoan: false, trigger: "reject", stance: "wants",
  coachTalked: false, reasons: "lepšímu klubu", leagueNote: "FK Junior Strakonice hraje I. B třídu, o soutěž výš než ty.",
  squadRole: "Patříš do základu.", ...over,
});

describe("varianty po odmítnuté nabídce", () => {
  it("každý postoj má aspoň osm variant, bez dlouhé pomlčky a s klubem", () => {
    for (const [stance, pool] of Object.entries(REJECTION_POOLS) as Array<[RejectionStance, readonly string[]]>) {
      expect(pool.length, stance).toBeGreaterThanOrEqual(8);
      expect(new Set(pool).size, stance).toBe(pool.length);
      for (const t of pool) expect(t).not.toContain("—");
      if (stance !== "loyal") for (const t of pool) expect(t, t).toContain("{team}");
    }
  });

  it("když trenér s hráčem psal, žádná varianta netvrdí „bez jediného slova“", () => {
    for (const t of REJECTION_POOLS.talked) expect(t).not.toMatch(/bez jediného slova|neřekl/);
  });
});

describe("co model ví", () => {
  it("odmítnutí: klub, odstupné pro klub, soutěž, místo v kádru a důvod", () => {
    const text = rejectionSmsInstruction(facts());
    expect(text).toContain("Trenér odmítl nabídku od klubu FK Junior Strakonice.");
    expect(text).toMatch(/14\s000 Kč odstupné/);
    expect(text).toContain("Ty peníze by dostal klub, ne ty.");
    expect(text).toContain("o soutěž výš");
    expect(text).toContain("Patříš do základu.");
    expect(text).toContain("předem nic neřekl");
    expect(text).toContain("kvůli lepšímu klubu");
    expect(text).not.toContain("—");
  });

  it("propadlá nabídka a hostování", () => {
    const text = rejectionSmsInstruction(facts({ trigger: "expire", isLoan: true, amount: 3000 }));
    expect(text).toContain("nechal propadnout");
    expect(text).toContain("na hostování");
    expect(text).not.toContain("odstupné");
  });

  it("trenér o nabídce psal: model nesmí tvrdit, že mu nic neřekl", () => {
    expect(rejectionSmsInstruction(facts({ coachTalked: true, stance: "talked" }))).toContain("netvrď, že ti nic neřekl");
  });

  it("věrný hráč děkuje a důvod odchodu nemá", () => {
    const text = rejectionSmsInstruction(facts({ stance: "loyal", reasons: "lepšímu klubu" }));
    expect(text).toContain("Odejít jsi nechtěl");
    expect(text).not.toContain("Chtěl jsi odejít");
    // David Hájek (E2E 22. 11.): „Fajn, že mě nepustil, trenére.“ Pokyn byl ve 3. osobě a model ho opsal.
    expect(text).not.toContain("že jsi rád, že tě nepustil");
    expect(text).toContain("Oslov ho přímo");
    expect(text).toContain("„Díky, že jste mě nepustil“");
    expect(text).toContain("„Jsem rád, žes mě nepustil“");
    expect(text).not.toContain("—");
  });

  it("porušený slib je v textu", () => {
    expect(rejectionSmsInstruction(facts({ stance: "broken_transfer" }))).toContain("slíbil, že tě při další dobré nabídce pustí");
    expect(rejectionSmsInstruction(facts({ stance: "broken_release" }))).toContain("sám volal");
  });
});

describe("místo v kádru", () => {
  it("podle pořadí v hodnocení", () => {
    expect(squadRoleText(2, 20)).toContain("nejlepším");
    expect(squadRoleText(8, 20)).toContain("základu");
    expect(squadRoleText(14, 20)).toContain("náhradník");
    expect(squadRoleText(19, 20)).toContain("okraji");
    expect(squadRoleText(1, 3)).toBeNull();
  });
});
