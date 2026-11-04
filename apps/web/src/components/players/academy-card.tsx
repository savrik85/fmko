"use client";

/**
 * Mládež → Akademie: družstvo mladších a starších žáků (11–14 let) z vlastní obce.
 *
 * Klub žáky buď má, nebo ne. Mít je stojí hlavně trenéra (dobrovolník z áčka, táta jednoho
 * z kluků, nebo placený trenér mládeže, kterého jde najmout rovnou tady) a dost kluků
 * (9 na okresní soutěž). Rychlost růstu zvedá i klubové vybavení (míče, pomůcky, zimní
 * výbava, dodávka). Každé léto postoupí čtrnáctiletí do dorostu (U21).
 * Návrh: docs/youth-academy-redesign-2026-11-04.md.
 */

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { apiFetch, apiAction } from "@/lib/api";
import { FaceAvatar } from "@/components/players/face-avatar";
import { Tabs, useTabParam } from "@/components/ui";

const TAB_KEYS = ["prehled", "kluci", "novi", "trener", "vybaveni"] as const;

type CoachType = "volunteer" | "parent" | "staff";

interface Prospect {
  id: string;
  name: string;
  age: number;
  position: string;
  positionSure: boolean;
  coachSon: boolean;
  avatar: Record<string, unknown> | null;
  traits: string[];
  strengths: string[];
  weakness: string | null;
  potential: { estimate: number; low: number; high: number } | null;
  verdict: string | null;
  mood: string;
  canPlayUp: boolean;
  offered: boolean;
  promising: boolean;
}

interface AcademyData {
  founded: boolean;
  village: string;
  expectedPerYear: number;
  weeklyCost: number;
  level: "modest" | "standard" | "ambitious";
  levels: { key: "modest" | "standard" | "ambitious"; label: string; text: string; base: number; perKid: number; weekly: number }[];
  upkeepBase: number;
  upkeepPerKid: number;
  minSquad: number;
  playsCompetition: boolean;
  hasU21: boolean;
  coach: { type: CoachType | null; name: string | null; quality: string; playerId: string | null; weeklyWage: number };
  coachOptions: {
    volunteers: { playerId: string; name: string; age: number; leadership: string }[];
    parent: { name: string; prospectId: string; kid: string } | null;
    staff: { name: string } | null;
  } | null;
  staffMarket: { id: string; name: string; age: number; quality: string; weeklyWage: number; signingFee: number; description: string; blockedReason: string | null }[];
  equipment: { key: string; label: string; effect: string; level: number }[];
  potentialScale: { from: number; label: string }[];
  nextSummer: number;
  prospects: Prospect[];
  recruitDay: { available: boolean; used: boolean; cost: number; expected: number };
  neighbors: { name: string; km: number; expected: number }[];
  neighborMax: number;
  poach: {
    remaining: number;
    bootsCost: number;
    feeYounger: number;
    feeOlder: number;
    targets: {
      prospectId: string; name: string; age: number; club: string; position: string; km: number;
      strengths: string[]; avatar: Record<string, unknown> | null; verdict: string; protected: boolean;
      interest: string | null; done: string[];
    }[];
    incoming: { poachId: string; name: string; age: number; club: string; interest: string; defended: boolean }[];
  } | null;
}

const POSITION_CS: Record<string, string> = { GK: "brankář", DEF: "obránce", MID: "záložník", FWD: "útočník" };
const COACH_CS: Record<CoachType, string> = { volunteer: "dobrovolník z áčka", parent: "táta jednoho z kluků", staff: "trenér mládeže" };
const AGE_GROUPS = [
  { age: 14, label: "Starší žáci, 14 let", note: "v létě postoupí do dorostu sami, dát je tam můžeš i dřív" },
  { age: 13, label: "Starší žáci, 13 let", note: null },
  { age: 12, label: "Mladší žáci, 12 let", note: null },
  { age: 11, label: "Mladší žáci, 11 let", note: null },
];
const EQUIPMENT_LEVEL = ["nemáš", "základní", "dobré", "špičkové"];

const kc = (n: number) => `${n.toLocaleString("cs")} Kč`;

function choiceKey(coach: { type: CoachType | null; playerId: string | null }): string {
  if (coach.type === "volunteer") return coach.playerId ? `volunteer:${coach.playerId}` : "";
  return coach.type ?? "";
}

function boysText(n: number): string {
  if (n === 0) return "Žádní kluci";
  return n === 1 ? "1 kluk" : n < 5 ? `${n} kluci` : `${n} kluků`;
}

