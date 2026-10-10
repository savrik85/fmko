/**
 * Generování kurzového lístku.
 *
 * Lístek se vypisuje na NEJBLIŽŠÍ nesehrané kolo soutěže a přepočítává jednou
 * za herní den, dokud je kolo 'scheduled'. Podaný tiket to nemůže ovlivnit —
 * kurz si nese ve vlastní kopii (bet_selections.odds_x100).
 *
 * Proč se kurzy materializují do tabulky, a ne počítají při každém zobrazení:
 *  - zmrazit kurz znamená zmrazit VSTUPY (síla kádru, forma, střelci), a ty se
 *    mění každý herní den — deterministický výpočet ze seedu by nepomohl,
 *    protože náhoda v kurzu vůbec není;
 *  - lístek pro sedm zápasů potřebuje kolem padesáti dotazů; takhle je to
 *    jeden SELECT;
 *  - uložená `probability` odpovídá na „proč mám 1,35" a dá se nad ní testovat.
 */

import { logger } from "../lib/logger";
import { ENGINE_SINCE, engineFallbackLevel } from "./engine-transition";
import {
  expectedGoals, formAdjustment, outcomeProbabilities, totalsProbabilities,
  doubleChanceProbabilities,
  scorerShares, scorerProbability,
  marketOdds, singleSideOdds, MAX_ODDS_X100,
  goalLevel, LEVEL_WINDOW_ROUNDS, type LevelSample, type Lambdas,
} from "./odds-model";
import {
  HANDICAP_LINES, TEAM_TOTAL_LINES, GOAL_BANDS, BTTS_YES, BTTS_NO,
  handicapProbabilities, goalBandProbabilities, bothTeamsScoreProbability,
  teamTotalProbabilities, resultTotalProbabilities, mainTotalLine,
  handicapCode, teamTotalCode, resultTotalCode, handicapLabel, lineText,
  type BetMarket,
} from "./markets";

const M = "betting-board";

/**
 * Linie, na které se vypisuje trh „kolik padne gólů".
 *
 * Kódy výběrů ('over25', 'under65') se z linie skládají pořád stejně, takže
 * tipy podané na dřívější linie 2,5 / 3,5 / 6,5 se vyhodnocují dál.
 */
export const TOTAL_LINES = [1.5, 2.5, 3.5, 4.5, 5.5, 6.5] as const;

/** Kolik střelců se nabízí z každého týmu. */
export const SCORERS_PER_TEAM = 6;

/**
 * Kolik hráčů z kádru se vůbec počítá do dělby gólů.
 *
 * Naměřeno: za sezónu nastoupí průměrně 14,7 různých hráčů, zbytek soupisky
 * neodehraje nic. Když se podíl na gólech dělil mezi celý kádr, dostal každý
 * nastupující hráč zlomek toho, co mu patří — model pak podceňoval střelce
 * o pět procentních bodů a kurzy na ně byly příliš vysoké.
 *
 * Čtrnáct bez brankáře odpovídá tomu, co se reálně protočí.
 */
export const SQUAD_DEPTH = 14;

/** Pod tuhle pravděpodobnost se střelec nenabízí — kurz by byl nesmyslně vysoký. */
export const MIN_SCORER_PROB = 0.06;

/**
 * Nejnižší kurz, který se ještě vypisuje.
 *
 * Cokoli pod tím je prakticky jistota: nikdo to nevsadí a na lístku to jen
 * zabírá místo. Týká se obou stran gólových linií a neprohry favorita
 * u jednoznačných zápasů.
 *
 * U jistoty je to i ochrana kanceláře. Kurz nespadne pod 1,05 (MIN_ODDS_X100),
 * takže tip, který padá v 98 % případů, by se vyplácel víc, než stojí.
 * V Praze padla linie 2,5 gólu ve 48 zápasech ze 49.
 */
export const MIN_OFFERED_ODDS = 120;

/**
 * Vypisuje se možnost s tímhle kurzem?
 *
 * Zdola MIN_OFFERED_ODDS (viz výš). Shora strop kurzu: kurz, který narazil na
 * MAX_ODDS_X100, už neodpovídá pravděpodobnosti, jen zabírá místo na lístku
 * („outsider vyhraje o 3 a víc" za 15,00 při šanci jedno procento). Strop je
 * stejně v neprospěch sázejícího, takže skrýt ho kancelář nic nestojí.
 *
 * Platí pro gólové linie a všechny doplňkové trhy z markets.ts.
 */
