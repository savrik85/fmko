/**
 * Audit akademie nad kopií produkční databáze (noční záloha z R2, lokálně, prod se nedotýká).
 * Spuštění (D1 shim nad node:sqlite, bez sítě, jinak dojdou porty):
 *   NODE_OPTIONS=--experimental-sqlite PROD_AUDIT_DB=/cesta/kopie.sqlite PROD_AUDIT_OUT=/cesta/report.txt \
 *   npx vitest run src/academy/prod-audit.sim.test.ts
 * Soubor kopie se přepisuje (audit do něj zapisuje), nikdy nedávat originální zálohu.
 *
 * Kroky: přechod ze staré akademie (seedFromLegacy jako /admin/academy/migrate), založení všem
 * ostatním klubům (krajní případy), jedna sezóna (15 týdnů + konec sezóny) a kontrola anomálií.
 */
import { afterAll, beforeAll, describe, it } from "vitest";
import { writeFileSync } from "node:fs";
import { createRng } from "../generators/rng";
import { seedFromLegacy, foundYouthTeam, setYouthCoach, loadCoachOptions, loadAcademyView, weeklyAcademy, seasonEndAcademy, youthContextForTeam, type ProspectRow } from "./service";
import { coachSonAge, OLDEST_AGE, YOUNGEST_AGE, MAX_SQUAD } from "./rules";

const SRC = process.env.PROD_AUDIT_DB;
const OUT = process.env.PROD_AUDIT_OUT ?? "prod-audit.txt";
let db: D1Database;
const lines: string[] = [];
const anomalies: string[] = [];
const log = (s: string) => lines.push(s);
const flag = (s: string) => anomalies.push(s);
// Očekávané stavy, které nejsou chybou kódu (chudý klub), ale hra na ně musí hráče upozornit
const notes: string[] = [];
const note = (s: string) => notes.push(s);

// Shim nad node:sqlite až tady: CI bez --experimental-sqlite by jinak spadlo už při načtení souboru
beforeAll(async () => {
  if (!SRC) return;
  const { openD1 } = await import("../../scripts/ai-coach-bench/d1-shim");
  db = openD1(SRC);
});

afterAll(() => {
  if (SRC) writeFileSync(OUT, [...lines, "", `=== ANOMÁLIE (${anomalies.length}) ===`, ...anomalies, "", `=== OČEKÁVANÉ, HRA UPOZORNÍ (${notes.length}) ===`, ...notes].join("\n") + "\n");
});

type Club = { id: string; name: string; user_id: string | null; youth_investment: string | null; game_date: string | null; population: number; size: string; district: string; lat: number | null; budget: number; has_u21: number; village_id: string };

