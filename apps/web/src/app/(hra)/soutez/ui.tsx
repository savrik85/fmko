"use client";

/**
 * Sdílené kousky UI grémia.
 *
 * Vzhled má být o stupeň slavnostnější než zbytek hry — zlatá linka, kapitálky,
 * portréty funkcionářů. Zároveň všechno musí fungovat na mobilu: nic se
 * nescrolluje do strany, tlačítka mají palcovou plochu a dlouhá jména se lámou.
 */

import React from "react";
import { EntityLink } from "@/components/ui";
import { FaceAvatar } from "@/components/players/face-avatar";

export const GOLD = "#C4A035";
export const GOLD_SOFT = "#FBF6E6";

export function czk(n: number | null | undefined): string {
  if (n === null || n === undefined) return "—";
  return `${Math.round(n).toLocaleString("cs")} Kč`;
}

export function signed(n: number): string {
  if (n === 0) return "0 Kč";
  return `${n > 0 ? "+" : "−"}${Math.abs(Math.round(n)).toLocaleString("cs")} Kč`;
}

/** České skloňování po číslovce: 1 hlas, 2–4 hlasy, 5+ hlasů. */
export function plural(n: number, one: string, few: string, many: string): string {
  if (n === 1) return one;
  if (n >= 2 && n <= 4) return few;
  return many;
}

export function formatDate(v: string): string {
  const d = new Date(v.endsWith("Z") ? v : `${v}Z`);
  if (isNaN(d.getTime())) return v.slice(0, 10);
  return d.toLocaleDateString("cs", { day: "numeric", month: "numeric", year: "numeric" });
}

/** Nadpis se zlatou linkou — nese slavnostní tón, ale nekřičí. */
export function Ornament({ children, right }: { children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 mb-3">
      <div className="section-label mb-0 shrink-0" style={{ color: "var(--color-ink-light)" }}>{children}</div>
      <div className="h-px flex-1" style={{ background: `linear-gradient(90deg, ${GOLD}, transparent)` }} />
      {right && <div className="text-sm shrink-0 tabular-nums text-muted">{right}</div>}
    </div>
  );
}

/**
 * Portrét trenéra. Do kolečka o straně B patří size = B / 1,2, jinak se ořízne brada.
 *
 * Prázdný objekt `{}` je platný JSON, ale facesjs z něj nic nevykreslí a zůstane
 * díra — v datech takoví trenéři existují. Bere se proto jako chybějící avatar
 * a místo něj se ukáže iniciála.
 */
export function Portrait({ avatar, name, size = 44, ring = GOLD }: {
  avatar: Record<string, unknown> | null | undefined;
  /** Jméno pro iniciálu, když avatar chybí. */
  name?: string | null;
  size?: number;
  ring?: string;
}) {
  const usable = !!avatar && Object.keys(avatar).length > 2;
  const initial = (name ?? "").trim().charAt(0).toUpperCase();

  return (
    <div
      className="rounded-full overflow-hidden shrink-0 flex items-end justify-center"
      style={{
        width: size, height: size,
        background: GOLD_SOFT,
        boxShadow: `inset 0 0 0 2px ${ring}`,
      }}
    >
      {usable ? (
        <FaceAvatar faceConfig={avatar} size={size / 1.2} />
      ) : (
        <span
          className="font-heading"
          style={{ fontSize: size * 0.42, lineHeight: `${size}px`, color: "var(--color-gold-700)" }}
        >
          {initial || "?"}
        </span>
      )}
    </div>
  );
}

/**
 * Jméno trenéra s klubem pod ním. Na mobilu se láme, nepřetéká.
 *
 * Klub bez trenéra se podepíše sám sebou. „Neznámý trenér" na prvním řádku
 * vypadal jako chyba dat, a přitom je to jen klub, kterému nikdo nešéfuje.
 */
export function PersonLine({ managerName, teamId, teamName, note }: {
  managerName: string | null; teamId: string; teamName: string; note?: React.ReactNode;
}) {
  const klub = <EntityLink type="team" id={teamId}>{teamName}</EntityLink>;
  return (
    <div className="min-w-0">
      <div className="text-base font-semibold leading-tight break-words">
        {managerName ?? klub}
      </div>
      <div className="text-sm text-muted leading-tight break-words">
        {managerName ? klub : "klub bez trenéra"}
        {note && <> · {note}</>}
      </div>
    </div>
  );
}

/** Prázdný stav — ať stránka nikdy nevypadá rozbitě. */
export function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div className="card p-5 text-center text-base text-muted" style={{ background: "var(--color-paper)" }}>
      {children}
    </div>
  );
}

