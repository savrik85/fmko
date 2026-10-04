/**
 * Jednorázově: seed 0244 vložil skautům avatar v nesprávném (plochém) formátu, takže se
 * neukázal obličej. Vygeneruje správné facesjs konfigurace a vypíše UPDATE pro
 * `scout-seed-*` členy štábu. Výstup: `npx tsx apps/api/scripts/fix-seed-scout-avatars.ts > out.sql`.
 */
import { createRng } from "../src/generators/rng";
import { generateStaffFace } from "../src/staff/staff-generator";

const districts: Array<[string, number]> = [["prachatice", 14], ["praha", 12], ["cb", 4]];
const ages = [38, 44, 29, 52, 35, 47, 31, 58, 41, 26, 49, 33, 55, 39];

let n = 0;
for (const [slug, count] of districts) {
  for (let i = 1; i <= count; i++) {
    const id = `scout-seed-${slug}-${String(i).padStart(2, "0")}`;
    const face = generateStaffFace(createRng(920000 + ++n * 7919), false, ages[(i - 1) % ages.length]);
    console.log(`UPDATE staff_members SET avatar = '${JSON.stringify(face).replace(/'/g, "''")}' WHERE id = '${id}';`);
  }
}
