"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useTeam } from "@/context/team-context";
import { apiFetch } from "@/lib/api";
import { Spinner, SectionLabel, ListCard, ListRow, ListEmpty, RowValue, DeltaMark } from "@/components/ui";

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
  {
    label: "Umístění v lize",
    detail: "Rozdá se jednou za sezónu podle konečné tabulky. Ve čtrnáctičlenné lize dostane vítěz +5, druhý +4, šesté místo +1. Od sedmého níž už nic.",
    href: "/liga",
  },
  {
    label: "Postup v poháru",
    detail: "Za každé vyhrané kolo od osmifinále výš: osmifinále +1, čtvrtfinále +2, semifinále +3, výhra ve finále +5. Sčítá se, takže cesta až k poháru dá dohromady +11, nejvíc ze všech zdrojů.",
    href: "/pohar",
  },
  {
    label: "Sezónní akce",
    detail: "Ples, pouť, den obce, zabijačka… Objevují se během sezóny na stránce Události a čekají na tvoje rozhodnutí. Vstřícná volba, postavit stánek, uspořádat ukázkový trénink, dá +1 až +10.",
    href: "/udalosti",
  },
  {
    label: "Podpis hvězdy",
    detail: "Mezi volnými hráči se občas objeví někdo se zvučným jménem, bývalý ligista, lokální legenda. Za jeho podpis dostaneš +4 až +15 podle toho, jak je známý.",
    href: "/prestupy",
  },
  {
    label: "Vyprodaný stadion",
    detail: "Když se stadion zaplní aspoň z 95 % a přijde nejméně 120 lidí, dostaneš +1. Nejvýš šestkrát za sezónu.",
    href: "/fanousci",
  },
  {
    label: "Série výher",
    detail: "+2 za pátou výhru v řadě, pak znovu za desátou a patnáctou. Remíza sérii ukončí stejně jako prohra.",
    href: "/liga",
  },
  {
    label: "Rodáci v kádru",
    detail: "Rodák je hráč, který bydlí ve stejné obci jako klub, poznáš ho podle bydliště v kádru. Když je jich aspoň 40 % kádru, lidi to ocení a klub dostane +1 každý měsíc.",
    href: "/kadr",
  },
  {
    label: "Přízeň obce",
    detail: "Přízeň (0–100) je vztah klubu s radnicí. Roste, když plníš petice od občanů, bereš brigády a chodíš na setkání se zastupiteli. Při přízni 75 a výš dostaneš +1 měsíčně.",
    href: "/obec",
  },
];