describe.skipIf(!SRC)("akademie nad kopií produkce", () => {
  it("přechod, založení, sezóna, anomálie", async () => {
    const clubs = (await db.prepare(
      `SELECT t.id, t.name, t.user_id, t.village_id, t.youth_investment, t.game_date, v.population, v.size, v.district, v.lat, t.budget,
              EXISTS (SELECT 1 FROM teams u WHERE u.parent_team_id = t.id AND u.team_type = 'u21') AS has_u21
         FROM teams t JOIN villages v ON v.id = t.village_id WHERE t.parent_team_id IS NULL AND COALESCE(t.team_type, '') <> 'u21' AND t.name NOT LIKE 'DELETED%'`,
    ).all<Club>()).results;
    const season = await db.prepare("SELECT number FROM seasons WHERE status = 'active' ORDER BY number DESC LIMIT 1").first<{ number: number }>();
    log(`Kluby: ${clubs.length}, aktivní sezóna ${season?.number}, bez U21: ${clubs.filter((c) => !c.has_u21).length}, bez souřadnic: ${clubs.filter((c) => c.lat === null).length}`);
    for (const c of clubs.filter((c) => c.lat === null)) flag(`obec bez souřadnic: ${c.name} (${c.district})`);

    // 1) Přechod ze staré akademie přesně jako POST /admin/academy/migrate
    const legacy = clubs.filter((c) => ["minimal", "medium", "high"].includes(c.youth_investment ?? ""));
    log(`\n== 1) Přechod: ${legacy.length} klubů se starou akademií ==`);
    for (const c of legacy) {
      const res = await seedFromLegacy(db, c.id, c.game_date ?? new Date().toISOString()).catch((e) => ({ created: -1, skipped: String(e) }));
      if (res.created <= 0) flag(`přechod ${c.name}: created=${res.created} ${res.skipped ?? ""}`);
      const t = await db.prepare("SELECT academy_coach_type, academy_level FROM teams WHERE id = ?").bind(c.id).first<{ academy_coach_type: string | null; academy_level: string }>();
      log(`  ${c.name} [${c.youth_investment}, ${c.user_id === "ai" ? "AI" : "člověk"}, ${c.population} obyv., ${c.has_u21 ? "U21" : "bez U21"}]: ${res.created} žáků, trenér ${t?.academy_coach_type}, úroveň ${t?.academy_level}`);
      if (!t?.academy_coach_type) flag(`přechod ${c.name}: bez trenéra`);
      if (t?.academy_coach_type === "staff") flag(`přechod ${c.name}: trenér mládeže dosazen potichu (U21 přijde o bonus)`);
      const min = { minimal: 4, medium: 6, high: 9 }[c.youth_investment as "minimal" | "medium" | "high"];
      if (res.created < min) flag(`přechod ${c.name}: ${res.created} žáků, minimum pro ${c.youth_investment} je ${min}`);
    }

    // 2) Ostatním klubům akademii založit (krajní případy: osady, velká města, bez U21)
    const others = clubs.filter((c) => !legacy.includes(c));
    log(`\n== 2) Založení ostatním ${others.length} klubům ==`);
    const rng = createRng(20261105);
    for (const c of others) {
      const res = await foundYouthTeam(db, rng, c.id, c.game_date ?? new Date().toISOString());
      if (!res.ok) { flag(`založení ${c.name}: ${res.error}`); continue; }
      const opts = await loadCoachOptions(db, c.id);
      const body = opts.staff ? { type: "staff" } : opts.volunteers[0] ? { type: "volunteer", playerId: opts.volunteers[0].playerId } : { type: "parent" };
      const coach = await setYouthCoach(db, c.id, body);
      if (!coach.ok) flag(`trenér ${c.name}: ${coach.error}`);
    }

    // 3) Kontrola dat po založení
    log(`\n== 3) Žáci po založení ==`);
    const all = (await db.prepare("SELECT * FROM youth_prospects WHERE status = 'active'").all<ProspectRow>()).results;
    const byClub = new Map<string, ProspectRow[]>();
    for (const p of all) byClub.set(p.team_id, [...(byClub.get(p.team_id) ?? []), p]);
    const sizes: number[] = [];
    for (const c of clubs) {
      const kids = byClub.get(c.id) ?? [];
      sizes.push(kids.length);
      const ages = kids.map((k) => k.age);
      if (ages.some((a) => a < YOUNGEST_AGE || a > OLDEST_AGE)) flag(`${c.name}: věk mimo 11–14 (${[...new Set(ages)].join(",")})`);
      if (kids.length > MAX_SQUAD) flag(`${c.name}: ${kids.length} žáků > ${MAX_SQUAD}`);
      if (c.population >= 2000 && kids.length < 6) flag(`${c.name}: obec ${c.population} obyv., jen ${kids.length} žáků`);
      // Osada sama víc žáků nedá; přechod ze staré akademie je dorovná dojížděním z okolí
      const local = kids.filter((k) => k.home_village_id === c.village_id && !k.coach_son).length;
      if (c.population < 300 && local > 3) flag(`${c.name}: osada ${c.population} obyv., ${local} žáků přímo z ní`);
      const names = kids.map((k) => `${k.first_name} ${k.last_name}`);
      const dup = names.filter((n, i) => names.indexOf(n) !== i);
      if (dup.length) flag(`${c.name}: stejná jména ${[...new Set(dup)].join(", ")}`);
      for (const k of kids) {
        if (!k.first_name || !k.last_name || k.last_name.length < 2) flag(`${c.name}: divné jméno „${k.first_name} ${k.last_name}“`);
        if (k.hidden_talent < 0 || k.hidden_talent > 100) flag(`${c.name}: talent ${k.hidden_talent}`);
        if (!["GK", "DEF", "MID", "FWD"].includes(k.position)) flag(`${c.name}: pozice ${k.position}`);
      }
      const gk = kids.filter((k) => k.position === "GK").length;
      if (kids.length >= 5 && gk === 0) flag(`${c.name}: ${kids.length} žáků, žádný brankář`);
      if (kids.length === 0) flag(`${c.name}: akademie bez žáků (${c.population} obyv.)`);
    }
    sizes.sort((a, b) => a - b);
    log(`  žáků na klub: min ${sizes[0]}, medián ${sizes[Math.floor(sizes.length / 2)]}, max ${sizes[sizes.length - 1]}; celkem ${all.length}`);
    log(`  věky: ${[11, 12, 13, 14].map((a) => `${a}: ${all.filter((p) => p.age === a).length}`).join(", ")}`);
    log(`  pozice: ${["GK", "DEF", "MID", "FWD"].map((p) => `${p} ${all.filter((x) => x.position === p).length}`).join(", ")}`);
    const tal = all.map((p) => p.hidden_talent).sort((a, b) => a - b);
    log(`  talent: medián ${tal[Math.floor(tal.length / 2)]}, 70+ (klenoty): ${tal.filter((t) => t >= 70).length} (${((tal.filter((t) => t >= 70).length / Math.max(1, tal.length)) * 100).toFixed(1)} %)`);
    const sons = all.filter((p) => p.coach_son).length;
    log(`  synové trenérů: ${sons}`);
    const managers = (await db.prepare("SELECT id, age, team_id FROM managers WHERE team_id IS NOT NULL").all<{ id: string; age: number | null; team_id: string }>()).results;
    const expectSons = managers.filter((m) => m.age && (() => { const a = coachSonAge(m.id, m.age!); return a !== null && a >= 11 && a <= 14; })()).length;
    log(`  trenérů, kterým by syn ve věku žáků měl být: ${expectSons}`);
    if (sons !== expectSons) flag(`synové: v akademiích ${sons}, podle věku trenérů má být ${expectSons}`);
    const surnameMismatch = (await db.prepare(
      `SELECT p.last_name, m.name FROM youth_prospects p JOIN managers m ON m.team_id = p.team_id WHERE p.coach_son = 1`,
    ).all<{ last_name: string; name: string }>()).results.filter((r) => !r.name.endsWith(r.last_name));
    for (const r of surnameMismatch) flag(`syn trenéra ${r.last_name} nesedí na trenéra ${r.name}`);
    const femaleCoaches = (await db.prepare(
      `SELECT m.name FROM youth_prospects p JOIN managers m ON m.team_id = p.team_id WHERE p.coach_son = 1 AND (m.name LIKE '%ová' OR m.name LIKE '%á')`,
    ).all<{ name: string }>()).results;
    for (const r of femaleCoaches) flag(`syn trenérky s ženským příjmením: ${r.name}`);

    // 4) Pohled stránky Akademie pro každý klub: ceny proti rozpočtu, profil žáků, okolí
    log(`\n== 4) Stránka Akademie ==`);
    let noStrengths = 0;
    let noAvatar = 0;
    for (const c of clubs) {
      const view = await loadAcademyView(db, c.id).catch((e) => { flag(`pohled ${c.name}: ${String(e)}`); return null; });
      if (!view) continue;
      noStrengths += view.prospects.filter((p) => p.strengths.length === 0 && view.coach.type).length;
      noAvatar += view.prospects.filter((p) => !p.avatar).length;
      const share = view.weeklyCost / Math.max(1, c.budget);
      if (view.weeklyCost > 3000) flag(`${c.name}: provoz ${view.weeklyCost} Kč týdně`);
      if (c.budget < view.weeklyCost * 15 && !view.budgetWarning) flag(`${c.name}: rozpočet nestačí a stránka nevaruje`);
      if (c.budget < view.weeklyCost * 15) note(`${c.name}: rozpočet ${c.budget} Kč nestačí ani na sezónu akademie (${view.weeklyCost * 15} Kč)`);
      if (view.neighbors.length > 15) note(`${c.name}: ${view.neighbors.length} okolních obcí`);
      log(`  ${c.name}: ${view.prospects.length} žáků, ${view.coach.type}, provoz ${view.weeklyCost} Kč/týden (${(share * 100).toFixed(1)} % rozpočtu), okolní obce ${view.neighbors.length}, nábor ~${view.recruitDay.expected}, cizí nadějní ${view.poach?.targets.length ?? 0}`);
      if (c.user_id === "ai") {
        const ctx = await youthContextForTeam(db, c.id);
        if (!ctx) flag(`AI kontext ${c.name}: null`);
      }
    }
    if (noStrengths) flag(`žáků bez silných stránek (s trenérem): ${noStrengths}`);
    if (noAvatar) flag(`žáků bez avataru: ${noAvatar}`);

    // 5) Jedna sezóna: 15 týdnů provozu a konec sezóny
    log(`\n== 5) Sezóna: 15 týdnů a konec sezóny ==`);
    const u21Before = new Map<string, number>();
    for (const c of clubs) {
      const n = await db.prepare("SELECT COUNT(*) AS n FROM players p JOIN teams u ON u.id = p.team_id WHERE u.parent_team_id = ? AND u.team_type = 'u21'").bind(c.id).first<{ n: number }>();
      u21Before.set(c.id, n?.n ?? 0);
    }
    const budgetBefore = new Map(clubs.map((c) => [c.id, c.budget]));
    for (let w = 0; w < 15; w++) for (const c of clubs) await weeklyAcademy(db, c.id, c.game_date ?? new Date().toISOString(), 1);
    for (const c of clubs) await seasonEndAcademy(db, createRng(7), c.id, c.game_date ?? new Date().toISOString());
    for (const c of clubs) {
      const after = await db.prepare("SELECT COUNT(*) AS n FROM players p JOIN teams u ON u.id = p.team_id WHERE u.parent_team_id = ? AND u.team_type = 'u21'").bind(c.id).first<{ n: number }>();
      const grads = await db.prepare("SELECT COUNT(*) AS n FROM players WHERE raised_by_team_id = ?").bind(c.id).first<{ n: number }>();
      const spent = await db.prepare("SELECT -SUM(amount) AS s FROM transactions WHERE team_id = ? AND type = 'youth_academy' AND description NOT LIKE 'Náborový%'").bind(c.id).first<{ s: number }>();
      const leaving = await db.prepare("SELECT COUNT(*) AS n FROM youth_prospects WHERE team_id = ? AND status = 'leaving'").bind(c.id).first<{ n: number }>();
      const u21 = after?.n ?? 0;
      if (u21 > 35) (u21 - (u21Before.get(c.id) ?? 0) > 8 ? flag : note)(`${c.name}: U21 má po létě ${u21} hráčů (před ${u21Before.get(c.id)})`);
      log(`  ${c.name}: odchovanců ${grads?.n ?? 0}, U21 ${u21Before.get(c.id)} → ${u21}, akademie stála ${spent?.s ?? 0} Kč za sezónu (rozpočet ${budgetBefore.get(c.id)} Kč), čeká u souseda ${leaving?.n ?? 0}`);
    }
    const offers = await db.prepare("SELECT COUNT(*) AS n FROM player_offers WHERE prospect_id IS NOT NULL AND status = 'pending'").first<{ n: number }>();
    log(`  nevyřízených nabídek z akademie (kluby bez U21 → soused): ${offers?.n ?? 0}`);
    const stuck = await db.prepare("SELECT COUNT(*) AS n FROM youth_prospects WHERE status = 'active' AND age > 14").first<{ n: number }>();
    if ((stuck?.n ?? 0) > 0) flag(`aktivní žáci starší 14 let po konci sezóny: ${stuck?.n}`);
    const twice = await db.prepare("SELECT COUNT(*) AS n FROM players WHERE raised_by_team_id IS NOT NULL AND age < 13").first<{ n: number }>();
    if ((twice?.n ?? 0) > 0) flag(`odchovanci mladší 13 let v hráčích: ${twice?.n}`);
    const sms = await db.prepare("SELECT COUNT(*) AS n FROM messages m JOIN conversations c ON c.id = m.conversation_id WHERE c.title = 'Žáci'").first<{ n: number }>();
    log(`  SMS v konverzacích Žáci: ${sms?.n ?? 0}`);
  }, 1_800_000);
});
