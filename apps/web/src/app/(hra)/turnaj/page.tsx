"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useTeam } from "@/context/team-context";
import { apiFetch } from "@/lib/api";
import { Spinner, SectionLabel, PageHeader, Button } from "@/components/ui";
import { bestTextOn } from "@/lib/team-color";

// Barva pořadatele turnaje (fiktivní operátor P-Mobile).
const BRAND = "#C8006A";

interface Entry {
  teamId: string;
  name: string;
  primaryColor: string | null;
  district: string | null;
  registeredAt: string;
}

interface TournamentData {
  tournament: {
    id: string;
    edition: number;
    name: string;
    sponsor: string;
    city: string;
    venueName: string;
    status: string;
    registrationDeadline: string;
    startsOn: string | null;
    pointReward: number;
    prizes: { quarterfinal: number; semifinal: number; finalist: number; winner: number };
    leagueMatches: number | null;
  } | null;
  registrationOpen?: boolean;
  entries?: Entry[];
  myEntry?: boolean;
  eligible?: boolean;
  ineligibleReason?: string | null;
}

const ON_WEEKDAY = ["v neděli", "v pondělí", "v úterý", "ve středu", "ve čtvrtek", "v pátek", "v sobotu"];
const UNTIL_WEEKDAY = ["do neděle", "do pondělí", "do úterý", "do středy", "do čtvrtka", "do pátku", "do soboty"];

/** Části data v pražském čase (uzávěrka je skutečný čas, ne herní). */
function pragueParts(iso: string) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Prague", weekday: "short", day: "numeric", month: "numeric", hour: "2-digit", minute: "2-digit", hour12: false,
  }).formatToParts(new Date(iso));
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return {
    weekday: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(get("weekday")),
    day: get("day"), month: get("month"), hour: get("hour"), minute: get("minute"),
  };
}

/** „do pondělí 12. 10. 20:00" */
function untilLabel(iso: string): string {
  const p = pragueParts(iso);
  return `${UNTIL_WEEKDAY[p.weekday] ?? "do"} ${p.day}. ${p.month}. ${p.hour}:${p.minute}`;
}

/** „ve středu 14. 10." z data YYYY-MM-DD. */
function onDayLabel(ymd: string): string {
  const d = new Date(`${ymd}T12:00:00Z`);
  return `${ON_WEEKDAY[d.getUTCDay()]} ${d.getUTCDate()}. ${d.getUTCMonth() + 1}.`;
}

function plural(n: number, one: string, few: string, many: string): string {
  if (n === 1) return one;
  if (n >= 2 && n <= 4) return few;
  return many;
}

/** „zbývá 5 dní" / „zbývá 3 hodiny" / „zbývá pár minut" */
function remainingLabel(iso: string, now: number): string {
  const ms = new Date(iso).getTime() - now;
  if (ms <= 0) return "uzavřeno";
  const hours = Math.floor(ms / 3_600_000);
  if (hours >= 24) {
    const days = Math.floor(hours / 24);
    return `zbývá ${days} ${plural(days, "den", "dny", "dní")}`;
  }
  if (hours >= 1) return `zbývá ${hours} ${plural(hours, "hodina", "hodiny", "hodin")}`;
  return "zbývá pár minut";
}

function kc(n: number): string {
  return `${n.toLocaleString("cs")} Kč`;
}

function clubsLabel(n: number): string {
  return `${n} ${plural(n, "klub", "kluby", "klubů")}`;
}

function TermRow({ icon, title, children }: { icon: string; title: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-3 px-4 py-3 border-b border-gray-50 last:border-b-0">
      <span className="text-xl leading-none shrink-0 mt-0.5" aria-hidden>{icon}</span>
      <div className="min-w-0">
        <div className="font-heading font-bold text-sm text-ink">{title}</div>
        <div className="text-sm text-ink/80 mt-0.5">{children}</div>
      </div>
    </div>
  );
}

function PrizeCell({ label, amount, note }: { label: string; amount: number; note?: string }) {
  return (
    <div>
      <div className="text-sm text-muted">{label}</div>
      <div className="font-heading font-bold tabular-nums text-base leading-tight">{kc(amount)}</div>
      {note && <div className="text-sm text-muted">{note}</div>}
    </div>
  );
}

