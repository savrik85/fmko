/**
 * Socky: čtení a zápis zdi v databázi.
 *
 * Zeď se skládá po stránkách o dvou dnech (UTC). Na první stránce se navíc
 * objeví starší příspěvky a články, pod kterými se v posledních dnech
 * diskutovalo: diskuse je to, co má být vidět, ne datum vzniku článku.
 */

import { logger } from "../lib/logger";
import {
  FEED_NEWS_TYPES, NEWS_CATEGORY, addDays, applyMutes, buildFeedItems, normalizeTime,
  parseMentions, parseTargetKey, pickMentions, plainText, sortFeed,
  type FeedItem, type Mention, type Mute, type NewsRow, type PostRow, type Viewer,
} from "./feed-model";

const M = "social";

/** Kolik dní pokryje jedna stránka zdi. */
export const WINDOW_DAYS = 2;
/** Jak daleko zpátky se hledají diskuse, které mají vyplavat nahoru. */
const ACTIVE_LOOKBACK_DAYS = 3;
/** Kolik hlasů fanoušků z hospody se ukáže pod výsledky kola. */
const FAN_VOICES_PER_RESULTS = 6;

const MANAGER_NAME = (alias: string) =>
  `(SELECT mm.name FROM managers mm WHERE mm.team_id = ${alias} ORDER BY mm.created_at LIMIT 1)`;
const MANAGER_AVATAR = (alias: string) =>
  `(SELECT mm.avatar FROM managers mm WHERE mm.team_id = ${alias} ORDER BY mm.created_at LIMIT 1)`;

/** Klub vede skutečný člověk (ne AI trenér). Jen takovým má smysl posílat oznámení. */
export const HUMAN_TEAM = (alias: string) =>
  `(${alias}.user_id IS NOT NULL AND ${alias}.user_id != '' AND ${alias}.user_id != 'ai')`;

export interface CommentView {
  id: string;
  key: string;
  authorKind: "manager" | "fan" | "journalist";
  authorName: string;
  authorAvatar: unknown | null;
  /** Popisek pod jménem: klub manažera, „fandí …“, „Zpravodaj“. */
  authorLabel: string | null;
  teamId: string | null;
  teamName: string | null;
  body: string;
  createdAt: string;
  replyToId: string | null;
  likeCount: number;
  liked: boolean;
  mine: boolean;
  /** Kluby označené přes @. */
  mentions: Mention[];
}

export interface FeedItemView extends FeedItem {
  likeCount: number;
  liked: boolean;
  commentCount: number;
  comments: CommentView[];
  mine: boolean;
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function isDate(s: unknown): s is string {
  return typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);
}

function chunks<T>(arr: T[], size = 90): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

function parseAvatar(raw: unknown): unknown | null {
  if (typeof raw !== "string" || !raw) return null;
  try {
    return JSON.parse(raw);
  } catch (e) {
    logger.warn({ module: M }, "nečitelný avatar", e);
    return null;
  }
}

/** Kdo se dívá: klub, jeho majitel a jméno (podle jména se poznají jeho přestupy). */
export async function loadViewer(db: D1Database, teamId: string): Promise<Viewer | null> {
  const row = await db.prepare("SELECT id, user_id, name FROM teams WHERE id = ?")
    .bind(teamId).first<{ id: string; user_id: string | null; name: string | null }>()
    .catch((e) => { logger.warn({ module: M }, `klub ${teamId}`, e); return null; });
  if (!row?.user_id) return null;
  return { teamId: row.id, userId: row.user_id, teamName: row.name };
}

export async function loadMutes(db: D1Database, userId: string): Promise<Array<Mute & { label: string; createdAt: string }>> {
  const res = await db.prepare(
    "SELECT kind, value, label, created_at FROM social_mutes WHERE user_id = ? ORDER BY created_at DESC",
  ).bind(userId).all<{ kind: Mute["kind"]; value: string; label: string; created_at: string }>()
    .catch((e) => { logger.warn({ module: M }, "skryté", e); return { results: [] as never[] }; });
  return res.results.map((r) => ({ kind: r.kind, value: r.value, label: r.label, createdAt: r.created_at }));
}

const NEWS_SELECT = `SELECT n.id, n.type, n.headline, n.body, n.team_id, t.name AS team_name, n.league_id,
       l.name AS league_name, l.district, n.game_week, n.created_at
  FROM news n
  JOIN leagues l ON l.id = n.league_id
  LEFT JOIN teams t ON t.id = n.team_id`;

const POST_SELECT = `SELECT p.id, p.user_id, p.team_id, t.name AS team_name,
       (SELECT l.district FROM leagues l WHERE l.id = t.league_id) AS district,
       ${MANAGER_NAME("p.team_id")} AS manager_name, ${MANAGER_AVATAR("p.team_id")} AS manager_avatar,
       p.body, p.mentions, p.created_at
  FROM social_posts p
  LEFT JOIN teams t ON t.id = p.team_id`;

const TYPES_SQL = FEED_NEWS_TYPES.map((t) => `'${t}'`).join(",");

async function newsInWindow(db: D1Database, start: string, end: string): Promise<NewsRow[]> {
  const res = await db.prepare(
    `${NEWS_SELECT}
     WHERE n.created_at >= ? AND n.created_at < ? AND n.type IN (${TYPES_SQL})
     ORDER BY n.created_at DESC LIMIT 800`,
  ).bind(start, end).all<NewsRow>()
    .catch((e) => { logger.warn({ module: M }, "články do zdi", e); return { results: [] as NewsRow[] }; });
  return res.results;
}

