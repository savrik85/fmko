"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { apiFetch } from "@/lib/api";

// ═══ Types ═══

interface Departure { name: string; age: number; position: string; kind: "retirement" | "family"; reason: string; wasCaptain?: boolean }
interface Award { id?: string | null; name?: string | null; reason?: string | null; goals?: number }
interface BestEleven { playerId: string; name: string; position: string; teamName: string }
interface SeasonStats {
  matchesPlayed: number; totalGoals: number; goalsPerMatch: number;
  biggestWin?: { homeTeam: string; awayTeam: string; homeScore: number; awayScore: number } | null;
  recordAttendance?: { value: number; homeTeam: string } | null;
  totalYellowCards: number; totalRedCards: number;
  longestWinStreak?: { teamName: string; length: number } | null;
}
interface RecapData {
  seasonNumber: number; newSeasonNumber: number; leagueName: string; teamName: string;
  primaryColor: string; secondaryColor: string;
  finalPos: number | null; totalTeams: number;
  champion: { name: string; isMe: boolean };
  reward: number; repDelta: number;
  departures: Departure[]; agedCount: number;
  awards: { playerOfSeason: Award | null; topScorer: Award | null; managerOfSeason: Award | null; discovery: Award | null; bestEleven: BestEleven[]; bestElevenMine: BestEleven[] };
  trophy: { place: number; title: string } | null;
  seasonStats: SeasonStats;
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

  const dismiss = async () => {
    const teamId = (recap as (RecapData & { __teamId?: string }) | null)?.__teamId;
    if (teamId) {
      await apiFetch(`/api/teams/${teamId}/season-recap/dismiss`, { method: "POST" }).catch((e) => console.error("dismiss recap:", e));
    }
    window.location.replace("/dashboard");
  };

  if (state !== "ready" || !recap) {
    return <div className="fixed inset-0 bg-[#061106] flex items-center justify-center text-white/30 font-heading uppercase tracking-widest text-sm">Načítám sezónu…</div>;
  }
  return <Recap data={recap} onEnter={dismiss} />;
}

// ═══ Recap experience ═══

function moodFor(pos: number | null, total: number) {
  if (pos === 1) return { kind: "champion", kicker: "MISTR LIGY", accent: "#F0D060", confetti: 140 };
  if (pos != null && pos <= 3) return { kind: "podium", kicker: "STUPNĚ VÍTĚZŮ", accent: "#F0D060", confetti: 80 };
  if (pos != null && pos <= Math.ceil(total / 2)) return { kind: "solid", kicker: "SOLIDNÍ SEZÓNA", accent: "#4CAF50", confetti: 0 };
  return { kind: "tough", kicker: "TĚŽKÁ SEZÓNA", accent: "#D94032", confetti: 0 };
}

