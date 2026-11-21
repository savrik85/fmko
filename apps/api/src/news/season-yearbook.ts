/**
 * Ročenka sezóny: článek o jedné sezóně jednoho lidského klubu.
 *
 * Fáze `yearbook` konce sezóny (season/end-season.ts) ji píše po rekapitulaci, po jednom
 * klubu na krok. Podklady jsou jen ověřená fakta z databáze: konečné pořadí, největší výhra
 * a prohra, přestupy mezi kluby trenérů, incidenty, ocenění a pár skutečných vět hráčů
 * z Telefonu. Model z nich napíše text, při výpadku AI ho složí šablona.
 *
 * Vyjde jako `news.type = 'season_yearbook'` s `team_id`: na klubovém webu v rubrice Ročenka,
 * na obrazovce konce sezóny odkaz a klubu SMS od redakce.
 */

import { logger } from "../lib/logger";
import { generateText, type AiContext } from "../lib/ai-provider";

const M = "season-yearbook";
const NEWS_DESK = "Redakce Zpravodaje";

export interface YearbookMatch {
  opponent: string;
  myScore: number;
  oppScore: number;
  home: boolean;
}

export interface YearbookFacts {
  teamName: string;
  leagueName: string;
  seasonNumber: number;
  finalPos: number | null;
  totalTeams: number;
  champion: string | null;
  isChampion: boolean;
  record: { wins: number; draws: number; losses: number; goalsFor: number; goalsAgainst: number };
  biggestWin: YearbookMatch | null;
  worstLoss: YearbookMatch | null;
  bestCrowd: { opponent: string; attendance: number } | null;
  transfersIn: Array<{ player: string; from: string; fee: number }>;
  transfersOut: Array<{ player: string; to: string; fee: number }>;
  incidents: { total: number; byCategory: Record<string, number> };
  awardsMine: string[];
  quotes: Array<{ player: string; text: string }>;
}

function money(n: number): string {
  return `${n.toLocaleString("cs-CZ").replace(/ /g, " ")} Kč`;
}

function scoreOf(m: YearbookMatch): string {
  return `${m.myScore}:${m.oppScore}`;
}

const INCIDENT_LABEL: Record<string, string> = {
  kradez: "krádež", poskozeni: "poškození", zivotni: "životní situace", pozitivni: "dobrá zpráva",
};

/** Fakta jako řádky pro model i pro šablonu. Každý řádek je ověřitelný z databáze. */
export function factLines(f: YearbookFacts): string[] {
  const lines: string[] = [];
  lines.push(`Klub: ${f.teamName}, soutěž ${f.leagueName}, ${f.seasonNumber}. sezóna.`);
  if (f.finalPos) lines.push(`Konečné pořadí: ${f.finalPos}. místo z ${f.totalTeams}.${f.isChampion ? " Klub je mistrem soutěže." : f.champion ? ` Mistrem je ${f.champion}.` : ""}`);
  const r = f.record;
  lines.push(`Bilance: ${r.wins} výher, ${r.draws} remíz, ${r.losses} proher, skóre ${r.goalsFor}:${r.goalsAgainst}.`);
  if (f.biggestWin) lines.push(`Největší výhra: ${scoreOf(f.biggestWin)} ${f.biggestWin.home ? "doma" : "venku"} s ${f.biggestWin.opponent}.`);
  if (f.worstLoss) lines.push(`Nejtěžší prohra: ${scoreOf(f.worstLoss)} ${f.worstLoss.home ? "doma" : "venku"} s ${f.worstLoss.opponent}.`);
  if (f.bestCrowd) lines.push(`Nejvíc diváků: ${f.bestCrowd.attendance} na zápase s ${f.bestCrowd.opponent}.`);
  for (const t of f.transfersIn) lines.push(`Příchod: ${t.player} z klubu ${t.from} za ${money(t.fee)}.`);
  for (const t of f.transfersOut) lines.push(`Odchod: ${t.player} do klubu ${t.to} za ${money(t.fee)}.`);
  if (f.incidents.total > 0) {
    const parts = Object.entries(f.incidents.byCategory).map(([k, n]) => `${INCIDENT_LABEL[k] ?? k} ${n}×`);
    lines.push(`Incidenty v klubu: ${f.incidents.total} (${parts.join(", ")}).`);
  }
  for (const a of f.awardsMine) lines.push(`Ocenění: ${a}.`);
  for (const q of f.quotes) lines.push(`Hráč ${q.player} napsal trenérovi: „${q.text}“`);
  return lines;
}