async function postsInWindow(db: D1Database, start: string, end: string): Promise<PostRow[]> {
  const res = await db.prepare(
    `${POST_SELECT}
     WHERE p.created_at >= ? AND p.created_at < ? AND p.deleted_at IS NULL AND p.removed_at IS NULL
     ORDER BY p.created_at DESC LIMIT 300`,
  ).bind(start, end).all<PostRow>()
    .catch((e) => { logger.warn({ module: M }, "příspěvky do zdi", e); return { results: [] as PostRow[] }; });
  return res.results;
}

/** Klíče, pod kterými manažeři v posledních dnech diskutovali, s časem posledního komentáře. */
async function recentlyActive(db: D1Database, since: string): Promise<Map<string, string>> {
  const res = await db.prepare(
    `SELECT target_key, MAX(created_at) AS last_at FROM social_comments
      WHERE created_at >= ? AND author_kind = 'manager' AND deleted_at IS NULL AND removed_at IS NULL
      GROUP BY target_key ORDER BY last_at DESC LIMIT 60`,
  ).bind(since).all<{ target_key: string; last_at: string }>()
    .catch((e) => { logger.warn({ module: M }, "živé diskuse", e); return { results: [] as never[] }; });
  return new Map(res.results.map((r) => [r.target_key, r.last_at]));
}

/** Dotáhne položky mimo okno (živé diskuse). Souhrn přestupů se složí znovu ze svého dne. */
async function loadExtraSources(db: D1Database, keys: string[]): Promise<{ news: NewsRow[]; posts: PostRow[] }> {
  const postIds: string[] = [];
  const newsIds: string[] = [];
  const bundles: Array<{ district: string; date: string }> = [];
  for (const k of keys) {
    const ref = parseTargetKey(k);
    if (ref?.kind === "post") postIds.push(ref.id);
    else if (ref?.kind === "news") newsIds.push(ref.id);
    else if (ref?.kind === "bundle") bundles.push({ district: ref.district, date: ref.date });
  }
  const news: NewsRow[] = [];
  const posts: PostRow[] = [];
  for (const part of chunks(newsIds)) {
    const r = await db.prepare(`${NEWS_SELECT} WHERE n.id IN (${part.map(() => "?").join(",")}) AND n.type IN (${TYPES_SQL})`)
      .bind(...part).all<NewsRow>()
      .catch((e) => { logger.warn({ module: M }, "články živých diskusí", e); return { results: [] as NewsRow[] }; });
    news.push(...r.results);
  }
  for (const part of chunks(postIds)) {
    const r = await db.prepare(
      `${POST_SELECT} WHERE p.id IN (${part.map(() => "?").join(",")}) AND p.deleted_at IS NULL AND p.removed_at IS NULL`,
    ).bind(...part).all<PostRow>()
      .catch((e) => { logger.warn({ module: M }, "příspěvky živých diskusí", e); return { results: [] as PostRow[] }; });
    posts.push(...r.results);
  }
  for (const b of bundles.slice(0, 10)) {
    news.push(...await transfersOfDay(db, b.district, b.date));
  }
  return { news, posts };
}

async function transfersOfDay(db: D1Database, district: string, date: string): Promise<NewsRow[]> {
  const r = await db.prepare(
    `${NEWS_SELECT} WHERE l.district = ? AND n.type = 'transfer' AND n.created_at >= ? AND n.created_at < ?
     ORDER BY n.created_at DESC LIMIT 200`,
  ).bind(district, date, addDays(date, 1)).all<NewsRow>()
    .catch((e) => { logger.warn({ module: M }, "přestupy dne", e); return { results: [] as NewsRow[] }; });
  return r.results;
}

interface CommentRow {
  id: string;
  target_key: string;
  author_kind: CommentView["authorKind"];
  user_id: string | null;
  team_id: string | null;
  team_name: string | null;
  author_name: string;
  author_avatar: string | null;
  reply_to_id: string | null;
  body: string;
  mentions: string | null;
  created_at: string;
}

function commentLabel(r: { author_kind: string; team_name: string | null }): string | null {
  if (r.author_kind === "manager") return r.team_name;
  // Bez rodu: fandí Bára i Franta, do Zpravodaje píše novinář i novinářka.
  if (r.author_kind === "fan") return r.team_name ? `fandí ${r.team_name}` : "fanoušci";
  if (r.author_kind === "journalist") return "Zpravodaj";
  return null;
}

function toCommentView(r: CommentRow, viewer: Viewer, likes: Map<string, { n: number; liked: boolean }>): CommentView {
  const key = `comment:${r.id}`;
  const l = likes.get(key);
  return {
    id: r.id,
    key,
    authorKind: r.author_kind,
    authorName: r.author_name,
    authorAvatar: parseAvatar(r.author_avatar),
    authorLabel: commentLabel(r),
    teamId: r.team_id,
    teamName: r.team_name,
    body: r.body,
    createdAt: normalizeTime(r.created_at),
    replyToId: r.reply_to_id,
    likeCount: l?.n ?? 0,
    liked: l?.liked ?? false,
    mine: r.author_kind === "manager" && r.user_id === viewer.userId,
    mentions: parseMentions(r.mentions),
  };
}

async function likeStats(db: D1Database, keys: string[], userId: string): Promise<Map<string, { n: number; liked: boolean }>> {
  const out = new Map<string, { n: number; liked: boolean }>();
  for (const part of chunks(keys)) {
    const r = await db.prepare(
      `SELECT target_key, COUNT(*) AS n, MAX(CASE WHEN user_id = ? THEN 1 ELSE 0 END) AS liked
         FROM social_likes WHERE target_key IN (${part.map(() => "?").join(",")}) GROUP BY target_key`,
    ).bind(userId, ...part).all<{ target_key: string; n: number; liked: number }>()
      .catch((e) => { logger.warn({ module: M }, "lajky", e); return { results: [] as never[] }; });
    for (const row of r.results) out.set(row.target_key, { n: row.n, liked: row.liked === 1 });
  }
  return out;
}

