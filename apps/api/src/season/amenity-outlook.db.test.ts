import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Miniflare } from "miniflare";
import { AMENITY_BONUS_CAP, amenityPoints, type AmenityInput } from "./fans-processor";
import {
  equipmentPurchaseAmenity, equipmentRaisesAmenity, loadAmenityInput, withEquipmentAmenity, withFacilityAmenity,
} from "./amenity-outlook";
import { getUpgradeOptions as stadiumUpgradeOptions } from "../stadium/stadium-generator";
import { getUpgradeOptions as equipmentUpgradeOptions, CATEGORIES } from "../equipment/equipment-generator";

/**
 * Ozvučení, sociálky a pořadatelé slibují každé „+N spokojenost po zápase", ale body
 * zázemí se sečtou a useknou na AMENITY_BONUS_CAP. Klub se sociálkami L2 je na stropu
 * a ozvučení za 6 000 Kč mu nepřidá nic. Nabídka to musí říct dřív, než zaplatí.
 */

const empty: AmenityInput = { concessionMode: "external", products: [] };

function stadiumOffer(facilities: Record<string, number>, key: string, input: AmenityInput | null) {
  const options = stadiumUpgradeOptions(facilities, 100, 100, 10, true);
  return withFacilityAmenity(options, facilities, input).find((o) => o.facility === key);
}

function equipmentOffer(levels: Record<string, number>, key: string, input: AmenityInput) {
  const all = Object.fromEntries(CATEGORIES.map((c) => [c, levels[c] ?? 0]));
  const conditions = Object.fromEntries(CATEGORIES.map((c) => [`${c}_condition`, 100]));
  const options = equipmentUpgradeOptions(all, 100, 100, 10);
  return withEquipmentAmenity(options, all, conditions, input).find((o) => o.category === key);
}

describe("nabídka vylepšení ukazuje, co zázemí klubu opravdu přidá", () => {
  it("klub bez zázemí dostane od sociálek celé +1", () => {
    const offer = stadiumOffer({ toilets: 0 }, "toilets", empty);
    expect(offer?.amenity).toMatchObject({ raw: 1, gain: 1, current: 0, cap: AMENITY_BONUS_CAP });
    expect(offer?.amenity?.note).toContain("Tobě přidá +1");
  });

  it("se sociálkami L2 je klub na stropu: ozvučení ani lepší sociálky nepřidají nic", () => {
    const pa = equipmentOffer({}, "pa_system", { ...empty, facilityBonus: 3 });
    expect(pa?.amenity).toMatchObject({ raw: 2, gain: 0, current: 3 });
    expect(pa?.amenity?.note).toContain("už nepřidá");

    const toilets = stadiumOffer({ toilets: 2 }, "toilets", empty);
    expect(toilets?.amenity).toMatchObject({ raw: 3, gain: 0, current: 3 });
  });

  it("kousek pod stropem přidá jen zbytek do stropu", () => {
    const input: AmenityInput = { ...empty, facilityBonus: 1, pitchCondition: 95 };
    const pa = equipmentOffer({}, "pa_system", input);
    expect(pa?.amenity).toMatchObject({ raw: 2, gain: 1, current: 2 });
    expect(pa?.amenity?.note).toContain("jen +1");
    expect(pa?.amenity?.note).toContain("sociálky, trávník jak koberec");
  });

  it("pořadatelé přidávají spokojenost až od druhé úrovně", () => {
    expect(stadiumOffer({ fence: 1, security: 0 }, "security", empty)?.amenity).toBeUndefined();
    expect(stadiumOffer({ fence: 1, security: 1 }, "security", empty)?.amenity).toMatchObject({ raw: 1, gain: 1 });
  });

  it("vylepšení bez vlivu na spokojenost žádnou poznámku nedostane", () => {
    expect(stadiumOffer({ parking: 0 }, "parking", empty)?.amenity).toBeUndefined();
    expect(equipmentOffer({}, "balls", empty)?.amenity).toBeUndefined();
  });

  it("ozvučení z bazaru se počítá ve stavu, v jakém se kupuje", () => {
    const levels = Object.fromEntries(CATEGORIES.map((c) => [c, 0]));
    const conditions = Object.fromEntries(CATEGORIES.map((c) => [`${c}_condition`, 100]));
    // L2 ve stavu 50 % dá round(2 × 0,5 × 2) = 2 body
    const used = equipmentPurchaseAmenity("pa_system", 2, 50, levels, conditions, empty);
    expect(used).toMatchObject({ raw: 2, gain: 2 });
    expect(equipmentPurchaseAmenity("pa_system", 2, 50, levels, conditions, { ...empty, facilityBonus: 3 }))
      .toMatchObject({ gain: 0 });
  });

  it("bazar načítá zázemí jen kvůli vybavení, které ho zvedá", () => {
    expect(CATEGORIES.filter(equipmentRaisesAmenity)).toEqual(["pa_system"]);
  });

  it("bez načteného zázemí se nic neslibuje ani nezamlčuje", () => {
    expect(stadiumOffer({ toilets: 0 }, "toilets", null)?.amenity).toBeUndefined();
  });
});