export default function TurnajPage() {
  const { teamId } = useTeam();
  const [data, setData] = useState<TournamentData | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());

  const load = useCallback(() => {
    if (!teamId) return;
    apiFetch<TournamentData>(`/api/teams/${teamId}/tournament`)
      .then(setData)
      .catch((e) => console.error("load tournament:", e))
      .finally(() => setLoading(false));
  }, [teamId]);

  useEffect(() => { load(); }, [load]);

  // Odpočet do uzávěrky se přepočítá každou minutu.
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);

  const changeEntry = async (method: "POST" | "DELETE") => {
    if (!teamId || busy) return;
    setBusy(true);
    setError(null);
    try {
      await apiFetch(`/api/teams/${teamId}/tournament/entry`, { method });
      load();
    } catch (e) {
      console.error(`tournament entry ${method}:`, e);
      setError(e instanceof Error ? e.message : "Nepodařilo se uložit přihlášku");
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <div className="flex justify-center py-20"><Spinner /></div>;

  const t = data?.tournament;
  if (!t) {
    return (
      <>
        <PageHeader compact name="Turnaj" detail="Turnaj na konci sezóny">{null}</PageHeader>
        <div className="page-container space-y-5">
          <div className="card p-8 text-center text-muted text-sm">Turnaj zatím není vypsaný. Přihlášky se otevřou ke konci sezóny.</div>
        </div>
      </>
    );
  }

  const entries = data?.entries ?? [];
  const open = !!data?.registrationOpen;
  const myEntry = !!data?.myEntry;
  const winOn = (amount: number) => kc(amount * 3);

  return (
    <>
      <PageHeader compact name={t.name} detail={`${t.edition}. ročník · ${t.city}`}>{null}</PageHeader>
      <div className="page-container space-y-5">

        {/* Hlavička turnaje + přihláška */}
        <div className="card overflow-hidden">
          <div className="px-4 py-4 text-white" style={{ background: BRAND }}>
            <div className="text-sm font-heading font-bold uppercase tracking-wider text-white/80">{t.sponsor} uvádí</div>
            <div className="text-2xl font-heading font-[800] leading-tight mt-0.5">{t.name}</div>
            <div className="text-sm text-white/90 mt-1">{t.edition}. ročník · {t.venueName}, {t.city}</div>
          </div>

          <div className="px-4 py-4 space-y-3">
            {open ? (
              <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                <span className="font-heading font-bold text-base">Přihlášky {untilLabel(t.registrationDeadline)}</span>
                <span className="text-sm font-heading font-bold" style={{ color: BRAND }}>{remainingLabel(t.registrationDeadline, now)}</span>
              </div>
            ) : (
              <div className="font-heading font-bold text-base">
                {t.status === "registration" || t.status === "closed"
                  ? "Přihlášky jsou uzavřené. Následuje los."
                  : "Přihlášky jsou uzavřené."}
              </div>
            )}

            {myEntry ? (
              <div className="space-y-2">
                <div className="rounded-soft border border-pitch-300 bg-pitch-50 px-3 py-2.5 text-sm">
                  <span className="font-heading font-bold text-pitch-600">✓ Tvůj klub je přihlášený.</span>
                  {/* onDayLabel končí tečkou za měsícem, druhá tečka za větu by byla navíc. */}
                  {t.startsOn && <span className="text-ink/80"> Hrát se začne {onDayLabel(t.startsOn)}</span>}
                </div>
                {open && (
                  <Button variant="ghost" size="md" onClick={() => changeEntry("DELETE")} disabled={busy}>
                    {busy ? "Odhlašuji…" : "Odhlásit klub"}
                  </Button>
                )}
              </div>
            ) : open && data?.eligible ? (
              <Button variant="primary" size="lg" className="w-full sm:w-auto" onClick={() => changeEntry("POST")} disabled={busy}>
                {busy ? "Přihlašuji…" : "Přihlásit klub"}
              </Button>
            ) : open && data?.ineligibleReason ? (
              <div className="text-sm text-muted">{data.ineligibleReason}</div>
            ) : null}

            {error && <div className="text-sm text-card-red">{error}</div>}
          </div>
        </div>

        {/* Propozice */}
        <div>
          <SectionLabel>Propozice</SectionLabel>
          <div className="card mt-2">
            <TermRow icon="📍" title="Dějiště">
              {t.venueName}, {t.city}. Neutrální půda, nikdo nehraje doma.
            </TermRow>
            <TermRow icon="📅" title="Termín">
              {t.startsOn ? `Začíná se ${onDayLabel(t.startsOn)} ` : ""}Hraje se každý den, turnaj potrvá 7 až 12 dní.
            </TermRow>
            <TermRow icon="🏆" title="Formát">
              Formát a přesnou délku upřesníme po uzávěrce podle počtu přihlášených klubů.
            </TermRow>
            <TermRow icon="🔄" title="Kádr">
              Zápas je každý den, takže se vyplatí střídat celý kádr A-týmu.
            </TermRow>
            <TermRow icon="💸" title="Náklady">
              Všechny náklady spojené s turnajem hradí {t.sponsor}.
            </TermRow>
          </div>
        </div>

        {/* Odměny */}
        <div>
          <SectionLabel>Odměny od {t.sponsor}</SectionLabel>
          <div className="card p-4 mt-2 space-y-4">
            <PrizeCell label="Za každý získaný bod" amount={t.pointReward} note={`výhra = ${winOn(t.pointReward)}`} />
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-3 pt-3 border-t border-gray-100">
              <PrizeCell label="Čtvrtfinále" amount={t.prizes.quarterfinal} />
              <PrizeCell label="Semifinále" amount={t.prizes.semifinal} />
              <PrizeCell label="Finalista" amount={t.prizes.finalist} />
              <PrizeCell label="Vítěz" amount={t.prizes.winner} note="a trofej do vitríny" />
            </div>
          </div>
        </div>

        {/* Přihlášené kluby */}
        <div>
          <SectionLabel>Přihlášené kluby · {clubsLabel(entries.length)}</SectionLabel>
          <div className="card mt-2">
            {entries.length === 0 ? (
              <div className="px-4 py-5 text-sm text-muted text-center">Zatím se nikdo nepřihlásil. Buď první.</div>
            ) : entries.map((e) => {
              const color = e.primaryColor || "#9aa18c";
              const mine = e.teamId === teamId;
              return (
                <div key={e.teamId} className={`flex items-center gap-3 px-4 py-2.5 border-b border-gray-50 last:border-b-0 ${mine ? "bg-pitch-50" : ""}`}>
                  {/* Bílé dresy splývají s kartou, proto obrys u světlých barev. */}
                  <span
                    className={`w-3.5 h-3.5 rounded-full shrink-0 border ${bestTextOn(color) === "light" ? "border-transparent" : "border-gray-300"}`}
                    style={{ background: color }}
                    aria-hidden
                  />
                  <Link href={`/tym/${e.teamId}`} className="flex-1 min-w-0 truncate text-base font-bold hover:underline">{e.name}</Link>
                  {e.district && <span className="text-sm text-muted shrink-0">{e.district}</span>}
                </div>
              );
            })}
          </div>
        </div>

      </div>
    </>
  );
}
