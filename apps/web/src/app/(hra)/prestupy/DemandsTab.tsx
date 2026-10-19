"use client";

/**
 * Poptávky — záložka Přestupů (2026-10-19).
 * Moje poptávky a kdo mi koho nabídl, poptávky klubů mimo hru z okresu a poptávky manažerů.
 * Klub mimo hru rozhodne o nabídnutém hráči hned; manažerovi přijde zpráva do telefonu.
 */

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { apiFetch, apiAction, showError } from "@/lib/api";
import { Spinner, SectionLabel, PositionBadge, SheetDialog, useConfirm } from "@/components/ui";
import { MoneyInput } from "@/components/ui/money-input";
import { OriginBadge } from "@/components/transfers/origin-badge";

type Position = "GK" | "DEF" | "MID" | "FWD";
type Role = "starter" | "squad" | "prospect";

interface DemandBase {
  id: string;
  position: Position;
  ageMin: number;
  ageMax: number;
  role: Role;
  roleLabel: string;
  summary: string;
  maxPrice: number | null;
  note: string | null;
  expiresAt: string;
}

interface MyPitch { playerId: string; playerName: string; status: "pitched" | "accepted" | "declined"; reply: string | null; offerId: string | null }

export interface DemandsData {
  mine: Array<DemandBase & { pitches: Array<{ playerId: string; playerName: string; age: number; position: Position; teamId: string; teamName: string }> }>;
  managers: Array<DemandBase & { teamId: string; teamName: string; origin: string | null; myPitches: MyPitch[] }>;
  clubs: Array<DemandBase & { clubName: string; clubCity: string | null; abroad: boolean; filled: boolean; myPitches: MyPitch[] }>;
  pitchable: Array<{ id: string; name: string; age: number; position: Position }>;
  limits: { maxActive: number; pitchesPerDemand: number; noteMax: number; days: number };
}

const POSITION_OPTIONS: Array<{ key: Position; label: string }> = [
  { key: "GK", label: "BRA" }, { key: "DEF", label: "OBR" }, { key: "MID", label: "ZÁL" }, { key: "FWD", label: "ÚTO" },
];
const ROLE_OPTIONS: Array<{ key: Role; label: string; ages: [number, number] }> = [
  { key: "starter", label: "Do základu", ages: [18, 30] },
  { key: "squad", label: "Do kádru", ages: [18, 33] },
  { key: "prospect", label: "Mladý talent", ages: [16, 20] },
];
const AGES = Array.from({ length: 26 }, (_, i) => 15 + i);

const formatCZK = (v: number) => `${v.toLocaleString("cs")}\u00a0Kč`;
const dateCz = (iso: string) => new Date(iso).toLocaleDateString("cs-CZ", { day: "numeric", month: "numeric" });
const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const ageText = (d: { ageMin: number; ageMax: number }) => (d.ageMin <= 16 ? `do ${d.ageMax} let` : `${d.ageMin} až ${d.ageMax} let`);

const CHIP = "min-h-11 px-3 rounded-control text-sm font-heading font-bold transition-colors";
// Na telefonu tlačítko pod poptávkou, aby nezužovalo text; od tabletu vpravo jako na trhu.
const PITCH_BUTTON = "self-start sm:shrink-0 min-h-11 sm:min-h-0 py-1.5 px-4 rounded-soft text-sm font-heading font-bold bg-pitch-500 text-white hover:bg-pitch-600 transition-colors";
const chipClass = (on: boolean) => `${CHIP} ${on ? "bg-pitch-500 text-white" : "bg-black/5 text-ink hover:bg-black/10"}`;

