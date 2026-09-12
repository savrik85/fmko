"use client";

/**
 * Widgety k partám fanoušků.
 *
 * Všechny čtou jedno `/fans/groups`, takže přidání dalšího nestojí další
 * volání. Každý ukazuje JEDNU věc, na kterou se hráč dívá jinak: náladu part,
 * rivality, koho mají rádi, co po tobě chtějí, co je bordel stál a co je
 * rozbité. Podrobnosti a tlačítka jsou na stránce fanoušků, tohle je pohled.
 */

import Link from "next/link";
import type { WidgetProps } from "../types";

const KIND_IKONA: Record<string, string> = {
  kotel: "🔥", stamgasti: "🍺", rodiny: "👨‍👩‍👧", pametnici: "🎩", parta_z_okoli: "🚌",
};

/** Pruh 0–100. Barva podle toho, jestli je vyšší číslo dobře, nebo špatně. */
function Pruh({ value, dobre }: { value: number; dobre: boolean }) {
  const v = Math.max(0, Math.min(100, value));
  const barva = dobre
    ? (v >= 60 ? "bg-pitch-500" : v >= 35 ? "bg-amber-500" : "bg-card-red")
    : (v >= 60 ? "bg-card-red" : v >= 35 ? "bg-amber-500" : "bg-pitch-500");
  return (
    <div className="h-1.5 rounded-full bg-gray-100 overflow-hidden">
      <div className={`h-full rounded-full ${barva}`} style={{ width: `${v}%` }} />
    </div>
  );
}

function Prazdno({ text }: { text: string }) {
  return <div className="text-sm text-muted text-center py-4">{text}</div>;
}

/**
 * Drobný řádek nad obsahem. Nadpis widgetu kreslí rámeček (`WidgetFrame`),
 * takže vlastní `h3` by visel dvakrát pod sebou.
 */
function Nadradek({ vpravo }: { vpravo?: React.ReactNode }) {
  if (!vpravo) return null;
  return <div className="flex justify-end mb-2 text-xs">{vpravo}</div>;
}

/** Party a jejich nálada. Základní pohled: kdo je na stadionu a jak mu je. */
export function FanGroupsMoodWidget({ data }: WidgetProps) {
  const d = data.fanGroups.data;
  if (!d || d.groups.length === 0) return <Prazdno text="Party fanoušků se zatím nezaložily." />;

  const lidi = d.groups.reduce((s, g) => s + g.size, 0);
  return (
    <div>
      <Nadradek vpravo={<span className="text-xs text-muted">{lidi} lidí</span>} />
      <div className="space-y-3">
        {d.groups.map((g) => (
          <div key={g.id}>
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-sm font-heading font-bold text-ink truncate">
                {KIND_IKONA[g.kind] ?? "👥"} {g.name}
              </span>
              <span className="text-xs text-muted shrink-0">
                {g.sectorClosed ? "🔒 zavřeno" : `${g.size} lidí`}
              </span>
            </div>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-xs text-muted w-14 shrink-0">nálada</span>
              <div className="flex-1"><Pruh value={g.mood} dobre /></div>
              <span className="text-xs text-ink-light w-24 text-right truncate">{g.moodWord}</span>
            </div>
            {g.heat > 0 && (
              <div className="flex items-center gap-2 mt-1">
                <span className="text-xs text-muted w-14 shrink-0">zloba</span>
                <div className="flex-1"><Pruh value={g.heat} dobre={false} /></div>
                <span className="text-xs text-ink-light w-24 text-right truncate">{g.heatWord}</span>
              </div>
            )}
          </div>
        ))}
      </div>
      <Link href="/dashboard/fans" className="block mt-3 text-xs text-pitch-600 font-semibold hover:underline text-center">
        Jednání s vůdci →
      </Link>
    </div>
  );
}

/** Tvrdé jádro: kolik jich doopravdy dělá bordel a jezdí ven. */
export function FanCoreWidget({ data }: WidgetProps) {
  const d = data.fanGroups.data;
  const sJadrem = (d?.groups ?? []).filter((g) => (g.core ?? 0) > 0);
  if (!d || sJadrem.length === 0) {
    return <Prazdno text="Žádná parta nemá tvrdé jádro. Na výjezdy nikdo nejezdí." />;
  }
  const celkem = sJadrem.reduce((s, g) => s + (g.core ?? 0), 0);
  return (
    <div>
      <Nadradek vpravo={<span className="text-xs text-muted">{celkem} lidí</span>} />
      <div className="space-y-2">
        {sJadrem.map((g) => (
          <div key={g.id} className="flex items-baseline justify-between gap-2">
            <span className="text-sm text-ink truncate">{KIND_IKONA[g.kind] ?? "👥"} {g.name}</span>
            <span className="text-sm font-heading font-bold tabular-nums shrink-0">
              {g.core} <span className="text-xs font-normal text-muted">z {g.size}</span>
            </span>
          </div>
        ))}
      </div>
      <p className="text-xs text-muted mt-3 leading-snug">
        Jádro dělá výtržnosti a jezdí na výjezdy. Roste, když se partě vychází vstříc, a mizí po
        zavřených sektorech a rvačkách.
      </p>
    </div>
  );
}

