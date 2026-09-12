"use client";

/**
 * Tab „Skupiny" na stránce fanoušků.
 *
 * Vlastní soubor záměrně — `page.tsx` má přes 1 500 řádků a přilepit sem další
 * tři sta by z něj udělalo neudržovatelnou hroudu.
 */

import { useState } from "react";
import Link from "next/link";
import { SectionLabel, useConfirm } from "@/components/ui";
import { apiFetch, showError } from "@/lib/api";
import { FaceAvatar } from "@/components/players/face-avatar";
import { odesloLidi, zavrenoNaZapasy, pripadu } from "@okresni-masina/shared";
import { sentimentWord } from "@/lib/fan-info";
import { ChoralyPanel, type ChantView } from "./ChoralyPanel";

export interface FanLeaderView {
  id: string;
  name: string;
  nickname: string | null;
  age: number;
  occupation: string;
  archetype: string;
  archetypeLabel: string;
  bio: string;
  hlaska: string;
  sentiment: number;
  duvod: string | null;
  charisma: number;
  radikalnost: number;
  vyjednavani: number;
  avatar: Record<string, unknown> | null;
}

export interface FanActionVariant {
  key: string;
  label: string;
  cost: number;
}

export interface FanActionView {
  action: string;
  label: string;
  popis: string;
  cost: number;
  cooldownDnu: number;
  variants: FanActionVariant[];
  available: boolean;
  blockedReason?: string;
}

export interface FanGroupView {
  id: string;
  kind: string;
  kindLabel: string;
  popis: string;
  name: string;
  size: number;
  mood: number;
  moodWord: string;
  heat: number;
  heatWord: string;
  passion: number;
  aggression: number;
  loyalty: number;
  spending: number;
  noise: number;
  sector: string;
  sectorLabel: string;
  sectorClosed: boolean;
  closedMatches: number;
  ticketDiscount: number;
  leader: FanLeaderView | null;
  options: FanActionView[];
}

export interface FanIncidentView {
  id: string;
  matchId: string | null;
  groupId: string | null;
  kind: string;
  severity: number;
  minute: number | null;
  text: string;
  fine: number;
  sectorClosedMatches: number;
  fansLost: number;
  gameDate: string | null;
  createdAt: string;
}

export interface FanClubEventView {
  kind: string;
  label: string;
  detail: string | null;
  severity: number;
  gameDate: string;
}

export interface FanGroupsData {
  groups: FanGroupView[];
  recentIncidents: FanIncidentView[];
  recentEvents: FanClubEventView[];
  chants: ChantView[];
  securityLevel: number;
  securityLabel: string;
  gameDate: string;
}

const GROUP_ICONS: Record<string, string> = {
  kotel: "🔥",
  stamgasti: "🍺",
  rodiny: "👨‍👩‍👧",
  pametnici: "🎩",
  parta_z_okoli: "🚌",
};

function moodBarColor(v: number): string {
  if (v >= 70) return "bg-pitch-500";
  if (v >= 45) return "bg-gold-500";
  if (v >= 25) return "bg-gold-600";
  return "bg-card-red";
}

function heatBarColor(v: number): string {
  if (v >= 60) return "bg-card-red";
  if (v >= 30) return "bg-gold-600";
  return "bg-pitch-500";
}

function formatCZK(v: number): string {
  return v.toLocaleString("cs") + " Kč";
}

function formatDatum(s: string | null): string {
  if (!s) return "";
  const d = new Date(s.length > 10 ? s : s + "T00:00:00");
  if (isNaN(d.getTime())) return s;
  return `${d.getDate()}. ${d.getMonth() + 1}.`;
}

/** Vodorovný pruh s číslem — používá se pro náladu i naštvanost. */
function Pruh({ label, value, color, hint }: { label: string; value: number; color: string; hint: string }) {
  return (
    <div>
      <div className="flex items-baseline justify-between text-sm">
        <span className="text-muted">{label}</span>
        <span className="font-semibold">{hint}</span>
      </div>
      <div className="mt-1 h-2 w-full rounded-full bg-gray-100 overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
      </div>
    </div>
  );
}