export function isOffered(oddsX100: number): boolean {
  return oddsX100 >= MIN_OFFERED_ODDS && oddsX100 < MAX_ODDS_X100;
}

/**
 * Trhy, které nový přepočet vypisuje vedle 1/X/2, neprohry a počtu gólů.
 * Když v kole nechybí všechny, lístek už je z verze, která je zná (routes/betting.ts).
 */
export const EXTRA_MARKETS = ["handicap", "goals_band", "btts", "team_totals", "result_total"] as const;

/** Kolik posledních zápasů se počítá do formy. */
const FORM_MATCHES = 5;

interface RoundRow {
  calendar_id: string;
  league_id: string;
  season_number: number;
  game_week: number;
  scheduled_at: string;
}

interface MatchRow {
  id: string;
  home_team_id: string;
  away_team_id: string;
  home_name: string;
  away_name: string;
}

interface PlayerRow {
  id: string;
  team_id: string;
  first_name: string;
  last_name: string;
  position: string;
  overall_rating: number;
  goals: number;
  starts: number;
}

export interface OddsRow {
  leagueId: string;
  seasonNumber: number;
  calendarId: string;
  matchId: string;
  market: BetMarket;
  selection: string;
  oddsX100: number;
  probability: number;
  label: string;
}

/**
 * Nejbližší nesehrané kolo soutěže.
 *
 * Filtr na nejvyšší season_number je nutný — league_id se napříč sezónami
 * recykluje a bez něj by se vracela stará kola (vzor stats/standings.ts).
 */
export async function nextOpenRound(db: D1Database, leagueId: string): Promise<RoundRow | null> {
  return await db.prepare(
    `SELECT sc.id AS calendar_id, sc.league_id, sc.season_number, sc.game_week, sc.scheduled_at
       FROM season_calendar sc
      WHERE sc.league_id = ? AND sc.status = 'scheduled'
        AND sc.season_number = (SELECT MAX(season_number) FROM season_calendar WHERE league_id = ?)
      ORDER BY sc.scheduled_at ASC LIMIT 1`
  ).bind(leagueId, leagueId).first<RoundRow>()
    .catch((e) => { logger.warn({ module: M }, `nejbližší kolo ligy ${leagueId}`, e); return null; });
}

/**
 * Síla týmu = průměr nejlepších JEDENÁCTI aktivních hráčů.
 *
 * Ne celý kádr. Průměr přes soupisku netrestá slabý tým, ale široký: klub
 * s 31 hráči včetně dorostenců měl proti klubu s 21 vybranými průměr nižší
 * o jedenáct bodů, i když jeho sestava byla lepší — a kurzy z něj dělaly
 * outsidera. Nastupuje jedenáct lidí, ne celá soupiska.
 *
 * Definice je součástí kalibrace modelu (viz STRENGTH_K).
 */
async function loadStrengths(db: D1Database, teamIds: string[]): Promise<Map<string, number>> {
  if (teamIds.length === 0) return new Map();
  const ph = teamIds.map(() => "?").join(",");
  const rows = await db.prepare(
    `SELECT team_id, COALESCE(AVG(overall_rating), 30) AS strength FROM (
       SELECT team_id, overall_rating,
              ROW_NUMBER() OVER (PARTITION BY team_id ORDER BY overall_rating DESC) AS poz
         FROM players
        WHERE team_id IN (${ph}) AND (status IS NULL OR status = 'active')
     ) WHERE poz <= 11
     GROUP BY team_id`
  ).bind(...teamIds).all<{ team_id: string; strength: number }>()
    .catch((e) => { logger.warn({ module: M }, "síla kádrů", e); return { results: [] }; });

  const out = new Map<string, number>();
  for (const r of rows.results) out.set(r.team_id, r.strength);
  for (const id of teamIds) if (!out.has(id)) out.set(id, 30);
  return out;
}

/** Jak si tým stojí — pro kurzy i pro to, co se ukáže hráči na lístku. */
export interface TeamStanding {
  /** Pořadí v tabulce. 0 = ještě se nehrálo. */
  pos: number;
  played: number;
  points: number;
  goalsFor: number;
  goalsAgainst: number;
  /** Posledních pět výsledků, nejnovější první: „V" | „R" | „P". */
  form: string[];
  /** Korekce formy pro kurzový model, ve stejných jednotkách jako síla kádru. */
  formAdj: number;
}