const COMMENT_SELECT = `SELECT c.id, c.target_key, c.author_kind, c.user_id, c.team_id, t.name AS team_name,
       c.author_name, c.author_avatar, c.reply_to_id, c.body, c.mentions, c.created_at
  FROM social_comments c LEFT JOIN teams t ON t.id = c.team_id`;

/**
 * Hlasy fanoušků z hospody pod výsledky kola. Nevznikají znovu: jsou to příspěvky,
 * které fanoušci po zápase napsali na zeď svého klubu (`fan_posts`, zap-/riv-<zápas>).
 * Vybírá se pestře: od každého klubu jeden, vůdci part dřív, žádný text dvakrát.
 */
export async function loadFanVoices(db: D1Database, leagueId: string, round: number, viewer: Viewer, limit = FAN_VOICES_PER_RESULTS): Promise<CommentView[]> {
  const r = await db.prepare(
    `SELECT fp.id, fp.author_name, fp.author_kind, fp.author_avatar, fp.body, fp.created_at, fp.team_id, t.name AS team_name
       FROM matches m
       JOIN fan_posts fp ON fp.reference_id >= 'zap-' || m.id || '-' AND fp.reference_id < 'zap-' || m.id || '.'
       LEFT JOIN teams t ON t.id = fp.team_id
      WHERE m.league_id = ?1 AND m.round = ?2
     UNION ALL
     SELECT fp.id, fp.author_name, fp.author_kind, fp.author_avatar, fp.body, fp.created_at, fp.team_id, t.name AS team_name
       FROM matches m
       JOIN fan_posts fp ON fp.reference_id >= 'riv-' || m.id || '-' AND fp.reference_id < 'riv-' || m.id || '.'
       LEFT JOIN teams t ON t.id = fp.team_id
      WHERE m.league_id = ?1 AND m.round = ?2
      ORDER BY 6, 1 LIMIT 80`,
  ).bind(leagueId, round).all<{
    id: string; author_name: string; author_kind: string; author_avatar: string | null;
    body: string; created_at: string; team_id: string | null; team_name: string | null;
  }>().catch((e) => { logger.warn({ module: M }, "hlasy fanoušků pod výsledky", e); return { results: [] as never[] }; });

  const rows = [...r.results].sort((a, b) => (a.author_kind === "vudce" ? 0 : 1) - (b.author_kind === "vudce" ? 0 : 1));
  const seenBodies = new Set<string>();
  const seenTeams = new Set<string>();
  const picked: typeof rows = [];
  for (const pass of [true, false]) {
    for (const row of rows) {
      if (picked.length >= limit) break;
      if (seenBodies.has(row.body)) continue;
      if (pass && row.team_id && seenTeams.has(row.team_id)) continue;
      picked.push(row);
      seenBodies.add(row.body);
      if (row.team_id) seenTeams.add(row.team_id);
    }
  }
  const keys = picked.map((p) => `fanpost:${p.id}`);
  const likes = await likeStats(db, keys, viewer.userId);
  return picked
    .sort((a, b) => a.created_at.localeCompare(b.created_at))
    .map((p) => {
      const key = `fanpost:${p.id}`;
      return {
        id: p.id,
        key,
        authorKind: "fan" as const,
        authorName: p.author_name,
        authorAvatar: parseAvatar(p.author_avatar),
        authorLabel: p.team_name ? `fandí ${p.team_name}` : "fanoušci",
        teamId: p.team_id,
        teamName: p.team_name,
        body: p.body,
        createdAt: normalizeTime(p.created_at),
        replyToId: null,
        likeCount: likes.get(key)?.n ?? 0,
        liked: likes.get(key)?.liked ?? false,
        mine: false,
        mentions: [],
      };
    });
}

function hiddenByMutes(c: { teamId: string | null; authorKind: string; mine: boolean }, mutedTeams: Set<string>): boolean {
  return !c.mine && !!c.teamId && mutedTeams.has(c.teamId);
}

