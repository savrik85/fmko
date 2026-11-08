/**
 * Socky: jak se ze článků Zpravodaje a příspěvků manažerů skládá společná zeď.
 *
 * Bez databáze, ať se dá otestovat. Hlavní pravidlo: automatické příspěvky nesmí
 * přehlušit to, co píšou lidi. Přestupů vznikne za týden přes tři sta, a tak se
 * slučují do jednoho souhrnu za okres a den. Samostatně zůstanou jen přestupy
 * vlastního klubu. Příspěvky manažerů a všechno, pod čím se zrovna diskutuje,
 * se řadí podle poslední aktivity, takže vyplavou nahoru.
 */

import { logger } from "../lib/logger";

export type FeedCategory = "posts" | "results" | "transfers" | "interviews" | "gossip" | "season";

/** Které články Zpravodaje jdou na zeď a pod jakou kategorií (podle ní se dají skrýt). */
export const NEWS_CATEGORY: Record<string, FeedCategory> = {
  round_results: "results",
  round_summary: "results",
  ai_report: "results",
  matchday_preview: "results",
  transfer: "transfers",
  interview: "interviews",
  post_match_interview: "interviews",
  player_interview: "interviews",
  manager_feud: "gossip",
  ultras_report: "gossip",
  celebrity_arrival: "gossip",
  celebrity_signing: "gossip",
  district_event: "gossip",
  rename: "gossip",
  legend_farewell: "gossip",
  manager_arrival: "season",
  season_opener: "season",
  season_wrap: "season",
  season_awards: "season",
};

export const FEED_NEWS_TYPES = Object.keys(NEWS_CATEGORY);

/** Popisky kategorií do nabídky „Skrýt všechny …“ a do seznamu skrytého. */
export const CATEGORY_LABELS: Record<FeedCategory, string> = {
  posts: "příspěvky manažerů",
  results: "výsledky a reportáže",
  transfers: "přestupy",
  interviews: "rozhovory",
  gossip: "drby a inzeráty",
  season: "noví trenéři a sezóna",
};

export const NEWS_ICON: Record<string, string> = {
  round_results: "⚽",
  round_summary: "🏆",
  ai_report: "✍️",
  matchday_preview: "🔮",
  transfer: "🤝",
  interview: "🎙️",
  post_match_interview: "📰",
  player_interview: "🎤",
  manager_feud: "🗣️",
  ultras_report: "🔥",
  celebrity_arrival: "🌟",
  celebrity_signing: "📝",
  district_event: "🎡",
  rename: "✏️",
  legend_farewell: "🎖️",
  manager_arrival: "📋",
  season_opener: "🎺",
  season_wrap: "🏁",
  season_awards: "🏆",
};

export type TargetRef =
  | { kind: "post"; id: string }
  | { kind: "news"; id: string }
  | { kind: "bundle"; district: string; date: string }
  | { kind: "comment"; id: string }
  | { kind: "fanpost"; id: string };

const BUNDLE_RE = /^bundle:transfers:(.+):(\d{4}-\d{2}-\d{2})$/;

export function bundleKey(district: string, date: string): string {
  return `bundle:transfers:${district}:${date}`;
}

/** Rozloží klíč cíle. Neznámý nebo rozbitý tvar vrátí null. */
export function parseTargetKey(key: string): TargetRef | null {
  if (typeof key !== "string" || key.length > 300) return null;
  const bundle = BUNDLE_RE.exec(key);
  if (bundle) return { kind: "bundle", district: bundle[1], date: bundle[2] };
  const sep = key.indexOf(":");
  if (sep < 1) return null;
  const kind = key.slice(0, sep);
  const id = key.slice(sep + 1);
  if (!id || id.includes(":")) return null;
  if (kind === "post" || kind === "news" || kind === "comment" || kind === "fanpost") return { kind, id };
  return null;
}

/**
 * Časy v `news` jsou ve dvou tvarech ("2026-11-07 17:12:00" i "2026-11-07T17:12:00Z").
 * Pro řazení se sjednotí na ISO.
 */
export function normalizeTime(s: string): string {
  if (!s) return "";
  if (s.includes("T")) return s.endsWith("Z") || /[+-]\d{2}:?\d{2}$/.test(s) ? s : `${s}Z`;
  return `${s.replace(" ", "T")}Z`;
}

