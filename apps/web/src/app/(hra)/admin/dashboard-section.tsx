"use client";

/**
 * Přehled administrace: běží hra, co hlásí hlídač a jak se daří AI trenérům.
 *
 * Tři zdroje, každý se načítá zvlášť, aby výpadek jednoho nezhasl celý přehled:
 * - /api/admin/health: zpracování kol a fronty,
 * - /api/admin/watchdog: problémy, které hlídač každé ráno posílá adminům,
 * - /api/admin/ai-coach/status: AI trenéři, jejich chyby a převzetí opuštěných klubů.
 *
 * Chyby a varování z nich se skládají do jednoho seznamu. Co hlásí hlídač, je chyba
 * (stejné hlášení dorazí ráno adminům), co jen nesedí v kontrolách, je varování,
 * a co je dobré vědět (vypnutý přepínač, převzetí do týdne), je poznámka.
 */

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { SectionLabel } from "@/components/ui";
import type { AdminTab } from "./admin-tabs";
import {
  clubList, COACH_AREAS, formatTime, KIND_LABELS, MODE_LABEL, relativeTime, type CoachStatus,
} from "./ai-coach-shared";

interface Check { nazev: string; hodnota: number | string; ok: boolean; popis: string }
interface Health {
  verdikt: string;
  rezim: { zpracovani: string; aiPoskytovatel: string };
  hodiny: { herniDatum: string | null; offsetDnu: number | null };
  kola24h: { pocet: number; prumerMs: number | null; maxMs: number | null };
  posledniKolo: { trvaniMs: number | null; kdy: string | null };
  osirele?: { ligy: number; tymy: number; kola: number };
  kontroly: Check[];
}
interface WatchdogData { zdrave: boolean; problemy: Array<{ kod: string; popis: string; hodnota: number | string }> }

type IssueLevel = "error" | "warning" | "info";
interface Issue { level: IssueLevel; title: string; value?: string; detail?: string; tab?: AdminTab }

/** Kontroly zpracování, které hlídač hlásí taky: když je hlásí on, druhý řádek je zbytečný. */
const CHECK_TO_WATCHDOG: Record<string, string> = {
  "dead-letter fronta": "dlq",
  "zaseklá kola": "zaseklá_kola",
  "nedohraná splatná kola": "backlog",
  "retry za 3 dny": "retry",
};
const AI_WATCHDOG_CODES = new Set(["ai_coach_fallback", "ai_coach_silent", "ai_club_debt", "ai_takeover_brake"]);
const REFRESH_MS = 120_000;

const LEVEL_STYLE: Record<IssueLevel, { icon: string; label: string; text: string }> = {
  error: { icon: "⛔", label: "Chyba", text: "text-card-red" },
  warning: { icon: "⚠️", label: "Varování", text: "text-gold-700" },
  info: { icon: "ℹ️", label: "Poznámka", text: "text-ink" },
};