const SOURCES_DOWN = [
  {
    label: "Spodní polovina tabulky",
    detail: "Stejný výpočet jako u odměny za umístění, jen obráceně. Ve čtrnáctičlenné lize začíná ztráta od osmého místa a poslední tým přijde o 5 bodů.",
  },
  {
    label: "Špatná volba v sezónní akci",
    detail: "Když obci odmítneš pomoct nebo se na akci vykašleš, lidi si toho všimnou: −2 až −5. U každé volby vidíš dopředu, co udělá.",
  },
  {
    label: "Přejmenování klubu",
    detail: "−3, ať už si klub přejmenuješ sám, nebo kvůli hlavnímu sponzorovi. Lidi mají rádi jméno, které znají.",
  },
  {
    label: "Ukončení smlouvy se sponzorem",
    detail: "−2, když předčasně rozvážeš smlouvu s hlavním sponzorem. Klub se vrátí k původnímu názvu a působí to nestabilně.",
  },
  {
    label: "Série proher",
    detail: "−2 za pátou porážku v řadě.",
  },
  {
    label: "Prázdné hlediště",
    detail: "−1, když na domácí zápas přijde nejvýš třetina kapacity. Týká se stadionů od dvou set míst a začíná se počítat po pěti domácích zápasech v sezóně.",
  },
  {
    label: "Zapomenutí rodáci",
    detail: "Opak rodáků v kádru: když jsou z obce míň než desetina hráčů, je to −1 měsíčně. Lidi pak klub berou jako cizí.",
  },
  {
    label: "Mračící se obec",
    detail: "Když přízeň obce spadne na 25 a níž, radnice ti přestane fandit: −1 měsíčně. Nejčastěji za to může ignorování petic a brigád.",
  },
  {
    label: "Měsíc bez úspěchu",
    detail: "Když klub celý měsíc nezíská ani bod reputace, začne se na něj zapomínat: −1 týdně. Stačí ale jediný zisk a útlum se zastaví.",
  },
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
      {/* ═══ Stav + stupnice s milníky ═══ */}
      <div className="card p-4 sm:p-5">
        <SectionLabel>Reputace klubu</SectionLabel>

        <div className="flex items-end justify-between gap-4 mb-1">
          <div className="flex items-baseline gap-2">
            <span className="font-heading font-bold text-5xl sm:text-6xl tabular-nums leading-none text-ink">
              {data.reputation}
            </span>
            <span className="text-sm text-muted">/ 100</span>
          </div>
          <div className="text-right">
            <div className="font-heading font-bold text-base text-ink leading-tight">{data.tier.label}</div>
            {data.gainFactor < 1 && (
              <div className="text-sm text-gold-600 tabular-nums">
                zisky × {data.gainFactor.toString().replace(".", ",")}
              </div>
            )}
          </div>
        </div>
        <div className="text-sm text-muted mb-5">{data.tier.note}</div>

        <ReputationScale reputation={data.reputation} unlocks={data.unlocks.all} baseline={data.baseline} />

        <div className="text-sm text-muted mt-5 pt-4 border-t border-gray-100 space-y-1.5">
          <p>
            Jak moc se o klubu v okrese ví. Ovlivňuje návštěvnost, podporu místních podnikatelů,
            nabídky sponzorů, výnos bufetu i ochotu hráčů k tobě přestoupit, a odemyká vyšší
            úrovně stadionu a vybavení.
          </p>
          <p>
            <strong className="text-ink">Samotná výhra zápasu s ní nehne</strong>, ta zvedá reputaci
            trenéra, což je jiné číslo. Klubová se hýbe hlavně na konci sezóny, v poháru a přes akce.
          </p>
          {data.gainFactor < 1 && (
            <p>
              Jsi vysoko, takže se ti zisky krátí na{" "}
              <strong className="text-ink">{Math.round(data.gainFactor * 100)} %</strong>. Ztráty se nekrátí.
            </p>
          )}
        </div>
      </div>

      {/* ═══ Co to odemyká ═══ */}
      <div className="card p-4 sm:p-5">
        <SectionLabel>Co ti to odemkne</SectionLabel>

        {next ? (
          <div className="rounded-soft p-4 mb-4 bg-pitch-50 border-l-2 border-pitch-500">
            <div className="flex items-baseline justify-between gap-3 mb-3">
              <span className="font-heading font-bold text-base text-ink">{next.label}</span>
              <span className="text-sm text-muted whitespace-nowrap">na řadě</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <ConditionTile label="Reputace" need={next.reputation} have={data.reputation} missing={next.missingReputation} />
              <ConditionTile label="Odehrané zápasy" need={next.matches} have={data.matchesPlayed} missing={next.missingMatches} />
              <ConditionTile label="Sezóna" need={next.season} have={data.season} missing={next.missingSeasons} />
            </div>
            {next.missingReputation > 0 && nextFacility && (
              <div className="text-sm text-ink-light mt-3 pt-3 border-t border-pitch-500/15">
                Nechce se ti čekat? Sprchy, hřiště, parkoviště a tribuny umí spolufinancovat obec -
                tam reputace nerozhoduje, jen přízeň.{" "}
                <Link href="/obec" className="text-pitch-600 underline whitespace-nowrap">Obec →</Link>
              </div>
            )}
          </div>
        ) : (
          <div className="rounded-soft p-4 mb-4 bg-pitch-50 border-l-2 border-pitch-500 text-sm font-heading font-bold text-pitch-600">
            Máš odemčené všechno. Reputace teď pracuje jen pro peníze a přestupy.
          </div>
        )}

        <div className="-mx-4 sm:-mx-5 -mb-4 sm:-mb-5 border-t border-line">
          {data.unlocks.all.map((u) => (
            <div key={`${u.kind}-${u.level}`} className={u.unlocked ? "opacity-60" : ""}>
              <ListRow dense
                leading={<span className="text-base leading-none" aria-hidden="true">{u.unlocked ? "✓" : "🔒"}</span>}
                title={u.label}
                trailing={<span className="text-meta text-muted tabular-nums text-right">rep. {u.reputation} · {u.matches} záp. · {u.season}. sez.</span>} />
            </div>
          ))}
        </div>
      </div>

      {/* ═══ Co to vydělává ═══ */}
      <div className="card p-4 sm:p-5">
        <SectionLabel>Co ti to vydělává</SectionLabel>
        {data.atNextUnlock && (
          <div className="text-sm text-muted mb-3">
            Vpravo je stav při reputaci{" "}
            <strong className="text-pitch-600 tabular-nums">{data.atNextUnlock.reputation}</strong> -
            to je práh dalšího zámku.
          </div>
        )}
        <div className="-mx-4 sm:-mx-5 -mb-4 sm:-mb-5 border-t border-line">
          <EarnRow icon="🏪" label="Podpora místních podnikatelů" note="vyplácí se týdně, zaměstnanci ji můžou zvýšit"
            now={CZK(data.earns.baseSponsorMonthly) + "/měs"}
            next={data.atNextUnlock ? CZK(data.atNextUnlock.baseSponsorMonthly) + "/měs" : null} />
          <EarnRow icon="💼" label="Nabídek sponzorů"
            now={String(data.earns.sponsorOfferCount)}
            next={data.atNextUnlock ? String(data.atNextUnlock.sponsorOfferCount) : null} />
          <EarnRow icon="📈" label="Násobič částky od sponzorů"
            now={`${data.earns.sponsorOfferMultiplier.toFixed(2).replace(".", ",")}×`}
            next={data.atNextUnlock ? `${data.atNextUnlock.sponsorOfferMultiplier.toFixed(2).replace(".", ",")}×` : null} />
          <EarnRow icon="📣" label="Bonus k návštěvnosti"
            now={`+${data.earns.attendanceBonusPct} %`}
            next={data.atNextUnlock ? `+${data.atNextUnlock.attendanceBonusPct} %` : null} />
          <EarnRow icon="🍺" label="Pronájem bufetu" note="jen v režimu externího provozovatele"
            now={CZK(data.earns.concessionWeeklyExternal) + "/týden"}
            next={data.atNextUnlock ? CZK(data.atNextUnlock.concessionWeeklyExternal) + "/týden" : null} />
          <EarnRow icon="🤝" label="Zájem hráčů o přestup k tobě"
            now={`${data.earns.transferInterestScore > 0 ? "+" : ""}${data.earns.transferInterestScore} bodů`}
            next={data.atNextUnlock ? `${data.atNextUnlock.transferInterestScore > 0 ? "+" : ""}${data.atNextUnlock.transferInterestScore} bodů` : null} />
        </div>
      </div>

      {/* ═══ Co ji hýbe ═══ */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div className="card p-4 sm:p-5">
          <SectionLabel>Jak ji zvednout</SectionLabel>
          <p className="text-sm text-muted mb-3">
            Většina zdrojů se vyhodnotí sama, po zápase, na konci sezóny nebo jednou měsíčně.
            Ovlivnit můžeš hlavně výsledky, volby v akcích a vztah s obcí.
          </p>
          <div className="-mx-4 sm:-mx-5 -mb-4 sm:-mb-5 border-t border-line">
            {SOURCES_UP.map((s) => (
              <SourceRow key={s.label} label={s.label} detail={s.detail} href={s.href} positive />
            ))}
          </div>
        </div>

        <div className="card p-4 sm:p-5">
          <SectionLabel>Co ji sráží</SectionLabel>
          <p className="text-sm text-muted mb-3">
            Ztráty se na rozdíl od zisků nekrátí, spadnout jde vždycky plnou rychlostí.
          </p>
          <div className="-mx-4 sm:-mx-5 border-y border-line">
            {SOURCES_DOWN.map((s) => (
              <SourceRow key={s.label} label={s.label} detail={s.detail} href={null} positive={false} />
            ))}
          </div>
          <div className="text-sm text-muted mt-3">
            Útlum tě nikdy nestlačí pod{" "}
            <span className="tabular-nums font-heading font-bold text-ink">{data.baseline}</span> -
            to je práh pro velikost tvé obce.
          </div>
        </div>
      </div>

      {/* ═══ Historie ═══ */}
      <ListCard title="Odkud se vzala" count={data.history.length > 0 ? `posledních ${data.history.length}` : undefined}>
        {data.history.length === 0 && (
          <ListEmpty icon="⭐">Zatím žádná změna. Historie se začne plnit, jakmile se reputace pohne.</ListEmpty>
        )}
        {data.history.map((h, i) => (
          <ListRow key={i}
            leading={<DeltaMark value={h.delta} />}
            // Popis bývá celá věta: patří do odstavce, v titulku by se ořízl.
            title={formatDate(h.gameDate)}
            detail={<>{h.description}{h.delta !== h.rawDelta && <span className="text-muted"> Ze {h.rawDelta > 0 ? "+" : ""}{h.rawDelta} se započítalo {h.delta > 0 ? "+" : ""}{h.delta}, jsi vysoko.</span>}</>}
            trailing={<RowValue sub="reputace">{h.newValue}</RowValue>} />
        ))}
      </ListCard>
    </div>
  );
}