/** Rivality mezi tábory. Tohle je paměť fanoušků, ne vztah trenérů. */
export function FanRivalsWidget({ data }: WidgetProps) {
  const d = data.fanGroups.data;
  if (!d || d.rivals.length === 0) return <Prazdno text="S nikým si to zatím nerozdali." />;
  return (
    <div>
      <div className="space-y-2.5">
        {d.rivals.map((r) => (
          <div key={r.teamId}>
            <div className="flex items-baseline justify-between gap-2">
              <Link href={`/dashboard/team/${r.teamId}`} className="text-sm font-heading font-bold text-ink hover:underline truncate">
                {r.name}
              </Link>
              <span className="text-xs text-muted shrink-0">
                {r.word}{r.fights > 0 ? ` · ${r.fights}× rvačka` : ""}
              </span>
            </div>
            <div className="mt-1"><Pruh value={r.heat} dobre={false} /></div>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Koho mají rádi a koho ne. */
export function FanFavouritesWidget({ data }: WidgetProps) {
  const d = data.fanGroups.data;
  if (!d || d.favourites.length === 0) {
    return <Prazdno text="Party si zatím nikoho nevybraly." />;
  }
  const milacci = d.favourites.filter((f) => f.stance === "oblibenec");
  const otloukanci = d.favourites.filter((f) => f.stance === "otloukanek");

  return (
    <div>
      <div className="space-y-3">
        {milacci.length > 0 && (
          <div>
      <div className="text-xs font-semibold text-pitch-600 mb-1">❤️ Berou je za svoje</div>
            {milacci.map((f) => (
              <div key={`${f.groupKind}-${f.playerId}`} className="py-1">
                <Link href={`/dashboard/player/${f.playerId}`} className="text-sm font-heading font-bold text-ink hover:underline">
                  {f.playerName}
                </Link>
                <span className="text-xs text-muted"> · {f.groupName}</span>
                <p className="text-xs text-ink-light leading-snug">{f.duvod}</p>
              </div>
            ))}
          </div>
        )}
        {otloukanci.length > 0 && (
          <div>
      <div className="text-xs font-semibold text-card-red mb-1">😤 Nemůžou ho vystát</div>
            {otloukanci.map((f) => (
              <div key={`${f.groupKind}-${f.playerId}`} className="py-1">
                <Link href={`/dashboard/player/${f.playerId}`} className="text-sm font-heading font-bold text-ink hover:underline">
                  {f.playerName}
                </Link>
                <span className="text-xs text-muted"> · {f.groupName}</span>
                <p className="text-xs text-ink-light leading-snug">{f.duvod}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/** Kampaně „X ven". Když tohle svítí, je zle. */
export function FanCampaignsWidget({ data }: WidgetProps) {
  const d = data.fanGroups.data;
  if (!d || d.campaigns.length === 0) {
    return <Prazdno text="Nikdo po nikom nechce hlavu. Zatím." />;
  }
  return (
    <div>
      <div className="space-y-3">
        {d.campaigns.map((k) => {
          const pct = Math.min(100, Math.round((k.podpisy / Math.max(1, k.prah)) * 100));
          const splneno = k.status === "splnena";
          return (
            <div key={k.id}>
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-sm font-heading font-bold text-ink truncate">
                  {k.kind === "trener_ven" ? "📣 " : "🚫 "}{k.target} ven
                </span>
                <span className={`text-xs shrink-0 ${splneno ? "text-card-red font-semibold" : "text-muted"}`}>
                  {k.podpisy} / {k.prah}
                </span>
              </div>
              <div className="mt-1"><Pruh value={pct} dobre={false} /></div>
              <p className="text-xs text-ink-light leading-snug mt-1">
                {splneno ? "Podpisovka je hotová a předaná." : k.duvod}
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** Kolik tě letos stál bordel a co je rozbité. */
export function FanTroubleWidget({ data }: WidgetProps) {
  const d = data.fanGroups.data;
  if (!d) return <Prazdno text="Zatím žádný bordel." />;

  const pokuty = d.recentIncidents.reduce((s, i) => s + i.fine, 0);
  const opravy = d.damage.reduce((s, x) => s + x.cost, 0);
  if (d.recentIncidents.length === 0 && d.damage.length === 0) {
    return <Prazdno text="Na tribuně je klid. Nic se nerozbilo a nic se neplatilo." />;
  }

  return (
    <div>
      <Nadradek
        vpravo={<span className="text-xs text-muted">ochranka: {d.securityLabel}</span>}
      />
      <div className="grid grid-cols-2 gap-3 mb-3">
        <div>
          <div className="text-xs text-muted">Pokuty</div>
          <div className="font-heading font-bold text-lg tabular-nums text-card-red">
            {pokuty.toLocaleString("cs-CZ")} Kč
          </div>
        </div>
        <div>
          <div className="text-xs text-muted">Čeká na opravu</div>
          <div className={`font-heading font-bold text-lg tabular-nums ${opravy > 0 ? "text-card-red" : "text-ink"}`}>
            {opravy.toLocaleString("cs-CZ")} Kč
          </div>
        </div>
      </div>

      {d.damage.length > 0 && (
        <div className="space-y-1 mb-3">
          {d.damage.map((x) => (
            <div key={x.id} className="flex items-baseline justify-between gap-2 text-sm">
              <span className="text-ink truncate">🔧 {x.label}</span>
              <span className="text-muted tabular-nums shrink-0">{x.cost.toLocaleString("cs-CZ")} Kč</span>
            </div>
          ))}
        </div>
      )}

      {d.recentIncidents.slice(0, 3).map((i) => (
        <p key={i.id} className="text-xs text-ink-light leading-snug py-0.5">
          🚨 {i.text}
        </p>
      ))}

      <Link href="/dashboard/fans" className="block mt-3 text-xs text-pitch-600 font-semibold hover:underline text-center">
        {d.damage.length > 0 ? "Opravit a řešit →" : "Bezpečnost a historie →"}
      </Link>
    </div>
  );
}
