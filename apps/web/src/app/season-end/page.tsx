"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { apiFetch } from "@/lib/api";

// ═══ Types ═══

interface Departure { name: string; age: number; position: string; kind: "retirement" | "family" | "decision"; reason: string; wasCaptain?: boolean }
interface DuelPlayer { playerId: string; name: string; position: string; age: number; overallRating: number }
interface Duel { a: DuelPlayer; b: DuelPlayer }
interface Award { id?: string | null; name?: string | null; reason?: string | null; goals?: number }
interface BestEleven { playerId: string; name: string; position: string; teamName: string }
interface SeasonStats {
  matchesPlayed: number; totalGoals: number; goalsPerMatch: number;
  biggestWin?: { homeTeam: string; awayTeam: string; homeScore: number; awayScore: number } | null;
  recordAttendance?: { value: number; homeTeam: string } | null;
  totalBeer?: number;
  wildestMatch?: { homeTeam: string; awayTeam: string; cards: number } | null;
  totalYellowCards: number; totalRedCards: number;
  longestWinStreak?: { teamName: string; length: number } | null;
}
interface PlayerDev { playerId: string; name: string; position: string; age: number; before: number; after: number; delta: number }
interface ManagerDelta { attr: string; label: string; before: number; after: number }
interface ManagerDev { name: string; age: number; deltas: ManagerDelta[] }

interface RecapData {
  seasonNumber: number; newSeasonNumber: number; leagueName: string; teamName: string;
  primaryColor: string; secondaryColor: string;
  finalPos: number | null; totalTeams: number;
  champion: { name: string; isMe: boolean };
  reward: number; repDelta: number;
  departures: Departure[]; agedCount: number;
  playerDev: { improved: PlayerDev[]; declined: PlayerDev[] };
  manager: ManagerDev | null;
  awards: { playerOfSeason: Award | null; topScorer: Award | null; managerOfSeason: Award | null; discovery: Award | null; bestEleven: BestEleven[]; bestElevenMine: BestEleven[] };
  trophy: { place: number; title: string } | null;
  seasonStats: SeasonStats;
  relationships?: {
    rival?: { teamName: string; managerName: string | null; heat: number; moment: string | null; verdict: string } | null;
    ally?: { teamName: string; managerName: string | null; respect: number } | null;
    favorite?: { name: string; position: string; value: number } | null;
    blackSheep?: { name: string; position: string; value: number } | null;
    clubFact?: string | null;
  } | null;
  village?: { name: string; favor: number; verdict: string } | null;
  quote?: { question: string; text: string } | null;
  decision?: { duels: Duel[] } | null;
}

const POS_LABEL: Record<string, string> = { GK: "BR", DEF: "OB", MID: "ZÁ", FWD: "ÚT" };

// ═══ Page ═══

export default function SeasonEndPage() {
  const [recap, setRecap] = useState<RecapData | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "empty">("loading");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const me = await apiFetch<{ teamId: string | null }>("/auth/me");
        if (!me.teamId) { window.location.replace("/dashboard"); return; }
        const d = await apiFetch<{ recap: RecapData | null }>(`/api/teams/${me.teamId}/season-recap`);
        if (cancelled) return;
        if (!d.recap) { window.location.replace("/dashboard"); return; }
        (d.recap as RecapData & { __teamId: string }).__teamId = me.teamId;
        setRecap(d.recap);
        setState("ready");
      } catch (e) {
        console.error("load season recap:", e);
        window.location.replace("/dashboard");
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const finish = async (leaving?: string[]) => {
    const teamId = (recap as (RecapData & { __teamId?: string }) | null)?.__teamId;
    if (teamId) {
      if (recap?.decision?.duels?.length) {
        await apiFetch(`/api/teams/${teamId}/season-recap/decide`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ leaving: leaving ?? [] }) })
          .catch((e) => console.error("decide recap:", e));
      } else {
        await apiFetch(`/api/teams/${teamId}/season-recap/dismiss`, { method: "POST" }).catch((e) => console.error("dismiss recap:", e));
      }
    }
    window.location.replace("/dashboard");
  };

  if (state !== "ready" || !recap) {
    return <div className="fixed inset-0 bg-[#061106] flex items-center justify-center text-white/30 font-heading uppercase tracking-widest text-sm">Načítám sezónu…</div>;
  }
  return <Recap data={recap} onEnter={finish} />;
}

// ═══ Recap experience ═══

function moodFor(pos: number | null, total: number) {
  if (pos === 1) return { kind: "champion", kicker: "MISTR LIGY", accent: "#F0D060", confetti: 140 };
  if (pos != null && pos <= 3) return { kind: "podium", kicker: "STUPNĚ VÍTĚZŮ", accent: "#F0D060", confetti: 80 };
  if (pos != null && pos <= Math.ceil(total / 2)) return { kind: "solid", kicker: "SOLIDNÍ SEZÓNA", accent: "#4CAF50", confetti: 0 };
  return { kind: "tough", kicker: "TĚŽKÁ SEZÓNA", accent: "#D94032", confetti: 0 };
}