/** Hlavička poptávky: post, kam a věk; pod tím kdo, strop ceny, poznámka a do kdy platí. */
function DemandHead({ d, who }: { d: DemandBase; who: React.ReactNode }) {
  return (
    <>
      <div className="flex items-center gap-2 flex-wrap mb-0.5">
        <PositionBadge position={d.position} />
        <span className="font-heading font-bold text-base">{capitalize(d.roleLabel)}</span>
        <span className="text-sm text-muted">{ageText(d)}</span>
      </div>
      <div className="text-sm text-muted">
        {who}
        {d.maxPrice ? <> · do <span className="font-heading font-bold text-ink">{formatCZK(d.maxPrice)}</span></> : " · cena dohodou"}
      </div>
      {d.note && <p className="text-sm text-ink-light italic mt-1">„{d.note}“</p>}
      <div className="text-sm text-muted mt-1">Platí do {dateCz(d.expiresAt)}</div>
    </>
  );
}

/** Koho jsem k cizí poptávce nabídl a co na to klub řekl. */
function MyPitches({ pitches }: { pitches: MyPitch[] }) {
  if (pitches.length === 0) return null;
  return (
    <div className="mt-2 space-y-1.5">
      {pitches.map((p) => (
        <div key={p.playerId} className="text-sm bg-surface rounded-soft px-3 py-2">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-muted">Nabídl jsi</span>
            <Link href={`/hrac/${p.playerId}`} className="font-heading font-bold hover:text-pitch-500 underline decoration-pitch-500/20">{p.playerName}</Link>
            {p.status === "accepted" && <span className="text-pitch-700 font-heading font-bold">✓ chtějí ho</span>}
            {p.status === "declined" && <span className="text-card-red font-heading font-bold">✗ nechtějí</span>}
            {p.status === "pitched" && <span className="text-muted">· manažer dostal zprávu</span>}
          </div>
          {p.reply && <p className="text-ink-light italic mt-0.5">„{p.reply}“</p>}
          {p.offerId && (
            <Link href={`/prestupy/nabidka/${p.offerId}`} className="inline-block mt-1 font-heading font-bold text-pitch-600 hover:underline">
              Otevřít nabídku →
            </Link>
          )}
        </div>
      ))}
    </div>
  );
}