/** Den (UTC) jako YYYY-MM-DD. Okna zdi i souhrny přestupů jedou po UTC dnech, aby se souhrn nerozpadl mezi dvě stránky. */
export function utcDate(iso: string): string {
  return normalizeTime(iso).slice(0, 10);
}

export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export interface NewsRow {
  id: string;
  type: string;
  headline: string;
  body: string;
  team_id: string | null;
  team_name: string | null;
  league_id: string;
  league_name: string | null;
  district: string | null;
  game_week: number | null;
  created_at: string;
}

export interface PostRow {
  id: string;
  user_id: string;
  team_id: string;
  team_name: string | null;
  district: string | null;
  manager_name: string | null;
  manager_avatar: string | null;
  body: string;
  /** JSON pole označených klubů (`Mention[]`). */
  mentions: string | null;
  created_at: string;
}

export interface InterviewView {
  personName: string | null;
  personAvatar: unknown | null;
  teamName: string | null;
  article: string | null;
  qa: Array<{ q: string; a: string }>;
}

export interface FeedItem {
  key: string;
  kind: "post" | "article" | "bundle";
  category: FeedCategory;
  newsType: string | null;
  createdAt: string;
  /** Poslední aktivita: podle ní se řadí. */
  sortAt: string;
  district: string | null;
  leagueId: string | null;
  leagueName: string | null;
  gameWeek: number | null;
  teamId: string | null;
  teamName: string | null;
  /** Autor příspěvku manažera. */
  userId: string | null;
  authorName: string;
  authorAvatar: unknown | null;
  icon: string;
  headline: string | null;
  body: string | null;
  interview: InterviewView | null;
  lines: string[];
  /** Kluby označené v příspěvku manažera přes @. */
  mentions: Mention[];
}

function safeJson(raw: string | null | undefined): unknown | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch (e) {
    logger.warn({ module: "social-feed" }, "nečitelný JSON v příspěvku", e);
    return null;
  }
}

/** Rozhovory mají v `body` JSON. Když nejde přečíst, zobrazí se jen titulek. */
export function parseInterviewBody(type: string, body: string): InterviewView | null {
  if (type !== "interview" && type !== "post_match_interview" && type !== "player_interview") return null;
  const j = safeJson(body);
  if (!j || typeof j !== "object") return null;
  const o = j as Record<string, unknown>;
  const qa = Array.isArray(o.qa)
    ? (o.qa as unknown[])
        .map((x) => x as Record<string, unknown>)
        .filter((x) => typeof x?.q === "string" && typeof x?.a === "string")
        .map((x) => ({ q: String(x.q), a: String(x.a) }))
    : [];
  return {
    personName: typeof o.managerName === "string" ? o.managerName : typeof o.playerName === "string" ? o.playerName : null,
    personAvatar: (o.managerAvatar ?? o.playerAvatar ?? null) as unknown,
    teamName: typeof o.teamName === "string" ? o.teamName : null,
    article: typeof o.article === "string" ? o.article : null,
    qa,
  };
}

/** Tučné značky z reportáží kotle (**…**) by na zdi visely jako hvězdičky. */
export function plainText(s: string): string {
  return s.replace(/\*\*(.+?)\*\*/g, "$1").replace(/\s+\n/g, "\n").trim();
}

/** Výsledky kola jsou jedna dlouhá věta za druhou; na zdi je každý zápas na vlastním řádku. */
export function splitResults(body: string): string[] {
  return plainText(body)
    .split(/(?<=\d:\d{1,2})\.\s+/)
    .map((s) => s.trim().replace(/\.$/, ""))
    .filter(Boolean);
}

export interface Viewer {
  teamId: string;
  userId: string;
  teamName: string | null;
}

/** Týká se přestup klubu, který se dívá? Článek přestupu nemá team_id, pozná se podle jména v textu. */
function concernsViewer(row: NewsRow, viewer: Viewer): boolean {
  if (row.team_id && row.team_id === viewer.teamId) return true;
  const name = viewer.teamName?.trim();
  if (!name) return false;
  return row.headline.includes(name) || row.body.includes(name);
}

