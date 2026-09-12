/**
 * Staff tick — SAMOSTATNÝ cron pro efekty zaměstnanců (realizační tým).
 * Záměrně MIMO daily-tick.ts (ten je už obří). Spouští se vlastním cron triggerem
 * (`0 5 * * *`, mezi daily-tickem 3:00 a matchday preview 6:00).
 *
 * Co dělá (denně):
 *  - Masér: extra regenerace kondice
 *  - Lékař: zrychlené hojení zranění (+ detekce/mazání vyléčených)
 *  - Správce hřiště: údržba trávníku + vybavení
 *  - Psycholog: zvedá morálku týmu
 *  - Údržba poolu volných zaměstnanců per okres
 * Týdně (pondělí, herní den):
 *  - Kurzy: odpočet týdnů + dokončení (přičtení bodů atributu)
 *  - Skaut: týdenní tip na talent
 *
 * Boosty tréninku (asistent, trenér mládeže/brankářů, kondiční) a zápasu (gkBonus, kotel,
 * scout, občerstvení) NEJSOU tady — musí běžet v momentě simulace (daily-tick training blok,
 * match-runner). Cron je zpětně nedožene.
 */

import type { Bindings } from "../index";
import { logger } from "../lib/logger";
import { createRng } from "../generators/rng";
import { STAFF_ATTRIBUTE_LABELS, type StaffAttributeKey } from "@okresni-masina/shared";
import { calculateStaffEffects, type StaffEffects } from "./staff-effects";
import { maintainStaffPool } from "./staff-generator";

export interface StaffTickResult {
  date: string;
  dayOfWeek: number;
  regenTeams: number;
  healedExtra: number;
  coursesDone: number;
  scoutTips: number;
  newCandidates: number;
}

const EQUIP_CATEGORIES = [
  "balls", "jerseys", "training_cones", "first_aid", "boots_stock", "bibs", "goalkeeper_gear",
  "water_bottles", "tactics_board", "gym_corner", "training_wall", "club_grill", "fan_drums",
  "winter_gear", "video_setup", "laundry", "mower", "pitch_heating", "pitch_irrigation", "coffee_maker",
  "sports_drinks", "raffle", "pa_system", "trophy_case",
];

interface StaffDbRow {
  team_id: string;
  role: string;
  coaching: number;
  medicine: number;
  maintenance: number;
  judgement: number;
  communication: number;
  work_rate: number;
  charm: number;
}

/** Načte všechny najaté zaměstnance a spočítá efekty per tým. */
async function loadStaffEffectsByTeam(db: D1Database): Promise<Map<string, StaffEffects>> {
  const map = new Map<string, StaffEffects>();
  const all = await db.prepare(
    "SELECT team_id, role, coaching, medicine, maintenance, judgement, communication, work_rate, charm FROM staff_members WHERE team_id IS NOT NULL AND role IS NOT NULL"
  ).all<StaffDbRow>().catch((e) => { logger.warn({ module: "staff-tick" }, "load staff", e); return { results: [] as StaffDbRow[] }; });
  const byTeam = new Map<string, StaffDbRow[]>();
  for (const r of all.results) {
    const arr = byTeam.get(r.team_id) ?? [];
    arr.push(r);
    byTeam.set(r.team_id, arr);
  }
  for (const [tid, rows] of byTeam) map.set(tid, calculateStaffEffects(rows));
  return map;
}

