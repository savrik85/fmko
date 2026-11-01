/**
 * Pohár jako plnohodnotná soutěž: co se stane, když se kolo dohraje.
 *
 * Dřív po pohárovém zápase nepřišla zpráva ani push, Zpravodaj o poháru mlčel
 * a vítěz nedostal trofej ani Kořal (turnaj obojí má). Tady se to dohání:
 * upozornění klubům, které hrály, článek do Zpravodaje lig s účastníky, SMS
 * od Redakce Zpravodaje lidským účastníkům a vítězi trofej do vitríny a Kořal.
 */

import { createNotification } from "../community/notifications";
import { pushEnvOf, type OptionalPushKeys } from "../community/phone-push";
import { logger } from "../lib/logger";
import { sendSystemSMS } from "../messaging/system-sms";
import { roundName } from "./cup";

const M = "cup-news";
export const CUP_ARTICLE_TYPE = "cup_round";
const NEWS_DESK = "Redakce Zpravodaje";

export interface CupRoundResult {
  homeName: string;
  awayName: string;
  homeScore: number;
  awayScore: number;
  homePens: number | null;
  awayPens: number | null;
  homeWon: boolean;
  homeTeamId: string | null;
  awayTeamId: string | null;
  homeHuman: boolean;
  awayHuman: boolean;
  homeLeagueId: string | null;
  awayLeagueId: string | null;
}

/** Jedna věta o zápase, s penaltami, když rozhodly. */
export function resultLine(r: CupRoundResult, final = false): string {
  const [w, l, ws, ls, wp, lp] = r.homeWon
    ? [r.homeName, r.awayName, r.homeScore, r.awayScore, r.homePens, r.awayPens]
    : [r.awayName, r.homeName, r.awayScore, r.homeScore, r.awayPens, r.homePens];
  const verb = final ? "porazil" : "vyřadil";
  if (ws === ls && wp != null && lp != null) return `${w} ${verb} ${l} až na penalty (${ws}:${ls}, pen. ${wp}:${lp})`;
  return `${w} ${verb} ${l} ${ws}:${ls}`;
}

function goalsText(n: number): string {
  return n === 1 ? "padl 1 gól" : n >= 2 && n <= 4 ? `padly ${n} góly` : `padlo ${n} gólů`;
}

/** Titulek a text článku za kolo. Lidské kluby jdou v textu první. */
export function cupArticle(results: CupRoundResult[], round: number, totalRounds: number, champion: string | null): { headline: string; body: string } {
  const name = roundName(round, totalRounds);
  const ordered = [...results].sort((a, b) => Number(b.homeHuman || b.awayHuman) - Number(a.homeHuman || a.awayHuman));
  const lines = ordered.map((r) => resultLine(r, round >= totalRounds));
  if (champion) {
    return {
      headline: `Pohár má vítěze: ${champion}`,
      body: `${lines.map((l) => `${l}.`).join("\n")}\n${champion} vyhrál Český amatérský pohár a trofej míří do jeho vitríny.`,
    };
  }
  const goals = results.reduce((s, r) => s + r.homeScore + r.awayScore, 0);
  return {
    headline: `Pohár: ${name} je dohrané`,
    // Každý zápas na vlastním řádku (Zpravodaj z řádků dělá odstavce).
    body: `${lines.map((l) => `${l}.`).join("\n")}${results.length > 1 ? `\nV ${results.length} zápasech ${goalsText(goals)}.` : ""}`,
  };
}

/** Upozornění pro lidský klub: výsledek a co dál. */
export function cupNotice(r: CupRoundResult, home: boolean, round: number, totalRounds: number): { title: string; body: string } {
  const won = home === r.homeWon;
  const name = roundName(round, totalRounds);
  const score = home ? `${r.homeScore}:${r.awayScore}` : `${r.awayScore}:${r.homeScore}`;
  // Penalty jen u remízy: engine ukládá 0:0 i u zápasů, které rozhodla normální hrací doba.
  const pens = r.homeScore === r.awayScore && r.homePens != null && r.awayPens != null
    ? `, pen. ${home ? `${r.homePens}:${r.awayPens}` : `${r.awayPens}:${r.homePens}`}` : "";
  const opponent = home ? r.awayName : r.homeName;
  const next = round < totalRounds ? roundName(round + 1, totalRounds).toLowerCase() : null;
  const verdict = won ? (next ? "postup" : "vítězství") : "konec";
  return {
    title: `🏆 ${name} poháru: ${verdict} (${score}${pens})`,
    body: `Zápas proti ${opponent}. ${won
      ? next ? `Příště vás čeká ${next}.` : "Vyhráli jste Český amatérský pohár!"
      : "V poháru jste letos skončili."}`,
  };
}