/**
 * Tabulka a forma všech týmů soutěže z jednoho dotazu.
 *
 * Slouží dvěma věcem naráz: kurzovému modelu (formAdj) a kurzovému lístku
 * (pořadí, skóre, posledních pět výsledků). Počítá se jen z aktuální sezóny —
 * league_id se napříč sezónami recykluje, takže bez filtru by se do tabulky
 * počítaly staré ročníky (vzor stats/standings.ts).
 */
export async function teamStandings(
  db: D1Database, leagueId: string, seasonNumber: number,
): Promise<Map<string, TeamStanding>> {
  const out = new Map<string, TeamStanding>();

  const tymy = await db.prepare("SELECT id FROM teams WHERE league_id = ?")
    .bind(leagueId).all<{ id: string }>()
    .catch((e) => { logger.warn({ module: M }, `týmy ligy ${leagueId}`, e); return { results: [] }; });

  const rows = await db.prepare(
    `SELECT m.home_team_id, m.away_team_id, m.home_score, m.away_score, sc.game_week
       FROM matches m JOIN season_calendar sc ON sc.id = m.calendar_id
      WHERE m.league_id = ? AND sc.season_number = ? AND m.status = 'simulated'
        AND m.home_score IS NOT NULL
      ORDER BY sc.game_week DESC`
  ).bind(leagueId, seasonNumber).all<{
    home_team_id: string; away_team_id: string; home_score: number; away_score: number;
  }>().catch((e) => { logger.warn({ module: M }, `tabulka ligy ${leagueId}`, e); return { results: [] }; });

  interface Stat { w: number; d: number; l: number; gf: number; ga: number; form: string[] }
  const stat = new Map<string, Stat>();
  for (const t of tymy.results) stat.set(t.id, { w: 0, d: 0, l: 0, gf: 0, ga: 0, form: [] });

  // Zápasy chodí od nejnovějšího kola, takže prvních pět zapsaných je forma.
  for (const m of rows.results) {
    for (const [tid, vlastni, cizi] of [
      [m.home_team_id, m.home_score, m.away_score] as const,
      [m.away_team_id, m.away_score, m.home_score] as const,
    ]) {
      const s = stat.get(tid);
      if (!s) continue;
      s.gf += vlastni; s.ga += cizi;
      if (vlastni > cizi) s.w++; else if (vlastni === cizi) s.d++; else s.l++;
      if (s.form.length < FORM_MATCHES) s.form.push(vlastni > cizi ? "V" : vlastni === cizi ? "R" : "P");
    }
  }

  const poradi = [...stat.entries()]
    .map(([id, s]) => ({ id, body: s.w * 3 + s.d, rozdil: s.gf - s.ga, vstrelene: s.gf }))
    .sort((a, b) => b.body - a.body || b.rozdil - a.rozdil || b.vstrelene - a.vstrelene);
  const misto = new Map(poradi.map((t, i) => [t.id, i + 1]));

  for (const [id, s] of stat) {
    const odehrano = s.w + s.d + s.l;
    const bodyNaZapas = s.form.length === 0
      ? 1.5   // bez odehraných zápasů je forma neutrální, ne nulová
      : s.form.reduce((a, v) => a + (v === "V" ? 3 : v === "R" ? 1 : 0), 0) / s.form.length;
    out.set(id, {
      pos: odehrano === 0 ? 0 : (misto.get(id) ?? 0),
      played: odehrano,
      points: s.w * 3 + s.d,
      goalsFor: s.gf,
      goalsAgainst: s.ga,
      form: s.form,
      formAdj: formAdjustment(bodyNaZapas),
    });
  }
  return out;
}

