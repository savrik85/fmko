/**
 * Celá sezóna akademie nanečisto nad kopií produkce (SEASON_AUDIT_DB, lokálně, prod se nedotýká):
 * skutečné akademie a lákání, 15 týdnů provozu s denními kroky, konec sezóny a kontrola stavu
 * po létě u každého klubu. Spuštění:
 *   NODE_OPTIONS=--experimental-sqlite SEASON_AUDIT_DB=/cesta/kopie.sqlite SEASON_AUDIT_OUT=/cesta/report.txt \
 *   npx vitest run src/academy/season-audit.sim.test.ts
 */
import { describe, it } from "vitest";
import { writeFileSync } from "node:fs";
import { createRng } from "../generators/rng";
import { weeklyAcademy, dailyAcademy, seasonEndAcademy, loadAcademyView } from "./service";
import { MAX_SQUAD, OLDEST_AGE, YOUNGEST_AGE } from "./rules";

const SRC = process.env.SEASON_AUDIT_DB;
const OUT = process.env.SEASON_AUDIT_OUT ?? "season-audit.txt";

describe.skipIf(!SRC)("sezóna akademie nad kopií produkce", () => {
  it("15 týdnů, konec sezóny, stav po létě", async () => {
    const { openD1 } = await import("../../scripts/ai-coach-bench/d1-shim");
    const db = openD1(SRC!);
    const lines: string[] = [];
    const bad: string[] = [];
    const log = (s: string) => lines.push(s);
    const flag = (s: string) => bad.push(s);

    type Club = { id: string; name: string; human: number; game_date: string; budget: number; kids: number; u21: number; level: string; coach: string | null };
    const clubs = (await db.prepare(
      `SELECT t.id, t.name, t.user_id != 'ai' AS human, t.game_date, t.budget, t.academy_level AS level, t.academy_coach_type AS coach,
              (SELECT COUNT(*) FROM youth_prospects p WHERE p.team_id = t.id AND p.status = 'active') AS kids,
              (SELECT COUNT(*) FROM players pl JOIN teams u ON u.id = pl.team_id WHERE u.parent_team_id = t.id AND u.team_type = 'u21' AND pl.status = 'active') AS u21
         FROM teams t WHERE t.academy_upkeep = 1 AND t.parent_team_id IS NULL`,
    ).all<Club>()).results;
    const poachesBefore = (await db.prepare("SELECT prospect_id, to_team_id, from_team_id, interest FROM youth_poach WHERE status = 'active'").all<{ prospect_id: string; to_team_id: string; from_team_id: string; interest: number }>()).results;
    log(`Akademie: ${clubs.length}, žáků ${clubs.reduce((n, c) => n + c.kids, 0)}, aktivních lákání ${poachesBefore.length}`);

    // 15 týdnů: každý den denní krok akademie, v pondělí týdenní provoz
    const start = Date.parse(clubs[0]?.game_date ?? "2026-11-06T00:00:00Z");
    let offers = 0;
    for (let d = 0; d < 105; d++) {
      const date = new Date(start + d * 86_400_000).toISOString();
      for (const c of clubs) {
        const r = await dailyAcademy(db, c.id, date).catch((e) => { flag(`denní krok ${c.name}: ${String(e)}`); return null; });
        if (r && (r as { offered?: number }).offered) offers += (r as { offered?: number }).offered ?? 0;
        if (d % 7 === 0) await weeklyAcademy(db, c.id, date, 1).catch((e) => flag(`týden ${c.name}: ${String(e)}`));
      }
    }
    const pendingOffers = await db.prepare("SELECT COUNT(*) AS n FROM player_offers WHERE prospect_id IS NOT NULL AND status = 'pending'").first<{ n: number }>();
    log(`Za 15 týdnů nabídek do dorostu (čekají na hráče): ${pendingOffers?.n ?? 0}`);

    // Konec sezóny všem (lákání se řeší u klubu, odkud žák odchází)
    const end = new Date(start + 106 * 86_400_000).toISOString();
    for (const c of clubs) await seasonEndAcademy(db, createRng(42), c.id, end).catch((e) => flag(`konec sezóny ${c.name}: ${String(e)}`));

    // Lákání: každý žák nejvýš jednou přestoupil, do klubu s nejvyšším zájmem nad hranicí
    const byKid = new Map<string, typeof poachesBefore>();
    for (const p of poachesBefore) byKid.set(p.prospect_id, [...(byKid.get(p.prospect_id) ?? []), p]);
    let moved = 0;
    for (const [kid, list] of byKid) {
      const done = (await db.prepare("SELECT to_team_id FROM youth_poach WHERE prospect_id = ? AND status = 'done'").bind(kid).all<{ to_team_id: string }>()).results;
      if (done.length > 1) flag(`žák ${kid} přestoupil ${done.length}×`);
      const best = [...list].sort((a, b) => b.interest - a.interest)[0];
      if (best.interest >= 60 && done.length === 0) log(`  žák ${kid}: vedoucí zájem ${best.interest}, nepřestoupil (plné družstvo / propojené / žák už neaktivní?)`);
      if (done.length === 1) {
        moved++;
        if (done[0].to_team_id !== best.to_team_id) flag(`žák ${kid} přestoupil jinam než k nejvyššímu zájmu`);
      }
      const still = await db.prepare("SELECT COUNT(*) AS n FROM youth_poach WHERE prospect_id = ? AND status = 'active'").bind(kid).first<{ n: number }>();
      if ((still?.n ?? 0) > 0) flag(`žák ${kid}: lákání zůstalo aktivní po létě`);
    }
    const fees = (await db.prepare("SELECT description, COUNT(*) AS n FROM transactions WHERE description LIKE 'Odstupné za žáka%' GROUP BY description HAVING n > 2").all<{ description: string; n: number }>()).results;
    for (const f of fees) flag(`odstupné víc než jednou: ${f.description} (${f.n}×)`);
    log(`Lákání: přestoupilo ${moved} žáků z ${byKid.size} lákaných`);

    // Stav po létě
    for (const c of clubs) {
      const kids = (await db.prepare("SELECT age FROM youth_prospects WHERE team_id = ? AND status = 'active'").bind(c.id).all<{ age: number }>()).results;
      const leaving = await db.prepare("SELECT COUNT(*) AS n FROM youth_prospects WHERE team_id = ? AND status = 'leaving'").bind(c.id).first<{ n: number }>();
      const u21 = await db.prepare("SELECT COUNT(*) AS n FROM players pl JOIN teams u ON u.id = pl.team_id WHERE u.parent_team_id = ? AND u.team_type = 'u21' AND pl.status = 'active'").bind(c.id).first<{ n: number }>();
      const after = await db.prepare("SELECT budget FROM teams WHERE id = ?").bind(c.id).first<{ budget: number }>();
      const spent = await db.prepare("SELECT -SUM(amount) AS s FROM transactions WHERE team_id = ? AND type = 'youth_academy' AND created_at >= ?").bind(c.id, new Date(start).toISOString().slice(0, 10)).first<{ s: number | null }>();
      if (kids.some((k) => k.age < YOUNGEST_AGE || k.age > OLDEST_AGE)) flag(`${c.name}: žák mimo 11–14 po létě`);
      if (kids.length > MAX_SQUAD) flag(`${c.name}: ${kids.length} žáků > ${MAX_SQUAD}`);
      if ((u21?.n ?? 0) > 36) flag(`${c.name}: U21 po létě ${u21?.n} hráčů`);
      const view = await loadAcademyView(db, c.id).catch((e) => { flag(`pohled ${c.name}: ${String(e)}`); return null; });
      if (view && !view.founded) flag(`${c.name}: akademie po létě zmizela`);
      log(`  ${c.name} [${c.human ? "člověk" : "AI"}, ${c.level}, ${c.coach ?? "bez trenéra"}]: žáků ${c.kids} → ${kids.length}, U21 ${c.u21} → ${u21?.n ?? 0}, odchází ${leaving?.n ?? 0}, akademie stála ${spent?.s ?? 0} Kč, rozpočet ${c.budget} → ${after?.budget}`);
    }
    const stuckLeaving = await db.prepare("SELECT COUNT(*) AS n FROM youth_prospects WHERE status = 'leaving' AND NOT EXISTS (SELECT 1 FROM player_offers o WHERE o.prospect_id = youth_prospects.id AND o.status = 'pending')").first<{ n: number }>();
    if ((stuckLeaving?.n ?? 0) > 0) flag(`žáci 'leaving' bez nabídky: ${stuckLeaving?.n}`);
    const old = await db.prepare("SELECT COUNT(*) AS n FROM youth_prospects WHERE status = 'active' AND age > 14").first<{ n: number }>();
    if ((old?.n ?? 0) > 0) flag(`aktivní žáci nad 14 let: ${old?.n}`);
    const negative = clubs.filter((c) => c.budget >= 0);
    for (const c of negative) {
      const b = await db.prepare("SELECT budget FROM teams WHERE id = ?").bind(c.id).first<{ budget: number }>();
      if ((b?.budget ?? 0) < 0) log(`  ${c.name}: rozpočet po sezóně záporný (${b?.budget}), ale bez ostatních příjmů a výdajů sezóny, jen akademie`);
    }
    writeFileSync(OUT, [...lines, "", `=== ANOMÁLIE (${bad.length}) ===`, ...bad].join("\n") + "\n");
  }, 3_600_000);
});
