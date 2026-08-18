"use client";

import { useState, useEffect, Fragment } from "react";
import Link from "next/link";
import { useTeam } from "@/context/team-context";
import { apiFetch, apiAction, type Team } from "@/lib/api";
import { Spinner } from "@/components/ui";
import { FaceAvatar } from "@/components/players/face-avatar";
import { EntityLink } from "@/components/ui/entity-link";

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

interface UltrasPhoto {
  teamId: string;
  teamName: string;
  ultrasText: string;
  bannerColor: string;
  textColor: string;
  level: number;
  attendance: number;
  capacity: number;
  fillPct: number;
  caption: string;
}

interface Journalist {
  id: string;
  name: string;
  style: string;
}

interface Redaktor {
  id: string;
  firstName: string;
  lastName: string;
  nickname: string | null;
  age: number;
  style: string;
  bio: string;
  avatar: Record<string, unknown> | null;
}

interface Article {
  id: string;
  type: string;
  headline: string;
  body: string;
  icon: string;
  date: string;
  gameWeek?: number | null;
  /** Klub článku — z něj vede jméno trenéra na jeho profil. */
  teamId?: string | null;
  photos?: UltrasPhoto[];
  journalist?: Journalist;
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

/** Sdílení/kopírování odkazu na konkrétní článek */
function ShareButton({ articleId }: { articleId: string }) {
  const [copied, setCopied] = useState(false);
  const handleShare = async () => {
    if (typeof window === "undefined") return;
    const url = `${window.location.origin}/dashboard/news?article=${articleId}`;
    // Web Share API (mobile)
    if (navigator.share) {
      try {
        await navigator.share({ title: "Zpravodaj", url });
        return;
      } catch (e) {
        // User canceled or not supported — fallback to clipboard
        console.warn("share canceled:", e);
      }
    }
    // Clipboard fallback
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (e) {
      console.error("clipboard write:", e);
    }
  };
  return (
    <button
      onClick={handleShare}
      className="inline-flex items-center gap-1 text-micro text-muted hover:text-pitch-500 font-heading font-bold transition-colors"
      title="Sdílet odkaz"
      type="button"
    >
      {copied ? "✓ Zkopírováno" : "🔗 Sdílet"}
    </button>
  );
}

function formatDate(iso: string): string {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("cs", { day: "numeric", month: "long", year: "numeric" });
}

function timeAgo(iso: string): string {
  if (!iso) return "";
  // SQLite datetime('now') ukládá "YYYY-MM-DD HH:MM:SS" (UTC, bez Z) — normalizuj
  const utcIso = iso.endsWith("Z") || iso.includes("+") ? iso : iso.replace(" ", "T") + "Z";
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
  const [season, setSeason] = useState(1);
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
  // Tiráž na konci listu — kdo ty články vlastně píše.
  const [redakce, setRedakce] = useState<Redaktor[]>([]);

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
      apiFetch<{ articles: Article[]; season: number }>(`/api/teams/${teamId}/news`),
      apiFetch<Team>(`/api/teams/${teamId}`),
    ]).then(([data, t]) => {
      setArticles(data.articles);
      setSeason(data.season ?? 1);
      setTeam(t);
      setLoading(false);
    }).catch((e) => { console.error("načtení zpravodaje:", e); setLoading(false); });
    loadClassifieds();
  }, [teamId]);

  // Scroll to article pokud URL obsahuje ?article=ID
  useEffect(() => {
    if (loading || articles.length === 0 || typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const targetId = params.get("article");
    if (!targetId) return;
    const el = document.getElementById(`news-${targetId}`);
    if (el) {
      setTimeout(() => {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
        el.classList.add("ring-2", "ring-pitch-500", "ring-offset-2", "rounded-soft");
        setTimeout(() => el.classList.remove("ring-2", "ring-pitch-500", "ring-offset-2", "rounded-soft"), 3000);
      }, 100);
    }
  }, [loading, articles]);

  // Redakce se řídí tím, čí zpravodaj zrovna čteš.
  useEffect(() => {
    const ligaId = selectedLeagueId ?? team?.league_id;
    if (!ligaId) return;
    apiFetch<{ journalists: Redaktor[] }>(`/api/leagues/${ligaId}/journalists`)
      .then((d) => setRedakce(d.journalists ?? []))
      .catch((e) => { console.error("načtení redakce:", e); });
  }, [selectedLeagueId, team?.league_id]);

  // Load other league news when selected
  useEffect(() => {
    if (!selectedLeagueId) return;
    setLoading(true);
    apiFetch<{ articles: Article[]; season: number }>(`/api/leagues/${selectedLeagueId}/news`)
      .then((data) => {
        setArticles(data.articles);
        setSeason(data.season ?? 1);
        setLoading(false);
      }).catch((e) => { console.error("načtení zpravodaje ligy:", e); setLoading(false); });
  }, [selectedLeagueId]);

  const handleLeagueChange = (leagueId: string) => {
    if (leagueId === "own") {
      setSelectedLeagueId(null);
      if (teamId) {
        setLoading(true);
        apiFetch<{ articles: Article[]; season: number }>(`/api/teams/${teamId}/news`)
          .then((data) => { setArticles(data.articles); setSeason(data.season ?? 1); setLoading(false); })
          .catch((e) => { console.error("načtení zpravodaje:", e); setLoading(false); });
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
    if (await apiAction(apiFetch(`/api/teams/${teamId}/classifieds/${id}`, { method: "DELETE" }), "Smazání inzerátu se nezdařilo")) {
      loadClassifieds();
    }
  };

  if (loading) return <div className="page-container flex items-center justify-center min-h-[50vh]"><Spinner /></div>;
  if (!team) return <div className="page-container">Tým nenalezen.</div>;

  // Separate articles by type
  const matchArticles = articles.filter((a) => a.type === "match");
  const aiReportArticles = articles.filter((a) => a.type === "ai_report");
  const previewArticles = articles.filter((a) => a.type === "matchday_preview");
  const roundArticles = articles.filter((a) => a.type === "round_results").slice(0, 1);
  const roundSummaryArticles = articles.filter((a) => a.type === "round_summary");
  const standingArticles = articles.filter((a) => a.type === "standing");
  const promotionArticles = articles.filter((a) => a.type === "promotion");
  const transferArticles = articles.filter((a) =>
    ["transfer", "celebrity_arrival", "celebrity_signing"].includes(a.type),
  );
  const interviewArticles = articles.filter((a) => a.type === "interview");
  // Kolo NEJNOVĚJŠÍHO rozhovoru (articles jsou z API seřazené dle data DESC), ne Math.max(gameWeek).
  // Po přeházení rozpisu (dohrávka) má aktuální nadcházející kolo nižší číslo než už odehrané kolo —
  // Math.max by ukázal staré kolo a schoval čerstvé rozhovory pro nejbližší zápas.
  const latestInterviewWeek = interviewArticles.length > 0
    ? ((interviewArticles[0] as any).gameWeek ?? 0)
    : null;
  const currentWeekInterviews = latestInterviewWeek != null && latestInterviewWeek > 0
    ? interviewArticles.filter((a) => (a as any).gameWeek === latestInterviewWeek)
    : interviewArticles;
  const ultrasReports = articles.filter((a) => a.type === "ultras_report");
  // Pozápasové rozhovory — vlastní rubrika, jinak by splynuly s předzápasovými.
  const postMatchArticles = articles.filter((a) => a.type === "post_match_interview");
  // Rozhovory s hráči — nejnovější kolo (stejná logika jako u rozhovorů s trenéry)
  const playerInterviewArticles = articles.filter((a) => a.type === "player_interview");
  const latestPlayerIvWeek = playerInterviewArticles.length > 0
    ? ((playerInterviewArticles[0] as any).gameWeek ?? 0)
    : null;
  const currentPlayerInterviews = latestPlayerIvWeek != null && latestPlayerIvWeek > 0
    ? playerInterviewArticles.filter((a) => (a as any).gameWeek === latestPlayerIvWeek)
    : playerInterviewArticles;
  // Lead story = nejnovější kandidát napříč typy (preview kolem zápasu vyhraje nad starým round_summary).
  // standing je dynamicky generovaný se současným časem, proto zůstává až jako poslední fallback.
  const openerArticles = articles.filter((a) => a.type === "season_opener");
  const wrapArticles = articles.filter((a) => a.type === "season_wrap");
  const leadStory = [openerArticles[0], previewArticles[0], roundSummaryArticles[0], aiReportArticles[0], matchArticles[0]]
    .filter(Boolean)
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0]
    || standingArticles[0] || articles.find((a) => a.type !== "ultras_report");
  // Druhý hlavní článek — kolem přelomu sezóny je to ohlédnutí za sezónou (season_wrap),
  // jinak round_summary / ai_report (podle toho, co není lead).
  const secondaryStory =
    (wrapArticles[0] && wrapArticles[0].id !== leadStory?.id ? wrapArticles[0] : null)
    ?? (roundSummaryArticles[0] && roundSummaryArticles[0].id !== leadStory?.id ? roundSummaryArticles[0] : null)
    ?? (aiReportArticles[0] && aiReportArticles[0].id !== leadStory?.id ? aiReportArticles[0] : null);
  // Ostatní drobnosti — bez typů z hlavních sekcí a bez duplicit s lead/secondary (podle id)
  const otherArticles = articles.filter(
    (a) => !["match", "round_results", "round_summary", "standing", "ai_report", "matchday_preview", "promotion", "transfer", "celebrity_arrival", "celebrity_signing", "interview", "player_interview", "post_match_interview", "ultras_report"].includes(a.type)
      && a.id !== leadStory?.id && a.id !== secondaryStory?.id,
  );
  const miscArticles = otherArticles;

  const today = new Date().toLocaleDateString("cs", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  const selectedLeague = selectedLeagueId ? allLeagues.find(l => l.id === selectedLeagueId) : null;
  const district = isOtherLeague ? (selectedLeague?.district || "Praha") : (team.district || "");
  const newspaperName = district === "Praha" ? "Pražský Zpravodaj" : `Okresní Zpravodaj`;

  // Číslo vydání = kolo, ke kterému se váže nejčerstvější článek z redakce.
  const vydani = articles.find((a) => (a as any).gameWeek)?.gameWeek ?? null;
  const rocnik = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X"][season - 1] ?? String(season);

  return (
    <div className="page-container">

      {/* Výběr okresu — decentní, nad hlavičkou listu */}
      {allLeagues.length > 1 && (
        <div className="flex items-center gap-2 mb-3 text-sm">
          <span className="text-muted">Zobrazit zpravodaj:</span>
          <select
            value={selectedLeagueId ?? "own"}
            onChange={(e) => handleLeagueChange(e.target.value)}
            className="bg-transparent border-b border-ink/30 px-1 py-0.5 font-heading font-bold focus:outline-none focus:border-ink"
          >
            <option value="own">Můj okres</option>
            {allLeagues.map((l) => (
              <option key={l.id} value={l.id}>{l.name}</option>
            ))}
          </select>
        </div>
      )}

      {/* ═══ Hlavička listu ═══ */}
      <header className="np-dvojlinka pt-2">
        <div className="flex items-end justify-between text-micro uppercase tracking-[0.2em] text-muted">
          <span>{district}</span>
          <span>Ročník {rocnik}{vydani ? ` · číslo ${vydani}` : ""}</span>
        </div>
        <h1
          className="np-titulek text-center text-[2.1rem] sm:text-5xl my-1.5"
          style={{ fontVariant: "small-caps" }}
        >
          {newspaperName}
        </h1>
        <div className="flex items-center justify-between text-micro text-muted border-t border-ink/20 pt-1">
          <span>{today}</span>
          <span className="italic hidden sm:inline">
            Nezávislé noviny {district === "Praha" ? "pražského" : "okresního"} fotbalu
          </span>
          <span className="uppercase tracking-widest text-micro">Zdarma</span>
        </div>
      </header>
      <div className="np-dvojlinka mt-0.5 mb-6" />

      {articles.length === 0 ? (
        <div className="text-center text-muted py-16 italic np-text">
          Redakce zatím nemá žádné zprávy. Odehraj první zápas a noviny se rozjedou!
        </div>
      ) : (
        <div className="space-y-8">

          {/* ═══ Úvodník + placená propagace ═══ */}
          {leadStory && (
            <section className="grid grid-cols-1 lg:grid-cols-[1fr_260px] gap-7">
              <article id={`news-${leadStory.id}`}>
                <ArticleWrapper article={leadStory}>
                  <div>
                    <Kicker>{rubrikaProTyp(leadStory.type)}</Kicker>
                    <h2 className="np-titulek text-3xl sm:text-[2.6rem] text-center mb-3">
                      {leadStory.headline}
                    </h2>
                    <Podpis clanek={leadStory} stred />
                    <div className="np-text np-sloupce np-sloupce-3 np-iniciala text-[15px] mt-3">
                      {leadStory.body.split("\n").filter(Boolean).map((p, i) => (
                        <p key={i}>{renderMarkdown(p)}</p>
                      ))}
                    </div>
                  </div>
                </ArticleWrapper>
              </article>

              {promotionArticles.length > 0 && (
                <aside className="lg:border-l lg:border-ink/15 lg:pl-6">
                  <div className="sticky top-4">
                    <div className="text-center border-y border-ink/25 py-1 mb-3">
                      <span className="font-heading font-[900] text-micro uppercase tracking-[0.2em]">
                        Placená propagace
                      </span>
                    </div>
                    <div className="divide-y divide-ink/10">
                      {promotionArticles.slice(0, 3).map((p) => (
                        <div key={p.id} id={`news-${p.id}`} className="py-3 first:pt-0">
                          <h4 className="np-titulek text-base mb-1.5">{p.headline}</h4>
                          <p className="np-text text-[13px] whitespace-pre-line">{p.body}</p>
                          <div className="flex items-center justify-between mt-2">
                            <span className="text-micro text-muted italic">{timeAgo(p.date)}</span>
                            <ShareButton articleId={p.id} />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </aside>
              )}
            </section>
          )}

          {/* ═══ Druhý hlavní článek ═══ */}
          {secondaryStory && (
            <section id={`news-${secondaryStory.id}`} className="border-t border-ink/20 pt-6">
              <Kicker>{rubrikaProTyp(secondaryStory.type)}</Kicker>
              <h2 className="np-titulek text-2xl sm:text-3xl text-center mb-2">{secondaryStory.headline}</h2>
              <Podpis clanek={secondaryStory} stred />
              <div className="np-text np-sloupce np-sloupce-2 text-[15px] mt-3">
                {secondaryStory.body.split("\n").filter(Boolean).map((p, i) => (
                  <p key={i}>{renderMarkdown(p)}</p>
                ))}
              </div>
            </section>
          )}

          {/* ═══ Prales Ultras ═══ */}
          {ultrasReports.map((ur) => (
            <section key={ur.id} id={`news-${ur.id}`} className="border-t border-ink/20 pt-6">
              <Kicker>🔥 Prales Ultras</Kicker>
              <h2 className="np-titulek text-2xl sm:text-3xl text-center mb-2">{ur.headline}</h2>
              <Podpis clanek={ur} stred />
              <div className="np-text np-sloupce np-sloupce-2 text-[15px] mt-3">
                {ur.body.split("\n").filter(Boolean).map((p, i) => (
                  <p key={i}>{renderMarkdown(p)}</p>
                ))}
              </div>
              {ur.photos && ur.photos.length > 0 && (
                <div className="grid grid-cols-2 lg:grid-cols-3 gap-x-5 gap-y-4 mt-5">
                  {ur.photos.map((ph) => (
                    <figure key={ph.teamId}>
                      <img
                        src={`/kotel-foto?text=${encodeURIComponent(ph.ultrasText)}&bg=${encodeURIComponent(ph.bannerColor)}&fg=${encodeURIComponent(ph.textColor)}&p=${encodeURIComponent(ph.bannerColor)}&s=${encodeURIComponent(ph.textColor)}&lvl=${encodeURIComponent(String(ph.level))}&att=${encodeURIComponent(String(ph.attendance))}&team=${encodeURIComponent(ph.teamName)}&cap=${encodeURIComponent(ph.caption)}`}
                        alt={`Kotel ${ph.teamName}`}
                        width={1200}
                        height={630}
                        className="w-full h-auto border border-ink/25"
                        loading="lazy"
                      />
                      {/* Popisek jen tady — jméno i počet diváků jsou už vypálené ve fotce */}
                      <figcaption className="text-micro text-muted mt-1 leading-snug">
                        <EntityLink type="team" id={ph.teamId} className="font-heading font-bold text-ink">
                          {ph.teamName}
                        </EntityLink>
                        {" — "}{ph.caption}
                      </figcaption>
                    </figure>
                  ))}
                </div>
              )}
              <div className="flex items-center justify-center gap-3 mt-4">
                <span className="text-micro text-muted italic">{timeAgo(ur.date)}</span>
                <ShareButton articleId={ur.id} />
              </div>
            </section>
          ))}

          {/* ═══ Rozhovorové rubriky ═══
              Pořadí není pevné — nahoru jde ta, ve které vyšel nejčerstvější
              článek. Natvrdo dané pořadí znamenalo, že po kole bez pozápasových
              rozhovorů viselo nad čerstvými rozhovory kola staré vydání. */}
          {[
            { klic: "po-zapase", datum: postMatchArticles[0]?.date, node: postMatchArticles.length > 0 && (
            <section className="border-t border-ink/20 pt-6">
              <Kicker>🗣️ {postMatchArticles.length === 1 ? "Po zápase" : "Ohlasy po zápase"}</Kicker>
              <div className="divide-y divide-ink/10">
                {postMatchArticles.map((iv) => {
                  let meta: {
                    managerName?: string; managerAvatar?: Record<string, unknown> | null; teamName?: string;
                    article?: string; refereeName?: string; refereeId?: string; teamId?: string;
                    incidentText?: string;
                  } = {};
                  try { meta = JSON.parse(iv.body); } catch (e) { console.error("parse pozápasového rozhovoru:", e); meta = {}; }
                  return (
                    <Rozhovor
                      key={iv.id}
                      clanek={iv}
                      jmeno={meta.managerName ?? "Trenér"}
                      role="Trenér"
                      tym={meta.teamName}
                      avatar={meta.managerAvatar}
                      jmenoHref={(meta.teamId ?? iv.teamId) ? `/dashboard/manager/${meta.teamId ?? iv.teamId}` : undefined}
                      text={meta.article ?? iv.body}
                      poznamka={meta.refereeName ? `Rozhodčí ${meta.refereeName}${meta.incidentText ? " — sporná situace v zápase" : ""}` : undefined}
                      poznamkaHref={meta.refereeId ? `/dashboard/rozhodci/${meta.refereeId}` : undefined}
                    />
                  );
                })}
              </div>
            </section>
          ) },
            { klic: "treneri", datum: currentWeekInterviews[0]?.date, node: currentWeekInterviews.length > 0 && (
            <section className="border-t border-ink/20 pt-6">
              <Kicker>🎙️ {currentWeekInterviews.length === 1 ? "Rozhovor kola" : "Rozhovory kola"}</Kicker>
              <div className="divide-y divide-ink/10">
                {currentWeekInterviews.map((iv) => {
                  let meta: {
                    managerName?: string; managerAvatar?: Record<string, unknown> | null; teamName?: string;
                    article?: string; vztah?: { popis: string; sentiment: number; dopad?: string };
                  } = {};
                  try { meta = JSON.parse(iv.body); } catch (e) { console.error("parse rozhovoru trenéra:", e); meta = {}; }
                  return (
                    <Rozhovor
                      key={iv.id}
                      clanek={iv}
                      jmeno={meta.managerName ?? "Trenér"}
                      role="Trenér"
                      tym={meta.teamName}
                      avatar={meta.managerAvatar}
                      jmenoHref={iv.teamId ? `/dashboard/manager/${iv.teamId}` : undefined}
                      text={meta.article ?? iv.body}
                      poznamka={meta.vztah ? `${meta.vztah.popis}${meta.vztah.dopad ? ` — ${meta.vztah.dopad}` : ""}` : undefined}
                    />
                  );
                })}
              </div>
            </section>
          ) },
            { klic: "hraci", datum: currentPlayerInterviews[0]?.date, node: currentPlayerInterviews.length > 0 && (
            <section className="border-t border-ink/20 pt-6">
              <Kicker>🎤 {currentPlayerInterviews.length === 1 ? "Rozhovor s hráčem" : "Rozhovory s hráči"}</Kicker>
              <div className="divide-y divide-ink/10">
                {currentPlayerInterviews.map((iv) => {
                  let meta: {
                    playerId?: string; playerName?: string; playerAvatar?: Record<string, unknown> | null;
                    position?: string; teamName?: string; article?: string; mood?: string; effectNote?: string;
                  } = {};
                  try { meta = JSON.parse(iv.body); } catch (e) { console.error("parse rozhovoru hráče:", e); meta = {}; }
                  return (
                    <Rozhovor
                      key={iv.id}
                      clanek={iv}
                      jmeno={meta.playerName ?? "Hráč"}
                      jmenoId={meta.playerId}
                      role={meta.position}
                      tym={meta.teamName}
                      avatar={meta.playerAvatar}
                      text={meta.article ?? iv.body}
                      poznamka={meta.effectNote}
                    />
                  );
                })}
              </div>
            </section>
          ) },
          ]
            .filter((r) => r.node)
            .sort((a, b) => new Date(b.datum ?? 0).getTime() - new Date(a.datum ?? 0).getTime())
            .map((r) => <Fragment key={r.klic}>{r.node}</Fragment>)}

          {/* ═══ Přestupy — krátké zprávy ve sloupcích ═══ */}
          {transferArticles.length > 0 && (
            <section className="border-t border-ink/20 pt-6">
              <Kicker>🤝 Přestupy a spekulace</Kicker>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-6">
                {transferArticles.slice(0, 9).map((t) => (
                  <div key={t.id} id={`news-${t.id}`} className="py-3 border-b border-ink/10">
                    <h4 className="np-titulek text-[15px] mb-1">{t.headline}</h4>
                    <p className="np-text text-[13px] line-clamp-3">{t.body}</p>
                    <div className="flex items-center justify-between mt-1.5">
                      <span className="text-micro text-muted italic">{timeAgo(t.date)}</span>
                      <ShareButton articleId={t.id} />
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* ═══ Spodek listu — výsledky kola a drobné zprávy ═══ */}
          {(roundArticles.length > 0 || miscArticles.length > 0) && (
            <div className="border-t border-ink/20 pt-6">

              <div className="space-y-7 min-w-0">
                {/* Výsledky kola */}
                {roundArticles.map((article) => (
                  <section key={article.id}>
                    <Kicker>⚽ {article.headline}</Kicker>
                    <RoundResults body={article.body} />
                    <div className="text-micro text-muted italic mt-2">{timeAgo(article.date)}</div>
                  </section>
                ))}

                {/* Drobné zprávy */}
                {miscArticles.length > 0 && (
                  <section>
                    <Kicker>📰 Další zprávy</Kicker>
                    <div className="np-sloupce np-sloupce-2">
                      {miscArticles.map((article) => (
                        <ArticleWrapper key={article.id} article={article}>
                          <div id={`news-${article.id}`} className="pb-3 mb-3 border-b border-ink/10 break-inside-avoid-column">
                            <h4 className="np-titulek text-[15px] mb-1">
                              <span className="mr-1">{article.icon}</span>{article.headline}
                            </h4>
                            <p className="np-text text-[13px]">{article.body}</p>
                            <div className="flex items-center justify-between mt-1">
                              <span className="text-micro text-muted italic">{timeAgo(article.date)}</span>
                              <ShareButton articleId={article.id} />
                            </div>
                          </div>
                        </ArticleWrapper>
                      ))}
                    </div>
                  </section>
                )}
              </div>

            </div>
          )}

          {/* ═══ Placená inzerce ═══ */}
          {!isOtherLeague && <section className="np-dvojlinka pt-4">
            <div className="np-titulek text-center text-lg tracking-[0.15em]" style={{ fontVariant: "small-caps" }}>
              Placená inzerce
            </div>
            <div className="text-micro text-muted text-center mb-4 italic">Inzerát: {adCost} Kč · Platnost 14 dní</div>

            {classifieds.length > 0 ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-6 mb-4">
                {classifieds.map((ad) => (
                  <div key={ad.id} className="py-3 border-b border-ink/15 relative group">
                    <div className="text-micro uppercase tracking-wider text-muted font-heading font-bold mb-1">
                      {ad.categoryIcon} {ad.categoryLabel}
                    </div>
                    <p className="np-text text-[13px] mb-1.5">{ad.message}</p>
                    <div className="flex items-center justify-between text-micro text-muted italic">
                      <span>{ad.teamName}</span>
                      <span>{timeAgo(ad.createdAt)}</span>
                    </div>
                    {ad.isOwn && (
                      <button onClick={() => deleteAd(ad.id)}
                        className="absolute top-2 right-0 w-5 h-5 text-card-red text-xs opacity-0 group-hover:opacity-100 transition-opacity"
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

            {!showAdForm ? (
              <div className="text-center">
                <button onClick={() => setShowAdForm(true)}
                  className="text-sm font-heading font-bold border border-ink/40 px-4 py-1.5 hover:bg-ink hover:text-paper transition-colors">
                  + Podat inzerát ({adCost} Kč)
                </button>
              </div>
            ) : (
              <div className="max-w-lg mx-auto border border-ink/25 p-4">
                <div className="font-heading font-bold text-sm mb-3">Nový inzerát</div>

                <div className="flex gap-2 flex-wrap mb-3">
                  {categories.map((cat) => (
                    <button key={cat.key} onClick={() => setAdCategory(cat.key)}
                      className={`text-xs px-2.5 py-1 font-heading font-bold border transition-colors ${
                        adCategory === cat.key ? "bg-ink text-paper border-ink" : "border-ink/25 text-muted hover:border-ink/50"
                      }`}>
                      {cat.icon} {cat.label}
                    </button>
                  ))}
                </div>

                <textarea
                  value={adMessage}
                  onChange={(e) => setAdMessage(e.target.value)}
                  placeholder="Např.: Hledáme brankáře do okresního přeboru. Kontakt: 777 123 456"
                  className="w-full border border-ink/25 p-3 text-sm resize-none bg-transparent focus:outline-none focus:border-ink transition-colors"
                  rows={3}
                  maxLength={200}
                />
                <div className="flex items-center justify-between mt-2">
                  <span className="text-micro text-muted">{adMessage.length}/200 znaků</span>
                  <span className="text-micro text-muted">Cena: <span className="font-heading font-bold">{adCost} Kč</span> z rozpočtu</span>
                </div>

                {adError && <div className="text-xs text-card-red mt-2">{adError}</div>}

                <div className="flex gap-2 mt-3">
                  <button onClick={() => { setShowAdForm(false); setAdError(""); }}
                    className="flex-1 text-sm py-2 text-muted hover:text-ink transition-colors">
                    Zrušit
                  </button>
                  <button onClick={submitAd} disabled={adSubmitting || adMessage.trim().length < 5}
                    className="flex-1 text-sm py-2 font-heading font-bold text-paper bg-ink hover:bg-ink-light disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
                    {adSubmitting ? "Odesílám..." : `Zaplatit a zveřejnit (${adCost} Kč)`}
                  </button>
                </div>
              </div>
            )}
          </section>}

          {/* ═══ Tiráž — kdo ten list píše ═══ */}
          {redakce.length > 0 && (
            <section className="border-t border-ink/20 pt-6 mt-6">
              {/* Bez skloňování názvu listu — „Redakce Pražský Zpravodaju" nedopadlo dobře. */}
              <Kicker>✒️ Redakce</Kicker>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
                {redakce.map((r) => (
                  <Link
                    key={r.id}
                    href={`/dashboard/redakce/${r.id}`}
                    className="flex items-start gap-2 group"
                  >
                    {r.avatar && (
                      <FaceAvatar faceConfig={r.avatar} size={44} className="border border-ink/30 bg-white shrink-0" />
                    )}
                    <div className="min-w-0">
                      <div className="text-sm font-heading font-bold text-ink group-hover:underline underline-offset-2">
                        {r.firstName} {r.lastName}
                      </div>
                      <div className="text-xs text-muted">{STYL_POPIS[r.style] ?? "redakce"}</div>
                      {r.nickname && <div className="text-xs text-muted italic">„{r.nickname}"</div>}
                    </div>
                  </Link>
                ))}
              </div>
            </section>
          )}

        </div>
      )}
    </div>
  );
}

/* ── Sub-components ── */

/** Hlavička rubriky — název sevřený vlasovými linkami přes celou šířku sloupce. */
function Kicker({ children }: { children: React.ReactNode }) {
  return <div className="np-rubrika">{children}</div>;
}

/**
 * Podpis pod článkem. Redakci zatím tvoří jeden anonymní pisatel — až budou
 * redaktoři s vlastními povahami, doplní se sem jméno s odkazem na profil.
 */
function Podpis({ clanek, stred = false }: { clanek: Article; stred?: boolean }) {
  const autor = clanek.journalist;
  return (
    <div className={`flex items-center gap-2 text-micro text-muted ${stred ? "justify-center" : ""}`}>
      {autor ? (
        <Link
          href={`/dashboard/redakce/${autor.id}`}
          className="uppercase tracking-[0.12em] font-heading font-bold text-ink hover:underline underline-offset-2"
          title={`Profil redaktora — ${STYL_POPIS[autor.style] ?? "redakce"}`}
        >
          {autor.name}
        </Link>
      ) : (
        <span className="uppercase tracking-[0.15em] font-heading font-bold">Redakce</span>
      )}
      <span className="opacity-40">·</span>
      <span className="italic">{timeAgo(clanek.date)}</span>
      <span className="opacity-40">·</span>
      <ShareButton articleId={clanek.id} />
    </div>
  );
}

/**
 * Nejsilnější přímá řeč článku pro vytržený citát.
 *
 * Rovná uvozovka je zároveň otevírací i zavírací, takže se musí párovat podle
 * pořadí — hledání "od uvozovky k uvozovce" jinak chytí text MEZI dvěma citáty,
 * tedy autorskou větu, která obvykle končí dvojtečkou.
 */
function vytahnoutCitat(odstavce: string[]): string | undefined {
  const kandidati: string[] = [];
  for (const odst of odstavce) {
    for (const m of odst.matchAll(/„([^„""]+)[""]/g)) kandidati.push(m[1]);
    const casti = odst.split('"');
    for (let i = 1; i < casti.length; i += 2) kandidati.push(casti[i]);
  }
  return kandidati
    .map((c) => c.trim())
    .filter((c) => c.length >= 45 && c.length <= 165 && !c.endsWith(":"))
    .sort((a, b) => b.length - a.length)[0];
}

/**
 * Rozhovor sázený jako ve sportovní příloze: velký portrét vlevo, který text
 * obtéká, pod ním popiska se jménem, první odstavec jako perex a nejsilnější
 * citát vytržený mezi linky. Společné pro trenéry i hráče.
 */
function Rozhovor({
  clanek, jmeno, jmenoId, jmenoHref, role, tym, avatar, text, poznamka, poznamkaHref,
}: {
  clanek: Article;
  jmeno: string;
  jmenoId?: string;
  /** Vlastní cíl odkazu pod jménem — trenér vede na svůj tým, hráč na profil. */
  jmenoHref?: string;
  role?: string;
  tym?: string;
  avatar?: Record<string, unknown> | null;
  text: string;
  poznamka?: string;
  poznamkaHref?: string;
}) {
  const odstavce = text.split("\n").filter(Boolean);
  const maAvatar = avatar && Object.keys(avatar).length > 0;

  // Perex tučně jen když je krátký; jinak by svítil tučně celý sloupec.
  const maPerex = (odstavce[0]?.length ?? 0) < 260;
  const citat = vytahnoutCitat(odstavce.slice(1));

  return (
    <article id={`news-${clanek.id}`} className="py-6 first:pt-0">
      <h3 className="np-titulek text-2xl sm:text-[1.75rem] mb-2">{clanek.headline}</h3>
      <div className="flex items-center gap-2 mb-4 pb-2 border-b border-ink/10">
        <span className="text-micro uppercase tracking-[0.15em] font-heading font-bold text-muted">
          Rozhovor
        </span>
        <div className="ml-auto"><Podpis clanek={clanek} /></div>
      </div>

      <div className="np-text np-sloupce np-sloupce-2 text-[15px]">
        {maAvatar && (
          <figure className="np-portret">
            <FaceAvatar faceConfig={avatar} size={118} className="border border-ink/40 bg-white" />
            <figcaption className="text-micro leading-tight mt-1 not-italic border-t border-ink/20 pt-1">
              {jmenoId ? (
                <EntityLink type="player" id={jmenoId} className="font-heading font-bold text-ink">{jmeno}</EntityLink>
              ) : jmenoHref ? (
                <Link href={jmenoHref} className="entity-link font-heading font-bold text-ink">{jmeno}</Link>
              ) : (
                <span className="font-heading font-bold text-ink">{jmeno}</span>
              )}
              {(role || tym) && (
                <span className="block text-muted">{[role, tym].filter(Boolean).join(" · ")}</span>
              )}
            </figcaption>
          </figure>
        )}

        {odstavce.map((p, i) => (
          <Fragment key={i}>
            <p className={i === 0 && maPerex ? "np-perex" : undefined}>{p}</p>
            {citat && i === 0 && <blockquote className="np-citat">„{citat}“</blockquote>}
          </Fragment>
        ))}
      </div>

      {poznamka && (
        <div className="mt-3">
          <span className="text-micro font-heading font-bold uppercase tracking-wider text-muted border-l-2 border-ink/30 pl-2">
            🧱 {poznamkaHref ? (
              <Link href={poznamkaHref} className="entity-link">{poznamka}</Link>
            ) : poznamka}
          </span>
        </div>
      )}
    </article>
  );
}

/** Jak se který styl redaktora popisuje čtenáři. */
const STYL_POPIS: Record<string, string> = {
  bulvar: "bulvární pero redakce",
  seriozni: "seriózní pero redakce",
  vycurany: "vyčůrané pero redakce",
  patriot: "srdcař okresního fotbalu",
};

/** Název rubriky podle typu článku — co je v novinách za škatulkou. */
function rubrikaProTyp(type: string): string {
  switch (type) {
    case "matchday_preview": return "Před zápasem";
    case "round_summary": return "🏆 Hráč a trenér kola";
    case "season_opener": return "🎺 Otevírák sezóny";
    case "season_wrap": return "📜 Ohlédnutí za sezónou";
    case "ai_report": return "Komentář kola";
    case "match": return "Zápasová zpráva";
    case "standing": return "Tabulka";
    default: return "Aktualita";
  }
}

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
    return <p className="np-text text-sm">{body}</p>;
  }

  // Výsledková listina jako v tisku: dvojice oddělené vlasovou linkou, vítěz tučně.
  return (
    <div className="sm:columns-2 sm:gap-x-8">
      {structured.map((r, i) => {
        const [h, a] = r.score.split(":").map(Number);
        const isDraw = h === a;
        const homeWin = h > a;
        return (
          <div key={i} className="flex items-baseline text-sm py-1.5 border-b border-ink/10 break-inside-avoid-column">
            <span className={`flex-1 text-right truncate pr-2 ${homeWin ? "font-heading font-bold" : ""}`}>{r.home}</span>
            <span className={`font-heading font-bold text-[13px] tabular-nums min-w-[42px] text-center ${isDraw ? "text-muted" : "text-ink"}`}>
              {r.score}
            </span>
            <span className={`flex-1 truncate pl-2 ${!homeWin && !isDraw ? "font-heading font-bold" : ""}`}>{r.away}</span>
          </div>
        );
      })}
    </div>
  );
}
