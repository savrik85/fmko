"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useTeam } from "@/context/team-context";
import { apiFetch, type Team } from "@/lib/api";
import { Spinner } from "@/components/ui";

interface Classified {
  id: string;
  teamId: string;
  teamName: string;
  category: string;
  categoryLabel: string;
  categoryIcon: string;
  message: string;
  cost: number;
  createdAt: string;
  expiresAt: string;
  isOwn: boolean;
}

interface ClassifiedCategory {
  key: string;
  label: string;
  icon: string;
}

interface Article {
  id: string;
  type: string;
  headline: string;
  body: string;
  icon: string;
  date: string;
}

/** Parse **bold** markdown in text */
function renderMarkdown(text: string): React.ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return <strong key={i} className="font-heading font-bold text-ink">{part.slice(2, -2)}</strong>;
    }
    return part;
  });
}

function formatDate(iso: string): string {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("cs", { day: "numeric", month: "long", year: "numeric" });
}

function timeAgo(iso: string): string {
  if (!iso) return "";
  // SQLite datetime('now') ukládá UTC bez Z suffixu — přidáme ho
  const utcIso = iso.endsWith("Z") || iso.includes("+") ? iso : iso + "Z";
  const diff = Date.now() - new Date(utcIso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Právě teď";
  if (mins < 60) return `Před ${mins} min`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `Před ${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `Před ${days} dny`;
  return new Date(iso).toLocaleDateString("cs", { day: "numeric", month: "short" });
}

interface LeagueOption { id: string; name: string; district: string; team_count: number }

export default function NewsPage() {
  const { teamId } = useTeam();
  const [articles, setArticles] = useState<Article[]>([]);
  const [team, setTeam] = useState<Team | null>(null);
  const [classifieds, setClassifieds] = useState<Classified[]>([]);
  const [categories, setCategories] = useState<ClassifiedCategory[]>([]);
  const [adCost, setAdCost] = useState(500);
  const [showAdForm, setShowAdForm] = useState(false);
  const [adCategory, setAdCategory] = useState("general");
  const [adMessage, setAdMessage] = useState("");
  const [adSubmitting, setAdSubmitting] = useState(false);
  const [adError, setAdError] = useState("");
  const [loading, setLoading] = useState(true);

  // League picker for viewing other league's news
  const [allLeagues, setAllLeagues] = useState<LeagueOption[]>([]);
  const [selectedLeagueId, setSelectedLeagueId] = useState<string | null>(null);
  const isOtherLeague = selectedLeagueId !== null;

  useEffect(() => {
    apiFetch<{ leagues: LeagueOption[] }>("/api/leagues")
      .then((data) => setAllLeagues(data.leagues))
      .catch((e) => console.error("fetch leagues:", e));
  }, []);

  const loadClassifieds = () => {
    if (!teamId) return;
    apiFetch<{ classifieds: Classified[]; categories: ClassifiedCategory[]; cost: number }>(`/api/teams/${teamId}/classifieds`)
      .then((data) => {
        setClassifieds(data.classifieds);
        setCategories(data.categories);
        setAdCost(data.cost);
      }).catch((e) => console.error("fetch classifieds:", e));
  };

  useEffect(() => {
    if (!teamId) return;
    Promise.all([
      apiFetch<{ articles: Article[] }>(`/api/teams/${teamId}/news`),
      apiFetch<Team>(`/api/teams/${teamId}`),
    ]).then(([data, t]) => {
      setArticles(data.articles);
      setTeam(t);
      setLoading(false);
    }).catch(() => setLoading(false));
    loadClassifieds();
  }, [teamId]);

  // Load other league news when selected
  useEffect(() => {
    if (!selectedLeagueId) return;
    setLoading(true);
    apiFetch<{ articles: Article[] }>(`/api/leagues/${selectedLeagueId}/news`)
      .then((data) => {
        setArticles(data.articles);
        setLoading(false);
      }).catch(() => setLoading(false));
  }, [selectedLeagueId]);

  const handleLeagueChange = (leagueId: string) => {
    if (leagueId === "own") {
      setSelectedLeagueId(null);
      if (teamId) {
        setLoading(true);
        apiFetch<{ articles: Article[] }>(`/api/teams/${teamId}/news`)
          .then((data) => { setArticles(data.articles); setLoading(false); })
          .catch(() => setLoading(false));
      }
    } else {
      setSelectedLeagueId(leagueId);
    }
  };

  const submitAd = async () => {
    if (!teamId) return;
    setAdSubmitting(true);
    setAdError("");
    try {
      const res = await apiFetch<{ ok: boolean; error?: string; newBudget?: number }>(`/api/teams/${teamId}/classifieds`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ category: adCategory, message: adMessage }),
      });
      if (res.ok) {
        setAdMessage("");
        setShowAdForm(false);
        loadClassifieds();
        // Update team budget locally
        if (team && res.newBudget != null) {
          setTeam({ ...team, budget: res.newBudget });
        }
      }
    } catch (e: unknown) {
      setAdError((e as Error).message || "Chyba při vytváření inzerátu");
    }
    setAdSubmitting(false);
  };

  const deleteAd = async (id: string) => {
    if (!teamId) return;
    await apiFetch(`/api/teams/${teamId}/classifieds/${id}`, { method: "DELETE" }).catch((e) => console.error("delete classified:", e));
    loadClassifieds();
  };

  if (loading) return <div className="page-container flex items-center justify-center min-h-[50vh]"><Spinner /></div>;
  if (!team) return <div className="page-container">Tým nenalezen.</div>;

  // Separate articles by type
  const matchArticles = articles.filter((a) => a.type === "match");
  const aiReportArticles = articles.filter((a) => a.type === "ai_report");
  const roundArticles = articles.filter((a) => a.type === "round_results").slice(0, 1);
  const standingArticles = articles.filter((a) => a.type === "standing");
  const otherArticles = articles.filter((a) => !["match", "round_results", "standing", "ai_report"].includes(a.type));

  // Lead story = latest AI report only
  const leadStory = aiReportArticles[0] || matchArticles[0] || standingArticles[0] || articles[0];
  const olderAiReports = aiReportArticles.slice(1);
  const secondaryStories = matchArticles.slice(leadStory?.type === "match" ? 1 : 0, 3);
  const restArticles = [...otherArticles, ...matchArticles.slice(3)];

  const today = new Date().toLocaleDateString("cs", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  const selectedLeague = selectedLeagueId ? allLeagues.find(l => l.id === selectedLeagueId) : null;
  const district = isOtherLeague ? (selectedLeague?.district || "Praha") : (team.district || "");
  const newspaperName = district === "Praha" ? "Pražský Zpravodaj" : `Okresní Zpravodaj`;

  return (
    <div className="page-container">

      {/* League picker */}
      {allLeagues.length > 1 && (
        <div className="flex items-center gap-3 mb-4">
          <span className="text-sm text-muted font-medium">Zobrazit zpravodaj:</span>
          <select
            value={selectedLeagueId ?? "own"}
            onChange={(e) => handleLeagueChange(e.target.value)}
            className="text-sm bg-white border border-border rounded-lg px-3 py-2 font-medium"
          >
            <option value="own">Můj okres</option>
            {allLeagues.map((l) => (
              <option key={l.id} value={l.id}>{l.name}</option>
            ))}
          </select>
        </div>
      )}

      {/* ═══ Newspaper Masthead ═══ */}
      <div className="border-b-4 border-double border-ink pb-3 mb-1">
        <div className="flex items-end justify-between">
          <div className="text-[10px] uppercase tracking-widest text-muted">{district}</div>
          <div className="text-[10px] uppercase tracking-widest text-muted">Sezóna 1</div>
        </div>
        <h1 className="font-heading font-[900] text-3xl sm:text-4xl text-center tracking-tight leading-none my-2" style={{ fontVariant: "small-caps" }}>
          {newspaperName}
        </h1>
        <div className="flex items-center justify-between">
          <div className="text-[11px] text-muted">{today}</div>
          <div className="text-[11px] text-muted italic">Nezávislé noviny {district === "Praha" ? "pražského" : "okresního"} fotbalu</div>
        </div>
      </div>
      <div className="border-b border-ink mb-5" />

      {articles.length === 0 ? (
        <div className="text-center text-muted py-16 italic">
          Redakce zatím nemá žádné zprávy. Odehraj první zápas a noviny se rozjedou!
        </div>
      ) : (
        <div className="space-y-5">

          {/* ═══ Lead story — full width ═══ */}
          {leadStory && (
            <div className="border-b border-gray-200 pb-5">
              <ArticleWrapper article={leadStory}>
                {leadStory.type === "ai_report" ? (
                  <div>
                    <div className="text-xs uppercase tracking-widest text-muted mb-2 text-center">Komentář kola</div>
                    <h2 className="font-heading font-[900] text-2xl sm:text-3xl leading-tight mb-4 text-center">
                      {leadStory.headline}
                    </h2>
                    <div className="text-base text-ink-light leading-relaxed space-y-3 columns-1 sm:columns-2 gap-8">
                      {leadStory.body.split("\n").filter(Boolean).map((p, i) => (
                        <p key={i} className="break-inside-avoid">{renderMarkdown(p)}</p>
                      ))}
                    </div>
                    <div className="text-xs text-muted mt-3 italic text-center">{timeAgo(leadStory.date)}</div>
                  </div>
                ) : (
                  <div className="text-center max-w-3xl mx-auto">
                    <div className="text-xs uppercase tracking-widest text-muted mb-2">
                      {leadStory.type === "match" ? "Zápasová zpráva" : leadStory.type === "standing" ? "Tabulka" : "Aktualita"}
                    </div>
                    <h2 className="font-heading font-[900] text-2xl sm:text-3xl leading-tight mb-3 hover:underline decoration-2 underline-offset-4">
                      {leadStory.headline}
                    </h2>
                    <p className="text-base text-ink-light leading-relaxed max-w-xl mx-auto">
                      {leadStory.body}
                    </p>
                    <div className="text-xs text-muted mt-3 italic">{timeAgo(leadStory.date)}</div>
                  </div>
                )}
              </ArticleWrapper>
            </div>
          )}

          {/* ═══ Older AI reports ═══ */}
          {olderAiReports.length > 0 && (
            <div className="border-b border-gray-200 pb-4">
              <div className="text-[10px] uppercase tracking-widest text-muted mb-2">Starší komentáře</div>
              <div className="space-y-1.5">
                {olderAiReports.map((a) => (
                  <div key={a.id} className="flex items-baseline gap-3 text-sm">
                    <span className="text-muted shrink-0">{a.icon}</span>
                    <span className="font-heading font-bold truncate">{a.headline}</span>
                    <span className="text-xs text-muted shrink-0 ml-auto">{timeAgo(a.date)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ═══ Secondary stories — 2 or 3 column ═══ */}
          {secondaryStories.length > 0 && (
            <div className={`grid gap-5 border-b border-gray-200 pb-5 ${secondaryStories.length >= 2 ? "grid-cols-1 sm:grid-cols-2" : "grid-cols-1"}`}>
              {secondaryStories.map((article) => (
                <ArticleWrapper key={article.id} article={article}>
                  <div className="border-l-2 border-ink pl-4">
                    <div className="text-[10px] uppercase tracking-widest text-muted mb-1">Zápasová zpráva</div>
                    <h3 className="font-heading font-[800] text-lg leading-snug mb-2 hover:underline">
                      {article.headline}
                    </h3>
                    <p className="text-sm text-ink-light leading-relaxed">{article.body}</p>
                    <div className="text-[10px] text-muted mt-2 italic">{timeAgo(article.date)}</div>
                  </div>
                </ArticleWrapper>
              ))}
            </div>
          )}

          {/* ═══ Round results + Sidebar layout ═══ */}
          {(roundArticles.length > 0 || restArticles.length > 0 || standingArticles.length > 0) && (
            <div className="grid grid-cols-1 lg:grid-cols-[1fr_340px] gap-5">

              {/* Main column — round results */}
              <div className="space-y-5">
                {roundArticles.map((article) => (
                  <div key={article.id} className="border-b border-gray-100 pb-4">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-lg">{article.icon}</span>
                      <h3 className="font-heading font-[800] text-base uppercase tracking-wide">{article.headline}</h3>
                      <span className="text-[10px] text-muted italic ml-auto">{timeAgo(article.date)}</span>
                    </div>
                    {/* Parse round results into a table-like format */}
                    <RoundResults body={article.body} />
                  </div>
                ))}

                {/* Other articles */}
                {restArticles.map((article) => (
                  <ArticleWrapper key={article.id} article={article}>
                    <div className="border-b border-gray-100 pb-4">
                      <div className="flex items-start gap-3">
                        <span className="text-xl shrink-0">{article.icon}</span>
                        <div className="flex-1 min-w-0">
                          <h3 className="font-heading font-bold text-base leading-snug hover:underline">{article.headline}</h3>
                          <p className="text-sm text-ink-light mt-1 leading-relaxed">{article.body}</p>
                          <div className="text-[10px] text-muted mt-1.5 italic">{timeAgo(article.date)}</div>
                        </div>
                      </div>
                    </div>
                  </ArticleWrapper>
                ))}
              </div>

              {/* Sidebar */}
              <div className="space-y-5">
                {/* League standing box */}
                {standingArticles.length > 0 && standingArticles[0] !== leadStory && (
                  <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                    <div className="font-heading font-[800] text-xs uppercase tracking-widest text-center mb-2 pb-2 border-b border-gray-300">
                      Tabulka
                    </div>
                    <div className="text-center">
                      <div className="font-heading font-[900] text-lg">{standingArticles[0].headline}</div>
                      <p className="text-sm text-muted mt-1">{standingArticles[0].body}</p>
                    </div>
                    <Link href="/dashboard/liga" className="text-xs text-pitch-500 font-heading font-bold hover:underline block text-center mt-3">
                      Celá tabulka →
                    </Link>
                  </div>
                )}

                {/* Quick scores box */}
                {matchArticles.length > 0 && (
                  <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                    <div className="font-heading font-[800] text-xs uppercase tracking-widest text-center mb-2 pb-2 border-b border-gray-300">
                      Naše výsledky
                    </div>
                    <div className="space-y-2">
                      {matchArticles.slice(0, 5).map((m) => {
                        // Extract score from headline (e.g. "Team poráží Opponent 1:2!")
                        const scoreMatch = m.headline.match(/(\d+:\d+)/);
                        const score = scoreMatch ? scoreMatch[1] : "";
                        const isWin = m.icon === "\u{1F3C6}";
                        const isDraw = m.icon === "\u{1F91D}";
                        const resultColor = isWin ? "text-pitch-600 bg-pitch-50" : isDraw ? "text-muted bg-gray-100" : "text-card-red bg-red-50";

                        return (
                          <ArticleWrapper key={m.id} article={m}>
                            <div className="flex items-center justify-between py-1 hover:bg-white/50 -mx-1 px-1 rounded transition-colors">
                              <span className="text-xs font-heading truncate flex-1">{m.headline.replace(/\d+:\d+!?/, "").replace("!", "").trim()}</span>
                              {score && (
                                <span className={`text-xs font-heading font-bold px-1.5 py-0.5 rounded ${resultColor} tabular-nums ml-2`}>{score}</span>
                              )}
                            </div>
                          </ArticleWrapper>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Newspaper footer */}
                <div className="text-center border-t border-gray-200 pt-3">
                  <div className="font-heading font-[800] text-[10px] uppercase tracking-[0.15em] text-muted">
                    Okresní Zpravodaj
                  </div>
                  <div className="text-[9px] text-muted mt-0.5 italic">
                    Vychází každé kolo · Redakce {district}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ═══ Placená inzerce — newspaper classifieds section (only own league) ═══ */}
          {!isOtherLeague && <div className="border-t-2 border-ink pt-4">
            <div className="font-heading font-[900] text-sm uppercase tracking-[0.2em] text-center mb-1" style={{ fontVariant: "small-caps" }}>
              Placená inzerce
            </div>
            <div className="text-[10px] text-muted text-center mb-4 italic">Inzerát: {adCost} Kč · Platnost 14 dní</div>

            {/* Classifieds grid */}
            {classifieds.length > 0 ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mb-4">
                {classifieds.map((ad) => (
                  <div key={ad.id} className="border border-gray-200 rounded p-3 bg-gray-50/50 relative group">
                    <div className="flex items-center gap-1.5 mb-1.5">
                      <span className="text-sm">{ad.categoryIcon}</span>
                      <span className="text-[10px] uppercase tracking-wide text-muted font-heading font-bold">{ad.categoryLabel}</span>
                    </div>
                    <p className="text-sm leading-snug mb-2">{ad.message}</p>
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] text-muted italic">{ad.teamName}</span>
                      <span className="text-[10px] text-muted">{timeAgo(ad.createdAt)}</span>
                    </div>
                    {ad.isOwn && (
                      <button onClick={() => deleteAd(ad.id)}
                        className="absolute top-2 right-2 w-5 h-5 rounded-full bg-red-100 text-card-red text-xs flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                        title="Smazat inzerát">&#10005;</button>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center text-muted text-sm italic mb-4 py-3">
                Zatím žádné inzeráty. Buďte první!
              </div>
            )}

            {/* New ad form */}
            {!showAdForm ? (
              <div className="text-center">
                <button onClick={() => setShowAdForm(true)}
                  className="text-sm font-heading font-bold text-pitch-500 hover:underline border border-pitch-500 rounded-full px-4 py-1.5 hover:bg-pitch-50 transition-colors">
                  + Podat inzerát ({adCost} Kč)
                </button>
              </div>
            ) : (
              <div className="max-w-lg mx-auto border border-gray-200 rounded-lg p-4 bg-white">
                <div className="font-heading font-bold text-sm mb-3">Nový inzerát</div>

                {/* Category select */}
                <div className="flex gap-2 flex-wrap mb-3">
                  {categories.map((cat) => (
                    <button key={cat.key} onClick={() => setAdCategory(cat.key)}
                      className={`text-xs px-2.5 py-1 rounded-full font-heading font-bold transition-colors ${
                        adCategory === cat.key ? "bg-ink text-white" : "bg-gray-100 text-muted hover:bg-gray-200"
                      }`}>
                      {cat.icon} {cat.label}
                    </button>
                  ))}
                </div>

                {/* Message */}
                <textarea
                  value={adMessage}
                  onChange={(e) => setAdMessage(e.target.value)}
                  placeholder="Např.: Hledáme brankáře do okresního přeboru. Kontakt: 777 123 456"
                  className="w-full border border-gray-200 rounded-lg p-3 text-sm resize-none focus:outline-none focus:border-pitch-500 transition-colors"
                  rows={3}
                  maxLength={200}
                />
                <div className="flex items-center justify-between mt-2">
                  <span className="text-[10px] text-muted">{adMessage.length}/200 znaků</span>
                  <span className="text-[10px] text-muted">Cena: <span className="font-heading font-bold">{adCost} Kč</span> z rozpočtu</span>
                </div>

                {adError && <div className="text-xs text-card-red mt-2">{adError}</div>}

                <div className="flex gap-2 mt-3">
                  <button onClick={() => { setShowAdForm(false); setAdError(""); }}
                    className="flex-1 text-sm py-2 text-muted hover:text-ink transition-colors">
                    Zrušit
                  </button>
                  <button onClick={submitAd} disabled={adSubmitting || adMessage.trim().length < 5}
                    className="flex-1 text-sm py-2 rounded-lg font-heading font-bold text-white bg-pitch-500 hover:bg-pitch-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
                    {adSubmitting ? "Odesílám..." : `Zaplatit a zveřejnit (${adCost} Kč)`}
                  </button>
                </div>
              </div>
            )}
          </div>}

        </div>
      )}
    </div>
  );
}

/* ── Sub-components ── */

function ArticleWrapper({ article, children }: { article: Article; children: React.ReactNode }) {
  if (article.type === "match") {
    return <Link href={`/dashboard/match/${article.id}`} className="block">{children}</Link>;
  }
  return <div>{children}</div>;
}

function RoundResults({ body }: { body: string }) {
  // Match each result as "TeamA verb TeamB score" — handles dots in team names (1.FC, s.r.o.)
  const re = /(.+?)\s+(?:porazil|remizoval\s+s|zvítězil\s+nad)\s+(.+?)\s+(\d+:\d+)/g;
  const structured: Array<{ home: string; away: string; score: string }> = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(body)) !== null) {
    structured.push({ home: m[1].replace(/^\.\s*/, "").trim(), away: m[2].trim(), score: m[3] });
  }

  if (structured.length === 0) {
    return <p className="text-sm text-ink-light leading-relaxed">{body}</p>;
  }

  return (
    <div className="space-y-1">
      {structured.map((r, i) => {
        const [h, a] = r.score.split(":").map(Number);
        const isDraw = h === a;
        const homeWin = h > a;
        return (
          <div key={i} className="flex items-center text-sm py-1 border-b border-gray-50 last:border-b-0">
            <span className={`flex-1 text-right truncate pr-2 ${homeWin ? "font-heading font-bold" : ""}`}>{r.home}</span>
            <span className={`font-heading font-bold text-xs tabular-nums px-2 py-0.5 rounded min-w-[40px] text-center ${
              isDraw ? "bg-gray-100 text-muted" : "bg-gray-50 text-ink"
            }`}>{r.score}</span>
            <span className={`flex-1 truncate pl-2 ${!homeWin && !isDraw ? "font-heading font-bold" : ""}`}>{r.away}</span>
          </div>
        );
      })}
    </div>
  );
}
