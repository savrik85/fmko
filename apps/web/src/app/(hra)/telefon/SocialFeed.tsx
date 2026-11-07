"use client";

/**
 * Socky: společná zeď všech okresů.
 *
 * Zeď plní Zpravodaj (výsledky, rozhovory, drby, přestupy sloučené do denního
 * souhrnu okresu) a manažeři vlastními příspěvky. Pod vším se dá komentovat
 * a lajkovat, ozývají se i fanoušci a novináři. Vidět je všechno; co koho
 * nezajímá, skryje si (příspěvek, klub, okres nebo celou kategorii).
 *
 * Příspěvky manažerů mají v pořadí náskok a cokoli, pod čím se diskutuje,
 * vyplave nahoru, aby se lidi neztratili mezi automatickými zprávami.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Spinner } from "@/components/ui";
import { FaceAvatar } from "@/components/players/face-avatar";
import { apiFetch } from "@/lib/api";

type Category = "posts" | "results" | "transfers" | "interviews" | "gossip" | "season";

export interface FeedComment {
  id: string;
  key: string;
  authorKind: "manager" | "fan" | "journalist";
  authorName: string;
  authorAvatar: Record<string, unknown> | null;
  authorLabel: string | null;
  teamId: string | null;
  teamName: string | null;
  body: string;
  createdAt: string;
  replyToId: string | null;
  likeCount: number;
  liked: boolean;
  mine: boolean;
}

export interface FeedEntry {
  key: string;
  kind: "post" | "article" | "bundle";
  category: Category;
  newsType: string | null;
  createdAt: string;
  district: string | null;
  leagueName: string | null;
  teamId: string | null;
  teamName: string | null;
  authorName: string;
  authorAvatar: Record<string, unknown> | null;
  icon: string;
  headline: string | null;
  body: string | null;
  interview: {
    personName: string | null;
    personAvatar: Record<string, unknown> | null;
    teamName: string | null;
    article: string | null;
    qa: Array<{ q: string; a: string }>;
  } | null;
  lines: string[];
  likeCount: number;
  liked: boolean;
  commentCount: number;
  comments: FeedComment[];
  mine: boolean;
}

interface MuteRow { kind: "item" | "team" | "district" | "category"; value: string; label: string }

/** Musí sedět s CATEGORY_LABELS na API. */
const CATEGORY_LABELS: Record<Category, string> = {
  posts: "příspěvky manažerů",
  results: "výsledky a reportáže",
  transfers: "přestupy",
  interviews: "rozhovory",
  gossip: "drby a inzeráty",
  season: "noví trenéři a sezóna",
};

const POST_MAX = 1000;
const COMMENT_MAX = 500;
/** Kolik řádků souhrnu přestupů a výsledků kola je vidět před rozbalením. */
const LINES_PREVIEW = 4;

function timeAgo(iso: string): string {
  const min = Math.floor((Date.now() - Date.parse(iso)) / 60000);
  if (!Number.isFinite(min)) return "";
  if (min < 1) return "teď";
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h} h`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d} d`;
  return new Date(iso).toLocaleDateString("cs-CZ", { day: "numeric", month: "numeric" });
}