/** Celá diskuse pod jedním příspěvkem. */
export async function loadComments(db: D1Database, key: string, viewer: Viewer): Promise<CommentView[]> {
  const res = await db.prepare(
    `${COMMENT_SELECT} WHERE c.target_key = ? AND c.deleted_at IS NULL AND c.removed_at IS NULL
     ORDER BY c.created_at, c.id LIMIT 300`,
  ).bind(key).all<CommentRow>()
    .catch((e) => { logger.warn({ module: M }, "komentáře", e); return { results: [] as CommentRow[] }; });
  const likes = await likeStats(db, res.results.map((r) => `comment:${r.id}`), viewer.userId);
  const stored = res.results.map((r) => toCommentView(r, viewer, likes));

  let voices: CommentView[] = [];
  const ref = parseTargetKey(key);
  if (ref?.kind === "news") {
    const n = await db.prepare("SELECT type, league_id, game_week FROM news WHERE id = ?")
      .bind(ref.id).first<{ type: string; league_id: string; game_week: number | null }>()
      .catch((e) => { logger.warn({ module: M }, "článek pro hlasy fanoušků", e); return null; });
    if (n?.type === "round_results" && n.game_week != null) voices = await loadFanVoices(db, n.league_id, n.game_week, viewer);
  }

  const mutedTeams = new Set((await loadMutes(db, viewer.userId)).filter((m) => m.kind === "team").map((m) => m.value));
  return [...voices, ...stored]
    .filter((c) => !hiddenByMutes(c, mutedTeams))
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

/** K položkám zdi doplní lajky, počty komentářů a poslední dva komentáře. */
async function decorate(db: D1Database, items: FeedItem[], viewer: Viewer, mutedTeams: Set<string>): Promise<{ views: FeedItemView[]; lastHuman: Map<string, string> }> {
  const keys = items.map((i) => i.key);
  const likes = await likeStats(db, keys, viewer.userId);
  const counts = new Map<string, { n: number; lastHuman: string | null }>();
  const previews = new Map<string, CommentRow[]>();

  for (const part of chunks(keys)) {
    const ph = part.map(() => "?").join(",");
    const c = await db.prepare(
      `SELECT target_key, COUNT(*) AS n, MAX(CASE WHEN author_kind = 'manager' THEN created_at END) AS last_human
         FROM social_comments WHERE target_key IN (${ph}) AND deleted_at IS NULL AND removed_at IS NULL
         GROUP BY target_key`,
    ).bind(...part).all<{ target_key: string; n: number; last_human: string | null }>()
      .catch((e) => { logger.warn({ module: M }, "počty komentářů", e); return { results: [] as never[] }; });
    for (const row of c.results) counts.set(row.target_key, { n: row.n, lastHuman: row.last_human });

    const p = await db.prepare(
      `SELECT * FROM (
         SELECT c.id, c.target_key, c.author_kind, c.user_id, c.team_id, t.name AS team_name,
                c.author_name, c.author_avatar, c.reply_to_id, c.body, c.mentions, c.created_at,
                ROW_NUMBER() OVER (PARTITION BY c.target_key ORDER BY c.created_at DESC, c.id DESC) AS rn
           FROM social_comments c LEFT JOIN teams t ON t.id = c.team_id
          WHERE c.target_key IN (${ph}) AND c.deleted_at IS NULL AND c.removed_at IS NULL
       ) WHERE rn <= 2`,
    ).bind(...part).all<CommentRow>()
      .catch((e) => { logger.warn({ module: M }, "náhled komentářů", e); return { results: [] as CommentRow[] }; });
    for (const row of p.results) {
      const list = previews.get(row.target_key) ?? [];
      list.push(row);
      previews.set(row.target_key, list);
    }
  }

  const commentLikes = await likeStats(db, [...previews.values()].flat().map((r) => `comment:${r.id}`), viewer.userId);
  const lastHuman = new Map<string, string>();
  const views: FeedItemView[] = [];
  for (const it of items) {
    const cnt = counts.get(it.key);
    if (cnt?.lastHuman) lastHuman.set(it.key, cnt.lastHuman);
    let comments = (previews.get(it.key) ?? [])
      .map((r) => toCommentView(r, viewer, commentLikes))
      .filter((c) => !hiddenByMutes(c, mutedTeams))
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    let commentCount = cnt?.n ?? 0;
    if (it.newsType === "round_results" && it.leagueId && it.gameWeek != null) {
      const voices = await loadFanVoices(db, it.leagueId, it.gameWeek, viewer);
      commentCount += voices.length;
      if (comments.length < 2) comments = [...voices.slice(-(2 - comments.length)), ...comments];
    }
    const l = likes.get(it.key);
    views.push({
      ...it,
      // Id uživatele ven nejde: stačí vědět, jestli je příspěvek můj.
      userId: null,
      likeCount: l?.n ?? 0,
      liked: l?.liked ?? false,
      commentCount,
      comments,
      mine: it.kind === "post" && it.userId === viewer.userId,
    });
  }
  return { views, lastHuman };
}

/** Souhrn přestupů z dní, které stránka už pokrývá, se složí z okna sám. */
function bundleInWindow(key: string, start: string): boolean {
  const ref = parseTargetKey(key);
  return ref?.kind === "bundle" && ref.date >= start;
}

/**
 * Jedna stránka zdi. `before` je den (YYYY-MM-DD), před kterým stránka končí;
 * bez něj se začíná dneškem. Vrací i den, od kterého pokračovat.
 */
export async function loadFeed(db: D1Database, viewer: Viewer, before?: string | null): Promise<{ items: FeedItemView[]; nextBefore: string | null }> {
  const firstPage = !isDate(before);
  const end = firstPage ? addDays(today(), 1) : before as string;
  const start = addDays(end, -WINDOW_DAYS);

  const [news, posts] = await Promise.all([newsInWindow(db, start, end), postsInWindow(db, start, end)]);

  let active = new Map<string, string>();
  if (firstPage) {
    active = await recentlyActive(db, addDays(today(), -ACTIVE_LOOKBACK_DAYS));
    const inWindow = new Set([
      ...posts.map((p) => `post:${p.id}`),
      ...news.map((n) => `news:${n.id}`),
    ]);
    const missing = [...active.keys()].filter((k) => !inWindow.has(k) && !bundleInWindow(k, start));
    if (missing.length > 0) {
      const extra = await loadExtraSources(db, missing);
      news.push(...extra.news.filter((n) => !news.some((x) => x.id === n.id)));
      posts.push(...extra.posts.filter((p) => !posts.some((x) => x.id === p.id)));
    }
  }

  const mutes = await loadMutes(db, viewer.userId);
  const items = applyMutes(buildFeedItems(news, posts, viewer), mutes, viewer);
  const mutedTeams = new Set(mutes.filter((m) => m.kind === "team").map((m) => m.value));
  const { views, lastHuman } = await decorate(db, items, viewer, mutedTeams);
  for (const [k, v] of active) if (!lastHuman.has(k)) lastHuman.set(k, v);
  const sorted = sortFeed(views, lastHuman) as FeedItemView[];

  const older = await db.prepare(
    `SELECT 1 AS x FROM news WHERE created_at < ? AND type IN (${TYPES_SQL})
     UNION ALL SELECT 1 FROM social_posts WHERE created_at < ? AND deleted_at IS NULL LIMIT 1`,
  ).bind(start, start).first<{ x: number }>()
    .catch((e) => { logger.warn({ module: M }, "starší obsah zdi", e); return null; });

  return { items: sorted, nextBefore: older ? start : null };
}

/** Jedna položka zdi podle klíče (odkaz z oznámení na starší příspěvek). */
export async function loadFeedItem(db: D1Database, viewer: Viewer, key: string): Promise<FeedItemView | null> {
  const ref = parseTargetKey(key);
  if (!ref || ref.kind === "comment" || ref.kind === "fanpost") return null;
  const { news, posts } = ref.kind === "bundle"
    ? { news: await transfersOfDay(db, ref.district, ref.date), posts: [] as PostRow[] }
    : await loadExtraSources(db, [key]);
  // Souhrn se skládá bez ohledu na to, kdo se dívá: jinak by se přestupy vlastního
  // klubu z odkazu na souhrn vytratily.
  const items = buildFeedItems(news, posts, ref.kind === "bundle" ? { ...viewer, teamName: null, teamId: "" } : viewer)
    .filter((i) => i.key === key);
  if (items.length === 0) return null;
  const { views } = await decorate(db, items, viewer, new Set());
  return views[0] ?? null;
}

// ── Cíl komentáře / lajku ───────────────────────────────────────────────────

export interface ResolvedTarget {
  key: string;
  kind: "post" | "news" | "bundle" | "comment" | "fanpost";
  /** Kam vede odkaz: u komentáře příspěvek, pod kterým je, jinak cíl sám. */
  feedKey: string;
  /** Krátce, co to je (text příspěvku nebo komentáře, titulek článku): do oznámení o lajku. */
  snippet: string;
  /** Kdo článek napsal (jen u článku Zpravodaje s podepsaným novinářem). */
  journalistId?: string | null;
  /** Název klubu, kterému cíl patří (u článku klub, o kterém je). */
  ownerTeamName?: string | null;
  /** Klub, kterému patří (autor příspěvku, klub z článku). Jen lidský dostane oznámení. */
  ownerTeamId: string | null;
  ownerIsHuman: boolean;
  /** Klub, o kterém je řeč: jeho fanoušci se ozvou. */
  subjectTeamId: string | null;
  leagueId: string | null;
  district: string | null;
  /** O čem to je, pro model a pro text oznámení. */
  title: string;
  context: string;
}

/** Ověří, že cíl existuje, a vrátí, o čem je. Smazaný nebo neznámý cíl vrátí null. */
export async function resolveTarget(db: D1Database, key: string): Promise<ResolvedTarget | null> {
  const ref = parseTargetKey(key);
  if (!ref) return null;

  if (ref.kind === "post") {
    const p = await db.prepare(
      `SELECT p.id, p.team_id, p.body, t.name AS team_name, t.league_id, ${HUMAN_TEAM("t")} AS human,
              (SELECT l.district FROM leagues l WHERE l.id = t.league_id) AS district,
              ${MANAGER_NAME("p.team_id")} AS manager_name
         FROM social_posts p LEFT JOIN teams t ON t.id = p.team_id
        WHERE p.id = ? AND p.deleted_at IS NULL AND p.removed_at IS NULL`,
    ).bind(ref.id).first<{ team_id: string; body: string; team_name: string | null; league_id: string | null; human: number; district: string | null; manager_name: string | null }>()
      .catch((e) => { logger.warn({ module: M }, "cíl: příspěvek", e); return null; });
    if (!p) return null;
    return {
      key, kind: "post", feedKey: key, snippet: p.body,
      ownerTeamId: p.team_id, ownerIsHuman: p.human === 1, subjectTeamId: p.team_id,
      leagueId: p.league_id, district: p.district,
      title: `příspěvek trenéra ${p.manager_name ?? ""} (${p.team_name ?? "klub"})`.replace("  ", " "),
      context: `Trenér ${p.manager_name ?? "neznámý"} z klubu ${p.team_name ?? "?"} napsal: „${p.body}“`,
    };
  }

  if (ref.kind === "news") {
    const n = await db.prepare(
      `SELECT n.id, n.type, n.headline, n.body, n.team_id, n.league_id, n.journalist_id, l.district, t.name AS team_name,
              CASE WHEN t.id IS NULL THEN 0 ELSE ${HUMAN_TEAM("t")} END AS human
         FROM news n JOIN leagues l ON l.id = n.league_id LEFT JOIN teams t ON t.id = n.team_id
        WHERE n.id = ?`,
    ).bind(ref.id).first<{ type: string; headline: string; body: string; team_id: string | null; league_id: string; journalist_id: string | null; district: string | null; team_name: string | null; human: number }>()
      .catch((e) => { logger.warn({ module: M }, "cíl: článek", e); return null; });
    if (!n || !(n.type in NEWS_CATEGORY)) return null;
    return {
      key, kind: "news", feedKey: key, snippet: n.headline, journalistId: n.journalist_id, ownerTeamName: n.team_name,
      ownerTeamId: n.team_id, ownerIsHuman: n.human === 1, subjectTeamId: n.team_id,
      leagueId: n.league_id, district: n.district,
      title: n.headline,
      context: newsContext(n.type, n.headline, n.body),
    };
  }

  if (ref.kind === "bundle") {
    const rows = await transfersOfDay(db, ref.district, ref.date);
    if (rows.length === 0) return null;
    return {
      key, kind: "bundle", feedKey: key, snippet: `přestupy dne v okrese ${ref.district}`,
      ownerTeamId: null, ownerIsHuman: false, subjectTeamId: null,
      leagueId: rows[0].league_id, district: ref.district,
      title: `přestupy dne v okrese ${ref.district}`,
      context: `Přestupy dne v okrese ${ref.district}:\n${rows.slice(0, 15).map((r) => `- ${r.headline}`).join("\n")}`,
    };
  }

  if (ref.kind === "comment") {
    const c = await db.prepare(
      `SELECT c.id, c.team_id, c.author_kind, c.body, c.target_key, ${HUMAN_TEAM("t")} AS human
         FROM social_comments c LEFT JOIN teams t ON t.id = c.team_id
        WHERE c.id = ? AND c.deleted_at IS NULL AND c.removed_at IS NULL`,
    ).bind(ref.id).first<{ team_id: string | null; author_kind: string; body: string; target_key: string; human: number | null }>()
      .catch((e) => { logger.warn({ module: M }, "cíl: komentář", e); return null; });
    if (!c) return null;
    return {
      key, kind: "comment", feedKey: c.target_key, snippet: c.body,
      ownerTeamId: c.author_kind === "manager" ? c.team_id : null,
      ownerIsHuman: c.author_kind === "manager" && c.human === 1,
      subjectTeamId: c.team_id, leagueId: null, district: null,
      title: "komentář", context: c.body,
    };
  }

  const f = await db.prepare("SELECT id, body FROM fan_posts WHERE id = ?")
    .bind(ref.id).first<{ id: string; body: string }>()
    .catch((e) => { logger.warn({ module: M }, "cíl: hlas fanouška", e); return null; });
  if (!f) return null;
  return {
    key, kind: "fanpost", feedKey: key, snippet: f.body,
    ownerTeamId: null, ownerIsHuman: false, subjectTeamId: null,
    leagueId: null, district: null, title: "hlas fanouška", context: f.body,
  };
}

/** Text článku pro model: u rozhovoru úvod a odpovědi, jinak začátek textu. */
function newsContext(type: string, headline: string, body: string): string {
  if (type === "interview" || type === "post_match_interview" || type === "player_interview") {
    try {
      const j = JSON.parse(body) as { managerName?: string; playerName?: string; teamName?: string; article?: string; qa?: Array<{ q: string; a: string }> };
      const who = j.managerName ?? j.playerName ?? "?";
      const qa = (j.qa ?? []).slice(0, 4).map((x) => `Otázka: ${x.q}\n${who}: ${x.a}`).join("\n");
      return `Rozhovor ve Zpravodaji: ${headline}\n${who} (${j.teamName ?? "?"})\n${(j.article ?? "").slice(0, 500)}\n${qa}`;
    } catch (e) {
      logger.warn({ module: M }, "rozhovor pro model", e);
    }
  }
  return `${headline}\n${plainText(body).slice(0, 900)}`;
}

// ── Zápisy ──────────────────────────────────────────────────────────────────

async function countSince(db: D1Database, table: "social_posts" | "social_comments", userId: string, since: string): Promise<number> {
  const r = await db.prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE user_id = ? AND created_at >= ?`)
    .bind(userId, since).first<{ n: number }>()
    .catch((e) => { logger.warn({ module: M }, "limit psaní", e); return null; });
  return r?.n ?? 0;
}

export async function postsToday(db: D1Database, userId: string): Promise<number> {
  return countSince(db, "social_posts", userId, today());
}

export async function commentsToday(db: D1Database, userId: string): Promise<number> {
  return countSince(db, "social_comments", userId, today());
}

function mentionsJson(mentions: Mention[]): string | null {
  return mentions.length > 0 ? JSON.stringify(mentions) : null;
}

/**
 * Zapíše příspěvek. S `perDay` hlídá denní limit přímo v zápisu (počet dnešních
 * příspěvků člověka se čte ve stejném příkazu), takže ho souběžné požadavky
 * neobejdou. null = limit je vyčerpaný a nic se nezapsalo.
 */
export async function insertPost(db: D1Database, viewer: Viewer, body: string, mentions: Mention[] = [], perDay?: number): Promise<string | null> {
  const id = crypto.randomUUID();
  const res = await db.prepare(
    `INSERT INTO social_posts (id, user_id, team_id, body, mentions)
     SELECT ?, ?, ?, ?, ?
      WHERE (SELECT COUNT(*) FROM social_posts WHERE user_id = ? AND created_at >= ?) < ?`,
  ).bind(id, viewer.userId, viewer.teamId, body, mentionsJson(mentions), viewer.userId, today(), perDay ?? Number.MAX_SAFE_INTEGER).run();
  return (res.meta?.changes ?? 0) === 1 ? id : null;
}

/** Jméno trenéra klubu, jak ho ukazuje zeď. */
export async function managerName(db: D1Database, teamId: string): Promise<string> {
  const r = await db.prepare(`SELECT ${MANAGER_NAME("t.id")} AS name FROM teams t WHERE t.id = ?`)
    .bind(teamId).first<{ name: string | null }>()
    .catch((e) => { logger.warn({ module: M }, "jméno trenéra", e); return null; });
  return r?.name ?? "Trenér";
}

export interface MentionableTeam {
  teamId: string;
  teamName: string;
  managerName: string | null;
  district: string | null;
}

/**
 * Kluby, které jde označit: ty, které vede člověk (jen ten dostane oznámení).
 * Bez U21: patří stejnému trenérovi jako áčko a v seznamu by se zdvojoval.
 */
export async function mentionableTeams(db: D1Database, viewerTeamId: string): Promise<MentionableTeam[]> {
  const res = await db.prepare(
    `SELECT t.id, t.name, ${MANAGER_NAME("t.id")} AS manager_name, l.district
       FROM teams t LEFT JOIN leagues l ON l.id = t.league_id
      WHERE ${HUMAN_TEAM("t")} AND t.parent_team_id IS NULL AND t.id != ?
        AND t.name IS NOT NULL AND t.name != '' AND t.name NOT LIKE 'DELETED%'
      ORDER BY t.name LIMIT 500`,
  ).bind(viewerTeamId).all<{ id: string; name: string; manager_name: string | null; district: string | null }>()
    .catch((e) => { logger.warn({ module: M }, "kluby k označení", e); return { results: [] as never[] }; });
  return res.results.map((r) => ({ teamId: r.id, teamName: r.name, managerName: r.manager_name, district: r.district }));
}

/** Označení z požadavku ověří proti databázi: klub existuje, vede ho člověk a v textu stojí „@jméno“. */
export async function resolveMentions(db: D1Database, body: string, ids: string[], authorTeamId: string): Promise<Mention[]> {
  if (ids.length === 0) return [];
  const res = await db.prepare(
    `SELECT t.id, t.name FROM teams t WHERE t.id IN (${ids.map(() => "?").join(",")}) AND ${HUMAN_TEAM("t")}`,
  ).bind(...ids).all<{ id: string; name: string }>()
    .catch((e) => { logger.warn({ module: M }, "označené kluby", e); return { results: [] as never[] }; });
  const byId = new Map(res.results.map((r) => [r.id, r.name]));
  const candidates = ids.flatMap((id) => (byId.has(id) ? [{ teamId: id, name: byId.get(id)! }] : []));
  return pickMentions(body, candidates, authorTeamId);
}

/** Komentář trenéra. S `perDay` hlídá denní limit v zápisu stejně jako `insertPost`; null = vyčerpáno. */
export async function insertManagerComment(db: D1Database, viewer: Viewer, key: string, body: string, replyToId: string | null, mentions: Mention[] = [], perDay?: number): Promise<{ id: string; authorName: string } | null> {
  const who = await db.prepare(`SELECT ${MANAGER_NAME("t.id")} AS name, ${MANAGER_AVATAR("t.id")} AS avatar FROM teams t WHERE t.id = ?`)
    .bind(viewer.teamId).first<{ name: string | null; avatar: string | null }>()
    .catch((e) => { logger.warn({ module: M }, "jméno komentujícího", e); return null; });
  const id = crypto.randomUUID();
  const authorName = who?.name ?? "Trenér";
  const res = await db.prepare(
    `INSERT INTO social_comments (id, target_key, author_kind, user_id, team_id, author_name, author_avatar, reply_to_id, body, mentions)
     SELECT ?, ?, 'manager', ?, ?, ?, ?, ?, ?, ?
      WHERE (SELECT COUNT(*) FROM social_comments WHERE user_id = ? AND created_at >= ?) < ?`,
  ).bind(
    id, key, viewer.userId, viewer.teamId, authorName, who?.avatar ?? null, replyToId, body, mentionsJson(mentions),
    viewer.userId, today(), perDay ?? Number.MAX_SAFE_INTEGER,
  ).run();
  return (res.meta?.changes ?? 0) === 1 ? { id, authorName } : null;
}

export interface PersonaComment {
  /** Pevné id ze zprávy ve frontě: opakované doručení stejné zprávy komentář nezdvojí. */
  id?: string;
  key: string;
  authorKind: "fan" | "journalist";
  teamId: string | null;
  personaId: string;
  authorName: string;
  authorAvatar: string | null;
  replyToId: string | null;
  body: string;
}

export async function insertPersonaComment(db: D1Database, c: PersonaComment): Promise<string> {
  const id = c.id ?? crypto.randomUUID();
  await db.prepare(
    `INSERT OR IGNORE INTO social_comments (id, target_key, author_kind, team_id, persona_id, author_name, author_avatar, reply_to_id, body)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).bind(id, c.key, c.authorKind, c.teamId, c.personaId, c.authorName, c.authorAvatar, c.replyToId, c.body).run();
  return id;
}

