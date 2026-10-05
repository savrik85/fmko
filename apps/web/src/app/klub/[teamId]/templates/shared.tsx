"use client";

/**
 * Společná logika všech šablon klubového webu. Šablony se liší vzhledem, ne daty:
 * formát data, sponzoři, odpočet, anketa a odkazy musí být všude stejné, jinak se
 * oprava v jedné šabloně v ostatních zapomene.
 */

import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import type { ClubWebsiteData } from "@okresni-masina/shared";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8787";

// ── Datum a čas ──────────────────────────────────────────────────────────────
// Server (edge, UTC) i prohlížeč musí vykreslit stejný den, jinak React hlásí
// hydration mismatch. Proto vždy pevně pražské pásmo.

const TZ = "Europe/Prague";

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "termín upřesníme";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "termín upřesníme";
  return d.toLocaleDateString("cs-CZ", { timeZone: TZ, day: "numeric", month: "numeric", year: "numeric" });
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "termín upřesníme";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "termín upřesníme";
  const day = d.toLocaleDateString("cs-CZ", { timeZone: TZ, weekday: "long", day: "numeric", month: "numeric" });
  const time = d.toLocaleTimeString("cs-CZ", { timeZone: TZ, hour: "2-digit", minute: "2-digit" });
  return `${day} v ${time}`;
}

// ── Přestupy ─────────────────────────────────────────────────────────────────

export function transferKindLabel(kind: string, direction: "in" | "out"): string {
  if (kind === "free_agent") return "Volný hráč";
  if (kind === "released") return direction === "in" ? "Volný hráč" : "Konec smlouvy";
  if (kind === "swap") return "Výměna";
  return direction === "in" ? "Přestup k nám" : "Přestup od nás";
}

// ── Sponzoři ─────────────────────────────────────────────────────────────────

export interface ClubPartners {
  /** Sponzor na dresu (generální partner). */
  general: string | null;
  /** Název stadionu (naming rights). */
  stadium: string | null;
  /** Ostatní partneři z bannerů kolem hřiště. */
  partners: string[];
  /** Všechna jména bez duplicit, v pořadí důležitosti. */
  all: string[];
}

/** Skuteční sponzoři klubu ze smluv. Žádná vymyšlená jména, když klub nikoho nemá, je seznam prázdný. */
export function clubPartners(data: ClubWebsiteData): ClubPartners {
  const general = data.team.jersey.sponsor || null;
  const stadium = data.team.stadium.namingSponsor || null;
  const seen = new Set<string>([general, stadium].filter(Boolean) as string[]);
  const partners: string[] = [];
  for (const name of data.team.stadium.sponsors ?? []) {
    if (name && !seen.has(name)) {
      seen.add(name);
      partners.push(name);
    }
  }
  return { general, stadium, partners, all: [...seen] };
}

// ── Odkazy ───────────────────────────────────────────────────────────────────

/** Odkaz na klubový web jiného týmu. Bez ID (např. pohárový soupeř mimo hru) zůstane text. */
export function TeamLink({ id, name, className = "" }: { id?: string | null; name: string; className?: string }) {
  if (!id) return <span className={className}>{name}</span>;
  return (
    <Link href={`/klub/${id}`} className={`hover:underline ${className}`}>
      {name}
    </Link>
  );
}

/** Odkaz na profil hráče ve hře (nepřihlášeného návštěvníka hra pošle na přihlášení). */
export function PlayerLink({ id, children, className = "" }: { id: string; children: ReactNode; className?: string }) {
  return (
    <Link href={`/hrac/${id}`} className={`hover:underline ${className}`}>
      {children}
    </Link>
  );
}

// ── Odpočet do výkopu ────────────────────────────────────────────────────────

function countdownParts(target: number, now: number) {
  const diff = Math.max(0, target - now);
  return {
    days: Math.floor(diff / 86_400_000),
    hours: Math.floor((diff % 86_400_000) / 3_600_000),
    minutes: Math.floor((diff % 3_600_000) / 60_000),
    seconds: Math.floor((diff % 60_000) / 1000),
    done: diff === 0,
  };
}

/**
 * Odpočet do výkopu. Na serveru i při prvním vykreslení ukazuje pomlčky, čas se dopočítá
 * až v prohlížeči (jinak by se lišil server a klient). Bez termínu nevykreslí nic.
 */
export function useCountdown(iso: string | null | undefined) {
  const target = iso ? new Date(iso).getTime() : NaN;
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    if (Number.isNaN(target)) return;
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [target]);

  if (Number.isNaN(target)) return null;
  if (now === null) return { days: null, hours: null, minutes: null, seconds: null, done: false };
  return countdownParts(target, now);
}

export function pad2(n: number | null): string {
  return n === null ? "--" : String(n).padStart(2, "0");
}

// ── Anketa k příštímu zápasu ─────────────────────────────────────────────────

export type PollChoice = "win" | "draw" | "loss";

/** Skutečná anketa: hlas jde na API, výsledky jsou opravdové počty hlasů. */
export function useFanPoll(data: ClubWebsiteData) {
  const poll = data.poll;
  const storageKey = poll ? `klubweb-anketa-${poll.matchId}` : null;
  const [votes, setVotes] = useState(poll?.votes ?? { win: 0, draw: 0, loss: 0 });
  const [voted, setVoted] = useState<PollChoice | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!storageKey) return;
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved === "win" || saved === "draw" || saved === "loss") setVoted(saved);
    } catch (e) {
      console.warn("anketa: nelze přečíst uložený hlas", e);
    }
  }, [storageKey]);

  const vote = async (choice: PollChoice) => {
    if (!poll || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`${API}/api/teams/${data.team.id}/website/poll`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ matchId: poll.matchId, choice }),
      });
      const json = (await res.json()) as { votes?: typeof votes; error?: string };
      if (!res.ok || !json.votes) {
        setError(json.error ?? "Hlas se nepodařilo uložit.");
        return;
      }
      setVotes(json.votes);
      setVoted(choice);
      try {
        if (storageKey) localStorage.setItem(storageKey, choice);
      } catch (e) {
        console.warn("anketa: nelze uložit hlas do prohlížeče", e);
      }
    } catch (e) {
      console.error("anketa: odeslání hlasu selhalo", e);
      setError("Hlas se nepodařilo odeslat, zkus to znovu.");
    } finally {
      setBusy(false);
    }
  };

  const total = votes.win + votes.draw + votes.loss;
  const percent = (n: number) => (total > 0 ? Math.round((n / total) * 100) : 0);

  return { poll, votes, total, percent, voted, vote, busy, error };
}

// ── Ostatní ──────────────────────────────────────────────────────────────────

/** Kotvy sekcí se po skoku nesmí schovat pod lepící lištu nahoře. */
export const ANCHOR_OFFSET = "scroll-mt-24";

/** Prázdná hodnota v tabulkách (bez dlouhé pomlčky). */
export const EMPTY = "-";
