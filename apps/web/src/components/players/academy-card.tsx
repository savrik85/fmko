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

const TAB_KEYS = ["prehled", "zaci", "novi", "trener", "vybaveni"] as const;

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
  /** Den, od kterého ho jde dát do dorostu (4 týdny u žáků), null = už jde. */
  playUpFrom?: string | null;
  /** Týdenní plat v dorostu (jen u žáka, kterého jde dát do dorostu). */
  graduateWage: number | null;
  offered: boolean;
  promising: boolean;
}

interface AcademyData {
  founded: boolean;
  canFound: boolean;
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
    volunteers: { playerId: string; name: string; age: number; leadership: string; rating: number; role: string }[];
    parent: { name: string; prospectId: string; kid: string } | null;
    staff: { name: string } | null;
  } | null;
  staffMarket: { id: string; name: string; age: number; quality: string; weeklyWage: number; signingFee: number; description: string; blockedReason: string | null }[];
  equipment: { key: string; label: string; effect: string; level: number }[];
  potentialScale: { from: number; label: string }[];
  nextSummer: number;
  prospects: Prospect[];
  recruitDay: { available: boolean; used: boolean; repeatable: boolean; nextOn: string | null; cost: number; expected: number; byCoach: CoachCompare };
  openDay: { available: boolean; used: boolean; cost: number; expected: number; byCoach: CoachCompare };
  neighbors: { name: string; km: number; expected: number }[];
  neighborPerYear: number;
  budgetWarning: { budget: number; seasonCost: number; weeks: number } | null;
  neighborMax: number;
  poach: {
    remaining: number;
    bootsCost: number;
    promise: { u21: boolean; van: boolean };
    feeYounger: number;
    feeOlder: number;
    targets: {
      prospectId: string; name: string; age: number; club: string; position: string; km: number;
      strengths: string[]; avatar: Record<string, unknown> | null; verdict: string; protected: boolean;
      interest: string | null; done: string[]; crowded: boolean;
    }[];
    incoming: { poachId: string; name: string; age: number; club: string; interest: string; defended: boolean }[];
  } | null;
}