/** Systémová zpráva týmu (vzor roleSenders v index.ts). */
async function sendStaffSystemMessage(
  db: D1Database, teamId: string, senderName: string, convTitle: string, body: string,
): Promise<void> {
  let convId = await db.prepare("SELECT id FROM conversations WHERE team_id = ? AND type = 'system' AND title = ?")
    .bind(teamId, convTitle).first<{ id: string }>().then((r) => r?.id)
    .catch((e) => { logger.warn({ module: "staff-tick" }, "msg find conversation", e); return null; });
  if (!convId) {
    convId = crypto.randomUUID();
    await db.prepare("INSERT INTO conversations (id, team_id, type, title, pinned, unread_count, last_message_text, last_message_at, created_at) VALUES (?, ?, 'system', ?, 0, 0, '', strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))")
      .bind(convId, teamId, convTitle).run().catch((e) => logger.warn({ module: "staff-tick" }, "msg create conversation", e));
  }
  await db.prepare("INSERT INTO messages (id, conversation_id, sender_type, sender_name, body, metadata, sent_at) VALUES (?, ?, 'system', ?, ?, ?, strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))")
    .bind(crypto.randomUUID(), convId, senderName, body, JSON.stringify({ type: "staff" }))
    .run().catch((e) => logger.warn({ module: "staff-tick" }, "msg insert", e));
  await db.prepare("UPDATE conversations SET unread_count = unread_count + 1, last_message_text = ?, last_message_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now') WHERE id = ?")
    .bind(body, convId).run().catch((e) => logger.warn({ module: "staff-tick" }, "msg update conversation", e));
}

/**
 * Spustí denní/týdenní staff tick. Idempotentní přes KV klíč `staff-tick:YYYY-MM-DD`.
 */
