"use client";

/**
 * Mládež → Akademie: družstvo mladších a starších žáků (11–14 let) z vlastní obce.
 *
 * Klub žáky buď má, nebo ne. Mít je stojí hlavně trenéra (dobrovolník z áčka, táta jednoho
 * z kluků, nebo placený trenér mládeže) a dost kluků (9 na okresní soutěž), málo peněz.
 * Každé léto postoupí čtrnáctiletí do dorostu (U21), nadějné kluky od 13 let trenér doporučí
 * o kategorii výš už během sezóny. Návrh: docs/youth-academy-redesign-2026-11-04.md.
 */

import { useState, useEffect, useCallback } from "react";
import { apiFetch, apiAction } from "@/lib/api";

type CoachType = "volunteer" | "parent" | "staff";

interface Prospect {
  id: string;
  name: string;
  age: number;
  position: string | null;
  traits: string[];
  verdict: string | null;
  mood: string;
  canPlayUp: boolean;
  offered: boolean;
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
  nextSummer: number;
  prospects: Prospect[];
}

const POSITION_CS: Record<string, string> = { GK: "brankář", DEF: "obránce", MID: "záložník", FWD: "útočník" };
const COACH_CS: Record<CoachType, string> = { volunteer: "dobrovolník z áčka", parent: "táta jednoho z kluků", staff: "trenér mládeže" };
const AGE_GROUPS = [
  { age: 14, label: "Starší žáci, 14 let", note: "V létě postoupí do dorostu." },
  { age: 13, label: "Starší žáci, 13 let", note: null },
  { age: 12, label: "Mladší žáci, 12 let", note: null },
  { age: 11, label: "Mladší žáci, 11 let", note: null },
];

const kc = (n: number) => `${n.toLocaleString("cs")} Kč`;

/** Klíč volby trenéra v přepínači: `staff`, `parent`, nebo `volunteer:<id hráče>`. */
function choiceKey(coach: { type: CoachType | null; playerId: string | null }): string {
  if (coach.type === "volunteer") return coach.playerId ? `volunteer:${coach.playerId}` : "";
  return coach.type ?? "";
}

function boysText(n: number): string {
  if (n === 0) return "Žádní kluci";
  return n === 1 ? "1 kluk" : n < 5 ? `${n} kluci` : `${n} kluků`;
}