/** Kolik kluků čekat, ve 4. pádě („čekej asi 2 kluky“). */
function classText(expected: number): string {
  const n = Math.round(Math.min(6, expected));
  if (n === 0) return "možná jednoho kluka";
  if (n === 1) return "asi jednoho kluka";
  return n < 5 ? `asi ${n} kluky` : `asi ${n} kluků`;
}

function perYearText(expected: number): string {
  if (expected < 0.3) return "skoro žádný kluk za rok";
  if (expected < 0.8) return "kluk jednou za dva roky";
  if (expected < 1.5) return "asi jeden kluk za rok";
  const n = Math.round(expected);
  return n < 5 ? `asi ${n} kluci za rok` : `asi ${n} kluků za rok`;
}

/**
 * Pás potenciálu: stupnice „pro radost … hvězda okresu“, vybarvené rozpětí trenérova odhadu
 * a značka nejpravděpodobnější úrovně. Čísla se neukazují.
 */
const SHORT_LABELS: Record<string, string> = { "pro radost": "radost", "béčko": "béčko", "áčko": "áčko", "krajský přebor": "kraj", "hvězda okresu": "hvězda" };

function PotentialBar({ potential, scale }: { potential: NonNullable<Prospect["potential"]>; scale: AcademyData["potentialScale"] }) {
  const levelOf = (v: number) => [...scale].reverse().find((s) => v >= s.from)?.label ?? scale[0].label;
  // Stupně jsou na pásu stejně široké, odhad 0–100 se do nich přepočte po kouscích
  const pos = (v: number) => {
    const i = Math.max(0, scale.findLastIndex((s) => v >= s.from));
    const from = scale[i].from;
    const to = scale[i + 1]?.from ?? 100;
    return ((i + Math.min(1, (v - from) / Math.max(1, to - from))) / scale.length) * 100;
  };
  const label = levelOf(potential.estimate);
  const lowLabel = levelOf(potential.low);
  const highLabel = levelOf(potential.high);
  const left = pos(potential.low);
  const right = pos(potential.high);
  return (
    <div className="space-y-1" aria-label={`Potenciál: nejspíš ${label}, rozpětí od ${lowLabel} po ${highLabel}`}>
      <div className="relative h-3 rounded-full bg-gray-200 overflow-hidden">
        {scale.slice(1).map((_, i) => (
          <span key={i} className="absolute top-0 bottom-0 w-px bg-white" style={{ left: `${((i + 1) / scale.length) * 100}%` }} />
        ))}
        <span className="absolute top-0 bottom-0 rounded-full bg-pitch-500/40" style={{ left: `${left}%`, width: `${Math.max(2, right - left)}%` }} />
        <span className="absolute -top-0.5 -bottom-0.5 w-1.5 rounded-full bg-pitch-600" style={{ left: `calc(${pos(potential.estimate)}% - 3px)` }} />
      </div>
      <div className="grid text-[10px] text-muted text-center" style={{ gridTemplateColumns: `repeat(${scale.length}, minmax(0, 1fr))` }} aria-hidden="true">
        {scale.map((s) => <span key={s.from} className="truncate">{SHORT_LABELS[s.label] ?? s.label}</span>)}
      </div>
      {lowLabel !== highLabel && (
        <p className="text-xs text-muted">Trenér si zatím není jistý: od „{lowLabel}“ po „{highLabel}“.</p>
      )}
    </div>
  );
}

