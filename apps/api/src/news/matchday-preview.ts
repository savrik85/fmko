/**
 * Matchday preview — článek před kolem konkrétní ligy.
 * Generuje jeden článek na ligu pokryjící všechny zápasy nadcházejícího kola.
 * Zdroje: tabulka, forma 5 zápasů, top hráči, zranění, poslední rozhovor trenéra, H2H.
 */

import { calculateStandings, type StandingEntry } from "../stats/standings";
import { logger } from "../lib/logger";
import { VILLAGE_FLAVOR } from "./ai-reporter";

interface MatchPreview {
  matchId: string;
  homeTeamId: string;
  awayTeamId: string;
  homeName: string;
  awayName: string;
  homeVillage: string | null;
  awayVillage: string | null;
  isLocalDerby: boolean;
  stadiumName: string | null;
  homePos: number | null;
  awayPos: number | null;
  homePoints: number | null;
  awayPoints: number | null;
  homeForm: string;
  awayForm: string;
  homeTopPlayers: string[];
  awayTopPlayers: string[];
  homeInjured: string[];
  awayInjured: string[];
  homeManager: string | null;
  awayManager: string | null;
  homeInterviewQuote: string | null;
  awayInterviewQuote: string | null;
  h2hSummary: string | null;
}

/** Forma posledních 5 zápasů jako řetězec WDLWD. */
async function loadForm(db: D1Database, teamId: string): Promise<string> {
  const rows = await db.prepare(
    `SELECT home_team_id, away_team_id, home_score, away_score
     FROM matches
     WHERE (home_team_id = ? OR away_team_id = ?) AND status = 'simulated'
     ORDER BY simulated_at DESC LIMIT 5`
  ).bind(teamId, teamId).all()
    .catch((e) => { logger.warn({ module: "matchday-preview" }, "load form", e); return { results: [] }; });
  const out: string[] = [];
  for (const r of rows.results) {
    const isHome = r.home_team_id === teamId;
    const own = isHome ? (r.home_score as number) : (r.away_score as number);
    const opp = isHome ? (r.away_score as number) : (r.home_score as number);
    if (own > opp) out.push("V");
    else if (own < opp) out.push("P");
    else out.push("R");
  }
  return out.length > 0 ? out.join("") : "bez zápasů";
}

async function loadTopPlayers(db: D1Database, teamId: string, limit = 3): Promise<string[]> {
  const rows = await db.prepare(
    `SELECT p.first_name, p.last_name, p.position, p.overall_rating
     FROM players p
     WHERE p.team_id = ?
       AND (p.status IS NULL OR p.status = 'active')
       AND p.id NOT IN (SELECT player_id FROM injuries WHERE team_id = ? AND days_remaining > 0)
     ORDER BY p.overall_rating DESC LIMIT ?`
  ).bind(teamId, teamId, limit).all()
    .catch((e) => { logger.warn({ module: "matchday-preview" }, "load top players", e); return { results: [] }; });
  return rows.results.map((r) =>
    `${r.first_name} ${r.last_name} (${r.position}, rating ${r.overall_rating})`
  );
}

async function loadInjured(db: D1Database, teamId: string): Promise<string[]> {
  const rows = await db.prepare(
    `SELECT p.first_name, p.last_name, i.days_remaining
     FROM injuries i JOIN players p ON i.player_id = p.id
     WHERE i.team_id = ? AND i.days_remaining > 0
     ORDER BY p.overall_rating DESC LIMIT 3`
  ).bind(teamId).all()
    .catch((e) => { logger.warn({ module: "matchday-preview" }, "load injured", e); return { results: [] }; });
  return rows.results.map((r) =>
    `${r.first_name} ${r.last_name} (${r.days_remaining}d)`
  );
}

async function loadManagerName(db: D1Database, teamId: string): Promise<string | null> {
  const row = await db.prepare("SELECT name FROM managers WHERE team_id = ?").bind(teamId).first<{ name: string }>()
    .catch((e) => { logger.warn({ module: "matchday-preview" }, "load manager", e); return null; });
  return row?.name ?? null;
}