/**
 * Co se s partou dá udělat. Tlačítka jsou POD kartou, ne v ní — na mobilu se
 * jinak mačkají s textem a špatně se trefují.
 */
function Akce({ group, teamId, onChanged, confirm }: {
  group: FanGroupView; teamId: string; onChanged: () => Promise<void> | void;
  confirm: ReturnType<typeof useConfirm>["confirm"];
}) {
  const [busy, setBusy] = useState<string | null>(null);
  // Výsledek se ukazuje na místě, ne v chybovém dialogu — ten má výstražnou
  // ikonu a „Odchází smířlivěji" u ní vypadá jako průšvih.
  const [vysledek, setVysledek] = useState<string | null>(null);

  const proved = async (a: FanActionView, variant?: FanActionVariant) => {
    const cena = variant ? variant.cost : a.cost;
    const ok = await confirm({
      title: `${a.label} ${group.name}`,
      description: a.popis,
      details: cena > 0 ? [{ label: "Cena", value: `−${formatCZK(cena)}`, color: "text-card-red" }] : [],
      confirmLabel: a.label,
    });
    if (!ok) return;

    setBusy(a.action);
    setVysledek(null);
    type Odpoved = { ok?: boolean; message?: string; error?: string };
    const res: Odpoved = await apiFetch<Odpoved>(
      `/api/teams/${teamId}/fans/groups/${group.id}/action`,
      { method: "POST", body: JSON.stringify({ action: a.action, variant: variant?.key }) },
    ).catch((e) => {
      console.error("akce s partou:", e);
      return { error: "Akci se nepodařilo provést." };
    });
    setBusy(null);

    if (res?.error) { showError("Nepovedlo se", res.error); return; }
    setVysledek(res?.message ?? null);
    await onChanged();
  };

  return (
    <div className="mt-3 space-y-2">
      {vysledek && (
        <p className="rounded-lg px-3 py-2 text-sm" style={{ background: "var(--color-paper)" }}>
          {vysledek}
        </p>
      )}
      {group.options.map((a) => (
        <div key={a.action}>
          {a.variants.length === 0 ? (
            <button
              className="btn btn-md btn-secondary w-full"
              disabled={!a.available || busy !== null}
              onClick={() => proved(a)}
            >
              {a.label}{a.cost > 0 ? ` · ${formatCZK(a.cost)}` : ""}
            </button>
          ) : (
            <details className="rounded-lg" style={{ background: "var(--color-paper)" }}>
              <summary className={`cursor-pointer px-3 py-2 text-sm font-semibold ${a.available ? "" : "opacity-50"}`}>
                {a.label}
              </summary>
              <div className="px-3 pb-3 space-y-2">
                <p className="text-sm text-muted">{a.popis}</p>
                {a.variants.map((v) => (
                  <button
                    key={v.key}
                    className="btn btn-md btn-secondary w-full"
                    disabled={!a.available || busy !== null}
                    onClick={() => proved(a, v)}
                  >
                    {v.label}{v.cost > 0 ? ` · ${formatCZK(v.cost)}` : ""}
                  </button>
                ))}
              </div>
            </details>
          )}
          {!a.available && a.blockedReason && (
            <p className="text-sm text-muted mt-1">{a.blockedReason}</p>
          )}
        </div>
      ))}
    </div>
  );
}