/** Komentář, na který se odpovídá: musí patřit pod stejný příspěvek. */
export async function loadReplyTarget(db: D1Database, commentId: string, key: string): Promise<{ id: string; authorKind: string; teamId: string | null; personaId: string | null; userId: string | null; authorName: string; body: string } | null> {
  const r = await db.prepare(
    `SELECT id, author_kind, team_id, persona_id, user_id, author_name, body FROM social_comments
      WHERE id = ? AND target_key = ? AND deleted_at IS NULL AND removed_at IS NULL`,
  ).bind(commentId, key).first<{ id: string; author_kind: string; team_id: string | null; persona_id: string | null; user_id: string | null; author_name: string; body: string }>()
    .catch((e) => { logger.warn({ module: M }, "komentář, na který se odpovídá", e); return null; });
  if (!r) return null;
  return { id: r.id, authorKind: r.author_kind, teamId: r.team_id, personaId: r.persona_id, userId: r.user_id, authorName: r.author_name, body: r.body };
}

/** Smaže autor. Vrací false, když to není jeho nebo už je pryč. */
export async function softDeletePost(db: D1Database, viewer: Viewer, id: string): Promise<boolean> {
  const r = await db.prepare(
    "UPDATE social_posts SET deleted_at = strftime('%Y-%m-%dT%H:%M:%SZ','now') WHERE id = ? AND user_id = ? AND deleted_at IS NULL",
  ).bind(id, viewer.userId).run();
  return (r.meta?.changes ?? 0) > 0;
}