function articleItem(row: NewsRow): FeedItem {
  const createdAt = normalizeTime(row.created_at);
  const interview = parseInterviewBody(row.type, row.body);
  const isResults = row.type === "round_results";
  return {
    key: `news:${row.id}`,
    kind: "article",
    category: NEWS_CATEGORY[row.type] ?? "gossip",
    newsType: row.type,
    createdAt,
    sortAt: createdAt,
    district: row.district,
    leagueId: row.league_id,
    leagueName: row.league_name,
    gameWeek: row.game_week,
    teamId: row.team_id,
    teamName: row.team_name,
    userId: null,
    authorName: "Zpravodaj",
    authorAvatar: null,
    icon: NEWS_ICON[row.type] ?? "📰",
    headline: row.headline,
    body: interview ? null : isResults ? null : plainText(row.body),
    interview,
    lines: isResults ? splitResults(row.body) : [],
    mentions: [],
  };
}

/** Řádek souhrnu přestupů: titulek bez úvodního „Přestup:“ je kratší a čte se líp. */
function transferLine(row: NewsRow): string {
  return row.headline.replace(/^(Přestup|Transfer)\s*[:!]\s*/i, "").trim();
}

/** Stejný titulek dvakrát (nabídka zveřejněná dvakrát za den) se v souhrnu ukáže jednou. */
function uniqueLines(lines: string[]): string[] {
  return [...new Set(lines)];
}

export function postItem(row: PostRow): FeedItem {
  const createdAt = normalizeTime(row.created_at);
  return {
    key: `post:${row.id}`,
    kind: "post",
    category: "posts",
    newsType: null,
    createdAt,
    sortAt: createdAt,
    district: row.district,
    leagueId: null,
    leagueName: null,
    gameWeek: null,
    teamId: row.team_id,
    teamName: row.team_name,
    userId: row.user_id,
    authorName: row.manager_name ?? "Trenér",
    authorAvatar: safeJson(row.manager_avatar),
    icon: "",
    headline: null,
    body: row.body,
    interview: null,
    lines: [],
    mentions: parseMentions(row.mentions),
  };
}

/**
 * Z článků a příspěvků složí položky zdi. Přestupy se slučují do souhrnu za okres
 * a den (UTC), kromě těch, které se týkají klubu, který se dívá.
 */
export function buildFeedItems(news: NewsRow[], posts: PostRow[], viewer: Viewer): FeedItem[] {
  const items: FeedItem[] = posts.map(postItem);
  const bundles = new Map<string, { rows: NewsRow[] }>();

  for (const row of news) {
    if (!(row.type in NEWS_CATEGORY)) continue;
    if (row.type === "transfer" && !concernsViewer(row, viewer)) {
      const key = bundleKey(row.district ?? "", utcDate(row.created_at));
      const b = bundles.get(key) ?? { rows: [] };
      b.rows.push(row);
      bundles.set(key, b);
      continue;
    }
    items.push(articleItem(row));
  }

  for (const [key, b] of bundles) {
    const rows = [...b.rows].sort((a, c) => normalizeTime(c.created_at).localeCompare(normalizeTime(a.created_at)));
    const newest = normalizeTime(rows[0].created_at);
    const ref = parseTargetKey(key);
    items.push({
      key,
      kind: "bundle",
      category: "transfers",
      newsType: "transfer",
      createdAt: newest,
      sortAt: newest,
      district: rows[0].district,
      leagueId: null,
      leagueName: null,
      gameWeek: null,
      teamId: null,
      teamName: null,
      userId: null,
      authorName: "Zpravodaj",
      authorAvatar: null,
      icon: "🤝",
      headline: `Přestupy dne${ref && ref.kind === "bundle" ? ` · ${czDate(ref.date)}` : ""}`,
      body: null,
      interview: null,
      lines: uniqueLines(rows.map(transferLine)),
      mentions: [],
    });
  }
  return items;
}

/** 7. 11. — krátké datum pro titulek souhrnu. */
export function czDate(date: string): string {
  const [, m, d] = date.split("-").map((x) => Number.parseInt(x, 10));
  return `${d}. ${m}.`;
}

export interface Mute {
  kind: "item" | "team" | "district" | "category";
  value: string;
}

