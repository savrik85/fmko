"use client";

/**
 * Žáci: vlastní kluci klubu (12–15 let), zázemí, za které se platí, a obce pro letní nábor.
 *
 * Od patnácti trenér mládeže kluky průběžně nabízí do dorostu (SMS a Přestupy → Nabídky).
 * Manažer může kohokoli od patnácti vytáhnout sám, nebo ho pustit. Návrh:
 * docs/youth-academy-redesign-2026-11-04.md. Ceny jsou v textu, ne v tlačítkách.
 */

import { useState, useEffect, useCallback } from "react";
import { apiFetch, apiAction } from "@/lib/api";

interface Program { upkeep: boolean; hall: boolean; bus: boolean }

interface Village {
  id: string;
  name: string;
  population: number;
  km: number;
  competitors: number;
  expectedKids: number;
  own: boolean;
  selected: boolean;
}

interface Prospect {
  id: string;
  name: string;
  age: number;
  position: string | null;
  village: string | null;
  traits: string[];
  verdict: string;
  readiness: string;
  mood: string;
  canPromote: boolean;
  offered: boolean;
}

interface AcademyData {
  program: Program;
  costs: { upkeep: number; hall: number; bus: number; recruitFee: number };
  weeklyCost: number;
  trainer: { hired: boolean };
  quality: string;
  smallSquad: boolean;
  hasU21: boolean;
  maxRecruitVillages: number;
  radiusKm: number;
  villages: Village[];
  prospects: Prospect[];
}

const POSITION_CS: Record<string, string> = { GK: "brankář", DEF: "obránce", MID: "záložník", FWD: "útočník" };

const kc = (n: number) => `${n.toLocaleString("cs")} Kč`;

/** Kolik kluků obec za rok dá, slovy. */
function kidsText(expected: number): string {
  if (expected < 0.15) return "skoro nikdo";
  if (expected < 0.6) return "občas nějaký kluk";
  if (expected < 1.5) return "asi jeden kluk za rok";
  if (expected < 2.5) return "asi dva kluci za rok";
  return "tři kluci za rok";
}

function boysText(n: number): string {
  if (n === 0) return "Žádní kluci";
  return n === 1 ? "1 kluk" : n < 5 ? `${n} kluci` : `${n} kluků`;
}

/** Kolik kluků čekat z celého náboru, ve 4. pádě („čekej asi 3 kluky“). */
function classText(expected: number): string {
  const n = Math.round(Math.min(6, expected));
  if (n === 0) return "skoro nikoho";
  if (n === 1) return "asi jednoho kluka";
  return n < 5 ? `asi ${n} kluky` : `asi ${n} kluků`;
}

const PROGRAM_ITEMS: { key: keyof Program; label: string; text: string }[] = [
  { key: "upkeep", label: "Provoz žáků", text: "Dresy, míče, startovné v okresní soutěži. Bez něj žáci nefungují, nikdo nové nenabírá a kluci na konci sezóny skončí." },
  { key: "hall", label: "Hala na zimu", text: "Kluci trénují i v zimě a rostou rychleji." },
  { key: "bus", label: "Autobus na zápasy", text: "Kluci z okolních obcí s ním méně často končí." },
];

