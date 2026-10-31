"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useTeam } from "@/context/team-context";
import { apiFetch, apiAction } from "@/lib/api";
import { SectionLabel } from "@/components/ui";
import { FaceAvatar } from "@/components/players/face-avatar";

/** Rozhovory pro Zpravodaj: před zápasem, po zápase, na konci sezóny. */
interface Tazatel {
  id: string;
  name: string;
  style: string;
  bio: string;
  sentiment: number;
  vztah: string;
  avatar: Record<string, unknown> | null;
}

/** Fakta ze zápasu — hráč nemá odpovídat po paměti. */
interface PostMatchContext {
  teamName: string;
  opponentName: string;
  opponentManagerName: string | null;
  ownScore: number;
  oppScore: number;
  outcome: "win" | "draw" | "loss";
  ownCards: number;
  oppCards: number;
  ownReds: number;
  oppReds: number;
  ownPenalties: number;
  oppPenalties: number;
  refereeName: string | null;
  incident: { minute: number; kind: string; severity: string; text: string } | null;
  opponentStatement: { quote: string; tone: string } | null;
}

interface AppliedEffects {
  refereeRespect: number;
  refereeName: string | null;
  fine: number;
  squadMorale: number;
  fans: number;
  reputation: number;
  postoj: "kritika" | "neutral" | "obhajoba";
  sila: number;
}

interface CoachInterview {
  id: string;
  gameWeek: number;
  questions: string[];
  expiresAt: string;
  journalist?: Tazatel | null;
  kind?: "pre_match" | "post_match" | "season_wrap";
  topics?: string[];
  context?: PostMatchContext | null;
}

/** Jak vztah redaktora ke klubu obarvit — ať je na první pohled vidět, na čem jsi. */
function vztahStyl(sentiment: number): string {
  if (sentiment >= 25) return "text-pitch-600";
  if (sentiment > -25) return "text-muted";
  return "text-card-red";
}

const STYL_REDAKTORA: Record<string, string> = {
  bulvar: "bulvární pero",
  seriozni: "seriózní pero",
  vycurany: "vyčůrané pero",
  patriot: "srdcař okresu",
};

/** Tóny odpovědí — klíče musí sedět s ANSWER_TONES v apps/api/src/news/answer-tone.ts. */
const TONY_ODPOVEDI: Array<{ key: string; label: string }> = [
  { key: "normalni", label: "Normálně" },
  { key: "nadsazka", label: "S nadsázkou" },
  { key: "ironie", label: "Ironicky" },
  { key: "nastvane", label: "Naštvaně" },
  { key: "pokorne", label: "Pokorně" },
];