export function DemandsTab({ teamId }: { teamId: string }) {
  const router = useRouter();
  const { confirm, dialog: confirmDialog } = useConfirm({ sheet: true });
  const [data, setData] = useState<DemandsData | null>(null);
  const [failed, setFailed] = useState(false);
  const [creating, setCreating] = useState(false);
  const [pitchFor, setPitchFor] = useState<{ demand: DemandBase; who: string } | null>(null);

  const load = useCallback(() => {
    apiFetch<DemandsData>(`/api/teams/${teamId}/demands`)
      .then((r) => { setData(r); setFailed(false); })
      .catch((e) => { console.error("load demands:", e); setFailed(true); });
  }, [teamId]);

  useEffect(() => { load(); }, [load]);

  if (failed) return <div className="card p-6 text-center text-muted">Poptávky se nepodařilo načíst.</div>;
  if (!data) return <div className="flex justify-center py-8"><Spinner /></div>;

  const withdraw = async (d: DemandBase) => {
    const ok = await confirm({ title: "Stáhnout poptávku?", description: `Hledáš ${d.summary}. Po stažení ti k ní už nikdo nikoho nenabídne.`, confirmLabel: "Stáhnout", variant: "danger" });
    if (!ok) return;
    if (await apiAction(apiFetch(`/api/teams/${teamId}/demands/${d.id}/withdraw`, { method: "POST" }), "Stažení poptávky se nezdařilo")) load();
  };

  const canCreate = data.mine.length < data.limits.maxActive;

  return (
    <div className="space-y-5">
      {confirmDialog}

      {/* ═══ Moje poptávky ═══ */}
      <div>
        <div className="flex items-center justify-between gap-3 mb-2">
          <SectionLabel>Moje poptávky ({data.mine.length}/{data.limits.maxActive})</SectionLabel>
          {canCreate && (
            <button onClick={() => setCreating(true)}
              className="shrink-0 py-1.5 px-4 rounded-soft text-sm font-heading font-bold bg-pitch-500 text-white hover:bg-pitch-600 transition-colors">
              Zadat poptávku
            </button>
          )}
        </div>
        {data.mine.length === 0 ? (
          <div className="card p-6 text-center text-muted text-sm">
            Hledáš někoho konkrétního? Zadej poptávku a ostatní manažeři ti hráče nabídnou sami.
          </div>
        ) : (
          <div className="space-y-3">
            {data.mine.map((d) => (
              <div key={d.id} className="card p-4">
                <div className="flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <DemandHead d={d} who="Tvoje poptávka" />
                  </div>
                  <button onClick={() => withdraw(d)} className="shrink-0 min-h-11 px-2 text-sm font-heading font-bold text-muted hover:text-card-red">
                    Stáhnout
                  </button>
                </div>
                <div className="mt-3 border-t border-gray-100 pt-2">
                  {d.pitches.length === 0 ? (
                    <p className="text-sm text-muted">Zatím ti nikdo nikoho nenabídl.</p>
                  ) : (
                    <>
                      <div className="text-sm font-heading font-bold text-muted mb-1">Nabídli ti ({d.pitches.length})</div>
                      {d.pitches.map((p) => (
                        <div key={`${p.playerId}-${p.teamId}`} className="flex items-center gap-2 flex-wrap py-1.5 border-b border-gray-50 last:border-b-0">
                          <Link href={`/hrac/${p.playerId}`} className="font-heading font-bold text-base hover:text-pitch-500 underline decoration-pitch-500/20">{p.playerName}</Link>
                          <PositionBadge position={p.position} />
                          <span className="text-sm text-muted">{p.age} let</span>
                          <span className="text-sm text-muted">· <Link href={`/tym/${p.teamId}`} className="hover:text-ink underline decoration-gray-300">{p.teamName}</Link></span>
                        </div>
                      ))}
                      <p className="text-sm text-muted mt-1.5">Nabídku pošleš z profilu hráče.</p>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ═══ Kluby mimo hru ═══ */}
      <div>
        <SectionLabel>Kluby z okolí hledají ({data.clubs.length})</SectionLabel>
        {data.clubs.length === 0 ? (
          <div className="card p-6 text-center text-muted text-sm">Teď žádný klub z okolí nikoho nehledá. Nové poptávky přibývají průběžně.</div>
        ) : (
          <div className="space-y-3">
            {data.clubs.map((d) => {
              const full = d.myPitches.length >= data.limits.pitchesPerDemand;
              // „SV Grafenau, Grafenau“ by opakovalo město; přidá se jen, když v názvu klubu není.
              const who = d.clubCity && !d.clubName.includes(d.clubCity) ? `${d.clubName}, ${d.clubCity}` : d.clubName;
              return (
                <div key={d.id} className="card p-4">
                  <div className="flex flex-col sm:flex-row sm:items-start gap-3">
                    <div className="flex-1 min-w-0">
                      <DemandHead d={d} who={<>{d.abroad && <span title="Německo">🇩🇪 </span>}<span className="font-heading font-bold text-ink">{who}</span></>} />
                    </div>
                    {!d.filled && !full && (
                      <button onClick={() => setPitchFor({ demand: d, who })}
                        className={PITCH_BUTTON}>
                        Nabídnout
                      </button>
                    )}
                  </div>
                  <MyPitches pitches={d.myPitches} />
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ═══ Manažeři ═══ */}
      <div>
        <SectionLabel>Manažeři hledají ({data.managers.length})</SectionLabel>
        {data.managers.length === 0 ? (
          <div className="card p-6 text-center text-muted text-sm">Zatím nikdo z manažerů nic nehledá.</div>
        ) : (
          <div className="space-y-3">
            {data.managers.map((d) => {
              const full = d.myPitches.length >= data.limits.pitchesPerDemand;
              return (
                <div key={d.id} className="card p-4">
                  <div className="flex flex-col sm:flex-row sm:items-start gap-3">
                    <div className="flex-1 min-w-0">
                      <DemandHead d={d} who={<><OriginBadge origin={d.origin} /><Link href={`/tym/${d.teamId}`} className="font-heading font-bold text-ink hover:text-pitch-500 underline decoration-pitch-500/20">{d.teamName}</Link></>} />
                    </div>
                    {!full && (
                      <button onClick={() => setPitchFor({ demand: d, who: d.teamName })}
                        className={PITCH_BUTTON}>
                        Nabídnout
                      </button>
                    )}
                  </div>
                  <MyPitches pitches={d.myPitches} />
                </div>
              );
            })}
          </div>
        )}
      </div>

      {creating && (
        <CreateDemandSheet teamId={teamId} noteMax={data.limits.noteMax} days={data.limits.days}
          onClose={() => setCreating(false)} onCreated={() => { setCreating(false); load(); }} />
      )}
      {pitchFor && (
        <PitchSheet teamId={teamId} demand={pitchFor.demand} who={pitchFor.who} players={data.pitchable}
          already={[...data.clubs, ...data.managers].find((x) => x.id === pitchFor.demand.id)?.myPitches.map((p) => p.playerId) ?? []}
          onClose={() => setPitchFor(null)}
          onDone={async (res) => {
            setPitchFor(null);
            load();
            // Odmítnutí klubu je vidět přímo v kartě; okno jen u nabídky, ať jde hned otevřít.
            if (res.status === "accepted" && res.offerId) {
              const open = await confirm({ title: `${pitchFor.who} ho chce`, description: res.message, confirmLabel: "Otevřít nabídku", cancelLabel: "Zavřít" });
              if (open) router.push(`/prestupy/nabidka/${res.offerId}`);
            }
          }} />
      )}
    </div>
  );
}

function CreateDemandSheet({ teamId, noteMax, days, onClose, onCreated }: {
  teamId: string; noteMax: number; days: number; onClose: () => void; onCreated: () => void;
}) {
  const [position, setPosition] = useState<Position | null>(null);
  const [role, setRole] = useState<Role>("starter");
  const [ageMin, setAgeMin] = useState(18);
  const [ageMax, setAgeMax] = useState(30);
  const [maxPrice, setMaxPrice] = useState<number | null>(null);
  const [note, setNote] = useState("");

  const pickRole = (r: Role) => {
    setRole(r);
    const ages = ROLE_OPTIONS.find((o) => o.key === r)!.ages;
    setAgeMin(ages[0]);
    setAgeMax(ages[1]);
  };

  const submit = async () => {
    try {
      await apiFetch(`/api/teams/${teamId}/demands`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ position, role, ageMin, ageMax, maxPrice, note }),
      });
      onCreated();
    } catch (e) {
      console.error("create demand:", e);
      showError("Poptávku se nepodařilo zadat", (e as Error)?.message || "Zkus to znovu.");
    }
  };

  const select = "flex-1 min-h-11 rounded-control bg-black/5 px-3 text-sm font-heading font-bold text-ink";
  return (
    <SheetDialog open title="Zadat poptávku" description={`Poptávka platí ${days} dní. Ostatní manažeři ti k ní nabídnou hráče a dostaneš o tom zprávu do telefonu.`}
      confirmLabel="Zadat poptávku" confirmDisabled={!position || ageMin > ageMax} onConfirm={submit} onCancel={onClose}>
      <div className="space-y-4">
        <div>
          <div className="text-sm font-heading font-bold text-muted mb-1.5">Post</div>
          <div className="flex gap-1.5">
            {POSITION_OPTIONS.map((o) => (
              <button key={o.key} type="button" onClick={() => setPosition(o.key)} className={`flex-1 ${chipClass(position === o.key)}`}>{o.label}</button>
            ))}
          </div>
        </div>
        <div>
          <div className="text-sm font-heading font-bold text-muted mb-1.5">Kam ho chceš</div>
          <div className="flex gap-1.5 flex-wrap">
            {ROLE_OPTIONS.map((o) => (
              <button key={o.key} type="button" onClick={() => pickRole(o.key)} className={`flex-1 ${chipClass(role === o.key)}`}>{o.label}</button>
            ))}
          </div>
        </div>
        <div>
          <div className="text-sm font-heading font-bold text-muted mb-1.5">Věk</div>
          <div className="flex items-center gap-2">
            <select aria-label="Věk od" value={ageMin} onChange={(e) => setAgeMin(Number(e.target.value))} className={select}>
              {AGES.map((a) => <option key={a} value={a}>od {a}</option>)}
            </select>
            <select aria-label="Věk do" value={ageMax} onChange={(e) => setAgeMax(Number(e.target.value))} className={select}>
              {AGES.map((a) => <option key={a} value={a}>do {a}</option>)}
            </select>
          </div>
          {ageMin > ageMax && <p className="text-sm text-card-red mt-1">„Od“ nesmí být víc než „do“.</p>}
        </div>
        <div>
          <div className="text-sm font-heading font-bold text-muted mb-1.5">Kolik nejvýš zaplatíš</div>
          <MoneyInput value={maxPrice} onChange={setMaxPrice} placeholder="Nech prázdné, když je cena dohodou"
            className="w-full min-h-11 rounded-control bg-black/5 px-3 text-sm font-heading font-bold text-ink" />
        </div>
        <div>
          <div className="text-sm font-heading font-bold text-muted mb-1.5">Poznámka (nepovinná)</div>
          <textarea value={note} onChange={(e) => setNote(e.target.value.slice(0, noteMax))} rows={2}
            placeholder="Třeba: hledáme rychlého beka, co vydrží celý zápas"
            className="w-full rounded-control bg-black/5 px-3 py-2 text-sm text-ink" />
          <div className="text-sm text-muted text-right">{note.length}/{noteMax}</div>
        </div>
      </div>
    </SheetDialog>
  );
}

function PitchSheet({ teamId, demand, who, players, already, onClose, onDone }: {
  teamId: string;
  demand: DemandBase;
  who: string;
  players: DemandsData["pitchable"];
  already: string[];
  onClose: () => void;
  onDone: (res: { status: "pitched" | "accepted" | "declined"; message: string; offerId?: string }) => void;
}) {
  const fitting = players.filter((p) => p.position === demand.position && p.age >= demand.ageMin && p.age <= demand.ageMax && !already.includes(p.id));
  const [chosen, setChosen] = useState<string | null>(fitting.length === 1 ? fitting[0].id : null);

  const submit = async () => {
    try {
      const res = await apiFetch<{ status: "pitched" | "accepted" | "declined"; message: string; offerId?: string }>(
        `/api/teams/${teamId}/demands/${demand.id}/pitch`,
        { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ playerId: chosen }) },
      );
      onDone(res);
    } catch (e) {
      console.error("pitch player:", e);
      showError("Hráče se nepodařilo nabídnout", (e as Error)?.message || "Zkus to znovu.");
    }
  };

  return (
    <SheetDialog open title="Nabídnout hráče" description={`${who} hledá ${demand.summary}.`}
      confirmLabel="Nabídnout" confirmDisabled={!chosen} onConfirm={submit} onCancel={onClose}>
      {fitting.length === 0 ? (
        <p className="text-sm text-muted">Nikdo z tvého kádru nesedí na post a věk.</p>
      ) : (
        <div className="space-y-1.5">
          {fitting.map((p) => (
            <label key={p.id} className={`flex items-center gap-3 min-h-11 px-3 rounded-soft cursor-pointer border ${chosen === p.id ? "border-pitch-500 bg-pitch-50" : "border-gray-100 bg-white"}`}>
              <input type="radio" name="pitch-player" checked={chosen === p.id} onChange={() => setChosen(p.id)} className="accent-pitch-500" />
              <span className="font-heading font-bold text-base flex-1 min-w-0 truncate">{p.name}</span>
              <PositionBadge position={p.position} />
              <span className="text-sm text-muted shrink-0">{p.age} let</span>
            </label>
          ))}
        </div>
      )}
    </SheetDialog>
  );
}