describe("zázemí klubu z databáze", () => {
  let miniflare: Miniflare;
  let db: D1Database;

  beforeAll(async () => {
    miniflare = new Miniflare({
      modules: true,
      script: "export default { fetch() { return new Response('ok'); } }",
      d1Databases: ["DB"],
    });
    db = await miniflare.getD1Database("DB");
    for (const sql of [
      `CREATE TABLE stadiums (team_id TEXT PRIMARY KEY, toilets INTEGER DEFAULT 0, security INTEGER DEFAULT 0,
        fence INTEGER DEFAULT 0, pitch_condition INTEGER, concession_mode TEXT DEFAULT 'external')`,
      "CREATE TABLE equipment (team_id TEXT PRIMARY KEY, pa_system INTEGER DEFAULT 0, pa_system_condition INTEGER DEFAULT 50)",
      `CREATE TABLE staff_members (team_id TEXT, role TEXT, coaching INTEGER, medicine INTEGER, maintenance INTEGER,
        judgement INTEGER, communication INTEGER, work_rate INTEGER, charm INTEGER)`,
      "CREATE TABLE concession_products (team_id TEXT, product_key TEXT, quality_level INTEGER, sell_price INTEGER)",
    ]) await db.prepare(sql).run();
  });

  afterAll(async () => {
    await miniflare.dispose();
  });

  beforeEach(async () => {
    for (const t of ["stadiums", "equipment", "staff_members", "concession_products"]) {
      await db.prepare(`DELETE FROM ${t}`).run();
    }
  });

  it("sečte všechno, co zápas počítá do zázemí", async () => {
    await db.prepare("INSERT INTO stadiums VALUES ('club', 1, 2, 1, 95, 'self')").run();
    await db.prepare("INSERT INTO equipment VALUES ('club', 1, 50)").run();
    await db.prepare("INSERT INTO staff_members VALUES ('club', 'obsluha', 15, 15, 15, 15, 15, 15, 15)").run();
    await db.prepare("INSERT INTO concession_products VALUES ('club', 'beer', 2, 35), ('club', 'sausage', 1, 30)").run();

    const input = await loadAmenityInput(db, "club");
    // sociálky L1 (+1) a pořadatelé L2 (+1), ozvučení L1 v půlce stavu (+1), obsluha (+1),
    // pivo L2 za férovou cenu (+1), trávník nad 90 (+1)
    expect(amenityPoints(input!)).toEqual({
      points: 6,
      sources: ["ozvučení", "sociálky", "obsluha", "pivo", "trávník jak koberec"],
    });
  });

  it("klub bez stadionu a vybavení nemá žádné zázemí", async () => {
    const input = await loadAmenityInput(db, "nobody");
    expect(amenityPoints(input!).points).toBe(0);
  });
});