/** Kandidáti na střelce se sezónními góly a počtem startů. */
async function loadScorers(
  db: D1Database, teamIds: string[], seasonId: string,
): Promise<Map<string, PlayerRow[]>> {
  const out = new Map<string, PlayerRow[]>();
  if (teamIds.length === 0) return out;
  const ph = teamIds.map(() => "?").join(",");

  // Jen ta část kádru, která se reálně protočí — viz SQUAD_DEPTH. Řadí se
  // podle ratingu, protože podle něj se vybírá i sestava.
  //
  // player_stats má řádek na hráče A TÝM, takže hráč, který v sezóně
  // přestoupil, má dva. Sčítají se, jinak by byl v kádru dvakrát.
  const rows = await db.prepare(
    `SELECT id, team_id, first_name, last_name, position, overall_rating, goals, starts FROM (
       SELECT p.id, p.team_id, p.first_name, p.last_name, p.position, p.overall_rating,
              COALESCE(ps.goals, 0) AS goals, COALESCE(ps.appearances, 0) AS starts,
              ROW_NUMBER() OVER (PARTITION BY p.team_id ORDER BY p.overall_rating DESC) AS poz
         FROM players p
         LEFT JOIN (
           SELECT player_id, SUM(goals) AS goals, SUM(appearances) AS appearances
             FROM player_stats WHERE season_id = ? GROUP BY player_id
         ) ps ON ps.player_id = p.id
        WHERE p.team_id IN (${ph})
          AND (p.status IS NULL OR p.status = 'active')
          AND COALESCE(p.suspended_matches, 0) = 0
          AND p.position <> 'GK'
     ) WHERE poz <= ${SQUAD_DEPTH}`
  ).bind(seasonId, ...teamIds).all<PlayerRow>()
    .catch((e) => { logger.warn({ module: M }, "kandidáti na střelce", e); return { results: [] }; });

  for (const r of rows.results) {
    const arr = out.get(r.team_id) ?? [];
    arr.push(r);
    out.set(r.team_id, arr);
  }
  return out;
}

/**
 * Úroveň gólů soutěže z jejích posledních odehraných kol (viz goalLevel).
 *
 * Kola se berou napříč sezónami: league_id se recykluje, a na začátku nového
 * ročníku je lepší úroveň z konce minulého než žádná. Síla týmů je dnešní,
 * ne tehdejší. Za šest kol se kádry pohnou o pár bodů, na úroveň to nemá vliv.
 */
async function loadGoalLevel(db: D1Database, leagueId: string): Promise<number> {
  // Jen kola odehraná na enginu podle rolí; do prvního z nich úroveň z přehrání
  // nového enginu (engine-transition.ts), ne z „hokejových“ kol starého.
  const kola = await db.prepare(
    `SELECT id FROM season_calendar WHERE league_id = ? AND status = 'simulated' AND scheduled_at >= ?
      ORDER BY scheduled_at DESC LIMIT ?`
  ).bind(leagueId, ENGINE_SINCE, LEVEL_WINDOW_ROUNDS).all<{ id: string }>()
    .catch((e) => { logger.warn({ module: M }, `odehraná kola ligy ${leagueId}`, e); return { results: [] }; });
  if (kola.results.length === 0) return engineFallbackLevel(leagueId);
  const stari = new Map(kola.results.map((k, i) => [k.id, i]));

  const zapasy = await db.prepare(
    `SELECT home_team_id, away_team_id, home_score, away_score, calendar_id FROM matches
      WHERE calendar_id IN (${kola.results.map(() => "?").join(",")})
        AND status = 'simulated' AND home_score IS NOT NULL`
  ).bind(...kola.results.map((k) => k.id)).all<{
    home_team_id: string; away_team_id: string; home_score: number; away_score: number; calendar_id: string;
  }>().catch((e) => { logger.warn({ module: M }, `zápasy pro úroveň gólů ligy ${leagueId}`, e); return { results: [] }; });
  if (zapasy.results.length === 0) return 1;

  const tymy = [...new Set(zapasy.results.flatMap((z) => [z.home_team_id, z.away_team_id]))];
  const sily = await loadStrengths(db, tymy);

  const vzorky: LevelSample[] = zapasy.results.map((z) => {
    const l = expectedGoals(
      { strength: sily.get(z.home_team_id) ?? 30, form: 0 },
      { strength: sily.get(z.away_team_id) ?? 30, form: 0 },
    );
    return {
      goals: z.home_score + z.away_score,
      expected: l.home + l.away,
      roundsAgo: stari.get(z.calendar_id) ?? LEVEL_WINDOW_ROUNDS,
    };
  });
  return goalLevel(vzorky);
}

type MatchOddsRow = Omit<OddsRow, "leagueId" | "seasonNumber" | "calendarId">;

/**
 * Doplňkové trhy zápasu (markets.ts) ze stejných očekávaných gólů jako 1/X/2.
 *
 * Maržuje se stejnou mašinérií jako stávající trhy:
 *  - dvoucestné sázky (handicap, oba dají gól, góly týmu) přes marketOdds na
 *    dvojici, která dává dohromady 1, stejně jako gólové linie;
 *  - víccestné trhy (pásma gólů, výsledek s góly) po jedné možnosti přes
 *    singleSideOdds, stejně jako dvojtip. Společný overround by tu byl
 *    nebezpečný: podlaha PROB_FLOOR zvedne malé možnosti, normalizace pak ubere
 *    marži té velké a pravděpodobný tip by mohl mít kurz nad férovou cenou.
 * Vypisuje se jen to, co projde isOffered.
 */