export function Row({ label, value, strong, danger }: {
  label: React.ReactNode; value: React.ReactNode; strong?: boolean; danger?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3 text-sm py-0.5">
      <span className={strong ? "font-semibold" : "text-muted"}>{label}</span>
      <span className={`tabular-nums text-right shrink-0 ${strong ? "font-semibold" : ""} ${danger ? "text-danger" : ""}`}>
        {value}
      </span>
    </div>
  );
}

/** Barevný štítek stavu. */
export function StatusPill({ status }: { status: string }) {
  const map: Record<string, { label: string; bg: string; fg: string }> = {
    passed: { label: "Přijato", bg: "#E8F5E8", fg: "#1E4A1E" },
    rejected: { label: "Zamítnuto", bg: "#FBEAE8", fg: "#A32B1F" },
    no_quorum: { label: "Neusnášeníschopné", bg: "#F0EEE9", fg: "#5B5348" },
    withdrawn: { label: "Staženo", bg: "#F0EEE9", fg: "#5B5348" },
    gatekept: { label: "Nezařazeno", bg: "#F0EEE9", fg: "#5B5348" },
    issued: { label: "Uložena", bg: "#FBEAE8", fg: "#A32B1F" },
    appealed: { label: "Odvolání", bg: "#FBF6E6", fg: "#866D1E" },
    overturned: { label: "Zrušena", bg: "#E8F5E8", fg: "#1E4A1E" },
  };
  const s = map[status] ?? { label: status, bg: "#F0EEE9", fg: "#5B5348" };
  return (
    <span
      className="text-xs font-semibold px-2 py-1 rounded-full shrink-0 whitespace-nowrap"
      style={{ background: s.bg, color: s.fg }}
    >
      {s.label}
    </span>
  );
}

/**
 * Rozbalovací sekce pro dlouhé seznamy.
 *
 * Agenda funkcionáře jsou tři čtyři seznamy po dvaceti řádcích a na mobilu se
 * mezi nimi scrollovalo přes celé obrazovky. Zabalené je vidět všechny naráz
 * a rozbalí se ten, který zrovna řeším.
 *
 * Nic se NEROZBALUJE samo, ani „když je uvnitř něco důležitého" — jedna otevřená
 * sekce vrátí scrollování a zruší důvod, proč to sbalovací je. Co nesmí uniknout,
 * patří do `note`, která je vidět i zabalená.
 *
 * Používá `details`/`summary`, ne vlastní stav: rozbalení tak funguje i než
 * doběhne hydratace a čtečka to přečte jako to, čím to je.
 */
export function Rozbaleni({ title, right, note, children }: {
  title: React.ReactNode;
  /** Číslo napravo od nadpisu — kolik řádků se uvnitř skrývá. */
  right?: React.ReactNode;
  /** Věta pod nadpisem, viditelná i po zabalení. Sem patří to, co nesmí uniknout. */
  note?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <details className="card p-4 sm:p-5 group">
      <summary className="cursor-pointer list-none [&::-webkit-details-marker]:hidden">
        <div className="flex items-center gap-3">
          <div className="section-label mb-0 shrink-0" style={{ color: "var(--color-ink-light)" }}>
            {title}
          </div>
          <div className="h-px flex-1" style={{ background: `linear-gradient(90deg, ${GOLD}, transparent)` }} />
          {right && <div className="text-sm shrink-0 tabular-nums text-muted">{right}</div>}
          {/* Šipka se otočí přes group-open — palcová plocha je celý summary. */}
          <span
            className="shrink-0 text-muted transition-transform group-open:rotate-180"
            aria-hidden="true"
          >
            ▾
          </span>
        </div>
        {note && <div className="text-sm text-muted leading-snug mt-2">{note}</div>}
      </summary>
      <div className="mt-3">{children}</div>
    </details>
  );
}

/**
 * Klub smí mít na programu jen jeden návrh. Místo tlačítka, které by skončilo
 * chybou 409, se ukáže, čím to je.
 */
export function OpenProposalNote({ p }: { p: { title: string } }) {
  return (
    <div className="card p-5 text-sm" style={{ background: "var(--color-paper)" }}>
      <div className="font-semibold text-base">V tomhle odboru už návrh máš.</div>
      <p className="mt-1 text-muted break-words">
        „{p.title}“ — další sem podáš, až se o něm bude hlasovat. Stáhnout ho můžeš
        u samotného návrhu. V ostatních odborech ti to nebrání.
      </p>
    </div>
  );
}
