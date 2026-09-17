/**
 * Životní situace v DB (spec 4c, 7c): založení, ukončení a záloha na mzdu.
 *
 * Situace je řádek `club_incidents` se stavem `probiha`, `subject_player_id` a `ends_on`.
 * Nemá pachatele ani stopy: není co vyšetřovat, jen to na hráči pár týdnů visí.
 */

import { createRng } from "../generators/rng";
import type { Bindings } from "../index";
import { isAiEnabled } from "../lib/ai-provider";
import { logConditionStmt } from "../lib/condition-log";
import { gameExpiry } from "../lib/game-time";
import { logger } from "../lib/logger";
import { seedFromString } from "../lib/seed";
import { getOrCreatePlayerConversation } from "../messaging/ai-player-spawn";
import { sendPlayerSMS } from "../messaging/system-sms";
import { recordTransaction } from "../season/finance-processor";
import type { VysledekAkce } from "./akce";
import { denPlus, dluhyZretezenaId, prikazAbsence } from "./absence-hracu";
import { idIncidentu, zapisIncident } from "./dopady";
import { posunHrace } from "./hraci";
import { herniDatum, nactiIncident, smsIncidentu } from "./incident-db";
import {
  DLUHY_PO_ZTRATE_PRACE_DNI, LHUTA_ROZHODNUTI_DNI, MAX_AKTIVNICH_SITUACI, MIN_OHLASENI_ABSENCE_DNI,
  ODMITNUTA_ZALOHA_MORALKA, ODMITNUTA_ZALOHA_VZTAH, SANCE_DLUHU_PO_ZTRATE_PRACE,
  ZALOHA_MAX_KC, ZALOHA_MIN_KC, ZALOHA_MORALKA, ZALOHA_TYDNU, ZALOHA_VZTAH,
} from "./nastaveni";
import { naCooldownu, nazevSituace, SITUACE_PODLE_KIND } from "./situace";
import { text, type KlicTextu } from "./texty";
import type { NavrhIncidentu, StavKlubu } from "./typy";

const M = "incidents-situace";

type RadekHrace = { id: string; first_name: string; last_name: string; nickname: string | null; avatar: string | null };

async function nactiHrace(db: D1Database, teamId: string, playerId: string): Promise<RadekHrace | null> {
  return db.prepare(
    "SELECT id, first_name, last_name, nickname, avatar FROM players WHERE id = ? AND team_id = ? AND (status IS NULL OR status = 'active')",
  ).bind(playerId, teamId).first<RadekHrace>()
    .catch((e) => { logger.warn({ module: M }, `hráč situace ${playerId}`, e); return null; });
}

const ref = (h: RadekHrace) => ({ id: h.id, firstName: h.first_name, lastName: h.last_name, nickname: h.nickname, avatar: h.avatar });

/** Kocovina po svatbě: kdo pije, ten to ráno pozná (spec 4c). */
function prikazyKocoviny(db: D1Database, stav: StavKlubu, subjectId: string, rng: ReturnType<typeof createRng>): D1PreparedStatement[] {
  const prikazy: D1PreparedStatement[] = [];
  for (const h of stav.kadr) {
    if (h.id === subjectId || h.alkohol < 50) continue;
    const dolu = rng.int(10, 20);
    prikazy.push(db.prepare(
      `UPDATE players SET life_context = json_set(life_context, '$.condition',
         MAX(15, COALESCE(json_extract(life_context, '$.condition'), 100) - ?)) WHERE id = ?`,
    ).bind(dolu, h.id));
    prikazy.push(logConditionStmt(db, h.id, stav.teamId, 100, 100 - dolu, "pub", "Svatba spoluhráče"));
  }
  return prikazy;
}

/**
 * Založí životní situaci: incident, morálka, incidentní absence, SMS hráče a u dluhů
 * i lhůta na zálohu a vlákno v chatu. Vrací id incidentu, nebo `null`, když se nezapsal.
 */
