"use client";

/**
 * Vzdělání trenéra — licence, běžící kurz, nabídka kurzů a absolvované kurzy.
 * Cizí profil vidí licenci, běžící kurz a historii; nabídku a test jen vlastník.
 */

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { apiAction, apiFetch } from "@/lib/api";
import { SectionLabel, Spinner } from "@/components/ui";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { LicenceBadge } from "./LicenceBadge";

interface ExamRules {
  questions: number;
  passScore: number;
  timeLimitMin: number;
}

interface Offer {
  kind: "attr_basic" | "attr_advanced" | "licence";
  attr: string | null;
  targetLicence: number | null;
  title: string;
  topic: string;
  current: number | null;
  cap: number | null;
  points: number;
  price: number;
  days: number;
  lessons: number;
  exam: ExamRules;
  available: boolean;
  blockers: string[];
}

interface ActiveCourse {
  id: string;
  kind: Offer["kind"];
  title: string;
  topic: string;
  status: "in_progress" | "exam_ready" | "retake_available";
  daysTotal: number;
  daysRemaining: number;
  examDaysRemaining: number | null;
  price: number;
  retakePrice: number;
  attemptsUsed: number;
  exam: ExamRules;
  openAttempt?: { id: string; expiresAt: string } | null;
  lastScore?: { score: number | null; total: number; passScore: number } | null;
}

interface Education {
  licence: { level: number; label: string; cap: number; source: string; obtainedAt: string | null };
  reputation: number;
  ladder: Array<{ level: number; label: string; cap: number; minReputation: number; price: number; days: number; reached: boolean }>;
  active: ActiveCourse | null;
  offers: Offer[] | null;
  completed: Array<{ id: string; title: string; status: "passed" | "failed"; score: number | null; total: number; finishedAt: string }>;
  season: { attrUsed: number; attrMax: number; licenceUsed: number; licenceMax: number };
}

const czk = (v: number) => `${v.toLocaleString("cs")} Kč`;

function days(n: number): string {
  return n === 1 ? "1 den" : n >= 2 && n <= 4 ? `${n} dny` : `${n} dní`;
}

const SOURCE_LABEL: Record<string, string> = {
  derived: "uznaná praxe",
  course: "získaná na kurzu",
  ai_upgrade: "získaná po sezóně",
};

