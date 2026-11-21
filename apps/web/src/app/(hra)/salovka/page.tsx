"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useTeam } from "@/context/team-context";
import { apiFetch } from "@/lib/api";
import { formatKc } from "@/lib/format";
import { Button, ListCard, ListEmpty, ListRow, PageHeader, PageLoading, SectionLabel } from "@/components/ui";

interface StandingRow {
  teamId: string;
  name: string;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goalsFor: number;
  goalsAgainst: number;
  points: number;
}

interface HallMatch {
  id: string;
  stage: "group" | "qf" | "sf" | "third" | "final";
  groupCode: string | null;
  slot: number;
  court: number;
  clock: string;
  homeTeamId: string;
  awayTeamId: string;
  home: string;
  away: string;
  status: string;
  homeScore: number | null;
  awayScore: number | null;
  homePens: number | null;
  awayPens: number | null;
  winnerTeamId: string | null;
  goals: Array<{ minute: number; side: "home" | "away"; name: string; ownGoal: boolean }>;
}

interface SquadPlayer {
  id: string;
  name: string;
  position: string;
  rating: number;
  injured: boolean;
}

interface HallCupData {
  cup: {
    id: string;
    title: string;
    venue: string;
    status: "planned" | "registration" | "drawing" | "drawn" | "finished" | "cancelled";
    playsOn: string;
    registrationDeadline: string;
    inviteOn: string;
    entryFee: number;
    pot: number;
    winnerTeamId: string | null;
    winnerName: string | null;
  } | null;
  entry?: { status: "invited" | "registered" | "declined"; groupCode: string | null; finalPlace: number | null; convId: string | null } | null;
  entrants?: Array<{ teamId: string; name: string }>;
  groups?: Array<{ code: string; table: StandingRow[] }>;
  matches?: HallMatch[];
  topScorer?: { name: string; teamName: string; goals: number } | null;
  roster?: { chosen: string[] | null; max: number; canEdit: boolean; squad: SquadPlayer[] };
}

const STAGE_LABEL: Record<HallMatch["stage"], string> = {
  group: "Skupiny", qf: "Čtvrtfinále", sf: "Semifinále", third: "O 3. místo", final: "Finále",
};
const POSITION_LABEL: Record<string, string> = { GK: "B", DEF: "O", MID: "Z", FWD: "Ú" };

/** „27. 12.“ z YYYY-MM-DD. Končí tečkou, na konci věty se druhá nepřidává. */
function dayLabel(date: string): string {
  const [, m, d] = date.split("-").map(Number);
  return `${d}. ${m}.`;
}