export function extraMarketOdds(
  matchId: string, homeName: string, awayName: string, lambdas: Lambdas,
): MatchOddsRow[] {
  const out: MatchOddsRow[] = [];
  const push = (market: BetMarket, selection: string, oddsX100: number, probability: number, label: string) => {
    if (isOffered(oddsX100)) out.push({ matchId, market, selection, oddsX100, probability, label });
  };

  // Handicap: na každé linii dvě dvoucestné sázky, domácí −linie proti hostům
  // +linie a obráceně. Nabízí se obě strany, které mají rozumný kurz.
  for (const line of HANDICAP_LINES) {
    const h = handicapProbabilities(lambdas, line);
    const [kHomeMinus, kAwayPlus] = marketOdds([h.homeMinus, h.awayPlus]);
    const [kAwayMinus, kHomePlus] = marketOdds([h.awayMinus, h.homePlus]);
    push("handicap", handicapCode("home", "m", line), kHomeMinus, h.homeMinus, handicapLabel(homeName, "m", line));
    push("handicap", handicapCode("away", "p", line), kAwayPlus, h.awayPlus, handicapLabel(awayName, "p", line));
    push("handicap", handicapCode("away", "m", line), kAwayMinus, h.awayMinus, handicapLabel(awayName, "m", line));
    push("handicap", handicapCode("home", "p", line), kHomePlus, h.homePlus, handicapLabel(homeName, "p", line));
  }

  // Přesný počet gólů v pásmu
  const bands = goalBandProbabilities(lambdas);
  GOAL_BANDS.forEach((b, i) => push("goals_band", b.code, singleSideOdds(bands[i]), bands[i], b.label));

  // Oba týmy dají gól
  const btts = bothTeamsScoreProbability(lambdas);
  const [kYes, kNo] = marketOdds([btts, 1 - btts]);
  push("btts", BTTS_YES, kYes, btts, "Oba týmy dají gól: ano");
  push("btts", BTTS_NO, kNo, 1 - btts, "Oba týmy dají gól: ne");

  // Góly jednoho týmu
  const sides = [["home", homeName, lambdas.home], ["away", awayName, lambdas.away]] as const;
  for (const [side, name, mu] of sides) {
    for (const line of TEAM_TOTAL_LINES) {
      const t = teamTotalProbabilities(mu, line);
      const [kOver, kUnder] = marketOdds([t.over, t.under]);
      push("team_totals", teamTotalCode(side, "over", line), kOver, t.over,
           `${name} dá víc než ${lineText(line)} gólu`);
      push("team_totals", teamTotalCode(side, "under", line), kUnder, t.under,
           `${name} dá míň než ${lineText(line)} gólu`);
    }
  }

  // Výsledek a počet gólů na hlavní linii zápasu (nejblíž půl na půl)
  const line = mainTotalLine(lambdas, TOTAL_LINES);
  const rt = resultTotalProbabilities(lambdas, line);
  const lineStr = lineText(line);
  const combos: Array<["1" | "X" | "2", "over" | "under", number, string]> = [
    ["1", "over", rt.homeOver, `${homeName} vyhraje a padne víc než ${lineStr} gólu`],
    ["1", "under", rt.homeUnder, `${homeName} vyhraje a padne míň než ${lineStr} gólu`],
    ["X", "over", rt.drawOver, `Remíza a padne víc než ${lineStr} gólu`],
    ["X", "under", rt.drawUnder, `Remíza a padne míň než ${lineStr} gólu`],
    ["2", "over", rt.awayOver, `${awayName} vyhraje a padne víc než ${lineStr} gólu`],
    ["2", "under", rt.awayUnder, `${awayName} vyhraje a padne míň než ${lineStr} gólu`],
  ];
  for (const [outcome, dir, prob, label] of combos) {
    push("result_total", resultTotalCode(outcome, dir, line), singleSideOdds(prob), prob, label);
  }

  return out;
}