function LeaderRadek({ leader }: { leader: FanLeaderView }) {
  const s = sentimentWord(leader.sentiment);
  return (
    <div className="flex items-start gap-3">
      <div className="shrink-0 w-12 h-12 rounded-full overflow-hidden bg-gray-50 flex items-end justify-center">
        {leader.avatar ? <FaceAvatar faceConfig={leader.avatar} size={40} /> : <span className="text-xl">🧑</span>}
      </div>
      <div className="min-w-0 flex-1">
        <Link href={`/dashboard/fans/vudce/${leader.id}`} className="text-base font-semibold hover:underline">
          {leader.name}
        </Link>
        <div className="text-sm text-muted">
          {leader.archetypeLabel} · {leader.age} let · {leader.occupation}
        </div>
        <div className={`text-sm ${s.cls}`}>Vztah k tobě: {s.text}</div>
      </div>
    </div>
  );
}

export function FanGroupsPanel({ data, teamId, onChanged }: {
  data: FanGroupsData; teamId: string; onChanged: () => Promise<void> | void;
}) {
  const bordelCelkem = data.recentIncidents.reduce((s, i) => s + i.fine, 0);
  // Jeden dialog pro celý panel. Uvnitř <details> s akcemi by ho sbalený
  // element schoval (display:none platí na celý podstrom) a potvrzení by
  // se nikdy nezobrazilo.
  const { confirm, dialog } = useConfirm();

  return (
    <div className="space-y-5">
      {dialog}
      {/* ═══ Jak to funguje ═══ */}
      <details className="card p-4 sm:p-5 group">
        <summary className="cursor-pointer font-heading font-bold text-sm flex items-center justify-between">
          <span>💡 Jak to s partami funguje</span>
          <span className="text-xs text-muted group-open:hidden">rozbalit</span>
          <span className="text-xs text-muted hidden group-open:inline">sbalit</span>
        </summary>
        <div className="mt-3 space-y-3 text-sm leading-relaxed">
          <p>
            Tvoji fanoušci nejsou jedna masa. Dělí se na několik part, každá má svou povahu,
            svého vůdce a vlastní náladu. Nejsou navíc k tvé základně — jsou to lidi z ní.
          </p>
          <ul className="space-y-1.5 ml-4 list-disc">
            <li><strong>Nálada</strong> jde nahoru, když se klubu daří a když jim vyjdeš vstříc.</li>
            <li><strong>Naštvanost</strong> roste, když jim něco zatrhneš. Sama vyprchává pomalu.</li>
            <li><strong>Kotel</strong> ti dělá domácí výhodu — a taky nejvíc problémů.</li>
            <li><strong>Rodiny a pamětníci</strong> bordel nesnášejí a při nepokojích odcházejí první.</li>
          </ul>
          <p className="text-muted">
            Pořadatelská služba na stadionu riziko sráží, ale kotel nemá rád, když ho někdo šacuje.
          </p>
        </div>
      </details>

      {/* ═══ Chorály ═══ */}
      <ChoralyPanel chants={data.chants ?? []} teamId={teamId} onChanged={onChanged} />

      {/* ═══ Bezpečnost na stadionu ═══ */}
      <div className="card p-4 sm:p-5">
        <SectionLabel>Pořádek na stadionu</SectionLabel>
        <div className="mt-2 flex items-baseline gap-2">
          <span className="text-2xl">🛡️</span>
          <span className="text-base font-semibold">{data.securityLabel}</span>
        </div>
        <p className="mt-2 text-sm text-muted">
          Pořadatelskou službu zvedneš na{" "}
          <Link href="/dashboard/stadium" className="underline font-medium">stránce stadionu</Link>.
        </p>
      </div>

      {/* ═══ Party ═══ */}
      {data.groups.map((g) => (
        <div key={g.id} className="card p-4 sm:p-5">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="text-base font-bold">
                {GROUP_ICONS[g.kind] ?? "👥"} {g.name}
              </div>
              <div className="text-sm text-muted">
                {g.kindLabel} · {g.sectorLabel}
              </div>
            </div>
            <div className="text-right shrink-0">
              <div className="text-xl font-bold leading-none">{g.size}</div>
              <div className="text-sm text-muted">lidí</div>
            </div>
          </div>

          <p className="mt-2 text-sm leading-relaxed">{g.popis}</p>

          {g.sectorClosed && (
            <div className="mt-3 rounded-lg bg-card-red/10 px-3 py-2 text-sm">
              🚫 <strong>Sektor je uzavřený</strong> za trest ještě na{" "}
              {zavrenoNaZapasy(g.closedMatches)}. Na hřiště se nedostanou.
            </div>
          )}
          {g.ticketDiscount > 0 && (
            <div className="mt-3 rounded-lg bg-pitch-500/10 px-3 py-2 text-sm">
              🎟️ Mají slevu na vstupné {Math.round(g.ticketDiscount * 100)} %.
            </div>
          )}

          <div className="mt-3 space-y-2.5">
            <Pruh label="Nálada" value={g.mood} color={moodBarColor(g.mood)} hint={g.moodWord} />
            <Pruh label="Vztah k vedení" value={g.heat} color={heatBarColor(g.heat)} hint={g.heatWord} />
          </div>

          {g.leader && (
            <div className="mt-4 pt-4 border-t border-gray-100">
              <LeaderRadek leader={g.leader} />
            </div>
          )}

          <details className="mt-3 group">
            <summary className="cursor-pointer text-sm font-semibold">
              <span className="group-open:hidden">Co s tím můžeš udělat</span>
              <span className="hidden group-open:inline">Skrýt možnosti</span>
            </summary>
            <Akce group={g} teamId={teamId} onChanged={onChanged} confirm={confirm} />
          </details>
        </div>
      ))}

      {/* ═══ Proč je nálada taková, jaká je ═══ */}
      {data.recentEvents.length > 0 && (
        <div className="card p-4 sm:p-5">
          <SectionLabel>Co klub v poslední době potkalo</SectionLabel>
          <ul className="mt-2 space-y-2">
            {data.recentEvents.map((u, i) => (
              <li key={`${u.kind}-${u.gameDate}-${i}`} className="text-sm flex items-baseline gap-2">
                <span className="text-muted shrink-0">{formatDatum(u.gameDate)}</span>
                <span>
                  <strong>{u.label}</strong>
                  {u.detail && <span className="text-muted"> — {u.detail}</span>}
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-sm text-muted">
            Každá parta to bere jinak. Pamětníky urazí přejmenování klubu, kotel ne —
            a naopak.
          </p>
        </div>
      )}

      {/* ═══ Poslední bordel ═══ */}
      <div className="card p-4 sm:p-5">
        <SectionLabel>Co se stalo na tribunách</SectionLabel>
        {data.recentIncidents.length === 0 ? (
          <p className="mt-2 text-sm text-muted">
            Zatím klid. Delegát nemá co zapsat a ty nemáš co platit.
          </p>
        ) : (
          <>
            <ul className="mt-2 space-y-3">
              {data.recentIncidents.map((i) => (
                <li key={i.id} className="text-sm leading-relaxed">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="text-muted">
                      {formatDatum(i.gameDate)}
                      {i.minute != null && ` · ${i.minute}′`}
                    </span>
                    {i.fine > 0 && (
                      <span className="font-semibold text-card-red shrink-0">−{formatCZK(i.fine)}</span>
                    )}
                  </div>
                  <div>{i.text}</div>
                  {(i.sectorClosedMatches > 0 || i.fansLost > 0) && (
                    <div className="text-muted">
                      {i.sectorClosedMatches > 0 && `Sektor zavřený na ${zavrenoNaZapasy(i.sectorClosedMatches)}. `}
                      {i.fansLost > 0 && odesloLidi(i.fansLost)}
                    </div>
                  )}
                </li>
              ))}
            </ul>
            {bordelCelkem > 0 && (
              <p className="mt-3 pt-3 border-t border-gray-100 text-sm">
                Za {pripadu(data.recentIncidents.length)} jsi zaplatil{" "}
                <strong className="text-card-red">{formatCZK(bordelCelkem)}</strong>.
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}