export async function zalozSituaci(env: Bindings, stav: StavKlubu, navrh: NavrhIncidentu, id: string = idIncidentu(stav.teamId, navrh.kind, stav.den)): Promise<string | null> {
  const db = env.DB;
  const def = SITUACE_PODLE_KIND.get(navrh.kind);
  const subjectId = navrh.subjectPlayerId;
  if (!def || !subjectId) return null;

  const zapsany = await zapisIncident(db, stav, navrh, id);
  if (!zapsany) return null;

  const rng = createRng(seedFromString(`situace|${id}`));
  const hrac = await nactiHrace(db, stav.teamId, subjectId);

  const davka: D1PreparedStatement[] = [];
  if (def.moralka !== 0) davka.push(posunHrace(db, stav.teamId, subjectId, { morale: def.moralka }));
  if (def.absence) {
    // Ohlášeno aspoň dva dny dopředu, ať SMS den předem i simulace vidí totéž (spec 17a).
    const za = Math.max(MIN_OHLASENI_ABSENCE_DNI, def.absence.dni(rng));
    const od = denPlus(stav.den, za);
    const doDne = denPlus(od, Math.max(1, def.absence.delka(rng)) - 1);
    const p = prikazAbsence(db, {
      incidentId: id, teamId: stav.teamId, playerId: subjectId, druh: def.absence.druh,
      od, do: doDne, zapasu: null, ohlaseno: stav.den, sms: text(rng, `absence_${def.absence.druh}` as KlicTextu),
    });
    if (p) davka.push(p);
  }
  if (navrh.kind === "svatba_spoluhrace") davka.push(...prikazyKocoviny(db, stav, subjectId, rng));
  if (davka.length > 0) {
    await db.batch(davka).catch((e) => logger.error({ module: M }, `dopady situace ${id}`, e));
  }

  if (navrh.kind === "dluhy") {
    // Lhůta na rozhodnutí o záloze (spec 7c). Situace sama běží dál podle `ends_on`.
    await db.prepare("UPDATE club_incidents SET deadline = ? WHERE id = ? AND deadline IS NULL")
      .bind(gameExpiry(stav.gameDate, LHUTA_ROZHODNUTI_DNI), id).run()
      .catch((e) => logger.warn({ module: M }, `lhůta zálohy ${id}`, e));
  }

  if (hrac) {
    await sendPlayerSMS(db, stav.teamId, ref(hrac), text(rng, `sms_situace_${navrh.kind}` as KlicTextu), smsIncidentu(id))
      .catch((e) => logger.warn({ module: M }, `SMS situace ${id}`, e));
    if (navrh.kind === "dluhy") await otevriVlaknoZalohy(env, stav.teamId, subjectId, hrac);
  }
  return id;
}

/** Vlákno `zadost_o_zalohu` (spec 17d). Bez zapnutého modelu se hráč jen ozve SMS. */
async function otevriVlaknoZalohy(env: Bindings, teamId: string, playerId: string, hrac: RadekHrace): Promise<void> {
  if (!(await isAiEnabled(env))) return;
  const convId = await getOrCreatePlayerConversation(env.DB, teamId, ref(hrac))
    .catch((e) => { logger.warn({ module: M }, `konverzace o záloze ${playerId}`, e); return null; });
  if (!convId) return;
  const ted = new Date().toISOString();
  await env.DB.prepare(
    `UPDATE conversations SET ai_thread_active = 1, ai_thread_last_at = ?, ai_thread_state = ?
      WHERE id = ? AND ai_thread_active != 1`,
  ).bind(ted, JSON.stringify({
    trigger: "zadost_o_zalohu", scenario_id: "zadost_o_zalohu", max_replies: 2, current_replies: 0,
    awaiting: "coach", initiated_at: ted, player_id: playerId, resolution: null,
  }), convId).run()
    .catch((e) => logger.warn({ module: M }, `vlákno o záloze ${convId}`, e));
}

