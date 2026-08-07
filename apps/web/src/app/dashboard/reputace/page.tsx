"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useTeam } from "@/context/team-context";
import { apiFetch } from "@/lib/api";
import { Spinner, SectionLabel } from "@/components/ui";

interface Unlock {
  kind: string;
  level: number;
  label: string;
  reputation: number;
  matches: number;
  season: number;
  missingReputation: number;
  missingMatches: number;
  missingSeasons: number;
  unlocked: boolean;
}

interface Earns {
  baseSponsorMonthly: number;
  baseSponsorWeekly: number;
  sponsorOfferCount: number;
  sponsorOfferMultiplier: number;
  concessionWeeklyExternal: number;
  attendanceBonusPct: number;
  transferInterestScore: number;
}

interface ReputationData {
  reputation: number;
  tier: { key: string; label: string; note: string; min: number };
  gainFactor: number;
  baseline: number;
  matchesPlayed: number;
  season: number;
  villageCategory: string;
  unlocks: { next: Unlock | null; all: Unlock[] };
  earns: Earns;
  atNextUnlock: (Earns & { reputation: number }) | null;
  history: Array<{
    delta: number;
    rawDelta: number;
    newValue: number;
    source: string;
    description: string;
    gameDate: string;
  }>;
  village: {
    favor: number;
    facilities: Array<{ key: string; label: string; threshold: number }>;
  };
}

const CZK = (n: number) => `${n.toLocaleString("cs")} Kč`;

function barColor(v: number): string {
  if (v >= 70) return "bg-pitch-500";
  if (v >= 55) return "bg-pitch-400";
  if (v >= 40) return "bg-gold-500";
  if (v >= 25) return "bg-orange-400";
  return "bg-card-red";
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("cs", { day: "numeric", month: "numeric" });
  } catch (e) {
    console.warn("format reputation date:", e);
    return "";
  }
}

/** Odkud se dá reputace vzít — čísla odpovídají enginu. */
const SOURCES_UP = [
  { label: "Umístění v lize", detail: "Konec sezóny. Ve čtrnáctičlenné lize dá první místo +5, sedmé +1.", href: "/dashboard/liga" },
  { label: "Postup v poháru", detail: "Osmifinále +1, čtvrtfinále +2, semifinále +3, výhra ve finále +5. Vítěz poháru tak nasbírá +11.", href: "/dashboard/pohar" },
  { label: "Sezónní akce", detail: "Ples, pouť, den obce… podle volby +1 až +10. Každý klub má vlastní sadu.", href: "/dashboard/events" },
  { label: "Podpis hvězdy", detail: "Známé jméno z volných hráčů: +4 až +15 podle zvučnosti.", href: "/dashboard/transfers" },
  { label: "Vyprodaný stadion", detail: "+1 za domácí zápas při 95 % zaplnění a aspoň 120 divácích. Nejvýš 6× za sezónu.", href: "/dashboard/fans" },
  { label: "Série výher", detail: "+2 za 5, 10 a 15 výher v řadě.", href: null },
  { label: "Rodáci v kádru", detail: "+1 měsíčně, když je aspoň 40 % kádru z vlastní obce.", href: "/dashboard/squad" },
  { label: "Přízeň obce", detail: "+1 měsíčně při přízni 75 a výš.", href: "/dashboard/obec" },
];

const SOURCES_DOWN = [
  { label: "Spodní polovina tabulky", detail: "Konec sezóny. Poslední místo ve čtrnácti týmech znamená −5." },
  { label: "Přejmenování klubu", detail: "−3 za vlastní přejmenování i za přejmenování podle sponzora." },
  { label: "Ukončení smlouvy se sponzorem", detail: "−2, když předčasně skončí hlavní sponzor." },
  { label: "Série proher", detail: "−2 za pět porážek v řadě." },
  { label: "Prázdné hlediště", detail: "−1, když na domácí zápas přijde méně než třetina kapacity." },
  { label: "Zapomenutí rodáci", detail: "−1 měsíčně, když je v kádru míň než 10 % místních." },
  { label: "Mračící se obec", detail: "−1 měsíčně při přízni 25 a níž." },
  { label: "Měsíc bez úspěchu", detail: "−1 týdně, když klub měsíc nic nedokázal. Nikdy ale pod tvůj práh." },
];

