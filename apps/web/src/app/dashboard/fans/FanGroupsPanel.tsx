"use client";

/**
 * Tab „Party" na stránce fanoušků.
 *
 * Vlastní soubor záměrně — `page.tsx` má přes 1 500 řádků a přilepit sem další
 * tři sta by z něj udělalo neudržovatelnou hroudu.
 */

import Link from "next/link";
import { SectionLabel } from "@/components/ui";
import { FaceAvatar } from "@/components/players/face-avatar";
import { pocet } from "@/lib/referee-info";

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

export interface FanGroupsData {
  groups: FanGroupView[];
  recentIncidents: FanIncidentView[];
  securityLevel: number;
  gameDate: string;
}

const GROUP_ICONS: Record<string, string> = {
  kotel: "🔥",
  stamgasti: "🍺",
  rodiny: "👨‍👩‍👧",
  pametnici: "🎩",
  parta_z_okoli: "🚌",
};

const SECURITY_LABELS = [
  "Žádná — pořádek si hlídá kdo zrovna může",
  "Dva pořadatelé v reflexních vestách",
  "Pořadatelská služba a oddělené sektory",
  "Agentura s profíky a kamerami",
];

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

function sentimentWord(s: number): { text: string; cls: string } {
  if (s >= 50) return { text: "stojí za tebou", cls: "text-pitch-600" };
  if (s >= 15) return { text: "nakloněný", cls: "text-pitch-600" };
  if (s > -15) return { text: "neutrální", cls: "text-muted" };
  if (s > -50) return { text: "nedůvěřuje ti", cls: "text-gold-600" };
  return { text: "je proti tobě", cls: "text-card-red" };
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
        <div className={`text-sm ${s.cls}`}>Vztah k vedení: {s.text}</div>
      </div>
    </div>
  );
}

export function FanGroupsPanel({ data }: { data: FanGroupsData }) {
  const bordelCelkem = data.recentIncidents.reduce((s, i) => s + i.fine, 0);

  return (
    <div className="space-y-5">
      {/* ═══ Jak to funguje ═══ */}
      <details className="card p-4 sm:p-5 group">
        <summary className="cursor-pointer font-heading font-bold text-sm flex items-center justify-between">
          <span>💡 Jak to s partami funguje</span>
          <span className="text-xs text-muted group-open:hidden">rozbalit</span>
          <span className="text-xs text-muted hidden group-open:inline">sbalit</span>
        </summary>
        <div className="mt-3 space-y-3 text-sm leading-relaxed">
          <p>
            Tvoji fanoušci nejsou jedna masa. Dělí se na party, každá má svou povahu, svého
            vůdce a vlastní náladu. Party nejsou navíc k tvé základně — jsou to lidi z ní.
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

      {/* ═══ Bezpečnost na stadionu ═══ */}
      <div className="card p-4 sm:p-5">
        <SectionLabel>Pořádek na stadionu</SectionLabel>
        <div className="mt-2 flex items-baseline gap-2">
          <span className="text-2xl">🛡️</span>
          <span className="text-base font-semibold">
            {SECURITY_LABELS[Math.max(0, Math.min(3, data.securityLevel))]}
          </span>
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
              {pocet(g.closedMatches, "zápas", "zápasy", "zápasů")}. Na hřiště se nedostanou.
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
        </div>
      ))}

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
                      {i.sectorClosedMatches > 0 && `Sektor zavřený na ${i.sectorClosedMatches} zápas${i.sectorClosedMatches > 1 ? "y" : ""}. `}
                      {i.fansLost > 0 && `Odešlo ${i.fansLost} lidí.`}
                    </div>
                  )}
                </li>
              ))}
            </ul>
            {bordelCelkem > 0 && (
              <p className="mt-3 pt-3 border-t border-gray-100 text-sm">
                Za posledních {data.recentIncidents.length} případů jsi zaplatil{" "}
                <strong className="text-card-red">{formatCZK(bordelCelkem)}</strong>.
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}