/**
 * Ztráta práce občas skončí dluhy (spec 4c: „30 % → do 7 dní `dluhy`"). Vrací `true`,
 * když dneska dluhy opravdu přišly — klub pak už jinou situaci losovat nemá.
 *
 * Los je čistě z id zdrojové situace: stejný incident vyjde v každém běhu stejně a den
 * řetězení se neposouvá. Zápis je `INSERT OR IGNORE` s odvozeným id, takže druhý průchod
 * týmž herním dnem nic nepřidá.
 *
 * Dluhy dostane ten, kdo o práci přišel, i když mu ztráta práce pořád běží — jinak by
 * řetězení nemohlo nastat nikdy (ztráta práce trvá 21 dní, řetězí se do sedmi). Limit
 * klubu, cooldown druhu i „dvakrát dluhy naráz ne" ale platí; když blokují, nic se neděje.
 */
export async function zretezDluhy(env: Bindings, stav: StavKlubu): Promise<boolean> {
  const db = env.DB;
  const def = SITUACE_PODLE_KIND.get("dluhy");
  if (!def) return false;
  const rows = await db.prepare(
    `SELECT i.id, i.subject_player_id, i.game_date FROM club_incidents i
      WHERE i.team_id = ?1 AND i.status = 'probiha' AND i.kind = 'prisel_o_praci' AND i.subject_player_id IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM club_incidents d
           WHERE d.team_id = ?1 AND d.status = 'probiha' AND d.kind = 'dluhy'
             AND d.subject_player_id = i.subject_player_id)
      ORDER BY i.id`,
  ).bind(stav.teamId).all<{ id: string; subject_player_id: string; game_date: string }>()
    .catch((e) => { logger.warn({ module: M }, `ztráta práce ${stav.teamId}`, e); return null; });

  for (const r of rows?.results ?? []) {
    const rng = createRng(seedFromString(`dluhy-po-praci|${r.id}`));
    const spadnou = rng.random() < SANCE_DLUHU_PO_ZTRATE_PRACE;
    const den = denPlus(r.game_date, rng.int(1, DLUHY_PO_ZTRATE_PRACE_DNI));
    if (!spadnou || den !== stav.den) continue;
    if (stav.situace.size >= MAX_AKTIVNICH_SITUACI || naCooldownu(stav, "dluhy")) continue;
    const hrac = stav.kadr.find((h) => h.id === r.subject_player_id);
    if (!hrac) continue;
    const id = await zalozSituaci(env, stav, {
      kind: "dluhy", category: "zivotni", status: "probiha", severity: 1,
      culpritType: "nikdo", culpritPlayerId: null, culpritRevealed: false,
      subjectPlayerId: hrac.id, dniTrvani: def.trvani(rng), ztraty: [],
      text: text(rng, "situace_dluhy", { hrac: hrac.jmeno }),
    }, dluhyZretezenaId(r.id));
    if (id) {
      // Jeden hráč, jedna situace (spec 4c): ztráta práce, ze které dluhy vzešly, končí, ať
      // po ní na hráči nezůstane druhý slot a klubový limit i mapa `situace` sedí.
      await db.prepare(
        `UPDATE club_incidents SET status = 'uzavreny', resolution = 'prerostla_v_dluhy', resolved_on = ?
          WHERE id = ? AND team_id = ? AND status = 'probiha'`,
      ).bind(stav.gameDate, r.id, stav.teamId).run()
        .catch((e) => logger.error({ module: M }, `uzavření ztráty práce po řetězení dluhy ${r.id}`, e));
      logger.info({ module: M, teamId: stav.teamId }, `dluhy po ztrátě práce, hráč ${hrac.id}`);
      return true;
    }
  }
  return false;
}

/**
 * Situace, které dneska končí (spec 6b krok 4). Vrací počet ukončených.
 *
 * Dvojí konec: vypršel `ends_on`, nebo hráč už v klubu není. Prodaný a propuštěný hráč
 * jinak drží jeden ze dvou slotů klubu až pětatřicet dní, i když se ho situace dávno
 * netýká. Kádr se bere stejně jako jinde (`players` daného klubu, stav prázdný nebo
 * `active`); splátky zálohy řeší `zauctujSrazky` zvlášť a tohle na ně nesahá.
 */