function Recap({ data, onEnter }: { data: RecapData; onEnter: () => void }) {
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

  return (
    <div className="se-root" style={{ ["--team" as string]: team, ["--accent" as string]: mood.accent }}>
      <style>{CSS}</style>

      {/* atmosféra */}
      <div className="se-glow" />
      <div className="se-grain" />
      {confetti.length > 0 && (
        <div className="se-confetti" aria-hidden>
          {confetti.map((c, i) => (
            <span key={i} style={{ left: `${c.left}%`, width: c.size, height: c.size * 1.6, background: c.color, animationDelay: `${c.delay}s`, animationDuration: `${c.dur}s`, ["--rot" as string]: `${c.rot}deg` }} />
          ))}
        </div>
      )}

      <div className="se-scroll">
        {/* 1 — HERO */}
        <Section className="se-hero">
          <div className="se-kicker">{data.leagueName} · Sezóna {data.seasonNumber}</div>
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
          <div className="se-champ">
            {data.champion.isMe
              ? <><span className="se-trophy-emoji">🏆</span> Mistrem se stáváš TY!</>
              : <>Mistrem ligy se stal <strong style={{ color: "#F0D060" }}>{data.champion.name}</strong></>}
          </div>
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

        {/* 4 — ODCHODY */}
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
                    <span className={`se-dep-tag ${d.kind}`}>{d.kind === "retirement" ? "důchod" : "rodinné důvody"}</span>
                  </div>
                  <div className="se-dep-reason">„{d.reason}"</div>
                </div>
              ))}
            </div>
          )}
          <p className="se-aged">…a všem ostatním přibyl rok. Kádr o sezónu zestárl.</p>
        </Section>

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
            <Stat big={`${data.seasonStats.matchesPlayed}`} label="odehraných zápasů" />
            <Stat big={`${data.seasonStats.totalYellowCards}/${data.seasonStats.totalRedCards}`} label="žluté / červené" />
            {data.seasonStats.biggestWin && <Stat big={`${data.seasonStats.biggestWin.homeScore}:${data.seasonStats.biggestWin.awayScore}`} label="nejvyšší výhra" sub={`${data.seasonStats.biggestWin.homeTeam} – ${data.seasonStats.biggestWin.awayTeam}`} />}
            {data.seasonStats.recordAttendance && <Stat big={`${data.seasonStats.recordAttendance.value}`} label="rekordní návštěva" sub={data.seasonStats.recordAttendance.homeTeam} />}
            {data.seasonStats.longestWinStreak && <Stat big={`${data.seasonStats.longestWinStreak.length}×`} label="nejdelší série" sub={data.seasonStats.longestWinStreak.teamName} />}
          </div>
        </Section>

        {/* 7 — CTA */}
        <Section className="se-cta">
          <div className="se-cta-kicker">Píšťalka zazněla. Začíná</div>
          <div className="se-cta-season" style={{ color: mood.accent }}>SEZÓNA {data.newSeasonNumber}</div>
          <p className="se-cta-text">Nový rozpis, čistá tabulka, nové naděje. Hodně štěstí, trenére.</p>
          <button className="se-enter" onClick={onEnter}>Vstoupit do nové sezóny →</button>
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
.se-stat-big{font-family:var(--font-commentary);font-weight:700;font-size:clamp(1.6rem,4vw,2.4rem);color:#fff;}
.se-stat-label{font-family:var(--font-heading);text-transform:uppercase;letter-spacing:.08em;font-size:.72rem;color:rgba(245,240,232,.5);margin-top:.2rem;}
.se-stat-sub{font-size:.8rem;color:rgba(245,240,232,.4);margin-top:.15rem;}
.se-cta-kicker{font-size:clamp(1rem,2.2vw,1.3rem);color:rgba(245,240,232,.7);}
.se-cta-season{font-family:var(--font-heading);font-weight:700;text-transform:uppercase;letter-spacing:.08em;font-size:clamp(2.6rem,9vw,6rem);line-height:1;margin:.4rem 0 1rem;text-shadow:0 0 50px color-mix(in srgb,var(--accent) 40%,transparent);}
.se-cta-text{color:rgba(245,240,232,.65);max-width:30ch;margin-bottom:2.2rem;}
.se-enter{font-family:var(--font-heading);font-weight:700;text-transform:uppercase;letter-spacing:.06em;font-size:1.05rem;color:#061106;background:var(--accent);border:none;border-radius:999px;padding:1rem 2.4rem;cursor:pointer;transition:transform .2s,box-shadow .2s;box-shadow:0 0 0 0 color-mix(in srgb,var(--accent) 50%,transparent);}
.se-enter:hover{transform:translateY(-2px) scale(1.02);box-shadow:0 12px 40px color-mix(in srgb,var(--accent) 45%,transparent);}
.se-confetti{position:absolute;inset:0;pointer-events:none;overflow:hidden;z-index:5;}
.se-confetti span{position:absolute;top:-6%;border-radius:2px;animation-name:seFall;animation-timing-function:linear;animation-iteration-count:infinite;opacity:.9;}
@keyframes seFall{0%{transform:translateY(-10vh) rotate(0)}100%{transform:translateY(110vh) rotate(calc(var(--rot) * 4))}}
@media(max-width:640px){.se-pos-sub{padding-top:.6rem}.se-dep-tag{margin-left:0}}
`;