function initials(name: string): string {
  return name.split(" ").map((w) => w.replace(/[„“"]/g, "")[0]).filter(Boolean).slice(0, 2).join("").toUpperCase() || "?";
}

function Avatar({ avatar, name, icon, size = 40 }: { avatar: Record<string, unknown> | null; name: string; icon?: string; size?: number }) {
  const box = { width: size, height: size };
  if (avatar && Object.keys(avatar).length > 2) {
    return (
      <div className="rounded-full overflow-hidden bg-gray-100 shrink-0 flex items-center justify-center" style={box}>
        <FaceAvatar faceConfig={avatar} size={Math.round(size * 0.85)} />
      </div>
    );
  }
  if (icon) {
    return <div className="rounded-full bg-pitch-50 shrink-0 flex items-center justify-center text-lg" style={box}>{icon}</div>;
  }
  return (
    <div className="rounded-full bg-gray-200 text-ink-light shrink-0 flex items-center justify-center text-sm font-heading font-bold" style={box}>
      {initials(name)}
    </div>
  );
}

function TeamLink({ teamId, name }: { teamId: string | null; name: string | null }) {
  if (!name) return null;
  if (!teamId) return <span>{name}</span>;
  return <Link href={`/tym/${teamId}`} className="hover:underline">{name}</Link>;
}

/** Popisek pod jménem v komentáři: klub manažera, „fandí …“, „Zpravodaj“. Bez rodu, ať sedí u Báry i Franty. */
function CommentLabel({ c }: { c: FeedComment }) {
  if (c.authorKind === "manager") return <TeamLink teamId={c.teamId} name={c.teamName} />;
  if (c.authorKind === "fan") {
    return c.teamName ? <>fandí <TeamLink teamId={c.teamId} name={c.teamName} /></> : <>fanoušci</>;
  }
  return <>Zpravodaj</>;
}

interface MenuAction { label: string; danger?: boolean; run: () => void }

function Menu({ actions, onClose }: { actions: MenuAction[]; onClose: () => void }) {
  return (
    <div className="mt-2 rounded-lg border border-gray-200 bg-white overflow-hidden">
      {actions.map((a) => (
        <button
          key={a.label}
          onClick={() => { a.run(); }}
          className={`block w-full text-left px-3 py-2.5 text-sm border-b border-gray-100 last:border-b-0 hover:bg-gray-50 ${a.danger ? "text-card-red font-semibold" : "text-ink"}`}
        >
          {a.label}
        </button>
      ))}
      <button onClick={onClose} className="block w-full text-left px-3 py-2.5 text-sm text-muted hover:bg-gray-50">Zavřít</button>
    </div>
  );
}

function LikeButton({ liked, count, onClick }: { liked: boolean; count: number; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      aria-pressed={liked}
      className={`flex items-center gap-1 text-sm ${liked ? "text-pitch-600 font-semibold" : "text-muted hover:text-ink"}`}
    >
      <span aria-hidden>👍</span>
      <span>{liked ? "Líbí se ti" : "Líbí se"}{count > 0 ? ` · ${count}` : ""}</span>
    </button>
  );
}

interface ApiError { message?: string }
function errorText(e: unknown, fallback: string): string {
  const m = (e as ApiError)?.message;
  return m && m !== "API error" && m !== "Network error" ? m : fallback;
}

// ── Komentáře ───────────────────────────────────────────────────────────────

function CommentRow({
  c, teamId, replyName, onReply, onDeleted, onReported, onMuteTeam,
}: {
  c: FeedComment;
  teamId: string;
  replyName: string | null;
  onReply: (c: FeedComment) => void;
  onDeleted: (id: string) => void;
  onReported: () => void;
  onMuteTeam: (teamId: string, teamName: string) => void;
}) {
  const [liked, setLiked] = useState(c.liked);
  const [likes, setLikes] = useState(c.likeCount);
  const [menu, setMenu] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const like = async () => {
    try {
      const r = await apiFetch<{ liked: boolean; count: number }>(`/api/teams/${teamId}/social/likes`, {
        method: "POST", body: JSON.stringify({ key: c.key }),
      });
      setLiked(r.liked);
      setLikes(r.count);
    } catch (e) {
      console.error("lajk komentáře:", e);
    }
  };

  const remove = async () => {
    try {
      await apiFetch(`/api/teams/${teamId}/social/comments/${c.id}`, { method: "DELETE" });
      onDeleted(c.id);
    } catch (e) {
      console.error("smazání komentáře:", e);
      setNote(errorText(e, "Komentář se nepodařilo smazat."));
    }
  };

  const report = async () => {
    setMenu(false);
    try {
      await apiFetch(`/api/teams/${teamId}/social/reports`, { method: "POST", body: JSON.stringify({ key: c.key }) });
      setNote("Díky, nahlášení dostal správce hry.");
      onReported();
    } catch (e) {
      console.error("nahlášení komentáře:", e);
      setNote(errorText(e, "Nahlášení se nepodařilo."));
    }
  };

  const actions: MenuAction[] = [];
  if (c.mine) actions.push({ label: "Smazat komentář", danger: true, run: () => { setMenu(false); setConfirmDelete(true); } });
  if (!c.mine && c.key.startsWith("comment:")) actions.push({ label: "Nahlásit", run: report });
  if (!c.mine && c.authorKind === "manager" && c.teamId && c.teamName) {
    actions.push({ label: `Skrýt klub ${c.teamName}`, run: () => { setMenu(false); onMuteTeam(c.teamId!, c.teamName!); } });
  }

  return (
    <div className="flex gap-2 py-1.5">
      <Avatar avatar={c.authorAvatar} name={c.authorName} size={32} />
      <div className="min-w-0 flex-1">
        <div className="bg-gray-100 rounded-2xl px-3 py-2">
          <div className="text-sm font-heading font-bold text-ink leading-tight">
            {c.authorKind === "manager" && c.teamId
              ? <Link href={`/manazer/${c.teamId}`} className="hover:underline">{c.authorName}</Link>
              : c.authorName}
          </div>
          <div className="text-sm text-muted leading-tight"><CommentLabel c={c} /></div>
          <p className="text-base text-ink leading-snug mt-1 whitespace-pre-wrap break-words">
            {replyName && <span className="font-semibold text-pitch-600">{replyName} </span>}
            {c.body}
          </p>
        </div>
        <div className="flex items-center gap-4 px-2 mt-1 text-sm text-muted">
          <span>{timeAgo(c.createdAt)}</span>
          <LikeButton liked={liked} count={likes} onClick={like} />
          {c.key.startsWith("comment:") && (
            <button onClick={() => onReply(c)} className="hover:text-ink">Odpovědět</button>
          )}
          {actions.length > 0 && (
            <button onClick={() => setMenu((m) => !m)} aria-label="Další možnosti" className="ml-auto px-1 hover:text-ink">⋯</button>
          )}
        </div>
        {menu && <Menu actions={actions} onClose={() => setMenu(false)} />}
        {confirmDelete && (
          <div className="mt-2 flex items-center gap-2 text-sm">
            <span className="text-ink">Opravdu smazat?</span>
            <button onClick={remove} className="px-3 py-1.5 rounded-lg bg-card-red text-white font-semibold">Smazat</button>
            <button onClick={() => setConfirmDelete(false)} className="px-3 py-1.5 rounded-lg bg-gray-100 text-ink">Nechat</button>
          </div>
        )}
        {note && <p className="text-sm text-muted mt-1 px-2">{note}</p>}
      </div>
    </div>
  );
}

function CommentComposer({
  teamId, targetKey, replyTo, onCancelReply, onPosted, autoFocus,
}: {
  teamId: string;
  targetKey: string;
  replyTo: FeedComment | null;
  onCancelReply: () => void;
  onPosted: (comments: FeedComment[]) => void;
  autoFocus?: boolean;
}) {
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => { if (replyTo || autoFocus) ref.current?.focus(); }, [replyTo, autoFocus]);

  const send = async () => {
    const body = text.trim();
    if (!body || sending) return;
    setSending(true);
    setError(null);
    try {
      const r = await apiFetch<{ comments: FeedComment[] }>(`/api/teams/${teamId}/social/comments`, {
        method: "POST",
        body: JSON.stringify({ key: targetKey, body, replyToId: replyTo?.id ?? null }),
      });
      setText("");
      onCancelReply();
      onPosted(r.comments);
    } catch (e) {
      console.error("odeslání komentáře:", e);
      setError(errorText(e, "Komentář se nepodařilo odeslat."));
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="mt-1.5">
      {replyTo && (
        <div className="flex items-center gap-2 text-sm text-muted mb-1 px-1">
          <span>Odpovídáš: <span className="font-semibold text-ink">{replyTo.authorName}</span></span>
          <button onClick={onCancelReply} className="text-muted hover:text-ink" aria-label="Zrušit odpověď">✕</button>
        </div>
      )}
      <div className="flex items-end gap-2">
        <textarea
          ref={ref}
          value={text}
          onChange={(e) => setText(e.target.value.slice(0, COMMENT_MAX))}
          rows={1}
          placeholder={replyTo ? "Napiš odpověď…" : "Napiš komentář…"}
          className="flex-1 resize-none rounded-2xl border border-gray-200 bg-white px-3 py-2 text-base text-ink placeholder:text-muted-light focus:outline-none focus:border-pitch-500"
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void send(); } }}
        />
        <button
          onClick={send}
          disabled={!text.trim() || sending}
          className="shrink-0 px-3 py-2 rounded-2xl bg-pitch-600 text-white text-sm font-semibold disabled:opacity-40"
        >
          {sending ? "…" : "Poslat"}
        </button>
      </div>
      {error && <p className="text-sm text-card-red mt-1 px-1">{error}</p>}
    </div>
  );
}

