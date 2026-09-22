"use client";

/**
 * Závěrečný test trenérské školy.
 *
 * Čas hlídá server: spuštěním testu začne běžet a nezastaví se ani po zavření
 * stránky. Každá odpověď se hned ukládá, takže po návratu test pokračuje se
 * zbývajícím časem. Při nule se test odevzdá sám.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useTeam } from "@/context/team-context";
import { apiFetch, showError } from "@/lib/api";
import { SectionLabel, Spinner } from "@/components/ui";
import { useConfirm } from "@/components/ui/confirm-dialog";

interface Rules {
  questions: number;
  passScore: number;
  timeLimitMin: number;
}

interface Question {
  id: string;
  text: string;
  options: string[];
}

interface Running {
  state: "running";
  attemptId: string;
  attemptNo: number;
  expiresAt: string;
  serverNow: string;
  questions: Question[];
  answers: number[];
  rules: Rules;
}

interface Ready {
  state: "ready";
  courseTitle: string;
  courseStatus: string;
  rules: Rules;
  attemptNo: number;
  attemptsLeft: number;
  examDaysRemaining: number | null;
  retakePrice: number;
}

interface ReviewItem {
  id: string;
  text: string;
  options: string[];
  chosen: number;
  isCorrect: boolean;
  correct: number | null;
  explain: string | null;
  lessonTitle: string | null;
}

interface Result {
  state: "result";
  courseTitle: string;
  courseStatus: string;
  score: number;
  total: number;
  passScore: number;
  passed: boolean;
  review: ReviewItem[];
  retakePrice: number | null;
  reward: string | null;
}

type Exam = Running | Ready | Result;

const LETTERS = ["A", "B", "C", "D"];

function formatTime(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export default function TestPage() {
  const { teamId } = useTeam();
  const [courseId, setCourseId] = useState<string | null | undefined>(undefined);
  const [exam, setExam] = useState<Exam | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setCourseId(new URLSearchParams(window.location.search).get("kurz"));
  }, []);

  const load = useCallback(() => {
    if (!teamId || !courseId) return;
    apiFetch<Exam>(`/api/teams/${teamId}/coach/courses/${courseId}/exam`)
      .then((d) => { setExam(d); setError(null); })
      .catch((e) => {
        console.error("exam load:", e);
        setError((e as Error)?.message || "Test se nepodařilo načíst.");
      });
  }, [teamId, courseId]);

  useEffect(() => { load(); }, [load]);

  if (courseId === null) {
    return <div className="page-container"><div className="card p-4 text-base">Chybí kurz. Test najdeš na profilu trenéra v záložce Vzdělání.</div></div>;
  }
  if (error) {
    return (
      <div className="page-container space-y-3 max-w-[760px]">
        <div className="card p-4 text-base">{error}</div>
        {courseId && <Link href={`/trener/skripta?kurz=${courseId}`} className="btn btn-secondary btn-lg">📖 Skripta</Link>}
      </div>
    );
  }
  if (!exam || !teamId || !courseId) return <div className="min-h-[50dvh] flex items-center justify-center"><Spinner size="lg" /></div>;

  if (exam.state === "ready") return <Intro exam={exam} teamId={teamId} courseId={courseId} onStarted={setExam} />;
  if (exam.state === "running") return <RunningExam exam={exam} teamId={teamId} courseId={courseId} onFinished={setExam} onReload={load} />;
  return <ResultView result={exam} teamId={teamId} courseId={courseId} />;
}

// ── Úvod s varováním ──

function Intro({ exam, teamId, courseId, onStarted }: { exam: Ready; teamId: string; courseId: string; onStarted: (e: Exam) => void }) {
  const [ready, setReady] = useState(false);
  const [starting, setStarting] = useState(false);

  const start = async () => {
    setStarting(true);
    try {
      const running = await apiFetch<Running>(`/api/teams/${teamId}/coach/courses/${courseId}/exam/start`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ confirm: true }),
      });
      onStarted(running);
    } catch (e) {
      console.error("exam start:", e);
      showError("Test se nepodařilo spustit", (e as Error)?.message || "Zkus to prosím znovu.");
      setStarting(false);
    }
  };

  return (
    <div className="page-container space-y-4 max-w-[760px]">
      <div className="card p-4 sm:p-6">
        <div className="text-sm text-muted">{exam.attemptNo > 1 ? "Opravný termín" : "Závěrečný test"}</div>
        <h1 className="text-xl font-heading font-extrabold">{exam.courseTitle}</h1>
        <div className="grid grid-cols-3 gap-2 mt-4 text-center">
          <div className="rounded-soft bg-surface p-3">
            <div className="text-2xl font-heading font-extrabold tabular-nums">{exam.rules.questions}</div>
            <div className="text-sm text-muted">otázek</div>
          </div>
          <div className="rounded-soft bg-surface p-3">
            <div className="text-2xl font-heading font-extrabold tabular-nums">{exam.rules.timeLimitMin}</div>
            <div className="text-sm text-muted">minut</div>
          </div>
          <div className="rounded-soft bg-surface p-3">
            <div className="text-2xl font-heading font-extrabold tabular-nums">{exam.rules.passScore}</div>
            <div className="text-sm text-muted">správně k úspěchu</div>
          </div>
        </div>
        <p className="text-sm text-muted mt-3">
          {exam.attemptsLeft > 1 ? "Když nevyjde, zbývá jeden opravný termín." : "Tohle je poslední pokus. Když nevyjde, kurz propadá i s penězi."}
          {exam.examDaysRemaining !== null && ` Na test máš ještě ${exam.examDaysRemaining} ${exam.examDaysRemaining === 1 ? "den" : exam.examDaysRemaining <= 4 ? "dny" : "dní"}.`}
        </p>
      </div>

      <div className="card p-4 sm:p-6 border-2 border-amber-400 bg-amber-50">
        <div className="text-lg font-heading font-extrabold text-amber-900">⚠️ Než začneš</div>
        <ul className="mt-2 space-y-2 text-base text-amber-900">
          <li>• Jakmile test spustíš, <strong>čas běží, i když stránku zavřeš</strong> nebo ti vypadne signál.</li>
          <li>• Test <strong>nejde pozastavit ani spustit znovu</strong>.</li>
          <li>• <strong>Skripta budou během testu zamčená.</strong> Přečti si je předem.</li>
          <li>• Odpovědi se ukládají hned. <strong>Nezodpovězené otázky se počítají jako špatně.</strong></li>
          <li>• Když čas doběhne, test se odevzdá sám.</li>
        </ul>
        <label className="flex items-center gap-3 mt-4 min-h-11 cursor-pointer select-none">
          <input type="checkbox" checked={ready} onChange={(e) => setReady(e.target.checked)} className="w-6 h-6 accent-pitch-500" />
          <span className="text-base font-heading font-bold text-ink">Rozumím, jsem připravený</span>
        </label>
      </div>

      <div className="flex flex-col sm:flex-row gap-2">
        <Link href={`/trener/skripta?kurz=${courseId}`} className="btn btn-secondary btn-lg flex-1 text-center">📖 Ještě si projdu skripta</Link>
        <button type="button" disabled={!ready || starting} onClick={start}
          className="btn btn-primary btn-lg flex-1 disabled:opacity-40 disabled:cursor-not-allowed">
          {starting ? "Spouštím…" : "Spustit test"}
        </button>
      </div>
    </div>
  );
}

// ── Běžící test ──

function RunningExam({ exam, teamId, courseId, onFinished, onReload }: {
  exam: Running; teamId: string; courseId: string; onFinished: (e: Exam) => void; onReload: () => void;
}) {
  const { confirm, dialog } = useConfirm();
  const [answers, setAnswers] = useState<number[]>(exam.answers);
  const [index, setIndex] = useState(() => Math.max(0, exam.answers.findIndex((a) => a < 0)));
  const [now, setNow] = useState(() => Date.now());
  const [submitting, setSubmitting] = useState(false);
  const offset = useRef(Date.parse(exam.serverNow) - Date.now());
  const pending = useRef<Promise<unknown>>(Promise.resolve());
  const submitted = useRef(false);

  const remaining = Date.parse(exam.expiresAt) - (now + offset.current);

  const submit = useCallback(async () => {
    if (submitted.current) return;
    submitted.current = true;
    setSubmitting(true);
    // Nejdřív doběhnou rozeslané odpovědi, ať se nic neztratí.
    await pending.current.catch((e) => console.warn("čekání na uložení odpovědí:", e));
    try {
      const result = await apiFetch<Result>(`/api/teams/${teamId}/coach/courses/${courseId}/exam/submit`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ attemptId: exam.attemptId }),
      });
      onFinished(result);
    } catch (e) {
      console.error("exam submit:", e);
      showError("Test se nepodařilo odevzdat", (e as Error)?.message || "Zkus stránku načíst znovu, vyhodnotí se uložené odpovědi.");
      submitted.current = false;
      setSubmitting(false);
      onReload();
    }
  }, [teamId, courseId, exam.attemptId, onFinished, onReload]);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, []);

  // Nová otázka vždy od začátku — jinak by ji po přechodu z úvodu překryla lišta s časem.
  useEffect(() => { window.scrollTo({ top: 0 }); }, [index]);

  useEffect(() => {
    if (remaining <= 0) void submit();
  }, [remaining, submit]);

  // Zavření stránky test nezastaví — aspoň varovat.
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, []);

  const choose = (qi: number, option: number) => {
    if (submitted.current) return;
    setAnswers((prev) => prev.map((a, i) => (i === qi ? option : a)));
    const save = apiFetch(`/api/teams/${teamId}/coach/courses/${courseId}/exam/answer`, {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ attemptId: exam.attemptId, questionIndex: qi, answer: option }),
    }).catch((e) => {
      console.error("exam answer:", e);
      if ((e as { status?: number }).status === 409) void submit();
      else showError("Odpověď se neuložila", "Zkontroluj připojení a klikni na odpověď znovu.");
    });
    pending.current = pending.current.then(() => save);
  };

  const askSubmit = async () => {
    const unanswered = answers.filter((a) => a < 0).length;
    const ok = await confirm({
      title: "Odevzdat test?",
      description: unanswered > 0
        ? `Nezodpovězených otázek: ${unanswered}. Počítají se jako špatně.`
        : "Všechny otázky máš zodpovězené. Po odevzdání už nic nezměníš.",
      confirmLabel: "Odevzdat",
    });
    if (ok) void submit();
  };

  const q = exam.questions[index];
  const answeredCount = answers.filter((a) => a >= 0).length;
  const low = remaining < 60_000;

  return (
    <div className="page-container space-y-4 max-w-[760px]">
      {/* Odpočet — pořád na očích */}
      <div className={`sticky top-0 z-10 card p-3 flex items-center justify-between ${low ? "bg-red-50 border border-red-300" : ""}`}>
        <div className="text-sm text-muted">Otázka <strong className="text-ink tabular-nums">{index + 1}/{exam.questions.length}</strong> · zodpovězeno {answeredCount}</div>
        <div className={`text-2xl font-heading font-extrabold tabular-nums ${low ? "text-card-red" : "text-ink"}`} aria-live="polite">
          ⏱ {formatTime(remaining)}
        </div>
      </div>

      {submitting ? (
        <div className="card p-6 flex flex-col items-center gap-3"><Spinner /><div className="text-base">Vyhodnocuji…</div></div>
      ) : q && (
        <div className="card p-4 sm:p-6">
          <SectionLabel>Otázka {index + 1}</SectionLabel>
          <div className="text-lg font-heading font-bold leading-snug">{q.text}</div>
          <div className="mt-4 space-y-2">
            {q.options.map((opt, oi) => {
              const selected = answers[index] === oi;
              return (
                <button key={oi} type="button" onClick={() => choose(index, oi)}
                  className={`w-full min-h-12 text-left flex items-start gap-3 rounded-soft border-2 px-3 py-3 transition-colors ${
                    selected ? "border-pitch-500 bg-pitch-50" : "border-gray-200 bg-white hover:border-pitch-300"
                  }`}>
                  <span className={`shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-sm font-heading font-bold ${
                    selected ? "bg-pitch-500 text-white" : "bg-surface text-muted"
                  }`}>{LETTERS[oi]}</span>
                  <span className="text-base leading-snug">{opt}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {!submitting && (
        <>
          <div className="flex gap-2">
            <button type="button" disabled={index === 0} onClick={() => setIndex((i) => i - 1)}
              className="btn btn-secondary btn-lg flex-1 disabled:opacity-40">← Předchozí</button>
            {index < exam.questions.length - 1 ? (
              <button type="button" onClick={() => setIndex((i) => i + 1)} className="btn btn-primary btn-lg flex-1">Další →</button>
            ) : (
              <button type="button" onClick={askSubmit} className="btn btn-primary btn-lg flex-1">Odevzdat</button>
            )}
          </div>

          <div className="card p-3">
            <div className="flex flex-wrap gap-2">
              {exam.questions.map((qq, i) => (
                <button key={qq.id} type="button" onClick={() => setIndex(i)}
                  className={`min-h-11 min-w-11 rounded-control text-sm font-heading font-bold border ${
                    i === index ? "border-ink" : "border-gray-200"
                  } ${answers[i] >= 0 ? "bg-pitch-500 text-white" : "bg-surface text-muted"}`}
                  aria-label={`Otázka ${i + 1}${answers[i] >= 0 ? ", zodpovězeno" : ""}`}>
                  {i + 1}
                </button>
              ))}
            </div>
            {index < exam.questions.length - 1 && (
              <button type="button" onClick={askSubmit} className="mt-3 text-sm font-heading font-bold text-pitch-600 hover:underline min-h-11">
                Odevzdat test dřív
              </button>
            )}
          </div>
        </>
      )}
      {dialog}
    </div>
  );
}

// ── Výsledek ──

function ResultView({ result, teamId, courseId }: { result: Result; teamId: string; courseId: string }) {
  const revealed = result.review.some((r) => r.correct !== null);
  return (
    <div className="page-container space-y-4 max-w-[760px]">
      <div className={`card p-5 sm:p-6 border-2 ${result.passed ? "border-pitch-500 bg-pitch-50" : "border-red-300 bg-red-50"}`}>
        <div className="text-4xl">{result.passed ? "🎓" : "📉"}</div>
        <h1 className="text-xl font-heading font-extrabold mt-1">
          {result.passed ? "Prošel jsi!" : result.courseStatus === "failed" ? "Kurz propadl" : "Tentokrát to nevyšlo"}
        </h1>
        <div className="text-base mt-1">
          {result.courseTitle}: <strong className="tabular-nums">{result.score} z {result.total}</strong>
          <span className="text-muted"> (potřeba {result.passScore})</span>
        </div>
        {result.reward && <div className="text-base font-heading font-bold text-pitch-700 mt-2">Odměna: {result.reward}</div>}
        {result.retakePrice !== null && (
          <p className="text-sm text-red-800 mt-2">
            Máš jeden opravný termín. Přihlásit se na něj můžeš v záložce Vzdělání (cena {result.retakePrice.toLocaleString("cs")} Kč).
          </p>
        )}
        <div className="flex flex-col sm:flex-row gap-2 mt-4">
          <Link href={`/manazer/${teamId}?tab=vzdelani`} className="btn btn-primary btn-lg flex-1 text-center">Zpět na vzdělání trenéra</Link>
          <Link href={`/trener/skripta?kurz=${courseId}`} className="btn btn-secondary btn-lg flex-1 text-center">📖 Skripta</Link>
        </div>
      </div>

      <div className="card p-4 sm:p-5">
        <SectionLabel>Rozbor</SectionLabel>
        {!revealed && (
          <p className="text-sm text-muted mb-2">Správné odpovědi uvidíš, až kurz dokončíš. Kde jsi chyboval, vidíš hned, ať víš, co si ve skriptech zopakovat.</p>
        )}
        <div className="space-y-4">
          {result.review.map((r, i) => (
            <div key={r.id} className="border-b border-gray-50 last:border-b-0 pb-3">
              <div className="flex items-start gap-2">
                <span className="shrink-0 text-lg">{r.isCorrect ? "✅" : "❌"}</span>
                <div className="text-base font-heading font-bold leading-snug">{i + 1}. {r.text}</div>
              </div>
              <div className="mt-2 space-y-1 ml-7">
                {r.options.map((opt, oi) => {
                  const chosen = r.chosen === oi;
                  const correct = r.correct === oi;
                  return (
                    <div key={oi} className={`text-sm rounded-soft px-2 py-1.5 border ${
                      correct ? "border-pitch-500 bg-pitch-50 text-pitch-800"
                        : chosen && !r.isCorrect ? "border-red-300 bg-red-50 text-red-800"
                        : chosen ? "border-pitch-500 bg-pitch-50" : "border-transparent text-muted"
                    }`}>
                      {LETTERS[oi]}) {opt}
                      {chosen && <span className="font-bold"> · tvoje odpověď</span>}
                    </div>
                  );
                })}
                {r.chosen < 0 && <div className="text-sm text-red-700">Nezodpovězeno</div>}
                {r.explain && <p className="text-sm text-ink-light mt-1">{r.explain}</p>}
                {!r.isCorrect && r.lessonTitle && <p className="text-sm text-muted">Zopakuj si lekci: {r.lessonTitle}</p>}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
