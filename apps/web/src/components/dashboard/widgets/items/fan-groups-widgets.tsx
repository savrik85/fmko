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
import { ListRow, RowGroup, ProgressBar, type ProgressTone } from "@/components/ui";
import type { FanGroupsData, WidgetProps } from "../types";
import { formatKc } from "@/lib/format";

const KIND_IKONA: Record<string, string> = {
  kotel: "🔥", stamgasti: "🍺", rodiny: "👨‍👩‍👧", pametnici: "🎩", parta_z_okoli: "🚌",
};

/** Pruh 0–100. Barva podle toho, jestli je vyšší číslo dobře, nebo špatně. */
function Pruh({ value, dobre }: { value: number; dobre: boolean }) {
  const v = Math.max(0, Math.min(100, value));
  const tone: ProgressTone = dobre
    ? (v >= 60 ? "ok" : v >= 35 ? "warn" : "danger")
    : (v >= 60 ? "danger" : v >= 35 ? "warn" : "ok");
  // Span místo div: pruh stojí i uvnitř řádku seznamu (ListRow), kde je obsah ve <span>.
  return (
    <ProgressBar value={v} tone={tone} size="sm" label="Hodnota" />
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
      <div className="-mx-4 sm:-mx-5">
        {d.groups.map((g) => (
          <ListRow key={g.id} dense
            leading={<span className="text-base leading-none" aria-hidden="true">{KIND_IKONA[g.kind] ?? "👥"}</span>}
            title={g.name}
            trailing={
              <span className="text-meta text-muted">
                {g.sectorClosed ? "🔒 zavřeno" : `${g.size} lidí`}
              </span>
            }
            detail={
              <>
                <span className="flex items-center gap-2">
                  <span className="text-muted w-14 shrink-0">nálada</span>
                  <span className="flex-1"><Pruh value={g.mood} dobre /></span>
                  <span className="w-24 text-right truncate">{g.moodWord}</span>
                </span>
                {g.heat > 0 && (
                  <span className="flex items-center gap-2 mt-1">
                    <span className="text-muted w-14 shrink-0">zloba</span>
                    <span className="flex-1"><Pruh value={g.heat} dobre={false} /></span>
                    <span className="w-24 text-right truncate">{g.heatWord}</span>
                  </span>
                )}
              </>
            } />
        ))}
      </div>
      <Link href="/fanousci" className="block mt-3 text-xs text-pitch-600 font-semibold hover:underline text-center">
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
      <div className="-mx-4 sm:-mx-5">
        {sJadrem.map((g) => (
          <ListRow key={g.id} dense
            leading={<span className="text-base leading-none" aria-hidden="true">{KIND_IKONA[g.kind] ?? "👥"}</span>}
            title={g.name}
            trailing={
              <span className="text-body font-bold text-ink tabular-nums">
                {g.core} <span className="text-meta font-normal text-muted">z {g.size}</span>
              </span>
            } />
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
      <div className="-mx-4 sm:-mx-5">
        {d.rivals.map((r) => (
          <ListRow key={r.teamId} dense href={`/tym/${r.teamId}`}
            title={r.name}
            trailing={
              <span className="text-meta text-muted">
                {r.word}{r.fights > 0 ? ` · ${r.fights}× rvačka` : ""}
              </span>
            }
            detail={<span className="block mt-0.5"><Pruh value={r.heat} dobre={false} /></span>} />
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

  // Jméno je jediný odkaz v řádku, takže odkazem je celý řádek; důvod je věta v `detail`.
  const renderRow = (f: FanGroupsData["favourites"][number]) => (
    <ListRow key={`${f.groupKind}-${f.playerId}`} dense href={`/hrac/${f.playerId}`}
      title={<>{f.playerName}<span className="text-meta font-normal text-muted"> · {f.groupName}</span></>}
      detail={f.duvod} />
  );

  return (
    <div className="-mx-4 sm:-mx-5">
      {milacci.length > 0 && (
        <>
          <RowGroup label={<span className="text-pitch-600">❤️ Berou je za svoje</span>} />
          {milacci.map(renderRow)}
        </>
      )}
      {otloukanci.length > 0 && (
        <>
          <RowGroup label={<span className="text-card-red">😤 Nemůžou ho vystát</span>} />
          {otloukanci.map(renderRow)}
        </>
      )}
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
    <div className="-mx-4 sm:-mx-5">
      {d.campaigns.map((k) => {
        const pct = Math.min(100, Math.round((k.podpisy / Math.max(1, k.prah)) * 100));
        const splneno = k.status === "splnena";
        return (
          <ListRow key={k.id} dense
            leading={<span className="text-base leading-none" aria-hidden="true">{k.kind === "trener_ven" ? "📣" : "🚫"}</span>}
            title={`${k.target} ven`}
            trailing={
              <span className={`text-meta tabular-nums ${splneno ? "text-card-red font-semibold" : "text-muted"}`}>
                {k.podpisy} / {k.prah}
              </span>
            }
            detail={
              <>
                <span className="block mt-0.5"><Pruh value={pct} dobre={false} /></span>
                <span className="block mt-1">
                  {splneno ? "Podpisovka je hotová a předaná." : k.duvod}
                </span>
              </>
            } />
        );
      })}
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
            {formatKc(pokuty)}
          </div>
        </div>
        <div>
          <div className="text-xs text-muted">Čeká na opravu</div>
          <div className={`font-heading font-bold text-lg tabular-nums ${opravy > 0 ? "text-card-red" : "text-ink"}`}>
            {formatKc(opravy)}
          </div>
        </div>
      </div>

      {d.damage.length > 0 && (
        <div className="-mx-4 sm:-mx-5 mb-3">
          {d.damage.map((x) => (
            <ListRow key={x.id} dense
              leading={<span className="text-base leading-none" aria-hidden="true">🔧</span>}
              title={x.label}
              trailing={<span className="text-meta text-muted tabular-nums">{formatKc(x.cost)}</span>} />
          ))}
        </div>
      )}

      {d.recentIncidents.slice(0, 3).map((i) => (
        <p key={i.id} className="text-xs text-ink-light leading-snug py-0.5">
          🚨 {i.text}
        </p>
      ))}

      <Link href={d.damage.length > 0 ? "/incidenty" : "/fanousci"} className="block mt-3 text-xs text-pitch-600 font-semibold hover:underline text-center">
        {d.damage.length > 0 ? "Opravit a řešit →" : "Bezpečnost a historie →"}
      </Link>
    </div>
  );
}


/** Co se u nás zpívá. Chorál drží déle než příspěvek, tak si zaslouží místo. */
export function FanChantsWidget({ data }: WidgetProps) {
  const d = data.fanGroups.data;
  if (!d || !d.chants || d.chants.length === 0) {
    return <Prazdno text="Zatím se nic nezpívá. Chorál potřebuje důvod." />;
  }
  return (
    <div>
      <div className="space-y-2.5">
        {d.chants.map((ch) => (
          <div key={ch.id}>
            <p className="text-sm font-heading font-bold text-ink leading-snug">„{ch.text}"</p>
            <div className="flex items-baseline justify-between gap-2 mt-0.5">
              <span className="text-xs text-ink-light">{ch.duvod}</span>
              <span className="text-xs text-muted shrink-0">{ch.silaWord}</span>
            </div>
            <div className="mt-1"><Pruh value={ch.sila} dobre /></div>
          </div>
        ))}
      </div>
    </div>
  );
}