/**
 * Stupnice 0–100 s vyznačenými prahy zámků a aktuální pozicí.
 * Ukazuje na jeden pohled, kde klub stojí a co má nejblíž.
 */
function ReputationScale({
  reputation,
  unlocks,
  baseline,
}: {
  reputation: number;
  unlocks: Unlock[];
  baseline: number;
}) {
  // Několik zámků sdílí práh (vybavení 60 / stadion 70 apod.) — na stupnici stačí jeden bod.
  const marks = Array.from(new Set(unlocks.map((u) => u.reputation)))
    .sort((a, b) => a - b)
    .map((rep) => ({
      rep,
      reached: reputation >= rep,
      labels: unlocks.filter((u) => u.reputation === rep).map((u) => u.label),
    }));

  return (
    <div>
      <div className="relative h-3 rounded-full bg-gray-200 overflow-visible">
        <div
          className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-pitch-400 to-pitch-500 transition-all"
          style={{ width: `${Math.max(2, reputation)}%` }}
        />
        {/* Práh útlumu — pod něj reputace sama neklesne. */}
        <div className="absolute inset-y-0 border-l border-dashed border-gray-400/60" style={{ left: `${baseline}%` }} />
        {marks.map((m) => (
          <div
            key={m.rep}
            className={`absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-3 h-3 rounded-full border-2 ${
              m.reached ? "bg-pitch-600 border-white" : "bg-white border-gray-300"
            }`}
            style={{ left: `${m.rep}%` }}
            title={m.labels.join(" · ")}
          />
        ))}
      </div>

      <div className="relative h-5 mt-1">
        {marks.map((m) => (
          <span
            key={m.rep}
            className={`absolute -translate-x-1/2 text-xs tabular-nums ${m.reached ? "text-pitch-600 font-heading font-bold" : "text-muted"}`}
            style={{ left: `${m.rep}%` }}
          >
            {m.rep}
          </span>
        ))}
      </div>

      <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted">
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-full bg-pitch-600 border-2 border-white ring-1 ring-gray-300 inline-block" />
          odemčeno
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-full bg-white border-2 border-gray-300 inline-block" />
          zamčeno
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-0 h-3.5 border-l border-dashed border-gray-500 inline-block" />
          práh útlumu ({baseline})
        </span>
      </div>
    </div>
  );
}