export async function ukonciSituace(env: Bindings, t: { teamId: string; gameDate: string }): Promise<number> {
  const db = env.DB;
  const vyprsele = await db.prepare(
    `UPDATE club_incidents SET status = 'uzavreny', resolution = 'skoncila', resolved_on = ?
      WHERE team_id = ? AND status = 'probiha' AND ends_on IS NOT NULL AND ends_on <= ?
      RETURNING id, kind, subject_player_id`,
  ).bind(t.gameDate, t.teamId, t.gameDate).all<{ id: string; kind: string; subject_player_id: string | null }>()
    .catch((e) => { logger.warn({ module: M }, `ukončení situací ${t.teamId}`, e); return null; });

  const odesli = await db.prepare(
    `UPDATE club_incidents SET status = 'uzavreny', resolution = 'hrac_odesel', resolved_on = ?
      WHERE team_id = ? AND status = 'probiha' AND category = 'zivotni' AND subject_player_id IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM players p
           WHERE p.id = club_incidents.subject_player_id AND p.team_id = club_incidents.team_id
             AND (p.status IS NULL OR p.status = 'active'))
      RETURNING id, kind, subject_player_id`,
  ).bind(t.gameDate, t.teamId).all<{ id: string; kind: string; subject_player_id: string | null }>()
    .catch((e) => { logger.warn({ module: M }, `situace odešlých hráčů ${t.teamId}`, e); return null; });

  return (vyprsele?.results.length ?? 0) + (odesli?.results.length ?? 0);
}

/** Záloha, o které trenér do lhůty nerozhodl, se počítá za odmítnutou (spec 7e). */
export async function propadleZalohy(env: Bindings, t: { teamId: string; gameDate: string }): Promise<number> {
  const db = env.DB;
  const rows = await db.prepare(
    `SELECT id, subject_player_id FROM club_incidents
      WHERE team_id = ? AND status = 'probiha' AND kind = 'dluhy'
        AND deadline IS NOT NULL AND deadline <= ? AND json_extract(resolution_data, '$.zaloha') IS NULL`,
  ).bind(t.teamId, t.gameDate).all<{ id: string; subject_player_id: string | null }>()
    .catch((e) => { logger.warn({ module: M }, `propadlé zálohy ${t.teamId}`, e); return null; });

  let propadlo = 0;
  for (const r of rows?.results ?? []) {
    const zapsano = await db.prepare(
      `UPDATE club_incidents SET resolution_data = json_object('zaloha', 'odmitnuto', 'propadla', 1)
        WHERE id = ? AND team_id = ? AND status = 'probiha' AND json_extract(resolution_data, '$.zaloha') IS NULL`,
    ).bind(r.id, t.teamId).run()
      .catch((e) => { logger.error({ module: M }, `propadnutí zálohy ${r.id}`, e); return null; });
    if ((zapsano?.meta?.changes ?? 0) === 0) continue;
    propadlo++;
    if (!r.subject_player_id) continue;
    await db.batch([posunHrace(db, t.teamId, r.subject_player_id, { morale: ODMITNUTA_ZALOHA_MORALKA, vztah: ODMITNUTA_ZALOHA_VZTAH })])
      .catch((e) => logger.warn({ module: M }, `dopad propadlé zálohy ${r.id}`, e));
    const hrac = await nactiHrace(db, t.teamId, r.subject_player_id);
    if (hrac) {
      await sendPlayerSMS(db, t.teamId, ref(hrac), text(createRng(seedFromString(`zaloha|${r.id}`)), "zaloha_propadla"), smsIncidentu(r.id))
        .catch((e) => logger.warn({ module: M }, `SMS propadlé zálohy ${r.id}`, e));
    }
  }
  return propadlo;
}

/**
 * Nárok na zálohu, na kterou nakonec nedošly peníze. Splátky se strhávají čtyři pondělky
 * (`zauctujSrazky`), takže bez vyplacených peněz by klub splácel, co nedostal. Vracíme proto
 * `resolution_data` na prázdno: nic se nesplácí a trenér smí rozhodnout znovu.
 */