/** Krátký citát z posledního rozhovoru trenéra (první odpověď, useknutá na 120 znaků). */
async function loadLastInterviewQuote(db: D1Database, teamId: string): Promise<string | null> {
  const row = await db.prepare(
    `SELECT answers FROM coach_interviews
     WHERE team_id = ? AND status = 'answered' AND answers IS NOT NULL
     ORDER BY created_at DESC LIMIT 1`
  ).bind(teamId).first<{ answers: string }>()
    .catch((e) => { logger.warn({ module: "matchday-preview" }, "load last interview", e); return null; });
  if (!row?.answers) return null;
  try {
    const arr = JSON.parse(row.answers) as string[];
    const first = arr.find((a) => a && a.trim().length > 10);
    if (!first) return null;
    const clean = first.trim().replace(/\s+/g, " ");
    return clean.length > 120 ? clean.slice(0, 117) + "..." : clean;
  } catch (e) {
    logger.warn({ module: "matchday-preview" }, "parse interview answers", e);
    return null;
  }
}

/** Poslední vzájemný zápas obou týmů (jako text). */
async function loadH2H(db: D1Database, teamA: string, teamB: string): Promise<string | null> {
  const row = await db.prepare(
    `SELECT home_team_id, away_team_id, home_score, away_score, simulated_at
     FROM matches
     WHERE status = 'simulated'
       AND ((home_team_id = ? AND away_team_id = ?) OR (home_team_id = ? AND away_team_id = ?))
     ORDER BY simulated_at DESC LIMIT 1`
  ).bind(teamA, teamB, teamB, teamA).first<{
    home_team_id: string; away_team_id: string; home_score: number; away_score: number;
  }>().catch((e) => { logger.warn({ module: "matchday-preview" }, "load h2h", e); return null; });
  if (!row) return null;
  const aIsHome = row.home_team_id === teamA;
  const aScore = aIsHome ? row.home_score : row.away_score;
  const bScore = aIsHome ? row.away_score : row.home_score;
  return `naposledy ${aScore}:${bScore} (${aIsHome ? "doma" : "venku"})`;
}