function ConditionTile({ label, need, have, missing }: { label: string; need: number; have: number; missing: number }) {
  const done = missing === 0;
  return (
    <div className={`rounded-soft p-2.5 ${done ? "bg-white/60" : "bg-white"}`}>
      <div className="text-sm text-muted mb-0.5">{done ? "✓ " : ""}{label}</div>
      <div className="flex items-baseline gap-1.5">
        <span className={`font-heading font-bold text-xl tabular-nums ${done ? "text-pitch-600" : "text-card-red"}`}>
          {have}
        </span>
        <span className="text-sm text-muted tabular-nums">/ {need}</span>
      </div>
      {!done && <div className="text-sm text-card-red tabular-nums">chybí {missing}</div>}
    </div>
  );
}

function EarnRow({ icon, label, now, next, note }: { icon: string; label: string; now: string; next: string | null; note?: string }) {
  return (
    <ListRow dense
      leading={<span className="text-base leading-none" aria-hidden="true">{icon}</span>}
      title={<span className="font-normal">{label}</span>}
      detail={note || undefined}
      trailing={
        <span className="flex items-baseline gap-3 tabular-nums whitespace-nowrap">
          <span className="text-body font-bold text-ink">{now}</span>
          {next !== null && <span className="text-meta text-pitch-600 w-24 text-right">→ {next}</span>}
        </span>
      } />
  );
}

function SourceRow({
  label,
  detail,
  href,
  positive,
}: {
  label: string;
  detail: string;
  href: string | null;
  positive: boolean;
}) {
  // Proužek nese směr: zelený zdroj reputaci zvedá, červený ji sráží.
  return (
    <ListRow dense href={href ?? undefined} tone={positive ? "new" : "danger"}
      title={label}
      detail={detail} />
  );
}
