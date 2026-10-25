// Hodnocení hráče v den prodeje: stav z noční zálohy, dovednosti vrácené (nebo posunuté) o změny
// z training_log mezi zálohou a prodejem, přepočet jediným vzorcem hodnocení (overallRatingFromFlat).
// K tomu tržní hodnota podle dnešního vzorce, ať jde porovnat cena s tím, co hra ukazuje.
// Postup viz collect-sales.py.
import { readFileSync } from "node:fs";
import { marketValue } from "../../../../packages/shared/src/types/market-value";
import { overallRatingFromFlat } from "../../src/skills/generator";

type Change = { attribute: string; old: number; new: number; at: string };
type Row = {
  offerId: string; playerId: string; saleAt: string; price: number; upfrontPct: number | null; installments: number | null;
  sellOnPct: number | null; league: string | null; anchorDay: string; anchorAt: string; direction: "back" | "forward";
  position: string; age: number; anchorRating: number; skills: string; physical: string | null; skillsMax: string | null;
  hiddenTalent: number | null; changes: Change[];
};

const rows = JSON.parse(readFileSync(process.argv[2], "utf-8")) as Row[];
const out = [];
for (const r of rows) {
  const skills = JSON.parse(r.skills) as Record<string, unknown>;
  const physical = r.physical ? JSON.parse(r.physical) as Record<string, unknown> : {};
  const skillsMax = r.skillsMax ? JSON.parse(r.skillsMax) as Record<string, unknown> : undefined;
  const atAnchor = overallRatingFromFlat(r.position, skills, physical, r.hiddenTalent ?? 0, skillsMax);

  const saleSkills = { ...skills };
  const salePhysical = { ...physical };
  // Zpět: hodnota v den prodeje = stará hodnota první změny po prodeji. Dopředu: nová hodnota poslední změny před prodejem.
  const byAttribute = new Map<string, Change[]>();
  for (const c of r.changes) byAttribute.set(c.attribute, [...(byAttribute.get(c.attribute) ?? []), c]);
  for (const [attribute, list] of byAttribute) {
    list.sort((a, b) => a.at.localeCompare(b.at));
    const value = r.direction === "back" ? list[0].old : list[list.length - 1].new;
    saleSkills[attribute] = value;
    if (attribute in salePhysical || attribute === "stamina" || attribute === "strength") salePhysical[attribute] = value;
  }
  const atSale = overallRatingFromFlat(r.position, saleSkills, salePhysical, r.hiddenTalent ?? 0, skillsMax);
  const rating = atAnchor !== null && atSale !== null ? r.anchorRating + (atSale - atAnchor) : null;
  out.push({
    offerId: r.offerId, playerId: r.playerId, saleAt: r.saleAt, price: r.price, upfrontPct: r.upfrontPct,
    installments: r.installments, sellOnPct: r.sellOnPct, league: r.league, position: r.position, age: r.age,
    anchorDay: r.anchorDay, anchorRating: r.anchorRating, ratingAtSale: rating,
    marketValue: rating !== null ? marketValue(rating, r.age, r.position) : null,
  });
}
process.stdout.write(JSON.stringify(out));
