"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { apiFetch, type Player } from "@/lib/api";
import { attrValue, withBody } from "@/lib/player-attrs";
import { PositionBadge, SectionLabel } from "@/components/ui";
import { FaceAvatar } from "@/components/players/face-avatar";
import { attributeImportance } from "@okresni-masina/shared";

/** Poslední hráč, se kterým se srovnávalo — při listování cizím kádrem zůstane vybraný. */
const STORAGE_KEY = "player-compare-id";

const POS_SHORT: Record<string, string> = { GK: "BRA", DEF: "OBR", MID: "ZÁL", FWD: "ÚTO" };
const POS_GENITIVE: Record<string, string> = { GK: "brankáře", DEF: "obránce", MID: "záložníka", FWD: "útočníka" };

interface SquadPlayer extends Player {
  isU21: boolean;
}

interface AttrDef {
  key: string;
  label: string;
  read: (p: Player) => number;
  /** Nižší je lepší (náchylnost ke zraněním). */
  inverted?: boolean;
  gkOnly?: boolean;
}

// Stejné pořadí, stejné náhradní hodnoty a stejné úpravy postavou jako karta Dovednosti v profilu.
const ATTRS: AttrDef[] = [
  { key: "speed", label: "Rychlost", read: (p) => withBody(p.skills?.speed ?? 0, p.body?.effects.speed) },
  { key: "technique", label: "Technika", read: (p) => p.skills?.technique ?? 0 },
  { key: "shooting", label: "Střelba", read: (p) => p.skills?.shooting ?? 0 },
  { key: "passing", label: "Přihrávky", read: (p) => p.skills?.passing ?? 0 },
  { key: "heading", label: "Hlavičky", read: (p) => withBody(p.skills?.heading ?? 0, p.body?.effects.heading) },
  { key: "defense", label: "Obrana", read: (p) => p.skills?.defense ?? 0 },
  { key: "vision", label: "Přehled", read: (p) => attrValue(p, "vision") },
  { key: "experience", label: "Zkušenost", read: (p) => attrValue(p, "experience") },
  { key: "creativity", label: "Kreativita", read: (p) => p.skills?.creativity ?? 0 },
  { key: "setPieces", label: "Standardky", read: (p) => p.skills?.setPieces ?? 50 },
  { key: "goalkeeping", label: "Brankář", read: (p) => p.skills?.goalkeeping ?? 0, gkOnly: true },
  { key: "stamina", label: "Výdrž", read: (p) => withBody(p.physical?.stamina ?? 0, p.body?.effects.stamina) },
  { key: "strength", label: "Síla", read: (p) => withBody(p.physical?.strength ?? 0, p.body?.effects.strength) },
  {
    key: "injuryProneness", label: "Náchylnost", inverted: true,
    read: (p) => p.physical?.injuryProneness ?? p.personality?.injuryProneness ?? 50,
  },
];

function readStoredId(): string | null {
  try {
    return window.sessionStorage.getItem(STORAGE_KEY);
  } catch (e) {
    console.warn("srovnání hráčů – čtení sessionStorage:", e);
    return null;
  }
}

function storeId(id: string | null) {
  try {
    if (id) window.sessionStorage.setItem(STORAGE_KEY, id);
    else window.sessionStorage.removeItem(STORAGE_KEY);
  } catch (e) {
    console.warn("srovnání hráčů – zápis sessionStorage:", e);
  }
}

/** -1 = lepší je levý (prohlížený), 1 = pravý (můj), 0 = vyrovnané. */
function winner(left: number, right: number, inverted: boolean, tolerance: number): -1 | 0 | 1 {
  const diff = inverted ? left - right : right - left;
  if (Math.abs(diff) <= tolerance) return 0;
  return diff > 0 ? 1 : -1;
}

/**
 * Srovnání atributů prohlíženého hráče s libovolným hráčem z mého kádru (áčko i U21).
 *
 * Cizího hráče API posílá zaokrouhleného na pětky. Pokud je prohlížený hráč v mém kádru,
 * bere se jeho přesný záznam ze seznamu kádru (detail mého U21 hráče chodí zamlžený).
 */