function nextDay(date: string): string {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

function TermRow({ icon, title, children }: { icon: string; title: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-3 px-4 py-3 border-b border-line-soft last:border-b-0">
      <span className="text-lg leading-6 shrink-0" aria-hidden>{icon}</span>
      <div className="min-w-0">
        <div className="font-heading font-bold text-sm">{title}</div>
        <div className="text-sm text-ink/80 mt-0.5">{children}</div>
      </div>
    </div>
  );
}

function scoreText(m: HallMatch): string {
  if (m.status !== "played") return "–:–";
  return `${m.homeScore}:${m.awayScore}`;
}

/** Střelci jednoho týmu po hráčích: „Pokorný 1′, 2′, 9′, Růžička 14′“ (pořadí podle prvního gólu). */
function scorerLine(goals: HallMatch["goals"]): string {
  const byName = new Map<string, number[]>();
  for (const g of goals) {
    const key = g.ownGoal ? `${g.name} (vl.)` : g.name;
    byName.set(key, [...(byName.get(key) ?? []), g.minute]);
  }
  return [...byName].map(([name, minutes]) => `${name} ${minutes.map((x) => `${x}′`).join(", ")}`).join(", ");
}

function MatchRow({ m, myTeamId }: { m: HallMatch; myTeamId: string | null }) {
  const mine = m.homeTeamId === myTeamId || m.awayTeamId === myTeamId;
  const homeGoals = scorerLine(m.goals.filter((g) => g.side === "home"));
  const awayGoals = scorerLine(m.goals.filter((g) => g.side === "away"));
  return (
    <div className={`px-4 py-2.5 border-b border-line-soft last:border-b-0 ${mine ? "bg-pitch-50" : ""}`}>
      <div className="flex items-center gap-3">
        <div className="w-12 shrink-0 text-meta text-muted tabular-nums leading-tight">
          <div>{m.clock}</div>
          <div>hř. {m.court}</div>
        </div>
        <div className="flex-1 min-w-0 text-sm">
          <div className={`truncate ${m.winnerTeamId === m.homeTeamId ? "font-bold" : ""}`}>{m.home}</div>
          <div className={`truncate ${m.winnerTeamId === m.awayTeamId ? "font-bold" : ""}`}>{m.away}</div>
        </div>
        <div className="text-right shrink-0">
          <div className="font-heading font-bold tabular-nums text-base">{scoreText(m)}</div>
          {m.homePens != null && m.awayPens != null && (
            <div className="text-meta text-muted tabular-nums">pen. {m.homePens}:{m.awayPens}</div>
          )}
        </div>
      </div>
      {m.goals.length > 0 && (
        <div className="mt-1 text-meta text-muted leading-snug" style={{ paddingLeft: "3.75rem" }}>
          {homeGoals && <div>{homeGoals}</div>}
          {awayGoals && <div className="text-ink/60">{awayGoals}</div>}
        </div>
      )}
    </div>
  );
}

function GroupTable({ code, table, myTeamId }: { code: string; table: StandingRow[]; myTeamId: string | null }) {
  return (
    <div className="card overflow-hidden">
      <div className="px-4 py-2 font-heading font-bold text-sm border-b border-line-soft">Skupina {code}</div>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-meta text-muted">
            <th className="text-left font-normal px-4 py-1.5">Tým</th>
            <th className="font-normal px-1 w-8">Z</th>
            <th className="font-normal px-1 w-14">Skóre</th>
            <th className="font-normal px-3 w-10 text-right">B</th>
          </tr>
        </thead>
        <tbody>
          {table.map((r, i) => (
            <tr key={r.teamId} className={`border-t border-line-soft ${r.teamId === myTeamId ? "bg-pitch-50 font-bold" : ""}`}>
              <td className="px-4 py-1.5 truncate max-w-0 w-full">
                <span className="text-muted tabular-nums mr-1.5">{i + 1}.</span>{r.name}
              </td>
              <td className="px-1 text-center tabular-nums">{r.played}</td>
              <td className="px-1 text-center tabular-nums whitespace-nowrap">{r.goalsFor}:{r.goalsAgainst}</td>
              <td className="px-3 text-right tabular-nums font-bold">{r.points}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function RosterPicker({ teamId, roster, onSaved }: { teamId: string; roster: NonNullable<HallCupData["roster"]>; onSaved: () => void }) {
  const [picked, setPicked] = useState<string[]>(roster.chosen ?? []);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => { setPicked(roster.chosen ?? []); }, [roster.chosen]);

  const toggle = (id: string) => {
    setSaved(false);
    setPicked((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : cur.length >= roster.max ? cur : [...cur, id]));
  };

  const save = async (ids: string[]) => {
    setBusy(true);
    setError(null);
    try {
      await apiFetch(`/api/teams/${teamId}/hall-cup/roster`, { method: "PUT", body: JSON.stringify({ playerIds: ids }) });
      setSaved(true);
      onSaved();
    } catch (e) {
      console.error("uložení soupisky sálovky:", e);
      setError(e instanceof Error ? e.message : "Soupisku se nepodařilo uložit.");
    } finally {
      setBusy(false);
    }
  };

  const hasKeeper = roster.squad.some((p) => picked.includes(p.id) && p.position === "GK");
  const tooFew = picked.length > 0 && picked.length < 6;

  if (!roster.canEdit) {
    const chosen = roster.squad.filter((p) => roster.chosen?.includes(p.id));
    return (
      <ListCard title="Soupiska" count={chosen.length ? `${chosen.length} hráčů` : "automat"}>
        {chosen.length === 0
          ? <ListEmpty icon="🥅">Soupisku jste nevybrali, do haly jeli nejlepší zdraví hráči.</ListEmpty>
          : chosen.map((p) => <ListRow key={p.id} dense title={p.name} trailing={<span className="text-meta text-muted">{POSITION_LABEL[p.position] ?? p.position}</span>} />)}
      </ListCard>
    );
  }

  return (
    <div>
      <SectionLabel>Soupiska</SectionLabel>
      <div className="card mt-2 overflow-hidden">
        <div className="px-4 py-3 text-sm text-ink/80 border-b border-line-soft">
          Vyber šest až {roster.max} hráčů. Nejlepší brankář jde do branky, pět do pole (dva vzadu, jeden uprostřed, dva vpředu), zbytek na střídačku.
          Když nevybereš nikoho, pojedou nejlepší zdraví.
        </div>
        <div>
          {roster.squad.map((p) => {
            const on = picked.includes(p.id);
            const full = !on && picked.length >= roster.max;
            return (
              <label key={p.id} className={`flex items-center gap-3 px-4 min-h-[44px] border-b border-line-soft last:border-b-0 ${p.injured || full ? "opacity-50" : "cursor-pointer"}`}>
                <input type="checkbox" className="w-4 h-4 accent-pitch-600" checked={on} disabled={p.injured || full || busy} onChange={() => toggle(p.id)} />
                <span className="w-5 text-meta text-muted">{POSITION_LABEL[p.position] ?? p.position}</span>
                <span className="flex-1 min-w-0 truncate text-sm">{p.name}</span>
                {p.injured && <span className="text-meta text-card-red">zraněný</span>}
              </label>
            );
          })}
        </div>
        <div className="px-4 py-3 border-t border-line-soft space-y-2">
          <div className="text-sm">
            Vybráno <span className="font-bold tabular-nums">{picked.length}</span> z {roster.max}
            {picked.length > 0 && !hasKeeper && <span className="text-muted">. Brankář chybí, do branky půjde ten, kdo chytá nejlíp.</span>}
            {tooFew && <span className="text-card-red">. Vyber aspoň šest.</span>}
          </div>
          {error && <div className="text-sm text-card-red">{error}</div>}
          {saved && !error && <div className="text-sm text-pitch-600">Soupiska je uložená.</div>}
          <div className="flex flex-wrap gap-2">
            <Button variant="primary" size="md" disabled={busy || tooFew || picked.length === 0} onClick={() => save(picked)}>
              {busy ? "Ukládám…" : "Uložit soupisku"}
            </Button>
            {(roster.chosen?.length ?? 0) > 0 && (
              <Button variant="ghost" size="md" disabled={busy} onClick={() => { setPicked([]); void save([]); }}>
                Nechat na automatu
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function HallCupPage() {
  const { teamId } = useTeam();
  const [data, setData] = useState<HallCupData | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    if (!teamId) return;
    apiFetch<HallCupData>(`/api/teams/${teamId}/hall-cup`)
      .then(setData)
      .catch((e) => console.error("načtení sálovky:", e))
      .finally(() => setLoading(false));
  }, [teamId]);

  useEffect(() => { load(); }, [load]);

  const matches = useMemo(() => data?.matches ?? [], [data]);
  const stages = useMemo(() => {
    const order: HallMatch["stage"][] = ["group", "qf", "sf", "third", "final"];
    return order.map((s) => ({ stage: s, list: matches.filter((m) => m.stage === s) })).filter((s) => s.list.length > 0);
  }, [matches]);

  if (loading) return <PageLoading />;

  const cup = data?.cup ?? null;
  if (!cup) {
    return (
      <>
        <PageHeader compact name="Vánoční sálovka" detail="Halový turnaj okresu">{null}</PageHeader>
        <div className="page-container">
          <div className="card p-8 text-center text-muted text-sm">Sálovka se hraje mezi svátky v hale v Prachaticích. Pozvánky rozesílá hala na začátku prosince.</div>
        </div>
      </>
    );
  }

  const entry = data?.entry ?? null;
  const entrants = data?.entrants ?? [];
  const drawOn = nextDay(cup.registrationDeadline);

  let status: React.ReactNode;
  if (cup.status === "planned") {
    status = <>Pozvánky rozešle hala {dayLabel(cup.inviteOn)} do Telefonu.</>;
  } else if (cup.status === "cancelled") {
    status = <>Turnaj se letos nekoná, sešlo se málo přihlášek.</>;
  } else if (cup.status === "finished") {
    status = (
      <>
        Vyhrál <span className="font-bold">{cup.winnerName}</span>.
        {entry?.finalPlace ? <> Váš klub skončil na {entry.finalPlace}. místě.</> : null}
      </>
    );
  } else if (entry?.status === "registered") {
    status = cup.status === "registration"
      ? <>✓ Jste přihlášení. Startovné {formatKc(cup.entryFee)} se strhne při losu {dayLabel(drawOn)}</>
      : matches.some((m) => m.status === "played")
        ? <>✓ Hrajete{entry.groupCode ? ` ve skupině ${entry.groupCode}` : ""}. Turnaj běží, výsledky přibývají během dne.</>
        : <>✓ Hrajete{entry.groupCode ? ` ve skupině ${entry.groupCode}` : ""}. Turnaj začíná {dayLabel(cup.playsOn)} v 9:00.</>;
  } else if (cup.status === "registration") {
    status = entry?.status === "declined"
      ? <>Letos jste odřekli. Rozmyslet si to můžete do {dayLabel(cup.registrationDeadline)}, stačí odepsat hale.</>
      : <>Přihláška jde přes SMS s halou, uzávěrka {dayLabel(cup.registrationDeadline)}</>;
  } else {
    status = <>Přihlášky jsou uzavřené, váš klub nehraje.</>;
  }

  return (
    <>
      <PageHeader compact name={cup.title} detail={`${cup.venue}, neděle ${dayLabel(cup.playsOn)}`}>{null}</PageHeader>
      <div className="page-container space-y-5">
        <div className="card px-4 py-4 space-y-3">
          <div className="text-sm">{status}</div>
          {entry?.convId && (cup.status === "registration" || cup.status === "planned") && (
            <Link href={`/telefon/${entry.convId}`} className="inline-block text-sm font-bold text-pitch-600 underline underline-offset-2">
              Otevřít SMS s halou
            </Link>
          )}
          {entrants.length > 0 && cup.status !== "finished" && cup.status !== "cancelled" && (
            <div className="text-sm text-muted">Přihlášeno {entrants.length} z 16 týmů, v banku je {formatKc(cup.pot)}.</div>
          )}
        </div>

        {data?.roster && teamId && entry?.status === "registered" && (
          <RosterPicker teamId={teamId} roster={data.roster} onSaved={load} />
        )}

        {(data?.groups?.length ?? 0) > 0 && (
          <div className="space-y-3">
            <SectionLabel>Skupiny</SectionLabel>
            <div className="grid gap-3 sm:grid-cols-2">
              {data!.groups!.map((g) => <GroupTable key={g.code} code={g.code} table={g.table} myTeamId={teamId} />)}
            </div>
          </div>
        )}

        {stages.map((s) => (
          <ListCard key={s.stage} title={STAGE_LABEL[s.stage]} count={s.stage === "group" ? `${s.list.filter((m) => m.status === "played").length} z ${s.list.length}` : undefined}>
            {s.list.map((m) => <MatchRow key={m.id} m={m} myTeamId={teamId} />)}
          </ListCard>
        ))}

        {data?.topScorer && (
          <div className="card px-4 py-3 text-sm">
            ⚽ Nejlepší střelec: <span className="font-bold">{data.topScorer.name}</span> ({data.topScorer.teamName}), {data.topScorer.goals} {data.topScorer.goals === 1 ? "gól" : data.topScorer.goals < 5 ? "góly" : "gólů"}
          </div>
        )}

        <div>
          <SectionLabel>Propozice</SectionLabel>
          <div className="card mt-2">
            <TermRow icon="🥅" title="Hra">Malá kopaná 5+1 v hale, 2 × 10 minut. Hraje se od 9:00 na dvou hřištích, zápas každých 25 minut.</TermRow>
            <TermRow icon="🏆" title="Formát">
              Skupiny podle počtu týmů, v každé hraje každý s každým. Pak play-off na jeden zápas, při remíze hned penalty. Poražení semifinalisté hrají o 3. místo.
            </TermRow>
            <TermRow icon="💰" title="Startovné a bank">
              Startovné {formatKc(cup.entryFee)} se strhne při losu. Celý bank dostanou první tři: vítěz 50 %, druhý 30 %, třetí 20 %. Vítěz si odveze i pohár do vitríny.
            </TermRow>
            <TermRow icon="📅" title="Termíny">
              Přihlášky do {dayLabel(cup.registrationDeadline)} přes SMS s halou, los {dayLabel(drawOn)}, turnaj v neděli {dayLabel(cup.playsOn)} Vejde se 16 týmů, kdo dřív přijde.
            </TermRow>
            <TermRow icon="🩹" title="Co si odvezeš do ligy">
              Nic: zranění, karty ani únava ze sálovky se do ligy nepočítají. Hrát můžou jen hráči, kteří nejsou zranění.
            </TermRow>
          </div>
        </div>

        {entrants.length > 0 && (
          <ListCard title="Přihlášené kluby" count={`${entrants.length}`}>
            {entrants.map((e) => (
              <ListRow key={e.teamId} dense href={`/tym/${e.teamId}`} tone={e.teamId === teamId ? "new" : undefined} title={e.name} />
            ))}
          </ListCard>
        )}
      </div>
    </>
  );
}