/** Text bez modelu: krátké odstavce jen z faktů. */
export function fallbackYearbook(f: YearbookFacts): { headline: string; body: string } {
  const r = f.record;
  const paragraphs: string[] = [];
  paragraphs.push(f.finalPos
    ? `${f.teamName} uzavřel ${f.seasonNumber}. sezónu v soutěži ${f.leagueName} na ${f.finalPos}. místě z ${f.totalTeams}.${f.isChampion ? " Je to titul mistra!" : ""}`
      + ` Bilance ${r.wins} výher, ${r.draws} remíz a ${r.losses} proher, skóre ${r.goalsFor}:${r.goalsAgainst}.`
    : `${f.teamName} má za sebou ${f.seasonNumber}. sezónu v soutěži ${f.leagueName}.`);
  const moments: string[] = [];
  if (f.biggestWin) moments.push(`Nejvíc se slavilo po výhře ${scoreOf(f.biggestWin)} s ${f.biggestWin.opponent}.`);
  if (f.worstLoss) moments.push(`Naopak ${scoreOf(f.worstLoss)} s ${f.worstLoss.opponent} se v kabině vzpomíná nerado.`);
  if (f.bestCrowd) moments.push(`Nejvíc lidí, ${f.bestCrowd.attendance}, přišlo na zápas s ${f.bestCrowd.opponent}.`);
  if (moments.length) paragraphs.push(moments.join(" "));
  const transfers = [
    ...f.transfersIn.map((t) => `${t.player} přišel z klubu ${t.from}`),
    ...f.transfersOut.map((t) => `${t.player} odešel do klubu ${t.to}`),
  ];
  if (transfers.length) paragraphs.push(`Na trhu: ${transfers.join(", ")}.`);
  if (f.incidents.total > 0) paragraphs.push(`Klidná sezóna to nebyla, klub řešil ${f.incidents.total} ${f.incidents.total === 1 ? "incident" : f.incidents.total < 5 ? "incidenty" : "incidentů"}.`);
  if (f.awardsMine.length) paragraphs.push(`Ocenění: ${f.awardsMine.join(", ")}.`);
  if (f.quotes.length) paragraphs.push(`Z kabiny: ${f.quotes.map((q) => `„${q.text}“ (${q.player})`).join(" ")}`);
  return { headline: `Ročenka ${f.teamName}: ${f.seasonNumber}. sezóna`, body: paragraphs.join("\n\n") };
}