export function PlayerCompare({ teamId, player, exactValues }: {
  teamId: string;
  player: Player;
  /** Detail hráče už nese přesné hodnoty (kmenový klub hráče na hostování). */
  exactValues: boolean;
}) {
  const [squad, setSquad] = useState<SquadPlayer[] | null>(null);
  const [compareId, setCompareId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [senior, u21] = await Promise.all([
        apiFetch<Player[]>(`/api/teams/${teamId}/players`),
        apiFetch<{ u21TeamId: string | null }>(`/api/teams/${teamId}/u21`)
          .catch((e) => { console.error("srovnání hráčů – U21 tým:", e); return { u21TeamId: null }; }),
      ]);
      const youth = u21.u21TeamId
        ? await apiFetch<Player[]>(`/api/teams/${u21.u21TeamId}/players`)
          .catch((e) => { console.error("srovnání hráčů – kádr U21:", e); return [] as Player[]; })
        : [];
      if (cancelled) return;
      setSquad([
        ...senior.map((p) => ({ ...p, isU21: false })),
        ...youth.map((p) => ({ ...p, isU21: true })),
      ]);
    })().catch((e) => {
      console.error("srovnání hráčů – načtení kádru:", e);
      if (!cancelled) setSquad([]);
    });
    return () => { cancelled = true; };
  }, [teamId]);

  // Předvybrat hráče z minulého srovnání, pokud v kádru pořád je a není to ten prohlížený.
  useEffect(() => {
    if (!squad) return;
    const stored = readStoredId();
    setCompareId(stored && stored !== player.id && squad.some((p) => p.id === stored) ? stored : null);
  }, [squad, player.id]);

  const ownRecord = squad?.find((p) => p.id === player.id) ?? null;
  const subject: Player = ownRecord ?? player;
  const approximate = !ownRecord && !exactValues;

  const options = useMemo(() => {
    const others = (squad ?? []).filter((p) => p.id !== player.id);
    const byRating = (a: SquadPlayer, b: SquadPlayer) => (b.overall_rating ?? 0) - (a.overall_rating ?? 0);
    return {
      samePosition: others.filter((p) => p.position === player.position).sort(byRating),
      seniorOther: others.filter((p) => p.position !== player.position && !p.isU21).sort(byRating),
      youthOther: others.filter((p) => p.position !== player.position && p.isU21).sort(byRating),
    };
  }, [squad, player.id, player.position]);

  const other = squad?.find((p) => p.id === compareId) ?? null;

  if (squad === null) return null;
  const hasOthers = options.samePosition.length + options.seniorOther.length + options.youthOther.length > 0;
  if (!hasOthers) return null;

  const choose = (id: string) => {
    const next = id || null;
    setCompareId(next);
    storeId(next);
  };

  const optionLabel = (p: SquadPlayer) =>
    `${POS_SHORT[p.position] ?? p.position} · ${p.first_name} ${p.last_name} · ${p.overall_rating}${p.isU21 ? " (U21)" : ""}`;

  const showGk = subject.position === "GK" || other?.position === "GK";
  const rows = ATTRS.filter((a) => !a.gkOnly || showGk);
  // U zamlženého hráče je skutečná hodnota až o 2 body jinde, menší rozdíl nic neříká.
  const tolerance = approximate ? 2 : 0;

  const results = other
    ? rows.map((a) => {
        const left = a.read(subject);
        const right = a.read(other);
        return { attr: a, left, right, win: winner(left, right, !!a.inverted, tolerance) };
      })
    : [];
  const ratingWin = other ? winner(subject.overall_rating ?? 0, other.overall_rating ?? 0, false, 0) : 0;

  return (
    <div className="card p-4 sm:p-5">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 sm:gap-4">
        <SectionLabel>Srovnání s hráčem z kádru</SectionLabel>
        <select
          value={compareId ?? ""}
          onChange={(e) => choose(e.target.value)}
          aria-label="Hráč z kádru ke srovnání"
          className={`w-full sm:w-96 px-3 py-2.5 rounded-soft border-2 bg-white text-base font-heading transition-colors ${
            other ? "border-pitch-500/40 text-ink" : "border-gray-200 text-muted"
          }`}
        >
          <option value="">Vyber hráče z kádru</option>
          {options.samePosition.length > 0 && (
            <optgroup label={`Stejný post (${POS_SHORT[player.position] ?? player.position})`}>
              {options.samePosition.map((p) => <option key={p.id} value={p.id}>{optionLabel(p)}</option>)}
            </optgroup>
          )}
          {options.seniorOther.length > 0 && (
            <optgroup label="Ostatní z A-týmu">
              {options.seniorOther.map((p) => <option key={p.id} value={p.id}>{optionLabel(p)}</option>)}
            </optgroup>
          )}
          {options.youthOther.length > 0 && (
            <optgroup label="Ostatní z U21">
              {options.youthOther.map((p) => <option key={p.id} value={p.id}>{optionLabel(p)}</option>)}
            </optgroup>
          )}
        </select>
      </div>

      {other && (
        <div className="mt-4">
          {/* Hlavička: prohlížený hráč vlevo, můj hráč vpravo */}
          <div className="grid grid-cols-2 items-start gap-3 pb-4 border-b border-gray-100">
            <PlayerHead player={subject} side="left" win={ratingWin === -1} />
            <PlayerHead player={other} side="right" link isU21={other.isU21} win={ratingWin === 1} />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 lg:gap-x-10 gap-y-0.5 mt-2">
            {results.map(({ attr, left, right, win }) => (
              <CompareRow
                key={attr.key}
                label={attr.label}
                left={left}
                right={right}
                win={win}
                isKey={attributeImportance(subject.position, attr.key) === "key"}
              />
            ))}
          </div>

          <p className="mt-3 pt-3 border-t border-gray-100 text-sm text-muted">
            Plné číslo a barevný pruh má ten, kdo je v atributu lepší. U náchylnosti ke zraněním je lepší nižší číslo.
            {" "}<span className="text-pitch-500 text-micro leading-none" aria-hidden>●</span> Zvýrazněné jsou klíčové pro {POS_GENITIVE[subject.position] ?? "tento post"}.
            {approximate && " Hráče z cizího klubu znáš jen přibližně (na pětky), rozdíl do 2 bodů se proto počítá jako vyrovnaný."}
          </p>
        </div>
      )}
    </div>
  );
}