async function loadRound(db: D1Database, cupId: string, round: number): Promise<CupRoundResult[]> {
  const rows = await db.prepare(
    `SELECT cm.home_score, cm.away_score, cm.home_pens, cm.away_pens, cm.winner_cup_team_id, cm.home_cup_team_id,
            hc.name AS hn, ac.name AS an, ht.id AS hid, at.id AS aid, ht.user_id AS hu, at.user_id AS au,
            ht.league_id AS hl, at.league_id AS al
       FROM cup_matches cm
       JOIN cup_teams hc ON hc.id = cm.home_cup_team_id
       JOIN cup_teams ac ON ac.id = cm.away_cup_team_id
       LEFT JOIN teams ht ON ht.id = hc.team_id
       LEFT JOIN teams at ON at.id = ac.team_id
      WHERE cm.cup_id = ? AND cm.round = ? AND cm.status = 'simulated'
      ORDER BY cm.bracket_pos`,
  ).bind(cupId, round).all<Record<string, unknown>>();
  return rows.results.map((r) => ({
    homeName: String(r.hn ?? "").trim(),
    awayName: String(r.an ?? "").trim(),
    homeScore: (r.home_score as number) ?? 0,
    awayScore: (r.away_score as number) ?? 0,
    homePens: (r.home_pens as number | null) ?? null,
    awayPens: (r.away_pens as number | null) ?? null,
    homeWon: r.winner_cup_team_id === r.home_cup_team_id,
    homeTeamId: (r.hid as string | null) ?? null,
    awayTeamId: (r.aid as string | null) ?? null,
    homeHuman: !!r.hu && r.hu !== "ai",
    awayHuman: !!r.au && r.au !== "ai",
    homeLeagueId: (r.hl as string | null) ?? null,
    awayLeagueId: (r.al as string | null) ?? null,
  }));
}

/** Vítěz poháru do vitríny (`teams.trophies`, stejný tvar jako liga a turnaj) a Kořal. */
async function awardCupWinner(db: D1Database, teamId: string, cupId: string, seasonNumber: number): Promise<void> {
  const row = await db.prepare("SELECT trophies FROM teams WHERE id = ?").bind(teamId).first<{ trophies: string | null }>();
  let list: Array<Record<string, unknown>> = [];
  try {
    list = JSON.parse(row?.trophies ?? "[]") as Array<Record<string, unknown>>;
  } catch (e) {
    logger.warn({ module: M }, `nečitelné trofeje týmu ${teamId}`, e);
  }
  const leagueId = `cup-${cupId}`;
  if (!list.some((x) => x.leagueId === leagueId)) {
    list.push({ seasonNumber, leagueId, leagueName: `Český amatérský pohár ${seasonNumber}. sezóny`, place: 1, title: "Vítěz Českého amatérského poháru" });
    await db.prepare("UPDATE teams SET trophies = ? WHERE id = ?").bind(JSON.stringify(list), teamId).run();
  }
  const { awardCupWinnerAchievement } = await import("../services/achievements");
  await awardCupWinnerAchievement(db, teamId, { cupId, seasonNumber });
}

/**
 * Kolo je dohrané (volá `simulateCupRound` jen ta invokace, která kolo uzavřela). Každý krok
 * má vlastní pojistku, aby chyba v článku nezastavila upozornění a naopak.
 */
