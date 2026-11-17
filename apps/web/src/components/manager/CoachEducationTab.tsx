"use client";

/**
 * Vzdělání trenéra — licence, běžící kurz, nabídka kurzů a absolvované kurzy.
 * Cizí profil vidí licenci, běžící kurz a historii; nabídku a test jen vlastník.
 */

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { apiAction, apiFetch } from "@/lib/api";
import { SectionLabel, Spinner, ListCard, ListRow, ListEmpty, RowIcon, RowGroup } from "@/components/ui";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { COURSE_ATTR_LABELS, type CourseAttr } from "@okresni-masina/shared";
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
  /** Díl kurzu vlastnosti, na který by se trenér teď přihlásil. Null u licence. */
  part: number | null;
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

interface AwayPreview {
  coachingAway: number;
  disciplineAway: number;
  slowdownPct: number;
  attendanceDropPp: number;
  standInName: string | null;
  trainingsPerWeek: number;
}

interface Education {
  licence: { level: number; label: string; cap: number; source: string; obtainedAt: string | null };
  reputation: number;
  ladder: Array<{ level: number; label: string; cap: number; minReputation: number; price: number; days: number; reached: boolean }>;
  active: ActiveCourse | null;
  offers: Offer[] | null;
  completed: Array<{ id: string; title: string; status: "passed" | "failed"; score: number | null; total: number; finishedAt: string }>;
  season: { attrUsed: number; attrMax: number; licenceUsed: number; licenceMax: number };
  away: AwayPreview | null;
}

const czk = (v: number) => `${v.toLocaleString("cs")} Kč`;

function lessonsLabel(n: number): string {
  if (n === 1) return "1 lekce";
  return n >= 2 && n <= 4 ? `${n} lekce` : `${n} lekcí`;
}

function days(n: number): string {
  return n === 1 ? "1 den" : n >= 2 && n <= 4 ? `${n} dny` : `${n} dní`;
}

function plural(n: number, forms: [string, string, string]): string {
  return n === 1 ? forms[0] : n >= 2 && n <= 4 ? forms[1] : forms[2];
}