export async function softDeleteComment(db: D1Database, viewer: Viewer, id: string): Promise<boolean> {
  const r = await db.prepare(
    "UPDATE social_comments SET deleted_at = strftime('%Y-%m-%dT%H:%M:%SZ','now') WHERE id = ? AND user_id = ? AND author_kind = 'manager' AND deleted_at IS NULL",
  ).bind(id, viewer.userId).run();
  return (r.meta?.changes ?? 0) > 0;
}

/** Přepne lajk. Vrací nový stav a počet. */
export async function toggleLike(db: D1Database, userId: string, key: string): Promise<{ liked: boolean; count: number }> {
  const del = await db.prepare("DELETE FROM social_likes WHERE target_key = ? AND user_id = ?").bind(key, userId).run();
  let liked = false;
  if ((del.meta?.changes ?? 0) === 0) {
    await db.prepare("INSERT OR IGNORE INTO social_likes (target_key, user_id) VALUES (?, ?)").bind(key, userId).run();
    liked = true;
  }
  const c = await db.prepare("SELECT COUNT(*) AS n FROM social_likes WHERE target_key = ?").bind(key).first<{ n: number }>();
  return { liked, count: c?.n ?? 0 };
}

export async function addMute(db: D1Database, userId: string, m: Mute, label: string): Promise<void> {
  await db.prepare("INSERT OR REPLACE INTO social_mutes (user_id, kind, value, label) VALUES (?, ?, ?, ?)")
    .bind(userId, m.kind, m.value, label).run();
}