export function Interviews() {
  const { teamId } = useTeam();
  const [interviews, setInterviews] = useState<CoachInterview[]>([]);
  const [interviewAnswers, setInterviewAnswers] = useState<Record<string, string[]>>({});
  const [interviewTones, setInterviewTones] = useState<Record<string, string[]>>({});
  const [interviewSubmitting, setInterviewSubmitting] = useState<string | null>(null);
  const [interviewDone, setInterviewDone] = useState<string | null>(null);
  // Skutečné dopady pozápasové odpovědi — hráč má vidět, co si koupil.
  const [interviewEffects, setInterviewEffects] = useState<AppliedEffects | null>(null);

  useEffect(() => {
    if (!teamId) return;
    apiFetch<{ interviews: CoachInterview[] }>(`/api/teams/${teamId}/coach-interviews`)
      .then((d) => {
        setInterviews(d.interviews ?? []);
        // Odkaz z telefonu (#rozhovor-…) míří na kartu, která se vykreslí až po načtení.
        const hash = window.location.hash.slice(1);
        if (hash) requestAnimationFrame(() => document.getElementById(hash)?.scrollIntoView({ behavior: "smooth", block: "start" }));
      })
      .catch((e) => { console.error("coach-interviews fetch:", e); });
  }, [teamId]);

  const handleInterviewAnswer = (interviewId: string, idx: number, value: string) => {
    setInterviewAnswers((prev) => {
      const cur = prev[interviewId] ?? [];
      const next = [...cur];
      next[idx] = value;
      return { ...prev, [interviewId]: next };
    });
  };

  const handleInterviewTone = (interviewId: string, idx: number, tone: string) => {
    setInterviewTones((prev) => {
      const next = [...(prev[interviewId] ?? [])];
      next[idx] = tone;
      return { ...prev, [interviewId]: next };
    });
  };

  const handleInterviewSubmit = async (interview: CoachInterview) => {
    if (!teamId || interviewSubmitting) return;
    const answers = interviewAnswers[interview.id] ?? [];
    if (answers.filter((a) => a?.trim()).length < interview.questions.length) return;
    setInterviewSubmitting(interview.id);
    // Odpověď endpointu nese zaúčtované efekty — apiAction je zahazuje, proto holder.
    const vysledek: { effects: AppliedEffects | null } = { effects: null };
    const ok = await apiAction(
      apiFetch<{ effects?: AppliedEffects | null }>(`/api/teams/${teamId}/coach-interviews/${interview.id}/answer`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          answers,
          tones: interview.questions.map((_, i) => interviewTones[interview.id]?.[i] ?? "normalni"),
        }),
      }).then((r) => { vysledek.effects = r?.effects ?? null; }),
      "Odeslání odpovědí se nezdařilo");
    if (ok) {
      setInterviews((prev) => prev.filter((iv) => iv.id !== interview.id));
      setInterviewDone(interview.id);
      setInterviewEffects(vysledek.effects);
    }
    setInterviewSubmitting(null);
  };

  const handleInterviewDecline = async (interviewId: string) => {
    if (!teamId) return;
    if (await apiAction(apiFetch(`/api/teams/${teamId}/coach-interviews/${interviewId}/decline`, { method: "POST" }), "Odmítnutí rozhovoru se nezdařilo")) {
      setInterviews((prev) => prev.filter((iv) => iv.id !== interviewId));
    }
  };

  return (
    <>
      {/* Rozhovor kola */}
      {interviews.length > 0 && (
        <div>
          <SectionLabel>📰 Zpravodaj žádá o rozhovor</SectionLabel>
          <div className="space-y-4">
            {interviews.map((iv) => {
              const answers = interviewAnswers[iv.id] ?? [];
              const allFilled = iv.questions.every((_, i) => answers[i]?.trim());
              const expiryDate = new Date(iv.expiresAt);
              const expiryStr = expiryDate.toLocaleDateString("cs", { weekday: "long", day: "numeric", month: "numeric" });
              const jePo = iv.kind === "post_match";
              const ctx = iv.context ?? null;
              return (
                <div key={iv.id} id={`rozhovor-${iv.id}`} className={`card border-2 p-5 ${jePo ? "bg-sky-50 border-sky-300" : "bg-amber-50 border-amber-300"}`}>
                  <div className="flex items-start justify-between gap-3 mb-4">
                    <div className="min-w-0">
                      <h3 className="font-heading font-bold text-lg">
                        {jePo && ctx
                          ? `🎙️ Po zápase · ${ctx.teamName} ${ctx.ownScore}:${ctx.oppScore} ${ctx.opponentName}`
                          : `🎙️ Rozhovor před ${iv.gameWeek}. kolem`}
                      </h3>
                      {iv.journalist ? (
                        <div className="flex items-start gap-3 mt-2">
                          {iv.journalist.avatar && (
                            <FaceAvatar
                              faceConfig={iv.journalist.avatar}
                              size={52}
                              className="border border-ink/30 bg-white shrink-0"
                            />
                          )}
                          <div className="min-w-0">
                            <div className="text-base font-heading font-bold">
                              {iv.journalist.name}
                              <span className="text-sm text-muted font-normal ml-2">
                                {STYL_REDAKTORA[iv.journalist.style] ?? "redakce"}
                              </span>
                            </div>
                            <div className="text-sm mt-0.5">
                              Vztah k tobě:{" "}
                              <span className={`font-heading font-bold ${vztahStyl(iv.journalist.sentiment)}`}>
                                {iv.journalist.vztah}
                              </span>
                            </div>
                            <p className="text-xs text-ink-light italic mt-0.5">{iv.journalist.bio}</p>
                          </div>
                        </div>
                      ) : (
                        <p className="text-sm text-ink-light mt-1">
                          {jePo
                            ? "Redaktor Okresního zpravodaje se chce zeptat na odehraný zápas."
                            : "Redaktor Okresního zpravodaje se chce zeptat před nadcházejícím zápasem."}
                        </p>
                      )}
                      <div className="text-xs text-muted mt-2">Vyprší: {expiryStr}</div>
                    </div>
                  </div>
                  {jePo && ctx && (
                    <div className="mb-4 space-y-3">
                      {/* Faktový pruh — ať se nikdo nemusí vracet do detailu zápasu. */}
                      <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-ink-light">
                        {ctx.refereeName && <span>Rozhodčí: <span className="font-heading font-bold text-ink">{ctx.refereeName}</span></span>}
                        <span>Karty: <span className="font-heading font-bold text-ink tabular-nums">{ctx.ownCards}:{ctx.oppCards}</span></span>
                        {(ctx.ownReds > 0 || ctx.oppReds > 0) && (
                          <span>Červené: <span className="font-heading font-bold text-card-red tabular-nums">{ctx.ownReds}:{ctx.oppReds}</span></span>
                        )}
                        {(ctx.ownPenalties > 0 || ctx.oppPenalties > 0) && (
                          <span>Penalty: <span className="font-heading font-bold text-ink tabular-nums">{ctx.ownPenalties}:{ctx.oppPenalties}</span></span>
                        )}
                      </div>
                      {ctx.incident && (
                        <div className="rounded-xl border border-card-red/40 bg-card-red/5 px-3 py-2">
                          <div className="text-sm font-heading font-bold">⚠️ Sporná situace · {ctx.incident.minute}. minuta</div>
                          <p className="text-sm mt-0.5">{ctx.incident.text}</p>
                        </div>
                      )}
                    </div>
                  )}
                  <div className="space-y-4">
                    {iv.questions.map((q, i) => (
                      <div key={i}>
                        {jePo && ctx?.opponentStatement && iv.topics?.[i] === "vyrok_soupere" && (
                          <blockquote className="mb-2 border-l-4 border-line-strong pl-3 text-sm italic text-ink-light">
                            „{ctx.opponentStatement.quote}"
                            {ctx.opponentManagerName && (
                              <span className="not-italic text-xs text-muted block mt-0.5">— {ctx.opponentManagerName}, před zápasem</span>
                            )}
                          </blockquote>
                        )}
                        <label className="block text-sm font-heading font-bold mb-1">{q}</label>
                        <textarea
                          value={answers[i] ?? ""}
                          onChange={(e) => handleInterviewAnswer(iv.id, i, e.target.value)}
                          maxLength={500}
                          rows={3}
                          placeholder="Vaše odpověď..."
                          className="w-full rounded-xl border border-line bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-pitch-500/30 resize-none"
                        />
                        <div className="flex items-start justify-between gap-2 mt-1">
                          <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Tón odpovědi">
                            {TONY_ODPOVEDI.map((t) => {
                              const vybrany = (interviewTones[iv.id]?.[i] ?? "normalni") === t.key;
                              return (
                                <button
                                  key={t.key}
                                  type="button"
                                  role="radio"
                                  aria-checked={vybrany}
                                  onClick={() => handleInterviewTone(iv.id, i, t.key)}
                                  className={`rounded-full border px-2.5 py-0.5 text-sm transition-colors ${
                                    vybrany
                                      ? "bg-ink text-white border-ink"
                                      : "bg-white border-line text-ink-light hover:border-line-strong"
                                  }`}
                                >
                                  {t.label}
                                </button>
                              );
                            })}
                          </div>
                          <div className="text-xs text-muted mt-1 shrink-0 tabular-nums">{(answers[i] ?? "").length}/500</div>
                        </div>
                      </div>
                    ))}
                  </div>
                  <p className="text-sm text-ink-light mt-3">
                    Tón u odpovědi říká redaktorovi, jak ji myslíš. Ironii pak nevezme doslova.
                  </p>
                  {jePo && ctx?.refereeName && (
                    <p className="text-xs text-ink-light mt-1">
                      Co tady řekneš o rozhodčím, si {ctx.refereeName} zapamatuje do příštího vzájemného zápasu.
                    </p>
                  )}
                  <div className="flex items-center justify-between mt-4">
                    <button
                      onClick={() => handleInterviewDecline(iv.id)}
                      className="text-xs text-muted hover:text-ink-light transition-colors"
                    >
                      Odmítnout rozhovor
                    </button>
                    <button
                      onClick={() => handleInterviewSubmit(iv)}
                      disabled={!allFilled || interviewSubmitting === iv.id}
                      className="btn-primary text-sm px-4 py-2 disabled:opacity-40"
                    >
                      {interviewSubmitting === iv.id ? "Odesílám…" : "Odeslat odpovědi"}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
      {interviewDone && interviews.length === 0 && (
        <div className="card p-4 bg-pitch-50 border border-pitch-200 text-sm text-pitch-700">
          <div className="font-heading font-medium">
            ✅ Odpovědi odeslány — článek vyjde ve{" "}
            <Link href="/zpravodaj" className="underline hover:text-pitch-900">Zpravodaji</Link>.
          </div>
          {interviewEffects && (
            <ul className="mt-2 space-y-0.5 text-ink">
              {interviewEffects.refereeRespect !== 0 && (
                <li>
                  {interviewEffects.refereeRespect < 0 ? "🧑‍⚖️ " : "🤝 "}
                  {interviewEffects.refereeName ?? "Rozhodčí"} si to zapamatoval{" "}
                  <span className="tabular-nums font-heading font-bold">
                    ({interviewEffects.refereeRespect > 0 ? "+" : ""}{interviewEffects.refereeRespect})
                  </span>
                </li>
              )}
              {interviewEffects.fine > 0 && (
                <li>💸 Pokuta disciplinární komise: <span className="tabular-nums font-heading font-bold">{interviewEffects.fine.toLocaleString("cs")} Kč</span></li>
              )}
              {interviewEffects.squadMorale !== 0 && (
                <li>💪 Morálka kabiny <span className="tabular-nums font-heading font-bold">{interviewEffects.squadMorale > 0 ? "+" : ""}{interviewEffects.squadMorale}</span></li>
              )}
              {interviewEffects.fans !== 0 && (
                <li>📣 Fanoušci <span className="tabular-nums font-heading font-bold">{interviewEffects.fans > 0 ? "+" : ""}{interviewEffects.fans}</span></li>
              )}
              {interviewEffects.reputation !== 0 && (
                <li>⭐ Reputace klubu <span className="tabular-nums font-heading font-bold">{interviewEffects.reputation > 0 ? "+" : ""}{interviewEffects.reputation}</span></li>
              )}
            </ul>
          )}
        </div>
      )}
    </>
  );
}