// ── Karta ───────────────────────────────────────────────────────────────────

function Interview({ it, expanded }: { it: NonNullable<FeedEntry["interview"]>; expanded: boolean }) {
  const qa = expanded ? it.qa : it.qa.slice(0, 2);
  return (
    <div className="mt-2 space-y-2">
      {it.article && (
        <p className={`text-base text-ink-light leading-snug ${expanded ? "" : "line-clamp-3"}`}>{it.article}</p>
      )}
      {qa.map((x, i) => (
        <div key={i} className="text-base leading-snug">
          <p className="text-muted">{x.q}</p>
          <p className="text-ink mt-0.5">
            <span className="font-semibold">{it.personName ?? "Odpověď"}:</span> {x.a}
          </p>
        </div>
      ))}
    </div>
  );
}

function FeedCard({
  item, teamId, autoOpen, expectReplies, onMute, onRemoved,
}: {
  item: FeedEntry;
  teamId: string;
  autoOpen?: boolean;
  /** Právě zveřejněný příspěvek: odpovědi fanoušků přijdou za pár vteřin, karta si je dočte sama. */
  expectReplies?: boolean;
  onMute: (mute: { kind: MuteRow["kind"]; value: string }) => void;
  onRemoved: (key: string) => void;
}) {
  const [liked, setLiked] = useState(item.liked);
  const [likes, setLikes] = useState(item.likeCount);
  const [comments, setComments] = useState<FeedComment[]>(item.comments);
  const [count, setCount] = useState(item.commentCount);
  const [threadOpen, setThreadOpen] = useState(false);
  const [loadingThread, setLoadingThread] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [menu, setMenu] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [replyTo, setReplyTo] = useState<FeedComment | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [composerOpen, setComposerOpen] = useState(false);

  const openThread = useCallback(async () => {
    setThreadOpen(true);
    setLoadingThread(true);
    try {
      const r = await apiFetch<{ comments: FeedComment[] }>(`/api/teams/${teamId}/social/comments?key=${encodeURIComponent(item.key)}`);
      setComments(r.comments);
      setCount(r.comments.length);
    } catch (e) {
      console.error("načtení komentářů:", e);
      setNote("Komentáře se nepodařilo načíst.");
    } finally {
      setLoadingThread(false);
    }
  }, [teamId, item.key]);

  useEffect(() => {
    if (autoOpen) { setComposerOpen(true); void openThread(); }
  }, [autoOpen, openThread]);

  useEffect(() => {
    if (!expectReplies) return;
    const timers = [8000, 20000].map((ms) => window.setTimeout(() => { void openThread(); }, ms));
    return () => timers.forEach((t) => window.clearTimeout(t));
  }, [expectReplies, openThread]);

  /** Fanoušci a novináři odpovídají až po chvíli: diskuse se po odeslání ještě jednou dočte. */
  const refreshLater = useCallback(() => {
    window.setTimeout(() => { void openThread(); }, 9000);
  }, [openThread]);

  const like = async () => {
    try {
      const r = await apiFetch<{ liked: boolean; count: number }>(`/api/teams/${teamId}/social/likes`, {
        method: "POST", body: JSON.stringify({ key: item.key }),
      });
      setLiked(r.liked);
      setLikes(r.count);
    } catch (e) {
      console.error("lajk příspěvku:", e);
    }
  };

  const removePost = async () => {
    try {
      await apiFetch(`/api/teams/${teamId}/social/posts/${item.key.replace(/^post:/, "")}`, { method: "DELETE" });
      onRemoved(item.key);
    } catch (e) {
      console.error("smazání příspěvku:", e);
      setNote(errorText(e, "Příspěvek se nepodařilo smazat."));
    }
  };

  const report = async () => {
    setMenu(false);
    try {
      await apiFetch(`/api/teams/${teamId}/social/reports`, { method: "POST", body: JSON.stringify({ key: item.key }) });
      setNote("Díky, nahlášení dostal správce hry.");
    } catch (e) {
      console.error("nahlášení příspěvku:", e);
      setNote(errorText(e, "Nahlášení se nepodařilo."));
    }
  };

  const actions: MenuAction[] = [];
  if (item.mine) {
    actions.push({ label: "Smazat příspěvek", danger: true, run: () => { setMenu(false); setConfirmDelete(true); } });
  } else {
    actions.push({ label: "Skrýt tenhle příspěvek", run: () => onMute({ kind: "item", value: item.key }) });
    if (item.teamId && item.teamName && item.teamId !== teamId) {
      actions.push({ label: `Skrýt klub ${item.teamName}`, run: () => onMute({ kind: "team", value: item.teamId! }) });
    }
    if (item.district) actions.push({ label: `Skrýt okres ${item.district}`, run: () => onMute({ kind: "district", value: item.district! }) });
    if (item.category !== "posts") {
      actions.push({ label: `Skrýt všechny ${CATEGORY_LABELS[item.category]}`, run: () => onMute({ kind: "category", value: item.category }) });
    }
    if (item.kind === "post") actions.push({ label: "Nahlásit", run: report });
  }

  const replyNames = new Map(comments.map((c) => [c.id, c.authorName]));
  const shownComments = threadOpen ? comments : comments.slice(-2);
  const hiddenCount = Math.max(0, count - shownComments.length);
  // Výsledky kola i souhrn přestupů se zkrátí, ať jedna automatická zpráva nezabere celý displej.
  const collapsible = item.kind === "bundle" || item.newsType === "round_results";
  const lines = collapsible && !expanded ? item.lines.slice(0, LINES_PREVIEW) : item.lines;
  const canExpand = (collapsible && item.lines.length > LINES_PREVIEW)
    || (item.interview && (item.interview.qa.length > 2 || (item.interview.article ?? "").length > 160))
    || (item.kind === "article" && !item.interview && (item.body ?? "").length > 220);

  return (
    <article className={`bg-white px-3 pt-3 pb-2 ${item.kind === "post" ? "border-l-4 border-l-pitch-500" : ""}`}>
      {/* Hlavička */}
      <div className="flex gap-2.5 items-start">
        {item.kind === "post"
          ? <Avatar avatar={item.authorAvatar} name={item.authorName} />
          : <Avatar avatar={item.interview?.personAvatar ?? null} name={item.authorName} icon={item.icon} />}
        <div className="min-w-0 flex-1">
          <div className="text-base font-heading font-bold text-ink leading-tight">
            {item.kind === "post" && item.teamId
              ? <Link href={`/manazer/${item.teamId}`} className="hover:underline">{item.authorName}</Link>
              : item.interview?.personName ?? item.authorName}
          </div>
          <div className="text-sm text-muted leading-tight mt-0.5">
            {item.kind === "post"
              ? <><TeamLink teamId={item.teamId} name={item.teamName} />{item.district ? ` · ${item.district}` : ""}</>
              : <>{item.interview ? <>Zpravodaj{item.teamName ? <> · <TeamLink teamId={item.teamId} name={item.teamName} /></> : null}</> : (item.leagueName ?? (item.district ? `okres ${item.district}` : "Zpravodaj"))}</>}
            {" · "}{timeAgo(item.createdAt)}
          </div>
        </div>
        <button onClick={() => setMenu((m) => !m)} aria-label="Další možnosti" className="shrink-0 w-8 h-8 -mr-1 rounded-full text-muted hover:bg-gray-100 text-lg leading-none">⋯</button>
      </div>
      {menu && <Menu actions={actions} onClose={() => setMenu(false)} />}
      {confirmDelete && (
        <div className="mt-2 flex items-center gap-2 text-sm">
          <span className="text-ink">Opravdu smazat příspěvek?</span>
          <button onClick={removePost} className="px-3 py-1.5 rounded-lg bg-card-red text-white font-semibold">Smazat</button>
          <button onClick={() => setConfirmDelete(false)} className="px-3 py-1.5 rounded-lg bg-gray-100 text-ink">Nechat</button>
        </div>
      )}

      {/* Obsah */}
      <div className="mt-2">
        {item.headline && (
          <h3 className="text-base font-heading font-bold text-ink leading-snug">
            {item.kind !== "post" && !item.interview && <span className="mr-1">{item.icon}</span>}
            {item.headline}
          </h3>
        )}
        {item.kind === "post" && item.body && (
          <p className="text-base text-ink leading-snug whitespace-pre-wrap break-words">{item.body}</p>
        )}
        {item.kind === "article" && item.body && (
          <p className={`text-base text-ink-light leading-snug mt-1 whitespace-pre-wrap break-words ${expanded ? "" : "line-clamp-4"}`}>{item.body}</p>
        )}
        {item.interview && <Interview it={item.interview} expanded={expanded} />}
        {lines.length > 0 && (
          <ul className="mt-1.5 divide-y divide-gray-100">
            {lines.map((l, i) => <li key={i} className="py-1.5 text-base text-ink leading-snug">{l}</li>)}
          </ul>
        )}
        {canExpand && (
          <button onClick={() => setExpanded((x) => !x)} className="mt-1 text-sm text-pitch-600 font-semibold hover:underline">
            {expanded
              ? "Méně"
              : item.kind === "bundle"
                ? `Další přestupy (${item.lines.length - LINES_PREVIEW})`
                : item.newsType === "round_results" ? `Všechny výsledky (${item.lines.length})` : "Číst dál"}
          </button>
        )}
      </div>

      {/* Lajky a komentáře */}
      <div className="flex items-center gap-5 mt-2 pt-2 border-t border-gray-100">
        <LikeButton liked={liked} count={likes} onClick={like} />
        <button onClick={() => { setComposerOpen(true); if (!threadOpen) void openThread(); }} className="flex items-center gap-1 text-sm text-muted hover:text-ink">
          <span aria-hidden>💬</span>
          <span>Komentovat{count > 0 ? ` · ${count}` : ""}</span>
        </button>
      </div>

      {(shownComments.length > 0 || threadOpen) && (
        <div className="mt-1">
          {hiddenCount > 0 && !threadOpen && (
            <button onClick={() => void openThread()} className="text-sm text-muted font-semibold hover:text-ink py-1">
              Zobrazit další komentáře ({hiddenCount})
            </button>
          )}
          {loadingThread && comments.length === 0 && <div className="py-2"><Spinner /></div>}
          {shownComments.map((c) => (
            <CommentRow
              key={c.key}
              c={c}
              teamId={teamId}
              replyName={c.replyToId ? replyNames.get(c.replyToId) ?? null : null}
              onReply={(x) => { setComposerOpen(true); setReplyTo(x); }}
              onDeleted={(id) => { setComments((cs) => cs.filter((x) => x.id !== id)); setCount((n) => Math.max(0, n - 1)); }}
              onReported={() => undefined}
              onMuteTeam={(id) => onMute({ kind: "team", value: id })}
            />
          ))}
        </div>
      )}
      {composerOpen && (
        <CommentComposer
          teamId={teamId}
          targetKey={item.key}
          replyTo={replyTo}
          autoFocus={!autoOpen}
          onCancelReply={() => setReplyTo(null)}
          onPosted={(cs) => { setComments(cs); setCount(cs.length); setThreadOpen(true); refreshLater(); }}
        />
      )}
      {note && <p className="text-sm text-muted mt-1">{note}</p>}
    </article>
  );
}

