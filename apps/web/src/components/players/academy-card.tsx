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

type CoachType = "volunteer" | "parent" | "staff";

interface Prospect {
  id: string;
  name: string;
  age: number;
  position: string;
  positionSure: boolean;
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
  minSquad: number;
  playsCompetition: boolean;
  hasU21: boolean;
  coach: { type: CoachType | null; name: string | null; quality: string; playerId: string | null };
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
}

const POSITION_CS: Record<string, string> = { GK: "brankář", DEF: "obránce", MID: "záložník", FWD: "útočník" };
const COACH_CS: Record<CoachType, string> = { volunteer: "dobrovolník z áčka", parent: "táta jednoho z kluků", staff: "trenér mládeže" };
const AGE_GROUPS = [
  { age: 14, label: "Starší žáci, 14 let", note: "v létě postoupí do dorostu" },
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
      <p className="text-xs text-ink">
        Nejspíš <strong className="font-heading">{label}</strong>
        {lowLabel !== highLabel ? <span className="text-muted">, může to být od „{lowLabel}“ po „{highLabel}“</span> : null}
      </p>
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
  if (error) return <div className="card p-4 space-y-3" role="alert"><p className="text-sm">{error}</p><button onClick={load} className="btn btn-primary min-h-11 px-3">Zkusit znovu</button></div>;
  if (!data) return null;

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
        <p className="text-sm text-muted">Provoz stojí {kc(data.weeklyCost)} týdně (dresy, míče, startovné, cesty). Pak vybereš trenéra.</p>
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
            <dd className="text-xs text-muted">trenér a vybavení</dd>
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
            <li>Jak rychle kluci rostou, určuje trenér a vybavení. Nejlepší je placený trenér mládeže, dobrovolník z áčka a táta jsou zadarmo.</li>
            <li>Potenciál kluka odhaduje trenér. U mladších se plete víc, u čtrnáctiletých míň, placený trenér mládeže nejmíň.</li>
            <li>Každé léto jdou čtrnáctiletí do {data.hasU21 ? "tvého dorostu (U21)" : "dorostu jiného klubu, ty dostaneš odstupné"}. {data.hasU21 ? "Nadějného kluka od 13 let ti trenér doporučí do dorostu dřív, dát ho tam můžeš i sám." : "Dřív to nejde, protože vlastní dorost nemáš."}</li>
            <li>Podle pravidel FAČR smí kluk do dorostu od 13 let, za muže (áčko) až od 15 let.</li>
            <li>Provoz stojí {kc(data.weeklyCost)} týdně.</li>
          </ul>
        </details>
      </section>

      {!data.coach.type && (
        <p className="card p-4 text-sm border-l-4 border-gold-500 bg-gold-50" role="alert">Žáci nemají trenéra, takže netrénují a víc jich skončí. Vyber trenéra níž.</p>
      )}

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
                        </span>
                        <span className="text-sm text-ink">{p.age} let · {p.positionSure ? POSITION_CS[p.position] ?? p.position : `nejspíš ${POSITION_CS[p.position] ?? p.position}`}</span>
                      </div>
                    </div>
                    {(p.strengths.length > 0 || p.weakness) && (
                      <div className="flex flex-wrap gap-1.5">
                        {p.strengths.map((s) => <span key={s} className="rounded-full bg-pitch-50 px-2 py-0.5 text-xs font-semibold text-pitch-600">{s}</span>)}
                        {p.weakness && <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-muted">{p.weakness}</span>}
                      </div>
                    )}
                    {p.potential && <PotentialBar potential={p.potential} scale={data.potentialScale} />}
                    {p.verdict && <p className="text-sm text-ink">„{p.verdict}“</p>}
                    <p className="text-xs text-muted">{p.traits.join(", ")}{p.traits.length ? " · " : ""}{p.mood}</p>
                    {p.offered && <p className="text-sm text-muted">Trenér ho doporučil do dorostu, nabídku najdeš v Přestupy → Nabídky.</p>}
                    {p.canPlayUp && (
                      <button
                        onClick={() => post(p.id, `/api/teams/${teamId}/academy/prospects/${p.id}/promote`, undefined, "Kluka se nepodařilo dát do dorostu")}
                        disabled={busy !== null}
                        className="btn btn-secondary min-h-11 px-3 disabled:opacity-40"
                      >
                        {busy === p.id ? "Pracuju…" : "Dát do dorostu hned"}
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            </details>
          );
        })}
      </section>

      {options && (
        <section className="card p-4 sm:p-5 space-y-3">
          <h2 className="font-heading font-bold text-base">Trenér žáků</h2>
          <p className="text-sm text-muted">Bez trenéra žáci nejsou. Nejlíp je posune placený trenér mládeže a nejpřesněji pozná, kdo má talent. Dobrovolník z áčka a táta jsou zadarmo.</p>
          <ul className="space-y-2">
            {options.staff && (
              <li>
                <label className="flex items-start gap-3 p-3 rounded-soft border border-gray-200 bg-white cursor-pointer min-h-11">
                  <input type="radio" name="coach" checked={coachChoice === "staff"} onChange={() => setCoachChoice("staff")} className="mt-1 h-5 w-5 accent-pitch-600" />
                  <span className="text-sm"><strong className="font-heading text-ink">{options.staff.name}</strong>, tvůj trenér mládeže
                    <span className="block text-muted">Nejlepší příprava a nejpřesnější odhad talentu.</span></span>
                </label>
              </li>
            )}
            {options.volunteers.map((v) => (
              <li key={v.playerId}>
                <label className="flex items-start gap-3 p-3 rounded-soft border border-gray-200 bg-white cursor-pointer min-h-11">
                  <input type="radio" name="coach" checked={coachChoice === `volunteer:${v.playerId}`} onChange={() => setCoachChoice(`volunteer:${v.playerId}`)} className="mt-1 h-5 w-5 accent-pitch-600" />
                  <span className="text-sm"><strong className="font-heading text-ink">{v.name}</strong>, hráč áčka, {v.age} let, {v.leadership}
                    <span className="block text-muted">Zadarmo, ale na trénink áčka bude chodit méně.</span></span>
                </label>
              </li>
            ))}
            {options.parent && (
              <li>
                <label className="flex items-start gap-3 p-3 rounded-soft border border-gray-200 bg-white cursor-pointer min-h-11">
                  <input type="radio" name="coach" checked={coachChoice === "parent"} onChange={() => setCoachChoice("parent")} className="mt-1 h-5 w-5 accent-pitch-600" />
                  <span className="text-sm"><strong className="font-heading text-ink">{options.parent.name}</strong>, táta jednoho z kluků ({options.parent.kid})
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

      <section className="card p-4 sm:p-5 space-y-3">
        <h2 className="font-heading font-bold text-base">Vybavení pro žáky</h2>
        <p className="text-sm text-muted">Žáci používají klubové vybavení. Čím lepší, tím rychleji rostou. Kupuje se ve Vybavení.</p>
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

      <section className="card p-4 sm:p-5 space-y-2">
        <p className="text-sm text-muted">Provoz akademie tě stojí {kc(data.weeklyCost)} týdně.</p>
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
    </div>
  );
}
