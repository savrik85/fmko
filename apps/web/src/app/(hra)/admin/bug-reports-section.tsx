"use client";

/**
 * Hlášení chyb od hráčů (menu u kroužku nápovědy → Nahlásit chybu): screen, komentář,
 * podrobnosti a odpověď hráči, která mu přijde jako SMS od „Tvůrce hry“.
 */

import { useCallback, useEffect, useState } from "react";
import { apiFetch, apiFetchBlob } from "@/lib/api";
import { SectionLabel, Spinner } from "@/components/ui";

type StatusFilter = "new" | "resolved" | "all";

interface Reply {
  id: string;
  body: string;
  created_at: string;
}

interface Diagnostics {
  userAgent?: string;
  screen?: { width: number; height: number; pixelRatio: number };
  installedApp?: boolean;
  online?: boolean;
  pages?: string[];
  errors?: Array<{ at: string; message: string }>;
  replayUrl?: string | null;
  extra?: Record<string, unknown>;
}

interface BugReport {
  id: string;
  team_id: string | null;
  team_name: string | null;
  email: string | null;
  page_url: string;
  comment: string | null;
  context: Diagnostics | null;
  status: "new" | "resolved";
  created_at: string;
  hasImage: boolean;
  replies: Reply[];
}

const FILTERS: Array<{ key: StatusFilter; label: string }> = [
  { key: "new", label: "Nové" },
  { key: "resolved", label: "Vyřešené" },
  { key: "all", label: "Vše" },
];

const REPLAY_ORIGIN = "https://eu.posthog.com";

/** Odkaz z kontextu posílá hráč: zobrazí se jen nahrávka na PostHogu přes https. */
function safeReplayUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  try {
    return new URL(value).origin === REPLAY_ORIGIN ? value : null;
  } catch (e) {
    console.warn("odkaz na nahrávku není URL:", e);
    return null;
  }
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleString("cs-CZ", { day: "numeric", month: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Prague" });
}

export function BugReportsSection() {
  const [filter, setFilter] = useState<StatusFilter>("new");
  const [reports, setReports] = useState<BugReport[] | null>(null);
  const [openCount, setOpenCount] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await apiFetch<{ reports: BugReport[]; openCount: number }>(`/api/admin/bug-reports?status=${filter}`);
      setReports(r.reports);
      setOpenCount(r.openCount);
      setError(null);
    } catch (e) {
      console.error("hlášení chyb:", e);
      setError("Hlášení se nepodařilo načíst.");
      setReports([]);
    }
  }, [filter]);

  useEffect(() => { setReports(null); void load(); }, [load]);

  return (
    <div className="card p-4">
      <SectionLabel>🐞 Hlášení chyb {openCount > 0 ? `(${openCount} nových)` : ""}</SectionLabel>
      <div className="flex gap-2 mb-3">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            onClick={() => setFilter(f.key)}
            className={`px-3 py-1.5 rounded-control text-sm font-semibold ${filter === f.key ? "bg-pitch-500 text-white" : "bg-gray-100 text-ink"}`}
          >
            {f.label}
          </button>
        ))}
      </div>
      {error && <p className="text-sm text-card-red mb-2">{error}</p>}
      {reports === null ? <Spinner /> : reports.length === 0 ? (
        <p className="text-sm text-muted">Žádné hlášení.</p>
      ) : (
        <ul className="space-y-3">
          {reports.map((r) => <ReportItem key={r.id} report={r} onChanged={load} />)}
        </ul>
      )}
    </div>
  );
}