export async function removeMute(db: D1Database, userId: string, m: Mute): Promise<void> {
  await db.prepare("DELETE FROM social_mutes WHERE user_id = ? AND kind = ? AND value = ?")
    .bind(userId, m.kind, m.value).run();
}

/** Nahlášení. Jeden člověk nahlásí totéž jen jednou. */
export async function insertReport(db: D1Database, userId: string, key: string, reason: string | null): Promise<boolean> {
  const r = await db.prepare("INSERT OR IGNORE INTO social_reports (id, target_key, user_id, reason) VALUES (?, ?, ?, ?)")
    .bind(crypto.randomUUID(), key, userId, reason).run();
  return (r.meta?.changes ?? 0) > 0;
}

/** Po tolika nahlášeních od různých lidí se příspěvek nebo komentář sám skryje. */
export const REPORTS_TO_HIDE = 3;

function moderatedTable(key: string): { table: "social_posts" | "social_comments"; id: string } | null {
  const ref = parseTargetKey(key);
  if (!ref || (ref.kind !== "post" && ref.kind !== "comment")) return null;
  return { table: ref.kind === "post" ? "social_posts" : "social_comments", id: ref.id };
}

/** Kolik různých lidí cíl nahlásilo a admin o tom ještě nerozhodl. */
export async function openReportCount(db: D1Database, key: string): Promise<number> {
  const r = await db.prepare("SELECT COUNT(DISTINCT user_id) AS n FROM social_reports WHERE target_key = ? AND resolved_at IS NULL")
    .bind(key).first<{ n: number }>();
  return r?.n ?? 0;
}