/** Kurzy jednoho zápasu. Čistá část výpočtu, jen skládá volání modelu. */
export function matchOdds(input: {
  matchId: string;
  homeName: string;
  awayName: string;
  homeStrength: number;
  awayStrength: number;
  homeForm: number;
  awayForm: number;
  scorers: Array<{ playerId: string; name: string; teamName: string; isHome: boolean;
                   position: string; goals: number; appearances: number; rating: number }>;
  /** Góly týmu na odehraný ligový zápas v sezóně. 0 = ještě nehrál. */
  homeGoalsPerMatch: number;
  awayGoalsPerMatch: number;
  /** Úroveň gólů soutěže z goalLevel. */
  goalLevel: number;
}): Array<Omit<OddsRow, "leagueId" | "seasonNumber" | "calendarId">> {
  const lambdas = expectedGoals(
    { strength: input.homeStrength, form: input.homeForm },
    { strength: input.awayStrength, form: input.awayForm },
    input.goalLevel,
  );
  const out: Array<Omit<OddsRow, "leagueId" | "seasonNumber" | "calendarId">> = [];

  // Výsledek 1/X/2
  const o = outcomeProbabilities(lambdas);
  const [k1, kx, k2] = marketOdds([o.home, o.draw, o.away]);
  out.push(
    { matchId: input.matchId, market: "1x2", selection: "1", oddsX100: k1, probability: o.home, label: input.homeName },
    { matchId: input.matchId, market: "1x2", selection: "X", oddsX100: kx, probability: o.draw, label: "Remíza" },
    { matchId: input.matchId, market: "1x2", selection: "2", oddsX100: k2, probability: o.away, label: input.awayName },
  );

  // Dvojtip. Tři možnosti se navzájem nevylučují, takže se každá maržuje
  // zvlášť jako dvoucestná sázka — normalizovat je na jeden overround by
  // znamenalo prodávat jistotu pod cenou.
  //
  // U jednoznačného zápasu spadne neprohra favorita na podlahu kurzu (1,05).
  // Takovou možnost nemá smysl vypisovat: nikdo ji nevsadí a na lístku jen
  // zabírá místo. Stejný práh jako u vysokých gólových linií.
  const dc = doubleChanceProbabilities(lambdas);
  const dvojtipy: Array<[string, number, string]> = [
    ["1X", dc.homeOrDraw, `${input.homeName} neprohraje`],
    ["12", dc.noDraw, "Nebude remíza"],
    ["X2", dc.awayOrDraw, `${input.awayName} neprohraje`],
  ];
  for (const [selection, prob, label] of dvojtipy) {
    const odds = singleSideOdds(prob);
    if (odds < MIN_OFFERED_ODDS) continue;
    out.push({ matchId: input.matchId, market: "dchance", selection,
               oddsX100: odds, probability: prob, label });
  }

  // Počet gólů
  for (const line of TOTAL_LINES) {
    const t = totalsProbabilities(lambdas, line);
    const [kover, kunder] = marketOdds([t.over, t.under]);
    const tag = String(line).replace(".", "");
    const cara = String(line).replace(".", ",");

    // Strana se nabízí jen tam, kde má smysl. „Míň než 6,5 gólu" vychází
    // v běžné soutěži na podlahu kurzu, „víc než 2,5 gólu" v soutěži, kde
    // padá šest gólů na zápas, taky. Opačný konec (kurz na stropu) viz isOffered.
    if (isOffered(kover)) {
      out.push({ matchId: input.matchId, market: "totals", selection: `over${tag}`,
                 oddsX100: kover, probability: t.over, label: `Víc než ${cara} gólu` });
    }
    if (isOffered(kunder)) {
      out.push({ matchId: input.matchId, market: "totals", selection: `under${tag}`,
                 oddsX100: kunder, probability: t.under, label: `Míň než ${cara} gólu` });
    }
  }

  out.push(...extraMarketOdds(input.matchId, input.homeName, input.awayName, lambdas));

  // Střelci — zvlášť pro každý tým, podíly se dělí uvnitř týmu
  for (const isHome of [true, false]) {
    const kadr = input.scorers.filter((s) => s.isHome === isHome);
    if (kadr.length === 0) continue;

    const teamLambda = isHome ? lambdas.home : lambdas.away;
    const shares = scorerShares(
      kadr.map((s) => ({ playerId: s.playerId, position: s.position, goals: s.goals,
                         appearances: s.appearances, rating: s.rating })),
      isHome ? input.homeGoalsPerMatch : input.awayGoalsPerMatch,
    );

    const ohodnoceni = kadr.map((s) => {
      const share = shares.get(s.playerId) ?? 0;
      // Bez dostupnosti: nenastoupení tip anuluje, neprohrává ho.
      return { s, prob: scorerProbability(teamLambda, share) };
    })
      .filter((x) => x.prob >= MIN_SCORER_PROB)
      .sort((a, b) => b.prob - a.prob)
      .slice(0, SCORERS_PER_TEAM);

    for (const { s, prob } of ohodnoceni) {
      out.push({
        matchId: input.matchId, market: "scorer", selection: s.playerId,
        oddsX100: singleSideOdds(prob), probability: prob,
        label: `${s.name} (${s.teamName})`,
      });
    }
  }

  return out;
}