/** Skryje, co si člověk skryl. Svoje příspěvky vidí vždycky. */
export function applyMutes(items: FeedItem[], mutes: Mute[], viewer: Viewer): FeedItem[] {
  if (mutes.length === 0) return items;
  const by = (k: Mute["kind"]) => new Set(mutes.filter((m) => m.kind === k).map((m) => m.value));
  const itemSet = by("item");
  const teamSet = by("team");
  const districtSet = by("district");
  const categorySet = by("category");
  return items.filter((it) => {
    if (it.kind === "post" && it.userId === viewer.userId) return true;
    if (itemSet.has(it.key)) return false;
    if (it.teamId && teamSet.has(it.teamId)) return false;
    if (it.district && districtSet.has(it.district)) return false;
    if (categorySet.has(it.category)) return false;
    return true;
  });
}

/**
 * Pořadí zdi. Příspěvek manažera má náskok dvanáct hodin, aby ho za jediné
 * odpoledne nezasypaly výsledky a rozhovory. Cokoli, pod čím se právě diskutuje,
 * má jako čas poslední komentář, takže vyplave nahoru.
 */
export const POST_BOOST_HOURS = 12;

export function rankTime(item: FeedItem, lastActivityAt: string | null): number {
  const base = Date.parse(item.createdAt) || 0;
  const boosted = item.kind === "post" ? base + POST_BOOST_HOURS * 3600_000 : base;
  const activity = lastActivityAt ? Date.parse(normalizeTime(lastActivityAt)) || 0 : 0;
  return Math.max(boosted, activity);
}

export function sortFeed(items: FeedItem[], lastActivity: Map<string, string>): FeedItem[] {
  const t = new Map(items.map((it) => [it.key, rankTime(it, lastActivity.get(it.key) ?? null)]));
  return [...items].sort((a, b) => (t.get(b.key) ?? 0) - (t.get(a.key) ?? 0) || b.key.localeCompare(a.key));
}

/** Délky textů. Delší komentář na telefonu nikdo nečte. */
export const POST_MAX = 1000;
export const COMMENT_MAX = 500;
/** Kolik toho jeden člověk napíše za den. Brání spamu, běžný hráč na to nedosáhne. */
export const POSTS_PER_DAY = 15;
export const COMMENTS_PER_DAY = 120;

/** Ořízne a sjednotí text od člověka. Vrací null, když nic nezbude. */
// ── Označení klubu (@) ──────────────────────────────────────────────────────

export interface Mention {
  teamId: string;
  name: string;
}

/** Kolik klubů jde označit v jednom textu. */
export const MENTIONS_MAX = 5;

/** Označení uložená u příspěvku nebo komentáře. Rozbitý JSON = nic. */
export function parseMentions(raw: string | null | undefined): Mention[] {
  const j = safeJson(raw);
  if (!Array.isArray(j)) return [];
  return j.filter((m): m is Mention => !!m && typeof m.teamId === "string" && typeof m.name === "string");
}

/**
 * Ze skutečných klubů, které poslal prohlížeč, nechá jen ty, jejichž „@jméno“
 * v textu opravdu stojí (označení mohl autor před odesláním smazat), každý jednou.
 */
export function pickMentions(body: string, candidates: Mention[], authorTeamId: string): Mention[] {
  const out: Mention[] = [];
  for (const c of candidates) {
    if (c.teamId === authorTeamId || out.some((m) => m.teamId === c.teamId)) continue;
    if (!c.name || !body.includes(`@${c.name}`)) continue;
    out.push({ teamId: c.teamId, name: c.name });
    if (out.length >= MENTIONS_MAX) break;
  }
  return out;
}

/** Id klubů z požadavku: jen řetězce, bez opakování, nejvýš pár. */
export function mentionIds(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return [...new Set(raw.filter((x): x is string => typeof x === "string" && x.length > 0 && x.length <= 64))].slice(0, MENTIONS_MAX);
}

export function cleanUserText(raw: unknown, max: number): string | null {
  if (typeof raw !== "string") return null;
  const t = raw.replace(/\r\n?/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  if (!t) return null;
  return t.length > max ? t.slice(0, max) : t;
}