/** Co znamená, že trenér N dní chybí na tréninku, v číslech tohohle klubu. */
function awayRows(away: AwayPreview, daysCount: number): Array<{ label: string; value: string; color?: string }> {
  const trainings = Math.max(1, Math.round((daysCount / 7) * away.trainingsPerWeek));
  const pp = away.attendanceDropPp;
  return [
    { label: "Tréninků bez tebe", value: `asi ${trainings} ${plural(trainings, ["trénink", "tréninky", "tréninků"])}`, color: "text-ink" },
    { label: "Trénink povede", value: away.standInName ? `asistent ${away.standInName}` : "někdo z výboru (nemáš asistenta)", color: "text-ink" },
    {
      label: "Zlepšování hráčů",
      value: away.slowdownPct > 0 ? `o ${away.slowdownPct} % pomalejší` : "skoro beze změny",
      color: away.slowdownPct > 0 ? "text-card-red" : "text-pitch-600",
    },
    {
      label: "Docházka na trénink",
      value: pp > 0 ? `−${pp} ${plural(pp, ["procentní bod", "procentní body", "procentních bodů"])}` : "beze změny",
      color: pp > 0 ? "text-card-red" : "text-pitch-600",
    },
    { label: "Zápasy", value: "koučuješ jako obvykle", color: "text-pitch-600" },
  ];
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
  const [showLockedAdvanced, setShowLockedAdvanced] = useState(false);

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
        `Po dobu kurzu (${days(o.days)}) jsi ve školicím středisku a na tréninky nechodíš. `
        + `Skripta dostaneš hned. Na konci tě čeká test: ${o.exam.questions} otázek, ${o.exam.timeLimitMin} minut bez pauzy, `
        + `projdeš s ${o.exam.passScore} správnými. Když nevyjde, je jeden opravný termín za pětinu ceny.`,
      details: [
        { label: "Cena kurzu", value: `−${czk(o.price)}`, color: "text-card-red" },
        { label: "Délka", value: days(o.days), color: "text-ink" },
        ...(data?.away ? awayRows(data.away, o.days) : []),
        ...(o.kind === "licence"
          ? [{ label: "Odměna", value: `licence, strop vlastností ${o.cap}`, color: "text-pitch-600" }]
          : [{ label: "Odměna", value: `+${o.points} ${COURSE_ATTR_LABELS[o.attr as CourseAttr] ?? ""}`, color: "text-pitch-600" }]),
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
        <div className="-mx-4 sm:-mx-5 mt-4 border-y border-line">
          {data.ladder.map((l) => {
            // Zvýrazněná je vždycky licence, kterou trenér MÁ. Další krok a ceny
            // se ukazují jen na vlastním profilu, cizího trenéra zajímá jen jeho licence.
            const current = l.level === data.licence.level;
            const next = isOwn && l.level === data.licence.level + 1;
            const below = l.level < data.licence.level;
            return (
              <div key={l.level} className={below ? "opacity-65" : ""}>
                <ListRow tone={current ? "new" : next ? "warn" : undefined}
                  leading={<RowIcon>{current ? "🎓" : below ? "✅" : "🔒"}</RowIcon>}
                  title={
                    <span className="inline-flex items-center gap-2 flex-wrap">
                      {l.label}
                      {current && (
                        <span className="text-xs font-heading font-bold px-2.5 py-0.5 rounded-full bg-pitch-600 text-white">
                          {isOwn ? "Tvoje licence" : "Aktuální licence"}
                        </span>
                      )}
                      {next && (
                        <span className="text-xs font-heading font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-900 border border-amber-200">
                          Cíl k dosažení
                        </span>
                      )}
                    </span>
                  }
                  detail={<>
                    <span className="block">
                      Strop vlastností <strong className="text-ink">{l.cap}</strong>
                      {l.minReputation > 0 && ` · reputace aspoň ${l.minReputation}`}
                      {l.level >= 2 && " · otevírá pokročilé kurzy"}
                    </span>
                    {next && (
                      <span className="block font-medium text-pitch-700 mt-1">
                        Další krok: licenční kurz za {czk(l.price)}, {days(l.days)}
                      </span>
                    )}
                  </>} />
              </div>
            );
          })}
        </div>
        {isOwn && (
          <p className="text-sm text-muted mt-3">
            Licence taky přidá respekt: noví hráči začínají s lepším vztahem k tobě, hráči ochotněji přestoupí
            a špičkoví zaměstnanci jdou jen pod trenéra s papíry. Soutěž si může odhlasovat minimální licenci.
          </p>
        )}
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
              {isOwn && data.away ? (
                <div className="mt-3 rounded-soft bg-surface p-3">
                  <div className="text-sm font-heading font-bold mb-1">Co to dělá s tréninkem</div>
                  {awayRows(data.away, a.daysRemaining).map((r) => (
                    <div key={r.label} className="flex justify-between gap-3 text-sm py-0.5">
                      <span className="text-muted">{r.label === "Tréninků bez tebe" ? "Ještě tréninků bez tebe" : r.label}</span>
                      <span className={`font-heading font-bold text-right ${r.color ?? "text-ink"}`}>{r.value}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted mt-2">Trenér teď chybí na tréninku, vede ho zástupce. Zápasy koučuje dál.</p>
              )}
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
            <ListCard title="Licenční kurz">
              <OfferRow o={licenceOffer} busy={busy} onEnroll={enroll} />
            </ListCard>
          )}

          <div className="card p-4 sm:p-5">
            <SectionLabel>Kurzy vlastností</SectionLabel>
            <p className="text-sm text-muted mb-2">
              Letos {data.season.attrUsed} z {data.season.attrMax} kurzů vlastností, {data.season.licenceUsed} z {data.season.licenceMax} licenčních.
              Vlastnost roste jen do stropu licence.
            </p>
            <div className="-mx-4 sm:-mx-5 -mb-4 sm:-mb-5 mt-3 border-t border-line">
              <RowGroup label="Základní (+3, test 8 otázek)" />
              {basic.map((o) => <OfferRow key={`${o.kind}-${o.attr}`} o={o} busy={busy} onEnroll={enroll} />)}

              {data.licence.level < 2 ? (
                <>
                  <RowGroup label="Pokročilé (+5 k vlastnostem)" />
                  <ListRow tone="warn"
                    leading={<RowIcon>🔒</RowIcon>}
                    title="Pokročilé kurzy (+5 k vlastnostem)"
                    detail="Odemknou se po získání licence UEFA B (5 specializovaných kurzů)"
                    trailing={
                      <button type="button" onClick={() => setShowLockedAdvanced((v) => !v)}
                        className="text-xs font-heading font-bold text-amber-900 px-3 py-1.5 rounded-lg bg-amber-100/80 hover:bg-amber-100 transition-colors cursor-pointer">
                        {showLockedAdvanced ? "Skrýt" : "Náhled kurzů"}
                      </button>
                    } />
                  {showLockedAdvanced && (
                    <div className="opacity-80">
                      {advanced.map((o) => <OfferRow key={`${o.kind}-${o.attr}`} o={o} busy={busy} onEnroll={enroll} />)}
                    </div>
                  )}
                </>
              ) : (
                <>
                  <RowGroup label="Pokročilé (+5, od UEFA B, test 10 otázek)" />
                  {advanced.map((o) => <OfferRow key={`${o.kind}-${o.attr}`} o={o} busy={busy} onEnroll={enroll} />)}
                </>
              )}
            </div>
          </div>
        </>
      )}

      {/* ═══ Absolvované ═══ */}
      <ListCard title="Absolvované kurzy" count={data.completed.length || undefined}>
        {data.completed.length === 0 && <ListEmpty icon="🎓">Zatím žádný. Trenérská škola čeká.</ListEmpty>}
        {data.completed.map((c) => (
          <ListRow key={c.id}
            leading={<RowIcon>{c.status === "passed" ? "✅" : "❌"}</RowIcon>}
            title={c.title}
            meta={`${c.status === "passed" ? "Úspěšně" : "Propadl"}${c.score !== null ? ` · nejlepší test ${c.score} z ${c.total}` : ""}`}
            trailing={isOwn ? (
              <Link href={`/trener/skripta?kurz=${c.id}`} className="text-meta font-bold text-pitch-600 hover:underline min-h-11 flex items-center px-2">
                Skripta
              </Link>
            ) : undefined} />
        ))}
      </ListCard>
      {dialog}
    </div>
  );
}