async function vratNarokNaZalohu(db: D1Database, teamId: string, incidentId: string): Promise<VysledekAkce<{ castka: number | null }>> {
  const vraceno = await db.prepare(
    `UPDATE club_incidents SET resolution_data = NULL
      WHERE id = ? AND team_id = ? AND json_extract(resolution_data, '$.zaloha') = 'pujceno'`,
  ).bind(incidentId, teamId).run()
    .catch((e) => { logger.error({ module: M }, `vrácení nároku na zálohu ${incidentId}`, e); return null; });
  if ((vraceno?.meta?.changes ?? 0) === 0) {
    logger.error({ module: M }, `záloha ${incidentId}: výplata selhala a nárok se nepodařilo vrátit, hrozí srážky bez vyplacené zálohy`);
  }
  return { ok: false, kod: 500, chyba: "Zálohu se nepodařilo vyplatit, zkus to znovu" };
}

/** Rozhodnutí trenéra o záloze (spec 7c). Půjčka se splácí čtyři pondělky ze mzdy. */
export async function rozhodniZalohu(
  env: Bindings, teamId: string, incidentId: string, akce: "pujcit" | "odmitnout",
): Promise<VysledekAkce<{ castka: number | null }>> {
  const db = env.DB;
  const [inc, gameDate] = await Promise.all([nactiIncident(db, teamId, incidentId), herniDatum(db, teamId)]);
  if (!inc || !gameDate) return { ok: false, kod: 404, chyba: "Incident nenalezen" };
  if (inc.kind !== "dluhy" || inc.status !== "probiha" || !inc.subject_player_id) {
    return { ok: false, kod: 409, chyba: "O záloze teď rozhodnout nejde" };
  }

  const rng = createRng(seedFromString(`zaloha|${incidentId}`));
  const castka = akce === "pujcit" ? rng.int(ZALOHA_MIN_KC / 100, ZALOHA_MAX_KC / 100) * 100 : null;
  const data = akce === "pujcit"
    ? JSON.stringify({ zaloha: "pujceno", celkem: castka, tydnuZbyva: ZALOHA_TYDNU })
    : JSON.stringify({ zaloha: "odmitnuto" });

  const narok = await db.prepare(
    `UPDATE club_incidents SET resolution_data = ?
      WHERE id = ? AND team_id = ? AND status = 'probiha' AND json_extract(resolution_data, '$.zaloha') IS NULL`,
  ).bind(data, incidentId, teamId).run()
    .catch((e) => { logger.error({ module: M }, `rozhodnutí o záloze ${incidentId}`, e); return null; });
  if ((narok?.meta?.changes ?? 0) === 0) return { ok: false, kod: 409, chyba: "O záloze už bylo rozhodnuto" };

  const hrac = await nactiHrace(db, teamId, inc.subject_player_id);
  const jmeno = hrac ? `${hrac.first_name} ${hrac.last_name}` : nazevSituace(inc.kind);
  if (akce === "pujcit" && castka) {
    const vyplaceno = await recordTransaction(db, teamId, "incident_advance", -castka, `Záloha na mzdu: ${jmeno}`, gameDate, `zaloha-${incidentId}`)
      .then(() => true)
      .catch((e) => { logger.error({ module: M }, `výplata zálohy ${incidentId}`, e); return false; });
    if (!vyplaceno) return await vratNarokNaZalohu(db, teamId, incidentId);
  }
  await db.batch([posunHrace(db, teamId, inc.subject_player_id, akce === "pujcit"
    ? { morale: ZALOHA_MORALKA, vztah: ZALOHA_VZTAH }
    : { morale: ODMITNUTA_ZALOHA_MORALKA, vztah: ODMITNUTA_ZALOHA_VZTAH })])
    .catch((e) => logger.warn({ module: M }, `dopad zálohy ${incidentId}`, e));
  if (hrac) {
    await sendPlayerSMS(db, teamId, ref(hrac), text(rng, akce === "pujcit" ? "zaloha_pujcena" : "zaloha_odmitnuta"), smsIncidentu(incidentId))
      .catch((e) => logger.warn({ module: M }, `SMS o záloze ${incidentId}`, e));
  }
  return { ok: true, castka };
}