export async function executeStaffTick(env: Bindings, gameDate?: Date): Promise<StaffTickResult> {
  const now = gameDate ?? new Date();

  // Herní den = deterministicky reálný den (16:00 UTC) + offset (game_clock) — stejně jako daily-tick.
  const clock = await env.DB.prepare("SELECT offset_days FROM game_clock WHERE id = 1").first<{ offset_days: number }>()
    .catch((e) => { logger.warn({ module: "staff-tick" }, "load game clock", e); return null; });
  let effectiveDate: Date;
  if (clock) {
    const g = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 16, 0, 0, 0));
    g.setUTCDate(g.getUTCDate() + clock.offset_days);
    effectiveDate = g;
  } else {
    effectiveDate = now;
  }
  const dayOfWeek = effectiveDate.getUTCDay();
  const result: StaffTickResult = {
    date: effectiveDate.toISOString(), dayOfWeek,
    regenTeams: 0, healedExtra: 0, coursesDone: 0, scoutTips: 0, newCandidates: 0,
  };

  // Idempotence: jeden běh na herní den.
  const key = `staff-tick:${effectiveDate.toISOString().slice(0, 10)}`;
  const already = await env.CACHE_KV.get(key).catch((e) => { logger.warn({ module: "staff-tick" }, "read KV flag", e); return null; });
  if (already) {
    logger.warn({ module: "staff-tick" }, `SKIP — staff tick for ${key} already ran`);
    return result;
  }
  await env.CACHE_KV.put(key, "1", { expirationTtl: 60 * 60 * 36 }).catch((e) => logger.warn({ module: "staff-tick" }, "set KV flag", e));

  const db = env.DB;
  const fxByTeam = await loadStaffEffectsByTeam(db);
  logger.info({ module: "staff-tick" }, `START dayOfWeek=${dayOfWeek} teams=${fxByTeam.size}`);

  // ── Denní efekty per tým ──
  for (const [tid, fx] of fxByTeam) {
    // Masér — regenerace kondice (vzor posilovna)
    if (fx.conditionRegenBonus > 0) {
      await db.prepare(
        `INSERT INTO condition_log (player_id, team_id, old_value, new_value, delta, source, description)
         SELECT id, team_id,
           json_extract(life_context, '$.condition'),
           MIN(100, json_extract(life_context, '$.condition') + ?),
           MIN(100, json_extract(life_context, '$.condition') + ?) - json_extract(life_context, '$.condition'),
           'staff', 'Masér'
         FROM players WHERE team_id = ?
           AND json_extract(life_context, '$.condition') IS NOT NULL
           AND MIN(100, json_extract(life_context, '$.condition') + ?) != json_extract(life_context, '$.condition')`,
      ).bind(fx.conditionRegenBonus, fx.conditionRegenBonus, tid, fx.conditionRegenBonus)
        .run().catch((e) => logger.warn({ module: "staff-tick" }, "log maser regen", e));
      await db.prepare(
        `UPDATE players SET life_context = json_set(life_context, '$.condition',
          MIN(100, json_extract(life_context, '$.condition') + ?)) WHERE team_id = ?`,
      ).bind(fx.conditionRegenBonus, tid).run().catch((e) => logger.warn({ module: "staff-tick" }, "maser regen", e));
      result.regenTeams++;
    }

    // Lékař — šance na -1 den navíc pro každé zranění týmu
    if (fx.injuryExtraHealChance > 0) {
      const pct = Math.round(fx.injuryExtraHealChance * 100); // 0..50
      const r = await db.prepare(
        `UPDATE injuries SET days_remaining = MAX(0, days_remaining - 1)
         WHERE days_remaining > 0 AND (ABS(RANDOM()) % 100) < ?
           AND player_id IN (SELECT id FROM players WHERE team_id = ?)`
      ).bind(pct, tid).run().catch((e) => { logger.warn({ module: "staff-tick" }, "lekar heal", e); return null; });
      result.healedExtra += r?.meta?.changes ?? 0;
    }

    // Správce hřiště — údržba trávníku + vybavení (přičti kondici zpět).
    //
    // Dřív to bylo Math.round(...), takže výsledek byl vždycky 0 nebo 1 bod za den:
    // pod určitou kvalitou správce nedělal vůbec nic, nad ní rovnou přebil celou
    // degradaci. Mezi tím nebylo nic a na kvalitě tak skoro nezáleželo.
    //
    // Teď se zlomek bodu doplácí pravděpodobností — přes měsíc to vyjde na tolik,
    // kolik správce reálně umí, a lepší člověk je znát okamžitě.
    const applyRepair = (rate: number) => {
      const whole = Math.floor(rate);
      const pct = Math.round((rate - whole) * 100);
      return { whole, pct };
    };

    const pitch = applyRepair(fx.pitchDegradationReduction * 3); // 0..1,2 bodu/den
    if (pitch.whole > 0 || pitch.pct > 0) {
      await db.prepare(
        `UPDATE stadiums SET pitch_condition = MIN(100, pitch_condition + ?
           + (CASE WHEN (ABS(RANDOM()) % 100) < ? THEN 1 ELSE 0 END))
          WHERE team_id = ?`
      ).bind(pitch.whole, pitch.pct, tid).run()
        .catch((e) => logger.warn({ module: "staff-tick" }, "spravce pitch", e));
    }

    const equip = applyRepair(fx.equipDegradationReduction * 2); // 0..0,8 bodu/den
    if (equip.whole > 0 || equip.pct > 0) {
      for (const cat of EQUIP_CATEGORIES) {
        await db.prepare(
          `UPDATE equipment SET ${cat}_condition = MIN(100, ${cat}_condition + ?
             + (CASE WHEN (ABS(RANDOM()) % 100) < ? THEN 1 ELSE 0 END))
            WHERE team_id = ? AND ${cat} > 0`
        ).bind(equip.whole, equip.pct, tid).run()
          .catch((e) => logger.warn({ module: "staff-tick" }, "spravce equip", e));
      }
    }

    // Psycholog — zvedá morálku (nudge +1 k vyššímu pásmu, nikdy dolů)
    if (fx.moraleTargetBonus > 0) {
      const floor = 50 + fx.moraleTargetBonus;
      await db.prepare(
        `UPDATE players SET life_context = json_set(life_context, '$.morale',
           MIN(?, json_extract(life_context, '$.morale') + 1))
         WHERE team_id = ? AND json_extract(life_context, '$.morale') < ?`,
      ).bind(floor, tid, floor).run().catch((e) => logger.warn({ module: "staff-tick" }, "psycholog morale", e));
    }
  }

  // Zranění, která lékař dohojil na 0 → detekce + smazání
  const healed = await db.prepare(
    "SELECT p.team_id, p.first_name, p.last_name FROM injuries i JOIN players p ON i.player_id = p.id WHERE i.days_remaining <= 0"
  ).all<{ team_id: string; first_name: string; last_name: string }>()
    .catch((e) => { logger.warn({ module: "staff-tick" }, "detect healed", e); return { results: [] as never[] }; });
  if (healed.results.length > 0) {
    await db.prepare("DELETE FROM injuries WHERE days_remaining <= 0").run()
      .catch((e) => logger.warn({ module: "staff-tick" }, "delete healed", e));
    for (const h of healed.results) {
      await sendStaffSystemMessage(db, h.team_id, "Lékař", "Lékař",
        `🩹 ${h.first_name} ${h.last_name} je zpět fit — zranění zaléčeno.`);
    }
  }

  // ── Údržba poolu volných zaměstnanců (denně, per okres) ──
  try {
    const staffRng = createRng(now.getTime() + 4242);
    result.newCandidates = await maintainStaffPool(db, staffRng, now);
  } catch (e) {
    logger.error({ module: "staff-tick" }, "staff pool failed", e);
  }

  // ── Týdenní (pondělí): kurzy + skautův tip ──
  if (dayOfWeek === 1) {
    // Odpočet týdnů běžících kurzů
    await db.prepare(
      "UPDATE staff_members SET course_weeks_remaining = course_weeks_remaining - 1 WHERE team_id IS NOT NULL AND course_weeks_remaining > 0"
    ).run().catch((e) => logger.warn({ module: "staff-tick" }, "course countdown", e));

    // Dokončené kurzy → přičíst body k atributu
    const doneCourses = await db.prepare(
      "SELECT id, team_id, first_name, last_name, course_attribute, course_points FROM staff_members WHERE team_id IS NOT NULL AND course_attribute IS NOT NULL AND (course_weeks_remaining IS NULL OR course_weeks_remaining <= 0)"
    ).all<{ id: string; team_id: string; first_name: string; last_name: string; course_attribute: string; course_points: number }>()
      .catch((e) => { logger.warn({ module: "staff-tick" }, "load done courses", e); return { results: [] as never[] }; });
    const ALLOWED_ATTRS = new Set(["coaching", "medicine", "maintenance", "judgement", "communication", "work_rate", "charm"]);
    for (const c of doneCourses.results) {
      if (!ALLOWED_ATTRS.has(c.course_attribute)) {
        // Guard proti SQL injection přes název sloupce — jen vyčistit
        await db.prepare("UPDATE staff_members SET course_attribute = NULL, course_points = NULL, course_weeks_remaining = NULL WHERE id = ?")
          .bind(c.id).run().catch((e) => logger.warn({ module: "staff-tick" }, "clear invalid course", e));
        continue;
      }
      await db.prepare(
        `UPDATE staff_members SET ${c.course_attribute} = MIN(20, ${c.course_attribute} + ?), course_attribute = NULL, course_points = NULL, course_weeks_remaining = NULL WHERE id = ?`
      ).bind(c.course_points ?? 0, c.id).run().catch((e) => logger.warn({ module: "staff-tick" }, "course complete", e));
      const attrLabel = STAFF_ATTRIBUTE_LABELS[c.course_attribute as StaffAttributeKey] ?? c.course_attribute;
      await sendStaffSystemMessage(db, c.team_id, "Vedení klubu", "Vedení",
        `🎓 ${c.first_name} ${c.last_name} dokončil kurz (+${c.course_points} ${attrLabel}).`);
      result.coursesDone++;
    }

    /*
     * Skautův tip.
     *
     * Dřív poslal jméno bez čísel a bez důvodu („Tip na talent: Patrik Karabec
     * (DEF)") a bral kohokoli z okresu — i třicetiletého s ratingem 30. Zpráva
     * tím neříkala nic a chodila každý týden znovu.
     *
     * Teď je měřítkem KÁDR TRENÉRA, ne absolutní číslo. Rating v téhle hře
     * neběží na stovkové škále: průměr hráče v kádru je kolem třiceti, takže
     * „rating 44" nikomu nic neříká, dokud nevidí, co má doma. Tip má smysl
     * jedině tehdy, když by hráč v týmu k něčemu byl — a když v okrese nikdo
     * takový není, skaut MLČÍ.
     */
    const scouts = await db.prepare(
      `SELECT sm.team_id, v.district, sm.judgement, sm.communication
       FROM staff_members sm JOIN teams t ON sm.team_id = t.id JOIN villages v ON t.village_id = v.id
       WHERE sm.role = 'skaut' AND sm.team_id IS NOT NULL`
    ).all<{ team_id: string; district: string; judgement: number; communication: number }>()
      .catch((e) => { logger.warn({ module: "staff-tick" }, "load scouts", e); return { results: [] as never[] }; });

    for (const s of scouts.results) {
      const kandidati = await db.prepare(
        `SELECT id, first_name, last_name, position, age, overall_rating, hidden_talent
         FROM free_agents WHERE district = ?`,
      ).bind(s.district)
        .all<TipKandidat>()
        .catch((e) => { logger.warn({ module: "staff-tick" }, "scout tip", e); return { results: [] as TipKandidat[] }; });
      if (kandidati.results.length === 0) continue;

      // Laťka je vlastní kádr: co má trenér doma na té které pozici.
      const kadr = await db.prepare(
        `SELECT position, COUNT(*) pocet, ROUND(AVG(overall_rating)) prumer, MAX(overall_rating) nejlepsi
         FROM players WHERE team_id = ? GROUP BY position`,
      ).bind(s.team_id).all<LatkaPostu & { position: string }>()
        .catch((e) => { logger.warn({ module: "staff-tick" }, "kádr pro tip", e); return { results: [] as never[] }; });
      const latky = new Map(kadr.results.map((r) => [r.position, { pocet: r.pocet, prumer: r.prumer, nejlepsi: r.nejlepsi }]));

      // Nedoporučovat pořád dokola toho samého — kdo padl v posledních pár
      // hlášeních, jde stranou.
      const drive = await db.prepare(
        `SELECT m.body FROM messages m JOIN conversations c ON c.id = m.conversation_id
         WHERE c.team_id = ? AND c.type = 'system' AND c.title = 'Skaut'
         ORDER BY m.sent_at DESC LIMIT 4`,
      ).bind(s.team_id).all<{ body: string }>()
        .catch((e) => { logger.warn({ module: "staff-tick" }, "historie skauta", e); return { results: [] }; });

      const tip = vyberTip(
        kandidati.results,
        latky,
        (2 * (s.judgement ?? 5) + (s.communication ?? 5)) / 3,
        (drive.results ?? []).map((m) => m.body).join(" "),
      );
      if (!tip) continue;

      await sendStaffSystemMessage(db, s.team_id, "Skaut", "Skaut", textTipu(tip));
      result.scoutTips++;
    }
  }

  logger.info({ module: "staff-tick" }, `DONE regen=${result.regenTeams} healed=${result.healedExtra} courses=${result.coursesDone} scout=${result.scoutTips} newCand=${result.newCandidates}`);
  return result;
}