/**
 * Vygeneruje nebo přepočítá kurzový lístek nejbližšího kola soutěže.
 * Vrací počet zapsaných řádků; 0 znamená „není co vypisovat".
 */
export async function generateBoard(
  db: D1Database, leagueId: string, gameDate: string,
): Promise<{ calendarId: string | null; rows: number }> {
  const round = await nextOpenRound(db, leagueId);
  if (!round) return { calendarId: null, rows: 0 };

  const matches = await db.prepare(
    `SELECT m.id, m.home_team_id, m.away_team_id,
            h.name AS home_name, a.name AS away_name
       FROM matches m
       JOIN teams h ON h.id = m.home_team_id
       JOIN teams a ON a.id = m.away_team_id
      WHERE m.calendar_id = ? AND m.status = 'scheduled'
        AND h.name NOT LIKE 'DELETED-%' AND a.name NOT LIKE 'DELETED-%'`
  ).bind(round.calendar_id).all<MatchRow>()
    .catch((e) => { logger.warn({ module: M }, `zápasy kola ${round.calendar_id}`, e); return { results: [] }; });

  if (matches.results.length === 0) return { calendarId: round.calendar_id, rows: 0 };

  const teamIds = [...new Set(matches.results.flatMap((m) => [m.home_team_id, m.away_team_id]))];
  const seasonId = `season-${round.season_number}`;

  const [strengths, tabulka, scorers, level] = await Promise.all([
    loadStrengths(db, teamIds),
    teamStandings(db, leagueId, round.season_number),
    loadScorers(db, teamIds, seasonId),
    loadGoalLevel(db, leagueId),
  ]);
  logger.info({ module: M }, `úroveň gólů ligy ${leagueId}: ${level.toFixed(2)}`);

  // Góly na zápas z tabulky, tedy jen z ligy, stejně jako player_stats hráčů.
  const golyNaZapas = (teamId: string): number => {
    const t = tabulka.get(teamId);
    return t && t.played > 0 ? t.goalsFor / t.played : 0;
  };

  const vsechny: OddsRow[] = [];
  for (const m of matches.results) {
    const kadrDomaci = scorers.get(m.home_team_id) ?? [];
    const kadrHoste = scorers.get(m.away_team_id) ?? [];

    const rows = matchOdds({
      matchId: m.id,
      homeName: m.home_name,
      awayName: m.away_name,
      homeStrength: strengths.get(m.home_team_id) ?? 30,
      awayStrength: strengths.get(m.away_team_id) ?? 30,
      homeForm: tabulka.get(m.home_team_id)?.formAdj ?? 0,
      awayForm: tabulka.get(m.away_team_id)?.formAdj ?? 0,
      homeGoalsPerMatch: golyNaZapas(m.home_team_id),
      awayGoalsPerMatch: golyNaZapas(m.away_team_id),
      goalLevel: level,
      scorers: [
        ...kadrDomaci.map((p) => ({
          playerId: p.id, name: `${p.first_name} ${p.last_name}`, teamName: m.home_name,
          isHome: true, position: p.position, goals: p.goals, appearances: p.starts,
          rating: p.overall_rating,
        })),
        ...kadrHoste.map((p) => ({
          playerId: p.id, name: `${p.first_name} ${p.last_name}`, teamName: m.away_name,
          isHome: false, position: p.position, goals: p.goals, appearances: p.starts,
          rating: p.overall_rating,
        })),
      ],
    });

    for (const r of rows) {
      vsechny.push({
        ...r, leagueId, seasonNumber: round.season_number, calendarId: round.calendar_id,
      });
    }
  }

  await writeOdds(db, vsechny, gameDate);
  return { calendarId: round.calendar_id, rows: vsechny.length };
}