const POSITION_CS: Record<string, string> = { GK: "brankář", DEF: "obránce", MID: "záložník", FWD: "útočník" };
const COACH_CS: Record<CoachType, string> = { volunteer: "hráč áčka", parent: "táta jednoho ze žáků", staff: "trenér mládeže" };
const AGE_GROUPS = [
  { age: 14, label: "Starší žáci, 14 let", note: "v létě odcházejí do dorostu" },
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

/** Kolik dětí v průměru přivede akce s jednotlivými trenéry (null = takového trenéra klub nemá). */
type CoachCompare = { staff: number | null; volunteer: number | null; parent: number | null };

/** „Kolik dětí podle trenéra: táta 2,9 · hráč áčka 2,2 · trenér mládeže 1,9“, současný trenér označený. */
function CoachCompareLine({ compare, current }: { compare: CoachCompare; current: CoachType | null }) {
  const items = ([["parent", "táta"], ["volunteer", "hráč áčka"], ["staff", "trenér mládeže"]] as const)
    .filter(([k]) => compare[k] !== null)
    .map(([k, label]) => `${label} ${compare[k]!.toLocaleString("cs", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}${current === k ? " (teď)" : ""}`);
  if (items.length < 2) return null;
  return <p className="text-xs text-muted">Kolik žáků v průměru přijde podle trenéra: {items.join(" · ")}.</p>;
}

/** Co se při lákání stalo, za jménem žáka (výsledek u jeho karty). */
const POACH_DONE: Record<string, string> = {
  invite: "byl u vás na tréninku",
  promise: "a jeho rodiče slyšeli, co jim slibuješ",
  boots: "a jeho rodiče dostali peníze na kopačky",
};

function boysText(n: number): string {
  if (n === 0) return "Žádní žáci";
  return n === 1 ? "1 žák" : n < 5 ? `${n} žáci` : `${n} žáků`;
}

/** „za 1 žáka“, „za 3 žáky“, „za 5 žáků“ (4. pád). */
function boysAcc(n: number): string {
  if (n === 0) return "žádného žáka";
  return n === 1 ? "1 žáka" : n < 5 ? `${n} žáky` : `${n} žáků`;
}

/** „přišel 1 žák“, „přišli 3 žáci“, „přišlo 5 žáků“, „nikdo nepřišel“. */
function arrivedText(n: number): string {
  if (n === 0) return "nikdo nepřišel";
  return n === 1 ? "přišel 1 žák" : n < 5 ? `přišli ${n} žáci` : `přišlo ${n} žáků`;
}

/** Kolik žáků za rok, v 1. pádě („přijdou asi 2 žáci“). */
function classNom(expected: number): string {
  const n = Math.round(Math.min(6, expected));
  if (n <= 1) return n === 0 ? "možná jeden žák" : "asi jeden žák";
  return n < 5 ? `asi ${n} žáci` : `asi ${n} žáků`;
}

/** Kolik kluků čekat, ve 4. pádě („čekej asi 2 kluky“). */
function classText(expected: number): string {
  const n = Math.round(Math.min(6, expected));
  if (n === 0) return "možná jednoho žáka";
  if (n === 1) return "asi jednoho žáka";
  return n < 5 ? `asi ${n} žáky` : `asi ${n} žáků`;
}

function perYearText(expected: number): string {
  if (expected < 0.3) return "skoro žádný žák za rok";
  if (expected < 0.8) return "žák jednou za dva roky";
  if (expected < 1.5) return "asi jeden žák za rok";
  const n = Math.round(expected);
  return n < 5 ? `asi ${n} žáci za rok` : `asi ${n} žáků za rok`;
}

/**
 * Pás potenciálu: stupnice „pro radost … hvězda okresu“, vybarvené rozpětí trenérova odhadu
 * a značka nejpravděpodobnější úrovně. Čísla se neukazují.
 */
const SHORT_LABELS: Record<string, string> = { "pro radost": "radost", "lavička áčka": "lavička", "áčko": "áčko", "krajský přebor": "kraj", "hvězda okresu": "hvězda" };

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
        <p className="text-xs text-muted">Trenér si zatím není jistý, odhaduje {lowLabel} až {highLabel}.</p>
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
  // Výsledek poslední akce u jejího tlačítka (jako půjčka ve Financích): místo, kam patří, a text
  const [notice, setNotice] = useState<{ slot: string; text: string } | null>(null);
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
  // Výsledek akce přímo u jejího tlačítka, stejný rámeček jako u půjčky ve Financích
  const resultBox = (slot: string) => notice?.slot === slot
    ? <div className="bg-green-50 border border-green-200 rounded-soft p-3 text-sm text-pitch-600" role="status">{notice.text}</div>
    : null;

  /**
   * Akce na API. `success` je potvrzení, které se po úspěchu ukáže nahoře (text, nebo funkce
   * z odpovědi API), ať hráč ví, co se stalo.
   */
  /** Kam u stránky patří výsledek akce: k tlačítku, které ji spustilo. */
  const slotOf = (key: string): string => {
    if (key === "found") return "overview";
    if (key === "close") return "start";
    if (key === "coach" || key.startsWith("hire:")) return "coach";
    if (key.startsWith("level:")) return "level";
    if (key === "recruit" || key === "openday") return key;
    if (key.startsWith("defend:")) return `incoming:${key.slice("defend:".length)}`;
    if (key.startsWith("poach:")) return `target:${key.split(":")[1]}`;
    return "students";
  };
  const post = async (
    key: string, path: string, body: unknown, failMessage: string,
    success?: string | ((res: Record<string, unknown>) => string),
  ): Promise<boolean> => {
    if (busy) return false;
    setBusy(key);
    const request = apiFetch<Record<string, unknown>>(path, { method: "POST", body: body === undefined ? undefined : JSON.stringify(body), headers: { "Content-Type": "application/json" } });
    const ok = await apiAction(request, failMessage);
    setBusy(null);
    setConfirmClose(false);
    if (ok) {
      if (success) {
        const res = await request.catch((e) => { console.error("academy action result:", e); return {} as Record<string, unknown>; });
        setNotice({ slot: slotOf(key), text: typeof success === "function" ? success(res) : success });
      }
      load();
    }
    return ok;
  };

  const budgetBanner = data.budgetWarning ? (
    <div className="card p-4 text-sm border-l-4 border-gold-500 bg-gold-50" role="alert">
      {data.founded
        ? `Na účtu je ${kc(data.budgetWarning.budget)}, sezóna akademie stojí ${kc(data.budgetWarning.seasonCost)}. Bez dalších příjmů peníze ${data.budgetWarning.weeks === 0 ? "nevystačí ani na týden" : data.budgetWarning.weeks === 1 ? "vystačí na 1 týden" : data.budgetWarning.weeks < 5 ? `vystačí na ${data.budgetWarning.weeks} týdny` : `vystačí na ${data.budgetWarning.weeks} týdnů`}, pak by klub šel do mínusu.${data.level !== "modest" ? " Zvaž skromnější úroveň." : data.coach.type === "staff" ? " Ušetřit jde, když žáky povede dobrovolník z áčka místo placeného trenéra." : ""}`
        : `Na účtu je ${kc(data.budgetWarning.budget)}, běžná akademie by za sezónu stála zhruba ${kc(data.budgetWarning.seasonCost)}. S tímhle rozpočtem by klub šel do mínusu.`}
    </div>
  ) : null;

  if (!data.founded) {
    const perYear = data.expectedPerYear + data.neighborPerYear;
    const total = perYear * 4;
    return (
      <section className="card p-4 sm:p-5 space-y-3">
        {errorBanner}
        <h2 className="font-heading font-bold text-base">Akademie</h2>
        {resultBox("start")}
        <p className="text-sm text-muted">
          Klub nemá akademii, tedy družstvo žáků. Když ji založíš, přijdou hned žáci od 11 do 14 let z obce {data.village}.
          Každé léto postoupí čtrnáctiletí do dorostu a přijdou noví jedenáctiletí.
        </p>
        <p className="text-sm">
          {data.village} dá <strong className="font-heading text-ink">{data.expectedPerYear < 0.8 ? "žáka jednou za dva roky" : `${classText(data.expectedPerYear)} za rok`}</strong>
          {data.neighborPerYear >= 0.3 ? <>, z okolních obcí bez akademie přijdou ještě <strong className="font-heading text-ink">{data.neighborPerYear < 0.8 ? "jeden žák za dva roky" : `${classNom(data.neighborPerYear)} za rok`}</strong> ({data.neighbors.slice(0, 3).map((n) => n.name).join(", ")})</> : null}.
          {total < data.minSquad
            ? ` Družstvo hraje okresní soutěž žáků od ${data.minSquad} žáků, tolik jich obec s okolím sama nedá. Doplníš je náborem ve škole, ten jde pod ${data.minSquad} žáky opakovat jednou za týden. Bez soutěže žáci jen trénují: rostou poloviční rychlostí a víc jich odejde.`
            : ` To stačí na okresní soutěž žáků (od ${data.minSquad} žáků): žáci díky zápasům rostou naplno a méně jich skončí. Zápasy žáků se ve hře neukazují.`}
        </p>
        <p className="text-sm text-muted">
          Akademie se platí každý týden podle počtu žáků. Kolik do ní dáváš, vybereš po založení: skromná od {kc(data.levels[0].base)} + {kc(data.levels[0].perKid)} za žáka, běžná {kc(data.levels[1].base)} + {kc(data.levels[1].perKid)}, ambiciózní {kc(data.levels[2].base)} + {kc(data.levels[2].perKid)}.
          {Math.round(total) <= 1 ? "S jedním žákem" : `S ${Math.round(total)} žáky`} vyjde běžná zhruba na {kc(data.levels[1].base + data.levels[1].perKid * Math.max(1, Math.round(total)))} týdně. Pak vybereš trenéra.
        </p>
        {budgetBanner}
        {data.canFound ? (
          <button onClick={() => post("found", `/api/teams/${teamId}/academy/found`, undefined, "Akademii se nepodařilo založit", (r) => `Akademie založena, ${arrivedText(Number(r.created ?? 0))}. Teď vyber trenéra.`)} disabled={busy !== null} className="btn btn-primary btn-md w-full sm:w-auto disabled:opacity-40">
          {busy === "found" ? "Zakládám…" : "Založit akademii"}
        </button>
        ) : (
          <p className="text-sm text-muted">Akademii jsi letos zrušil. Znovu ji založíš až příští sezónu.</p>
        )}
      </section>
    );
  }

  const options = data.coachOptions;
  const currentChoice = choiceKey(data.coach);
  const saveCoach = () => {
    if (!coachChoice) return;
    const body = coachChoice.startsWith("volunteer:") ? { type: "volunteer", playerId: coachChoice.slice("volunteer:".length) } : { type: coachChoice };
    post("coach", `/api/teams/${teamId}/academy/coach`, body, "Trenéra žáků se nepodařilo nastavit", "Trenér uložen, od teď vede žáky.");
  };
  // Najmout trenéra mládeže z trhu a rovnou mu dát žáky
  const hireStaff = async (staffId: string) => {
    const ok = await post(`hire:${staffId}`, `/api/teams/${teamId}/staff/${staffId}/hire`, { role: "trener_mladeze" }, "Trenéra mládeže se nepodařilo najmout");
    if (ok) await post("coach", `/api/teams/${teamId}/academy/coach`, { type: "staff" }, "Trenéra žáků se nepodařilo nastavit", "Trenér mládeže najat a vede žáky. Plat se strhává s ostatními zaměstnanci.");
  };
  const promising = data.prospects.filter((p) => p.promising);

  return (
    <div className="space-y-4">
      {errorBanner}
      {budgetBanner}
      {!data.coach.type && (
        <div className="card p-4 text-sm border-l-4 border-gold-500 bg-gold-50 flex flex-wrap items-center justify-between gap-2" role="alert">
          <span>Žáci nemají trenéra, takže netrénují a víc jich skončí.</span>
          {tab !== "trener" && <button onClick={() => setTab("trener")} className="btn btn-secondary min-h-11 px-3">Vybrat trenéra</button>}
        </div>
      )}

      <Tabs
        value={tab}
        onChange={setTab}
        ariaLabel="Akademie"
        items={[
          { key: "prehled", label: "Přehled" },
          { key: "zaci", label: "Žáci" },
          { key: "novi", label: "Noví žáci", count: data.poach?.incoming.length || null },
          { key: "trener", label: "Trenér" },
          { key: "vybaveni", label: "Vybavení" },
        ]}
      />
      {tab === "prehled" && (
        <>
        <section className="card p-4 sm:p-5 space-y-4">
          <div>
            <h2 className="font-heading font-bold text-base">Akademie</h2>
            {resultBox("overview")}
            <p className="text-sm text-muted mt-1">Družstvo žáků z obce {data.village}. {data.hasU21 ? "Odtud ti každé léto přibudou vlastní hráči do dorostu." : "Klub nemá dorost (U21), čtrnáctileté proto trenér nabídne nejbližšímu klubu s dorostem."}</p>
          </div>
          <dl className="grid grid-cols-2 lg:grid-cols-4 gap-2">
            <div className="rounded-soft border border-gray-200 bg-white p-3">
              <dt className="text-xs text-muted">Žáci</dt>
              <dd className="font-heading font-bold text-ink">{boysText(data.prospects.length)}</dd>
              <dd className="text-xs text-muted">{data.playsCompetition ? "hrají okresní soutěž žáků" : `na soutěž chybí ${data.minSquad - data.prospects.length}, jen trénují`}</dd>
            </div>
            <div className="rounded-soft border border-gray-200 bg-white p-3">
              <dt className="text-xs text-muted">Trenér</dt>
              <dd className="font-heading font-bold text-ink">{data.coach.name ?? "Nikdo"}</dd>
              <dd className="text-xs text-muted">{data.coach.type === "staff" ? "trenér mládeže, dorostu dává jen půlku času" : data.coach.type ? COACH_CS[data.coach.type] : "bez trenéra netrénují"}</dd>
            </div>
            <div className="rounded-soft border border-gray-200 bg-white p-3">
              <dt className="text-xs text-muted">Příprava</dt>
              <dd className="font-heading font-bold text-ink">{data.coach.quality.replace(/\.$/, "")}</dd>
              <dd className="text-xs text-muted">trenér, úroveň a vybavení</dd>
            </div>
            <div className="rounded-soft border border-gray-200 bg-white p-3">
              <dt className="text-xs text-muted">Příští léto do dorostu</dt>
              <dd className="font-heading font-bold text-ink">{boysText(data.nextSummer)}</dd>
              <dd className="text-xs text-muted">{data.hasU21 ? "do tvého U21" : "nabídne je klubu s dorostem"}</dd>
            </div>
          </dl>
          {promising.length > 0 && (
            <p className="text-sm"><strong className="font-heading text-ink">Nadějní podle trenéra:</strong> {promising.map((p) => `${p.name} (${p.age})`).join(", ")}</p>
          )}
          <details className="text-sm">
            <summary className="cursor-pointer font-heading font-bold text-pitch-600 min-h-11 flex items-center gap-1.5">Jak akademie funguje <span aria-hidden="true">▾</span></summary>
            <ul className="mt-1 space-y-1.5 text-muted list-disc pl-5">
              <li>Žáci jsou z tvé obce, od 11 do 14 let. Každé léto přijde nový ročník jedenáctiletých, kolik jich je, záleží na velikosti obce.</li>
              <li>Od {data.minSquad} žáků hraje družstvo okresní soutěž žáků (zápasy se ve hře neukazují). Žáci díky zápasům rostou naplno a méně jich skončí. S menším počtem jen trénují: rostou poloviční rychlostí a víc jich odejde.</li>
              <li>Jak rychle žáci rostou, určuje trenér, úroveň akademie a klubové vybavení. Dobrý placený trenér mládeže žáky naučí nejvíc, ale ubere čas dorostu (U21). Hráč áčka a táta jsou zadarmo, každý má jinou výhodu i nevýhodu, víc v záložce Trenér.</li>
              <li>Potenciál žáka odhaduje trenér. U mladších se plete víc, u čtrnáctiletých míň, placený trenér mládeže nejmíň.</li>
              <li>Každé léto jdou čtrnáctiletí do {data.hasU21 ? "tvého dorostu (U21)" : "dorostu: klub ho nemá, trenér je nabídne nejbližšímu klubu s dorostem. Když je vezme, dostaneš tabulkové odstupné, když ne, žák skončí"}. {data.hasU21 ? "Nadějného žáka od 13 let ti trenér doporučí do dorostu dřív, dát ho tam můžeš i sám." : "Dřív to nejde, protože vlastní dorost nemáš."}</li>
              <li>Podle pravidel FAČR smí žák do dorostu od 13 let, za muže (áčko) až od 15 let.</li>
              <li>Kolik do akademie dáváš, si vybereš: skromná šetří, ale žáci rostou pomaleji a víc jich skončí; ambiciózní platí soustředění a turnaje, žáci rostou rychleji a láká to i žáky odjinud.</li>
            </ul>
          </details>
        </section>
  
        <section className="card p-4 sm:p-5 space-y-3">
          <h2 className="font-heading font-bold text-base">Kolik do akademie dáváš</h2>
          <p className="text-sm text-muted">Týdenní provoz žáků: startovné, cesty na zápasy, dresy a u ambiciózní i soustředění a turnaje. Vybavení (míče, pomůcky) je zvlášť, patří celému klubu.</p>
          <p className="text-sm text-muted">Růst žáků se mění hned od příštího týdne. Kolik jich v létě skončí, kolik přijde z okolních obcí a jak moc láká cizí žáky, se počítá podle toho, kolik týdnů sezóny která úroveň trvala.</p>
        <ul className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {data.levels.map((l) => {
            const active = l.key === data.level;
            return (
              <li key={l.key} className="flex flex-col">
                <button
                  onClick={() => { if (!active) post(`level:${l.key}`, `/api/teams/${teamId}/academy/level`, { level: l.key }, "Úroveň akademie se nepodařilo změnit", `Akademie je teď ${l.label.toLowerCase()}, platí od příští týdenní uzávěrky. Na odchody a nové žáky v létě má vliv podle toho, kolik týdnů sezóny trvala.`); }}
                  disabled={busy !== null}
                  aria-pressed={active}
                  className={`w-full flex-1 text-left rounded-soft border p-3 min-h-11 transition-colors ${active ? "border-pitch-500 bg-pitch-50" : "border-gray-200 bg-white hover:border-pitch-500"}`}
                >
                  <span className="flex items-baseline justify-between gap-2">
                    <span className="font-heading font-bold text-sm text-ink">{l.label}{active ? " (teď)" : ""}</span>
                  </span>
                  <span className="block text-xs text-muted mt-1">{l.text}</span>
                </button>
                <p className="text-xs text-muted mt-1 px-1">{kc(l.base)} + {kc(l.perKid)} za žáka, teď {kc(l.weekly)} týdně</p>
              </li>
            );
          })}
        </ul>
        {resultBox("level")}
        <p className="text-sm text-muted">
          Provoz akademie tě teď stojí <strong className="text-ink">{kc(data.weeklyCost)}</strong> týdně za {boysAcc(data.prospects.length)}.
          {data.coach.type === "staff" && data.coach.weeklyWage > 0 ? ` K tomu trenér mládeže ${data.coach.name} bere ${kc(data.coach.weeklyWage)} týdně jako zaměstnanec, dohromady ${kc(data.weeklyCost + data.coach.weeklyWage)}.` : ""}
        </p>
          {confirmClose ? (
            <div className="flex flex-wrap gap-2">
              <button onClick={() => post("close", `/api/teams/${teamId}/academy/close`, undefined, "Akademii se nepodařilo zrušit", "Akademie zrušena, žáci skončili. Znovu ji jde založit až příští sezónu.")} disabled={busy !== null} className="btn btn-secondary min-h-11 px-3 disabled:opacity-40">
                Opravdu zrušit, žáci skončí
              </button>
              <button onClick={() => setConfirmClose(false)} className="btn btn-secondary min-h-11 px-3">Nechat</button>
            </div>
          ) : (
            <button onClick={() => setConfirmClose(true)} disabled={busy !== null} className="btn btn-secondary min-h-11 px-3 disabled:opacity-40">Zrušit akademii</button>
          )}
        </section>
        </>
      )}
      {tab === "zaci" && (
        <>
        <section className="space-y-3" aria-label="Žáci podle ročníků">
          <h2 className="font-heading font-bold text-base px-1">Žáci podle ročníků</h2>
          {resultBox("students")}
          <p className="text-sm text-muted px-1">
            {data.hasU21
              ? "Žáka od 13 let můžeš dát do dorostu dřív: začne trénovat se staršími a hrát dorosteneckou ligu, ale přestane mu růst strop, který mu akademie každý týden přidává. Čtrnáctiletí jdou do dorostu v létě sami. Postup do dorostu stojí registraci 500 Kč a v dorostu žák bere malý plat."
              : "Klub nemá dorost (U21): čtrnáctileté v létě trenér nabídne nejbližšímu klubu s dorostem. Když je vezme, dostaneš tabulkové odstupné, když ne, žák skončí."}
          </p>
          {data.prospects.length === 0 && <p className="card p-4 text-sm text-muted">Zatím tu nejsou žádní žáci. Noví přijdou v létě, nebo je přivede nábor v záložce Noví žáci.</p>}
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
                      {p.canPlayUp && p.graduateWage !== null && (
                        <p className="text-xs text-muted">V dorostu by bral zhruba {kc(p.graduateWage)} týdně.</p>
                      )}
                      {p.canPlayUp && p.playUpFrom && (
                        <p className="text-xs text-muted">U žáků musí být aspoň 4 týdny, do dorostu ho můžeš dát od {new Date(`${p.playUpFrom}T12:00:00Z`).toLocaleDateString("cs", { day: "numeric", month: "numeric" })}.</p>
                      )}
                      {p.canPlayUp && !p.playUpFrom && (
                        <button
                          onClick={() => post(p.id, `/api/teams/${teamId}/academy/prospects/${p.id}/promote`, undefined, "Žáka se nepodařilo dát do dorostu", `${p.name} je teď v dorostu, najdeš ho v U21.`)}
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
          <h2 className="font-heading font-bold text-base">Kde vzít nové žáky</h2>
          <ul className="text-sm text-muted list-disc pl-5 space-y-1">
            <li>Každé léto přijde ročník jedenáctiletých z obce {data.village}: {perYearText(data.expectedPerYear)}.</li>
            {data.neighbors.length > 0 ? (
              <li>
                Z okolních obcí, které nemají vlastní akademii, přijdou v létě ještě nejvýš {data.neighborMax} žáci.
                Nejvíc jich bývá z obcí {data.neighbors.slice(0, 3).map((n) => `${n.name} (${n.km.toLocaleString("cs")} km)`).join(", ")}.
              </li>
            ) : (
              <li>V okolí do 6 km není obec bez akademie, odkud by chodili další žáci.</li>
            )}
            <li>Šikovné žáky můžeš přetáhnout z jiných klubů, níž na této záložce.</li>
          </ul>
          <div className="rounded-soft border border-gray-200 bg-white p-3 space-y-2">
            <p className="text-sm"><strong className="font-heading text-ink">Náborový den ve škole</strong></p>
            <p className="text-sm text-muted">
              {data.recruitDay.repeatable
                ? `Dokud nemáš ${data.minSquad} žáků na soutěž, jde nábor opakovat jednou za týden. Pak jednou za sezónu.`
                : "Jednou za sezónu."} Stojí {kc(data.recruitDay.cost)}. Přijdou žáci 11–12 let, čekej {classText(data.recruitDay.expected)}. Víc dětí přivede hráč áčka (děti k němu vzhlížejí) a táta (zná rodiče, přivede žáka navíc).
            </p>
            <CoachCompareLine compare={data.recruitDay.byCoach} current={data.coach.type} />
            {resultBox("recruit")}
            {data.recruitDay.used ? (
              <p className="text-sm text-muted">
                {data.recruitDay.repeatable && data.recruitDay.nextOn
                  ? `Další nábor jde od ${new Date(`${data.recruitDay.nextOn}T12:00:00Z`).toLocaleDateString("cs", { day: "numeric", month: "numeric" })}`
                  : "Letos už byl, další příští sezónu."} Kdo přišel, ti trenér napsal v SMS, nové žáky najdeš v záložce Žáci.
              </p>
            ) : !data.coach.type ? (
              <p className="text-sm text-muted">Nábor potřebuje trenéra žáků.</p>
            ) : (
              <button onClick={() => post("recruit", `/api/teams/${teamId}/academy/recruit-day`, undefined, "Náborový den se nepodařil", (r) => {
                const names = Array.isArray(r.names) ? (r.names as string[]) : [];
                const again = data.recruitDay.repeatable ? "Zkusit to jde znovu za týden." : "Další příští sezónu.";
                return names.length ? `Náborový den se povedl, přišli: ${names.join(", ")}.` : `Na náborový den přišlo pár dětí, ale nikdo se nepřihlásil. ${again}`;
              })} disabled={busy !== null} className="btn btn-primary min-h-11 px-3 disabled:opacity-40">
                {busy === "recruit" ? "Pořádám…" : "Uspořádat náborový den"}
              </button>
            )}
          </div>
          <div className="rounded-soft border border-gray-200 bg-white p-3 space-y-2">
            <p className="text-sm"><strong className="font-heading text-ink">Den otevřených dveří na hřišti</strong></p>
            <p className="text-sm text-muted">
              Jednou za sezónu, nezávisle na náboru ve škole, stojí {kc(data.openDay.cost)} (občerstvení, míče a dresy na vyzkoušení).
              Čekej {classText(data.openDay.expected)}, děti přijdou i z okolních obcí a je jim 11 až 14 let.
              Chodí ty, které fotbal opravdu chtějí, takže tolik nekončí. A trenér je vidí hrát, takže jejich talent odhadne přesněji.
            </p>
            <CoachCompareLine compare={data.openDay.byCoach} current={data.coach.type} />
            {resultBox("openday")}
            {data.openDay.used ? (
              <p className="text-sm text-muted">Letos už byl, další příští sezónu.</p>
            ) : !data.coach.type ? (
              <p className="text-sm text-muted">Den otevřených dveří potřebuje trenéra žáků.</p>
            ) : (
              <button onClick={() => post("openday", `/api/teams/${teamId}/academy/open-day`, undefined, "Den otevřených dveří se nepodařil", (r) => {
                const names = Array.isArray(r.names) ? (r.names as string[]) : [];
                return names.length ? `Den otevřených dveří se povedl, přihlásili se: ${names.join(", ")}.` : "Na den otevřených dveří se nikdo nepřihlásil. Další příští sezónu.";
              })} disabled={busy !== null} className="btn btn-primary min-h-11 px-3 disabled:opacity-40">
                {busy === "openday" ? "Pořádám…" : "Uspořádat den otevřených dveří"}
              </button>
            )}
          </div>
        </section>
  
        {data.poach && data.poach.incoming.length > 0 && (
          <section className="card p-4 sm:p-5 space-y-3 border-l-4 border-gold-500">
            <h2 className="font-heading font-bold text-base">O tvé žáky se zajímají</h2>
            <ul className="space-y-2">
              {data.poach.incoming.map((y) => (
                <li key={y.poachId} className="rounded-soft border border-gray-200 bg-white p-3 space-y-2">
                  <p className="text-sm"><strong className="font-heading text-ink">{y.name}</strong> ({y.age}): láká ho {y.club}.{notice?.slot === `incoming:${y.poachId}` ? "" : ` Žák ${y.interest}.`}</p>
                  {resultBox(`incoming:${y.poachId}`)}
                  {y.defended ? <p className="text-sm text-muted">S rodiči jsi už mluvil.</p> : (
                    <button onClick={() => post(`defend:${y.poachId}`, `/api/teams/${teamId}/academy/poach-defense/${y.poachId}`, undefined, "Rozhovor s rodiči se nepovedl", (r) => `Mluvil jsi s rodiči. ${y.name} teď ${String(r.interest ?? "")}.`)} disabled={busy !== null} className="btn btn-secondary min-h-11 px-3 disabled:opacity-40">
                      Promluvit s rodiči
                    </button>
                  )}
                </li>
              ))}
            </ul>
            <p className="text-xs text-muted">Žák přestoupí v létě jen do jednoho klubu, toho, kam ho to táhne nejvíc („chce k nim, v létě přestoupí“), a ty dostaneš tabulkové odstupné podle FAČR. Promluvit s rodiči může zájem snížit.</p>
          </section>
        )}
  
        {data.poach && (
          <section className="card p-4 sm:p-5 space-y-3">
            <h2 className="font-heading font-bold text-base">Šikovní žáci v okolí</h2>
            <p className="text-sm text-muted">
              {data.coach.type ? "Trenér slyšel o těchhle žácích z klubů do 15 km." : "Bez trenéra o žácích v okolí nic nevíš. Vyber trenéra v záložce Trenér."}
              {data.coach.type && <> Pozvi je na trénink, slib rodičům dorost a odvoz na zápasy, nebo jim dej na kopačky.
              V létě žák přestoupí jen k jednomu klubu, tam, kam ho to táhne nejvíc, a ty zaplatíš jeho klubu tabulkové odstupné podle FAČR: {kc(data.poach.feeYounger)} za mladšího žáka (11–12 let), {kc(data.poach.feeOlder)} za staršího (13–14). {data.poach.remaining > 0 ? `Za sezónu můžeš lákat ještě ${boysAcc(data.poach.remaining)}.` : "Letos už další žáky lákat nemůžeš."}
              Kopačky stojí {kc(data.poach.bootsCost)} a když se to provalí, jeho klub se to dozví.</>}
            </p>
            {!data.coach.type ? null : data.poach.targets.length === 0 ? <p className="text-sm text-muted">V okolí teď nikdo šikovný není.</p> : (
              <ul className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {data.poach.targets.map((t) => {
                  const started = t.interest !== null;
                  const canStart = started || (data.poach!.remaining > 0 && !t.crowded);
                  const action = (a: string, label: string) => (
                    <button
                      key={a}
                      onClick={() => post(`poach:${t.prospectId}:${a}`, `/api/teams/${teamId}/academy/poach/${t.prospectId}`, { action: a }, "Lákání se nepovedlo", (r) => `${t.name} ${POACH_DONE[a] ?? ""}. Teď ${String(r.interest ?? "")}.`)}
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
                      {t.age >= 14 && (
                        <p className="text-xs text-muted">
                          {data.hasU21 ? "Ve 14 už u vás žáky hrát nebude: když přestoupí, půjde v létě rovnou do vašeho dorostu." : "Ve 14 u vás žáky hrát nebude a dorost nemáte: když přestoupí, trenér ho v létě nabídne klubu s dorostem."}
                        </p>
                      )}
                      {t.protected ? <p className="text-sm text-muted">Teprve přestoupil, rok ho nech být.</p>
                        : started && notice?.slot !== `target:${t.prospectId}` ? <p className="text-sm"><strong className="font-heading text-ink">Zájem:</strong> {t.interest}</p>
                        : t.crowded ? <p className="text-sm text-muted">O žáka se už zajímají tři kluby, víc rodiče nechtějí.</p>
                        : !canStart ? <p className="text-sm text-muted">Letos už lákáš dost žáků.</p> : null}
                      {resultBox(`target:${t.prospectId}`)}
                      {!t.protected && (
                        <div className="flex flex-wrap gap-2">
                          {action("invite", "Pozvat na trénink")}
                          {(data.poach!.promise.u21 || data.poach!.promise.van) && action("promise", data.poach!.promise.u21 && data.poach!.promise.van ? "Slíbit dorost a odvoz" : data.poach!.promise.u21 ? "Slíbit dorost" : "Slíbit odvoz")}
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
            <p className="text-sm text-muted">Bez trenéra žáci netrénují. Každý trenér něco umí a něco stojí, vyber podle toho, co klub potřebuje víc.</p>
            <ul className="space-y-2">
              {options.staff && (
                <li>
                  <label className="flex items-start gap-3 p-3 rounded-soft border border-gray-200 bg-white cursor-pointer min-h-11">
                    <input type="radio" name="coach" checked={coachChoice === "staff"} onChange={() => setCoachChoice("staff")} className="mt-1 h-5 w-5 accent-pitch-600" />
                    <span className="text-sm"><strong className="font-heading text-ink">{options.staff.name}</strong>, tvůj trenér mládeže{currentChoice === "staff" ? " (teď vede žáky)" : ""}
                      <span className="block text-muted"><strong className="text-pitch-600">+</strong> Dobrý trenér mládeže žáky posune nejvíc a nejpřesněji pozná talent.</span>
                      <span className="block text-muted"><strong className="text-red-700">−</strong> Nemá čas na obojí: dorost (U21) a mladí v áčku dostanou jen polovinu jeho bonusu k růstu.</span></span>
                  </label>
                </li>
              )}
              {options.volunteers.length > 0 && (
              <li className="rounded-soft border border-gray-200 bg-white p-3 space-y-2">
                <p className="text-sm"><strong className="font-heading text-ink">Hráč áčka</strong> (od 28 let)</p>
                <p className="text-sm text-muted"><strong className="text-pitch-600">+</strong> Žáci k němu vzhlížejí: méně jich skončí a na nábor i z okolí přijde víc dětí. Zadarmo.</p>
                <p className="text-sm text-muted"><strong className="text-red-700">−</strong> Sám chodí méně na trénink áčka. Když vezmeš oporu, áčko to pozná.</p>
                <ul className="space-y-1">
                  {options.volunteers.map((v) => (
                    <li key={v.playerId}>
                      <label className="flex items-center gap-3 rounded-soft px-2 py-1.5 cursor-pointer min-h-11 hover:bg-surface-2">
                        <input type="radio" name="coach" checked={coachChoice === `volunteer:${v.playerId}`} onChange={() => setCoachChoice(`volunteer:${v.playerId}`)} className="h-5 w-5 accent-pitch-600" />
                        <span className="text-sm">
                          <strong className="font-heading text-ink">{v.name}</strong>, {v.age} let, hodnocení {v.rating}, {v.role}, {v.leadership}
                          {currentChoice === `volunteer:${v.playerId}` ? " (teď vede žáky)" : ""}
                        </span>
                      </label>
                    </li>
                  ))}
                </ul>
              </li>
            )}
              {options.parent && (
                <li>
                  <label className="flex items-start gap-3 p-3 rounded-soft border border-gray-200 bg-white cursor-pointer min-h-11">
                    <input type="radio" name="coach" checked={coachChoice === "parent"} onChange={() => setCoachChoice("parent")} className="mt-1 h-5 w-5 accent-pitch-600" />
                    <span className="text-sm"><strong className="font-heading text-ink">{options.parent.name}</strong>, táta jednoho ze žáků ({options.parent.kid}){currentChoice === "parent" ? " (teď vede žáky)" : ""}
                      <span className="block text-muted"><strong className="text-pitch-600">+</strong> Zadarmo a bez vedlejších účinků. Zná rodiče, náborový den přivede žáka navíc.</span>
                      <span className="block text-muted"><strong className="text-red-700">−</strong> Průměrná příprava. Až jeho syn u žáků skončí, skončí i on.</span></span>
                  </label>
                </li>
              )}
            </ul>
            {resultBox("coach")}
            <button onClick={saveCoach} disabled={busy !== null || !coachChoice || coachChoice === currentChoice} className="btn btn-primary btn-md w-full sm:w-auto disabled:opacity-40 disabled:cursor-not-allowed">
              {busy === "coach" ? "Ukládám…" : "Uložit trenéra"}
            </button>
  
            {data.staffMarket.length > 0 && !data.coachOptions?.staff && (
              <div className="pt-2 space-y-2">
                <h3 className="font-heading font-bold text-sm">Najmout placeného trenéra mládeže</h3>
                <p className="text-sm text-muted">Volní trenéři z okresu. Po najmutí rovnou povede žáky. Když vede žáky, na dorost (U21) a mladé v áčku mu zbyde jen polovina času.</p>
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
            a používá ho áčko i žáci. Míče, pomůcky a zimní výbava zrychlí růst žáků, dodávka sníží odchody.
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