function OfferRow({ o, busy, onEnroll }: { o: Offer; busy: boolean; onEnroll: (o: Offer) => void }) {
  const isLicence = o.kind === "licence";
  const title = isLicence ? o.title : (o.title.split(": ")[1] ?? o.title);
  return (
    <ListRow
      title={
        <span className="inline-flex items-center gap-2 flex-wrap">
          {title}
          {o.points > 0 && (
            <span className="text-xs font-heading font-bold px-2 py-0.5 rounded-full bg-pitch-50 text-pitch-700 border border-pitch-200">
              +{o.points}
            </span>
          )}
        </span>
      }
      meta={`${o.topic} (${lessonsLabel(o.lessons)})`}
      detail={<>
        {!isLicence && o.current !== null && (
          <span className="flex items-center gap-2 flex-wrap">
            <span>Aktuálně <strong className="tabular-nums text-ink">{o.current}</strong></span>
            {o.points > 0 && (
              <>
                <span>→</span>
                <span>po kurzu <strong className="tabular-nums text-pitch-600 font-extrabold">{o.current + o.points}</strong></span>
              </>
            )}
            {o.cap && <span className="text-muted">· strop licence {o.cap}</span>}
          </span>
        )}
        <span className="flex items-center gap-1.5 mt-1.5 flex-wrap text-xs">
          <span className="inline-flex items-center gap-1 font-semibold px-2 py-0.5 rounded bg-surface border border-gray-100 tabular-nums text-ink">💰 {czk(o.price)}</span>
          <span className="inline-flex items-center gap-1 font-semibold px-2 py-0.5 rounded bg-surface border border-gray-100 tabular-nums text-ink">⏱️ {days(o.days)}</span>
          <span className="inline-flex items-center gap-1 font-semibold px-2 py-0.5 rounded bg-surface border border-gray-100 tabular-nums text-ink">📝 test {o.exam.questions} ot. / {o.exam.timeLimitMin} min</span>
        </span>
        {!o.available && o.blockers.length > 0 && (
          <span className="text-xs text-amber-900 bg-amber-50 border border-amber-200/80 rounded-md px-2.5 py-1 mt-2 inline-flex items-center gap-1.5 font-medium">
            <span>🔒</span> {o.blockers[0]}
          </span>
        )}
        <span className="block mt-2">
          <button type="button" disabled={!o.available || busy} onClick={() => onEnroll(o)}
            className="btn btn-primary btn-sm disabled:opacity-40 disabled:cursor-not-allowed">
            Přihlásit se
          </button>
        </span>
      </>} />
  );
}
