import { Hono, type Context } from "hono";
import type { Bindings } from "../index";
import { logger } from "../lib/logger";
import { getSession } from "../auth/session";
import {
  recordTransaction,
  stadiumFacilityLevels,
  matchTicketPrice,
  getBaseTicketPrice,
  mapVillageSize,
} from "../season/finance-processor";
import {
  CLUB_WEBSITE_TEMPLATES,
  CLUB_WEBSITE_ADDONS,
  STADIUM_PHOTO_VIEWPOINTS,
  slugifyTeamName,
  type ClubWebsiteStadiumRender,
  type StadiumPhotoViewpoint,
  type ClubWebsiteTemplate,
  type ClubWebsiteAddon,
  type ClubWebsiteMatchHighlight,
  type ClubWebsiteMatchSummary,
} from "@okresni-masina/shared";
import { standFacilities } from "../stadium/stands-model";

export const clubWebsiteRouter = new Hono<{ Bindings: Bindings }>();

const MODULE = { module: "club-website" };

function formatPlayerPositionCZ(pos: string): string {
  const p = (pos || "").toUpperCase();
  switch (p) {
    case "GK":
    case "BRA":
      return "Brankář";
    case "DEF":
    case "OBR":
      return "Obránce";
    case "CB":
      return "Stoper";
    case "LB":
      return "Levý obránce";
    case "RB":
      return "Pravý obránce";
    case "LWB":
    case "RWB":
      return "Krajní obránce";
    case "MID":
    case "ZAL":
    case "ZÁL":
      return "Záložník";
    case "CM":
      return "Střední záložník";
    case "LM":
      return "Levý záložník";
    case "RM":
      return "Pravý záložník";
    case "CDM":
    case "DM":
      return "Defenzivní záložník";
    case "CAM":
    case "AM":
      return "Ofenzivní záložník";
    case "FWD":
    case "UTO":
    case "ÚTO":
      return "Útočník";
    case "ST":
      return "Hrotový útočník";
    case "CF":
      return "Útočník";
    case "LW":
      return "Levé křídlo";
    case "RW":
      return "Pravé křídlo";
    default:
      return pos || "Hráč";
  }
}

// ── Adresy webu ──────────────────────────────────────────────────────────────

/** Nejkratší adresa, kterou smí mít klub nastavenou nebo podle které ho hledáme odhadem. */
const MIN_FUZZY_SLUG = 4;

interface TeamSlugRow {
  id: string;
  slug: string;
  villageSlug: string;
}

/** Seniorské týmy se slugem názvu a obce. U21 má vlastní web jen přes ID, nikdy přes odhad. */
async function loadSeniorTeamSlugs(db: D1Database): Promise<TeamSlugRow[]> {
  const rows = await db
    .prepare(
      `SELECT t.id, t.name, v.name AS village_name
       FROM teams t LEFT JOIN villages v ON v.id = t.village_id
       WHERE t.name IS NOT NULL AND (t.team_type IS NULL OR t.team_type <> 'u21')`,
    )
    .all<{ id: string; name: string; village_name: string | null }>()
    .catch((e) => {
      logger.warn(MODULE, "load senior team slugs", e);
      return { results: [] as Array<{ id: string; name: string; village_name: string | null }> };
    });
  return (rows.results ?? []).map((r) => ({
    id: r.id,
    slug: slugifyTeamName(r.name),
    villageSlug: r.village_name ? slugifyTeamName(r.village_name) : "",
  }));
}

/** Vrátí jediný prvek, jinak null. Dvojznačná adresa nesmí otevřít náhodný klub. */
function only<T>(items: T[]): T | null {
  return items.length === 1 ? items[0] : null;
}

/**
 * Najde klub podle adresy. Pořadí: ID, vlastní adresa, stará adresa, přesný název,
 * název podle celých slov (aspoň 4 znaky, jen když sedí na jediný klub), obec (jen jediný klub).
 * Neznámá nebo dvojznačná adresa vrátí null (404), nikdy cizí klub.
 */
async function resolveTeamId(db: D1Database, identifier: string): Promise<string | null> {
  const direct = await db
    .prepare("SELECT id FROM teams WHERE id = ?")
    .bind(identifier)
    .first<{ id: string }>()
    .catch((e) => {
      logger.warn(MODULE, "resolveTeamId direct check", e);
      return null;
    });
  if (direct) return direct.id;

  const wanted = slugifyTeamName(identifier);
  if (!wanted) return null;

  const bySlug = await db
    .prepare("SELECT team_id FROM team_websites WHERE custom_slug = ?")
    .bind(wanted)
    .first<{ team_id: string }>()
    .catch((e) => {
      logger.warn(MODULE, "resolveTeamId bySlug check", e);
      return null;
    });
  if (bySlug) return bySlug.team_id;

  const byAlias = await db
    .prepare("SELECT team_id FROM team_website_slug_aliases WHERE slug = ?")
    .bind(wanted)
    .first<{ team_id: string }>()
    .catch((e) => {
      logger.warn(MODULE, "resolveTeamId alias check", e);
      return null;
    });
  if (byAlias) return byAlias.team_id;

  const teams = await loadSeniorTeamSlugs(db);

  const exact = only(teams.filter((t) => t.slug === wanted));
  if (exact) return exact.id;

  if (wanted.length >= MIN_FUZZY_SLUG) {
    // Celá slova: "brevnov" najde "fk-rohlik-brevnov", ale "ab" nenajde "rapid-reporyje".
    const byWords = only(teams.filter((t) => `-${t.slug}-`.includes(`-${wanted}-`)));
    if (byWords) return byWords.id;

    const byVillage = only(teams.filter((t) => t.villageSlug === wanted));
    if (byVillage) return byVillage.id;
  }

  return null;
}

/** Je adresa obsazená jiným klubem? Hlídá i názvy a staré adresy, aby si nikdo nepřivlastnil web soupeře. */
async function slugTakenByOtherTeam(
  db: D1Database,
  slug: string,
  teamId: string,
  seniorTeams?: TeamSlugRow[],
): Promise<boolean> {
  const [website, alias, byId] = await Promise.all([
    db.prepare("SELECT team_id FROM team_websites WHERE custom_slug = ? AND team_id <> ?")
      .bind(slug, teamId).first<{ team_id: string }>(),
    db.prepare("SELECT team_id FROM team_website_slug_aliases WHERE slug = ? AND team_id <> ?")
      .bind(slug, teamId).first<{ team_id: string }>()
      .catch((e) => {
        logger.warn(MODULE, "check slug alias collision", e);
        return null;
      }),
    db.prepare("SELECT id FROM teams WHERE id = ? AND id <> ?").bind(slug, teamId).first<{ id: string }>(),
  ]);
  if (website || alias || byId) return true;
  const teams = seniorTeams ?? (await loadSeniorTeamSlugs(db));
  // Slovo z názvu nebo obce jiného klubu (např. "vimperk") patří jemu, pokud ho nemá
  // i náš klub. Vlastní adresa má při hledání přednost, takže by jinak šlo
  // převzít adresu, pod kterou lidé hledají soupeře.
  const contains = (haystack: string) => !!haystack && `-${haystack}-`.includes(`-${slug}-`);
  const own = teams.find((t) => t.id === teamId);
  const ownsWord = !!own && (contains(own.slug) || contains(own.villageSlug));
  return teams.some((t) => t.id !== teamId && (t.slug === slug || (!ownsWord && (contains(t.slug) || contains(t.villageSlug)))));
}

/** Kolik starých adres si klub pamatuje. Víc by šlo zneužít k zabírání adres přejmenováváním. */
const MAX_SLUG_ALIASES = 3;

async function generateUniqueTeamSlug(db: D1Database, teamId: string, teamName: string): Promise<string> {
  const baseSlug = slugifyTeamName(teamName) || `tym-${teamId.slice(0, 8)}`;
  const seniorTeams = await loadSeniorTeamSlugs(db);
  for (let counter = 1; counter <= 50; counter++) {
    const candidate = counter === 1 ? baseSlug : `${baseSlug}-${counter}`;
    const taken = await slugTakenByOtherTeam(db, candidate, teamId, seniorTeams).catch((e) => {
      logger.warn(MODULE, "check slug uniqueness", e);
      return true;
    });
    if (!taken) return candidate;
  }
  return `${baseSlug}-${teamId.slice(0, 4)}`;
}

interface WebsiteSettings {
  template: ClubWebsiteTemplate;
  unlockedTemplates: ClubWebsiteTemplate[];
  unlockedAddons: ClubWebsiteAddon[];
  customSlug: string;
  announcement: string | null;
  sponsorBannerEnabled: boolean;
  visitorCount: number;
  /** Uložené JSON řetězce, podle kterých nákup pozná, že mezitím nikdo nic nezměnil. */
  rawUnlockedTemplates: string;
  rawUnlockedAddons: string;
}

function parseJsonList<T>(raw: string, fallback: T[], what: string): T[] {
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as T[]) : fallback;
  } catch (e) {
    logger.warn(MODULE, `parse ${what}`, e);
    return fallback;
  }
}

