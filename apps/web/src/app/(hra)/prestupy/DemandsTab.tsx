"use client";

/**
 * Poptávky — záložka Přestupů (2026-10-19).
 * Moje poptávky a kdo mi koho nabídl, poptávky klubů mimo hru z okresu a poptávky manažerů.
 * Klub mimo hru rozhodne o nabídnutém hráči hned; manažerovi přijde zpráva do telefonu.
 */

import { Fragment, useCallback, useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { apiFetch, apiAction, showError } from "@/lib/api";
import { PositionBadge, SheetDialog, useConfirm, ListCard, ListRow, ListEmpty, RowIcon, StatusChip, SectionLoading, ChoiceGroup } from "@/components/ui";
import { MoneyInput } from "@/components/ui/money-input";
import { OriginBadge } from "@/components/transfers/origin-badge";
import { formatKc } from "@/lib/format";

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
  /** Hodnocení aspoň (jen u manažerů; klub mimo hru práh neukazuje). */
  minRating: number | null;
  skills: Array<{ skill: string; label: string; min: number }>;
}

interface MyPitch { playerId: string; playerName: string; status: "pitched" | "accepted" | "declined"; reply: string | null; offerId: string | null }

export interface DemandsData {
  mine: Array<DemandBase & { pitches: Array<{ playerId: string; playerName: string; age: number; position: Position; teamId: string; teamName: string }> }>;
  managers: Array<DemandBase & { teamId: string; teamName: string; origin: string | null; myPitches: MyPitch[] }>;
  clubs: Array<DemandBase & { clubName: string; clubCity: string | null; abroad: boolean; filled: boolean; myPitches: MyPitch[] }>;
  pitchable: Array<{ id: string; name: string; age: number; position: Position; rating: number; skills: Record<string, number> }>;
  limits: { maxActive: number; pitchesPerDemand: number; noteMax: number; days: number; maxSkills: number };
  skillOptions: Array<{ key: string; label: string }>;
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

const dateCz = (iso: string) => new Date(iso).toLocaleDateString("cs-CZ", { day: "numeric", month: "numeric" });
const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const ageText = (d: { ageMin: number; ageMax: number }) => (d.ageMin <= 16 ? `do ${d.ageMax} let` : `${d.ageMin} až ${d.ageMax} let`);

const REQ_CHIP = "px-2 py-0.5 rounded-full bg-surface border border-gray-100 text-sm font-heading font-bold text-ink tabular-nums";
// Tlačítko je pod poptávkou (v podrobnostech řádku), aby nezužovalo text; na telefonu má plnou výšku pro prst.
const PITCH_BUTTON = "min-h-11 sm:min-h-0 py-1.5 px-4 rounded-soft text-sm font-heading font-bold bg-pitch-500 text-white hover:bg-pitch-600 transition-colors";

/**
 * Řádek poptávky: post a kam (název), věk a do kdy platí (podrobnosti); pod tím kdo,
 * strop ceny, požadavky a poznámka. `extra` je věta nebo tlačítka pod tím, `trailing` jedno tlačítko vpravo.
 */
function DemandRow({ d, who, extra, trailing }: { d: DemandBase; who: ReactNode; extra?: ReactNode; trailing?: ReactNode }) {
  return (
    <ListRow
      title={
        <span className="inline-flex items-center gap-2 flex-wrap">
          <PositionBadge position={d.position} />
          {capitalize(d.roleLabel)}
        </span>
      }
      meta={`${ageText(d)} · platí do ${dateCz(d.expiresAt)}`}
      trailing={trailing}
      detail={<>
        <span className="block">
          {who}
          {d.maxPrice ? <> · do <span className="font-bold text-ink">{formatKc(d.maxPrice)}</span></> : " · cena dohodou"}
        </span>
        {(d.minRating || d.skills.length > 0) && (
          <span className="flex flex-wrap gap-1.5 mt-1.5">
            {d.minRating ? <span className={REQ_CHIP}>Hodnocení {d.minRating}+</span> : null}
            {d.skills.map((x) => <span key={x.skill} className={REQ_CHIP}>{x.label} {x.min}+</span>)}
          </span>
        )}
        {d.note && <span className="block italic mt-1">„{d.note}“</span>}
        {extra}
      </>} />
  );
}

/** Koho jsem k cizí poptávce nabídl a co na to klub řekl: řádky hned pod poptávkou. */
function MyPitches({ pitches }: { pitches: MyPitch[] }) {
  if (pitches.length === 0) return null;
  return (
    <>
      {pitches.map((p) => (
        <ListRow key={p.playerId}
          leading={<RowIcon>📤</RowIcon>}
          title={<Link href={`/hrac/${p.playerId}`} className="hover:text-pitch-500 underline decoration-pitch-500/20">{p.playerName}</Link>}
          meta="Nabídl jsi"
          trailing={
            p.status === "accepted" ? <StatusChip tone="ok">✓ chtějí ho</StatusChip>
            : p.status === "declined" ? <StatusChip tone="danger">✗ nechtějí</StatusChip>
            : <StatusChip>manažer dostal zprávu</StatusChip>
          }
          detail={p.reply || p.offerId ? <>
            {p.reply && <span className="block italic">„{p.reply}“</span>}
            {p.offerId && (
              <Link href={`/prestupy/nabidka/${p.offerId}`} className="inline-block mt-1 font-bold text-pitch-600 hover:underline">
                Otevřít nabídku →
              </Link>
            )}
          </> : undefined} />
      ))}
    </>
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
  if (!data) return <SectionLoading />;

  const withdraw = async (d: DemandBase) => {
    const ok = await confirm({ title: "Stáhnout poptávku?", description: `Hledáš ${d.summary}. Po stažení ti k ní už nikdo nikoho nenabídne.`, confirmLabel: "Stáhnout", variant: "danger" });
    if (!ok) return;
    if (await apiAction(apiFetch(`/api/teams/${teamId}/demands/${d.id}/withdraw`, { method: "POST" }), "Stažení poptávky se nezdařilo")) load();
  };

  const canCreate = data.mine.length < data.limits.maxActive;

  return (
    <div className="space-y-5">
      {confirmDialog}

      {/* ═══ Manažeři ═══ */}
      <ListCard title="Manažeři hledají" count={data.managers.length}>
        {data.managers.length === 0 ? (
          <ListEmpty icon="🔎">Zatím nikdo z manažerů nic nehledá.</ListEmpty>
        ) : (
          data.managers.map((d) => {
            const full = d.myPitches.length >= data.limits.pitchesPerDemand;
            return (
              <Fragment key={d.id}>
                <DemandRow d={d}
                  who={<><OriginBadge origin={d.origin} /><Link href={`/tym/${d.teamId}`} className="font-bold text-ink hover:text-pitch-500 underline decoration-pitch-500/20">{d.teamName}</Link></>}
                  extra={!full && (
                    <span className="flex flex-wrap gap-2 mt-2">
                      <button onClick={() => setPitchFor({ demand: d, who: d.teamName })} className={PITCH_BUTTON}>
                        Nabídnout
                      </button>
                    </span>
                  )} />
                <MyPitches pitches={d.myPitches} />
              </Fragment>
            );
          })
        )}
      </ListCard>

      {/* ═══ Kluby mimo hru ═══ */}
      <ListCard title="Kluby z okolí hledají" count={data.clubs.length}>
        {data.clubs.length === 0 ? (
          <ListEmpty icon="🔎">Teď žádný klub z okolí nikoho nehledá. Nové poptávky přibývají průběžně.</ListEmpty>
        ) : (
          data.clubs.map((d) => {
            const full = d.myPitches.length >= data.limits.pitchesPerDemand;
            // „SV Grafenau, Grafenau“ by opakovalo město; přidá se jen, když v názvu klubu není.
            const who = d.clubCity && !d.clubName.includes(d.clubCity) ? `${d.clubName}, ${d.clubCity}` : d.clubName;
            return (
              <Fragment key={d.id}>
                <DemandRow d={d}
                  who={<>{d.abroad && <span title="Německo">🇩🇪 </span>}<span className="font-bold text-ink">{who}</span></>}
                  extra={!d.filled && !full && (
                    <span className="flex flex-wrap gap-2 mt-2">
                      <button onClick={() => setPitchFor({ demand: d, who })} className={PITCH_BUTTON}>
                        Nabídnout
                      </button>
                    </span>
                  )} />
                <MyPitches pitches={d.myPitches} />
              </Fragment>
            );
          })
        )}
      </ListCard>

      {/* ═══ Moje poptávky ═══ */}
      <ListCard title="Moje poptávky" count={`${data.mine.length}/${data.limits.maxActive}`}
        controls={canCreate && (
          <button onClick={() => setCreating(true)}
            className="shrink-0 py-1.5 px-4 rounded-soft text-sm font-heading font-bold bg-pitch-500 text-white hover:bg-pitch-600 transition-colors">
            Zadat poptávku
          </button>
        )}>
        {data.mine.length === 0 ? (
          <ListEmpty icon="📝">
            Hledáš někoho konkrétního? Zadej poptávku a ostatní manažeři ti hráče nabídnou sami.
          </ListEmpty>
        ) : (
          data.mine.map((d) => (
            <Fragment key={d.id}>
              <DemandRow d={d} who="Tvoje poptávka"
                trailing={
                  <button onClick={() => withdraw(d)} className="min-h-11 px-2 text-sm font-heading font-bold text-muted hover:text-card-red">
                    Stáhnout
                  </button>
                }
                extra={
                  <span className="block mt-1.5 text-muted">
                    {d.pitches.length === 0
                      ? "Zatím ti nikdo nikoho nenabídl."
                      : <>Nabídli ti ({d.pitches.length}). Nabídku pošleš z profilu hráče.</>}
                  </span>
                } />
              {d.pitches.map((p) => (
                <ListRow key={`${p.playerId}-${p.teamId}`}
                  leading={<RowIcon>📥</RowIcon>}
                  title={<Link href={`/hrac/${p.playerId}`} className="hover:text-pitch-500 underline decoration-pitch-500/20">{p.playerName}</Link>}
                  meta={<>
                    <PositionBadge position={p.position} /> {p.age} let · <Link href={`/tym/${p.teamId}`} className="hover:text-ink underline decoration-gray-300">{p.teamName}</Link>
                  </>} />
              ))}
            </Fragment>
          ))
        )}
      </ListCard>

      {creating && (
        <CreateDemandSheet teamId={teamId} noteMax={data.limits.noteMax} days={data.limits.days}
          skillOptions={data.skillOptions} maxSkills={data.limits.maxSkills}
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

function CreateDemandSheet({ teamId, noteMax, days, skillOptions, maxSkills, onClose, onCreated }: {
  teamId: string; noteMax: number; days: number; skillOptions: DemandsData["skillOptions"]; maxSkills: number;
  onClose: () => void; onCreated: () => void;
}) {
  const [position, setPosition] = useState<Position | null>(null);
  const [role, setRole] = useState<Role>("starter");
  const [ageMin, setAgeMin] = useState(18);
  const [ageMax, setAgeMax] = useState(30);
  const [maxPrice, setMaxPrice] = useState<number | null>(null);
  const [note, setNote] = useState("");
  const [minRating, setMinRating] = useState("");
  const [skillRows, setSkillRows] = useState<Array<{ skill: string; min: string }>>([]);
  // Rozepsaná dovednost bez čísla (nebo číslo bez dovednosti) by se tiše zahodila; radši nepustit.
  const skillsIncomplete = skillRows.some((r) => !r.skill || !r.min);
  const updateRow = (i: number, patch: Partial<{ skill: string; min: string }>) =>
    setSkillRows((rows) => rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));

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
        body: JSON.stringify({
          position, role, ageMin, ageMax, maxPrice, note,
          minRating: minRating === "" ? null : Number(minRating),
          skills: skillRows.map((r) => ({ skill: r.skill, min: Number(r.min) })),
        }),
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
      confirmLabel="Zadat poptávku" confirmDisabled={!position || ageMin > ageMax || skillsIncomplete} onConfirm={submit} onCancel={onClose}>
      <div className="space-y-4">
        <div>
          <div className="text-sm font-heading font-bold text-muted mb-1.5">Post</div>
          <ChoiceGroup ariaLabel="Post" columns={4} value={position} onChange={setPosition}
            options={POSITION_OPTIONS.map((o) => ({ value: o.key, label: o.label }))} />
        </div>
        <div>
          <div className="text-sm font-heading font-bold text-muted mb-1.5">Kam ho chceš</div>
          <ChoiceGroup ariaLabel="Kam ho chceš" columns={ROLE_OPTIONS.length === 2 ? 2 : 3} value={role} onChange={pickRole}
            options={ROLE_OPTIONS.map((o) => ({ value: o.key, label: o.label }))} />
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
          <div className="text-sm font-heading font-bold text-muted mb-1.5">Hodnocení aspoň (nepovinné)</div>
          <input type="number" inputMode="numeric" min={1} max={85} value={minRating} onChange={(e) => setMinRating(e.target.value)}
            placeholder="Třeba 45" aria-label="Hodnocení aspoň"
            className="w-full min-h-11 rounded-control bg-black/5 px-3 text-sm font-heading font-bold text-ink" />
        </div>
        <div>
          <div className="text-sm font-heading font-bold text-muted mb-1.5">Dovednosti aspoň (nepovinné, nejvýš {maxSkills})</div>
          <div className="space-y-2">
            {skillRows.map((r, i) => (
              <div key={i} className="flex items-center gap-2">
                <select aria-label="Dovednost" value={r.skill} onChange={(e) => updateRow(i, { skill: e.target.value })} className={select}>
                  <option value="">Vyber dovednost</option>
                  {skillOptions.filter((o) => o.key === r.skill || !skillRows.some((x) => x.skill === o.key)).map((o) => (
                    <option key={o.key} value={o.key}>{o.label}</option>
                  ))}
                </select>
                <input type="number" inputMode="numeric" min={1} max={99} value={r.min} onChange={(e) => updateRow(i, { min: e.target.value })}
                  placeholder="aspoň" aria-label="Dovednost aspoň"
                  className="w-24 min-h-11 rounded-control bg-black/5 px-3 text-sm font-heading font-bold text-ink" />
                <button type="button" onClick={() => setSkillRows((rows) => rows.filter((_, j) => j !== i))} aria-label="Odebrat dovednost"
                  className="shrink-0 min-h-11 min-w-11 rounded-control text-muted hover:text-card-red hover:bg-black/5 font-heading font-bold">
                  ✕
                </button>
              </div>
            ))}
            {skillRows.length < maxSkills && (
              <button type="button" onClick={() => setSkillRows((rows) => [...rows, { skill: "", min: "" }])}
                className="min-h-11 px-3 rounded-control text-sm font-heading font-bold text-pitch-600 hover:bg-black/5">
                + Přidat dovednost
              </button>
            )}
          </div>
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
  const meetsRequirements = (p: DemandsData["pitchable"][number]) =>
    (!demand.minRating || p.rating >= demand.minRating) && demand.skills.every((x) => (p.skills[x.skill] ?? 0) >= x.min);
  const fitting = players.filter((p) => p.position === demand.position && p.age >= demand.ageMin && p.age <= demand.ageMax
    && meetsRequirements(p) && !already.includes(p.id));
  const hasRequirements = !!demand.minRating || demand.skills.length > 0;
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
    <SheetDialog open title="Nabídnout hráče"
      description={`${who} hledá ${demand.summary}.${hasRequirements
        ? ` Chce ${[demand.minRating ? `hodnocení ${demand.minRating}+` : null, ...demand.skills.map((x) => `${x.label} ${x.min}+`)].filter(Boolean).join(", ")}.`
        : ""}`}
      confirmLabel="Nabídnout" confirmDisabled={!chosen} onConfirm={submit} onCancel={onClose}>
      {fitting.length === 0 ? (
        <ListEmpty icon="🔎">{hasRequirements ? "Nikdo z tvého kádru nesplňuje post, věk a požadavky." : "Nikdo z tvého kádru nesedí na post a věk."}</ListEmpty>
      ) : (
        <div className="rounded-control border border-line-soft overflow-hidden divide-y divide-line-soft">
          {fitting.map((p) => (
            <label key={p.id} className={`block cursor-pointer ${chosen === p.id ? "bg-pitch-50" : ""}`}>
              <ListRow
                leading={<input type="radio" name="pitch-player" checked={chosen === p.id} onChange={() => setChosen(p.id)} className="accent-pitch-500 w-4 h-4" />}
                title={p.name}
                meta={<>
                  <PositionBadge position={p.position} /> {p.age} let
                  {hasRequirements && (
                    <span className="tabular-nums">
                      {" · "}{[demand.minRating ? `Hodn. ${p.rating}` : null, ...demand.skills.map((x) => `${x.label} ${p.skills[x.skill] ?? 0}`)].filter(Boolean).join(", ")}
                    </span>
                  )}
                </>} />
            </label>
          ))}
        </div>
      )}
    </SheetDialog>
  );
}