/** Kolik kluků obec dá na ročník, slovy. */
function perYearText(expected: number): string {
  if (expected < 0.3) return "skoro žádný kluk za rok";
  if (expected < 0.8) return "kluk jednou za dva roky";
  if (expected < 1.5) return "asi jeden kluk za rok";
  const n = Math.round(expected);
  return n < 5 ? `asi ${n} kluci za rok` : `asi ${n} kluků za rok`;
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
      .then((d) => {
        setData(d);
        setCoachChoice(choiceKey(d.coach));
      })
      .catch((e) => { console.error("academy load:", e); setError("Žáky se nepodařilo načíst. Zkus to znovu."); })
      .finally(() => setLoading(false));
  }, [teamId]);

  useEffect(() => { load(); }, [load]);

  if (loading && !data) return <div className="card p-4 text-sm text-muted" role="status">Načítám žáky…</div>;
  if (error) return <div className="card p-4 space-y-3" role="alert"><p className="text-sm">{error}</p><button onClick={load} className="btn btn-primary min-h-11 px-3">Zkusit znovu</button></div>;
  if (!data) return null;

  const post = async (key: string, path: string, body: unknown, failMessage: string) => {
    if (busy) return;
    setBusy(key);
    const ok = await apiAction(
      apiFetch(path, { method: "POST", body: body === undefined ? undefined : JSON.stringify(body), headers: { "Content-Type": "application/json" } }),
      failMessage,
    );
    setBusy(null);
    setConfirmClose(false);
    if (ok) load();
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
        <button onClick={() => post("found", `/api/teams/${teamId}/academy/found`, undefined, "Žáky se nepodařilo založit")} disabled={busy !== null} className="btn btn-primary btn-md w-full sm:w-auto disabled:opacity-40">
          {busy === "found" ? "Zakládám…" : "Založit žáky"}
        </button>
      </section>
    );
  }

  const options = data.coachOptions;
  const saveCoach = () => {
    if (!coachChoice) return;
    const body = coachChoice.startsWith("volunteer:") ? { type: "volunteer", playerId: coachChoice.slice("volunteer:".length) } : { type: coachChoice };
    post("coach", `/api/teams/${teamId}/academy/coach`, body, "Trenéra žáků se nepodařilo nastavit");
  };
  const currentChoice = choiceKey(data.coach);

  return (
    <div className="space-y-4">
      <section className="card p-4 sm:p-5 space-y-3">
        <div>
          <h2 className="font-heading font-bold text-base">Akademie</h2>
          <p className="text-sm text-muted mt-1">
            Kluci od 11 do 14 let z obce {data.village}. Každé léto postoupí čtrnáctiletí do {data.hasU21 ? "dorostu" : "dorostu jiného klubu, protože vlastní dorost nemáš (za každého dostaneš odstupné)"}.
            Nadějné kluky od 13 let ti trenér doporučí o kategorii výš už během sezóny.
          </p>
        </div>
        <p className="text-sm">
          <strong className="font-heading text-ink">{boysText(data.prospects.length)}</strong>
          {" · "}{data.playsCompetition ? "hrají okresní soutěž" : `na okresní soutěž chybí ${data.minSquad - data.prospects.length}, jen trénují`}
          {" · "}{data.coach.quality}
        </p>
        <p className="text-sm text-muted">
          Trenér: {data.coach.name ? <><strong className="text-ink font-heading">{data.coach.name}</strong> ({COACH_CS[data.coach.type!]})</> : "nikdo"}.
          {data.nextSummer > 0 && ` Příští léto postoupí ${boysText(data.nextSummer).toLowerCase()}.`}
        </p>
      </section>

      {!data.coach.type && (
        <p className="card p-4 text-sm border-l-4 border-gold-500 bg-gold-50" role="alert">
          Žáci nemají trenéra, takže netrénují a víc jich skončí. Vyber trenéra níž.
        </p>
      )}

      <section className="space-y-3" aria-label="Kluci podle ročníků">
        {data.prospects.length === 0 && <p className="card p-4 text-sm text-muted">Zatím tu nejsou žádní kluci. Noví přijdou v létě.</p>}
        {AGE_GROUPS.map((g) => {
          const kids = data.prospects.filter((p) => p.age === g.age);
          if (kids.length === 0) return null;
          return (
            <div key={g.age} className="card overflow-hidden">
              <div className="bg-surface-2 px-3 py-2">
                <h3 className="text-sm font-heading font-bold">{g.label}</h3>
                {g.note && <p className="text-xs text-muted">{g.note}</p>}
              </div>
              <ul className="divide-y divide-gray-200">
                {kids.map((p) => (
                  <li key={p.id} className="p-3 space-y-1.5">
                    <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                      <span className="font-heading font-bold text-ink">{p.name}</span>
                      <span className="text-sm text-muted">{p.position ? POSITION_CS[p.position] ?? p.position : "hraje všude"} · {p.mood}</span>
                    </div>
                    {p.traits.length > 0 && <p className="text-sm text-muted">{p.traits.join(", ")}</p>}
                    {p.verdict && <p className="text-sm text-ink">„{p.verdict}“</p>}
                    {p.offered && <p className="text-sm text-muted">Trenér ho doporučil do dorostu, nabídku najdeš v Přestupy → Nabídky.</p>}
                    {p.canPlayUp && (
                      <button
                        onClick={() => post(p.id, `/api/teams/${teamId}/academy/prospects/${p.id}/promote`, undefined, "Kluka se nepodařilo dát do dorostu")}
                        disabled={busy !== null}
                        className="btn btn-secondary min-h-11 px-3 disabled:opacity-40"
                      >
                        {busy === p.id ? "Pracuju…" : data.hasU21 ? "Dát do dorostu hned" : "Dát do áčka hned"}
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </section>

      {options && (
        <section className="card p-4 sm:p-5 space-y-3">
          <h2 className="font-heading font-bold text-base">Trenér žáků</h2>
          <p className="text-sm text-muted">Bez trenéra žáci nejsou. Nejlepší je placený trenér mládeže, dobrovolník a táta jsou zadarmo.</p>
          <ul className="space-y-2">
            {options.staff && (
              <li>
                <label className="flex items-start gap-3 p-3 rounded-soft border border-gray-200 bg-white cursor-pointer min-h-11">
                  <input type="radio" name="coach" checked={coachChoice === "staff"} onChange={() => setCoachChoice("staff")} className="mt-1 h-5 w-5 accent-pitch-600" />
                  <span className="text-sm"><strong className="font-heading text-ink">{options.staff.name}</strong>, trenér mládeže
                    <span className="block text-muted">Nejlepší příprava a nejlíp pozná, kdo má talent. Bere plat jako zaměstnanec.</span></span>
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
                  <span className="text-sm"><strong className="font-heading text-ink">{options.parent.name}</strong>, táta kluka {options.parent.kid}
                    <span className="block text-muted">Zadarmo a průměrný. Až jeho kluk u žáků skončí, skončí i on.</span></span>
                </label>
              </li>
            )}
          </ul>
          {!options.staff && <p className="text-sm text-muted">Trenéra mládeže najmeš v Klub → Zaměstnanci.</p>}
          <button
            onClick={saveCoach}
            disabled={busy !== null || !coachChoice || coachChoice === currentChoice}
            className="btn btn-primary btn-md w-full sm:w-auto disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {busy === "coach" ? "Ukládám…" : "Uložit trenéra"}
          </button>
        </section>
      )}

      <section className="card p-4 sm:p-5 space-y-2">
        <p className="text-sm text-muted">Provoz žáků tě stojí {kc(data.weeklyCost)} týdně.</p>
        {confirmClose ? (
          <div className="flex flex-wrap gap-2">
            <button onClick={() => post("close", `/api/teams/${teamId}/academy/close`, undefined, "Žáky se nepodařilo zrušit")} disabled={busy !== null} className="btn btn-secondary min-h-11 px-3 disabled:opacity-40">
              Opravdu zrušit, kluci skončí
            </button>
            <button onClick={() => setConfirmClose(false)} className="btn btn-secondary min-h-11 px-3">Nechat</button>
          </div>
        ) : (
          <button onClick={() => setConfirmClose(true)} disabled={busy !== null} className="btn btn-secondary min-h-11 px-3 disabled:opacity-40">Zrušit žáky</button>
        )}
      </section>
    </div>
  );
}