export default function ReputacePage() {
  const { teamId } = useTeam();
  const [data, setData] = useState<ReputationData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!teamId) return;
    apiFetch<ReputationData>(`/api/teams/${teamId}/reputation`)
      .then((d) => { setData(d); setLoading(false); })
      .catch((e) => { console.error("reputation fetch:", e); setLoading(false); });
  }, [teamId]);

  if (loading) {
    return <div className="page-container flex items-center justify-center min-h-[50vh]"><Spinner /></div>;
  }
  if (!data) {
    return <div className="page-container"><div className="card p-4 text-sm text-muted">Reputaci se nepodařilo načíst.</div></div>;
  }

  const next = data.unlocks.next;
  const nextFacility = next ? data.village.facilities.find((f) =>
    (next.kind === "stadium" && ["pitch", "showers", "parking", "stands"].includes(f.key))) : null;

  return (
    <div className="page-container space-y-5">
      {/* ═══ Aktuální stav ═══ */}
      <div className="card p-4 sm:p-5">
        <SectionLabel>Reputace klubu</SectionLabel>
        <div className="flex items-baseline gap-3 mb-2">
          <span className="font-heading font-bold text-5xl tabular-nums leading-none text-ink">{data.reputation}</span>
          <span className="text-sm text-muted">/ 100</span>
        </div>
        <div className="w-full bg-gray-200 rounded-full h-2.5 mb-3">
          <div className={`h-2.5 rounded-full transition-all ${barColor(data.reputation)}`} style={{ width: `${data.reputation}%` }} />
        </div>
        <div className="text-sm">
          <span className="font-heading font-bold text-ink">{data.tier.label}</span>
          <span className="text-muted"> — {data.tier.note}</span>
        </div>

        <div className="text-sm text-muted mt-3 pt-3 border-t border-gray-100 space-y-1">
          <p>
            Jak moc se o klubu v okrese ví. Ovlivňuje návštěvnost, podporu místních podnikatelů,
            nabídky sponzorů, výnos bufetu i ochotu hráčů k tobě přestoupit — a odemyká vyšší
            úrovně stadionu a vybavení.
          </p>
          <p>
            <strong className="text-ink">Samotná výhra zápasu s ní nehne</strong> — ta zvedá reputaci
            trenéra, což je jiné číslo. Klubová se hýbe hlavně na konci sezóny, v poháru a přes akce.
          </p>
          {data.gainFactor < 1 && (
            <p className="text-ink">
              Jsi vysoko, takže ti zisky rostou pomaleji: z každých 100 bodů se započítá{" "}
              {Math.round(data.gainFactor * 100)}. Ztráty se nekrátí.
            </p>
          )}
        </div>
      </div>

      {/* ═══ Co to odemyká ═══ */}
      <div className="card p-4 sm:p-5">
        <SectionLabel>Co ti to odemkne</SectionLabel>
        {next ? (
          <div className="bg-pitch-50 rounded-lg p-4 mb-3">
            <div className="font-heading font-bold text-base text-ink mb-2">{next.label}</div>
            <div className="space-y-1 text-sm">
              <ConditionRow label="Reputace" need={next.reputation} have={data.reputation} missing={next.missingReputation} />
              <ConditionRow label="Odehrané zápasy" need={next.matches} have={data.matchesPlayed} missing={next.missingMatches} />
              <ConditionRow label="Sezóna" need={next.season} have={data.season} missing={next.missingSeasons} />
            </div>
            {next.missingReputation > 0 && nextFacility && (
              <div className="text-sm text-muted mt-3 pt-3 border-t border-pitch-500/15">
                Nechce se ti čekat? Sprchy, hřiště, parkoviště a tribuny umí spolufinancovat obec —
                to reputaci neřeší, jen přízeň.{" "}
                <Link href="/dashboard/obec" className="text-pitch-600 underline">Obec →</Link>
              </div>
            )}
          </div>
        ) : (
          <div className="text-sm text-pitch-600 font-heading font-bold mb-3">
            Máš odemčené všechno. Reputace teď pracuje jen pro peníze a přestupy.
          </div>
        )}

        <div className="space-y-1">
          {data.unlocks.all.map((u) => (
            <div key={`${u.kind}-${u.level}`} className="flex items-baseline justify-between text-sm py-1 border-b border-gray-50 last:border-b-0">
              <span className={u.unlocked ? "text-muted" : "text-ink"}>
                {u.unlocked ? "✓ " : ""}{u.label}
              </span>
              <span className="text-muted tabular-nums">
                reputace {u.reputation} · {u.matches} zápasů · sezóna {u.season}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* ═══ Co to vydělává ═══ */}
      <div className="card p-4 sm:p-5">
        <SectionLabel>Co ti to vydělává</SectionLabel>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b-2 border-gray-200">
                <th className="text-left py-2 pr-2 font-heading uppercase text-xs text-muted tracking-widest">Co</th>
                <th className="text-right py-2 px-2 font-heading uppercase text-xs text-muted tracking-widest">
                  Teď ({data.reputation})
                </th>
                {data.atNextUnlock && (
                  <th className="text-right py-2 pl-2 font-heading uppercase text-xs text-pitch-600 tracking-widest">
                    Při {data.atNextUnlock.reputation}
                  </th>
                )}
              </tr>
            </thead>
            <tbody>
              <EarnRow label="Podpora místních podnikatelů" now={CZK(data.earns.baseSponsorMonthly) + "/měs"} next={data.atNextUnlock ? CZK(data.atNextUnlock.baseSponsorMonthly) + "/měs" : null} />
              <EarnRow label="Nabídek sponzorů" now={String(data.earns.sponsorOfferCount)} next={data.atNextUnlock ? String(data.atNextUnlock.sponsorOfferCount) : null} />
              <EarnRow label="Násobič částky od sponzorů" now={`${data.earns.sponsorOfferMultiplier.toFixed(2).replace(".", ",")}×`} next={data.atNextUnlock ? `${data.atNextUnlock.sponsorOfferMultiplier.toFixed(2).replace(".", ",")}×` : null} />
              <EarnRow label="Bonus k návštěvnosti" now={`+${data.earns.attendanceBonusPct} %`} next={data.atNextUnlock ? `+${data.atNextUnlock.attendanceBonusPct} %` : null} />
              <EarnRow label="Pronájem bufetu (externí)" now={CZK(data.earns.concessionWeeklyExternal) + "/týden"} next={data.atNextUnlock ? CZK(data.atNextUnlock.concessionWeeklyExternal) + "/týden" : null} />
              <EarnRow label="Zájem hráčů o přestup k tobě" now={`${data.earns.transferInterestScore > 0 ? "+" : ""}${data.earns.transferInterestScore} bodů`} next={data.atNextUnlock ? `${data.atNextUnlock.transferInterestScore > 0 ? "+" : ""}${data.atNextUnlock.transferInterestScore} bodů` : null} />
            </tbody>
          </table>
        </div>
      </div>

      {/* ═══ Jak ji zvednout ═══ */}
      <div className="card p-4 sm:p-5">
        <SectionLabel>Jak ji zvednout</SectionLabel>
        <div className="space-y-2">
          {SOURCES_UP.map((s) => (
            <div key={s.label} className="text-sm py-1.5 border-b border-gray-50 last:border-b-0">
              <div className="font-heading font-bold text-ink">
                {s.href ? (
                  <Link href={s.href} className="hover:text-pitch-600 underline decoration-pitch-500/20">{s.label}</Link>
                ) : s.label}
              </div>
              <div className="text-muted">{s.detail}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ═══ Co ji sráží ═══ */}
      <div className="card p-4 sm:p-5">
        <SectionLabel>Co ji sráží</SectionLabel>
        <div className="space-y-2">
          {SOURCES_DOWN.map((s) => (
            <div key={s.label} className="text-sm py-1.5 border-b border-gray-50 last:border-b-0">
              <div className="font-heading font-bold text-ink">{s.label}</div>
              <div className="text-muted">{s.detail}</div>
            </div>
          ))}
        </div>
        <div className="text-sm text-muted mt-3 pt-3 border-t border-gray-100">
          Útlum tě nikdy nestlačí pod <span className="tabular-nums font-heading font-bold text-ink">{data.baseline}</span>{" "}
          — to je práh pro velikost tvé obce.
        </div>
      </div>

      {/* ═══ Odkud se vzala ═══ */}
      <div className="card p-4 sm:p-5">
        <SectionLabel>
          {data.history.length > 0 ? `Odkud se vzala (posledních ${data.history.length})` : "Odkud se vzala"}
        </SectionLabel>
        {data.history.length === 0 ? (
          <div className="py-4 text-sm text-muted text-center">
            Zatím žádná změna. Historie se začne plnit, jakmile se reputace pohne.
          </div>
        ) : (
          <div className="space-y-2">
            {data.history.map((h, i) => (
              <div key={i} className="flex items-start gap-3 py-1.5 border-b border-gray-50 last:border-b-0">
                <div className={`shrink-0 font-heading font-bold text-sm tabular-nums w-10 text-right ${
                  h.delta > 0 ? "text-pitch-500" : h.delta < 0 ? "text-card-red" : "text-muted"
                }`}>
                  {h.delta > 0 ? "+" : ""}{h.delta}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm text-ink">{h.description}</div>
                  {h.delta !== h.rawDelta && (
                    <div className="text-sm text-muted">
                      Ze {h.rawDelta > 0 ? "+" : ""}{h.rawDelta} se započítalo {h.delta > 0 ? "+" : ""}{h.delta} — jsi vysoko.
                    </div>
                  )}
                </div>
                <div className="shrink-0 text-right">
                  <div className="text-sm text-muted tabular-nums">{formatDate(h.gameDate)}</div>
                  <div className="text-sm text-muted tabular-nums">→ {h.newValue}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function ConditionRow({ label, need, have, missing }: { label: string; need: number; have: number; missing: number }) {
  return (
    <div className="flex items-baseline justify-between">
      <span className={missing > 0 ? "text-ink" : "text-muted"}>
        {missing > 0 ? "" : "✓ "}{label}
      </span>
      <span className="tabular-nums">
        <span className={missing > 0 ? "text-card-red font-heading font-bold" : "text-muted"}>{have}</span>
        <span className="text-muted"> / {need}</span>
        {missing > 0 && <span className="text-card-red"> (chybí {missing})</span>}
      </span>
    </div>
  );
}

function EarnRow({ label, now, next }: { label: string; now: string; next: string | null }) {
  return (
    <tr className="border-b border-gray-50">
      <td className="py-2 pr-2 text-ink">{label}</td>
      <td className="py-2 px-2 text-right tabular-nums font-heading font-bold text-ink whitespace-nowrap">{now}</td>
      {next !== null && (
        <td className="py-2 pl-2 text-right tabular-nums text-pitch-600 whitespace-nowrap">{next}</td>
      )}
    </tr>
  );
}