export async function afterCupRoundClosed(
  db: D1Database,
  env: OptionalPushKeys,
  cupId: string,
  round: number,
  championCupTeamId: string | null,
): Promise<void> {
  const cup = await db.prepare("SELECT total_rounds, season_number FROM cup_competitions WHERE id = ?")
    .bind(cupId).first<{ total_rounds: number; season_number: number }>()
    .catch((e) => { logger.warn({ module: M }, "pohár pro zprávy kola", e); return null; });
  if (!cup) return;
  const results = await loadRound(db, cupId, round)
    .catch((e) => { logger.warn({ module: M }, `výsledky kola ${round}`, e); return [] as CupRoundResult[]; });
  if (!results.length) return;

  const pushEnv = pushEnvOf(db, env);
  for (const r of results) {
    for (const home of [true, false]) {
      const teamId = home ? r.homeTeamId : r.awayTeamId;
      if (!teamId || !(home ? r.homeHuman : r.awayHuman)) continue;
      const n = cupNotice(r, home, round, cup.total_rounds);
      await createNotification(db, teamId, "match_result", n.title, n.body, "/pohar", pushEnv)
        .catch((e) => logger.warn({ module: M, teamId }, "upozornění po poháru", e));
    }
  }

  let championName: string | null = null;
  if (championCupTeamId) {
    const ct = await db.prepare("SELECT name, team_id FROM cup_teams WHERE id = ?").bind(championCupTeamId)
      .first<{ name: string; team_id: string | null }>()
      .catch((e) => { logger.warn({ module: M }, "vítěz poháru", e); return null; });
    championName = ct?.name ?? null;
    if (ct?.team_id) {
      await awardCupWinner(db, ct.team_id, cupId, cup.season_number)
        .catch((e) => logger.error({ module: M }, `trofej vítěze poháru ${ct.team_id}`, e));
    }
  }

  // Článek do Zpravodaje každé ligy, ze které někdo hrál; SMS lidským účastníkům.
  const article = cupArticle(results, round, cup.total_rounds, championName);
  const leagues = [...new Set(results.flatMap((r) => [r.homeLeagueId, r.awayLeagueId]).filter((l): l is string => !!l))];
  const newsByLeague = new Map<string, string>();
  for (const leagueId of leagues) {
    const id = crypto.randomUUID();
    const ok = await db.prepare(
      `INSERT INTO news (id, league_id, type, headline, body, season_number, created_at)
       VALUES (?, ?, ?, ?, ?, ?, strftime('%Y-%m-%dT%H:%M:%SZ','now'))`,
    ).bind(id, leagueId, CUP_ARTICLE_TYPE, article.headline, article.body, cup.season_number).run()
      .then(() => true)
      .catch((e) => { logger.warn({ module: M }, `článek o poháru do ligy ${leagueId}`, e); return false; });
    if (ok) newsByLeague.set(leagueId, id);
  }
  for (const r of results) {
    for (const home of [true, false]) {
      const teamId = home ? r.homeTeamId : r.awayTeamId;
      const leagueId = home ? r.homeLeagueId : r.awayLeagueId;
      const newsId = leagueId ? newsByLeague.get(leagueId) : undefined;
      if (!teamId || !newsId || !(home ? r.homeHuman : r.awayHuman)) continue;
      await sendSystemSMS(db, teamId, NEWS_DESK, `📰 Ve Zpravodaji vyšlo: „${article.headline}“`,
        { type: "guide", href: `/zpravodaj?article=${newsId}`, label: "Otevřít Zpravodaj", newsId })
        .catch((e) => logger.warn({ module: M, teamId }, "SMS o článku z poháru", e));
    }
  }
  logger.info({ module: M }, `pohár ${cupId}, ${roundName(round, cup.total_rounds)}: ${results.length} zápasů, články do ${newsByLeague.size} lig`);
}

const CUP_SMS_SENDER = "Český amatérský pohár";