function shorten(text: string, max = 140): string {
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

function seconds(ms: number | null): string {
  return ms == null ? "—" : `${Math.round(ms / 1000)} s`;
}

function buildIssues(health: Health | null, watchdog: WatchdogData | null, coach: CoachStatus | null, failed: string[]): Issue[] {
  const issues: Issue[] = failed.map((what) => ({
    level: "error" as const, title: `Nepodařilo se načíst: ${what}`, detail: "Podrobnosti jsou v konzoli prohlížeče.",
  }));

  const reported = new Set((watchdog?.problemy ?? []).map((p) => p.kod));
  for (const p of watchdog?.problemy ?? []) {
    issues.push({ level: "error", title: p.popis, value: String(p.hodnota), tab: AI_WATCHDOG_CODES.has(p.kod) ? "ai" : undefined });
  }
  for (const k of health?.kontroly ?? []) {
    if (k.ok) continue;
    if (k.nazev === "osiřelé ligy") {
      const o = health?.osirele;
      issues.push({
        level: "info", title: "Osiřelé ligy",
        value: String(k.hodnota),
        detail: `${o ? `${o.tymy} týmů, ${o.kola} kol. ` : ""}Pozůstatek testování, na zpracování nemá vliv.`,
      });
      continue;
    }
    const code = CHECK_TO_WATCHDOG[k.nazev];
    if (code && reported.has(code)) continue;
    issues.push({ level: "warning", title: k.nazev, value: String(k.hodnota), detail: k.popis });
  }

  if (coach) {
    if (coach.last24h.errors > 0) {
      const first = coach.recentErrors[0];
      issues.push({
        level: "warning", title: "AI trenéři hlásí chyby", value: `${coach.last24h.errors}× za 24 h`,
        detail: first ? `Poslední: ${first.teamName ?? "?"} (${KIND_LABELS[first.kind] ?? first.kind}): ${shorten(first.error)}` : undefined,
        tab: "ai",
      });
    }
    const notOn = COACH_AREAS.filter((a) => coach.modes[a.key] !== "on");
    if (notOn.length > 0) {
      issues.push({
        level: "info", title: "AI trenéři nejsou všude zapnutí",
        detail: notOn.map((a) => `${a.label}: ${MODE_LABEL[coach.modes[a.key]]}`).join(", "), tab: "ai",
      });
    }
    if (!coach.takeover.enabled) {
      issues.push({ level: "info", title: "Převzetí opuštěných klubů je vypnuté", detail: "Přepínač ai_club_takeover je off.", tab: "ai" });
    } else if (coach.takeover.waitingCount > 0 && coach.takeover.waitingCount <= coach.takeover.brake) {
      issues.push({ level: "info", title: "Dnes v noci převezme AI", detail: clubList(coach.takeover.waiting), tab: "ai" });
    }
    if (coach.takeover.soon.length > 0) {
      issues.push({ level: "info", title: "Do týdne převezme AI", detail: clubList(coach.takeover.soon), tab: "ai" });
    }
    if (coach.clubs.orphaned > 0) {
      issues.push({
        level: "info", title: "AI kluby bez ligy", value: String(coach.clubs.orphaned),
        detail: "Jejich liga je smazaná: nehrají, ale dostávají úlohy AI trenérů.", tab: "ai",
      });
    }
  }

  const order: Record<IssueLevel, number> = { error: 0, warning: 1, info: 2 };
  return issues.sort((a, b) => order[a.level] - order[b.level]);
}

function Tile({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="rounded-soft bg-gray-50 p-3">
      <div className="text-sm text-muted">{label}</div>
      <div className="font-heading font-bold text-xl tabular-nums">{value}</div>
      {note && <div className="text-sm text-muted">{note}</div>}
    </div>
  );
}

function IssueList({ issues, onOpenTab }: { issues: Issue[]; onOpenTab: (tab: AdminTab) => void }) {
  if (issues.length === 0) {
    return <div className="text-base text-green-800">✅ Žádné chyby ani varování.</div>;
  }
  return (
    <ul className="divide-y divide-gray-100">
      {issues.map((issue, i) => {
        const style = LEVEL_STYLE[issue.level];
        return (
          <li key={`${issue.title}-${i}`} className="py-2.5 first:pt-0 last:pb-0 flex items-start gap-3">
            <span aria-hidden="true" className="text-lg leading-6 shrink-0">{style.icon}</span>
            <div className="min-w-0 flex-1">
              <div className={`font-heading font-bold text-base ${style.text}`}>
                <span className="sr-only">{style.label}: </span>
                {issue.title}
                {issue.value && <span className="font-normal text-ink"> · {issue.value}</span>}
              </div>
              {issue.detail && <div className="text-sm text-muted break-words">{issue.detail}</div>}
            </div>
            {issue.tab && (
              <button onClick={() => onOpenTab(issue.tab as AdminTab)}
                className="shrink-0 text-sm text-pitch-600 underline py-1">
                Otevřít
              </button>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function CoachCard({ coach, onOpenTab }: { coach: CoachStatus; onOpenTab: (tab: AdminTab) => void }) {
  const l = coach.last24h;
  const modelShare = l.modelDecisions > 0 ? Math.round(((l.modelDecisions - l.fallback) / l.modelDecisions) * 100) : null;
  return (
    <div className="card p-4 space-y-4">
      <div className="flex items-center justify-between gap-3">
        <SectionLabel>🤖 AI trenéři</SectionLabel>
        <button onClick={() => onOpenTab("ai")} className="text-sm text-pitch-600 underline">Podrobnosti</button>
      </div>

      <div className="flex flex-wrap gap-2">
        {COACH_AREAS.map((a) => {
          const mode = coach.modes[a.key];
          return (
            <span key={a.key} className={`text-sm px-2.5 py-1 rounded-soft ${mode === "on" ? "bg-pitch-50 text-pitch-700" : "bg-gray-100 text-ink"}`}>
              {a.label}: <span className="font-bold">{MODE_LABEL[mode]}</span>
            </span>
          );
        })}
      </div>

      <div className="grid grid-cols-2 gap-2">
        <Tile label="Rozhodnutí za 24 h" value={String(l.decisions)} note={modelShare !== null ? `${modelShare} % modelem` : "model zatím nerozhodoval"} />
        <Tile label="Chyby za 24 h" value={String(l.errors)} note={`za 7 dní ${coach.last7d.errors}`} />
        <Tile label="Poslední rozhodnutí" value={relativeTime(coach.lastDecisionAt)} note={formatTime(coach.lastDecisionAt)} />
        <Tile label="Průměrná doba" value={l.avgLatencyMs !== null ? `${(l.avgLatencyMs / 1000).toFixed(1)} s` : "—"}
          note={l.tokensOut > 0 ? `${Math.round((l.tokensIn + l.tokensOut) / 1000)} tis. tokenů` : undefined} />
      </div>

      {l.byKind.length > 0 && (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-muted">
              <th className="py-1 font-normal">za 24 h</th>
              <th className="py-1 font-normal text-right">rozhodnutí</th>
              <th className="py-1 font-normal text-right">bez modelu</th>
              <th className="py-1 font-normal text-right">chyby</th>
            </tr>
          </thead>
          <tbody>
            {l.byKind.map((k) => (
              <tr key={k.kind} className="border-t border-gray-100">
                <td className="py-1.5">{KIND_LABELS[k.kind] ?? k.kind}</td>
                <td className="py-1.5 text-right tabular-nums">{k.decisions}</td>
                <td className="py-1.5 text-right tabular-nums">{k.fallback}</td>
                <td className={`py-1.5 text-right tabular-nums ${k.errors > 0 ? "text-card-red font-bold" : ""}`}>{k.errors}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <div className="text-sm space-y-1">
        <div>
          <span className="text-muted">AI kluby:</span> <span className="font-bold">{coach.clubs.total}</span>
          {coach.clubs.byLeague.length > 0 && <span className="text-muted"> ({coach.clubs.byLeague.map((b) => `${b.league} ${b.count}`).join(", ")})</span>}
        </div>
        <div>
          <span className="text-muted">V mínusu:</span>{" "}
          {coach.clubs.inDebt.length === 0 ? "nikdo" : coach.clubs.inDebt.map((c, i) => (
            <span key={c.teamId}>
              {i > 0 && ", "}
              <Link href={`/tym/${c.teamId}`} className="font-bold text-card-red hover:underline">{c.name}</Link> {c.budget.toLocaleString("cs")} Kč
            </span>
          ))}
        </div>
        <div>
          <span className="text-muted">Převzetí klubů:</span>{" "}
          {coach.takeover.enabled ? "zapnuté" : "vypnuté"}
          {" · "}čeká {coach.takeover.waitingCount} (brzda {coach.takeover.brake})
          {" · "}do týdne {coach.takeover.soon.length}
          {" · "}za 7 dní převzato {coach.takeover.recent.length}
        </div>
      </div>

      {coach.recentErrors.length > 0 && (
        <div>
          <div className="text-sm font-bold mb-1">Poslední chyby</div>
          <ul className="space-y-1.5">
            {coach.recentErrors.slice(0, 3).map((e) => (
              <li key={e.id} className="text-sm">
                <span className="text-muted">{formatTime(e.createdAt)}</span>{" "}
                <Link href={`/tym/${e.teamId}`} className="font-bold hover:underline">{e.teamName ?? e.teamId.slice(0, 8)}</Link>{" "}
                <span className="text-muted">({KIND_LABELS[e.kind] ?? e.kind})</span>
                <div className="text-card-red break-words line-clamp-2">{e.error}</div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function ChecksCard({ health }: { health: Health }) {
  return (
    <div className="card p-4">
      <SectionLabel>⚙️ Kontroly zpracování</SectionLabel>
      <div className="grid gap-x-6 sm:grid-cols-2">
        {health.kontroly.map((k) => (
          <div key={k.nazev} className="flex items-start justify-between gap-3 border-b border-gray-100 py-2">
            <div className="min-w-0">
              <div className="font-heading font-bold text-base">{k.ok ? "✅" : "⚠️"} {k.nazev}</div>
              <div className="text-sm text-muted">{k.popis}</div>
            </div>
            <div className={`font-heading font-bold text-lg shrink-0 tabular-nums ${k.ok ? "" : "text-card-red"}`}>{k.hodnota}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function DashboardSection({ onOpenTab }: { onOpenTab: (tab: AdminTab) => void }) {
  const [health, setHealth] = useState<Health | null>(null);
  const [watchdog, setWatchdog] = useState<WatchdogData | null>(null);
  const [coach, setCoach] = useState<CoachStatus | null>(null);
  const [failed, setFailed] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadedAt, setLoadedAt] = useState<Date | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const fails: string[] = [];
    const [h, w, s] = await Promise.all([
      apiFetch<Health>("/api/admin/health").catch((e) => { console.error("stav zpracování:", e); fails.push("stav zpracování"); return null; }),
      apiFetch<WatchdogData>("/api/admin/watchdog").catch((e) => { console.error("hlídač:", e); fails.push("hlídač"); return null; }),
      apiFetch<CoachStatus>("/api/admin/ai-coach/status").catch((e) => { console.error("stav AI trenérů:", e); fails.push("AI trenéři"); return null; }),
    ]);
    setHealth(h);
    setWatchdog(w);
    setCoach(s);
    setFailed(fails);
    setLoadedAt(new Date());
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
    // Hlídač počítá i kurzy a opuštěné kluby, častěji než po dvou minutách nemá smysl.
    const t = setInterval(load, REFRESH_MS);
    return () => clearInterval(t);
  }, [load]);

  const issues = buildIssues(health, watchdog, coach, failed);
  const errors = issues.filter((i) => i.level === "error").length;
  const warnings = issues.filter((i) => i.level === "warning").length;
  const firstLoad = loading && !loadedAt;

  const banner = errors > 0
    ? { icon: "⛔", title: `${errors} ${errors === 1 ? "chyba" : errors < 5 ? "chyby" : "chyb"}${warnings > 0 ? `, ${warnings} varování` : ""}`, cls: "bg-red-50 text-card-red" }
    : warnings > 0
      ? { icon: "⚠️", title: `${warnings} varování`, cls: "bg-gold-50 text-gold-700" }
      : { icon: "✅", title: "Všechno běží, jak má", cls: "bg-green-50 text-green-800" };

  return (
    <div className="space-y-3">
      <div className="card p-4">
        {firstLoad ? (
          <div className="text-base text-muted">Načítám stav hry…</div>
        ) : (
          <div className={`rounded-soft p-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between ${banner.cls}`}>
            <div className="flex items-center gap-3 min-w-0">
              <span aria-hidden="true" className="text-3xl shrink-0">{banner.icon}</span>
              <div className="min-w-0">
                <div className="font-heading font-bold text-xl">{banner.title}</div>
                <div className="text-sm">
                  Herní den {health?.hodiny.herniDatum?.slice(0, 10) ?? "—"}
                  {health && <> · zpracování {health.rezim.zpracovani} · AI texty {health.rezim.aiPoskytovatel}</>}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-3 shrink-0">
              {loadedAt && <span className="text-sm">aktualizováno {loadedAt.toLocaleTimeString("cs", { hour: "2-digit", minute: "2-digit" })}</span>}
              <button onClick={load} disabled={loading} className="text-sm underline disabled:opacity-50">
                {loading ? "Načítám…" : "Obnovit"}
              </button>
            </div>
          </div>
        )}

        {health && (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 mt-3">
            <Tile label="Kola za 24 h" value={String(health.kola24h.pocet)} note={`průměr ${seconds(health.kola24h.prumerMs)}`} />
            <Tile label="Poslední kolo" value={seconds(health.posledniKolo.trvaniMs)} note={health.posledniKolo.kdy ? relativeTime(health.posledniKolo.kdy) : undefined} />
            <Tile label="AI rozhodnutí" value={coach ? String(coach.last24h.decisions) : "—"} note={coach ? `za 24 h, chyby ${coach.last24h.errors}` : undefined} />
            <Tile label="AI kluby" value={coach ? String(coach.clubs.total) : "—"} note={coach ? `v mínusu ${coach.clubs.inDebt.length}` : undefined} />
          </div>
        )}
      </div>

      <div className="grid gap-3 lg:grid-cols-2 items-start">
        <div className="card p-4">
          <SectionLabel>🚨 Chyby a varování</SectionLabel>
          {firstLoad ? <div className="text-sm text-muted">Načítám…</div> : <IssueList issues={issues} onOpenTab={onOpenTab} />}
        </div>
        {coach && <CoachCard coach={coach} onOpenTab={onOpenTab} />}
      </div>

      {health && <ChecksCard health={health} />}
    </div>
  );
}