// ── Nový příspěvek a skryté ─────────────────────────────────────────────────

function PostComposer({ teamId, onPosted }: { teamId: string; onPosted: (item: FeedEntry | null) => void }) {
  const [text, setText] = useState("");
  const [open, setOpen] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const send = async () => {
    const body = text.trim();
    if (!body || sending) return;
    setSending(true);
    setError(null);
    try {
      const r = await apiFetch<{ item: FeedEntry | null }>(`/api/teams/${teamId}/social/posts`, {
        method: "POST", body: JSON.stringify({ body }),
      });
      setText("");
      setOpen(false);
      onPosted(r.item);
    } catch (e) {
      console.error("nový příspěvek:", e);
      setError(errorText(e, "Příspěvek se nepodařilo zveřejnit."));
    } finally {
      setSending(false);
    }
  };

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="w-full text-left bg-white px-3 py-3 text-base text-muted border-b border-gray-100">
        Co máš na srdci, trenére?
      </button>
    );
  }
  return (
    <div className="bg-white px-3 py-3 border-b border-gray-100">
      <textarea
        autoFocus
        value={text}
        onChange={(e) => setText(e.target.value.slice(0, POST_MAX))}
        rows={4}
        placeholder="Napiš, co si myslíš o kole, přestupech nebo soupeřích. Uvidí to trenéři ze všech okresů."
        className="w-full resize-none rounded-lg border border-gray-200 px-3 py-2 text-base text-ink placeholder:text-muted-light focus:outline-none focus:border-pitch-500"
      />
      <div className="flex items-center gap-2 mt-2">
        <span className="text-sm text-muted">{text.length}/{POST_MAX}</span>
        <button onClick={() => { setOpen(false); setError(null); }} className="ml-auto px-3 py-2 rounded-lg bg-gray-100 text-ink text-sm">Zrušit</button>
        <button onClick={send} disabled={!text.trim() || sending} className="px-4 py-2 rounded-lg bg-pitch-600 text-white text-sm font-semibold disabled:opacity-40">
          {sending ? "Zveřejňuji…" : "Zveřejnit"}
        </button>
      </div>
      {error && <p className="text-sm text-card-red mt-1">{error}</p>}
    </div>
  );
}