const pragueMatchDay = new Intl.DateTimeFormat("cs-CZ", { weekday: "long", day: "numeric", month: "numeric", timeZone: "Europe/Prague" });
const pragueTime = new Intl.DateTimeFormat("cs-CZ", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Prague" });

/** „v sobotu 7. 11. ve 12:00“ z výkopu. */
export function kickoffPhrase(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const day = pragueMatchDay.format(d); // „sobota 7. 11.“
  const [weekday, ...rest] = day.split(" ");
  const accusative: Record<string, string> = {
    pondělí: "v pondělí", úterý: "v úterý", středa: "ve středu", čtvrtek: "ve čtvrtek",
    pátek: "v pátek", sobota: "v sobotu", neděle: "v neděli",
  };
  const time = pragueTime.format(d);
  return `${accusative[weekday] ?? weekday} ${rest.join(" ")} ${time.startsWith("12") ? "ve" : "v"} ${time}`;
}

/** Text SMS o losu pro jeden klub. */
export function drawSms(o: { roundName: string; home: boolean; opponent: string; kickoff: string }): string {
  return `Los poháru je hotový. ${o.roundName} hrajete ${o.home ? "doma" : "venku"} proti ${o.opponent}${o.kickoff ? `, ${o.kickoff}` : ""}. Sestavu nastavíte jako u ligy.`;
}

/**
 * SMS po losu kola každému lidskému klubu, který v kole hraje. V 1. kole i klubům
 * s volným losem, ať vědí, proč nehrají.
 */
export async function notifyCupDraw(db: D1Database, cupId: string, round: number): Promise<number> {
  const cup = await db.prepare("SELECT total_rounds FROM cup_competitions WHERE id = ?").bind(cupId).first<{ total_rounds: number }>()
    .catch((e) => { logger.warn({ module: M }, "pohár pro los", e); return null; });
  if (!cup) return 0;
  const name = roundName(round, cup.total_rounds);
  const rows = await db.prepare(
    `SELECT cm.scheduled_at, hc.name AS hn, ac.name AS an, ht.id AS hid, at.id AS aid, ht.user_id AS hu, at.user_id AS au
       FROM cup_matches cm
       JOIN cup_teams hc ON hc.id = cm.home_cup_team_id
       JOIN cup_teams ac ON ac.id = cm.away_cup_team_id
       LEFT JOIN teams ht ON ht.id = hc.team_id
       LEFT JOIN teams at ON at.id = ac.team_id
      WHERE cm.cup_id = ? AND cm.round = ?`,
  ).bind(cupId, round).all<{ scheduled_at: string | null; hn: string; an: string; hid: string | null; aid: string | null; hu: string | null; au: string | null }>()
    .catch((e) => { logger.warn({ module: M }, `los kola ${round}`, e); return { results: [] as Array<{ scheduled_at: string | null; hn: string; an: string; hid: string | null; aid: string | null; hu: string | null; au: string | null }> }; });

  const { cupKickoffIso } = await import("../lib/match-tick-schedule");
  let sent = 0;
  for (const r of rows.results) {
    const kickoff = kickoffPhrase(cupKickoffIso(r.scheduled_at));
    r.hn = r.hn.trim();
    r.an = r.an.trim();
    for (const [teamId, user, home, opponent] of [[r.hid, r.hu, true, r.an], [r.aid, r.au, false, r.hn]] as const) {
      if (!teamId || !user || user === "ai") continue;
      await sendSystemSMS(db, teamId, CUP_SMS_SENDER, drawSms({ roundName: name, home, opponent, kickoff }),
        { type: "guide", href: "/pohar", label: "Otevřít Pohár" })
        .then(() => { sent++; })
        .catch((e) => logger.warn({ module: M, teamId }, "SMS o losu poháru", e));
    }
  }

  if (round === 1) {
    const byes = await db.prepare(
      `SELECT t.id FROM cup_teams ct JOIN teams t ON t.id = ct.team_id
        WHERE ct.cup_id = ? AND t.user_id IS NOT NULL AND t.user_id != 'ai'
          AND NOT EXISTS (SELECT 1 FROM cup_matches m WHERE m.cup_id = ct.cup_id AND m.round = 1
                            AND (m.home_cup_team_id = ct.id OR m.away_cup_team_id = ct.id))`,
    ).bind(cupId).all<{ id: string }>()
      .catch((e) => { logger.warn({ module: M }, "volné losy pro SMS", e); return { results: [] as Array<{ id: string }> }; });
    for (const b of byes.results) {
      await sendSystemSMS(db, b.id, CUP_SMS_SENDER,
        "Los poháru je hotový. V 1. kole máte volný los, do poháru vstoupíte až ve 2. kole. Soupeře vám pošleme po dalším losu.",
        { type: "guide", href: "/pohar", label: "Otevřít Pohár" })
        .then(() => { sent++; })
        .catch((e) => logger.warn({ module: M, teamId: b.id }, "SMS o volném losu", e));
    }
  }
  logger.info({ module: M }, `los poháru ${cupId}, ${name}: ${sent} SMS`);
  return sent;
}