/** Post slovem — „(DEF)" trenérovi nic neřekne, „obránce" ano. */
const POST_SLOVEM: Record<string, string> = {
  GK: "brankář", DEF: "obránce", MID: "záložník", FWD: "útočník",
};

export interface TipKandidat {
  id: string; first_name: string; last_name: string; position: string;
  age: number; overall_rating: number; hidden_talent: number;
}

/** Laťka na jednom postu: co má trenér doma. */
export interface LatkaPostu { pocet: number; prumer: number; nejlepsi: number }

/** Proč skaut hráče vytáhl — rozhoduje i o pořadí, co se hlásí dřív. */
export type DuvodTipu = "chybi" | "nejlepsi" | "talent" | "zaloha";

export interface Tip { hrac: TipKandidat; duvod: DuvodTipu }

const PORADI: DuvodTipu[] = ["chybi", "nejlepsi", "talent", "zaloha"];

/**
 * Koho z okresu stojí za to hlásit.
 *
 * Skaut neporovnává hráče s absolutním číslem, ale s kádrem, který trenér má.
 * Brankář s ratingem 10 a velkým skrytým talentem je pořád brankář s ratingem
 * 10: když má klub doma tři lepší, není o čem psát. Naopak obránce, co by byl
 * hned nejlepší v týmu, stojí za zprávu, i kdyby žádný talent navíc neměl.
 *
 * Hlásí se jen to, co je novina: chybějící post, posila do základu, talent
 * nebo záloha tam, kde je trenér na postu sám. „Byl by do rotace" novina není
 * — to by chodilo každý týden o pěti pořád stejných lidech.
 *
 * Vrací `null`, když nikdo neprojde — mlčení je správná odpověď.
 */
