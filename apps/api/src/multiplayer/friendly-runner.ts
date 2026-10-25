/**
 * Friendly match runner — simuluje přátelské zápasy (bez calendar/league).
 */

import { simulateMatch } from "../engine/simulation";
import { generateMatchCommentary, loadCommentaryFromDB } from "../engine/commentary";
import { createRng, cryptoSeed } from "../generators/rng";
import { experienceGainChance } from "../skills/training";
import type { TeamSetup, Weather, Hardness } from "../engine/types";
import { buildMatchPlayers } from "./match-runner";
import { loadTicketAttendanceFactor, recordTransaction } from "../season/finance-processor";
import { pragueHour } from "../lib/match-tick-schedule";
import {
  expireStaleFriendlies, findBusy, gameDay, neutralVenueName, openDueFriendlies, quoteFriendly, refundStake, settleStake,
  type ChallengeVenue, type CostPayer,
} from "./friendlies";

/** Obecní hřiště napůl cesty: žádný skvost, ale posekané. */
const NEUTRAL_PITCH_CONDITION = 60;
import { logger } from "../lib/logger";

interface DueFriendly {
  id: string; home_team_id: string; away_team_id: string; day: string;
  challenge_id: string | null; challenger_team_id: string | null; challenged_team_id: string | null;
  venue: ChallengeVenue | null; neutral_village_id: string | null; cost_payer: CostPayer | null;
  stake: number | null; stake_status: string | null; match_date: string | null;
}

/**
 * Přátelák se nehraje, když má některý z týmů ten den soutěžní zápas (pohár se mohl
 * vylosovat až po domluvě). Zápas zmizí z rozpisu, sázka se vrátí, oba dostanou SMS.
 */
async function cancelForClash(db: D1Database, m: DueFriendly, reason: string, names: Record<string, string>, gameDate: string): Promise<void> {
  if (m.challenge_id) {
    await db.prepare(
      `UPDATE challenges SET status = 'expired', cancel_reason = ?, match_id = NULL, resolved_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
        WHERE id = ?`,
    ).bind(reason, m.challenge_id).run();
    await refundStake(db,
      { id: m.challenge_id, challenger_team_id: m.challenger_team_id!, challenged_team_id: m.challenged_team_id!, stake: m.stake ?? 0, stake_status: m.stake_status },
      { challenger: names[m.challenger_team_id!] ?? "soupeřem", opponent: names[m.challenged_team_id!] ?? "soupeřem" }, gameDate);
  }
  await db.batch([
    db.prepare("DELETE FROM lineups WHERE calendar_id = ?").bind(m.id),
    db.prepare("DELETE FROM matches WHERE id = ? AND status = 'lineups_open'").bind(m.id),
  ]);
  const { sendSystemSMS } = await import("../messaging/system-sms");
  // AI klubu se nepíše.
  const owners = await db.prepare("SELECT id, user_id FROM teams WHERE id IN (?, ?)").bind(m.home_team_id, m.away_team_id)
    .all<{ id: string; user_id: string | null }>()
    .catch((e) => { logger.warn({ module: "friendly-runner" }, "majitelé klubů zrušeného přáteláku", e); return { results: [] as Array<{ id: string; user_id: string | null }> }; });
  const aiTeams = new Set(owners.results.filter((r) => r.user_id === "ai").map((r) => r.id));
  for (const [tid, oid] of [[m.home_team_id, m.away_team_id], [m.away_team_id, m.home_team_id]]) {
    if (aiTeams.has(tid)) continue;
    await sendSystemSMS(db, tid, "Sportovní ředitel",
      `↩️ Přátelák s ${names[oid] ?? "soupeřem"} se dnes nehraje: ${reason}${m.stake ? " Sázka se vrátila." : ""}`);
  }
}