/** Nastavení webu; řádek a výchozí adresu z názvu týmu založí při prvním čtení. */
async function ensureWebsiteRow(db: D1Database, teamId: string): Promise<WebsiteSettings> {
  const existing = await db
    .prepare("SELECT * FROM team_websites WHERE team_id = ?")
    .bind(teamId)
    .first<{
      team_id: string;
      template: string;
      unlocked_templates: string;
      unlocked_addons: string;
      custom_slug: string | null;
      announcement: string | null;
      sponsor_banner_enabled: number;
      visitor_count: number;
    }>();

  const teamName = async () => {
    const team = await db
      .prepare("SELECT name FROM teams WHERE id = ?")
      .bind(teamId)
      .first<{ name: string }>()
      .catch((e) => {
        logger.warn(MODULE, "lookup team name for slug", e);
        return null;
      });
    return team?.name || `tym-${teamId.slice(0, 8)}`;
  };

  if (!existing) {
    const defaultSlug = await generateUniqueTeamSlug(db, teamId, await teamName());
    await db
      .prepare(
        `INSERT OR IGNORE INTO team_websites
         (team_id, template, unlocked_templates, unlocked_addons, custom_slug, announcement, sponsor_banner_enabled, visitor_count)
         VALUES (?, 'retro_2004', '["retro_2004"]', '[]', ?, NULL, 0, 0)`,
      )
      .bind(teamId, defaultSlug)
      .run()
      .catch((e) => logger.warn(MODULE, "ensureWebsiteRow insert", e));

    return {
      template: "retro_2004",
      unlockedTemplates: ["retro_2004"],
      unlockedAddons: [],
      customSlug: defaultSlug,
      announcement: null,
      sponsorBannerEnabled: false,
      visitorCount: 0,
      rawUnlockedTemplates: '["retro_2004"]',
      rawUnlockedAddons: "[]",
    };
  }

  let customSlug = existing.custom_slug;
  if (!customSlug) {
    customSlug = await generateUniqueTeamSlug(db, teamId, await teamName());
    await db
      .prepare("UPDATE team_websites SET custom_slug = ? WHERE team_id = ?")
      .bind(customSlug, teamId)
      .run()
      .catch((e) => logger.warn(MODULE, "backfill custom_slug", e));
  }

  return {
    template: (existing.template || "retro_2004") as ClubWebsiteTemplate,
    unlockedTemplates: parseJsonList<ClubWebsiteTemplate>(existing.unlocked_templates, ["retro_2004"], "unlocked templates"),
    unlockedAddons: parseJsonList<ClubWebsiteAddon>(existing.unlocked_addons, [], "unlocked addons"),
    customSlug,
    announcement: existing.announcement,
    sponsorBannerEnabled: existing.sponsor_banner_enabled === 1,
    visitorCount: existing.visitor_count || 0,
    rawUnlockedTemplates: existing.unlocked_templates,
    rawUnlockedAddons: existing.unlocked_addons,
  };
}

/** Veřejná část nastavení (bez interních JSON řetězců). */
function publicWebsite(w: WebsiteSettings) {
  return {
    template: w.template,
    unlockedTemplates: w.unlockedTemplates,
    unlockedAddons: w.unlockedAddons,
    customSlug: w.customSlug,
    announcement: w.announcement,
    sponsorBannerEnabled: w.sponsorBannerEnabled,
    visitorCount: w.visitorCount,
  };
}

// ── Přestupy: představovačky a rozlučky ─────────────────────────────────────
// Jména jsou vždy v 1. pádě (přístavek „tým X“, „obec Y“), aby věta seděla pro
// jakýkoli název. Kluby částky nezveřejňují, proto žádné číslo v textu.

interface TransferFlavor {
  headline: string;
  story: string;
  quote: string;
}

type FlavorContext = { p: string; team: string; village: string; other: string | null };

const ARRIVAL_FREE: Array<(c: FlavorContext) => TransferFlavor> = [
  ({ p, team, village }) => ({
    headline: `Volný hráč ${p} posiluje tým ${team}`,
    story: `Vedení klubu dotáhlo jednání s hráčem bez angažmá. ${p} podepsal a od příštího tréninku nastupuje s partou v obci ${village}.`,
    quote: "Kluci v kabině mě vzali parádně a zápisné do týmové kasy už mám zaplacené. Po zápase se těším na jedno orosené.",
  }),
  ({ p, team }) => ({
    headline: `${p} je naše nová posila`,
    story: `Bez odstupného a bez dlouhého vyjednávání. ${p} hledal nové angažmá a v týmu ${team} ho našel. Trenér si od něj slibuje víc konkurence v kádru.`,
    quote: "Chtěl jsem zase pořádně hrát. Tady je parta, která táhne za jeden provaz, a to mi stačí.",
  }),
  ({ p }) => ({
    headline: `Podpis po tréninku: ${p} je náš`,
    story: `Smlouva se podepisovala hned po tréninku na lavičce u kabin. ${p} přichází jako volný hráč a rovnou se zapojil do přípravy.`,
    quote: "Předseda mi podal propisku a řekl, ať to podepíšu, než si to rozmyslím. Tak jsem podepsal.",
  }),
];

const ARRIVAL_TRANSFER: Array<(c: FlavorContext) => TransferFlavor> = [
  ({ p, team, other }) => ({
    headline: `Nová posila: ${p} přichází ${other ? `z týmu ${other}` : "z jiného klubu"}`,
    story: `Vedení klubu ${team} dotáhlo jednání o přestupu. ${p} se hned zapojil do tréninku. Výši odstupného se kluby dohodly nezveřejňovat.`,
    quote: "Nabídka se nedala odmítnout. Je tu skvělá parta, výborný trávník a hlad po bodech.",
  }),
  ({ p, team, other }) => ({
    headline: `${p} mění dres, nově hraje za ${team}`,
    story: `Přestup je hotový. ${p} přichází ${other ? `z týmu ${other}` : "z jiného klubu"} a trenér s ním počítá už pro nejbližší zápas. O podmínkách přestupu kluby mlčí.`,
    quote: "Dlouho jsem nepřemýšlel. Chci hrát, chci dávat góly a chci, aby fanoušci odcházeli spokojení.",
  }),
  ({ p, other }) => ({
    headline: `Kabina se rozrůstá, přichází ${p}`,
    story: `${p} přichází ${other ? `z týmu ${other}` : "z jiného klubu"}. Spoluhráči ho přivítali tradičně, rundou v hospodě po prvním tréninku. Částku za přestup klub nezveřejňuje.`,
    quote: "Rundu jsem platil já, tak to tu chodí. Na hřišti to klukům vrátím.",
  }),
];

const DEPARTURE_RELEASED: Array<(c: FlavorContext) => TransferFlavor> = [
  ({ p, team, village }) => ({
    headline: `${p} v klubu končí, smlouva byla rozvázána`,
    story: `Po vzájemné dohodě končí ${p} v týmu ${team}. Za všechny odehrané zápasy a obětavost mu patří velké poděkování.`,
    quote: `V obci ${village} jsem zažil krásné fotbalové roky. Klukům budu dál držet palce.`,
  }),
  ({ p, team }) => ({
    headline: `Rozloučení: ${p} opouští kabinu`,
    story: `${p} se rozloučil se spoluhráči a kabinu opouští. Vedení klubu ${team} mu přeje hodně štěstí, ať už bude pokračovat kdekoli.`,
    quote: "Bylo to tu krásné. Dres si nechávám na památku a na zápasy se přijdu podívat.",
  }),
  ({ p, team }) => ({
    headline: `Konec v týmu ${team}: ${p} odchází`,
    story: `Klub a ${p} se dohodli na ukončení spolupráce. Odchází jako volný hráč a může si hledat nové angažmá.`,
    quote: "Nikomu nic nevyčítám. Fotbal mě baví dál, tak uvidíme, kde budu kopat příště.",
  }),
];

const DEPARTURE_TRANSFER: Array<(c: FlavorContext) => TransferFlavor> = [
  ({ p, team, other }) => ({
    headline: `Přestup je hotový: ${p} odchází ${other ? `do týmu ${other}` : "do jiného klubu"}`,
    story: `Klub ${team} oznamuje přestup. Výše odstupného nebyla po dohodě obou klubů zveřejněna. Vedení i spoluhráči přejí hráči ${p} hodně štěstí.`,
    quote: `Na roky v týmu ${team} nikdy nezapomenu. Děkuju fanouškům za podporu u zábradlí i v hospodě po zápase.`,
  }),
  ({ p, other }) => ({
    headline: `${p} míří ${other ? `do týmu ${other}` : "do jiného klubu"}`,
    story: `Odchod, který se dal čekat. ${p} dostal nabídku, která se neodmítá, a klub mu nebránil. O podmínkách přestupu se mlčí.`,
    quote: "Bylo to těžké rozhodnutí. Kluci, díky za všechno a ať vám to tam lítá.",
  }),
  ({ p, other }) => ({
    headline: `Sbohem a díky: ${p} odchází`,
    story: `${p} odchází ${other ? `do týmu ${other}` : "do jiného klubu"}. V kabině po něm zůstane prázdné místo na lavici i v kolektivu. Klub mu děkuje za odvedenou práci.`,
    quote: "Tenhle dres pro mě hodně znamenal. Až se potkáme na hřišti, šetřit vás nebudu.",
  }),
];