function MutesPanel({ teamId, onClose, onChanged }: { teamId: string; onClose: () => void; onChanged: () => void }) {
  const [mutes, setMutes] = useState<MuteRow[] | null>(null);

  useEffect(() => {
    apiFetch<{ mutes: MuteRow[] }>(`/api/teams/${teamId}/social/mutes`)
      .then((r) => setMutes(r.mutes))
      .catch((e) => { console.error("skryté v Sockách:", e); setMutes([]); });
  }, [teamId]);

  const unmute = async (m: MuteRow) => {
    try {
      await apiFetch(`/api/teams/${teamId}/social/mutes/remove`, { method: "POST", body: JSON.stringify({ kind: m.kind, value: m.value }) });
      setMutes((list) => (list ?? []).filter((x) => !(x.kind === m.kind && x.value === m.value)));
      onChanged();
    } catch (e) {
      console.error("vrácení skrytého:", e);
    }
  };

  return (
    <div className="bg-white border-b border-gray-200 px-3 py-3">
      <div className="flex items-center justify-between mb-2">
        <span className="font-heading font-bold text-base text-ink">Co máš skryté</span>
        <button onClick={onClose} className="text-sm text-muted hover:text-ink">Zavřít</button>
      </div>
      {mutes === null ? <Spinner /> : mutes.length === 0 ? (
        <p className="text-sm text-muted">Nic. Vidíš všechno ze všech okresů. Skrýt jde cokoli přes ⋯ u příspěvku.</p>
      ) : (
        <ul className="divide-y divide-gray-100">
          {mutes.map((m) => (
            <li key={`${m.kind}:${m.value}`} className="flex items-center gap-2 py-2">
              <span className="text-base text-ink flex-1 min-w-0 break-words">{m.label}</span>
              <button onClick={() => unmute(m)} className="shrink-0 px-3 py-1.5 rounded-lg bg-gray-100 text-ink text-sm font-semibold">Vrátit</button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ── Zeď ─────────────────────────────────────────────────────────────────────

function matchesMute(item: FeedEntry, m: { kind: MuteRow["kind"]; value: string }): boolean {
  if (item.mine) return false;
  if (m.kind === "item") return item.key === m.value;
  if (m.kind === "team") return item.teamId === m.value;
  if (m.kind === "district") return item.district === m.value;
  return item.category === m.value;
}

export function SocialFeed({ teamId, focusKey }: { teamId: string; focusKey?: string | null }) {
  const [items, setItems] = useState<FeedEntry[] | null>(null);
  const [nextBefore, setNextBefore] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [focus, setFocus] = useState<FeedEntry | null>(null);
  const [focusMissing, setFocusMissing] = useState(false);
  const [mutesOpen, setMutesOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [freshKey, setFreshKey] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const r = await apiFetch<{ items: FeedEntry[]; nextBefore: string | null }>(`/api/teams/${teamId}/social/feed`);
      setItems(r.items);
      setNextBefore(r.nextBefore);
    } catch (e) {
      console.error("načtení Socek:", e);
      setError("Socky se nepodařilo načíst.");
      setItems([]);
    }
  }, [teamId]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    if (!focusKey) return;
    setFocusMissing(false);
    apiFetch<{ item: FeedEntry }>(`/api/teams/${teamId}/social/item?key=${encodeURIComponent(focusKey)}`)
      .then((r) => setFocus(r.item))
      // Smazaný nebo stažený příspěvek je běžný stav, ne chyba aplikace.
      .catch((e) => { console.warn("příspěvek z oznámení:", e); setFocusMissing(true); });
  }, [teamId, focusKey]);

  const more = async () => {
    if (!nextBefore || loadingMore) return;
    setLoadingMore(true);
    try {
      const r = await apiFetch<{ items: FeedEntry[]; nextBefore: string | null }>(
        `/api/teams/${teamId}/social/feed?before=${encodeURIComponent(nextBefore)}`,
      );
      setItems((list) => {
        const have = new Set((list ?? []).map((i) => i.key));
        return [...(list ?? []), ...r.items.filter((i) => !have.has(i.key))];
      });
      setNextBefore(r.nextBefore);
    } catch (e) {
      console.error("starší Socky:", e);
      setError("Starší příspěvky se nepodařilo načíst.");
    } finally {
      setLoadingMore(false);
    }
  };

  const mute = async (m: { kind: MuteRow["kind"]; value: string }) => {
    try {
      const r = await apiFetch<{ label: string }>(`/api/teams/${teamId}/social/mutes`, { method: "POST", body: JSON.stringify(m) });
      setItems((list) => (list ?? []).filter((i) => !matchesMute(i, m)));
      if (focus && matchesMute(focus, m)) setFocus(null);
      setNotice(`Skryto: ${r.label}. Vrátit to jde přes „Skryté“ nahoře.`);
    } catch (e) {
      console.error("skrytí v Sockách:", e);
      setNotice(errorText(e, "Skrýt se to nepodařilo."));
    }
  };

  const removed = (key: string) => {
    setItems((list) => (list ?? []).filter((i) => i.key !== key));
    if (focus?.key === key) setFocus(null);
  };

  const visible = (items ?? []).filter((i) => i.key !== focus?.key);

  return (
    <div className="flex-1 min-h-0 overflow-y-auto bg-paper">
      <div className="flex items-center gap-2 px-3 py-2 bg-white border-b border-gray-100">
        <span className="text-sm text-muted flex-1">Všechny okresy</span>
        <button onClick={() => setMutesOpen((o) => !o)} className="text-sm text-pitch-600 font-semibold hover:underline">Skryté</button>
      </div>
      {mutesOpen && <MutesPanel teamId={teamId} onClose={() => setMutesOpen(false)} onChanged={() => { setNotice(null); void load(); }} />}

      <PostComposer
        teamId={teamId}
        onPosted={(item) => {
          // Nový příspěvek patří úplně nahoru, i nad příspěvek, na který vedlo oznámení.
          setFocus(null);
          if (item) {
            setItems((list) => [item, ...(list ?? []).filter((i) => i.key !== item.key)]);
            setFreshKey(item.key);
          }
          setNotice("Zveřejněno. Fanoušci se k tomu brzy vyjádří.");
        }}
      />

      {notice && (
        <div className="px-3 py-2 bg-pitch-50 text-sm text-pitch-700 flex items-start gap-2">
          <span className="flex-1">{notice}</span>
          <button onClick={() => setNotice(null)} aria-label="Zavřít" className="text-pitch-700">✕</button>
        </div>
      )}
      {error && <div className="px-3 py-2 bg-danger-soft text-sm text-card-red">{error}</div>}

      {focusMissing && <div className="px-3 py-2 bg-gray-100 text-sm text-muted">Příspěvek z oznámení už není k dispozici.</div>}
      {focus && (
        <div className="border-b-4 border-pitch-100">
          <FeedCard key={`focus-${focus.key}`} item={focus} teamId={teamId} autoOpen onMute={mute} onRemoved={removed} />
        </div>
      )}

      {items === null ? (
        <div className="flex items-center justify-center h-40"><Spinner /></div>
      ) : visible.length === 0 && !focus ? (
        <div className="p-6 text-center text-muted">
          <div className="text-3xl mb-2">🗣️</div>
          <p className="text-sm">Zatím tu nic není. Napiš první příspěvek, nebo si vrať něco ze skrytých.</p>
        </div>
      ) : (
        <div className="space-y-2 py-2">
          {visible.map((item) => (
            <FeedCard key={item.key} item={item} teamId={teamId} expectReplies={item.key === freshKey} onMute={mute} onRemoved={removed} />
          ))}
          {nextBefore ? (
            <div className="px-3 pb-3">
              <button onClick={more} disabled={loadingMore} className="w-full py-2.5 rounded-lg bg-white border border-gray-200 text-base text-ink font-semibold disabled:opacity-50">
                {loadingMore ? "Načítám…" : "Starší příspěvky"}
              </button>
            </div>
          ) : (
            <p className="text-center text-sm text-muted py-3">Starší příspěvky už nejsou.</p>
          )}
        </div>
      )}
    </div>
  );
}