/** Řádků kurzů v jednom INSERTu. D1 bere nejvýš 100 parametrů, řádek jich má 11. */
export const ODDS_ROWS_PER_STATEMENT = 9;
/** Příkazů v jedné dávce. 20 × 9 = 180 kurzů, kolo jsou dvě dávky. */
export const ODDS_STATEMENTS_PER_BATCH = 20;

/**
 * Zápis lístku. UPSERT na UNIQUE(match_id, market, selection) — souběžné běhy
 * tak nemůžou vyrobit dvě sady kurzů na týž zápas.
 *
 * Po zápisu se z kola smaže všechno, co nový přepočet nevypsal. UPSERT sám
 * jen přepisuje, takže tip, který přestal dávat smysl, by na lístku zůstal
 * se starým kurzem. Přesně tak 22. 9. 2026 v Prachaticích zůstalo „víc než
 * 2,5 gólu" za 1,83, když ho nový model s šancí přes 90 % už nevypsal.
 * Stejně tak visel střelec, který vypadl z šestice.
 *
 * Maže se jen po úspěšném zápisu všech dávek. Když zápis spadne, lístek
 * zůstane starý, ale celý. Prázdný lístek by byl horší než zastaralý.
 * Úklid se týká jen nesehraných zápasů kola, kurzy odehraných zápasů
 * potřebuje hlídač kurzů (calibration.ts).
 */
export async function writeOdds(db: D1Database, rows: OddsRow[], gameDate: string): Promise<void> {
  if (rows.length === 0) return;

  // Víc řádků v jednom INSERTu. S doplňkovými trhy má zápas kolem padesáti
  // kurzů, kolo přes tři sta, a denní tick píše lístky všech soutěží v jedné
  // invokaci. Po řádku by to byly stovky příkazů na soutěž, takhle desítky.
  // D1 bere nejvýš 100 parametrů na příkaz: 9 řádků × 11 sloupců = 99.
  const insert = (rowCount: number) => db.prepare(
    `INSERT INTO bet_odds
       (id, league_id, season_number, calendar_id, match_id, market, selection,
        odds_x100, probability, label, game_date)
     VALUES ${Array.from({ length: rowCount }, () => "(?,?,?,?,?,?,?,?,?,?,?)").join(",")}
     ON CONFLICT(match_id, market, selection) DO UPDATE SET
       odds_x100 = excluded.odds_x100,
       probability = excluded.probability,
       label = excluded.label,
       game_date = excluded.game_date`
  );

  const statements: D1PreparedStatement[] = [];
  for (let i = 0; i < rows.length; i += ODDS_ROWS_PER_STATEMENT) {
    const part = rows.slice(i, i + ODDS_ROWS_PER_STATEMENT);
    statements.push(insert(part.length).bind(...part.flatMap((r) => [
      crypto.randomUUID(), r.leagueId, r.seasonNumber, r.calendarId, r.matchId,
      r.market, r.selection, r.oddsX100, r.probability, r.label, gameDate,
    ])));
  }

  let selhalo = false;
  for (let i = 0; i < statements.length; i += ODDS_STATEMENTS_PER_BATCH) {
    await db.batch(statements.slice(i, i + ODDS_STATEMENTS_PER_BATCH)).catch((e) => {
      selhalo = true;
      logger.error({ module: M }, `zápis kurzů (dávka od příkazu ${i})`, e);
    });
  }

  const calendarId = rows[0].calendarId;
  if (selhalo) {
    logger.warn({ module: M }, `kolo ${calendarId}: zápis neprošel celý, staré kurzy se nemažou`);
    return;
  }

  const vypsane = rows.map((r) => `${r.matchId}|${r.market}|${r.selection}`);
  const smazano = await db.prepare(
    `DELETE FROM bet_odds
      WHERE calendar_id = ?
        AND match_id IN (SELECT id FROM matches WHERE calendar_id = ? AND status = 'scheduled')
        AND (match_id || '|' || market || '|' || selection) NOT IN (SELECT value FROM json_each(?))`
  ).bind(calendarId, calendarId, JSON.stringify(vypsane)).run()
    .catch((e) => { logger.error({ module: M }, `úklid starých kurzů kola ${calendarId}`, e); return null; });

  const pocet = smazano?.meta?.changes ?? 0;
  if (pocet > 0) logger.info({ module: M }, `kolo ${calendarId}: z lístku zmizelo ${pocet} kurzů, které nový přepočet nevypsal`);
}