/** Krátký stabilní hash, aby stejný přestup měl při každém načtení stejný text. */
function stableHash(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function generateTransferFlavor(
  t: { direction: "in" | "out"; kind: string; playerId: string; date: string; playerName: string; otherTeamName: string | null },
  teamName: string,
  villageName: string,
  used: Map<unknown, Set<number>>,
): TransferFlavor {
  const pool =
    t.direction === "in"
      ? t.kind === "free_agent" || t.kind === "released" ? ARRIVAL_FREE : ARRIVAL_TRANSFER
      : t.kind === "released" ? DEPARTURE_RELEASED : DEPARTURE_TRANSFER;

  // Stejná šablona dvakrát pod sebou působí jako robot: první volnou bereme podle hashe.
  const taken = used.get(pool) ?? new Set<number>();
  used.set(pool, taken);
  let idx = stableHash(`${t.playerId}|${t.date}|${t.kind}`) % pool.length;
  for (let i = 0; i < pool.length && taken.has(idx); i++) idx = (idx + 1) % pool.length;
  taken.add(idx);

  return pool[idx]({ p: t.playerName, team: teamName, village: villageName, other: t.otherTeamName });
}

// ── Zápasy ───────────────────────────────────────────────────────────────────

function extractHighlights(rawEvents: unknown): ClubWebsiteMatchHighlight[] {
  let events: any[] = [];
  try {
    events = typeof rawEvents === "string" ? JSON.parse(rawEvents) : ((rawEvents as any[]) || []);
  } catch (e) {
    logger.warn(MODULE, "parse match events for highlights", e);
    events = [];
  }
  if (!Array.isArray(events)) return [];

  let keyMoments = events.filter((e) => {
    if (e.type === "goal") return true;
    if (e.type === "card" && (e.detail === "red" || e.detail === "yellow_red")) return true;
    if (e.type === "penalty") return true;
    if (e.type === "chance" && (
      e.detail === "břevno" ||
      e.detail === "tyč" ||
      e.detail === "penalty_missed" ||
      e.detail === "penalty_saved" ||
      e.description?.toLowerCase().includes("břevno") ||
      e.description?.toLowerCase().includes("tyč") ||
      e.description?.toLowerCase().includes("gólová") ||
      e.description?.toLowerCase().includes("tutovka")
    )) return true;
    return false;
  });

  if (keyMoments.length === 0) {
    keyMoments = events
      .filter((e) => e.type === "chance" || (e.type === "card" && e.detail === "yellow"))
      .slice(0, 5);
  }

  return keyMoments
    .sort((a, b) => (a.minute ?? 0) - (b.minute ?? 0))
    .map((e) => ({
      minute: e.minute ?? 0,
      type: e.type,
      isHome: e.teamId === 1,
      playerName: e.playerName || "Hráč",
      description: e.description || "",
      detail: e.detail,
      source: e.source,
    }));
}

const PLAYERS_SQL = `SELECT p.id, p.first_name, p.last_name, p.position, p.overall_rating, p.age, p.squad_number, p.avatar,
        COALESCE(SUM(ps.appearances), 0) as appearances,
        COALESCE(SUM(ps.goals), 0) as goals,
        COALESCE(SUM(ps.assists), 0) as assists,
        COALESCE(SUM(ps.clean_sheets), 0) as clean_sheets,
        COALESCE(SUM(ps.minutes_played), 0) as minutes_played
 FROM players p
 LEFT JOIN player_stats ps ON ps.player_id = p.id AND ps.team_id = p.team_id
   AND ps.season_id = (
     SELECT id FROM seasons
     ORDER BY CASE WHEN status = 'active' THEN 0 ELSE 1 END, number DESC
     LIMIT 1
   )
 WHERE p.team_id = ? AND (p.status IS NULL OR p.status = 'active')
 GROUP BY p.id
 ORDER BY CASE p.position
            WHEN 'GK' THEN 1
            WHEN 'DEF' THEN 2 WHEN 'CB' THEN 2 WHEN 'LB' THEN 2 WHEN 'RB' THEN 2 WHEN 'LWB' THEN 2 WHEN 'RWB' THEN 2
            WHEN 'MID' THEN 3 WHEN 'CM' THEN 3 WHEN 'LM' THEN 3 WHEN 'RM' THEN 3 WHEN 'CDM' THEN 3 WHEN 'CAM' THEN 3 WHEN 'DM' THEN 3 WHEN 'AM' THEN 3
            WHEN 'FWD' THEN 4 WHEN 'ST' THEN 4 WHEN 'CF' THEN 4 WHEN 'LW' THEN 4 WHEN 'RW' THEN 4
            ELSE 5 END,
          CASE WHEN p.squad_number IS NULL OR p.squad_number = 0 THEN 999 ELSE p.squad_number END ASC,
          p.overall_rating DESC`;

interface PlayerRow {
  id: string; first_name: string; last_name: string; position: string; overall_rating: number;
  age: number; squad_number: number | null; avatar: string;
  appearances: number; goals: number; assists: number; clean_sheets: number; minutes_played: number;
}

function parseAvatar(raw: unknown, what: string): Record<string, unknown> {
  if (raw && typeof raw === "object") return raw as Record<string, unknown>;
  if (typeof raw !== "string" || !raw) return {};
  try {
    return JSON.parse(raw);
  } catch (e) {
    logger.warn(MODULE, `parse ${what} avatar`, e);
    return {};
  }
}

function mapPlayer(p: PlayerRow) {
  return {
    id: p.id,
    firstName: p.first_name,
    lastName: p.last_name,
    position: p.position,
    positionName: formatPlayerPositionCZ(p.position),
    overallRating: p.overall_rating,
    age: p.age,
    squadNumber: p.squad_number,
    avatar: parseAvatar(p.avatar, "player"),
    stats: {
      appearances: p.appearances,
      goals: p.goals,
      assists: p.assists,
      cleanSheets: p.clean_sheets,
      minutesPlayed: p.minutes_played,
    },
  };
}

const UPCOMING_SQL = `SELECT m.id, m.round, sc.scheduled_at,
        ht.id as home_id, ht.name as home_name, ht.stadium_name as home_stadium, ht.primary_color as home_primary, ht.badge_pattern as home_badge,
        at.id as away_id, at.name as away_name, at.primary_color as away_primary, at.badge_pattern as away_badge
 FROM matches m
 LEFT JOIN season_calendar sc ON m.calendar_id = sc.id
 JOIN teams ht ON m.home_team_id = ht.id
 JOIN teams at ON m.away_team_id = at.id
 WHERE (m.home_team_id = ? OR m.away_team_id = ?) AND m.status = 'scheduled'
 ORDER BY (sc.scheduled_at IS NULL), sc.scheduled_at ASC, m.round ASC LIMIT 5`;

type PollChoice = "win" | "draw" | "loss";

async function loadPollVotes(db: D1Database, teamId: string, matchId: string) {
  const votes: Record<PollChoice, number> = { win: 0, draw: 0, loss: 0 };
  const rows = await db
    .prepare("SELECT choice, COUNT(*) AS n FROM team_website_poll_votes WHERE team_id = ? AND match_id = ? GROUP BY choice")
    .bind(teamId, matchId)
    .all<{ choice: PollChoice; n: number }>()
    .catch((e) => {
      logger.warn(MODULE, "load poll votes", e);
      return { results: [] as Array<{ choice: PollChoice; n: number }> };
    });
  for (const r of rows.results ?? []) {
    if (r.choice in votes) votes[r.choice] = r.n;
  }
  return votes;
}

// ── Fotky stadionu z 3D modelu ───────────────────────────────────────────────

/** Zvednout, když se 3D model stadionu viditelně změní: staré fotky pak všem klubům zneplatní. */
const STADIUM_PHOTO_RENDERER = "2026-10-06";
const STADIUM_PHOTO_MAX_BYTES = 3_000_000;

function teamInitials(name: string): string {
  return name.split(/\s+/).map((w) => w[0]).filter(Boolean).slice(0, 3).join("").toUpperCase();
}

function stadiumFacilitiesOut(stadium: any): Record<string, number> | undefined {
  if (!stadium) return undefined;
  return {
    changing_rooms: stadium.changing_rooms ?? 0,
    showers: stadium.showers ?? 0,
    refreshments: stadium.refreshments ?? 0,
    lighting: stadium.lighting ?? 0,
    stands: stadium.stands ?? 0,
    stand_main: stadium.stand_main ?? 0,
    stand_opposite: stadium.stand_opposite ?? 0,
    stand_goal_west: stadium.stand_goal_west ?? 0,
    stand_goal_east: stadium.stand_goal_east ?? 0,
    roof: stadium.roof ?? 0,
    ultras_stand: stadium.ultras_stand ?? 0,
    toilets: stadium.toilets ?? 0,
    parking: stadium.parking ?? 0,
    fence: stadium.fence ?? 0,
    entrance_gate: stadium.entrance_gate ?? 0,
    security: stadium.security ?? 0,
    cage: stadium.cage ?? 0,
    vip_box: stadium.vip_box ?? 0,
  };
}

function stadiumCustomizationOut(stadium: any): ClubWebsiteStadiumRender["customization"] | undefined {
  if (!stadium) return undefined;
  return {
    fenceColor: stadium.fence_color ?? null,
    standColor: stadium.stand_color ?? null,
    seatColor: stadium.seat_color ?? null,
    roofColor: stadium.roof_color ?? null,
    accentColor: stadium.accent_color ?? null,
    scoreboardLevel: stadium.scoreboard_level ?? 0,
    flagSize: stadium.flag_size ?? 0,
    ultrasText: stadium.ultras_text ?? null,
    ultrasBannerColor: stadium.ultras_banner_color ?? null,
    ultrasTextColor: stadium.ultras_text_color ?? null,
    flagColor: stadium.flag_color ?? null,
    mowingPattern: stadium.mowing_pattern ?? "stripes",
    netPattern: stadium.net_pattern ?? "white",
    netStyle: stadium.net_style ?? "loose",
    surroundSurface: stadium.surround_surface ?? "grass",
  };
}

interface StadiumRenderParts {
  team: {
    name: string; primary_color: string; secondary_color: string; badge_pattern: string | null;
    badge_primary_color: string | null; badge_secondary_color: string | null; badge_initials: string | null;
    badge_symbol: string | null; stadium_name: string | null;
  };
  stadium: any;
  extensions: Array<{ slot: string; kind: string; level: number }>;
  bannerSponsors: string[];
}

/**
 * Vstup pro 3D model stadionu a jeho otisk. Klient fotí přesně z těchto dat, takže
 * server i prohlížeč se shodnou, ke které podobě stadionu fotka patří. Stav trávníku
 * je zaokrouhlený na desítky, jinak by fotky zastaraly po každém zápase.
 */
async function buildStadiumRender(parts: StadiumRenderParts): Promise<{ version: string; render: ClubWebsiteStadiumRender }> {
  const { team, stadium } = parts;
  const render: ClubWebsiteStadiumRender = {
    pitchCondition: Math.round((stadium?.pitch_condition ?? 75) / 10) * 10,
    pitchType: stadium?.pitch_type ?? "natural",
    facilities: stadiumFacilitiesOut(stadium) ?? { changing_rooms: 1, stands: 1, stand_main: 1, fence: 1, entrance_gate: 1 },
    standExtensions: parts.extensions.map((e) => ({ slot: e.slot, kind: e.kind, level: e.level })),
    teamColor: team.primary_color || "#2D5F2D",
    secondaryColor: team.secondary_color || "#FFFFFF",
    badgePattern: team.badge_pattern || "shield",
    badgeInitials: team.badge_initials || teamInitials(team.name),
    badgeSymbol: team.badge_symbol,
    badgePrimary: team.badge_primary_color || team.primary_color || "#2D5F2D",
    badgeSecondary: team.badge_secondary_color || team.secondary_color || "#FFFFFF",
    stadiumName: team.stadium_name || team.name,
    sponsors: parts.bannerSponsors,
    customization: stadiumCustomizationOut(stadium) ?? {},
  };
  const version = (await sha256Hex(`${STADIUM_PHOTO_RENDERER}|${JSON.stringify(render)}`)).slice(0, 16);
  return { version, render };
}

function bannerSponsorNames(rows: Array<{ sponsor_name: string; category: string | null }>): string[] {
  return rows
    .filter((s) => s.category === "banner" || s.category === "stadium")
    .map((s) => s.sponsor_name)
    .filter(Boolean)
    .slice(0, 8);
}

/** Totéž jako GET /website, jen pro ověření nahrávané fotky (bez ostatních dat webu). */
async function loadStadiumRender(db: D1Database, teamId: string) {
  const [team, stadium, extensions, sponsors] = await Promise.all([
    db.prepare(
      `SELECT name, primary_color, secondary_color, badge_pattern, badge_primary_color, badge_secondary_color,
              badge_initials, badge_symbol, stadium_name
       FROM teams WHERE id = ?`,
    ).bind(teamId).first<StadiumRenderParts["team"]>(),
    db.prepare("SELECT * FROM stadiums WHERE team_id = ? LIMIT 1").bind(teamId).first<any>(),
    import("../stadium/extensions-db").then(({ loadExtensions }) => loadExtensions(db, teamId)),
    db.prepare("SELECT sponsor_name, category FROM sponsor_contracts WHERE team_id = ? AND status = 'active'")
      .bind(teamId).all<{ sponsor_name: string; category: string | null }>(),
  ]);
  if (!team) return null;
  return buildStadiumRender({
    team,
    stadium,
    extensions: (extensions || []) as Array<{ slot: string; kind: string; level: number }>,
    bannerSponsors: bannerSponsorNames(sponsors.results ?? []),
  });
}

function stadiumPhotoKey(teamId: string, viewpoint: string, version: string) {
  return `stadium-photo/${teamId}/${viewpoint}-${version}`;
}

function isStadiumPhotoViewpoint(v: string): v is StadiumPhotoViewpoint {
  return (STADIUM_PHOTO_VIEWPOINTS as readonly string[]).includes(v);
}

/** Pozná obrázek podle prvních bajtů (WebP, JPEG, PNG); hlavičce Content-Type nevěříme. */
function sniffImageType(bytes: Uint8Array): string | null {
  if (bytes.length > 12 && bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46
    && bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50) return "image/webp";
  if (bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes.length > 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return "image/png";
  return null;
}

// GET /api/teams/:id/website — veřejná data pro Klubový web (jen čtení, návštěvy nepočítá)
clubWebsiteRouter.get("/:id/website", async (c) => {
  const db = c.env.DB;
  const teamId = await resolveTeamId(db, c.req.param("id"));
  if (!teamId) return c.json({ error: "Klub nenalezen" }, 404);

  const team = await db.prepare(
    `SELECT t.id, t.name, t.primary_color, t.secondary_color, t.badge_pattern, t.jersey_pattern, t.stadium_name,
            t.away_primary_color, t.away_secondary_color, t.away_jersey_pattern,
            t.home_shorts_color, t.home_socks_color, t.away_shorts_color, t.away_socks_color,
            t.badge_primary_color, t.badge_secondary_color, t.badge_initials, t.badge_symbol,
            t.scarf_pattern, t.league_id,
            t.anthem_url, t.anthem_lyrics, t.anthem_title, t.anthem_style,
            t.stadium_nickname, t.stadium_built_year, t.stadium_specialita, t.stadium_tribuna_north, t.stadium_tribuna_south,
            t.team_nickname, t.club_motto, t.founding_year, t.founding_story, t.colors_meaning,
            v.name as village_name, v.district, v.region, v.population, v.size as village_size
     FROM teams t
     JOIN villages v ON t.village_id = v.id
     WHERE t.id = ?`,
  ).bind(teamId).first<{
    id: string; name: string; primary_color: string; secondary_color: string;
    badge_pattern: string; jersey_pattern: string; stadium_name: string;
    away_primary_color: string | null; away_secondary_color: string | null; away_jersey_pattern: string | null;
    home_shorts_color: string | null; home_socks_color: string | null;
    away_shorts_color: string | null; away_socks_color: string | null;
    badge_primary_color: string | null; badge_secondary_color: string | null; badge_initials: string | null;
    badge_symbol: string | null; scarf_pattern: string | null; league_id: string | null;
    anthem_url: string | null; anthem_lyrics: string | null; anthem_title: string | null; anthem_style: string | null;
    stadium_nickname: string | null; stadium_built_year: number | null; stadium_specialita: string | null;
    stadium_tribuna_north: string | null; stadium_tribuna_south: string | null;
    team_nickname: string | null; club_motto: string | null; founding_year: number | null;
    founding_story: string | null; colors_meaning: string | null;
    village_name: string; district: string; region: string; population: number; village_size: string;
  }>();
  if (!team) return c.json({ error: "Tým nenalezen" }, 404);

  const zaklad = c.env.API_BASE_URL || new URL(c.req.url).origin;
  const warnEmpty = <T>(what: string) => (e: unknown) => {
    logger.warn(MODULE, what, e);
    return { results: [] as T[] };
  };
  const warnNull = (what: string) => (e: unknown) => {
    logger.warn(MODULE, what, e);
    return null;
  };

  type SponsorRow = { sponsor_name: string; category: string | null };
  type ChantRow = { id: string; kind: string; text: string; duvod: string; sila: number; audio_vybrana: string | null };
  type StaffRow = {
    id: string; role: string; profession: string; first_name: string; last_name: string;
    gender: string; age: number; avatar: string; description: string | null;
  };
  type ConcessionRow = { product_key: string; quality_level: number; sell_price: number };
  type InterviewRow = {
    id: string; game_week: number; kind: string | null; questions: string; answers: string | null;
    created_at: string; manager_name: string | null;
  };
  type NewsRow = { id: string; type: string; headline: string; body: string; created_at: string };

  // Všechno, co nezávisí na jiném dotazu, jde naráz. Dřív to bylo ~25 dotazů za sebou (1–2 s).
  const [
    stadium, extRows, sponsorRows, chantsRows, mascotRow, website, managerRow, staffRows, playersRows,
    u21Team, recentRows, upcomingRows, concessionRows, fansRow, interviewRows, newsRows, transferRows, league,
    storedPhotoRows, history,
  ] = await Promise.all([
    db.prepare("SELECT * FROM stadiums WHERE team_id = ? LIMIT 1").bind(teamId).first<any>().catch(warnNull("fetch stadium")),
    import("../stadium/extensions-db")
      .then(({ loadExtensions }) => loadExtensions(db, teamId))
      .catch((e) => {
        logger.warn(MODULE, "load stand extensions", e);
        return [];
      }),
    db.prepare("SELECT sponsor_name, category FROM sponsor_contracts WHERE team_id = ? AND status = 'active'")
      .bind(teamId).all<SponsorRow>().catch(warnEmpty<SponsorRow>("fetch sponsors")),
    db.prepare(
      `SELECT id, kind, text, duvod, sila, audio_vybrana
       FROM fan_chants
       WHERE team_id = ? AND status = 'zpiva' AND audio_a IS NOT NULL
       ORDER BY (kind = 'domov') DESC, sila DESC LIMIT 5`,
    ).bind(teamId).all<ChantRow>().catch(warnEmpty<ChantRow>("fetch chants")),
    db.prepare("SELECT name, image_url, story FROM team_mascots WHERE team_id = ? AND is_selected = 1 LIMIT 1")
      .bind(teamId).first<{ name: string; image_url: string | null; story: string | null }>()
      .catch(warnNull("fetch mascot")),
    ensureWebsiteRow(db, teamId),
    db.prepare(
      `SELECT m.name, m.age, m.reputation, m.avatar, m.licence_level, m.bio, m.birthplace
       FROM managers m JOIN teams t ON t.user_id = m.user_id WHERE t.id = ?`,
    ).bind(teamId).first<{
      name: string; age: number; reputation: number; avatar: string;
      licence_level: number | null; bio: string | null; birthplace: string | null;
    }>().catch(warnNull("fetch manager")),
    db.prepare(
      `SELECT id, role, profession, first_name, last_name, gender, age, avatar, description
       FROM staff_members WHERE team_id = ? ORDER BY role ASC`,
    ).bind(teamId).all<StaffRow>().catch(warnEmpty<StaffRow>("fetch staff")),
    db.prepare(PLAYERS_SQL).bind(teamId).all<PlayerRow>().catch(warnEmpty<PlayerRow>("fetch players")),
    db.prepare("SELECT id, name FROM teams WHERE parent_team_id = ? AND team_type = 'u21' LIMIT 1")
      .bind(teamId).first<{ id: string; name: string }>().catch(warnNull("fetch u21 team")),
    db.prepare(
      `SELECT m.id, m.round, m.home_score, m.away_score, m.events, m.simulated_at,
              ht.id as home_id, ht.name as home_name, ht.primary_color as home_primary, ht.badge_pattern as home_badge,
              at.id as away_id, at.name as away_name, at.primary_color as away_primary, at.badge_pattern as away_badge
       FROM matches m
       JOIN teams ht ON m.home_team_id = ht.id
       JOIN teams at ON m.away_team_id = at.id
       WHERE (m.home_team_id = ? OR m.away_team_id = ?) AND m.status = 'simulated'
       ORDER BY m.simulated_at DESC LIMIT 3`,
    ).bind(teamId, teamId).all<any>().catch(warnEmpty<any>("fetch recent matches")),
    db.prepare(UPCOMING_SQL).bind(teamId, teamId).all<any>().catch(warnEmpty<any>("fetch upcoming matches")),
    db.prepare("SELECT product_key, quality_level, sell_price FROM concession_products WHERE team_id = ?")
      .bind(teamId).all<ConcessionRow>().catch(warnEmpty<ConcessionRow>("fetch concession products")),
    db.prepare("SELECT base_ticket_price, satisfaction FROM fans WHERE team_id = ? LIMIT 1")
      .bind(teamId).first<{ base_ticket_price: number; satisfaction: number }>()
      .catch(warnNull("fetch fans for ticket price")),
    db.prepare(
      `SELECT ci.id, ci.game_week, ci.kind, ci.questions, ci.answers, ci.created_at, m.name AS manager_name
       FROM coach_interviews ci
       LEFT JOIN managers m ON m.id = ci.manager_id
       WHERE ci.team_id = ? AND ci.status = 'answered'
       ORDER BY ci.created_at DESC LIMIT 6`,
    ).bind(teamId).all<InterviewRow>().catch(warnEmpty<InterviewRow>("fetch coach interviews")),
    // Jen veřejné typy zpráv. Ostatní nesou surový JSON s interními poli (nálada, vztahy),
    // ceny z přestupové listiny nebo výhry v sázkovce. Nový typ se na web dostane jen vědomě.
    db.prepare(
      `SELECT id, type, headline, body, created_at FROM news
       WHERE team_id = ? AND type IN ('promotion', 'manager_arrival', 'manager_feud', 'legend_farewell')
       ORDER BY created_at DESC LIMIT 4`,
    )
      .bind(teamId).all<NewsRow>().catch(warnEmpty<NewsRow>("fetch news")),
    import("../transfers/transfer-overview")
      .then(({ loadTransferOverview }) => loadTransferOverview(db, teamId, 8))
      .catch((e) => {
        logger.warn(MODULE, "load transfer overview", e);
        return [];
      }),
    team.league_id
      ? db.prepare("SELECT id, name FROM leagues WHERE id = ?").bind(team.league_id).first<{ id: string; name: string }>()
        .catch(warnNull("fetch league"))
      : Promise.resolve(null),
    db.prepare("SELECT viewpoint, version FROM team_stadium_photos WHERE team_id = ?")
      .bind(teamId).all<{ viewpoint: string; version: string }>()
      .catch(warnEmpty<{ viewpoint: string; version: string }>("fetch stadium photos")),
    import("./club-website-history")
      .then(({ loadClubHistory }) => loadClubHistory(db, teamId))
      .catch((e) => {
        logger.warn(MODULE, "load club history", e);
        return null;
      }),
  ]);

  // ── Druhá vlna: dotazy, které potřebují výsledek první ──
  const upcomingMatches = (upcomingRows.results ?? []).map((m: any) => ({
    id: m.id as string,
    round: m.round as number,
    isHome: m.home_id === teamId,
    stadiumName: (m.home_stadium || team.stadium_name) as string,
    scheduledAt: m.scheduled_at as string | null,
    opponent: m.home_id === teamId
      ? { id: m.away_id, name: m.away_name, primaryColor: m.away_primary, badge: m.away_badge }
      : { id: m.home_id, name: m.home_name, primaryColor: m.home_primary, badge: m.home_badge },
  }));
  const next = upcomingMatches[0] ?? null;

  const [u21Rows, cupRows, rivalry, standingsRaw, pollVotes] = await Promise.all([
    u21Team
      ? db.prepare(PLAYERS_SQL).bind(u21Team.id).all<PlayerRow>().catch(warnEmpty<PlayerRow>("fetch u21 players"))
      : Promise.resolve({ results: [] as PlayerRow[] }),
    (recentRows.results ?? []).length === 0
      ? db.prepare(
        `SELECT cm.id, cm.round, cm.home_score, cm.away_score, cm.events, cm.simulated_at,
                hct.team_id as home_id, hct.name as home_name, hct.primary_color as home_primary,
                act.team_id as away_id, act.name as away_name, act.primary_color as away_primary
         FROM cup_matches cm
         JOIN cup_teams hct ON cm.home_cup_team_id = hct.id
         JOIN cup_teams act ON cm.away_cup_team_id = act.id
         WHERE (hct.team_id = ? OR act.team_id = ?) AND cm.status = 'simulated'
         ORDER BY cm.simulated_at DESC LIMIT 3`,
      ).bind(teamId, teamId).all<any>().catch(warnEmpty<any>("fetch recent cup matches"))
      : Promise.resolve({ results: [] as any[] }),
    next
      ? db.prepare("SELECT 1 FROM fan_rivalries WHERE (team_a = ? AND team_b = ?) OR (team_a = ? AND team_b = ?) LIMIT 1")
        .bind(teamId, next.opponent.id, next.opponent.id, teamId).first()
        .catch(warnNull("fetch fan rivalry"))
      : Promise.resolve(null),
    team.league_id
      ? Promise.all([
        import("../stats/standings").then(({ calculateStandings }) => calculateStandings(db, team.league_id as string)),
        db.prepare("SELECT id, name FROM teams WHERE league_id = ?").bind(team.league_id).all<{ id: string; name: string }>(),
      ]).catch((e) => {
        logger.warn(MODULE, "fetch league standings", e);
        return null;
      })
      : Promise.resolve(null),
    next ? loadPollVotes(db, teamId, next.id) : Promise.resolve(null),
  ]);

  const recentMatches: ClubWebsiteMatchSummary[] = (recentRows.results ?? []).map((row: any) => ({
    id: row.id,
    round: row.round,
    isHome: row.home_id === teamId,
    scoreHome: row.home_score,
    scoreAway: row.away_score,
    opponent: row.home_id === teamId
      ? { id: row.away_id, name: row.away_name, primaryColor: row.away_primary, badge: row.away_badge }
      : { id: row.home_id, name: row.home_name, primaryColor: row.home_primary, badge: row.home_badge },
    date: row.simulated_at,
    highlights: extractHighlights(row.events),
  }));
  // Pohárové zápasy jen jako záloha, dokud klub nemá žádný ligový
  for (const row of cupRows.results ?? []) {
    recentMatches.push({
      id: row.id,
      round: row.round,
      isHome: row.home_id === teamId,
      scoreHome: row.home_score,
      scoreAway: row.away_score,
      opponent: row.home_id === teamId
        ? { id: row.away_id || "", name: row.away_name, primaryColor: row.away_primary || "#D94032", badge: "shield" }
        : { id: row.home_id || "", name: row.home_name, primaryColor: row.home_primary || "#2D5F2D", badge: "shield" },
      date: row.simulated_at,
      highlights: extractHighlights(row.events),
    });
  }

  let leagueStandings: Array<{
    pos: number; teamId: string; teamName: string; played: number; won: number; drawn: number; lost: number;
    gf: number; ga: number; points: number; isCurrentTeam: boolean;
  }> = [];
  if (standingsRaw) {
    const [st, leagueTeams] = standingsRaw;
    const teamNameMap = new Map((leagueTeams.results || []).map((t) => [t.id, t.name]));
    leagueStandings = st.map((s) => ({
      pos: s.pos,
      teamId: s.teamId,
      teamName: teamNameMap.get(s.teamId) || "Neznámý tým",
      played: s.played,
      won: s.wins,
      drawn: s.draws,
      lost: s.losses,
      gf: s.gf,
      ga: s.ga,
      points: s.points,
      isCurrentTeam: s.teamId === teamId,
    }));
  }

  // Sponzoři: generální partner na dresu, název stadionu, bannery kolem hřiště
  const sponsors = sponsorRows.results ?? [];
  const mainSponsor = sponsors.find((s) => s.category === "main" || s.category === null)?.sponsor_name ?? null;
  const stadiumNamingSponsor = sponsors.find((s) => s.category === "stadium")?.sponsor_name ?? null;
  const bannerSponsors = bannerSponsorNames(sponsors);

  // Fotky stadionu: platí jen ty, které patří k aktuální podobě stadionu
  const stadiumPhoto = await buildStadiumRender({
    team,
    stadium,
    extensions: (extRows || []) as Array<{ slot: string; kind: string; level: number }>,
    bannerSponsors,
  });
  const photos: Partial<Record<StadiumPhotoViewpoint, string>> = {};
  for (const row of storedPhotoRows.results ?? []) {
    if (row.version === stadiumPhoto.version && isStadiumPhotoViewpoint(row.viewpoint)) {
      photos[row.viewpoint] = `${zaklad}/api/teams/${teamId}/website/stadium-photo/${row.viewpoint}?v=${row.version}`;
    }
  }

  // Bufet: kvalita 0 = produkt se neprodává, na webu ho nesmíme nabízet
  const { CONCESSION_CATALOG } = await import("../season/concession-catalog");
  const concession = (key: "beer" | "sausage" | "lemonade", fallbackName: string, fallbackPrice: number) => {
    const row = (concessionRows.results ?? []).find((r) => r.product_key === key);
    if (!row) return { name: fallbackName, price: fallbackPrice };
    if (row.quality_level <= 0) return { name: null, price: null };
    return { name: CONCESSION_CATALOG[key].tiers[row.quality_level]?.label ?? fallbackName, price: row.sell_price };
  };
  const beer = concession("beer", "Točené pivo 10°", 25);
  const sausage = concession("sausage", "Klobása z udírny", 30);
  const lemonade = concession("lemonade", "Točená malinovka", 15);

  // Vstupné: stejný výpočet jako tržby ze zápasu (finance-processor)
  const { calculateFacilityEffects } = await import("../stadium/stadium-generator");
  const facilityFx = calculateFacilityEffects(stadiumFacilityLevels(stadium));
  const adultTicketPrice = matchTicketPrice({
    userBasePrice: fansRow?.base_ticket_price ?? 0,
    villageBasePrice: getBaseTicketPrice(mapVillageSize(team.village_size)),
    ticketPriceBonus: facilityFx.ticketPriceBonus,
    satisfaction: fansRow?.satisfaction ?? 50,
  });
  const clubCapacity = stadium
    ? stadium.capacity + calculateFacilityEffects({ ...standFacilities(stadium), vip_box: stadium.vip_box ?? 0 }).capacityBonus
    : null;

  const interviews = (interviewRows.results ?? []).map((r) => ({
    id: r.id,
    gameWeek: r.game_week,
    kind: r.kind,
    managerName: r.manager_name,
    questions: parseJsonList<string>(r.questions, [], "interview questions"),
    answers: r.answers ? parseJsonList<string>(r.answers, [], "interview answers") : [],
    createdAt: r.created_at,
  }));

  const usedFlavors = new Map<unknown, Set<number>>();
  const transfers = transferRows.map((t, i) => {
    const flavor = generateTransferFlavor(t, team.name, team.village_name, usedFlavors);
    return {
      id: `${t.playerId}-${t.date}-${t.direction}-${i}`,
      direction: t.direction,
      kind: t.kind,
      playerId: t.playerId,
      playerName: t.playerName,
      otherTeamId: t.otherTeamId,
      otherTeamName: t.otherTeamName,
      date: t.date,
      seasonNumber: t.seasonNumber,
      headline: flavor.headline,
      story: flavor.story,
      quote: flavor.quote,
    };
  });

  return c.json({
    team: {
      id: team.id,
      name: team.name,
      primaryColor: team.primary_color,
      secondaryColor: team.secondary_color,
      badgePattern: team.badge_pattern,
      jerseyPattern: team.jersey_pattern,
      village: {
        name: team.village_name,
        district: team.district,
        region: team.region,
        population: team.population,
      },
      identity: {
        nickname: team.team_nickname,
        motto: team.club_motto,
        foundingYear: team.founding_year,
        foundingStory: team.founding_story,
        colorsMeaning: team.colors_meaning,
      },
      stadium: {
        name: team.stadium_name,
        capacity: clubCapacity,
        pitchCondition: stadium?.pitch_condition ?? 75,
        pitchType: stadium?.pitch_type ?? "natural",
        nickname: team.stadium_nickname,
        builtYear: team.stadium_built_year,
        specialita: team.stadium_specialita,
        tribunaNorth: team.stadium_tribuna_north,
        tribunaSouth: team.stadium_tribuna_south,
        namingSponsor: stadiumNamingSponsor,
        facilities: stadiumFacilitiesOut(stadium),
        customization: stadiumCustomizationOut(stadium),
        standExtensions: (extRows || []).map((e: any) => ({
          slot: e.slot,
          kind: e.kind,
          level: e.level,
        })),
        sponsors: bannerSponsors,
      },
      jersey: {
        pattern: team.jersey_pattern,
        homePrimary: team.primary_color,
        homeSecondary: team.secondary_color,
        awayPrimary: team.away_primary_color,
        awaySecondary: team.away_secondary_color,
        awayPattern: team.away_jersey_pattern,
        sponsor: mainSponsor,
        homeShortsColor: team.home_shorts_color,
        homeSocksColor: team.home_socks_color,
        awayShortsColor: team.away_shorts_color,
        awaySocksColor: team.away_socks_color,
      },
      badge: {
        pattern: team.badge_pattern,
        primary: team.badge_primary_color ?? team.primary_color,
        secondary: team.badge_secondary_color ?? team.secondary_color,
        customPrimary: team.badge_primary_color,
        customSecondary: team.badge_secondary_color,
        customInitials: team.badge_initials,
        symbol: team.badge_symbol,
      },
      scarfPattern: team.scarf_pattern ?? "classic",
      anthem: {
        url: team.anthem_url,
        lyrics: team.anthem_lyrics,
        title: team.anthem_title,
        style: team.anthem_style,
      },
      chants: (chantsRows.results ?? []).map((r) => ({
        id: r.id, kind: r.kind, text: r.text, duvod: r.duvod, sila: r.sila,
        url: `${zaklad}/api/choraly/${r.id}/audio?v=${r.audio_vybrana ?? "a"}`,
      })),
      mascot: {
        name: mascotRow?.name ?? null,
        imageUrl: mascotRow?.image_url ?? null,
        story: mascotRow?.story ?? null,
      },
      league: league ? { id: league.id, name: league.name } : null,
    },
    website: publicWebsite(website),
    manager: managerRow ? {
      name: managerRow.name,
      age: managerRow.age,
      reputation: managerRow.reputation,
      avatar: parseAvatar(managerRow.avatar, "manager"),
      licence: managerRow.licence_level === 4 ? "PRO" : managerRow.licence_level === 3 ? "UEFA A" : managerRow.licence_level === 2 ? "UEFA B" : managerRow.licence_level === 1 ? "UEFA C" : "Bez licence",
      bio: managerRow.bio,
      birthplace: managerRow.birthplace,
    } : null,
    staff: (staffRows.results ?? []).map((s) => ({
      id: s.id,
      role: s.role,
      profession: s.profession,
      firstName: s.first_name,
      lastName: s.last_name,
      gender: s.gender,
      age: s.age,
      avatar: parseAvatar(s.avatar, "staff"),
      description: s.description,
    })),
    roster: {
      aTeam: (playersRows.results ?? []).map(mapPlayer),
      u21Team: (u21Rows.results ?? []).map(mapPlayer),
    },
    matches: {
      lastMatch: recentMatches[0] ?? null,
      recentMatches,
      upcomingMatches,
      standings: leagueStandings,
      nextMatch: next ? { ...next, isRival: !!rivalry } : null,
    },
    poll: next && pollVotes ? { matchId: next.id, votes: pollVotes } : null,
    concessions: {
      beerPrice: beer.price,
      sausagePrice: sausage.price,
      lemonadePrice: lemonade.price,
      beerName: beer.name,
      sausageName: sausage.name,
      lemonadeName: lemonade.name,
    },
    tickets: {
      adultPrice: adultTicketPrice,
      price: adultTicketPrice,
    },
    stadiumPhotos: { version: stadiumPhoto.version, render: stadiumPhoto.render, photos },
    history,
    interviews,
    news: newsRows.results ?? [],
    transfers,
  });
});

// PUT /api/teams/:id/website/stadium-photo/:viewpoint?version=… — fotka z 3D modelu, nahrává jen vlastník.
// Prohlížeč vlastníka stadion vyfotí a návštěvníci pak dostanou hotový obrázek bez 3D výpočtu.
clubWebsiteRouter.put("/:id/website/stadium-photo/:viewpoint", async (c) => {
  const teamId = c.req.param("id");
  const viewpoint = c.req.param("viewpoint");
  const version = c.req.query("version") ?? "";
  if (!isStadiumPhotoViewpoint(viewpoint)) return c.json({ error: "Neznámý úhel fotky" }, 400);

  const auth = await checkTeamAuth(c, teamId);
  if ("error" in auth) return c.json({ error: auth.error }, auth.status as any);

  const current = await loadStadiumRender(c.env.DB, teamId);
  if (!current) return c.json({ error: "Tým nenalezen" }, 404);
  if (current.version !== version) {
    return c.json({ error: "Stadion se mezitím změnil, fotka už neodpovídá" }, 409);
  }

  const body = new Uint8Array(await c.req.arrayBuffer());
  if (body.byteLength < 1000 || body.byteLength > STADIUM_PHOTO_MAX_BYTES) {
    return c.json({ error: "Fotka má nečekanou velikost" }, 400);
  }
  const contentType = sniffImageType(body);
  if (!contentType) return c.json({ error: "Soubor není obrázek" }, 400);

  const previous = await c.env.DB.prepare("SELECT version FROM team_stadium_photos WHERE team_id = ? AND viewpoint = ?")
    .bind(teamId, viewpoint).first<{ version: string }>();

  await c.env.SEED_DATA.put(stadiumPhotoKey(teamId, viewpoint, version), body, { httpMetadata: { contentType } });
  await c.env.DB.prepare(
    `INSERT INTO team_stadium_photos (team_id, viewpoint, version, content_type, created_at)
     VALUES (?, ?, ?, ?, datetime('now'))
     ON CONFLICT(team_id, viewpoint) DO UPDATE SET version = excluded.version, content_type = excluded.content_type, created_at = excluded.created_at`,
  ).bind(teamId, viewpoint, version, contentType).run();

  if (previous && previous.version !== version) {
    await c.env.SEED_DATA.delete(stadiumPhotoKey(teamId, viewpoint, previous.version))
      .catch((e) => logger.warn(MODULE, "delete outdated stadium photo", e));
  }

  return c.json({
    ok: true,
    url: `${c.env.API_BASE_URL || new URL(c.req.url).origin}/api/teams/${teamId}/website/stadium-photo/${viewpoint}?v=${version}`,
  });
});

// GET /api/teams/:id/website/stadium-photo/:viewpoint — veřejná fotka stadionu
clubWebsiteRouter.get("/:id/website/stadium-photo/:viewpoint", async (c) => {
  const teamId = c.req.param("id");
  const viewpoint = c.req.param("viewpoint");
  if (!isStadiumPhotoViewpoint(viewpoint)) return c.json({ error: "Neznámý úhel fotky" }, 400);

  const row = await c.env.DB.prepare("SELECT version, content_type FROM team_stadium_photos WHERE team_id = ? AND viewpoint = ?")
    .bind(teamId, viewpoint).first<{ version: string; content_type: string }>()
    .catch((e) => {
      logger.warn(MODULE, "lookup stadium photo", e);
      return null;
    });
  if (!row) return c.json({ error: "Fotka zatím není" }, 404);

  const obj = await c.env.SEED_DATA.get(stadiumPhotoKey(teamId, viewpoint, row.version));
  if (!obj) return c.json({ error: "Fotka zatím není" }, 404);

  // Adresa s ?v= ukazuje na konkrétní verzi, ta se už nikdy nezmění
  const immutable = c.req.query("v") === row.version;
  return new Response(obj.body, {
    headers: {
      "Content-Type": row.content_type || "image/webp",
      "Cache-Control": immutable ? "public, max-age=31536000, immutable" : "public, max-age=300",
    },
  });
});

// POST /api/teams/:id/website/visit — návštěva veřejného webu. Volá ji jen prohlížeč
// návštěvníka (jednou za relaci), ne serverové vykreslení, náhledy ani administrace.
clubWebsiteRouter.post("/:id/website/visit", async (c) => {
  const teamId = await resolveTeamId(c.env.DB, c.req.param("id"));
  if (!teamId) return c.json({ error: "Klub nenalezen" }, 404);
  await ensureWebsiteRow(c.env.DB, teamId);
  const row = await c.env.DB
    .prepare("UPDATE team_websites SET visitor_count = visitor_count + 1 WHERE team_id = ? RETURNING visitor_count")
    .bind(teamId)
    .first<{ visitor_count: number }>()
    .catch((e) => {
      logger.warn(MODULE, "increment visitor count", e);
      return null;
    });
  if (!row) return c.json({ error: "Návštěvu se nepodařilo započítat" }, 500);
  return c.json({ ok: true, visitorCount: row.visitor_count });
});

async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

// POST /api/teams/:id/website/poll — hlas v anketě k příštímu zápasu (jeden na návštěvníka)
clubWebsiteRouter.post("/:id/website/poll", async (c) => {
  const db = c.env.DB;
  const teamId = await resolveTeamId(db, c.req.param("id"));
  if (!teamId) return c.json({ error: "Klub nenalezen" }, 404);

  const body = (await c.req.json().catch((e) => {
    logger.warn(MODULE, "parse poll body", e);
    return null;
  })) as { matchId?: string; choice?: string } | null;
  const choice = body?.choice;
  if (!body?.matchId || (choice !== "win" && choice !== "draw" && choice !== "loss")) {
    return c.json({ error: "Neplatný hlas" }, 400);
  }

  // Hlasovat jde jen o příštím zápase klubu, ne o libovolném ID
  const next = await db.prepare(UPCOMING_SQL).bind(teamId, teamId).first<{ id: string }>();
  if (!next || next.id !== body.matchId) {
    return c.json({ error: "Anketa k tomuto zápasu už je uzavřená" }, 400);
  }

  // Jeden hlas na IP adresu a zápas. User-Agent sem nepatří: jde měnit libovolně,
  // takže by jedna IP mohla hlasovat donekonečna. Domácnost za jednou IP má holt jeden hlas.
  const ip = c.req.header("cf-connecting-ip");
  if (!ip) return c.json({ error: "Hlas se nepodařilo ověřit" }, 400);
  const voter = await sha256Hex(`${ip}|${teamId}|${next.id}`);
  const res = await db
    .prepare("INSERT OR IGNORE INTO team_website_poll_votes (team_id, match_id, voter, choice) VALUES (?, ?, ?, ?)")
    .bind(teamId, next.id, voter, choice)
    .run();

  const votes = await loadPollVotes(db, teamId, next.id);
  return c.json({ ok: true, alreadyVoted: (res.meta?.changes ?? 0) === 0, votes });
});

// ── Správa webu (jen vlastník) ───────────────────────────────────────────────

async function checkTeamAuth(c: Context<{ Bindings: Bindings }>, teamId: string) {
  const authHeader = c.req.header("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return { error: "Nepřihlášen", status: 401 };
  const token = authHeader.slice(7);
  const session = await getSession(c.env.SESSION_KV, token);
  if (!session) return { error: "Neplatná session", status: 401 };

  const team = await c.env.DB.prepare("SELECT user_id, budget, game_date, name FROM teams WHERE id = ?")
    .bind(teamId).first<{ user_id: string; budget: number; game_date: string; name: string }>();
  if (!team) return { error: "Tým nenalezen", status: 404 };
  if (team.user_id !== session.userId) return { error: "Přístup odepřen", status: 403 };

  return { team, session };
}

/**
 * Odemkne položku a strhne peníze. Odemčení jde jako první a podmíněně (porovná uložený
 * seznam), takže dvojklik nebo dvě karty nezaplatí stejnou věc dvakrát. Když platba
 * selže, odemčení se vrátí.
 */
async function purchaseUnlock(
  db: D1Database,
  opts: {
    teamId: string;
    column: "unlocked_templates" | "unlocked_addons";
    rawBefore: string;
    after: string[];
    extraSet: string;
    extraBinds: unknown[];
    extraRevert: string;
    extraRevertBinds: unknown[];
    price: number;
    description: string;
    gameDate: string;
  },
): Promise<{ ok: true } | { ok: false; status: 400 | 409; error: string }> {
  const claim = await db
    .prepare(`UPDATE team_websites SET ${opts.column} = ?${opts.extraSet}, updated_at = datetime('now') WHERE team_id = ? AND ${opts.column} = ?`)
    .bind(JSON.stringify(opts.after), ...opts.extraBinds, opts.teamId, opts.rawBefore)
    .run();
  if ((claim.meta?.changes ?? 0) !== 1) {
    return { ok: false, status: 409, error: "Nákup se právě zpracovává. Obnov stránku a zkontroluj, jestli už proběhl." };
  }

  if (opts.price <= 0) return { ok: true };
  try {
    await recordTransaction(db, opts.teamId, "club_website", -opts.price, opts.description, opts.gameDate);
    return { ok: true };
  } catch (e) {
    logger.warn(MODULE, "club website purchase payment failed, reverting unlock", e);
    await db
      .prepare(`UPDATE team_websites SET ${opts.column} = ?${opts.extraRevert} WHERE team_id = ?`)
      .bind(opts.rawBefore, ...opts.extraRevertBinds, opts.teamId)
      .run()
      .catch((err) => logger.error(MODULE, "revert club website unlock after failed payment", err));
    const msg = e instanceof Error && e.message.startsWith("BUDGET_BLOCKED")
      ? "Klub má záporný rozpočet, nákupy jsou zablokované."
      : "Platbu se nepodařilo provést.";
    return { ok: false, status: 400, error: msg };
  }
}

// POST /api/teams/:id/website/buy-template
clubWebsiteRouter.post("/:id/website/buy-template", async (c) => {
  const teamId = c.req.param("id");
  const auth = await checkTeamAuth(c, teamId);
  if ("error" in auth) return c.json({ error: auth.error }, auth.status as any);

  const body = (await c.req.json().catch((e) => {
    logger.warn(MODULE, "parse buy-template body", e);
    return null;
  })) as { template?: ClubWebsiteTemplate } | null;
  const templateId = body?.template;
  if (!templateId || !(templateId in CLUB_WEBSITE_TEMPLATES)) {
    return c.json({ error: "Neplatná šablona" }, 400);
  }

  const def = CLUB_WEBSITE_TEMPLATES[templateId];
  const web = await ensureWebsiteRow(c.env.DB, teamId);

  if (web.unlockedTemplates.includes(templateId)) {
    await c.env.DB.prepare("UPDATE team_websites SET template = ?, updated_at = datetime('now') WHERE team_id = ?")
      .bind(templateId, teamId).run();
    return c.json({ ok: true, activeTemplate: templateId, message: "Šablona aktivována" });
  }

  if (auth.team.budget < def.price) {
    return c.json({ error: `Nedostatek financí. Potřebuješ ${def.price.toLocaleString("cs")} Kč.` }, 400);
  }

  const newUnlocked = [...web.unlockedTemplates, templateId];
  const result = await purchaseUnlock(c.env.DB, {
    teamId,
    column: "unlocked_templates",
    rawBefore: web.rawUnlockedTemplates,
    after: newUnlocked,
    extraSet: ", template = ?",
    extraBinds: [templateId],
    extraRevert: ", template = ?",
    extraRevertBinds: [web.template],
    price: def.price,
    description: `Koupě šablony webu: ${def.name}`,
    gameDate: auth.team.game_date || new Date().toISOString().slice(0, 10),
  });
  if (!result.ok) return c.json({ error: result.error }, result.status);

  return c.json({
    ok: true,
    activeTemplate: templateId,
    unlockedTemplates: newUnlocked,
    message: `Šablona ${def.name} byla zakoupena a aktivována!`,
  });
});

// POST /api/teams/:id/website/select-template
clubWebsiteRouter.post("/:id/website/select-template", async (c) => {
  const teamId = c.req.param("id");
  const auth = await checkTeamAuth(c, teamId);
  if ("error" in auth) return c.json({ error: auth.error }, auth.status as any);

  const body = (await c.req.json().catch((e) => {
    logger.warn(MODULE, "parse select-template body", e);
    return null;
  })) as { template?: ClubWebsiteTemplate } | null;
  const templateId = body?.template;
  if (!templateId || !(templateId in CLUB_WEBSITE_TEMPLATES)) {
    return c.json({ error: "Neplatná šablona" }, 400);
  }

  const web = await ensureWebsiteRow(c.env.DB, teamId);
  if (!web.unlockedTemplates.includes(templateId)) {
    return c.json({ error: "Tuto šablonu ještě nemáš zakoupenou" }, 400);
  }

  await c.env.DB.prepare("UPDATE team_websites SET template = ?, updated_at = datetime('now') WHERE team_id = ?")
    .bind(templateId, teamId).run();

  return c.json({ ok: true, activeTemplate: templateId });
});

// POST /api/teams/:id/website/buy-addon
clubWebsiteRouter.post("/:id/website/buy-addon", async (c) => {
  const teamId = c.req.param("id");
  const auth = await checkTeamAuth(c, teamId);
  if ("error" in auth) return c.json({ error: auth.error }, auth.status as any);

  const body = (await c.req.json().catch((e) => {
    logger.warn(MODULE, "parse buy-addon body", e);
    return null;
  })) as { addon?: ClubWebsiteAddon } | null;
  const addonId = body?.addon;
  if (!addonId || !(addonId in CLUB_WEBSITE_ADDONS)) {
    return c.json({ error: "Neplatný doplněk" }, 400);
  }

  const def = CLUB_WEBSITE_ADDONS[addonId];
  if (def.retired) {
    return c.json({ error: "Tento doplněk se už neprodává, jeho obsah je na webu zdarma." }, 400);
  }
  const web = await ensureWebsiteRow(c.env.DB, teamId);

  if (web.unlockedAddons.includes(addonId)) {
    return c.json({ error: "Tento doplněk už máš zakoupený" }, 400);
  }

  if (auth.team.budget < def.price) {
    return c.json({ error: `Nedostatek financí. Potřebuješ ${def.price.toLocaleString("cs")} Kč.` }, 400);
  }

  const newAddons = [...web.unlockedAddons, addonId];
  const isBanner = addonId === "sponsor_banner";
  const result = await purchaseUnlock(c.env.DB, {
    teamId,
    column: "unlocked_addons",
    rawBefore: web.rawUnlockedAddons,
    after: newAddons,
    extraSet: isBanner ? ", sponsor_banner_enabled = 1" : "",
    extraBinds: [],
    extraRevert: isBanner ? ", sponsor_banner_enabled = ?" : "",
    extraRevertBinds: isBanner ? [web.sponsorBannerEnabled ? 1 : 0] : [],
    price: def.price,
    description: `Koupě doplňku webu: ${def.name}`,
    gameDate: auth.team.game_date || new Date().toISOString().slice(0, 10),
  });
  if (!result.ok) return c.json({ error: result.error }, result.status);

  return c.json({
    ok: true,
    unlockedAddons: newAddons,
    message: `Doplněk ${def.name} byl úspěšně zakoupen!`,
  });
});

/** Uloží novou adresu a starou si zapamatuje, aby sdílené odkazy dál fungovaly. */
async function changeSlug(db: D1Database, teamId: string, oldSlug: string | null, newSlug: string) {
  if (oldSlug === newSlug) return;
  await db.prepare("UPDATE team_websites SET custom_slug = ?, updated_at = datetime('now') WHERE team_id = ?")
    .bind(newSlug, teamId).run();
  // Když se klub vrací ke staré adrese, už to není alias, ale hlavní adresa
  await db.prepare("DELETE FROM team_website_slug_aliases WHERE slug = ? AND team_id = ?")
    .bind(newSlug, teamId).run()
    .catch((e) => logger.warn(MODULE, "drop alias that became main slug", e));
  if (oldSlug) {
    await db.prepare("INSERT OR IGNORE INTO team_website_slug_aliases (slug, team_id) VALUES (?, ?)")
      .bind(oldSlug, teamId).run()
      .catch((e) => logger.warn(MODULE, "remember previous slug", e));
    // Jen posledních pár adres; starší uvolnit pro ostatní kluby
    await db.prepare(
      `DELETE FROM team_website_slug_aliases WHERE team_id = ? AND slug NOT IN (
         SELECT slug FROM team_website_slug_aliases WHERE team_id = ? ORDER BY created_at DESC, rowid DESC LIMIT ?
       )`,
    ).bind(teamId, teamId, MAX_SLUG_ALIASES).run()
      .catch((e) => logger.warn(MODULE, "trim old slug aliases", e));
  }
}

// PATCH /api/teams/:id/website
clubWebsiteRouter.patch("/:id/website", async (c) => {
  const teamId = c.req.param("id");
  const auth = await checkTeamAuth(c, teamId);
  if ("error" in auth) return c.json({ error: auth.error }, auth.status as any);

  const body = (await c.req.json().catch((e) => {
    logger.warn(MODULE, "parse patch website body", e);
    return null;
  })) as {
    customSlug?: string | null;
    announcement?: string | null;
    sponsorBannerEnabled?: boolean;
  } | null;

  if (!body) return c.json({ error: "Neplatná data" }, 400);
  const web = await ensureWebsiteRow(c.env.DB, teamId);

  // Adresa: výchozí z názvu týmu, úprava zdarma. Stará adresa dál přesměruje na novou.
  if (body.customSlug !== undefined) {
    if (body.customSlug && body.customSlug.trim()) {
      const sanitized = slugifyTeamName(body.customSlug);
      if (sanitized.length < 3 || sanitized.length > 50) {
        return c.json({ error: `Adresa musí mít 3 až 50 znaků (jen písmena bez diakritiky, čísla a pomlčky).` }, 400);
      }
      if (await slugTakenByOtherTeam(c.env.DB, sanitized, teamId)) {
        return c.json({ error: "Tuhle adresu používá jiný klub (nebo odpovídá jeho názvu)." }, 400);
      }
      await changeSlug(c.env.DB, teamId, web.customSlug, sanitized);
    } else {
      const defaultSlug = await generateUniqueTeamSlug(c.env.DB, teamId, auth.team.name);
      await changeSlug(c.env.DB, teamId, web.customSlug, defaultSlug);
    }
  }

  if (body.announcement !== undefined) {
    if (body.announcement && !web.unlockedAddons.includes("press_officer")) {
      return c.json({ error: "Pro zveřejnění oficiálního prohlášení musíš mít zakoupený modul Tiskový mluvčí." }, 400);
    }
    const text = body.announcement?.trim();
    await c.env.DB.prepare("UPDATE team_websites SET announcement = ? WHERE team_id = ?")
      .bind(text ? text.slice(0, 1000) : null, teamId).run();
  }

  if (body.sponsorBannerEnabled !== undefined) {
    if (body.sponsorBannerEnabled && !web.unlockedAddons.includes("sponsor_banner")) {
      return c.json({ error: "Pro aktivaci reklamní lišty musíš mít zakoupený modul Sponzorská lišta." }, 400);
    }
    await c.env.DB.prepare("UPDATE team_websites SET sponsor_banner_enabled = ? WHERE team_id = ?")
      .bind(body.sponsorBannerEnabled ? 1 : 0, teamId).run();
  }

  return c.json({ ok: true, message: "Nastavení webu uloženo" });
});

// GET /api/teams/:id/website/player/:playerId — veřejný profil hráče na klubovém webu.
// Jen údaje, které by o hráči napsal klubový web: žádné dovednosti, talent, mzda ani bydliště.
clubWebsiteRouter.get("/:id/website/player/:playerId", async (c) => {
  const db = c.env.DB;
  const clubId = await resolveTeamId(db, c.req.param("id"));
  if (!clubId) return c.json({ error: "Klub nenalezen" }, 404);
  const playerId = c.req.param("playerId");

  const [club, website, player] = await Promise.all([
    db.prepare("SELECT id, name, primary_color, secondary_color FROM teams WHERE id = ?")
      .bind(clubId).first<{ id: string; name: string; primary_color: string; secondary_color: string }>(),
    db.prepare("SELECT custom_slug FROM team_websites WHERE team_id = ?").bind(clubId).first<{ custom_slug: string | null }>()
      .catch((e) => {
        logger.warn(MODULE, "player profile: website slug", e);
        return null;
      }),
    db.prepare(
      `SELECT p.id, p.first_name, p.last_name, p.nickname, p.age, p.position, p.overall_rating, p.squad_number,
              p.nationality, p.description, p.avatar, p.status, p.team_id, t.name AS team_name
       FROM players p LEFT JOIN teams t ON t.id = p.team_id
       WHERE p.id = ?`,
    ).bind(playerId).first<{
      id: string; first_name: string; last_name: string; nickname: string | null; age: number; position: string;
      overall_rating: number; squad_number: number | null; nationality: string | null; description: string | null;
      avatar: string; status: string | null; team_id: string | null; team_name: string | null;
    }>(),
  ]);
  if (!club || !player) return c.json({ error: "Hráč nenalezen" }, 404);

  const [seasonRows, careerRows] = await Promise.all([
    db.prepare(
      `SELECT s.number AS season_number, ps.team_id, t.name AS team_name,
              ps.appearances, ps.goals, ps.assists, ps.yellow_cards, ps.red_cards, ps.man_of_match,
              ps.minutes_played, ps.avg_rating, ps.clean_sheets
       FROM player_stats ps
       JOIN seasons s ON s.id = ps.season_id
       LEFT JOIN teams t ON t.id = ps.team_id
       WHERE ps.player_id = ?
       ORDER BY s.number DESC, ps.appearances DESC
       LIMIT 30`,
    ).bind(playerId).all<{
      season_number: number; team_id: string; team_name: string | null; appearances: number; goals: number;
      assists: number; yellow_cards: number; red_cards: number; man_of_match: number; minutes_played: number;
      avg_rating: number | null; clean_sheets: number;
    }>().catch((e) => {
      logger.warn(MODULE, "player profile: season stats", e);
      return { results: [] as never[] };
    }),
    db.prepare(
      `SELECT pc.team_id, t.name AS team_name, pc.joined_at, pc.left_at, pc.join_type, pc.leave_type
       FROM player_contracts pc LEFT JOIN teams t ON t.id = pc.team_id
       WHERE pc.player_id = ?
       ORDER BY COALESCE(pc.joined_at, pc.created_at) DESC
       LIMIT 20`,
    ).bind(playerId).all<{
      team_id: string; team_name: string | null; joined_at: string | null; left_at: string | null;
      join_type: string | null; leave_type: string | null;
    }>().catch((e) => {
      logger.warn(MODULE, "player profile: career", e);
      return { results: [] as never[] };
    }),
  ]);

  const released = player.status === "released";
  return c.json({
    club: {
      id: club.id,
      name: club.name,
      slug: website?.custom_slug ?? null,
      primaryColor: club.primary_color,
      secondaryColor: club.secondary_color,
    },
    player: {
      id: player.id,
      firstName: player.first_name,
      lastName: player.last_name,
      nickname: player.nickname || null,
      age: player.age,
      position: player.position,
      positionName: formatPlayerPositionCZ(player.position),
      overallRating: player.overall_rating,
      squadNumber: player.squad_number,
      nationality: player.nationality,
      description: player.description,
      avatar: parseAvatar(player.avatar, "player profile"),
      status: player.status,
    },
    currentTeam: player.team_id && !released ? { id: player.team_id, name: player.team_name ?? "Neznámý klub" } : null,
    playsForClub: player.team_id === club.id && !released,
    seasons: (seasonRows.results ?? []).map((r) => ({
      seasonNumber: r.season_number,
      teamId: r.team_id,
      teamName: r.team_name ?? "Neznámý klub",
      appearances: r.appearances ?? 0,
      goals: r.goals ?? 0,
      assists: r.assists ?? 0,
      yellowCards: r.yellow_cards ?? 0,
      redCards: r.red_cards ?? 0,
      manOfMatch: r.man_of_match ?? 0,
      minutesPlayed: r.minutes_played ?? 0,
      avgRating: r.avg_rating,
      cleanSheets: r.clean_sheets ?? 0,
    })),
    career: (careerRows.results ?? []).map((r) => ({
      teamId: r.team_id,
      teamName: r.team_name ?? "Neznámý klub",
      joinedAt: r.joined_at,
      leftAt: r.left_at,
      joinType: r.join_type,
      leaveType: r.leave_type,
    })),
  });
});
