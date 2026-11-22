/**
 * Zpráva trenéra hráči: ptá se na incident? (spec 7a)
 *
 * Běží v POST zprávy DŘÍV, než se začne generovat odpověď: určí téma, uloží ho do
 * vlákna na zbytek herního dne a vyhodnotí výslech. Model pak dostane hotový pokyn.
 */

import { logger } from "../lib/logger";
import { zaznamenejPromluvu } from "./hrozi-db";
import { nactiZtraty } from "./popis";
import { involvedIncidentInText, jeRecOHrozicim, najdiIncidentVTextu, temaZeStavu } from "./tema";
import { vyslechni } from "./vyslech";
import type { VysledekVyslechu } from "./znalosti";

import { isInquiryRequest, tacticOf } from "./interrogation-tactics";
import { ZNALOST_PACHATEL_DNI } from "./nastaveni";
const M = "incidents-zprava";

/**
 * Uloží téma do `conversations.ai_thread_state`. Běží-li vlákno (`ai_thread_active = 1`),
 * ostatní klíče nechá být. Neběží-li, stav nahradí čistým, ať po „Zeptat se" nezůstane starý
 * `awaiting: "done"` nebo `resolution` z dřívějška - jinak by se ukázal banner „Konverzace
 * ukončena" i pro nové téma.
 */
export async function nastavTema(db: D1Database, convId: string, incidentId: string, den: string): Promise<boolean> {
  const r = await db.prepare(
    `UPDATE conversations SET ai_thread_state = CASE WHEN ai_thread_active = 1 THEN json_set(
        CASE WHEN json_valid(ai_thread_state) THEN ai_thread_state ELSE '{}' END,
        '$.incidentId', ?, '$.incidentDen', ?)
      ELSE json_object('incidentId', ?, 'incidentDen', ?) END
      WHERE id = ?`,
  ).bind(incidentId, den, incidentId, den, convId).run()
    .catch((e) => { logger.warn({ module: M }, `téma konverzace ${convId}`, e); return null; });
  return (r?.meta?.changes ?? 0) > 0;
}

async function culpritRevealed(db: D1Database, teamId: string, incidentId: string): Promise<boolean> {
  const row = await db.prepare("SELECT culprit_revealed FROM club_incidents WHERE id = ? AND team_id = ?")
    .bind(incidentId, teamId).first<{ culprit_revealed: number | null }>()
    .catch((e) => { logger.warn({ module: M }, `odhalení pachatele ${incidentId}`, e); return null; });
  return row?.culprit_revealed === 1;
}

/** Role, se kterými hráč o incidentu ví víc než kádr (club_incident_knowledge). */
const INVOLVED_ROLES = ["pachatel", "obvineny", "svedek", "kamarad", "rival"] as const;

/**
 * Incident, na který se zpráva ptá, mezi těmi, do kterých je hráč zapletený: odhalený pachatel,
 * obviněný trenérem, nebo role ve znalostech. I uzavřený, dokud si ho pachatel pamatuje
 * (`ZNALOST_PACHATEL_DNI`). Otevřené neodhalené krádeže hledá už dotaz výš pro každého.
 */
async function findInvolvedIncident(
  db: D1Database, o: { teamId: string; playerId: string; text: string; season: number; gameDate: string },
): Promise<string | null> {
  const rows = await db.prepare(
    `SELECT i.id, i.kind, i.loss FROM club_incidents i
      WHERE i.team_id = ? AND i.season_number = ? AND i.category IN ('kradez', 'poskozeni')
        AND (i.status IN ('otevreny', 'policie')
             OR (i.status = 'uzavreny' AND julianday(substr(i.resolved_on, 1, 10)) >= julianday(substr(?, 1, 10)) - ?))
        AND ((i.culprit_player_id = ? AND i.culprit_revealed = 1)
             OR EXISTS (SELECT 1 FROM club_incident_knowledge k
                         WHERE k.incident_id = i.id AND k.player_id = ? AND k.team_id = i.team_id
                           AND k.role IN (${INVOLVED_ROLES.map(() => "?").join(", ")}))
             OR EXISTS (SELECT 1 FROM json_each(CASE WHEN json_valid(i.accused) THEN i.accused ELSE '[]' END)
                         WHERE json_extract(value, '$.playerId') = ?))
      ORDER BY i.game_date DESC LIMIT 10`,
  ).bind(o.teamId, o.season, o.gameDate, ZNALOST_PACHATEL_DNI, o.playerId, o.playerId, ...INVOLVED_ROLES, o.playerId)
    .all<{ id: string; kind: string; loss: string }>()
    .catch((e) => { logger.warn({ module: M }, `incidenty, do kterých je zapletený ${o.playerId}`, e); return null; });
  return involvedIncidentInText(o.text, (rows?.results ?? []).map((r) => ({ id: r.id, kind: r.kind, ztraty: nactiZtraty(r.loss) })));
}