export function CoachEducationTab({ teamId, isOwn }: { teamId: string; isOwn: boolean }) {
  const router = useRouter();
  const { confirm, dialog } = useConfirm();
  const [data, setData] = useState<Education | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    apiFetch<Education>(`/api/teams/${teamId}/coach/education`)
      .then((d) => { setData(d); setError(null); })
      .catch((e) => {
        console.error("education load:", e);
        setError((e as Error)?.message || "Vzdělání trenéra se nepodařilo načíst.");
      });
  }, [teamId]);

  useEffect(() => { load(); }, [load]);

  const enroll = async (o: Offer) => {
    const ok = await confirm({
      title: `Přihlásit na ${o.title}?`,
      description:
        `Trenér bude ${days(o.days)} mimo trénink, trénink povede asistent (nebo někdo z výboru). `
        + `Skripta dostaneš hned. Na konci tě čeká test: ${o.exam.questions} otázek, ${o.exam.timeLimitMin} minut bez pauzy, `
        + `projdeš s ${o.exam.passScore} správnými. Když nevyjde, je jeden opravný termín za pětinu ceny.`,
      details: [
        { label: "Cena kurzu", value: `−${czk(o.price)}`, color: "text-card-red" },
        { label: "Délka", value: days(o.days), color: "text-ink" },
        ...(o.kind === "licence"
          ? [{ label: "Odměna", value: `licence, strop vlastností ${o.cap}`, color: "text-pitch-600" }]
          : [{ label: "Odměna", value: `+${o.points} ${o.title.split(": ")[1] ?? ""}`, color: "text-pitch-600" }]),
      ],
      confirmLabel: "Přihlásit",
    });
    if (!ok) return;
    setBusy(true);
    const done = await apiAction(apiFetch(`/api/teams/${teamId}/coach/courses`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind: o.kind, attr: o.attr }),
    }), "Přihláška na kurz se nezdařila");
    setBusy(false);
    if (done) load();
  };

  const retake = async (a: ActiveCourse) => {
    const ok = await confirm({
      title: "Přihlásit na opravný termín?",
      description: `${a.title}. Otázky budou jiné než minule, pokud jich škola má dost. Když nevyjde ani opravný termín, kurz propadá i s penězi.`,
      details: [{ label: "Opravný termín", value: `−${czk(a.retakePrice)}`, color: "text-card-red" }],
      confirmLabel: "Přihlásit",
    });
    if (!ok) return;
    setBusy(true);
    const done = await apiAction(apiFetch(`/api/teams/${teamId}/coach/courses/${a.id}/retake`, { method: "POST" }),
      "Přihláška na opravný termín se nezdařila");
    setBusy(false);
    if (done) router.push(`/trener/test?kurz=${a.id}`);
  };

  if (error) return <div className="card p-4 text-sm text-card-red">{error}</div>;
  if (!data) return <div className="flex justify-center py-10"><Spinner /></div>;

  const a = data.active;
  const offers = data.offers ?? [];
  const licenceOffer = offers.find((o) => o.kind === "licence");
  const basic = offers.filter((o) => o.kind === "attr_basic");
  const advanced = offers.filter((o) => o.kind === "attr_advanced");

  return (
    <div className="space-y-5">
      {/* ═══ Licence ═══ */}
      <div className="card p-4 sm:p-5">
        <SectionLabel>Trenérská licence</SectionLabel>
        <div className="flex items-center gap-3 flex-wrap">
          <LicenceBadge level={data.licence.level} showNone className="text-base px-3 py-1" />
          <span className="text-sm text-muted">
            {SOURCE_LABEL[data.licence.source] ?? ""} · strop vlastností <strong className="text-ink tabular-nums">{data.licence.cap}</strong>
          </span>
        </div>
        <div className="mt-4">
          {data.ladder.map((l) => {
            const next = l.level === data.licence.level + 1;
            return (
              <div key={l.level} className={`flex items-center gap-3 py-2 border-b border-gray-50 last:border-b-0 ${next ? "bg-pitch-50/60 -mx-2 px-2 rounded-soft" : ""}`}>
                <span className="shrink-0 w-6 text-center text-base">{l.reached ? "✅" : next ? "➡️" : "🔒"}</span>
                <div className="flex-1 min-w-0">
                  <div className="text-base font-heading font-bold">{l.label}</div>
                  <div className="text-sm text-muted">
                    Strop vlastností {l.cap}
                    {l.minReputation > 0 && ` · reputace aspoň ${l.minReputation}`}
                    {l.level >= 2 && " · otevírá pokročilé kurzy"}
                  </div>
                </div>
                {l.level > 0 && !l.reached && (
                  <div className="shrink-0 text-right text-sm text-muted tabular-nums">
                    <div>{czk(l.price)}</div>
                    <div>{days(l.days)}</div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
        <p className="text-sm text-muted mt-3">
          Licence taky přidá respekt: noví hráči začínají s lepším vztahem k tobě, hráči ochotněji přestoupí
          a špičkoví zaměstnanci jdou jen pod trenéra s papíry. Soutěž si může odhlasovat minimální licenci.
        </p>
      </div>

      {/* ═══ Běžící kurz ═══ */}
      {a && (
        <div className="card p-4 sm:p-5 border-l-4 border-pitch-500">
          <SectionLabel>Právě na kurzu</SectionLabel>
          <div className="text-lg font-heading font-extrabold">{a.title}</div>
          <div className="text-sm text-muted">{a.topic}</div>

          {a.status === "in_progress" && (
            <div className="mt-3">
              <div className="flex justify-between text-sm mb-1">
                <span className="text-muted">Zbývá {days(a.daysRemaining)} z {a.daysTotal}</span>
                <span className="text-muted">pak test</span>
              </div>
              <div className="h-2 rounded-full bg-gray-100 overflow-hidden">
                <div className="h-full rounded-full bg-pitch-500" style={{ width: `${Math.round(((a.daysTotal - a.daysRemaining) / a.daysTotal) * 100)}%` }} />
              </div>
              <p className="text-sm text-muted mt-2">Trenér teď chybí na tréninku, vede ho asistent. Zápasy koučuje dál.</p>
            </div>
          )}

          {isOwn && a.status === "exam_ready" && (
            <div className="mt-3 rounded-soft bg-amber-50 border border-amber-200 p-3 text-sm text-amber-900">
              {a.openAttempt
                ? <strong>Test právě běží! Čas se nezastavuje.</strong>
                : <>Čeká tě {a.attemptsUsed > 0 ? "opravný " : ""}test: {a.exam.questions} otázek, {a.exam.timeLimitMin} minut,
                  projdeš s {a.exam.passScore} správnými. Na test máš ještě {days(a.examDaysRemaining ?? 0)}.</>}
            </div>
          )}

          {isOwn && a.status === "retake_available" && (
            <div className="mt-3 rounded-soft bg-red-50 border border-red-200 p-3 text-sm text-red-800">
              Test nevyšel{a.lastScore ? ` (${a.lastScore.score ?? 0} z ${a.lastScore.total}, potřeba ${a.lastScore.passScore})` : ""}.
              Opravný termín stojí {czk(a.retakePrice)}, přihlásit se můžeš ještě {days(a.examDaysRemaining ?? 0)}.
            </div>
          )}

          {isOwn && (
            <div className="flex flex-wrap gap-2 mt-4">
              <Link href={`/trener/skripta?kurz=${a.id}`} className="btn btn-secondary btn-lg">📖 Skripta</Link>
              {a.status === "exam_ready" && (
                <Link href={`/trener/test?kurz=${a.id}`} className="btn btn-primary btn-lg">
                  {a.openAttempt ? "Pokračovat v testu" : "Jít na test"}
                </Link>
              )}
              {a.status === "retake_available" && (
                <button type="button" disabled={busy} onClick={() => retake(a)} className="btn btn-primary btn-lg disabled:opacity-40">
                  Opravný termín
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* ═══ Nabídka kurzů (jen vlastník) ═══ */}
      {isOwn && data.offers && (
        <>
          {licenceOffer && (
            <div className="card p-4 sm:p-5">
              <SectionLabel>Licenční kurz</SectionLabel>
              <OfferRow o={licenceOffer} busy={busy} onEnroll={enroll} />
            </div>
          )}

          <div className="card p-4 sm:p-5">
            <SectionLabel>Kurzy vlastností</SectionLabel>
            <p className="text-sm text-muted mb-2">
              Letos {data.season.attrUsed} z {data.season.attrMax} kurzů vlastností, {data.season.licenceUsed} z {data.season.licenceMax} licenčních.
              Vlastnost roste jen do stropu licence.
            </p>
            <div className="text-sm font-heading font-bold text-muted mt-3 mb-1">Základní (+3, test 8 otázek)</div>
            {basic.map((o) => <OfferRow key={`${o.kind}-${o.attr}`} o={o} busy={busy} onEnroll={enroll} />)}
            <div className="text-sm font-heading font-bold text-muted mt-4 mb-1">Pokročilé (+5, od UEFA B, test 10 otázek)</div>
            {advanced.map((o) => <OfferRow key={`${o.kind}-${o.attr}`} o={o} busy={busy} onEnroll={enroll} />)}
          </div>
        </>
      )}

      {/* ═══ Absolvované ═══ */}
      <div className="card p-4 sm:p-5">
        <SectionLabel>Absolvované kurzy</SectionLabel>
        {data.completed.length === 0 ? (
          <p className="text-sm text-muted">Zatím žádný. Trenérská škola čeká.</p>
        ) : data.completed.map((c) => (
          <div key={c.id} className="flex items-center gap-3 py-2 border-b border-gray-50 last:border-b-0">
            <span className="shrink-0 text-lg">{c.status === "passed" ? "✅" : "❌"}</span>
            <div className="flex-1 min-w-0">
              <div className="text-base font-heading font-bold truncate">{c.title}</div>
              <div className="text-sm text-muted">
                {c.status === "passed" ? "Úspěšně" : "Propadl"}
                {c.score !== null && ` · nejlepší test ${c.score} z ${c.total}`}
              </div>
            </div>
            {isOwn && (
              <Link href={`/trener/skripta?kurz=${c.id}`} className="shrink-0 text-sm font-heading font-bold text-pitch-600 hover:underline min-h-11 flex items-center px-2">
                Skripta
              </Link>
            )}
          </div>
        ))}
      </div>
      {dialog}
    </div>
  );
}

function OfferRow({ o, busy, onEnroll }: { o: Offer; busy: boolean; onEnroll: (o: Offer) => void }) {
  return (
    <div className="py-3 border-b border-gray-50 last:border-b-0">
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <div className="text-base font-heading font-bold">{o.kind === "licence" ? o.title : o.title.split(": ")[1]}</div>
          <div className="text-sm text-muted">{o.topic} · {o.lessons} lekcí</div>
          {o.kind !== "licence" && o.current !== null && (
            <div className="text-sm text-ink-light mt-0.5">
              Teď <strong className="tabular-nums">{o.current}</strong>
              {o.points > 0 && <> → <strong className="tabular-nums text-pitch-600">{o.current + o.points}</strong></>}
              <span className="text-muted"> · strop {o.cap}</span>
            </div>
          )}
          <div className="text-sm text-muted mt-0.5 tabular-nums">
            {czk(o.price)} · {days(o.days)} · test {o.exam.questions} otázek / {o.exam.timeLimitMin} min
          </div>
          {!o.available && o.blockers.length > 0 && (
            <div className="text-sm text-amber-800 mt-1">{o.blockers[0]}</div>
          )}
        </div>
        <button type="button" disabled={!o.available || busy} onClick={() => onEnroll(o)}
          className="shrink-0 btn btn-primary btn-sm disabled:opacity-40 disabled:cursor-not-allowed">
          Přihlásit
        </button>
      </div>
    </div>
  );
}