function cleanText(text: string): string {
  return text.replace(/[—–]/g, ",").replace(/[*#]/g, "").trim();
}

/** Text od modelu. Null = model nic použitelného nevrátil. */
async function modelYearbook(ai: AiContext, f: YearbookFacts): Promise<{ headline: string; body: string } | null> {
  const prompt = `Jsi redaktor Okresního zpravodaje a píšeš ročenku jednoho amatérského fotbalového klubu za uplynulou sezónu.

OVĚŘENÁ FAKTA (používej JEN je):
${factLines(f).join("\n")}

ÚKOL: Napiš ročenku (180 až 280 slov) jako vzpomínku na sezónu pro fanoušky klubu. Vesnický fotbal, hospoda, lehký humor, ale bez výmyslů.

PRAVIDLA:
- Používej jen jména, kluby a čísla z faktů, nic dalšího nevymýšlej (žádné góly, střelce ani výsledky navíc).
- Citace hráčů uveď doslova, nebo vůbec.
- Česky, bez markdown, bez odrážek, bez pomlček.
- PRVNÍ řádek je titulek (nejvýš 80 znaků), od druhého řádku text.`;
  const text = await generateText(ai, prompt, { maxTokens: 1400, temperature: 0.6, module: M })
    .catch((e) => { logger.warn({ module: M }, "ročenka od modelu", e); return null; });
  if (typeof text !== "string") return null;
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
  if (lines.length < 2) return null;
  const headline = cleanText(lines[0].replace(/^(titulek|nadpis)\s*:?\s*/i, "")).slice(0, 90);
  const body = cleanText(lines.slice(1).join("\n\n"));
  if (!headline || body.length < 200) return null;
  return { headline, body };
}

/** Okno sezóny podle kalendáře soutěže (pro přestupy a SMS, které nemají číslo sezóny). */
async function seasonWindow(db: D1Database, leagueId: string, season: number): Promise<{ from: string; to: string } | null> {
  const row = await db.prepare("SELECT MIN(scheduled_at) AS a, MAX(scheduled_at) AS b FROM season_calendar WHERE league_id = ? AND season_number = ?")
    .bind(leagueId, season).first<{ a: string | null; b: string | null }>();
  if (!row?.a || !row.b) return null;
  // Přestupy a zprávy začínají už v přípravě, proto okno od 30 dní před prvním kolem.
  const from = new Date(Date.parse(row.a) - 30 * 86400_000).toISOString();
  return { from, to: new Date(Date.parse(row.b) + 86400_000).toISOString() };
}

/** Sesbírá fakta. Každý dotaz je zvlášť a bez korelovaných poddotazů. */
export async function collectYearbookFacts(db: D1Database, teamId: string, leagueId: string, season: number): Promise<YearbookFacts | null> {
  const team = await db.prepare("SELECT name FROM teams WHERE id = ?").bind(teamId).first<{ name: string }>();
  if (!team) return null;
  const league = await db.prepare("SELECT name FROM leagues WHERE id = ?").bind(leagueId).first<{ name: string }>();
  const recapRow = await db.prepare("SELECT data FROM season_recap WHERE team_id = ? AND season_number = ?").bind(teamId, season).first<{ data: string }>();
  let recap: Record<string, any> = {};
  try {
    recap = recapRow ? JSON.parse(recapRow.data) as Record<string, any> : {};
  } catch (e) {
    logger.warn({ module: M }, `nečitelná rekapitulace ${teamId}`, e);
  }

  const matches = await db.prepare(
    `SELECT m.home_team_id, m.away_team_id, m.home_score, m.away_score, m.attendance, th.name AS home_name, ta.name AS away_name
       FROM matches m JOIN season_calendar sc ON sc.id = m.calendar_id
       JOIN teams th ON th.id = m.home_team_id JOIN teams ta ON ta.id = m.away_team_id
      WHERE m.league_id = ? AND sc.season_number = ? AND m.status = 'simulated' AND (m.home_team_id = ? OR m.away_team_id = ?)`,
  ).bind(leagueId, season, teamId, teamId).all<{ home_team_id: string; away_team_id: string; home_score: number; away_score: number; attendance: number | null; home_name: string; away_name: string }>();
  const record = { wins: 0, draws: 0, losses: 0, goalsFor: 0, goalsAgainst: 0 };
  let biggestWin: YearbookMatch | null = null;
  let worstLoss: YearbookMatch | null = null;
  let bestCrowd: { opponent: string; attendance: number } | null = null;
  for (const m of matches.results) {
    const home = m.home_team_id === teamId;
    const mine: YearbookMatch = {
      opponent: home ? m.away_name : m.home_name, myScore: home ? m.home_score : m.away_score, oppScore: home ? m.away_score : m.home_score, home,
    };
    record.goalsFor += mine.myScore;
    record.goalsAgainst += mine.oppScore;
    const diff = mine.myScore - mine.oppScore;
    if (diff > 0) {
      record.wins++;
      if (!biggestWin || diff > biggestWin.myScore - biggestWin.oppScore || (diff === biggestWin.myScore - biggestWin.oppScore && mine.myScore > biggestWin.myScore)) biggestWin = mine;
    } else if (diff < 0) {
      record.losses++;
      if (!worstLoss || diff < worstLoss.myScore - worstLoss.oppScore) worstLoss = mine;
    } else record.draws++;
    if (home && (m.attendance ?? 0) > (bestCrowd?.attendance ?? 0)) bestCrowd = { opponent: mine.opponent, attendance: m.attendance ?? 0 };
  }

  const window = await seasonWindow(db, leagueId, season);
  const transfersIn: YearbookFacts["transfersIn"] = [];
  const transfersOut: YearbookFacts["transfersOut"] = [];
  if (window) {
    // Přestupy mezi kluby trenérů (AI kluby ne): kupující je from_team_id, prodávající to_team_id.
    const rows = await db.prepare(
      `SELECT o.from_team_id, o.to_team_id, COALESCE(o.counter_amount, o.offer_amount) AS fee,
              COALESCE(p.first_name, dp.first_name) || ' ' || COALESCE(p.last_name, dp.last_name) AS player,
              tf.name AS from_name, tt.name AS to_name
         FROM transfer_offers o
         JOIN teams tf ON tf.id = o.from_team_id JOIN teams tt ON tt.id = o.to_team_id
         LEFT JOIN players p ON p.id = o.player_id LEFT JOIN departed_players dp ON dp.id = o.player_id
        WHERE o.status = 'accepted' AND o.created_at >= ? AND o.created_at <= ?
          AND (o.from_team_id = ? OR o.to_team_id = ?)
          AND tf.user_id IS NOT NULL AND tf.user_id != 'ai' AND tt.user_id IS NOT NULL AND tt.user_id != 'ai'
        ORDER BY fee DESC LIMIT 6`,
    ).bind(window.from.replace("T", " ").slice(0, 19), window.to.replace("T", " ").slice(0, 19), teamId, teamId)
      .all<{ from_team_id: string; to_team_id: string; fee: number; player: string | null; from_name: string; to_name: string }>()
      .catch((e) => { logger.warn({ module: M }, "přestupy pro ročenku", e); return { results: [] as Array<{ from_team_id: string; to_team_id: string; fee: number; player: string | null; from_name: string; to_name: string }> }; });
    for (const t of rows.results) {
      if (!t.player) continue;
      if (t.from_team_id === teamId) transfersIn.push({ player: t.player, from: t.to_name, fee: t.fee });
      else transfersOut.push({ player: t.player, to: t.from_name, fee: t.fee });
    }
  }

  const inc = await db.prepare("SELECT category, COUNT(*) AS n FROM club_incidents WHERE team_id = ? AND season_number = ? GROUP BY category")
    .bind(teamId, season).all<{ category: string; n: number }>()
    .catch((e) => { logger.warn({ module: M }, "incidenty pro ročenku", e); return { results: [] as Array<{ category: string; n: number }> }; });
  const byCategory: Record<string, number> = {};
  for (const r of inc.results) byCategory[r.category] = r.n;
  const incidents = { total: inc.results.reduce((s, r) => s + r.n, 0), byCategory };

  const awardsMine: string[] = [];
  const awards = recap.awards ?? {};
  const pickName = (a: unknown) => (a && typeof a === "object" && "name" in a ? String((a as { name: unknown }).name) : null);
  const mineTeam = (a: unknown) => a && typeof a === "object" && "teamName" in a && (a as { teamName: unknown }).teamName === team.name;
  if (mineTeam(awards.playerOfSeason)) awardsMine.push(`Hráč sezóny ${pickName(awards.playerOfSeason)}`);
  if (mineTeam(awards.topScorer)) awardsMine.push(`Král střelců ${pickName(awards.topScorer)}`);
  if (mineTeam(awards.discovery)) awardsMine.push(`Objev sezóny ${pickName(awards.discovery)}`);
  if (Array.isArray(awards.bestElevenMine) && awards.bestElevenMine.length) {
    awardsMine.push(`v nejlepší jedenáctce ${awards.bestElevenMine.map((p: { name: string }) => p.name).join(", ")}`);
  }

  const quotes: YearbookFacts["quotes"] = [];
  if (window) {
    const rows = await db.prepare(
      `SELECT m.sender_name, m.body FROM messages m JOIN conversations c ON c.id = m.conversation_id
        WHERE c.team_id = ? AND c.type IN ('player', 'squad_group') AND m.sender_type = 'player'
          AND m.sent_at >= ? AND m.sent_at <= ? AND length(m.body) BETWEEN 30 AND 140
        ORDER BY length(m.body) DESC LIMIT 40`,
    ).bind(teamId, window.from, window.to).all<{ sender_name: string | null; body: string }>()
      .catch((e) => { logger.warn({ module: M }, "hlášky hráčů pro ročenku", e); return { results: [] as Array<{ sender_name: string | null; body: string }> }; });
    // Dvě hlášky od různých hráčů, nejdřív ty s vykřičníkem (bývají nejvtipnější).
    const pool = [...rows.results].filter((r) => r.sender_name && !r.body.includes("http"))
      .sort((a, b) => Number(b.body.includes("!")) - Number(a.body.includes("!")));
    for (const r of pool) {
      if (quotes.length >= 2) break;
      if (quotes.some((q) => q.player === r.sender_name)) continue;
      quotes.push({ player: r.sender_name!, text: r.body.replace(/\s+/g, " ").trim() });
    }
  }

  return {
    teamName: team.name,
    leagueName: league?.name ?? "soutěž",
    seasonNumber: season,
    finalPos: typeof recap.finalPos === "number" ? recap.finalPos : null,
    totalTeams: typeof recap.totalTeams === "number" ? recap.totalTeams : 0,
    champion: recap.champion?.name ?? null,
    isChampion: !!recap.champion?.isMe,
    record, biggestWin, worstLoss, bestCrowd, transfersIn, transfersOut, incidents, awardsMine, quotes,
  };
}

/**
 * Ročenka jednoho klubu. Idempotentní: druhé volání nic nenapíše ani nepošle.
 * Vrací id článku (i už existujícího) nebo null, když chybí podklady.
 */
export async function writeTeamYearbook(db: D1Database, ai: AiContext | null, teamId: string, leagueId: string, season: number): Promise<string | null> {
  const existing = await db.prepare("SELECT id FROM news WHERE team_id = ? AND type = 'season_yearbook' AND season_number = ?")
    .bind(teamId, season).first<{ id: string }>();
  if (existing) return existing.id;
  const facts = await collectYearbookFacts(db, teamId, leagueId, season);
  if (!facts) return null;
  const text = (ai ? await modelYearbook(ai, facts) : null) ?? fallbackYearbook(facts);
  if (ai && text.headline.startsWith("Ročenka ")) logger.warn({ module: M }, `ročenka ${teamId} ze šablony, model nevrátil použitelný text`);
  const newsId = crypto.randomUUID();
  // Unikátní článek bez unikátního indexu: INSERT jen když ještě není (souběžný krok nic nezdvojí).
  const res = await db.prepare(
    `INSERT INTO news (id, league_id, team_id, type, headline, body, season_number, created_at)
     SELECT ?, ?, ?, 'season_yearbook', ?, ?, ?, strftime('%Y-%m-%dT%H:%M:%SZ','now')
      WHERE NOT EXISTS (SELECT 1 FROM news WHERE team_id = ? AND type = 'season_yearbook' AND season_number = ?)`,
  ).bind(newsId, leagueId, teamId, text.headline, text.body, season, teamId, season).run();
  if (!res.meta.changes) {
    const other = await db.prepare("SELECT id FROM news WHERE team_id = ? AND type = 'season_yearbook' AND season_number = ?")
      .bind(teamId, season).first<{ id: string }>();
    return other?.id ?? null;
  }
  await db.prepare("UPDATE season_recap SET data = json_set(data, '$.yearbookNewsId', ?) WHERE team_id = ? AND season_number = ?")
    .bind(newsId, teamId, season).run()
    .catch((e) => logger.warn({ module: M }, "odkaz na ročenku v rekapitulaci", e));
  const { sendSystemSMS } = await import("../messaging/system-sms");
  await sendSystemSMS(db, teamId, NEWS_DESK, `📖 Ročenka vašeho klubu za ${season}. sezónu je hotová: „${text.headline}“`,
    { type: "guide", href: `/klub/${teamId}`, label: "Přečíst ročenku", newsId })
    .catch((e) => logger.warn({ module: M }, "SMS o ročence", e));
  logger.info({ module: M }, `ročenka ${teamId} sezóna ${season}`);
  return newsId;
}