export async function simulateFriendlyMatches(db: D1Database): Promise<number> {
  const clock = await db.prepare("SELECT game_date FROM teams WHERE game_date IS NOT NULL LIMIT 1")
    .first<{ game_date: string }>();
  const today = gameDay(clock?.game_date ?? new Date().toISOString());
  const gameDateIso = clock?.game_date ?? new Date().toISOString();
  // Ranní otevření mohlo neproběhnout (tick spadl), tak to zkusíme ještě teď.
  await expireStaleFriendlies(db, today, pragueHour()).catch((e) => logger.error({ module: "friendly-runner" }, "vypršení přáteláků", e));
  await openDueFriendlies(db, today).catch((e) => logger.error({ module: "friendly-runner" }, "otevření dnešních přáteláků", e));

  // Jen přáteláky na dnešek a starší nedohrané. Domluvené na pozdější den čekají.
  const matches = await db.prepare(
    `SELECT m.id, m.home_team_id, m.away_team_id, substr(m.created_at, 1, 10) AS day,
            c.id AS challenge_id, c.challenger_team_id, c.challenged_team_id, c.venue, c.neutral_village_id,
            c.cost_payer, c.stake, c.stake_status, c.match_date
       FROM matches m
       LEFT JOIN challenges c ON c.match_id = m.id
      WHERE m.calendar_id IS NULL AND m.league_id IS NULL AND m.status = 'lineups_open'
        AND substr(m.created_at, 1, 10) <= ?`,
  ).bind(today).all<DueFriendly>();

  if (matches.results.length === 0) return 0;

  let count = 0;

  // Weather for friendlies
  const weathers: Weather[] = ["sunny", "cloudy", "rain", "wind", "snow"];
  const roll = Math.random() * 100;
  let weather: Weather = "cloudy";
  const weights = [30, 30, 20, 15, 5];
  let cum = 0;
  for (let i = 0; i < weathers.length; i++) {
    cum += weights[i];
    if (roll < cum) { weather = weathers[i]; break; }
  }

  for (const match of matches.results) {
    const matchId = match.id;
    const homeTeamId = match.home_team_id;
    const awayTeamId = match.away_team_id;
    const isNeutral = match.venue === "neutral";

    try {
      const nameRows = await db.prepare("SELECT id, name FROM teams WHERE id IN (?, ?)").bind(homeTeamId, awayTeamId)
        .all<{ id: string; name: string }>();
      const names = Object.fromEntries(nameRows.results.map((r) => [r.id, r.name]));

      // Soutěžní zápas ten den má přednost.
      const clashHome = await findBusy(db, homeTeamId, match.day, { competitiveOnly: true });
      const clashAway = clashHome ? null : await findBusy(db, awayTeamId, match.day, { competitiveOnly: true });
      const clash = clashHome ?? clashAway;
      if (clash) {
        const who = names[clashHome ? homeTeamId : awayTeamId] ?? "Soupeř";
        const kind = clash.kind === "league" ? "ligu" : clash.kind === "cup" ? "pohár" : "turnaj";
        await cancelForClash(db, match, `${who} ten den hraje ${kind}.`, names, gameDateIso);
        logger.info({ module: "friendly-runner" }, `přátelák ${matchId} zrušen kvůli kolizi (${clash.kind})`);
        continue;
      }

      // Absence RNG obstará buildMatchPlayers interně (matchKey = matchId; phase day_before+match_day).
      const rng = createRng(Date.now() + matchId.charCodeAt(0));

      // Ensure lineups exist — copy last saved or auto-generate
      const { copyOrCreateLineup } = await import("./match-runner");
      const hasHomeLineup = await db.prepare("SELECT id FROM lineups WHERE team_id = ? AND calendar_id = ?")
        .bind(homeTeamId, matchId).first().catch((e) => { logger.warn({ module: "friendly-runner" }, "check home lineup", e); return null; });
      if (!hasHomeLineup) await copyOrCreateLineup(db, homeTeamId, matchId);

      const hasAwayLineup = await db.prepare("SELECT id FROM lineups WHERE team_id = ? AND calendar_id = ?")
        .bind(awayTeamId, matchId).first().catch((e) => { logger.warn({ module: "friendly-runner" }, "check away lineup", e); return null; });
      if (!hasAwayLineup) await copyOrCreateLineup(db, awayTeamId, matchId);

      // Load lineups VČETNĚ formation, tactic, captain — bez nich by se ignorovalo co user nastavil.
      // `match_plan` patří do stejného SELECTu: `TeamSetup.plan` je nepovinné pole, takže když
      // se nenačte, engine pokyny z lavičky tiše přeskočí a manažerovi se nic nestane bez chyby.
      const homeLineupRow = await db.prepare("SELECT formation, tactic, hardness, players_data, captain_id, match_plan, bench_data FROM lineups WHERE team_id = ? AND calendar_id = ?")
        .bind(homeTeamId, matchId).first<{ formation: string; tactic: string; hardness: string | null; players_data: string; captain_id: string | null; match_plan: string | null; bench_data: string | null }>()
        .catch((e) => { logger.warn({ module: "friendly-runner" }, "load home lineup", e); return null; });
      const awayLineupRow = await db.prepare("SELECT formation, tactic, hardness, players_data, captain_id, match_plan, bench_data FROM lineups WHERE team_id = ? AND calendar_id = ?")
        .bind(awayTeamId, matchId).first<{ formation: string; tactic: string; hardness: string | null; players_data: string; captain_id: string | null; match_plan: string | null; bench_data: string | null }>()
        .catch((e) => { logger.warn({ module: "friendly-runner" }, "load away lineup", e); return null; });

      // Přátelák = dobrovolný zápas → hráči mají výrazně vyšší šanci odmítnout (multiplikátor 1.8×)
      const homeBuild = await buildMatchPlayers(db, homeTeamId, homeLineupRow?.players_data ?? null, 0, { friendlyMultiplier: 1.8, matchKey: matchId, benchJson: homeLineupRow?.bench_data });
      const awayBuild = await buildMatchPlayers(db, awayTeamId, awayLineupRow?.players_data ?? null, 100, { friendlyMultiplier: 1.8, matchKey: matchId, benchJson: awayLineupRow?.bench_data });

      const homeLineup = homeBuild.players;
      const awayLineup = awayBuild.players;
      const homeSubs = homeLineup.splice(11);
      const awaySubs = awayLineup.splice(11);

      // Vztahy v kabině platí i v příprávě (dřív je uměl jen ligový match-runner)
      const { injectRelationships } = await import("./inject-relations");
      await injectRelationships(db, [
        { players: [...homeLineup, ...homeSubs], idMap: homeBuild.idMap },
        { players: [...awayLineup, ...awaySubs], idMap: awayBuild.idMap },
      ]);

      // Save pre-simulation copies (simulation mutates arrays via substitutions)
      const homeLineupPreSim = homeLineup.map(p => ({ ...p }));
      const awayLineupPreSim = awayLineup.map(p => ({ ...p }));
      const homeSubsPreSim = homeSubs.map(p => ({ ...p }));
      const awaySubsPreSim = awaySubs.map(p => ({ ...p }));

      const homeTeam = await db.prepare("SELECT name FROM teams WHERE id = ?").bind(homeTeamId).first<{ name: string }>();
      const awayTeam = await db.prepare("SELECT name FROM teams WHERE id = ?").bind(awayTeamId).first<{ name: string }>();

      // Použij user-uloženou taktiku/formaci/kapitána (přátelák je trénink → musí respektovat výběr)
      const homeTactic = (homeLineupRow?.tactic as any) ?? "balanced";
      const awayTactic = (awayLineupRow?.tactic as any) ?? "balanced";
      const homeFormation = homeLineupRow?.formation ?? "4-4-2";
      const awayFormation = awayLineupRow?.formation ?? "4-4-2";
      const homeCaptainEngineId = homeLineupRow?.captain_id ? [...homeBuild.idMap.entries()].find(([, dbId]) => dbId === homeLineupRow.captain_id)?.[0] : undefined;
      const awayCaptainEngineId = awayLineupRow?.captain_id ? [...awayBuild.idMap.entries()].find(([, dbId]) => dbId === awayLineupRow.captain_id)?.[0] : undefined;

      // Načti sehranost formace pro effectiveness modifikátor
      const { readFamiliarity } = await import("../engine/chemistry");
      const homeFam = await readFamiliarity(db, homeTeamId);
      const awayFam = await readFamiliarity(db, awayTeamId);

      // Exekutoři standardek platí i v přáteláku
      const { loadSetPieceTakers } = await import("../engine/set-piece-takers");
      const [homeTakers, awayTakers] = await Promise.all([
        loadSetPieceTakers(db, homeTeamId, homeBuild.idMap),
        loadSetPieceTakers(db, awayTeamId, awayBuild.idMap),
      ]);

      // Pokyny z lavičky se převádějí na engine ID až tady, protože idMap vzniká
      // až po sestavení soupisek. Pravidlo s hráčem, který dnes nenastoupil, se
      // zahodí uvnitř toEnginePlan — v příprávě se to stává častěji než v lize,
      // absence mají násobič 1.8.
      const { toEnginePlan } = await import("../engine/plan-mapping");
      const homePlan = toEnginePlan(homeBuild.idMap, homeLineupRow?.match_plan);
      const awayPlan = toEnginePlan(awayBuild.idMap, awayLineupRow?.match_plan);

      // Kolik pravidel manažer zadal a kolik jich přežilo převod. Rozdíl znamená, že
      // hráč z pravidla dnes nenastoupil — v příprávě běžné (absence mají násobič 1.8)
      // a jinak nepoznatelné: zápas doběhne bez chyby, jen se pokyn neprovede.
      const zadano = (side: string | null | undefined) => {
        if (!side) return 0;
        try { return (JSON.parse(side) as unknown[]).length; }
        catch (e) { logger.warn({ module: "friendly-runner" }, "čtení plánu", e); return 0; }
      };
      const homeZadano = zadano(homeLineupRow?.match_plan);
      const awayZadano = zadano(awayLineupRow?.match_plan);
      if (homeZadano > 0 || awayZadano > 0) {
        logger.info({ module: "friendly-runner" },
          `přátelák ${matchId}: pokyny z lavičky, domácí ${homePlan?.length ?? 0}/${homeZadano}, hosté ${awayPlan?.length ?? 0}/${awayZadano}`);
      }

      const homeSetup: TeamSetup = {
        teamId: 1,
        teamName: homeTeam?.name ?? "Domácí",
        lineup: homeLineup,
        subs: homeSubs,
        tactic: homeTactic,
        formation: homeFormation,
        captainId: homeCaptainEngineId,
        hardness: (homeLineupRow?.hardness as Hardness | null) ?? "normal",
        ...homeTakers,
        formationFamiliarity: homeFam.formation[homeFormation] ?? 0,
        plan: homePlan,
      };
      const awaySetup: TeamSetup = {
        teamId: 2,
        teamName: awayTeam?.name ?? "Hosté",
        lineup: awayLineup,
        subs: awaySubs,
        tactic: awayTactic,
        formation: awayFormation,
        captainId: awayCaptainEngineId,
        hardness: (awayLineupRow?.hardness as Hardness | null) ?? "normal",
        ...awayTakers,
        formationFamiliarity: awayFam.formation[awayFormation] ?? 0,
        plan: awayPlan,
      };

      // Stadium info. Na neutrálním hřišti se hraje na obecním hřišti obce napůl cesty,
      // trávník domácích se neopotřebuje a vstupné nikdo nevybírá.
      const stadiumRow = isNeutral ? null : await db.prepare("SELECT pitch_condition, pitch_moisture FROM stadiums WHERE team_id = ?")
        .bind(homeTeamId).first<{ pitch_condition: number; pitch_moisture: number | null }>().catch((e) => { logger.warn({ module: "friendly-runner" }, "load stadium", e); return null; });
      const neutralVillage = isNeutral && match.neutral_village_id
        ? await db.prepare("SELECT name FROM villages WHERE id = ?").bind(match.neutral_village_id).first<{ name: string }>()
          .catch((e) => { logger.warn({ module: "friendly-runner" }, "neutrální obec", e); return null; })
        : null;
      const stadiumNameRow = isNeutral
        ? { stadium_name: neutralVenueName(neutralVillage?.name ?? "na půli cesty") }
        : await db.prepare("SELECT stadium_name FROM teams WHERE id = ?")
          .bind(homeTeamId).first<{ stadium_name: string }>().catch((e) => { logger.warn({ module: "friendly-runner" }, "load stadium name", e); return null; });
      const pitchCondition = isNeutral ? NEUTRAL_PITCH_CONDITION : stadiumRow?.pitch_condition ?? 50;

      // Vybavení a zaměstnanci platí i v přáteláku — dřív se sem nepředávaly vůbec.
      const { loadMatchMods } = await import("../equipment/match-mods");
      const [homeEquipment, awayEquipment] = await Promise.all([
        loadMatchMods(db, homeTeamId, true), loadMatchMods(db, awayTeamId, false),
      ]);

      // Simulate — vypočítej attendance JEDNOU a použij ji všude (jinak by simulace + DB měly různá čísla).
      // I na přátelák se vybírá vstupné domácích, takže přemrštěná cena odradí i tady.
      const ticketAttendanceMul = isNeutral ? 1 : await loadTicketAttendanceFactor(db, homeTeamId);
      const friendlyAttendance = isNeutral
        ? Math.round(10 + Math.random() * 20)
        : Math.round((20 + Math.random() * 50) * ticketAttendanceMul);
      const result = simulateMatch(rng, {
        home: homeSetup,
        away: awaySetup,
        weather,
        // Výhoda domácích platí, když se hraje u jednoho z klubů. Přáteláky z doby
        // před místem zápasu (bez výzvy s místem) se hrály bez ní a tak doběhnou.
        isHomeAdvantage: !!match.venue && !isNeutral,
        pitchCondition,
        pitchMoisture: stadiumRow?.pitch_moisture ?? 50,
        stadiumName: stadiumNameRow?.stadium_name ?? undefined,
        attendance: friendlyAttendance,
        homeEquipment,
        awayEquipment,
      });

      // Commentary (okresově dle domácího = dějiště)
      await loadCommentaryFromDB(db);
      const commDistrict = (await db.prepare("SELECT v.district FROM teams t LEFT JOIN villages v ON t.village_id = v.id WHERE t.id = ?").bind(homeTeamId).first<{ district: string | null }>()
        .catch((e) => { logger.warn({ module: "friendly-runner" }, "load district for commentary", e); return null; }))?.district ?? undefined;
      const commentary = generateMatchCommentary(rng, result.events, homeSetup.teamName, awaySetup.teamName, commDistrict);

      // Build lineup data (max 1 GK in starters) — VČETNĚ formation/tactic/captain
      const buildLineupData = (lineup: typeof homeLineup, subs: typeof homeSubs, idMap: Map<number, string>, formation: string, tactic: string, captainEngineId?: number) => {
        let gkCount = 0;
        const mapStarter = (p: typeof homeLineup[0]) => {
          let pos = p.matchPosition ?? p.position;
          if (pos === "GK") { gkCount++; if (gkCount > 1) pos = "DEF"; }
          return { id: idMap.get(p.id) ?? "", name: `${p.firstName} ${p.lastName}`, position: pos, naturalPosition: p.position,
            rating: Math.round((p.speed + p.technique + p.shooting + p.passing + p.defense) / 5) };
        };
        const mapSub = (p: typeof homeLineup[0]) => ({
          id: idMap.get(p.id) ?? "", name: `${p.firstName} ${p.lastName}`,
          position: p.matchPosition ?? p.position, naturalPosition: p.position,
          rating: Math.round((p.speed + p.technique + p.shooting + p.passing + p.defense) / 5),
        });
        const captainDbId = captainEngineId != null ? (idMap.get(captainEngineId) ?? null) : null;
        return { starters: lineup.map(mapStarter), subs: subs.map(mapSub), formation, tactic, captainId: captainDbId };
      };
      const homeLineupData = buildLineupData(homeLineupPreSim, homeSubsPreSim, homeBuild.idMap, homeFormation, homeTactic, homeCaptainEngineId);
      const awayLineupData = buildLineupData(awayLineupPreSim, awaySubsPreSim, awayBuild.idMap, awayFormation, awayTactic, awayCaptainEngineId);

      // Absence data s team tagem (stejný formát jako league match-runner)
      const matchAbsences = [
        ...(homeBuild.absentNames ?? []).map((a) => ({ ...a, teamId: homeTeamId })),
        ...(awayBuild.absentNames ?? []).map((a) => ({ ...a, teamId: awayTeamId })),
      ];

      // Save
      await db.prepare(
        `UPDATE matches SET status = 'simulated', home_score = ?, away_score = ?,
         events = ?, commentary = ?, attendance = ?, stadium_name = ?, pitch_condition = ?, weather = ?,
         home_lineup_data = ?, away_lineup_data = ?, absences = ?, possession_home = ?,
         simulated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now') WHERE id = ?`
      ).bind(
        result.homeScore, result.awayScore,
        JSON.stringify(result.events), JSON.stringify(commentary),
        friendlyAttendance,
        stadiumNameRow?.stadium_name ?? null, pitchCondition, weather,
        JSON.stringify(homeLineupData), JSON.stringify(awayLineupData),
        matchAbsences.length > 0 ? JSON.stringify(matchAbsences) : null,
        result.possessionHome,
        matchId,
      ).run();

      // Přátelák trávník opotřebuje stejně jako mistrák — hraje se na něm taky.
      {
        if (!isNeutral) {
          const { applyPitchWear } = await import("../stadium/pitch-wear");
          await applyPitchWear(db, homeTeamId, weather);
        }
      }

      // Update challenge status
      await db.prepare("UPDATE challenges SET status = 'played', resolved_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now') WHERE match_id = ?").bind(matchId).run().catch((e) => logger.warn({ module: "friendly-runner" }, "update challenge status", e));

      // Náklady podle domluvy (rozhodčí, cestovné, pronájem) a sázka. Přáteláky z doby před
      // podmínkami (bez dne) zaplatily paušál 1 000 Kč už při přijetí, proto se tu nestrhává nic.
      let stakeLine = "";
      if (match.challenge_id && match.match_date) {
        const challengerName = names[match.challenger_team_id!] ?? "soupeřem";
        const opponentName = names[match.challenged_team_id!] ?? "soupeřem";
        try {
          const quote = await quoteFriendly(db, match.challenger_team_id!, match.challenged_team_id!,
            { venue: match.venue ?? "challenger", costPayer: match.cost_payer ?? "each" }, match.neutral_village_id);
          if (quote) {
            for (const [tid, lines, opp] of [
              [match.challenger_team_id!, quote.costs.challenger, opponentName],
              [match.challenged_team_id!, quote.costs.opponent, challengerName],
            ] as const) {
              for (const line of lines) {
                await recordTransaction(db, tid, "match_expense", -line.amount, `Přátelák s ${opp}: ${line.label.toLowerCase()}`, gameDateIso, matchId);
              }
            }
          }
        } catch (e) {
          logger.error({ module: "friendly-runner" }, `náklady přáteláku ${matchId}`, e);
        }

        const challengerIsHome = match.challenger_team_id === homeTeamId;
        const challengerGoals = challengerIsHome ? result.homeScore : result.awayScore;
        const opponentGoals = challengerIsHome ? result.awayScore : result.homeScore;
        const winner = challengerGoals > opponentGoals ? "challenger" : challengerGoals < opponentGoals ? "opponent" : null;
        try {
          await settleStake(db,
            { id: match.challenge_id, challenger_team_id: match.challenger_team_id!, challenged_team_id: match.challenged_team_id!, stake: match.stake ?? 0, stake_status: match.stake_status },
            winner, { challenger: challengerName, opponent: opponentName }, gameDateIso);
          if (match.stake) {
            const pot = (match.stake * 2).toLocaleString("cs");
            stakeLine = winner === "challenger" ? ` Sázku ${pot} Kč bere ${challengerName}.`
              : winner === "opponent" ? ` Sázku ${pot} Kč bere ${opponentName}.`
              : " Remíza, sázka se vrátila oběma.";
          }
        } catch (e) {
          logger.error({ module: "friendly-runner" }, `vyúčtování sázky přáteláku ${matchId}`, e);
        }
      }

      // Aktualizuj sehranost — přátelák je trénink, MUSÍ se počítat do sehranosti
      try {
        const { applyMatchResult } = await import("../engine/chemistry");
        await applyMatchResult(db, homeTeamId, homeTactic, homeFormation);
        await applyMatchResult(db, awayTeamId, awayTactic, awayFormation);
      } catch (e) {
        logger.warn({ module: "friendly-runner" }, "apply chemistry post-friendly", e);
      }

      // Concession + finance processing (oba týmy, lidské i AI: stejné vstupné, občerstvení a náklady)
      try {
        const { processMatchDayFinances } = await import("../season/finance-processor");
        const gameDate = new Date().toISOString().split("T")[0];
        // Reuse stejné attendance jako v simulaci a v matches DB row
        const attendance = friendlyAttendance;
        const homeResult = result.homeScore > result.awayScore ? "win" : result.homeScore < result.awayScore ? "loss" : "draw";
        const awayResult = homeResult === "win" ? "loss" : homeResult === "loss" ? "win" : "draw";

        await processMatchDayFinances(db, homeTeamId, matchId, !isNeutral, homeResult, attendance, gameDate, 50, true);
        await processMatchDayFinances(db, awayTeamId, matchId, false, awayResult, attendance, gameDate, 50, true);
      } catch (e) {
        logger.error({ module: "friendly-runner" }, "Finance processing failed", e);
      }

      // Kondice a morálka pro každého, kdo nastoupil, i vystřídané a vyloučené (dřív jen
      // konečná jedenáctka, takže střídat v přáteláku bylo zadarmo).
      try {
        const { postMatchPlayers, postMatchPlayerStatements } = await import("./post-match-players");
        const played = postMatchPlayers(result,
          { teamId: homeTeamId, idMap: homeBuild.idMap },
          { teamId: awayTeamId, idMap: awayBuild.idMap });
        const stmts = postMatchPlayerStatements(db, played,
          { source: "friendly", description: `Přátelák (${result.homeScore}:${result.awayScore})` });
        if (stmts.length > 0) await db.batch(stmts);
      } catch (e) {
        logger.error({ module: "friendly-runner" }, "Condition persist failed", e);
      }

      // Zranění z přáteláku platí jako z ligy. Engine je vygeneroval, ale nikam se
      // nezapsala, takže hráč zraněný v přáteláku nastoupil hned v dalším zápase.
      try {
        const { cupInjuryStatements } = await import("../cup/cup");
        const injuryStmts = cupInjuryStatements(db, result.events,
          { teamId: homeTeamId, idMap: homeBuild.idMap, players: [...homeLineup, ...homeSubs] },
          { teamId: awayTeamId, idMap: awayBuild.idMap, players: [...awayLineup, ...awaySubs] },
          createRng(cryptoSeed()), matchId);
        if (injuryStmts.length > 0) await db.batch(injuryStmts);
      } catch (e) {
        logger.error({ module: "friendly-runner" }, "zápis zranění z přáteláku", e);
      }

      // Match experience: small chance to improve skills (same as league, but halved chance)
      try {
        const fullIdMap = new Map<number, string>();
        for (const [engineId, dbId] of homeBuild.idMap) fullIdMap.set(engineId, dbId);
        for (const [engineId, dbId] of awayBuild.idMap) fullIdMap.set(engineId, dbId);

        const matchRng = createRng(Date.now() + matchId.charCodeAt(2));
        const { tryMatchGrowth, parseSkillCaps, loadYouthMod, sjednoceneDovednosti, zapisDovednost } = await import("../season/match-growth");
        // Klubové zázemí (trenér mládeže, kamera) jednou za tým, ne za hráče
        const youthModPerTeam = new Map<string, number>();
        for (const tid of [homeTeamId, awayTeamId]) {
          if (tid) youthModPerTeam.set(tid, await loadYouthMod(db, tid));
        }
        for (const [engineId, pm] of Object.entries(result.playerMinutes)) {
          const dbId = fullIdMap.get(Number(engineId));
          if (!dbId) continue;
          const minutes = ((pm as any).left ?? 90) - (pm as any).entered;
          if (minutes < 15) continue;

          const playerRow = await db.prepare("SELECT age, skills, physical, position, team_id, hidden_talent, skills_max FROM players WHERE id = ?")
            .bind(dbId).first<{ age: number; skills: string; physical: string | null; position: string; team_id: string; hidden_talent: number | null; skills_max: string | null }>().catch((e) => { logger.warn({ module: "friendly-runner" }, "load player for experience", e); return null; });
          if (!playerRow) continue;

          const age = playerRow.age;

          // Zkušenost — v přáteláku roste, ale výrazně pomaleji než v ostrém zápase.
          {
            const expSkills = JSON.parse(playerRow.skills);
            const current = expSkills.experience ?? 0;
            if (current < 100 && matchRng.random() < experienceGainChance(minutes, "friendly", age)) {
              expSkills.experience = current + 1;
              await db.prepare("UPDATE players SET skills = ? WHERE id = ?")
                .bind(JSON.stringify(expSkills), dbId).run()
                .catch((e) => logger.warn({ module: "friendly-runner" }, "gain experience", e));
              playerRow.skills = JSON.stringify(expSkills); // ať navazující zápis nepřepíše přírůstek
            }
          }

          // Stejná pravidla jako liga (season/match-growth.ts), jen s poloviční váhou —
          // v přáteláku se hráč naučí míň než v ostrém zápase.
          // Výdrž a síla se berou z `physical`, kde drží pravdu (viz `sjednoceneDovednosti`).
          const { skills, physical } = sjednoceneDovednosti(playerRow.skills, playerRow.physical);
          const rust = tryMatchGrowth(matchRng, skills, {
            age,
            position: playerRow.position,
            minutes,
            hiddenTalent: playerRow.hidden_talent ?? 0,
            skillCaps: parseSkillCaps(playerRow.skills_max),
            youthMod: youthModPerTeam.get(playerRow.team_id) ?? 0,
            nasobitel: 0.5,
          });

          if (rust) {
            zapisDovednost(skills, physical, rust.attribute, rust.newValue);
            await db.prepare("UPDATE players SET skills = ?, physical = ? WHERE id = ?")
              .bind(JSON.stringify(skills), JSON.stringify(physical), dbId).run();
            await db.prepare(
              "INSERT INTO training_log (player_id, team_id, attribute, old_value, new_value, change, training_type, game_date) VALUES (?, ?, ?, ?, ?, 1, 'friendly', ?)"
            ).bind(dbId, playerRow.team_id, rust.attribute, rust.oldValue, rust.newValue, new Date().toISOString()).run().catch((e) => logger.warn({ module: "friendly-runner" }, "training log insert", e));
          }
        }
      } catch (e) {
        logger.error({ module: "friendly-runner" }, "Match experience failed", e);
      }

      // SMS both teams
      const smsBody = `⚽ Přátelák odehrán! ${homeSetup.teamName} ${result.homeScore}:${result.awayScore} ${awaySetup.teamName}.${stakeLine}`;
      for (const tid of [homeTeamId, awayTeamId]) {
        let convId = await db.prepare("SELECT id FROM conversations WHERE team_id = ? AND type = 'system' AND title = 'Sportovní ředitel'")
          .bind(tid).first<{ id: string }>().then((r) => r?.id).catch((e) => { logger.warn({ module: "friendly-runner" }, "find sportovni reditel conv", e); return null; });
        if (convId) {
          await db.prepare("INSERT INTO messages (id, conversation_id, sender_type, sender_name, body, sent_at) VALUES (?, ?, 'system', 'Sportovní ředitel', ?, strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))")
            .bind(crypto.randomUUID(), convId, smsBody).run().catch((e) => logger.warn({ module: "friendly-runner" }, "insert sms message", e));
          await db.prepare("UPDATE conversations SET unread_count = unread_count + 1, last_message_text = ?, last_message_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now') WHERE id = ?")
            .bind(smsBody.slice(0, 100), convId).run().catch((e) => logger.warn({ module: "friendly-runner" }, "update conv unread", e));
        }
      }

      count++;
      logger.info({ module: "friendly-runner" }, `Friendly simulated: ${homeSetup.teamName} ${result.homeScore}:${result.awayScore} ${awaySetup.teamName}`);
    } catch (e) {
      logger.error({ module: "friendly-runner" }, `Failed to simulate friendly ${matchId}`, e);
    }
  }

  return count;
}
