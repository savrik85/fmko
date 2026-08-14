/**
 * Výběr článků pro Zpravodaj — jedno místo pro oba pohledy (vlastní okres i cizí liga).
 *
 * Noviny mají pro každý typ článku vlastní rubriku, takže se nedá vzít prostě
 * N nejnovějších zpráv: přestupů vzniknou za sezónu stovky a při řazení podle
 * data vytlačí Hráče kola, Kotel i rozhovory úplně mimo výběr — rubriky pak
 * zůstanou prázdné, přestože články v databázi jsou. Každý typ proto dostane
 * vlastní kvótu a teprve výsledek se řadí podle data.
 */

/** Kolik článků daného typu se do novin vejde. Vychází z toho, co rubrika reálně vykreslí. */
const KVOTY: Record<string, number> = {
  transfer: 9,
  interview: 8,
  player_interview: 6,
  promotion: 3,
  // Kotel se vykresluje jako plnohodnotný blok s fotkami a rubrika renderuje
  // všechno, co dostane — víc než jeden report by znamenal dva vedle sebe.
  ultras_report: 1,
  round_summary: 2,
  ai_report: 2,
  round_results: 2,
  matchday_preview: 1,
  season_opener: 1,
  season_wrap: 1,
};
const KVOTA_OSTATNI = 2;

/** Ikony rubrik. Neznámý typ dostane obecné noviny, ať nikdy nezmizí z výpisu. */
export const NEWS_ICONS: Record<string, string> = {
  manager_arrival: "\u{1F4CB}",
  round_results: "⚽",
  seasonal: "\u{1F389}",
  municipal_elections: "\u{1F5F3}️",
  transfer: "\u{1F91D}",
  celebrity_arrival: "\u{1F31F}",
  celebrity_signing: "\u{1F4DD}",
  ai_report: "✍️",
  promotion: "\u{1F4E2}",
  interview: "\u{1F399}️",
  player_interview: "\u{1F3A4}",
  manager_feud: "\u{1F5E3}️",
  season_wrap: "\u{1F3C1}",
  season_opener: "\u{1F3BA}",
  season_awards: "\u{1F3C6}",
  legend_farewell: "\u{1F396}️",
  ultras_report: "\u{1F525}",
  round_summary: "\u{1F3C6}",
  matchday_preview: "\u{1F52E}",
  announcement: "\u{1F4E3}",
  story: "\u{1F4D6}",
};

export function newsIcon(type: string): string {
  return NEWS_ICONS[type] ?? "\u{1F4F0}";
}

const CASE_KVOTY = Object.entries(KVOTY)
  .map(([typ, n]) => `WHEN '${typ}' THEN ${n}`)
  .join(" ");

export interface FeedRow {
  id: string;
  type: string;
  headline: string;
  body: string;
  game_week: number | null;
  created_at: string;
  /** Klub, ke kterému se článek váže — z něj jde ve Zpravodaji na profil trenéra. */
  team_id: string | null;
  photos_json: string | null;
  /** Podpis pod článkem — kdo ho v redakci psal. */
  journalist_id: string | null;
  journalist_first: string | null;
  journalist_last: string | null;
  journalist_nick: string | null;
  journalist_style: string | null;
}

/**
 * Načte články pro jednu ligu. `teamId` přibere i zprávy adresované jen tomu týmu
 * a zároveň schová propagaci na zápas, který se už odehrál.
 */
export async function loadFeedArticles(
  db: D1Database,
  leagueId: string,
  teamId?: string,
): Promise<FeedRow[]> {
  const res = await db.prepare(
    `WITH kandidati AS (
       SELECT n.id, n.type, n.headline, n.body, n.game_week, n.created_at, n.journalist_id, n.team_id,
              ROW_NUMBER() OVER (PARTITION BY n.type ORDER BY n.created_at DESC) AS poradi
       FROM news n
       LEFT JOIN matches m ON n.match_id = m.id AND n.type = 'promotion'
       WHERE (n.league_id = ? OR (?2 IS NOT NULL AND n.team_id = ?2))
         AND (n.type != 'promotion' OR COALESCE(m.status, 'upcoming') != 'simulated')
         -- Jednorázovky a pozvánka na zápas po čase ztrácejí smysl; jinak by loňské
         -- ohlédnutí za sezónou viselo v čele novin donekonečna.
         AND (n.type NOT IN ('season_opener', 'season_wrap')
              OR n.created_at > strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-14 days'))
         AND (n.type != 'matchday_preview'
              OR n.created_at > strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-7 days'))
     )
     SELECT k.id, k.type, k.headline, k.body, k.game_week, k.created_at, k.team_id, ur.photos_json,
            k.journalist_id, j.first_name AS journalist_first, j.last_name AS journalist_last,
            j.nickname AS journalist_nick, j.style AS journalist_style
     FROM kandidati k
     LEFT JOIN ultras_reports ur ON ur.news_id = k.id
     LEFT JOIN journalists j ON j.id = k.journalist_id
     WHERE k.poradi <= CASE k.type ${CASE_KVOTY} ELSE ${KVOTA_OSTATNI} END
     ORDER BY k.created_at DESC`
  ).bind(leagueId, teamId ?? null).all<FeedRow>();

  return res.results;
}