/** Každý hráč má ve srovnání svou barvu, aby bylo hned vidět, čí je který řádek. */
const SIDE = {
  left: { text: "text-blue-600", bg: "bg-blue-600", bar: "bg-blue-500" },
  right: { text: "text-pitch-500", bg: "bg-pitch-500", bar: "bg-pitch-400" },
} as const;

function PlayerHead({ player, side, link, isU21, win }: {
  player: Player;
  side: "left" | "right";
  link?: boolean;
  isU21?: boolean;
  win: boolean;
}) {
  const name = `${player.first_name} ${player.last_name}`;
  const right = side === "right";
  const colors = SIDE[side];
  return (
    <div className={`min-w-0 flex flex-col ${right ? "items-end text-right" : "items-start"}`}>
      <div className={`flex items-center gap-3 ${right ? "flex-row-reverse" : ""}`}>
        <FaceAvatar faceConfig={player.avatar} size={40} className="shrink-0 hidden sm:block bg-gray-50 rounded-xl" />
        <div className="min-w-0">
          <div className={`h-1 w-8 rounded-full mb-1.5 ${colors.bg} ${right ? "ml-auto" : ""}`} aria-hidden />
          <div className="font-heading font-bold text-base leading-tight break-words">
            {link ? <Link href={`/hrac/${player.id}`} className="hover:underline">{name}</Link> : name}
          </div>
          <div className={`flex items-center gap-1.5 mt-1 text-sm text-muted ${right ? "justify-end" : ""}`}>
            <PositionBadge position={player.position} />
            <span>{player.age} let{isU21 ? " · U21" : ""}</span>
          </div>
        </div>
      </div>
      <div className="mt-2 font-heading tabular-nums leading-none">
        <span className={`font-extrabold text-2xl ${win ? colors.text : "text-ink"}`}>{player.overall_rating}</span>
        <span className="ml-1 text-sm font-bold text-muted">rating</span>
      </div>
    </div>
  );
}

function CompareRow({ label, left, right, win, isKey }: {
  label: string;
  left: number;
  right: number;
  win: -1 | 0 | 1;
  isKey: boolean;
}) {
  const width = (v: number) => `${Math.max(0, Math.min(100, v))}%`;
  const badge = (side: "left" | "right") => {
    const won = win === (side === "left" ? -1 : 1);
    if (won) return `${SIDE[side].bg} text-white`;
    if (win === 0) return "bg-gray-100 text-ink";
    return "text-gray-400";
  };
  const bar = (side: "left" | "right") => {
    const won = win === (side === "left" ? -1 : 1);
    if (won) return SIDE[side].bar;
    return win === 0 ? "bg-gray-400" : "bg-gray-200";
  };
  return (
    <div className={`grid grid-cols-[2.5rem_1fr_6.25rem_1fr_2.5rem] items-center gap-1.5 py-1.5 -mx-2 px-2 rounded-lg ${isKey ? "bg-pitch-50/70" : ""}`}>
      <span className={`inline-flex items-center justify-center h-7 rounded-md text-sm font-heading font-bold tabular-nums ${badge("left")}`}>{left}</span>
      <div className="h-2.5 rounded-full bg-gray-100 flex justify-end overflow-hidden">
        <div className={`h-full rounded-full ${bar("left")}`} style={{ width: width(left) }} />
      </div>
      <span className={`text-sm text-center truncate ${isKey ? "text-pitch-700 font-bold" : "text-ink-light"}`}>
        {isKey && <span className="text-pitch-500 text-micro leading-none mr-1" aria-hidden>●</span>}
        {label}
      </span>
      <div className="h-2.5 rounded-full bg-gray-100 flex justify-start overflow-hidden">
        <div className={`h-full rounded-full ${bar("right")}`} style={{ width: width(right) }} />
      </div>
      <span className={`inline-flex items-center justify-center h-7 rounded-md text-sm font-heading font-bold tabular-nums ${badge("right")}`}>{right}</span>
    </div>
  );
}
