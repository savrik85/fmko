"use client";

/** Klubové widgety — trenér, reputace, trénink, vybavení, zaměstnanci, mládež, trofeje, přestupy. */

import { WidgetSkeleton, WidgetError } from "../widget-frame";
import { FaceAvatar } from "@/components/players/face-avatar";
import { bestTextOn } from "@/lib/team-color";
import {
  RadarChart, LineChart, HBarChart, DivergingBar, Gauge,
  ChartEmpty, ChartHero, PRIMARY, DIVERGING, STATUS, seriesColor, compactCZK, fullCZK,
} from "../charts";
import type { WidgetProps } from "../types";
import { AttrPill, MoreLink, safeTeamColor } from "./shared";

// ── Trenér ──────────────────────────────────────────────────────────────────

export function ManagerCardWidget({ data, teamId }: WidgetProps) {
  if (data.manager.loading) return <WidgetSkeleton rows={3} />;
  const manager = data.manager.data;
  if (!manager) return <div className="text-muted text-sm">Bez trenéra</div>;
  const color = data.team.data?.primary_color || "#2D5F2D";

  return (
    <a href={`/dashboard/manager/${teamId}`} className="block group">
      <div className="flex items-center gap-3">
        {manager.avatar && Object.keys(manager.avatar).length > 2 ? (
          <FaceAvatar faceConfig={manager.avatar} size={48} className="shrink-0 rounded-xl" />
        ) : (
          <div
            className={`w-12 h-12 rounded-xl flex items-center justify-center font-heading font-bold text-lg shrink-0 ${
              bestTextOn(color) === "light" ? "text-white border border-transparent" : "text-gray-900 border border-gray-300"
            }`}
            style={{ backgroundColor: color }}
          >
            {manager.name[0]}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="font-heading font-bold group-hover:underline truncate">{manager.name}</div>
          {manager.birthplace && <div className="text-sm text-muted">{manager.birthplace}</div>}
        </div>
      </div>
      <div className="flex gap-2 mt-3">
        <AttrPill label="Kou" value={manager.coaching ?? 40} />
        <AttrPill label="Mot" value={manager.motivation ?? 40} />
        <AttrPill label="Tak" value={manager.tactics ?? 40} />
        <AttrPill label="Dis" value={manager.discipline ?? 40} />
      </div>
    </a>
  );
}

const MANAGER_AXES = [
  { key: "coaching", label: "Koučink" },
  { key: "motivation", label: "Motivace" },
  { key: "tactics", label: "Taktika" },
  { key: "discipline", label: "Disciplína" },
  { key: "youthDevelopment", label: "Mládež" },
  { key: "reputation", label: "Reputace" },
] as const;

export function ManagerRadarWidget({ data }: WidgetProps) {
  if (data.manager.loading) return <WidgetSkeleton rows={5} />;
  const manager = data.manager.data;
  if (!manager) return <ChartEmpty>Klub nemá trenéra.</ChartEmpty>;

  return (
    <RadarChart
      axes={MANAGER_AXES.map((a) => a.label)}
      series={[{ label: manager.name, values: MANAGER_AXES.map((a) => manager[a.key] ?? 40), color: PRIMARY }]}
    />
  );
}

/** Vývoj atributů trenéra — jen ty, u kterých se opravdu něco dělo. */
export function ManagerHistoryWidget({ data }: WidgetProps) {
  if (data.managerHistory.loading) return <WidgetSkeleton rows={4} />;
  if (data.managerHistory.error) return <WidgetError />;
  const entries = [...(data.managerHistory.data ?? [])].reverse();
  if (entries.length < 2) return <ChartEmpty>Atributy se zatím nezměnily.</ChartEmpty>;

  const byAttr = new Map<string, { label: string; points: number[] }>();
  for (const e of entries) {
    const cur = byAttr.get(e.attr) ?? { label: e.attrLabel || e.attr, points: [] };
    cur.points.push(e.newValue);
    byAttr.set(e.attr, cur);
  }
  // Tři nejaktivnější atributy — víc křivek se v malé kartě nedá rozeznat.
  const top = [...byAttr.values()].sort((a, b) => b.points.length - a.points.length).slice(0, 3);
  const len = Math.max(...top.map((s) => s.points.length));

  return (
    <LineChart
      series={top.map((s, i) => ({
        label: s.label,
        // Kratší řady se doplní poslední hodnotou, aby osa X seděla.
        points: [...s.points, ...Array(len - s.points.length).fill(s.points[s.points.length - 1])],
        color: seriesColor(i),
      }))}
      formatValue={(v) => String(Math.round(v))}
      fill={false}
    />
  );
}

// ── Reputace ────────────────────────────────────────────────────────────────

export function ReputationWidget({ data }: WidgetProps) {
  if (data.reputation.loading) return <WidgetSkeleton rows={4} />;
  if (data.reputation.error) return <WidgetError />;
  const rep = data.reputation.data;
  if (!rep) return <ChartEmpty>Reputace zatím není spočítaná.</ChartEmpty>;

  const history = [...(rep.history ?? [])].reverse();

  return (
    <div className="space-y-3">
      <Gauge value={rep.reputation} label={rep.tier?.label ?? "Reputace klubu"} />
      {history.length >= 2 ? (
        <LineChart
          series={[{ label: "Reputace", points: history.map((h) => h.newValue) }]}
          labels={history.map((h) => new Date(h.gameDate).toLocaleDateString("cs"))}
          formatValue={(v) => String(Math.round(v))}
          height={110}
        />
      ) : (
        <div className="text-sm text-muted text-center">Reputace se zatím nezměnila.</div>
      )}
      <MoreLink href="/dashboard/reputace">Detail reputace →</MoreLink>
    </div>
  );
}

// ── Trénink ─────────────────────────────────────────────────────────────────

const SKILL_LABELS: Record<string, string> = {
  speed: "Rychlost", technique: "Technika", shooting: "Střelba", passing: "Přihrávka",
  heading: "Hlavičky", defense: "Obrana", goalkeeping: "Chytání", stamina: "Výdrž",
  strength: "Síla", creativity: "Kreativita", setPieces: "Standardky",
};

export function TrainingBreakdownWidget({ data }: WidgetProps) {
  if (data.trainingStats.loading) return <WidgetSkeleton rows={5} />;
  if (data.trainingStats.error) return <WidgetError />;
  const stats = data.trainingStats.data;
  const rows = (stats?.skillBreakdown ?? []).filter((r) => r.gains > 0 || r.losses > 0).slice(0, 7);
  if (rows.length === 0) return <ChartEmpty>Trénink zatím nic nezměnil.</ChartEmpty>;

  return (
    <div className="space-y-3">
      <DivergingBar
        data={rows.map((r) => ({ label: SKILL_LABELS[r.attribute] ?? r.attribute, positive: r.gains, negative: r.losses }))}
        positiveLabel="Zlepšení"
        negativeLabel="Zhoršení"
      />
      <div className="text-sm text-muted text-center">
        {stats?.trainingSessions ?? 0} tréninků ·{" "}
        <span className="font-heading font-bold" style={{ color: DIVERGING.positive }}>+{stats?.totalImprovements ?? 0}</span>{" "}
        <span className="font-heading font-bold" style={{ color: DIVERGING.negative }}>−{stats?.totalDeclines ?? 0}</span>
      </div>
      <MoreLink href="/dashboard/training">Detail tréninku →</MoreLink>
    </div>
  );
}

export function TopImproversWidget({ data }: WidgetProps) {
  if (data.trainingStats.loading) return <WidgetSkeleton />;
  if (data.trainingStats.error) return <WidgetError />;
  const rows = data.trainingStats.data?.topImprovers ?? [];
  if (rows.length === 0) return <ChartEmpty>Zatím se nikdo výrazně nezlepšil.</ChartEmpty>;

  return (
    <HBarChart
      data={rows.map((r) => ({
        label: r.topAttribute ? `${r.name} · ${SKILL_LABELS[r.topAttribute] ?? r.topAttribute}` : r.name,
        value: r.totalGains,
        href: `/dashboard/player/${r.playerId}`,
      }))}
    />
  );
}

export function TrainingAttendanceWidget({ data }: WidgetProps) {
  if (data.attendance.loading) return <WidgetSkeleton />;
  if (data.attendance.error) return <WidgetError />;
  const players = (data.attendance.data?.players ?? []).filter((p) => p.trainingTotal > 0);
  if (players.length === 0) return <ChartEmpty>Zatím neproběhl žádný trénink.</ChartEmpty>;

  const worst = [...players].sort((a, b) => a.trainingPct - b.trainingPct).slice(0, 6);
  const teamPct = Math.round(
    players.reduce((s, p) => s + p.trainingAttended, 0) / Math.max(1, players.reduce((s, p) => s + p.trainingTotal, 0)) * 100,
  );

  return (
    <div className="space-y-3">
      <ChartHero value={`${teamPct} %`} note="docházka celého kádru" color={safeTeamColor(data.team.data)} />
      <HBarChart
        max={100}
        data={worst.map((p) => ({
          label: `${p.firstName} ${p.lastName}`,
          value: p.trainingPct,
          display: `${p.trainingPct} %`,
          color: p.trainingPct >= 80 ? STATUS.good : p.trainingPct >= 50 ? STATUS.warning : STATUS.critical,
          href: `/dashboard/player/${p.playerId}`,
        }))}
      />
      <div className="text-[11px] text-muted text-center">Nejhorší docházka v kádru.</div>
    </div>
  );
}

export function BestAttendanceWidget({ data }: WidgetProps) {
  if (data.attendance.loading) return <WidgetSkeleton />;
  if (data.attendance.error) return <WidgetError />;
  const players = (data.attendance.data?.players ?? []).filter((p) => p.trainingTotal > 0);
  if (players.length === 0) return <ChartEmpty>Zatím neproběhl žádný trénink.</ChartEmpty>;

  const best = [...players].sort((a, b) => b.trainingPct - a.trainingPct).slice(0, 6);

  return (
    <div className="space-y-3">
      <HBarChart
        max={100}
        data={best.map((p) => ({
          label: `${p.firstName} ${p.lastName}`,
          value: p.trainingPct,
          display: `${p.trainingPct} %`,
          href: `/dashboard/player/${p.playerId}`,
        }))}
      />
      <div className="text-[11px] text-muted text-center">Kdo na trénink chodí nejpoctivěji.</div>
    </div>
  );
}

/**
 * Kdo nejvíc chybí v zápasech — jiná věc než docházka na trénink.
 * Vedle počtu zmeškaných ukazuje i nejčastější důvod.
 */
export function MostAbsentWidget({ data }: WidgetProps) {
  if (data.attendance.loading) return <WidgetSkeleton />;
  if (data.attendance.error) return <WidgetError />;
  const info = data.attendance.data;
  const players = (info?.players ?? []).filter((p) => p.matchesMissed > 0);
  if (players.length === 0) return <ChartEmpty>Nikdo zatím žádný zápas nevynechal.</ChartEmpty>;

  const REASON_LABELS: Record<string, string> = {
    injury: "zranění", suspension: "trest", excuse: "omluvenka",
    bench: "lavička", notNominated: "mimo nominaci",
  };
  const topReason = (b: Record<string, number>) => {
    const [key, count] = Object.entries(b).sort((a, z) => z[1] - a[1])[0] ?? [];
    return key && count ? `${REASON_LABELS[key] ?? key} ${count}×` : "";
  };

  const worst = [...players].sort((a, b) => b.matchesMissed - a.matchesMissed).slice(0, 6);

  return (
    <div className="space-y-3">
      <HBarChart
        max={info?.matchesAvailable || Math.max(...worst.map((p) => p.matchesMissed), 1)}
        data={worst.map((p) => ({
          label: `${p.firstName} ${p.lastName}${topReason(p.breakdown) ? ` · ${topReason(p.breakdown)}` : ""}`,
          value: p.matchesMissed,
          display: `${p.matchesMissed}×`,
          color: STATUS.critical,
          href: `/dashboard/player/${p.playerId}`,
        }))}
      />
      <div className="text-[11px] text-muted text-center">
        Ze {info?.matchesAvailable ?? 0} zápasů sezóny.
      </div>
    </div>
  );
}

// ── Vybavení ────────────────────────────────────────────────────────────────

export function EquipmentWidget({ data }: WidgetProps) {
  if (data.equipment.loading) return <WidgetSkeleton rows={5} />;
  if (data.equipment.error) return <WidgetError />;
  const categories = data.equipment.data?.categories ?? [];
  if (categories.length === 0) return <ChartEmpty>Klub zatím nemá vybavení.</ChartEmpty>;

  // Nejopotřebovanější kusy — to je informace, kvůli které se sem člověk dívá.
  const worst = [...categories].sort((a, b) => a.condition - b.condition).slice(0, 6);

  return (
    <div className="space-y-3">
      <HBarChart
        max={100}
        data={worst.map((c) => ({
          label: `${c.label} · úroveň ${c.level}`,
          value: c.condition,
          display: `${Math.round(c.condition)} %`,
          color: c.condition >= 70 ? STATUS.good : c.condition >= 40 ? STATUS.warning : STATUS.critical,
        }))}
      />
      <MoreLink href="/dashboard/equipment">Detail vybavení →</MoreLink>
    </div>
  );
}

// ── Zaměstnanci ─────────────────────────────────────────────────────────────

const STAFF_ROLE_LABELS: Record<string, string> = {
  asistent: "Asistent", trener_mladeze: "Trenér mládeže", trener_brankaru: "Trenér brankářů",
  kondicni_trener: "Kondiční trenér", maser: "Masér", lekar: "Lékař", psycholog: "Psycholog",
  spravce_hriste: "Správce hřiště", skaut: "Skaut", obsluha: "Obsluha",
  sef_fanklubu: "Šéf fanklubu", ekonom: "Ekonom",
};

export function StaffWidget({ data }: WidgetProps) {
  if (data.staff.loading) return <WidgetSkeleton />;
  if (data.staff.error) return <WidgetError />;
  const staff = (data.staff.data ?? []).filter((s) => s.role);
  if (staff.length === 0) return <ChartEmpty>Klub zatím nikoho nezaměstnává.</ChartEmpty>;

  const totalWage = staff.reduce((s, x) => s + (x.weeklyWage ?? 0), 0);

  return (
    <div className="space-y-3">
      <ul className="space-y-1">
        {staff.slice(0, 8).map((s) => (
          <li key={s.id} className="flex items-center gap-2 py-1.5 border-b border-gray-50 last:border-b-0">
            <span className="text-sm text-muted w-28 shrink-0 truncate">{STAFF_ROLE_LABELS[s.role ?? ""] ?? s.role}</span>
            <span className="text-sm font-heading font-bold flex-1 truncate">{s.firstName} {s.lastName}</span>
            <span className="text-sm text-muted tabular-nums shrink-0">{compactCZK(s.weeklyWage ?? 0)}</span>
          </li>
        ))}
      </ul>
      <div className="text-sm text-muted text-center">
        Mzdy zaměstnanců <span className="font-heading font-bold text-ink tabular-nums">{fullCZK(totalWage)}</span> týdně
      </div>
      <MoreLink href="/dashboard/zamestnanci">Detail zaměstnanců →</MoreLink>
    </div>
  );
}

// ── Mládež ──────────────────────────────────────────────────────────────────

export function U21Widget({ data }: WidgetProps) {
  if (data.u21.loading) return <WidgetSkeleton />;
  if (data.u21.error) return <WidgetError />;
  const players = data.u21.data ?? [];
  if (players.length === 0) return <ChartEmpty>Mládežnický tým zatím nemáš.</ChartEmpty>;

  const top = [...players].sort((a, b) => b.overall_rating - a.overall_rating).slice(0, 6);

  return (
    <div className="space-y-3">
      <HBarChart
        max={100}
        data={top.map((p) => ({
          label: `${p.first_name} ${p.last_name} · ${p.age} let`,
          value: p.overall_rating,
          display: String(p.overall_rating),
          href: `/dashboard/player/${p.id}`,
        }))}
      />
      <MoreLink href="/dashboard/u21">Celá mládež →</MoreLink>
    </div>
  );
}

// ── Trofeje ─────────────────────────────────────────────────────────────────

export function TrophiesWidget({ data }: WidgetProps) {
  if (data.trophies.loading) return <WidgetSkeleton rows={2} />;
  if (data.trophies.error) return <WidgetError />;
  const trophies = data.trophies.data ?? [];
  if (trophies.length === 0) return <ChartEmpty>Vitrína zatím zeje prázdnotou.</ChartEmpty>;

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
      {trophies.slice(0, 9).map((t, i) => (
        <div key={i} className="bg-gray-50 rounded-lg p-2.5 text-center">
          <div className="text-2xl leading-none">{t.icon ?? "🏆"}</div>
          <div className="font-heading font-bold text-sm mt-1 truncate">{t.title ?? t.name ?? t.label ?? "Trofej"}</div>
          {(t.season ?? t.seasonNumber) != null && (
            <div className="text-[11px] text-muted">{t.season ?? t.seasonNumber}. sezóna</div>
          )}
        </div>
      ))}
    </div>
  );
}

// ── Přestupy ────────────────────────────────────────────────────────────────

export function TransferOffersWidget({ data }: WidgetProps) {
  if (data.offers.loading) return <WidgetSkeleton />;
  if (data.offers.error) return <WidgetError />;
  const offers = (data.offers.data ?? []).filter((o) => o.status === "pending");
  if (offers.length === 0) return <ChartEmpty>Žádné nové nabídky na tvoje hráče.</ChartEmpty>;

  return (
    <div className="space-y-3">
      <ul className="space-y-1">
        {offers.slice(0, 6).map((o) => (
          <li key={o.id} className="flex items-center gap-2 py-1.5 border-b border-gray-50 last:border-b-0">
            <span className="text-sm font-heading font-bold flex-1 truncate">{o.playerName ?? o.player_name ?? "Hráč"}</span>
            {o.from_team_name && <span className="text-sm text-muted truncate max-w-[40%]">{o.from_team_name}</span>}
            <span className="text-sm font-heading font-bold tabular-nums shrink-0">
              {compactCZK(o.offerAmount ?? o.offer_amount ?? 0)}
            </span>
          </li>
        ))}
      </ul>
      <MoreLink href="/dashboard/transfers">Zobrazit přestupy →</MoreLink>
    </div>
  );
}

export function WatchlistWidget({ data }: WidgetProps) {
  if (data.watchlist.loading) return <WidgetSkeleton />;
  if (data.watchlist.error) return <WidgetError />;
  const players = data.watchlist.data ?? [];
  if (players.length === 0) return <ChartEmpty>Nikoho zatím nesleduješ.</ChartEmpty>;

  return (
    <div className="space-y-3">
      <ul className="space-y-1">
        {players.slice(0, 6).map((p, i) => (
          <li key={p.playerId ?? p.id ?? i} className="flex items-center gap-2 py-1.5 border-b border-gray-50 last:border-b-0">
            <a
              href={p.playerId ? `/dashboard/player/${p.playerId}` : "#"}
              className="text-sm font-heading font-bold flex-1 truncate hover:text-pitch-500 hover:underline transition-colors"
            >
              {p.firstName} {p.lastName}
            </a>
            {p.teamName && <span className="text-sm text-muted truncate max-w-[40%]">{p.teamName}</span>}
            <span className="text-sm font-heading font-bold tabular-nums shrink-0">{p.overallRating ?? "—"}</span>
          </li>
        ))}
      </ul>
      <MoreLink href="/dashboard/watchlist">Celý watchlist →</MoreLink>
    </div>
  );
}