function Recap({ data, onEnter }: { data: RecapData; onEnter: (leaving?: string[]) => void }) {
  const team = data.primaryColor || "#2D5F2D";
  const mood = useMemo(() => moodFor(data.finalPos, data.totalTeams), [data]);

  const confetti = useMemo(() => {
    if (mood.confetti === 0) return [];
    const colors = [mood.accent, team, "#FFFFFF", "#4CAF50", "#F0D060"];
    return Array.from({ length: mood.confetti }, (_, i) => ({
      left: (i * 37) % 100,
      delay: (i % 20) * 0.18,
      dur: 3 + (i % 7) * 0.4,
      size: 6 + (i % 4) * 3,
      color: colors[i % colors.length],
      rot: (i * 53) % 360,
    }));
  }, [mood, team]);

  // Konfety zmizí po prvním scrollu za hero (jinak zakrývají obsah)
  const [confettiOn, setConfettiOn] = useState(true);

  // Souboje „kdo zůstane" — index duelu → playerId, který zůstává
  const duels = data.decision?.duels ?? [];
  const [choices, setChoices] = useState<Record<number, string>>({});
  const computeLeaving = () => duels.map((d, i) => {
    const keep = choices[i] ?? (d.a.overallRating >= d.b.overallRating ? d.a.playerId : d.b.playerId);
    return keep === d.a.playerId ? d.b.playerId : d.a.playerId;
  });
  const allDecided = duels.length === 0 || duels.every((_, i) => choices[i] != null);

  return (
    <div className="se-root" style={{ ["--team" as string]: team, ["--accent" as string]: mood.accent }}>
      <style>{CSS}</style>

      {/* atmosféra */}
      <div className="se-glow" />
      <div className="se-grain" />
      {confetti.length > 0 && (
        <div className={`se-confetti${confettiOn ? "" : " gone"}`} aria-hidden>
          {confetti.map((c, i) => (
            <span key={i} style={{ left: `${c.left}%`, width: c.size, height: c.size * 1.6, background: c.color, animationDelay: `${c.delay}s`, animationDuration: `${c.dur}s`, ["--rot" as string]: `${c.rot}deg` }} />
          ))}
        </div>
      )}

      <div className="se-scroll" onScroll={(e) => { if (confettiOn && e.currentTarget.scrollTop > window.innerHeight * 0.4) setConfettiOn(false); }}>
        {/* 1 — HERO */}
        <Section className="se-hero">
          <div className="se-kicker">{data.leagueName} · Sezóna {data.seasonNumber}</div>
          {mood.kind === "champion" ? (
            <div className="se-champhero">
              <div className="se-rays" aria-hidden />
              <div className="se-crown">🏆</div>
              <div className="se-mistr">MISTR LIGY</div>
              <div className="se-team se-team-gold">{data.teamName}</div>
              <div className="se-champ-sub">1. místo z {data.totalTeams} týmů — <strong>kraluješ Přeboru!</strong></div>
            </div>
          ) : (
            <>
              <div className="se-mood" style={{ color: mood.accent }}>{mood.kicker}</div>
              {data.finalPos != null ? (
                <div className="se-placement">
                  <span className="se-pos" style={{ color: mood.accent }}>{data.finalPos}.</span>
                  <span className="se-pos-sub">MÍSTO<br /><em>z {data.totalTeams} týmů</em></span>
                </div>
              ) : (
                <div className="se-placement"><span className="se-pos" style={{ color: mood.accent }}>—</span></div>
              )}
              <div className="se-team">{data.teamName}</div>
              <div className="se-champ">Mistrem ligy se stal <strong style={{ color: "#F0D060" }}>{data.champion.name}</strong></div>
            </>
          )}
          <div className="se-scrollhint">scroll ↓</div>
        </Section>

        {/* 2 — ODMĚNA */}
        <Section className="se-center">
          <div className="se-label">Odměna za sezónu</div>
          <RewardCounter value={data.reward} />
          <div className="se-repline">
            Reputace trenéra{" "}
            {data.repDelta === 0
              ? <span className="se-rep-flat">beze změny</span>
              : <span className={data.repDelta > 0 ? "se-rep-up" : "se-rep-down"}>{data.repDelta > 0 ? "▲" : "▼"} {Math.abs(data.repDelta)}</span>}
          </div>
        </Section>

        {/* 3 — OCENĚNÍ */}
        <Section className="se-block">
          <h2 className="se-h2">Ocenění sezóny</h2>
          <div className="se-awards">
            <AwardCard icon="⭐" label="Hráč sezóny" a={data.awards.playerOfSeason} mine={isMine(data.awards.playerOfSeason, data)} />
            <AwardCard icon="👟" label="Král střelců" a={data.awards.topScorer} extra={data.awards.topScorer?.goals != null ? `${data.awards.topScorer.goals} gólů` : undefined} mine={isMine(data.awards.topScorer, data)} />
            <AwardCard icon="🎩" label="Trenér sezóny" a={data.awards.managerOfSeason} />
            <AwardCard icon="🌱" label="Objev sezóny" a={data.awards.discovery} mine={isMine(data.awards.discovery, data)} />
          </div>
          {data.awards.bestEleven.length > 0 && (
            <div className="se-xi">
              <div className="se-xi-title">Nejlepší jedenáctka</div>
              <div className="se-xi-grid">
                {data.awards.bestEleven.map((p) => {
                  const mine = p.teamName === data.teamName;
                  return (
                    <div key={p.playerId} className={`se-xi-chip${mine ? " mine" : ""}`}>
                      <span className="se-xi-pos">{POS_LABEL[p.position] ?? p.position}</span>
                      <span className="se-xi-name">{p.name}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </Section>

        {/* 4 — ODCHODY / ROZHODNUTÍ */}
        {duels.length > 0 ? (
          <Section className="se-block">
            <h2 className="se-h2">Kdo zůstane?</h2>
            <p className="se-decision-intro">Máš místo jen pro jednoho z každé dvojice — druhý pověsí kopačky na hřebík. Klikni, kdo zůstává. <strong>Tvoje rozhodnutí.</strong></p>
            <div className="se-duels">
              {duels.map((d, i) => (
                <div key={i} className="se-duel">
                  <DuelCard p={d.a} state={choices[i] === d.a.playerId ? "stay" : choices[i] === d.b.playerId ? "leave" : "none"} onPick={() => setChoices((c) => ({ ...c, [i]: d.a.playerId }))} />
                  <div className="se-duel-vs">vs</div>
                  <DuelCard p={d.b} state={choices[i] === d.b.playerId ? "stay" : choices[i] === d.a.playerId ? "leave" : "none"} onPick={() => setChoices((c) => ({ ...c, [i]: d.b.playerId }))} />
                </div>
              ))}
            </div>
            <p className="se-aged">{allDecided ? "Rozhodnuto. Zbytek kádru o sezónu zestárl." : "Vyber u každé dvojice, kdo zůstane."}</p>
          </Section>
        ) : (
          <Section className="se-block">
            <h2 className="se-h2">Rozloučili jsme se</h2>
            {data.departures.length === 0 ? (
              <p className="se-empty">Kádr zůstal pohromadě — nikdo nepověsil kopačky na hřebík.</p>
            ) : (
              <div className="se-deps">
                {data.departures.map((d, i) => (
                  <div key={i} className="se-dep">
                    <div className="se-dep-head">
                      <span className="se-dep-name">{d.name}{d.wasCaptain ? " (kapitán)" : ""}</span>
                      <span className="se-dep-meta">{d.age} let · {POS_LABEL[d.position] ?? d.position}</span>
                      <span className={`se-dep-tag ${d.kind}`}>{d.kind === "retirement" ? "důchod" : d.kind === "decision" ? "rozhodnutí trenéra" : "rodinné důvody"}</span>
                    </div>
                    <div className="se-dep-reason">„{d.reason}"</div>
                  </div>
                ))}
              </div>
            )}
            <p className="se-aged">…a všem ostatním přibyl rok. Kádr o sezónu zestárl.</p>
          </Section>
        )}

        {/* 4b — VÝVOJ */}
        {(data.manager || data.playerDev.improved.length > 0 || data.playerDev.declined.length > 0) && (
          <Section className="se-block">
            <h2 className="se-h2">Vývoj týmu</h2>
            {data.manager && (
              <div className="se-mgr">
                <div className="se-mgr-head">Trenér <strong>{data.manager.name}</strong> · {data.manager.age} let</div>
                {data.manager.deltas.length > 0 ? (
                  <div className="se-mgr-deltas">
                    {data.manager.deltas.map((d) => {
                      const up = d.after > d.before;
                      return <span key={d.attr} className={`se-mgr-chip ${up ? "up" : "down"}`}>{d.label} {up ? "▲" : "▼"} {d.after}</span>;
                    })}
                  </div>
                ) : <div className="se-mgr-flat">Trenér beze změny atributů.</div>}
              </div>
            )}
            <div className="se-dev-grid">
              {data.playerDev.improved.length > 0 && (
                <div className="se-dev-col">
                  <div className="se-dev-title up">📈 Největší zlepšení</div>
                  {data.playerDev.improved.map((p) => <DevRow key={p.playerId} p={p} />)}
                </div>
              )}
              {data.playerDev.declined.length > 0 && (
                <div className="se-dev-col">
                  <div className="se-dev-title down">📉 Největší zhoršení</div>
                  {data.playerDev.declined.map((p) => <DevRow key={p.playerId} p={p} />)}
                </div>
              )}
            </div>
          </Section>
        )}

        {/* 4c — KABINA & RIVALOVÉ */}
        {(() => {
          const rel = data.relationships;
          const hasRel = rel && (rel.rival || rel.ally || rel.favorite || rel.blackSheep || rel.clubFact);
          if (!hasRel && !data.village) return null;
          return (
            <Section className="se-block">
              <h2 className="se-h2">Kabina &amp; rivalové</h2>
              <div className="se-rel-grid">
                {rel?.rival && (
                  <div className="se-rel-card rival">
                    <div className="se-rel-label">💢 Největší rival</div>
                    <div className="se-rel-name">{rel.rival.managerName ?? rel.rival.teamName}</div>
                    {rel.rival.managerName && <div className="se-rel-team">{rel.rival.teamName}</div>}
                    <div className="se-rel-verdict">{rel.rival.verdict}</div>
                    {rel.rival.moment && <div className="se-rel-moment">„{rel.rival.moment}"</div>}
                  </div>
                )}
                {rel?.ally && (
                  <div className="se-rel-card ally">
                    <div className="se-rel-label">🤝 Spojenec na lavičce</div>
                    <div className="se-rel-name">{rel.ally.managerName ?? rel.ally.teamName}</div>
                    {rel.ally.managerName && <div className="se-rel-team">{rel.ally.teamName}</div>}
                    <div className="se-rel-verdict">Vzájemný respekt — člověk, co ti drží place.</div>
                  </div>
                )}
                {rel?.favorite && (
                  <div className="se-rel-card">
                    <div className="se-rel-label">❤️ Miláček kabiny</div>
                    <div className="se-rel-name">{rel.favorite.name}</div>
                    <div className="se-rel-verdict">Tvůj člověk v šatně.</div>
                  </div>
                )}
                {rel?.blackSheep && (
                  <div className="se-rel-card">
                    <div className="se-rel-label">🐑 Černá ovce</div>
                    <div className="se-rel-name">{rel.blackSheep.name}</div>
                    <div className="se-rel-verdict">S tímhle to skřípe.</div>
                  </div>
                )}
                {data.village && (
                  <div className="se-rel-card village">
                    <div className="se-rel-label">🏘️ Vesnice ({data.village.name})</div>
                    <div className="se-rel-name">přízeň {data.village.favor}/100</div>
                    <div className="se-rel-verdict">{data.village.verdict}</div>
                  </div>
                )}
              </div>
              {rel?.clubFact && <p className="se-clubfact">{rel.clubFact}</p>}
            </Section>
          );
        })()}

        {/* 4d — VÝROK SEZONY */}
        {data.quote && (
          <Section className="se-center">
            <div className="se-label">Výrok sezóny</div>
            <blockquote className="se-quote">„{data.quote.text}"</blockquote>
            {data.quote.question && <div className="se-quote-q">na otázku „{data.quote.question}"</div>}
          </Section>
        )}

        {/* 5 — TROFEJ */}
        {data.trophy && (
          <Section className="se-center">
            <div className="se-trophy-wrap">
              <div className="se-trophy-big">{data.trophy.place === 1 ? "🏆" : data.trophy.place === 2 ? "🥈" : "🥉"}</div>
              <div className="se-trophy-title">{data.trophy.title}</div>
              <div className="se-trophy-sub">Nová trofej do vitríny klubu</div>
            </div>
          </Section>
        )}

        {/* 6 — SEZONA V ČÍSLECH */}
        <Section className="se-block">
          <h2 className="se-h2">Sezona v číslech</h2>
          <div className="se-stats">
            <Stat big={`${data.seasonStats.totalGoals}`} label="branek celkem" sub={`${data.seasonStats.goalsPerMatch} na zápas`} />
            {data.seasonStats.totalBeer != null && data.seasonStats.totalBeer > 0 && <Stat big={`${data.seasonStats.totalBeer.toLocaleString("cs")}`} label="🍺 vypito piv" sub="za celou sezónu" />}
            {data.seasonStats.recordAttendance && <Stat big={`${data.seasonStats.recordAttendance.value}`} label="👥 nejvíc lidí" sub={data.seasonStats.recordAttendance.homeTeam} />}
            {data.seasonStats.wildestMatch && <Stat big={`${data.seasonStats.wildestMatch.cards}`} label="🟥 nejdivočejší zápas" sub={`${data.seasonStats.wildestMatch.homeTeam} – ${data.seasonStats.wildestMatch.awayTeam}`} />}
            {data.seasonStats.biggestWin && <Stat big={`${data.seasonStats.biggestWin.homeScore}:${data.seasonStats.biggestWin.awayScore}`} label="nejvyšší výhra" sub={`${data.seasonStats.biggestWin.homeTeam} – ${data.seasonStats.biggestWin.awayTeam}`} />}
            <Stat big={`${data.seasonStats.matchesPlayed}`} label="odehraných zápasů" />
            {data.seasonStats.longestWinStreak && <Stat big={`${data.seasonStats.longestWinStreak.length}×`} label="nejdelší série" sub={data.seasonStats.longestWinStreak.teamName} />}
          </div>
        </Section>

        {/* 7 — CTA */}
        <Section className="se-cta">
          <div className="se-cta-kicker">Píšťalka zazněla. Začíná</div>
          <div className="se-cta-season" style={{ color: mood.accent }}>SEZÓNA {data.newSeasonNumber}</div>
          <p className="se-cta-text">Nový rozpis, čistá tabulka, nové naděje. Hodně štěstí, trenére.</p>
          {duels.length > 0 && !allDecided && <p className="se-cta-warn">U nerozhodnutých dvojic zůstane silnější hráč.</p>}
          <button className="se-enter" onClick={() => onEnter(computeLeaving())}>
            {duels.length > 0 ? "Potvrdit a vstoupit do nové sezóny →" : "Vstoupit do nové sezóny →"}
          </button>
        </Section>
      </div>
    </div>
  );
}

function isMine(a: Award | null, data: RecapData): boolean {
  if (!a?.id) return false;
  return data.awards.bestElevenMine.some((p) => p.playerId === a.id);
}

// ═══ Sub-components ═══

function Section({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      (entries) => entries.forEach((e) => { if (e.isIntersecting) el.setAttribute("data-in", "1"); }),
      { threshold: 0.25 },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);
  return <section ref={ref} className={`se-section ${className}`}>{children}</section>;
}

function RewardCounter({ value }: { value: number }) {
  const [n, setN] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  const started = useRef(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        if (e.isIntersecting && !started.current) {
          started.current = true;
          const t0 = performance.now();
          const dur = 1300;
          const tick = (t: number) => {
            const p = Math.min(1, (t - t0) / dur);
            const eased = 1 - Math.pow(1 - p, 3);
            setN(Math.round(value * eased));
            if (p < 1) requestAnimationFrame(tick);
          };
          requestAnimationFrame(tick);
        }
      });
    }, { threshold: 0.5 });
    obs.observe(el);
    return () => obs.disconnect();
  }, [value]);
  return (
    <div ref={ref} className="se-reward">
      <span className="se-reward-plus">+</span>{n.toLocaleString("cs")}<span className="se-reward-cur"> Kč</span>
    </div>
  );
}

function AwardCard({ icon, label, a, extra, mine }: { icon: string; label: string; a: Award | null; extra?: string; mine?: boolean }) {
  if (!a?.name) return null;
  return (
    <div className={`se-award${mine ? " mine" : ""}`}>
      <div className="se-award-label">{icon} {label}{mine ? <span className="se-award-mine"> · tvůj hráč</span> : null}</div>
      <div className="se-award-name">{a.name}{extra ? <span className="se-award-extra"> · {extra}</span> : null}</div>
      {a.reason && <div className="se-award-reason">„{a.reason}"</div>}
    </div>
  );
}

function Stat({ big, label, sub }: { big: string; label: string; sub?: string }) {
  return (
    <div className="se-stat">
      <div className="se-stat-big">{big}</div>
      <div className="se-stat-label">{label}</div>
      {sub && <div className="se-stat-sub">{sub}</div>}
    </div>
  );
}

function DevRow({ p }: { p: PlayerDev }) {
  const up = p.delta > 0;
  return (
    <div className="se-dev-row">
      <span className="se-dev-pos">{POS_LABEL[p.position] ?? p.position}</span>
      <span className="se-dev-name">{p.name}</span>
      <span className="se-dev-rating">{p.before}→<strong>{p.after}</strong></span>
      <span className={`se-dev-delta ${up ? "up" : "down"}`}>{up ? "+" : ""}{p.delta}</span>
    </div>
  );
}

function DuelCard({ p, state, onPick }: { p: DuelPlayer; state: "stay" | "leave" | "none"; onPick: () => void }) {
  return (
    <button type="button" className={`se-duelcard ${state}`} onClick={onPick}>
      <div className="se-duel-pos">{POS_LABEL[p.position] ?? p.position}</div>
      <div className="se-duel-name">{p.name}</div>
      <div className="se-duel-meta">{p.age} let · rating {p.overallRating}</div>
      <div className="se-duel-badge">{state === "stay" ? "✓ ZŮSTÁVÁ" : state === "leave" ? "✕ ODEJDE" : "klikni"}</div>
    </button>
  );
}

// ═══ Styles ═══

const CSS = `
.se-root{position:fixed;inset:0;background:#061106;color:#F5F0E8;overflow:hidden;font-family:var(--font-body);}
.se-glow{position:absolute;inset:0;background:radial-gradient(120% 80% at 50% -10%, color-mix(in srgb, var(--team) 55%, transparent), transparent 60%),radial-gradient(80% 60% at 50% 110%, color-mix(in srgb, var(--accent) 22%, transparent), transparent 70%);pointer-events:none;}
.se-grain{position:absolute;inset:0;opacity:.06;pointer-events:none;background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");}
.se-scroll{position:relative;height:100%;overflow-y:auto;scroll-snap-type:y mandatory;scroll-behavior:smooth;-webkit-overflow-scrolling:touch;}
.se-section{min-height:100dvh;scroll-snap-align:start;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:7vh 6vw;position:relative;opacity:0;transform:translateY(46px);transition:opacity .7s ease,transform .7s cubic-bezier(.2,.7,.2,1);}
.se-section[data-in]{opacity:1;transform:none;}
.se-kicker{font-family:var(--font-heading);text-transform:uppercase;letter-spacing:.28em;font-size:clamp(.7rem,1.6vw,.95rem);color:rgba(245,240,232,.55);}
.se-mood{font-family:var(--font-heading);font-weight:700;letter-spacing:.18em;text-transform:uppercase;font-size:clamp(1rem,2.4vw,1.5rem);margin-top:1.4rem;}
.se-placement{display:flex;align-items:flex-start;justify-content:center;gap:.6rem;margin:.4rem 0 .2rem;}
.se-pos{font-family:var(--font-heading);font-weight:700;font-size:clamp(7rem,26vw,18rem);line-height:.82;text-shadow:0 0 60px color-mix(in srgb,var(--accent) 45%,transparent);}
.se-pos-sub{font-family:var(--font-heading);text-transform:uppercase;text-align:left;letter-spacing:.1em;font-size:clamp(1rem,2.6vw,1.8rem);line-height:1.05;padding-top:1.2rem;color:rgba(245,240,232,.85);}
.se-pos-sub em{font-style:normal;font-size:.62em;color:rgba(245,240,232,.5);letter-spacing:.04em;}
.se-team{font-family:var(--font-heading);font-weight:700;font-size:clamp(1.6rem,4.4vw,3rem);margin-top:.4rem;color:#fff;}
.se-champ{margin-top:1.4rem;font-size:clamp(1rem,2.2vw,1.3rem);color:rgba(245,240,232,.8);}
.se-trophy-emoji{filter:drop-shadow(0 0 18px rgba(240,208,96,.7));}
.se-scrollhint{position:absolute;bottom:3vh;font-family:var(--font-heading);text-transform:uppercase;letter-spacing:.3em;font-size:.75rem;color:rgba(245,240,232,.45);animation:seBob 1.8s ease-in-out infinite;}
@keyframes seBob{0%,100%{transform:translateY(0);opacity:.45}50%{transform:translateY(8px);opacity:.8}}
.se-center{gap:.2rem;}
.se-label{font-family:var(--font-heading);text-transform:uppercase;letter-spacing:.28em;color:rgba(245,240,232,.55);font-size:clamp(.8rem,1.8vw,1.05rem);}
.se-reward{font-family:var(--font-commentary);font-weight:700;font-size:clamp(2.6rem,11vw,7rem);line-height:1;margin:1.2rem 0 1rem;color:var(--accent);text-shadow:0 0 50px color-mix(in srgb,var(--accent) 40%,transparent);letter-spacing:-.02em;}
.se-reward-plus{opacity:.7;margin-right:.05em;}
.se-reward-cur{font-size:.4em;color:rgba(245,240,232,.7);}
.se-repline{font-size:clamp(.95rem,2vw,1.2rem);color:rgba(245,240,232,.75);}
.se-rep-up{color:#4CAF50;font-weight:700;}.se-rep-down{color:#D94032;font-weight:700;}.se-rep-flat{color:rgba(245,240,232,.5);}
.se-block{justify-content:center;}
.se-h2{font-family:var(--font-heading);font-weight:700;text-transform:uppercase;letter-spacing:.12em;font-size:clamp(1.5rem,4vw,2.6rem);margin-bottom:2rem;}
.se-awards{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:1rem;width:100%;max-width:880px;}
.se-award{background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08);border-radius:16px;padding:1.1rem 1.3rem;text-align:left;backdrop-filter:blur(6px);transition:transform .25s,border-color .25s;}
.se-award:hover{transform:translateY(-3px);border-color:rgba(255,255,255,.2);}
.se-award.mine{border-color:var(--accent);box-shadow:0 0 0 1px var(--accent),0 0 40px color-mix(in srgb,var(--accent) 22%,transparent);}
.se-award-label{font-family:var(--font-heading);text-transform:uppercase;letter-spacing:.1em;font-size:.78rem;color:rgba(245,240,232,.55);}
.se-award-mine{color:var(--accent);}
.se-award-name{font-family:var(--font-heading);font-weight:700;font-size:1.45rem;margin-top:.25rem;color:#fff;}
.se-award-extra{font-size:.7em;color:var(--accent);}
.se-award-reason{font-size:.9rem;font-style:italic;color:rgba(245,240,232,.6);margin-top:.4rem;line-height:1.35;}
.se-xi{margin-top:2rem;width:100%;max-width:900px;}
.se-xi-title{font-family:var(--font-heading);text-transform:uppercase;letter-spacing:.16em;font-size:.85rem;color:rgba(245,240,232,.5);margin-bottom:.8rem;}
.se-xi-grid{display:flex;flex-wrap:wrap;justify-content:center;gap:.5rem;}
.se-xi-chip{display:flex;align-items:center;gap:.5rem;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08);border-radius:999px;padding:.35rem .9rem;font-size:.92rem;}
.se-xi-chip.mine{border-color:var(--accent);color:#fff;background:color-mix(in srgb,var(--accent) 14%,transparent);}
.se-xi-pos{font-family:var(--font-heading);font-size:.65rem;color:var(--accent);letter-spacing:.05em;}
.se-xi-name{font-family:var(--font-heading);font-weight:600;}
.se-empty{color:rgba(245,240,232,.6);font-size:1.1rem;}
.se-deps{display:flex;flex-direction:column;gap:.7rem;width:100%;max-width:680px;}
.se-dep{background:rgba(255,255,255,.04);border-left:3px solid rgba(255,255,255,.15);border-radius:0 12px 12px 0;padding:.9rem 1.2rem;text-align:left;}
.se-dep-head{display:flex;align-items:baseline;flex-wrap:wrap;gap:.6rem;}
.se-dep-name{font-family:var(--font-heading);font-weight:700;font-size:1.2rem;color:#fff;}
.se-dep-meta{font-size:.85rem;color:rgba(245,240,232,.5);}
.se-dep-tag{margin-left:auto;font-family:var(--font-heading);text-transform:uppercase;letter-spacing:.08em;font-size:.66rem;padding:.18rem .6rem;border-radius:999px;}
.se-dep-tag.retirement{background:rgba(196,160,53,.18);color:#F0D060;}
.se-dep-tag.family{background:rgba(217,64,50,.16);color:#E89890;}
.se-dep-reason{font-style:italic;color:rgba(245,240,232,.62);margin-top:.35rem;font-size:.95rem;}
.se-aged{margin-top:1.6rem;color:rgba(245,240,232,.5);font-size:.95rem;}
.se-trophy-wrap{display:flex;flex-direction:column;align-items:center;gap:.6rem;}
.se-trophy-big{font-size:clamp(5rem,18vw,11rem);filter:drop-shadow(0 0 40px rgba(240,208,96,.6));animation:seFloat 3s ease-in-out infinite;}
@keyframes seFloat{0%,100%{transform:translateY(0)}50%{transform:translateY(-14px)}}
.se-trophy-title{font-family:var(--font-heading);font-weight:700;font-size:clamp(1.4rem,4vw,2.4rem);color:#F0D060;}
.se-trophy-sub{color:rgba(245,240,232,.55);}
.se-stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:1rem;width:100%;max-width:820px;}
.se-stat{background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08);border-radius:14px;padding:1.1rem;}
.se-stat-big{font-family:var(--font-commentary);font-weight:700;font-size:clamp(1.25rem,3.4vw,1.9rem);color:#fff;white-space:nowrap;}
.se-stat-label{font-family:var(--font-heading);text-transform:uppercase;letter-spacing:.08em;font-size:.72rem;color:rgba(245,240,232,.5);margin-top:.2rem;}
.se-stat-sub{font-size:.8rem;color:rgba(245,240,232,.4);margin-top:.15rem;}
.se-cta-kicker{font-size:clamp(1rem,2.2vw,1.3rem);color:rgba(245,240,232,.7);}
.se-cta-season{font-family:var(--font-heading);font-weight:700;text-transform:uppercase;letter-spacing:.08em;font-size:clamp(2.6rem,9vw,6rem);line-height:1;margin:.4rem 0 1rem;text-shadow:0 0 50px color-mix(in srgb,var(--accent) 40%,transparent);}
.se-cta-text{color:rgba(245,240,232,.65);max-width:30ch;margin-bottom:2.2rem;}
.se-enter{font-family:var(--font-heading);font-weight:700;text-transform:uppercase;letter-spacing:.06em;font-size:1.05rem;color:#061106;background:var(--accent);border:none;border-radius:999px;padding:1rem 2.4rem;cursor:pointer;transition:transform .2s,box-shadow .2s;box-shadow:0 0 0 0 color-mix(in srgb,var(--accent) 50%,transparent);}
.se-enter:hover{transform:translateY(-2px) scale(1.02);box-shadow:0 12px 40px color-mix(in srgb,var(--accent) 45%,transparent);}
.se-confetti{position:absolute;inset:0;pointer-events:none;overflow:hidden;z-index:5;opacity:1;transition:opacity .7s ease;}
.se-confetti.gone{opacity:0;}
.se-confetti span{position:absolute;top:-6%;border-radius:2px;animation-name:seFall;animation-timing-function:linear;animation-iteration-count:infinite;opacity:.9;}
@keyframes seFall{0%{transform:translateY(-10vh) rotate(0)}100%{transform:translateY(110vh) rotate(calc(var(--rot) * 4))}}
.se-champhero{position:relative;display:flex;flex-direction:column;align-items:center;gap:.3rem;padding:1.5rem 0;}
.se-rays{position:absolute;top:50%;left:50%;width:150vmax;height:150vmax;transform:translate(-50%,-52%);background:conic-gradient(from 0deg,transparent 0 7deg,color-mix(in srgb,#F0D060 26%,transparent) 7deg 11deg,transparent 11deg 18deg);animation:seSpin 26s linear infinite;pointer-events:none;opacity:.45;-webkit-mask:radial-gradient(circle,#000 0,transparent 60%);mask:radial-gradient(circle,#000 0,transparent 60%);}
@keyframes seSpin{to{transform:translate(-50%,-52%) rotate(360deg)}}
.se-crown{position:relative;font-size:clamp(5rem,20vw,12rem);filter:drop-shadow(0 0 55px rgba(240,208,96,.8));animation:seCrownIn .9s cubic-bezier(.2,1.5,.4,1) both,seFloat 3.2s ease-in-out 1s infinite;}
@keyframes seCrownIn{0%{transform:scale(0) rotate(-28deg);opacity:0}100%{transform:scale(1) rotate(0);opacity:1}}
.se-mistr{position:relative;font-family:var(--font-heading);font-weight:700;text-transform:uppercase;letter-spacing:.12em;font-size:clamp(2.4rem,8.5vw,5.6rem);line-height:1;background:linear-gradient(100deg,#A88A2A,#F0D060,#FFF6D0,#F0D060,#A88A2A);background-size:250% 100%;-webkit-background-clip:text;background-clip:text;color:transparent;animation:seShimmer 3.6s linear infinite;}
@keyframes seShimmer{to{background-position:250% 0}}
.se-team-gold{color:#F0D060!important;position:relative;}
.se-champ-sub{position:relative;margin-top:.6rem;font-size:clamp(1rem,2.2vw,1.3rem);color:rgba(245,240,232,.82);}
.se-champ-sub strong{color:#F0D060;}
.se-mgr{width:100%;max-width:640px;margin:0 auto 1.8rem;text-align:center;}
.se-mgr-head{font-size:1.05rem;color:rgba(245,240,232,.75);margin-bottom:.7rem;}
.se-mgr-head strong{font-family:var(--font-heading);color:#fff;}
.se-mgr-deltas{display:flex;flex-wrap:wrap;justify-content:center;gap:.5rem;}
.se-mgr-chip{font-family:var(--font-heading);font-weight:600;font-size:.92rem;padding:.35rem .85rem;border-radius:999px;border:1px solid rgba(255,255,255,.12);}
.se-mgr-chip.up{color:#7BD88F;border-color:rgba(123,216,143,.4);background:rgba(123,216,143,.08);}
.se-mgr-chip.down{color:#E89890;border-color:rgba(232,152,144,.4);background:rgba(232,152,144,.08);}
.se-mgr-flat{color:rgba(245,240,232,.5);}
.se-dev-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:1.4rem;width:100%;max-width:760px;}
.se-dev-col{background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08);border-radius:16px;padding:1rem 1.1rem;}
.se-dev-title{font-family:var(--font-heading);text-transform:uppercase;letter-spacing:.08em;font-size:.85rem;margin-bottom:.6rem;}
.se-dev-title.up{color:#7BD88F;}.se-dev-title.down{color:#E89890;}
.se-dev-row{display:flex;align-items:center;gap:.6rem;padding:.45rem 0;border-bottom:1px solid rgba(255,255,255,.05);}
.se-dev-row:last-child{border-bottom:none;}
.se-dev-pos{font-family:var(--font-heading);font-size:.66rem;color:var(--accent);width:1.7rem;flex-shrink:0;}
.se-dev-name{font-family:var(--font-heading);font-weight:600;flex:1;text-align:left;color:#fff;}
.se-dev-rating{font-family:var(--font-commentary);font-size:.85rem;color:rgba(245,240,232,.55);}
.se-dev-rating strong{color:#fff;}
.se-dev-delta{font-family:var(--font-commentary);font-weight:700;font-size:.98rem;width:2.4rem;text-align:right;flex-shrink:0;}
.se-dev-delta.up{color:#7BD88F;}.se-dev-delta.down{color:#E89890;}
.se-rel-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:1rem;width:100%;max-width:900px;}
.se-rel-card{background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08);border-radius:16px;padding:1.1rem 1.3rem;text-align:left;transition:transform .25s;}
.se-rel-card:hover{transform:translateY(-3px);}
.se-rel-card.rival{border-color:rgba(217,64,50,.45);box-shadow:0 0 34px rgba(217,64,50,.12);}
.se-rel-card.ally{border-color:rgba(123,216,143,.4);}
.se-rel-card.village{border-color:rgba(240,208,96,.35);}
.se-rel-label{font-family:var(--font-heading);text-transform:uppercase;letter-spacing:.08em;font-size:.78rem;color:rgba(245,240,232,.55);}
.se-rel-name{font-family:var(--font-heading);font-weight:700;font-size:1.4rem;color:#fff;margin-top:.2rem;}
.se-rel-team{font-size:.85rem;color:rgba(245,240,232,.5);}
.se-rel-verdict{font-size:.92rem;color:rgba(245,240,232,.7);margin-top:.4rem;}
.se-rel-moment{font-size:.85rem;font-style:italic;color:rgba(245,240,232,.55);margin-top:.5rem;border-left:2px solid rgba(217,64,50,.4);padding-left:.6rem;}
.se-clubfact{margin-top:1.6rem;font-size:1rem;color:rgba(245,240,232,.7);font-style:italic;max-width:620px;}
.se-quote{font-family:var(--font-heading);font-weight:700;font-size:clamp(1.6rem,4.6vw,3.1rem);line-height:1.16;max-width:20ch;color:#fff;margin:1.4rem 0 1rem;}
.se-quote-q{font-size:.95rem;color:rgba(245,240,232,.5);max-width:36ch;}
.se-decision-intro{color:rgba(245,240,232,.74);max-width:48ch;margin:-1rem auto 1.7rem;font-size:1.02rem;line-height:1.45;}
.se-decision-intro strong{color:var(--accent);}
.se-duels{display:flex;flex-direction:column;gap:1rem;width:100%;max-width:680px;}
.se-duel{display:grid;grid-template-columns:1fr auto 1fr;align-items:stretch;gap:.6rem;}
.se-duel-vs{align-self:center;font-family:var(--font-heading);text-transform:uppercase;color:rgba(245,240,232,.4);font-size:.85rem;}
.se-duelcard{background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.1);border-radius:14px;padding:.85rem 1rem;text-align:left;cursor:pointer;transition:transform .18s,border-color .2s,background .2s,opacity .2s,box-shadow .2s;color:inherit;font-family:inherit;}
.se-duelcard:hover{transform:translateY(-2px);border-color:rgba(255,255,255,.32);}
.se-duelcard.stay{border-color:#7BD88F;background:rgba(123,216,143,.1);box-shadow:0 0 0 1px #7BD88F,0 0 26px rgba(123,216,143,.18);}
.se-duelcard.leave{opacity:.4;border-color:rgba(217,64,50,.4);}
.se-duel-pos{font-family:var(--font-heading);font-size:.66rem;color:var(--accent);letter-spacing:.05em;}
.se-duel-name{font-family:var(--font-heading);font-weight:700;font-size:1.15rem;color:#fff;margin-top:.1rem;}
.se-duel-meta{font-size:.8rem;color:rgba(245,240,232,.55);margin-top:.15rem;}
.se-duel-badge{font-family:var(--font-heading);text-transform:uppercase;letter-spacing:.07em;font-size:.66rem;margin-top:.5rem;color:rgba(245,240,232,.4);}
.se-duelcard.stay .se-duel-badge{color:#7BD88F;}
.se-duelcard.leave .se-duel-badge{color:#E89890;}
.se-cta-warn{color:rgba(245,240,232,.5);font-size:.85rem;margin-top:-.6rem;margin-bottom:1.4rem;}
@media(max-width:640px){.se-pos-sub{padding-top:.6rem}.se-dep-tag{margin-left:0}.se-duel{grid-template-columns:1fr;}.se-duel-vs{padding:.2rem 0;}}
`;