export function vyberTip(
  kandidati: TipKandidat[],
  latky: Map<string, LatkaPostu>,
  eff: number,
  zminen = "",
): Tip | null {
  // Jak hluboko skaut vidí. Mizerný pozná jen hotového hráče, dobrý i surový
  // talent, který se na ratingu zatím neprojevil.
  const prahTalentu = Math.round(30 - eff); // eff 5 → 25, eff 18 → 12

  const tipy: Tip[] = [];
  for (const k of kandidati) {
    if (zminen.includes(`${k.first_name} ${k.last_name}`)) continue;
    const latka = latky.get(k.position);
    if (!latka) { tipy.push({ hrac: k, duvod: "chybi" }); continue; }
    if (k.overall_rating >= latka.nejlepsi) { tipy.push({ hrac: k, duvod: "nejlepsi" }); continue; }
    // Surový talent smí být za dnešním průměrem, ale ne propadlý úplně.
    if (k.age <= 23 && k.hidden_talent >= prahTalentu && k.overall_rating >= latka.prumer - 8) {
      tipy.push({ hrac: k, duvod: "talent" }); continue;
    }
    // Na postu sám: zranění nebo karta a nemá kým hrát.
    if (latka.pocet <= 1 && k.overall_rating >= latka.prumer - 5) tipy.push({ hrac: k, duvod: "zaloha" });
  }
  if (tipy.length === 0) return null;

  tipy.sort((a, b) => {
    const d = PORADI.indexOf(a.duvod) - PORADI.indexOf(b.duvod);
    if (d !== 0) return d;
    return (b.hrac.overall_rating + b.hrac.hidden_talent / 2)
      - (a.hrac.overall_rating + a.hrac.hidden_talent / 2);
  });
  return tipy[0];
}

/**
 * Co skaut o hráči napíše.
 *
 * Vždycky věk, post a rating — bez čísel je tip k ničemu — a k tomu věta,
 * PROČ ho vytáhl, vztažená ke kádru. „Rating 44" samo o sobě trenér neumí
 * zařadit; „hned by ti byl nejlepším obráncem" ano.
 */
export function textTipu(tip: Tip): string {
  const p = tip.hrac;
  const post = POST_SLOVEM[p.position] ?? p.position;
  const duvod = tip.duvod === "chybi"
    ? `Na tenhle post nemáš v kádru nikoho.`
    : tip.duvod === "nejlepsi"
      ? `Hned by ti byl nejlepším, koho na tomhle postu máš.`
      : tip.duvod === "talent"
        ? `Dnes ještě není na tvoje, ale má v sobě víc, než ukazuje.`
        : `Na tomhle postu jsi v kádru sám — tenhle by ti kryl záda.`;
  return `🔍 ${p.first_name} ${p.last_name} — ${p.age} let, ${post}, rating ${p.overall_rating}. `
    + `${duvod} Najdeš ho v Přestupech mezi volnými.`;
}