export function AcademyCard({ teamId }: { teamId: string }) {
  const [data, setData] = useState<AcademyData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [program, setProgram] = useState<Program | null>(null);
  const [recruit, setRecruit] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [confirmRelease, setConfirmRelease] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    apiFetch<AcademyData>(`/api/teams/${teamId}/academy`)
      .then((d) => {
        setData(d);
        setProgram(d.program);
        setRecruit(new Set(d.villages.filter((v) => v.selected && !v.own).map((v) => v.id)));
      })
      .catch((e) => { console.error("academy load:", e); setError("Žáky se nepodařilo načíst. Zkus to znovu."); })
      .finally(() => setLoading(false));
  }, [teamId]);

  useEffect(() => { load(); }, [load]);

  if (loading && !data) return <div className="card p-4 text-sm text-muted" role="status">Načítám žáky…</div>;
  if (error) return <div className="card p-4 space-y-3" role="alert"><p className="text-sm">{error}</p><button onClick={load} className="btn btn-primary min-h-11 px-3">Zkusit znovu</button></div>;
  if (!data || !program) return null;

  const savedRecruit = new Set(data.villages.filter((v) => v.selected && !v.own).map((v) => v.id));
  const programChanged = (Object.keys(program) as (keyof Program)[]).some((k) => program[k] !== data.program[k]);
  const recruitChanged = recruit.size !== savedRecruit.size || [...recruit].some((id) => !savedRecruit.has(id));
  const changed = programChanged || recruitChanged;
  const newWeekly = program.upkeep ? data.costs.upkeep + (program.hall ? data.costs.hall : 0) + (program.bus ? data.costs.bus : 0) : 0;
  const ownVillage = data.villages.find((v) => v.own);
  const others = data.villages.filter((v) => !v.own);
  const expectedClass = (ownVillage?.expectedKids ?? 0) + others.filter((v) => recruit.has(v.id)).reduce((s, v) => s + v.expectedKids, 0);

  const toggleProgram = (key: keyof Program) => {
    setProgram((p) => {
      if (!p) return p;
      const next = { ...p, [key]: !p[key] };
      // Hala nebo autobus bez provozu nedávají smysl: zapnutí provoz zapne, vypnutí provozu je vypne
      if (key !== "upkeep" && next[key]) next.upkeep = true;
      if (!next.upkeep) { next.hall = false; next.bus = false; }
      return next;
    });
  };

  const toggleVillage = (id: string) => {
    setRecruit((r) => {
      const next = new Set(r);
      if (next.has(id)) next.delete(id);
      else if (next.size < data.maxRecruitVillages) next.add(id);
      return next;
    });
  };

  const save = async () => {
    if (!changed || saving) return;
    setSaving(true);
    let ok = true;
    if (programChanged) {
      ok = await apiAction(
        apiFetch(`/api/teams/${teamId}/academy/program`, { method: "POST", body: JSON.stringify(program), headers: { "Content-Type": "application/json" } }),
        "Zázemí žáků se nepodařilo uložit",
      );
    }
    if (ok && recruitChanged) {
      ok = await apiAction(
        apiFetch(`/api/teams/${teamId}/academy/recruitment`, { method: "POST", body: JSON.stringify({ villageIds: [...recruit] }), headers: { "Content-Type": "application/json" } }),
        "Obce pro nábor se nepodařilo uložit",
      );
    }
    setSaving(false);
    if (ok) {
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
      load();
    }
  };

  const act = async (prospectId: string, action: "promote" | "release") => {
    if (busy) return;
    setBusy(prospectId);
    const ok = await apiAction(
      apiFetch(`/api/teams/${teamId}/academy/prospects/${prospectId}/${action}`, { method: "POST" }),
      action === "promote" ? "Kluka se nepodařilo vzít do dorostu" : "Kluka se nepodařilo pustit",
    );
    setBusy(null);
    setConfirmRelease(null);
    if (ok) load();
  };

  const ages = [15, 14, 13, 12].map((age) => ({ age, kids: data.prospects.filter((p) => (age === 15 ? p.age >= 15 : p.age === age)) }));

  return (
    <div className="space-y-4">
      <section className="card p-4 sm:p-5 space-y-3">
        <div>
          <h2 className="font-heading font-bold text-base">Žáci</h2>
          <p className="text-sm text-muted mt-1">
            Vlastní kluci klubu od 12 do 15 let. Od patnácti ti je trenér mládeže průběžně nabízí do dorostu,
            nebo si kohokoli vytáhneš sám. Koho do konce sezóny, kdy mu je 16, nevezmeš, odejde.
          </p>
        </div>
        <p className="text-sm">
          <strong className="font-heading text-ink">{boysText(data.prospects.length)}</strong>
          {" · "}{data.quality}
          {!data.trainer.hired && program.upkeep && " Bez trenéra mládeže to jde pomaleji, najmeš ho v Klub → Zaměstnanci."}
        </p>
        {data.smallSquad && program.upkeep && (
          <p className="text-sm border-l-4 border-gold-500 bg-gold-50 p-3 rounded-soft">
            Méně než 9 kluků, žáci nemůžou hrát okresní soutěž a rostou pomaleji. Nabírej i v okolních obcích.
          </p>
        )}
        {!data.hasU21 && (
          <p className="text-sm border-l-4 border-gold-500 bg-gold-50 p-3 rounded-soft">
            Klub nemá dorost (U21), kluci z žáků půjdou rovnou do áčka.
          </p>
        )}
      </section>

      <section className="space-y-3" aria-label="Kluci podle ročníků">
        {data.prospects.length === 0 && (
          <p className="card p-4 text-sm text-muted">
            {program.upkeep ? "Zatím tu nejsou žádní kluci. Noví přijdou z letního náboru, občas se někdo přihlásí sám." : "Žáky nemáš. Zapni provoz a vyber obce pro nábor, kluci přijdou v létě."}
          </p>
        )}
        {ages.filter((g) => g.kids.length > 0).map((g) => (
          <div key={g.age} className="card overflow-hidden">
            <h3 className="bg-surface-2 px-3 py-2 text-sm font-heading font-bold">{g.age === 15 ? "15 a 16 let" : `${g.age} let`}</h3>
            <ul className="divide-y divide-gray-200">
              {g.kids.map((p) => (
                <li key={p.id} className="p-3 space-y-2">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                    <span className="font-heading font-bold text-ink">{p.name}</span>
                    <span className="text-sm text-muted">
                      {p.age} let · {p.position ? POSITION_CS[p.position] ?? p.position : "hraje všude"}{p.village ? ` · ${p.village}` : ""}
                    </span>
                  </div>
                  {p.traits.length > 0 && <p className="text-sm text-muted">{p.traits.join(", ")}</p>}
                  <p className="text-sm text-ink">„{p.verdict}“</p>
                  <p className="text-sm text-muted">{p.readiness} Nálada: {p.mood}.{p.offered ? " Trenér ti ho nabídl, najdeš ho v Přestupy → Nabídky." : ""}</p>
                  <div className="flex flex-wrap gap-2 pt-1">
                    {p.canPromote && (
                      <button onClick={() => act(p.id, "promote")} disabled={busy !== null} className="btn btn-primary min-h-11 px-3 disabled:opacity-40">
                        {busy === p.id ? "Pracuju…" : data.hasU21 ? "Vzít do dorostu" : "Vzít do áčka"}
                      </button>
                    )}
                    {confirmRelease === p.id ? (
                      <>
                        <button onClick={() => act(p.id, "release")} disabled={busy !== null} className="btn btn-secondary min-h-11 px-3 text-red-700 disabled:opacity-40">
                          Opravdu pustit
                        </button>
                        <button onClick={() => setConfirmRelease(null)} className="btn btn-secondary min-h-11 px-3">Nechat</button>
                      </>
                    ) : (
                      <button onClick={() => setConfirmRelease(p.id)} disabled={busy !== null} className="btn btn-secondary min-h-11 px-3 disabled:opacity-40">
                        Pustit
                      </button>
                    )}
                  </div>
                  {confirmRelease === p.id && (
                    <p className="text-sm text-muted">{p.age >= 15 ? "Půjde na trh jako volný hráč, může si ho vzít kdokoli." : "Odejde domů, v klubu končí."}</p>
                  )}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </section>

      <section className="card p-4 sm:p-5 space-y-3">
        <h2 className="font-heading font-bold text-base">Zázemí</h2>
        <p className="text-sm text-muted">Platí se každý týden. Trenér mládeže se platí zvlášť jako zaměstnanec a s ním kluci rostou nejvíc.</p>
        <ul className="space-y-2">
          {PROGRAM_ITEMS.map((item) => (
            <li key={item.key}>
              <label className="flex items-start gap-3 p-3 rounded-soft border border-gray-200 bg-white cursor-pointer min-h-11">
                <input type="checkbox" checked={program[item.key]} onChange={() => toggleProgram(item.key)} className="mt-1 h-5 w-5 accent-pitch-600" />
                <span className="flex-1">
                  <span className="flex flex-wrap items-baseline justify-between gap-2">
                    <span className="font-heading font-bold text-sm text-ink">{item.label}</span>
                    <span className="text-sm tabular-nums text-muted">{kc(data.costs[item.key])} týdně</span>
                  </span>
                  <span className="block text-sm text-muted mt-0.5">{item.text}</span>
                </span>
              </label>
            </li>
          ))}
        </ul>
      </section>

      <section className="card p-4 sm:p-5 space-y-3">
        <h2 className="font-heading font-bold text-base">Letní nábor</h2>
        <p className="text-sm text-muted">
          Na konci sezóny přijdou noví dvanáctiletí. Vlastní obec je v náboru vždy, k ní můžeš přidat až {data.maxRecruitVillages} obce
          do {data.radiusKm} km, každou za {kc(data.costs.recruitFee)}. V obci s vlastním klubem se o kluky dělíš.
        </p>
        {ownVillage && (
          <p className="text-sm"><strong className="font-heading text-ink">{ownVillage.name}</strong> (vlastní obec): {kidsText(ownVillage.expectedKids)}</p>
        )}
        {others.length === 0 ? (
          <p className="text-sm text-muted">V okolí nejsou žádné obce.</p>
        ) : (
          <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {others.map((v) => {
              const checked = recruit.has(v.id);
              const full = !checked && recruit.size >= data.maxRecruitVillages;
              return (
                <li key={v.id}>
                  <label className={`flex items-start gap-3 p-3 rounded-soft border bg-white min-h-11 ${checked ? "border-pitch-500" : "border-gray-200"} ${full ? "opacity-50" : "cursor-pointer"}`}>
                    <input type="checkbox" checked={checked} disabled={full} onChange={() => toggleVillage(v.id)} className="mt-1 h-5 w-5 accent-pitch-600" />
                    <span className="flex-1 text-sm">
                      <span className="font-heading font-bold text-ink">{v.name}</span>
                      <span className="text-muted"> · {v.km.toLocaleString("cs")} km</span>
                      <span className="block text-muted">{kidsText(v.expectedKids)}{v.competitors > 0 ? ", dělíš se s místním klubem" : ""}</span>
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
        )}
        <p className="text-sm">Z náboru čekej <strong className="font-heading text-ink">{classText(expectedClass)}</strong> za rok, nejvýš 6.</p>
      </section>

      <div className="card p-4 sm:p-5 space-y-3">
        <p className="text-sm text-muted">
          Zázemí tě vyjde na <strong className="text-ink font-heading tabular-nums">{kc(newWeekly)}</strong> týdně
          {recruit.size > 0 && program.upkeep ? `, nábor v létě na ${kc(recruit.size * data.costs.recruitFee)}` : ""}.
        </p>
        <button onClick={save} disabled={!changed || saving} className="btn btn-primary btn-md w-full sm:w-auto disabled:opacity-40 disabled:cursor-not-allowed">
          {saving ? "Ukládám…" : saved ? "Uloženo" : "Uložit"}
        </button>
      </div>
    </div>
  );
}