/**
 * Skryje nahlášený cíl, jakmile ho nahlásili aspoň `REPORTS_TO_HIDE` různí lidé. Skrytí
 * je `removed_at` s nevyřízenými nahlášeními: všechna čtení už stažené věci neukazují
 * a admin o něm rozhodne (Stáhnout = zůstane, Nechat = `restoreAutoHidden`). Počet se
 * čte v témže příkazu jako zápis. true = právě teď se skrylo.
 */
export async function hideIfReported(db: D1Database, key: string): Promise<boolean> {
  const target = moderatedTable(key);
  if (!target) return false;
  const res = await db.prepare(
    `UPDATE ${target.table} SET removed_at = strftime('%Y-%m-%dT%H:%M:%SZ','now')
      WHERE id = ? AND removed_at IS NULL
        AND (SELECT COUNT(DISTINCT user_id) FROM social_reports WHERE target_key = ? AND resolved_at IS NULL) >= ?`,
  ).bind(target.id, key, REPORTS_TO_HIDE).run();
  return (res.meta?.changes ?? 0) === 1;
}

/** Admin nahlášení zamítl: co se skrylo samo po nahlášeních, se vrátí. Volat před vyřízením nahlášení. */
export async function restoreAutoHidden(db: D1Database, key: string): Promise<boolean> {
  const target = moderatedTable(key);
  if (!target) return false;
  const res = await db.prepare(
    `UPDATE ${target.table} SET removed_at = NULL
      WHERE id = ? AND removed_at IS NOT NULL
        AND EXISTS (SELECT 1 FROM social_reports WHERE target_key = ? AND resolved_at IS NULL)`,
  ).bind(target.id, key).run();
  return (res.meta?.changes ?? 0) === 1;
}

/** Stáhne cíl (admin). Vrací autora a text, ať jde uklidit citace z historie vztahů. */
export async function removeReported(db: D1Database, key: string): Promise<{ teamId: string | null; body: string } | null> {
  const target = moderatedTable(key);
  if (!target) return null;
  const row = await db.prepare(`SELECT team_id, body FROM ${target.table} WHERE id = ?`)
    .bind(target.id).first<{ team_id: string | null; body: string }>();
  if (!row) return null;
  await db.prepare(`UPDATE ${target.table} SET removed_at = strftime('%Y-%m-%dT%H:%M:%SZ','now') WHERE id = ? AND removed_at IS NULL`)
    .bind(target.id).run();
  return { teamId: row.team_id, body: row.body };
}