function ReportItem({ report, onChanged }: { report: BugReport; onChanged: () => void }) {
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [imageState, setImageState] = useState<"idle" | "loading" | "error">("idle");
  const [showDetails, setShowDetails] = useState(false);
  const [reply, setReply] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => () => { if (imageUrl) URL.revokeObjectURL(imageUrl); }, [imageUrl]);

  const loadImage = async () => {
    setImageState("loading");
    try {
      const blob = await apiFetchBlob(`/api/admin/bug-reports/${report.id}/image`);
      setImageUrl(URL.createObjectURL(blob));
      setImageState("idle");
    } catch (e) {
      console.error("screen hlášení:", e);
      setImageState("error");
    }
  };

  const sendReply = async () => {
    if (!reply.trim()) return;
    setBusy(true);
    setMessage(null);
    try {
      await apiFetch(`/api/admin/bug-reports/${report.id}/reply`, { method: "POST", body: JSON.stringify({ text: reply.trim() }) });
      setReply("");
      setMessage("Odpověď odešla hráči do Telefonu.");
      onChanged();
    } catch (e) {
      console.error("odpověď na hlášení:", e);
      setMessage(e instanceof Error ? e.message : "Odpověď se nepodařilo odeslat.");
    } finally {
      setBusy(false);
    }
  };

  const setStatus = async (status: "new" | "resolved") => {
    setBusy(true);
    try {
      await apiFetch(`/api/admin/bug-reports/${report.id}/status`, { method: "POST", body: JSON.stringify({ status }) });
      onChanged();
    } catch (e) {
      console.error("stav hlášení:", e);
      setMessage("Stav se nepodařilo změnit.");
    } finally {
      setBusy(false);
    }
  };

  const ctx = report.context;
  const replayUrl = safeReplayUrl(ctx?.replayUrl);
  return (
    <li className="rounded-card border border-gray-200 p-3">
      <div className="text-sm text-muted">
        <b className="text-ink">{report.team_name ?? "bez klubu"}</b>
        {report.email ? ` · ${report.email}` : ""} · {formatTime(report.created_at)}
        {report.status === "resolved" ? " · vyřešeno" : ""}
      </div>
      <div className="text-sm text-muted mt-0.5 break-all">{report.page_url}</div>
      <p className="text-base text-ink whitespace-pre-wrap break-words mt-1">{report.comment ?? <i className="text-muted">bez komentáře</i>}</p>

      {report.hasImage && (
        imageUrl ? (
          <a href={imageUrl} target="_blank" rel="noreferrer" className="block mt-2 max-h-[60vh] overflow-y-auto rounded-control border border-gray-200">
            {/* eslint-disable-next-line @next/next/no-img-element -- blob URL, next/image ho neumí */}
            <img src={imageUrl} alt="Screen z hlášení" className="w-full h-auto" />
          </a>
        ) : (
          <button type="button" onClick={loadImage} disabled={imageState === "loading"} className="mt-2 text-sm font-semibold text-pitch-600 hover:underline">
            {imageState === "loading" ? "Načítám screen…" : imageState === "error" ? "Screen se nenačetl, zkusit znovu" : "Zobrazit screen"}
          </button>
        )
      )}

      <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-sm">
        {replayUrl && (
          <a href={replayUrl} target="_blank" rel="noopener noreferrer" className="font-semibold text-pitch-600 hover:underline">Nahrávka v PostHogu</a>
        )}
        <button type="button" onClick={() => setShowDetails(!showDetails)} className="font-semibold text-pitch-600 hover:underline">
          {showDetails ? "Skrýt podrobnosti" : "Podrobnosti"}
        </button>
      </div>
      {showDetails && ctx && (
        <div className="mt-2 rounded-control bg-gray-50 p-2 text-xs text-ink space-y-1 break-words">
          {ctx.screen && <div>Okno {ctx.screen.width}×{ctx.screen.height}, hustota {ctx.screen.pixelRatio}, {ctx.installedApp ? "nainstalovaná aplikace" : "prohlížeč"}{ctx.online === false ? ", offline" : ""}</div>}
          {ctx.userAgent && <div className="text-muted">{ctx.userAgent}</div>}
          {ctx.pages && ctx.pages.length > 0 && <div>Stránky: {ctx.pages.join(" → ")}</div>}
          {ctx.errors && ctx.errors.length > 0 ? (
            <div>
              Chyby:
              <ul className="list-disc pl-4">
                {ctx.errors.map((er, i) => <li key={i}>{formatTime(er.at)} {er.message}</li>)}
              </ul>
            </div>
          ) : <div>Chyby v konzoli: žádné</div>}
          {ctx.extra && <pre className="whitespace-pre-wrap">{JSON.stringify(ctx.extra, null, 2)}</pre>}
        </div>
      )}

      {report.replies.length > 0 && (
        <ul className="mt-2 space-y-1">
          {report.replies.map((rp) => (
            <li key={rp.id} className="text-sm rounded-control bg-pitch-50 px-2 py-1">
              <span className="text-muted">{formatTime(rp.created_at)}:</span> {rp.body}
            </li>
          ))}
        </ul>
      )}

      <textarea
        value={reply}
        onChange={(e) => setReply(e.target.value)}
        rows={2}
        maxLength={2000}
        placeholder="Odpověď hráči (přijde mu jako SMS od Tvůrce hry)"
        className="mt-2 w-full rounded-control border border-gray-300 bg-white px-3 py-2 text-sm text-ink"
      />
      {message && <p className="text-sm text-ink mt-1">{message}</p>}
      <div className="flex flex-wrap gap-2 mt-2">
        <button type="button" onClick={sendReply} disabled={busy || !reply.trim()} className="px-3 py-2 rounded-lg bg-pitch-500 text-white text-sm font-semibold disabled:opacity-50">
          Odeslat hráči
        </button>
        {report.status === "new" ? (
          <button type="button" onClick={() => setStatus("resolved")} disabled={busy} className="px-3 py-2 rounded-lg bg-gray-100 text-ink text-sm font-semibold">Vyřešeno</button>
        ) : (
          <button type="button" onClick={() => setStatus("new")} disabled={busy} className="px-3 py-2 rounded-lg bg-gray-100 text-ink text-sm font-semibold">Znovu otevřít</button>
        )}
      </div>
    </li>
  );
}