export function AcademyCard({ teamId }: { teamId: string }) {
  const [data, setData] = useState<AcademyData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [coachChoice, setCoachChoice] = useState<string>("");
  const [confirmClose, setConfirmClose] = useState(false);
  const [tab, setTab] = useTabParam(TAB_KEYS);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    apiFetch<AcademyData>(`/api/teams/${teamId}/academy`)
      .then((d) => { setData(d); setCoachChoice(choiceKey(d.coach)); })
      .catch((e) => { console.error("academy load:", e); setError("Akademii se nepodařilo načíst. Zkus to znovu."); })
      .finally(() => setLoading(false));
  }, [teamId]);

  useEffect(() => { load(); }, [load]);

  if (loading && !data) return <div className="card p-4 text-sm text-muted" role="status">Načítám akademii…</div>;
  // Chyba při prvním načtení schová kartu; při dalším (po akci) zůstanou poslední data a nahoře hláška
  if (error && !data) return <div className="card p-4 space-y-3" role="alert"><p className="text-sm">{error}</p><button onClick={load} className="btn btn-primary min-h-11 px-3">Zkusit znovu</button></div>;
  if (!data) return null;
  const errorBanner = error ? (
    <div className="card p-3 text-sm border-l-4 border-red-400 bg-red-50 flex flex-wrap items-center justify-between gap-2" role="alert">
      <span>{error}</span>
      <button onClick={load} className="btn btn-secondary min-h-11 px-3">Zkusit znovu</button>
    </div>
  ) : null;

  const post = async (key: string, path: string, body: unknown, failMessage: string): Promise<boolean> => {
    if (busy) return false;
    setBusy(key);
    const ok = await apiAction(
      apiFetch(path, { method: "POST", body: body === undefined ? undefined : JSON.stringify(body), headers: { "Content-Type": "application/json" } }),
      failMessage,
    );
    setBusy(null);
    setConfirmClose(false);
    if (ok) load();
    return ok;
  };

  if (!data.founded) {
    const total = data.expectedPerYear * 4;
    return (
      <section className="card p-4 sm:p-5 space-y-3">
        {errorBanner}
        <h2 className="font-heading font-bold text-base">Akademie</h2>
        <p className="text-sm text-muted">
          Klub nemá akademii, tedy družstvo žáků. Když ho založíš, přijdou hned kluci od 11 do 14 let z obce {data.village}.
          Každé léto postoupí čtrnáctiletí do dorostu a přijdou noví jedenáctiletí.
        </p>
        <p className="text-sm">
          {data.village} dá <strong className="font-heading text-ink">{perYearText(data.expectedPerYear)}</strong>.
          {total < data.minSquad
            ? ` Na okresní soutěž je potřeba ${data.minSquad} kluků, tolik jich obec sama nedá. Žáci budou jen trénovat.`
            : ` Na okresní soutěž (${data.minSquad} kluků) to stačí.`}
        </p>
        <p className="text-sm text-muted">Provoz stojí {kc(data.upkeepBase)} týdně a {kc(data.upkeepPerKid)} za každého kluka (dresy, startovné, míče, cesty na zápasy). Pak vybereš trenéra.</p>
        <button onClick={() => post("found", `/api/teams/${teamId}/academy/found`, undefined, "Akademii se nepodařilo založit")} disabled={busy !== null} className="btn btn-primary btn-md w-full sm:w-auto disabled:opacity-40">
          {busy === "found" ? "Zakládám…" : "Založit akademii"}
        </button>
      </section>
    );
  }

  const options = data.coachOptions;
  const currentChoice = choiceKey(data.coach);
  const saveCoach = () => {
    if (!coachChoice) return;
    const body = coachChoice.startsWith("volunteer:") ? { type: "volunteer", playerId: coachChoice.slice("volunteer:".length) } : { type: coachChoice };
    post("coach", `/api/teams/${teamId}/academy/coach`, body, "Trenéra žáků se nepodařilo nastavit");
  };
  // Najmout trenéra mládeže z trhu a rovnou mu dát žáky
  const hireStaff = async (staffId: string) => {
    const ok = await post(`hire:${staffId}`, `/api/teams/${teamId}/staff/${staffId}/hire`, { role: "trener_mladeze" }, "Trenéra mládeže se nepodařilo najmout");
    if (ok) await post("coach", `/api/teams/${teamId}/academy/coach`, { type: "staff" }, "Trenéra žáků se nepodařilo nastavit");
  };
  const promising = data.prospects.filter((p) => p.promising);

  return (
    <div className="space-y-4">
      {errorBanner}
      {!data.coach.type && (
        <p className="card p-4 text-sm border-l-4 border-gold-500 bg-gold-50" role="alert">Žáci nemají trenéra, takže netrénují a víc jich skončí. Vyber trenéra níž.</p>
      )}

      <Tabs
        value={tab}
        onChange={setTab}
        ariaLabel="Akademie"
        items={[
          { key: "prehled", label: "Přehled" },
          { key: "kluci", label: "Kluci" },
          { key: "novi", label: "Noví kluci", count: data.poach?.incoming.length || null },
          { key: "trener", label: "Trenér" },
          { key: "vybaveni", label: "Vybavení klubu" },
        ]}
      />
      {tab === "prehled" && (
        <>
        <section className="card p-4 sm:p-5 space-y-4">
          <div>
            <h2 className="font-heading font-bold text-base">Akademie</h2>
            <p className="text-sm text-muted mt-1">Družstvo žáků z obce {data.village}. Odtud ti každé léto přibudou vlastní kluci do dorostu.</p>
          </div>
          <dl className="grid grid-cols-2 lg:grid-cols-4 gap-2">
            <div className="rounded-soft border border-gray-200 bg-white p-3">
              <dt className="text-xs text-muted">Kluci</dt>
              <dd className="font-heading font-bold text-ink">{boysText(data.prospects.length)}</dd>
              <dd className="text-xs text-muted">{data.playsCompetition ? "hrají okresní soutěž" : `na soutěž chybí ${data.minSquad - data.prospects.length}`}</dd>
            </div>
            <div className="rounded-soft border border-gray-200 bg-white p-3">
              <dt className="text-xs text-muted">Trenér</dt>
              <dd className="font-heading font-bold text-ink">{data.coach.name ?? "Nikdo"}</dd>
              <dd className="text-xs text-muted">{data.coach.type ? COACH_CS[data.coach.type] : "bez trenéra netrénují"}</dd>
            </div>
            <div className="rounded-soft border border-gray-200 bg-white p-3">
              <dt className="text-xs text-muted">Příprava</dt>
              <dd className="font-heading font-bold text-ink">{data.coach.quality.replace(/\.$/, "")}</dd>
              <dd className="text-xs text-muted">trenér, úroveň a vybavení</dd>
            </div>
            <div className="rounded-soft border border-gray-200 bg-white p-3">
              <dt className="text-xs text-muted">Příští léto do dorostu</dt>
              <dd className="font-heading font-bold text-ink">{boysText(data.nextSummer)}</dd>
              <dd className="text-xs text-muted">{data.hasU21 ? "do tvého U21" : "do jiného klubu za odstupné"}</dd>
            </div>
          </dl>
          {promising.length > 0 && (
            <p className="text-sm"><strong className="font-heading text-ink">Nadějní podle trenéra:</strong> {promising.map((p) => `${p.name} (${p.age})`).join(", ")}</p>
          )}
          <details className="text-sm">
            <summary className="cursor-pointer font-heading font-bold text-pitch-600 min-h-11 flex items-center gap-1.5">Jak akademie funguje <span aria-hidden="true">▾</span></summary>
            <ul className="mt-1 space-y-1.5 text-muted list-disc pl-5">
              <li>Kluci jsou z tvé obce, od 11 do 14 let. Každé léto přijde nový ročník jedenáctiletých, kolik jich je, záleží na velikosti obce.</li>
              <li>Na okresní soutěž je potřeba {data.minSquad} kluků. Bez soutěže rostou pomaleji a víc jich skončí.</li>
              <li>Jak rychle kluci rostou, určuje trenér, úroveň akademie a klubové vybavení. Nejlepší je placený trenér mládeže, dobrovolník z áčka a táta jsou zadarmo.</li>
              <li>Potenciál kluka odhaduje trenér. U mladších se plete víc, u čtrnáctiletých míň, placený trenér mládeže nejmíň.</li>
              <li>Každé léto jdou čtrnáctiletí do {data.hasU21 ? "tvého dorostu (U21)" : "dorostu jiného klubu, ty dostaneš odstupné"}. {data.hasU21 ? "Nadějného kluka od 13 let ti trenér doporučí do dorostu dřív, dát ho tam můžeš i sám." : "Dřív to nejde, protože vlastní dorost nemáš."}</li>
              <li>Podle pravidel FAČR smí kluk do dorostu od 13 let, za muže (áčko) až od 15 let.</li>
              <li>Kolik do akademie dáváš, si vybereš: skromná šetří, ale kluci rostou pomaleji a víc jich skončí; ambiciózní platí soustředění a turnaje, kluci rostou rychleji a láká to i kluky odjinud.</li>
            </ul>
          </details>
        </section>
  
        <section className="card p-4 sm:p-5 space-y-3">
          <h2 className="font-heading font-bold text-base">Kolik do akademie dáváš</h2>
          <p className="text-sm text-muted">Týdenní provoz žáků: startovné, cesty na zápasy, dresy a u ambiciózní i soustředění a turnaje. Vybavení (míče, pomůcky) je zvlášť, patří celému klubu.</p>
        <ul className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {data.levels.map((l) => {
            const active = l.key === data.level;
            return (
              <li key={l.key} className="flex flex-col">
                <button
                  onClick={() => { if (!active) post(`level:${l.key}`, `/api/teams/${teamId}/academy/level`, { level: l.key }, "Úroveň akademie se nepodařilo změnit"); }}
                  disabled={busy !== null}
                  aria-pressed={active}
                  className={`w-full flex-1 text-left rounded-soft border p-3 min-h-11 transition-colors ${active ? "border-pitch-500 bg-pitch-50" : "border-gray-200 bg-white hover:border-pitch-500"}`}
                >
                  <span className="flex items-baseline justify-between gap-2">
                    <span className="font-heading font-bold text-sm text-ink">{l.label}{active ? " (teď)" : ""}</span>
                  </span>
                  <span className="block text-xs text-muted mt-1">{l.text}</span>
                </button>
                <p className="text-xs text-muted mt-1 px-1">{kc(l.base)} + {kc(l.perKid)} za kluka, teď {kc(l.weekly)} týdně</p>
              </li>
            );
          })}
        </ul>
        <p className="text-sm text-muted">
          Provoz akademie tě teď stojí <strong className="text-ink">{kc(data.weeklyCost)}</strong> týdně za {boysText(data.prospects.length).toLowerCase()}.
          {data.coach.type === "staff" && data.coach.weeklyWage > 0 ? ` K tomu trenér mládeže ${data.coach.name} bere ${kc(data.coach.weeklyWage)} týdně jako zaměstnanec, dohromady ${kc(data.weeklyCost + data.coach.weeklyWage)}.` : ""}
        </p>
          {confirmClose ? (
            <div className="flex flex-wrap gap-2">
              <button onClick={() => post("close", `/api/teams/${teamId}/academy/close`, undefined, "Akademii se nepodařilo zrušit")} disabled={busy !== null} className="btn btn-secondary min-h-11 px-3 disabled:opacity-40">
                Opravdu zrušit, kluci skončí
              </button>
              <button onClick={() => setConfirmClose(false)} className="btn btn-secondary min-h-11 px-3">Nechat</button>
            </div>
          ) : (
            <button onClick={() => setConfirmClose(true)} disabled={busy !== null} className="btn btn-secondary min-h-11 px-3 disabled:opacity-40">Zrušit akademii</button>
          )}
        </section>
        </>
      )}
      {tab === "kluci" && (
        <>
        <section className="space-y-3" aria-label="Kluci podle ročníků">
          <h2 className="font-heading font-bold text-base px-1">Kluci podle ročníků</h2>
          {data.prospects.length === 0 && <p className="card p-4 text-sm text-muted">Zatím tu nejsou žádní kluci. Noví přijdou v létě.</p>}
          {AGE_GROUPS.map((g) => {
            const kids = data.prospects.filter((p) => p.age === g.age);
            if (kids.length === 0) return null;
            const promisingCount = kids.filter((p) => p.promising).length;
            return (
              <details key={g.age} className="card overflow-hidden" open>
                <summary className="bg-surface-2 px-3 py-2.5 cursor-pointer min-h-11 flex flex-wrap items-baseline justify-between gap-x-3">
                  <span className="text-sm font-heading font-bold"><span aria-hidden="true" className="mr-1.5 text-muted">▾</span>{g.label}</span>
                  <span className="text-xs text-muted">{boysText(kids.length)}{promisingCount ? `, nadějní ${promisingCount}` : ""}{g.note ? ` · ${g.note}` : ""}</span>
                </summary>
                <ul className="grid grid-cols-1 md:grid-cols-2 bg-white">
                  {kids.map((p) => (
                    <li key={p.id} className="p-3 space-y-2 border-t border-gray-200 md:odd:border-r">
                      <div className="flex items-center gap-3">
                        {p.avatar && (
                          <div className="shrink-0 w-12 h-12 rounded-full overflow-hidden bg-surface-2 flex items-center justify-center">
                            <FaceAvatar faceConfig={p.avatar} size={40} />
                          </div>
                        )}
                        <div className="min-w-0 flex-1 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                          <span className="font-heading font-bold text-ink">
                            {p.name}
                            {p.promising && <span className="ml-2 align-middle rounded-full bg-pitch-50 px-2 py-0.5 text-xs font-bold text-pitch-600">nadějný</span>}
                          {p.coachSon && <span className="ml-2 align-middle rounded-full bg-gold-50 px-2 py-0.5 text-xs font-bold text-gold-700">syn trenéra</span>}
                          </span>
                          <span className="text-sm text-ink">{p.age} let · {p.positionSure ? POSITION_CS[p.position] ?? p.position : `nejspíš ${POSITION_CS[p.position] ?? p.position}`}</span>
                        </div>
                      </div>
                      {(p.strengths.length > 0 || p.weakness) && (
                        <div className="flex flex-wrap gap-1.5">
                          {p.strengths.map((s) => <span key={s} className="rounded-full bg-pitch-50 px-2 py-0.5 text-xs font-semibold text-pitch-600">{s}</span>)}
                          {p.weakness && <span className="rounded-full bg-red-50 px-2 py-0.5 text-xs text-red-700">slabina: {p.weakness}</span>}
                        </div>
                      )}
                      {p.verdict && <p className="text-sm text-ink">„{p.verdict}“</p>}
                      {p.potential && <PotentialBar potential={p.potential} scale={data.potentialScale} />}
                      <p className="text-xs text-muted">{p.traits.length > 0 && <>{p.traits.join(", ")} · </>}Nálada: {p.mood}</p>
                      {p.offered && <p className="text-sm text-muted">Trenér ho doporučil do dorostu, nabídku najdeš v Přestupy → Nabídky.</p>}
                      {p.canPlayUp && (
                        <button
                          onClick={() => post(p.id, `/api/teams/${teamId}/academy/prospects/${p.id}/promote`, undefined, "Kluka se nepodařilo dát do dorostu")}
                          disabled={busy !== null}
                          className="btn btn-secondary min-h-11 px-3 disabled:opacity-40"
                        >
                          {busy === p.id ? "Pracuju…" : p.age >= 14 ? "Dát do dorostu už teď" : "Dát do dorostu dřív"}
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              </details>
            );
          })}
        </section>
  
        </>
      )}
      {tab === "novi" && (
        <>
        <section className="card p-4 sm:p-5 space-y-3">
          <h2 className="font-heading font-bold text-base">Kde vzít nové kluky</h2>
          <ul className="text-sm text-muted list-disc pl-5 space-y-1">
            <li>Každé léto přijde ročník jedenáctiletých z obce {data.village}: {perYearText(data.expectedPerYear)}.</li>
            {data.neighbors.length > 0 ? (
              <li>
                Z okolních obcí, které nemají vlastní akademii, přijdou v létě ještě nejvýš {data.neighborMax} kluci.
                Nejvíc jich bývá z obcí {data.neighbors.slice(0, 3).map((n) => `${n.name} (${n.km.toLocaleString("cs")} km)`).join(", ")}.
              </li>
            ) : (
              <li>V okolí do 6 km není obec bez akademie, odkud by chodili další kluci.</li>
            )}
            <li>Nadějné kluky můžeš přetáhnout z jiných klubů, hned pod tímhle.</li>
          </ul>
          <div className="rounded-soft border border-gray-200 bg-white p-3 space-y-2">
            <p className="text-sm"><strong className="font-heading text-ink">Náborový den ve škole</strong></p>
            <p className="text-sm text-muted">
              Jednou za sezónu, stojí {kc(data.recruitDay.cost)}. Přijdou kluci 11–12 let, čekej {classText(data.recruitDay.expected)}. S lepším trenérem jich přijde víc.
            </p>
            {data.recruitDay.used ? (
              <p className="text-sm text-muted">Letos už byl, další příští sezónu.</p>
            ) : !data.coach.type ? (
              <p className="text-sm text-muted">Nábor potřebuje trenéra žáků.</p>
            ) : (
              <button onClick={() => post("recruit", `/api/teams/${teamId}/academy/recruit-day`, undefined, "Náborový den se nepodařil")} disabled={busy !== null} className="btn btn-primary min-h-11 px-3 disabled:opacity-40">
                {busy === "recruit" ? "Pořádám…" : "Uspořádat náborový den"}
              </button>
            )}
          </div>
        </section>
  
        {data.poach && data.poach.incoming.length > 0 && (
          <section className="card p-4 sm:p-5 space-y-3 border-l-4 border-gold-500">
            <h2 className="font-heading font-bold text-base">O tvé kluky se zajímají</h2>
            <ul className="space-y-2">
              {data.poach.incoming.map((y) => (
                <li key={y.poachId} className="rounded-soft border border-gray-200 bg-white p-3 space-y-2">
                  <p className="text-sm"><strong className="font-heading text-ink">{y.name}</strong> ({y.age}): láká ho {y.club}. Kluk {y.interest}.</p>
                  {y.defended ? <p className="text-sm text-muted">S rodiči jsi už mluvil.</p> : (
                    <button onClick={() => post(`defend:${y.poachId}`, `/api/teams/${teamId}/academy/poach-defense/${y.poachId}`, undefined, "Rozhovor s rodiči se nepovedl")} disabled={busy !== null} className="btn btn-secondary min-h-11 px-3 disabled:opacity-40">
                      Promluvit s rodiči
                    </button>
                  )}
                </li>
              ))}
            </ul>
            <p className="text-xs text-muted">Kdo má v létě zájem „chce k vám“, přestoupí a ty dostaneš tabulkové odstupné podle FAČR.</p>
          </section>
        )}
  
        {data.poach && (
          <section className="card p-4 sm:p-5 space-y-3">
            <h2 className="font-heading font-bold text-base">Nadějní kluci v okolí</h2>
            <p className="text-sm text-muted">
              Trenér slyšel o těchhle klucích z klubů do 15 km. Pozvi je na trénink, slib rodičům dorost a odvoz na zápasy, nebo jim dej na kopačky.
              Kdo bude mít v létě zájem, přestoupí a zaplatíš jeho klubu tabulkové odstupné podle FAČR: {kc(data.poach.feeYounger)} za mladšího žáka (11–12 let), {kc(data.poach.feeOlder)} za staršího (13–14). Za sezónu můžeš lákat ještě {data.poach.remaining} {data.poach.remaining === 1 ? "kluka" : "kluky"}.
              Kopačky stojí {kc(data.poach.bootsCost)} a když to praskne, mluví se o tom v obci.
            </p>
            {data.poach.targets.length === 0 ? <p className="text-sm text-muted">V okolí teď není nikdo nadějný.</p> : (
              <ul className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {data.poach.targets.map((t) => {
                  const started = t.interest !== null;
                  const canStart = started || data.poach!.remaining > 0;
                  const action = (a: string, label: string) => (
                    <button
                      key={a}
                      onClick={() => post(`poach:${t.prospectId}:${a}`, `/api/teams/${teamId}/academy/poach/${t.prospectId}`, { action: a }, "Lákání se nepovedlo")}
                      disabled={busy !== null || t.done.includes(a) || t.protected || !canStart}
                      className="btn btn-secondary min-h-11 px-3 text-sm disabled:opacity-40"
                    >
                      {t.done.includes(a) ? `${label} ✓` : label}
                    </button>
                  );
                  return (
                    <li key={t.prospectId} className="rounded-soft border border-gray-200 bg-white p-3 space-y-2">
                      <div className="flex items-center gap-3">
                        {t.avatar && (
                          <div className="shrink-0 w-12 h-12 rounded-full overflow-hidden bg-surface-2 flex items-center justify-center"><FaceAvatar faceConfig={t.avatar} size={40} /></div>
                        )}
                        <div className="min-w-0">
                          <p className="font-heading font-bold text-ink">{t.name}</p>
                          <p className="text-sm text-muted">{t.age} let · {POSITION_CS[t.position] ?? t.position} · {t.club}, {t.km.toLocaleString("cs")} km</p>
                        </div>
                      </div>
                      {t.strengths.length > 0 && (
                        <div className="flex flex-wrap gap-1.5">{t.strengths.map((x) => <span key={x} className="rounded-full bg-pitch-50 px-2 py-0.5 text-xs font-semibold text-pitch-600">{x}</span>)}</div>
                      )}
                      <p className="text-sm text-ink">„{t.verdict}“</p>
                      {t.protected ? <p className="text-sm text-muted">Teprve přestoupil, rok ho nech být.</p>
                        : started ? <p className="text-sm"><strong className="font-heading text-ink">Zájem:</strong> {t.interest}</p>
                        : !canStart ? <p className="text-sm text-muted">Letos už lákáš dost kluků.</p> : null}
                      {!t.protected && (
                        <div className="flex flex-wrap gap-2">
                          {action("invite", "Pozvat na trénink")}
                          {action("promise", "Slíbit dorost a odvoz")}
                          {action("boots", "Dát na kopačky")}
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        )}
  
        </>
      )}
      {tab === "trener" && (
        <>
        {options && (
          <section className="card p-4 sm:p-5 space-y-3">
            <h2 className="font-heading font-bold text-base">Trenér žáků</h2>
            <p className="text-sm text-muted">Bez trenéra žáci nejsou. Nejlíp je posune placený trenér mládeže a nejpřesněji pozná, kdo má talent. Dobrovolník z áčka a táta jsou zadarmo.</p>
            <ul className="space-y-2">
              {options.staff && (
                <li>
                  <label className="flex items-start gap-3 p-3 rounded-soft border border-gray-200 bg-white cursor-pointer min-h-11">
                    <input type="radio" name="coach" checked={coachChoice === "staff"} onChange={() => setCoachChoice("staff")} className="mt-1 h-5 w-5 accent-pitch-600" />
                    <span className="text-sm"><strong className="font-heading text-ink">{options.staff.name}</strong>, tvůj trenér mládeže{currentChoice === "staff" ? " (teď vede žáky)" : ""}
                      <span className="block text-muted">Nejlepší příprava a nejpřesnější odhad talentu.</span></span>
                  </label>
                </li>
              )}
              {options.volunteers.map((v) => (
                <li key={v.playerId}>
                  <label className="flex items-start gap-3 p-3 rounded-soft border border-gray-200 bg-white cursor-pointer min-h-11">
                    <input type="radio" name="coach" checked={coachChoice === `volunteer:${v.playerId}`} onChange={() => setCoachChoice(`volunteer:${v.playerId}`)} className="mt-1 h-5 w-5 accent-pitch-600" />
                    <span className="text-sm"><strong className="font-heading text-ink">{v.name}</strong>, hráč áčka, {v.age} let, {v.leadership}{currentChoice === `volunteer:${v.playerId}` ? " (teď vede žáky)" : ""}
                      <span className="block text-muted">Zadarmo, ale na trénink áčka bude chodit méně.</span></span>
                  </label>
                </li>
              ))}
              {options.parent && (
                <li>
                  <label className="flex items-start gap-3 p-3 rounded-soft border border-gray-200 bg-white cursor-pointer min-h-11">
                    <input type="radio" name="coach" checked={coachChoice === "parent"} onChange={() => setCoachChoice("parent")} className="mt-1 h-5 w-5 accent-pitch-600" />
                    <span className="text-sm"><strong className="font-heading text-ink">{options.parent.name}</strong>, táta jednoho z kluků ({options.parent.kid}){currentChoice === "parent" ? " (teď vede žáky)" : ""}
                      <span className="block text-muted">Zadarmo a průměrný. Až jeho kluk u žáků skončí, skončí i on.</span></span>
                  </label>
                </li>
              )}
            </ul>
            <button onClick={saveCoach} disabled={busy !== null || !coachChoice || coachChoice === currentChoice} className="btn btn-primary btn-md w-full sm:w-auto disabled:opacity-40 disabled:cursor-not-allowed">
              {busy === "coach" ? "Ukládám…" : "Uložit trenéra"}
            </button>
  
            {data.staffMarket.length > 0 && (
              <div className="pt-2 space-y-2">
                <h3 className="font-heading font-bold text-sm">Najmout placeného trenéra mládeže</h3>
                <p className="text-sm text-muted">Volní trenéři z okresu. Po najmutí rovnou povede žáky a bude pomáhat i dorostu (U21).</p>
                <ul className="space-y-2">
                  {data.staffMarket.map((m) => (
                    <li key={m.id} className="rounded-soft border border-gray-200 bg-white p-3 space-y-2">
                      <div className="flex flex-wrap items-baseline justify-between gap-2">
                        <span className="text-sm"><strong className="font-heading text-ink">{m.name}</strong>, {m.age} let, {m.quality}</span>
                        <span className="text-sm tabular-nums text-muted">{kc(m.weeklyWage)} týdně · nástup {kc(m.signingFee)}</span>
                      </div>
                      {m.description && <p className="text-xs text-muted">{m.description}</p>}
                      {m.blockedReason ? (
                        <p className="text-sm text-muted">{m.blockedReason} Licenci získáš v Profilu trenéra.</p>
                      ) : (
                        <button onClick={() => hireStaff(m.id)} disabled={busy !== null} className="btn btn-secondary min-h-11 px-3 disabled:opacity-40">
                          {busy === `hire:${m.id}` ? "Najímám…" : "Najmout"}
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </section>
        )}
  
        </>
      )}
      {tab === "vybaveni" && (
        <>
        <section className="card p-4 sm:p-5 space-y-3">
          <h2 className="font-heading font-bold text-base">Klubové vybavení, které žáci využívají</h2>
          <p className="text-sm text-muted">
            Tohle není součást akademie a týdně se za to neplatí. Je to vybavení celého klubu, které koupíš jednou ve Vybavení
            a používá ho áčko i žáci. Čím lepší, tím rychleji žáci rostou.
          </p>
          <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {data.equipment.map((e) => (
              <li key={e.key} className="rounded-soft border border-gray-200 bg-white p-3">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="font-heading font-bold text-sm text-ink">{e.label}</span>
                  <span className={`text-xs font-semibold ${e.level > 0 ? "text-pitch-600" : "text-muted"}`}>{EQUIPMENT_LEVEL[e.level] ?? EQUIPMENT_LEVEL[3]}</span>
                </div>
                <div className="mt-1.5 flex gap-1" aria-hidden="true">
                  {[1, 2, 3].map((l) => <span key={l} className={`h-1.5 flex-1 rounded-full ${e.level >= l ? "bg-pitch-500" : "bg-gray-200"}`} />)}
                </div>
                <p className="mt-1.5 text-xs text-muted">{e.effect}</p>
              </li>
            ))}
          </ul>
          <Link href="/vybaveni" className="btn btn-secondary min-h-11 px-3 inline-flex items-center">Do Vybavení</Link>
        </section>
  
        </>
      )}
    </div>
  );
}