export async function zpracujZpravuTrenera(
  db: D1Database, opts: { teamId: string; convId: string; playerId: string; text: string },
): Promise<{ incidentId: string; vyslech: VysledekVyslechu | null } | null> {
  const zaklad = await db.prepare(
    `SELECT c.ai_thread_state, t.game_date,
            (SELECT number FROM seasons WHERE status = 'active' ORDER BY number DESC LIMIT 1) AS sezona
       FROM conversations c JOIN teams t ON t.id = c.team_id
      WHERE c.id = ? AND c.team_id = ?`,
  ).bind(opts.convId, opts.teamId).first<{ ai_thread_state: string | null; game_date: string | null; sezona: number | null }>()
    .catch((e) => { logger.warn({ module: M }, `konverzace ${opts.convId}`, e); return null; });
  if (!zaklad?.game_date || zaklad.sezona == null) return null;
  const den = zaklad.game_date.slice(0, 10);

  // „Vrať to“ / „zaplať tu škodu“ pachateli (restitution.ts): rozhodne se dřív, než hráč odpoví.
  const { tryRestitution } = await import("./restitution");
  const amends = await tryRestitution(db, { teamId: opts.teamId, playerId: opts.playerId, text: opts.text, gameDate: zaklad.game_date })
    .catch((e) => { logger.warn({ module: M }, `přemlouvání pachatele ${opts.playerId}`, e); return null; });
  // Zpráva, která rozhodla o vrácení nebo náhradě, musí dostat odpověď: incident se stává tématem
  // a na téma hráč odepíše vždy (coach-initiated.ts, ai-player-spawn.ts). Procházka (E2E 22. 11.)
  // na „Dáš to klukům zpátky, nebo nic?“ vrátil 31 696 Kč a zprávu nechal na přečteno.
  // Odmítnutí neodhaleného pachatele téma nezakládá: to by spustilo výslech, o který trenér nežádal.
  if (amends && (amends.outcome !== "refused" || await culpritRevealed(db, opts.teamId, amends.incidentId))) {
    await nastavTema(db, opts.convId, amends.incidentId, den);
    return { incidentId: amends.incidentId, vyslech: null };
  }

  let incidentId = temaZeStavu(zaklad.ai_thread_state, den)?.incidentId ?? null;
  if (!incidentId) {
    const kandidati = await db.prepare(
      `SELECT id, kind, loss FROM club_incidents
        WHERE team_id = ? AND season_number = ? AND status IN ('otevreny', 'policie') AND culprit_revealed = 0
          AND category IN ('kradez', 'poskozeni')
        ORDER BY game_date DESC LIMIT 10`,
    ).bind(opts.teamId, zaklad.sezona).all<{ id: string; kind: string; loss: string }>()
      .catch((e) => { logger.warn({ module: M }, `incidenty k otázce ${opts.teamId}`, e); return null; });
    incidentId = najdiIncidentVTextu(
      opts.text,
      (kandidati?.results ?? []).map((r) => ({ id: r.id, kind: r.kind, ztraty: nactiZtraty(r.loss) })),
    );
    if (!incidentId) {
      // Řeči z hospody: trenér píše hráči, který v hospodě ohlásil čin (spec 9a).
      const hrozici = await db.prepare(
        `SELECT id, kind FROM club_incidents
          WHERE team_id = ? AND status = 'hrozi' AND culprit_player_id = ?
          ORDER BY game_date DESC LIMIT 1`,
      ).bind(opts.teamId, opts.playerId).first<{ id: string; kind: string }>()
        .catch((e) => { logger.warn({ module: M }, `hrozící čin hráče ${opts.playerId}`, e); return null; });
      if (hrozici && jeRecOHrozicim(opts.text, hrozici.kind)) incidentId = hrozici.id;
    }
    if (!incidentId) {
      // Odhalený nebo uzavřený incident, ve kterém je hráč zapletený (pachatel, obviněný, svědek):
      // na otázku k němu musí odpovědět, proto téma. Hrdlička (E2E 22. 11.) nechal „Tak co, ukradl
      // jsi ty dresy, nebo ne?“ 4× z 8 na přečteno a vlákno se uzavřelo se vztahem −10 a morálkou −8.
      // Vyslýchat ani pátrat tu není co (neodhalené otevřené incidenty našel dotaz výš).
      const involved = await findInvolvedIncident(db, { ...opts, season: zaklad.sezona, gameDate: zaklad.game_date });
      if (!involved) return null;
      await nastavTema(db, opts.convId, involved, den);
      return { incidentId: involved, vyslech: null };
    }
    // Navazující otázka („a kde?") klíčová slova mít nemusí, téma proto platí do konce dne.
    await nastavTema(db, opts.convId, incidentId, den);
  }

  // Úkol „poptej se“: hráč se druhý den ozve s tím, co podle DB opravdu slyšel (coach-commitments.ts).
  if (isInquiryRequest(opts.text)) {
    const { recordInquiryTask } = await import("../messaging/coach-commitments");
    await recordInquiryTask(db, { teamId: opts.teamId, convId: opts.convId, playerId: opts.playerId, incidentId, coachMessage: opts.text })
      .catch((e) => logger.warn({ module: M }, `úkol poptat se ${incidentId}`, e));
  }
  // Blaf s důkazem, slib mírnějšího trestu, policie, úplatek (interrogation-tactics.ts).
  const tactic = tacticOf(opts.text);
  const vyslech = await vyslechni(db, { teamId: opts.teamId, incidentId, playerId: opts.playerId, gameDate: zaklad.game_date, ...(tactic ? { tactic } : {}) });
  if (vyslech) return { incidentId, vyslech: vyslech.vysledek };
  // Hrozící čin se nevyslýchá. Rozhovor s tím, kdo ho ohlásil, sníží šanci, že to udělá (spec 9a).
  // U jiného incidentu nebo jiného hráče hlídaný UPDATE nic nezmění.
  await zaznamenejPromluvu(db, { teamId: opts.teamId, incidentId, playerId: opts.playerId, den });
  return { incidentId, vyslech: null };
}