/** Hlavní funkce — generuje matchday preview pro jednu ligu + jedno kolo. */
export async function generateMatchdayPreview(
  db: D1Database,
  geminiApiKey: string,
  leagueId: string,
  calendarId: string,
): Promise<void> {
  // Info o lize + game_week (nejdřív, pro idempotency check)
  const calInfoEarly = await db.prepare(
    "SELECT game_week FROM season_calendar WHERE id = ?"
  ).bind(calendarId).first<{ game_week: number }>()
    .catch((e) => { logger.warn({ module: "matchday-preview" }, "load calendar early", e); return null; });
  const gameWeekEarly = calInfoEarly?.game_week ?? 0;

  // Idempotency: pokud už preview pro tuto ligu + kolo existuje, skip
  const existing = await db.prepare(
    "SELECT id FROM news WHERE league_id = ? AND type = 'matchday_preview' AND game_week = ?"
  ).bind(leagueId, gameWeekEarly).first<{ id: string }>()
    .catch((e) => { logger.warn({ module: "matchday-preview" }, "idempotency check", e); return null; });
  if (existing) {
    logger.info({ module: "matchday-preview" }, `skip — preview already exists for league ${leagueId} week ${gameWeekEarly}`);
    return;
  }

  // Zápasy v kole
  const matchRows = await db.prepare(
    `SELECT m.id, m.home_team_id, m.away_team_id, m.stadium_name,
            th.name as home_name, ta.name as away_name,
            th.village_id as home_village_id, ta.village_id as away_village_id,
            vh.name as home_village, va.name as away_village
     FROM matches m
     JOIN teams th ON m.home_team_id = th.id
     JOIN teams ta ON m.away_team_id = ta.id
     LEFT JOIN villages vh ON th.village_id = vh.id
     LEFT JOIN villages va ON ta.village_id = va.id
     WHERE m.calendar_id = ? AND m.status = 'scheduled'`
  ).bind(calendarId).all();
  if (matchRows.results.length === 0) {
    logger.info({ module: "matchday-preview" }, `no scheduled matches for calendar ${calendarId}`);
    return;
  }

  // Tabulka pro kontext
  const standings = await calculateStandings(db, leagueId);
  const posMap: Record<string, StandingEntry> = {};
  for (const s of standings) posMap[s.teamId] = s;

  const gameWeek = gameWeekEarly;

  const leagueInfo = await db.prepare("SELECT name, district FROM leagues WHERE id = ?")
    .bind(leagueId).first<{ name: string; district: string }>()
    .catch((e) => { logger.warn({ module: "matchday-preview" }, "load league", e); return null; });
  const district = leagueInfo?.district ?? "Prachatice";
  const leagueName = leagueInfo?.name ?? "Okresní přebor";
  const isPraha = district === "Praha";

  // Nasbírat data pro všechny zápasy
  const previews: MatchPreview[] = [];
  for (const m of matchRows.results) {
    const homeTeamId = m.home_team_id as string;
    const awayTeamId = m.away_team_id as string;
    const [
      homeForm, awayForm,
      homeTop, awayTop,
      homeInj, awayInj,
      homeMng, awayMng,
      homeQuote, awayQuote,
      h2h,
    ] = await Promise.all([
      loadForm(db, homeTeamId),
      loadForm(db, awayTeamId),
      loadTopPlayers(db, homeTeamId),
      loadTopPlayers(db, awayTeamId),
      loadInjured(db, homeTeamId),
      loadInjured(db, awayTeamId),
      loadManagerName(db, homeTeamId),
      loadManagerName(db, awayTeamId),
      loadLastInterviewQuote(db, homeTeamId),
      loadLastInterviewQuote(db, awayTeamId),
      loadH2H(db, homeTeamId, awayTeamId),
    ]);

    previews.push({
      matchId: m.id as string,
      homeTeamId, awayTeamId,
      homeName: m.home_name as string,
      awayName: m.away_name as string,
      homeVillage: (m.home_village as string) ?? null,
      awayVillage: (m.away_village as string) ?? null,
      isLocalDerby: !!m.home_village_id && m.home_village_id === m.away_village_id,
      stadiumName: (m.stadium_name as string) ?? null,
      homePos: posMap[homeTeamId]?.pos ?? null,
      awayPos: posMap[awayTeamId]?.pos ?? null,
      homePoints: posMap[homeTeamId]?.points ?? null,
      awayPoints: posMap[awayTeamId]?.points ?? null,
      homeForm, awayForm,
      homeTopPlayers: homeTop,
      awayTopPlayers: awayTop,
      homeInjured: homeInj,
      awayInjured: awayInj,
      homeManager: homeMng,
      awayManager: awayMng,
      homeInterviewQuote: homeQuote,
      awayInterviewQuote: awayQuote,
      h2hSummary: h2h,
    });
  }

  // Build prompt
  // Globální whitelist: hráč → tým (zabraňuje cross-attribution, kdy Gemini přiřadí reálného hráče k jinému týmu)
  const allowedPlayers: { name: string; team: string; role: "key" | "injured" }[] = [];
  for (const p of previews) {
    for (const tp of p.homeTopPlayers) allowedPlayers.push({ name: tp.split(" (")[0], team: p.homeName, role: "key" });
    for (const tp of p.awayTopPlayers) allowedPlayers.push({ name: tp.split(" (")[0], team: p.awayName, role: "key" });
    for (const inj of p.homeInjured) allowedPlayers.push({ name: inj.split(" (")[0], team: p.homeName, role: "injured" });
    for (const inj of p.awayInjured) allowedPlayers.push({ name: inj.split(" (")[0], team: p.awayName, role: "injured" });
  }
  const whitelistLines = allowedPlayers.map((ap) =>
    `- ${ap.name} → ${ap.team}${ap.role === "injured" ? " (zraněn)" : ""}`
  );

  const matchLines: string[] = [];
  for (const p of previews) {
    const lines: string[] = [];
    lines.push(`ZÁPAS: ${p.homeName} vs ${p.awayName}`);
    if (p.isLocalDerby) lines.push(`  🏘️ MÍSTNÍ DERBY — oba týmy z ${p.homeVillage ?? "stejné obce"}, napětí, prestiž, hospodský souboj`);
    if (p.stadiumName) lines.push(`  Stadion: ${p.stadiumName}`);
    if (p.homeVillage) {
      const fl = VILLAGE_FLAVOR[p.homeVillage];
      lines.push(`  ${p.homeName} (${p.homeVillage}${fl ? ` — ${fl}` : ""})`);
    }
    if (p.awayVillage) {
      const fl = VILLAGE_FLAVOR[p.awayVillage];
      lines.push(`  ${p.awayName} (${p.awayVillage}${fl ? ` — ${fl}` : ""})`);
    }
    if (p.homePos !== null) lines.push(`  ${p.homeName}: ${p.homePos}. místo (${p.homePoints} bodů), forma ${p.homeForm}`);
    if (p.awayPos !== null) lines.push(`  ${p.awayName}: ${p.awayPos}. místo (${p.awayPoints} bodů), forma ${p.awayForm}`);
    if (p.homeTopPlayers.length > 0) lines.push(`  Klíčoví hráči ${p.homeName}: ${p.homeTopPlayers.join(", ")}`);
    if (p.awayTopPlayers.length > 0) lines.push(`  Klíčoví hráči ${p.awayName}: ${p.awayTopPlayers.join(", ")}`);
    if (p.homeInjured.length > 0) lines.push(`  Zranění ${p.homeName}: ${p.homeInjured.join(", ")}`);
    if (p.awayInjured.length > 0) lines.push(`  Zranění ${p.awayName}: ${p.awayInjured.join(", ")}`);
    if (p.homeManager) lines.push(`  Trenér ${p.homeName}: ${p.homeManager}`);
    if (p.awayManager) lines.push(`  Trenér ${p.awayName}: ${p.awayManager}`);
    if (p.homeInterviewQuote) lines.push(`  Citát trenéra ${p.homeManager ?? "domácích"}: „${p.homeInterviewQuote}"`);
    if (p.awayInterviewQuote) lines.push(`  Citát trenéra ${p.awayManager ?? "hostů"}: „${p.awayInterviewQuote}"`);
    if (p.h2hSummary) lines.push(`  Vzájemné: ${p.homeName} ${p.h2hSummary} proti ${p.awayName}`);
    matchLines.push(lines.join("\n"));
  }

  const standingsLines = standings.slice(0, 16).map((s) => {
    const name = Object.values(posMap).find((e) => e.teamId === s.teamId)?.teamId;
    // Use leagueInfo name map fallback:
    return `${s.pos}. — ${s.points} bodů, ${s.played} zápasů (${s.gf}:${s.ga})`;
  });

  // Map team names for standings lines
  const teamNameRows = await db.prepare("SELECT id, name FROM teams WHERE league_id = ?")
    .bind(leagueId).all().catch((e) => { logger.warn({ module: "matchday-preview" }, "load team names", e); return { results: [] }; });
  const nameMap: Record<string, string> = {};
  for (const t of teamNameRows.results) nameMap[t.id as string] = t.name as string;
  const standingsFull = standings.slice(0, 16).map((s) =>
    `${s.pos}. ${nameMap[s.teamId] ?? s.teamId} — ${s.points} bodů, ${s.played} z. (${s.gf}:${s.ga})`
  );

  const localFlavor = isPraha
    ? "Používej pražský městský kolorit — zmiňuj městské části, tramvaje, hospody."
    : "Používej místní kolorit — obce, charakter, okresní atmosféru.";

  const prompt = `Jsi sportovní redaktor ${isPraha ? "pražského" : "okresního"} zpravodaje${isPraha ? "" : ` v ${district}ích`}. Napiš předzápasové preview ${gameWeek}. kola ${leagueName}.

ZÁPASY KOLA:
${matchLines.join("\n\n")}

AKTUÁLNÍ TABULKA PŘED KOLEM:
${standingsFull.join("\n")}

POVOLENÍ HRÁČI (jediní, které smíš v článku zmínit + jejich tým):
${whitelistLines.join("\n")}

ABSOLUTNÍ PRAVIDLA (porušení = článek k ničemu):
- Seznam POVOLENÍ HRÁČI je VYČERPÁVAJÍCÍ. Každé jméno hráče v článku MUSÍ být na tomto seznamu.
- KAŽDÝ hráč MUSÍ být zmíněn JEN s týmem ke kterému je přiřazen v POVOLENÍ HRÁČI. NIKDY hráče nepřesouvej k jinému týmu.
- Pokud hráč není na seznamu, NESMÍ se v článku objevit — ani jako střelec, ani jako kapitán, ani v narážce.
- NIKDY NEVYMÝŠLEJ ČÍSLA (body, pozice, rating, forma). Beri POUZE z dat výše.
- NIKDY NEVYMÝŠLEJ VÝROKY — citáty trenérů použij jen ty uvedené výše, v uvozovkách, PŘESNĚ jak jsou.
- NEPREDIKUJ konkrétní výsledek čísly (nepiš "Lišov vyhraje 3:1"). Můžeš naznačit favorita.
- Piš o tom co BUDE — zápasy se ještě nehrály. Nepiš minulým časem o nadcházejícím kole.
- Když si nejsi jistý přiřazením, radši hráče nezmiňuj vůbec. Článek bez hráčů je lepší než článek se špatně přiřazenými hráči.

Styl:
- Česky, styl místního ${isPraha ? "pražského" : "okresního"} zpravodaje, 250-400 slov
- První řádek = titulek článku (bez uvozovek, bez "Titulek:")
- Zbytek = tělo článku
- Vypíchni nejzajímavější souboje (boj o čelo, souboj sousedů, návrat zraněných...)
- Barvitý jazyk s humorem, ale realisticky pro úroveň okresního fotbalu
- ${localFlavor}
- Nemusíš popsat každý zápas podrobně — vyber ty nejlákavější`;

  // Volání Gemini
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiApiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { maxOutputTokens: 2048, temperature: 0.4, thinkingConfig: { thinkingBudget: 0 } },
      }),
    },
  ).catch((e) => { logger.warn({ module: "matchday-preview" }, "gemini fetch failed", e); return null; });

  if (!res || !res.ok) {
    const errBody = res ? await res.text().catch(() => "") : "";
    logger.warn({ module: "matchday-preview" }, `Gemini error: ${res?.status ?? "no response"} — ${errBody.slice(0, 200)}`);
    return;
  }

  const json = await res.json() as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string; thought?: boolean }> } }>;
  };
  const parts = json.candidates?.[0]?.content?.parts ?? [];
  const text = parts.filter((p) => !p.thought).map((p) => p.text ?? "").join("");
  if (!text) {
    logger.warn({ module: "matchday-preview" }, "Gemini returned empty");
    return;
  }

  const lines = text.trim().split("\n").filter((l) => l.trim().length > 0);
  const headline = lines[0].replace(/^#+\s*/, "").replace(/^\*+/, "").replace(/\*+$/, "").trim();
  const article = lines.slice(1).map((l) => l.replace(/^\*+/, "").replace(/\*+$/, "").trim()).filter(Boolean).join("\n");

  if (!headline || !article) {
    logger.warn({ module: "matchday-preview" }, "Could not parse Gemini response");
    return;
  }

  await db.prepare(
    "INSERT INTO news (id, league_id, type, headline, body, game_week, created_at) VALUES (?, ?, 'matchday_preview', ?, ?, ?, strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))"
  ).bind(crypto.randomUUID(), leagueId, headline, article, gameWeek).run()
    .catch((e) => { logger.warn({ module: "matchday-preview" }, "insert news", e); });

  logger.info({ module: "matchday-preview" }, `preview generated for league ${leagueId} week ${gameWeek}: "${headline}"`);

  // Notifikace pro lidské týmy v této lize
  try {
    const humanTeams = await db.prepare(
      "SELECT t.id FROM teams t WHERE t.league_id = ? AND t.user_id != 'ai'"
    ).bind(leagueId).all();

    const smsBody = `📰 Vyšlo předzápasové preview ${gameWeek}. kola: „${headline}"`;
    for (const t of humanTeams.results) {
      const tid = t.id as string;
      const conv = await db.prepare(
        "SELECT id FROM conversations WHERE team_id = ? AND type = 'system' AND title = 'Redakce Zpravodaje'"
      ).bind(tid).first<{ id: string }>()
        .catch((e) => { logger.warn({ module: "matchday-preview" }, "fetch conv", e); return null; });

      let convId = conv?.id;
      if (!convId) {
        convId = crypto.randomUUID();
        await db.prepare(
          "INSERT INTO conversations (id, team_id, type, title, unread_count, last_message_text, last_message_at) VALUES (?, ?, 'system', 'Redakce Zpravodaje', 1, ?, strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))"
        ).bind(convId, tid, smsBody.slice(0, 100)).run()
          .catch((e) => logger.warn({ module: "matchday-preview" }, "create conv", e));
      }

      if (convId) {
        await db.prepare(
          "INSERT INTO messages (id, conversation_id, sender_type, sender_name, body, sent_at) VALUES (?, ?, 'system', 'Redakce Zpravodaje', ?, strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))"
        ).bind(crypto.randomUUID(), convId, smsBody).run()
          .catch((e) => logger.warn({ module: "matchday-preview" }, "send msg", e));
        await db.prepare(
          "UPDATE conversations SET unread_count = unread_count + 1, last_message_text = ?, last_message_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now') WHERE id = ?"
        ).bind(smsBody.slice(0, 100), convId).run()
          .catch((e) => logger.warn({ module: "matchday-preview" }, "update conv", e));
      }
    }
  } catch (e) {
    logger.warn({ module: "matchday-preview" }, "notifications failed", e);
  }
}
