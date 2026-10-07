"use client";

/**
 * FM tabulka atributů kádru. Stejná pro kádr A-týmu i pro záložku Atributy v U21.
 *
 * Klíčové atributy postu (váha v hodnocení 2+, `attributeImportance`) mají v každém řádku
 * stejné zvýraznění jako karta Dovednosti v profilu hráče: zelený podklad a stejné barevné
 * štítky hodnot (`attrBg`). Hráč se tak učí jeden vizuální jazyk.
 */

import { useState } from "react";
import Link from "next/link";
import { attributeImportance, coachRelationBand } from "@okresni-masina/shared";
import { PositionBadge } from "@/components/ui";
import type { Player } from "@/lib/api";
import { ATTRIBUTE_INFO, getTooltip, type AttrKey } from "@/lib/attribute-info";
import { attrBg, attrValue } from "@/lib/player-attrs";

type Pos = "GK" | "DEF" | "MID" | "FWD";
export type PosFilter = "all" | Pos;
export type PotentialMap = Map<string, { strop: number | null; uroven: string | null; slovne: string | null }>;

type SortKey = "name" | "pos" | "age" | "rat" | "pot" | "spd" | "tec" | "sho" | "pas" | "hea" | "def" | "vis" | "exp" | "cre" | "set" | "gk" | "sta" | "str" | "cond" | "mor" | "rel" | "wage";
type SortDir = "asc" | "desc";

const POSITIONS: Pos[] = ["GK", "DEF", "MID", "FWD"];
const POS_ORDER: Record<string, number> = { GK: 0, DEF: 1, MID: 2, FWD: 3 };
const POS_ACCUSATIVE: Record<Pos, string> = { GK: "brankáře", DEF: "obránce", MID: "záložníky", FWD: "útočníky" };

// skill: klíč v `skills` i ve vahách hodnocení. Jen u těchhle sloupců se zvýrazňuje.
const COLUMNS: Array<{ key: SortKey; label: string; tip?: string; attrKey?: AttrKey; skill?: string }> = [
  { key: "name", label: "Jméno", tip: "Jméno hráče" },
  { key: "pos", label: "Poz", tip: "Pozice" },
  { key: "age", label: "Věk", attrKey: "age" },
  { key: "rat", label: "Rat", attrKey: "rat" },
  { key: "pot", label: "Pot", tip: "Potenciál, kam hráč reálně dojde, než ho dožene věk. Odhad skauta, bez skauta se nezobrazí." },
  { key: "spd", label: "Rch", attrKey: "spd", skill: "speed" },
  { key: "tec", label: "Tch", attrKey: "tec", skill: "technique" },
  { key: "sho", label: "Stř", attrKey: "sho", skill: "shooting" },
  { key: "pas", label: "Přh", attrKey: "pas", skill: "passing" },
  { key: "hea", label: "Hlv", attrKey: "hea", skill: "heading" },
  { key: "def", label: "Obr", attrKey: "def", skill: "defense" },
  { key: "vis", label: "Pře", attrKey: "vis", skill: "vision" },
  { key: "exp", label: "Zku", attrKey: "exp", skill: "experience" },
  { key: "cre", label: "Kre", attrKey: "cre", skill: "creativity" },
  { key: "set", label: "Std", attrKey: "set", skill: "setPieces" },
  { key: "gk", label: "Brk", attrKey: "gk", skill: "goalkeeping" },
  { key: "sta", label: "Výd", attrKey: "sta", skill: "stamina" },
  { key: "str", label: "Síl", attrKey: "str", skill: "strength" },
  { key: "cond", label: "Kon", attrKey: "cond" },
  { key: "mor", label: "Mor", attrKey: "mor" },
  { key: "rel", label: "Vzt", tip: "Vztah hráče k tobě (trenérovi). 0 nepřítel, 50 neutrál, 100 oddán" },
  { key: "wage", label: "Mzda", attrKey: "wage" },
];

const POS_DOT_COLOR: Record<Pos, string> = {
  GK: "bg-gold-500",
  DEF: "bg-blue-500",
  MID: "bg-pitch-500",
  FWD: "bg-card-red",
};

// Štítek hodnoty 1:1 jako v kartě Dovednosti profilu hráče.
const VALUE_BADGE = "inline-flex items-center justify-center w-8 h-6 rounded text-xs font-heading font-bold tabular-nums";

/** Posty, pro které je atribut klíčový. Ze stejných vah jako zvýraznění v řádcích. */
function keyPositions(skill: string): Pos[] {
  return POSITIONS.filter((pos) => attributeImportance(pos, skill) === "key");
}

function columnTip(col: (typeof COLUMNS)[number]): string {
  if (col.skill && col.attrKey) {
    const info = ATTRIBUTE_INFO[col.attrKey];
    const positions = keyPositions(col.skill);
    const keyFor = positions.length > 0
      ? `Klíčové pro: ${positions.map((p) => POS_ACCUSATIVE[p]).join(", ")}`
      : "Pro žádný post není klíčový";
    return `${info.label} ${info.description}\n${keyFor}`;
  }
  return col.attrKey ? getTooltip(col.attrKey) : col.tip ?? "";
}

/**
 * Hodnota atributu, dohledaná stejně jako v kartě Dovednosti profilu hráče: výdrž a síla
 * z `physical`, přehled a zkušenost přes `attrValue`, chybějící standardky 50 a kreativita 0.
 */
function skillValue(p: Player, skill: string): number | undefined {
  if (skill === "vision" || skill === "experience") return attrValue(p, skill);
  if (skill === "stamina" || skill === "strength") {
    const fromPhysical = (p.physical as unknown as Record<string, number> | undefined)?.[skill];
    if (typeof fromPhysical === "number") return fromPhysical;
  }
  const flat = (p.skills as Record<string, number> | undefined)?.[skill];
  if (typeof flat === "number") return flat;
  if (skill === "setPieces") return 50;
  return skill === "creativity" ? 0 : undefined;
}

function getVal(p: Player, key: SortKey, potential: PotentialMap): string | number {
  const lc = p.lifeContext as unknown as Record<string, number> | undefined;
  switch (key) {
    // Bez skauta potenciál neznáme. Takoví hráči padají na konec, ne na začátek.
    case "pot": return potential.get(p.id)?.strop ?? -1;
    case "name": return `${p.last_name} ${p.first_name}`;
    case "pos": return POS_ORDER[p.position] ?? 9;
    case "age": return p.age;
    case "rat": return p.overall_rating ?? 0;
    case "spd": return skillValue(p, "speed") ?? 0;
    case "tec": return skillValue(p, "technique") ?? 0;
    case "sho": return skillValue(p, "shooting") ?? 0;
    case "pas": return skillValue(p, "passing") ?? 0;
    case "hea": return skillValue(p, "heading") ?? 0;
    case "def": return skillValue(p, "defense") ?? 0;
    case "vis": return skillValue(p, "vision") ?? 0;
    case "exp": return skillValue(p, "experience") ?? 0;
    case "cre": return skillValue(p, "creativity") ?? 0;
    case "set": return skillValue(p, "setPieces") ?? 0;
    case "gk": return skillValue(p, "goalkeeping") ?? 0;
    case "sta": return skillValue(p, "stamina") ?? 0;
    case "str": return skillValue(p, "strength") ?? 0;
    case "cond": return lc?.condition ?? 0;
    case "mor": return lc?.morale ?? 0;
    case "rel": return p.coach_relationship ?? 50;
    case "wage": return p.weekly_wage ?? 0;
  }
}

function condColor(v: number): string {
  if (v >= 80) return "text-pitch-500";
  if (v >= 50) return "text-gold-600";
  return "text-card-red";
}

function moraleIcon(v: number): string {
  if (v >= 80) return "😊";
  if (v >= 60) return "🙂";
  if (v >= 40) return "😐";
  if (v >= 20) return "😞";
  return "😡";
}

/** Segmentový filtr postu nad tabulkou. Počty se berou z celého kádru, ne z filtru. */
export function PositionFilter({ players, value, onChange }: {
  players: Array<{ position: string }>;
  value: PosFilter;
  onChange: (value: PosFilter) => void;
}) {
  const counts = { GK: 0, DEF: 0, MID: 0, FWD: 0 };
  for (const p of players) if (p.position in counts) counts[p.position as Pos]++;
  return (
    <div className="card p-3">
      <div className="text-micro text-muted font-heading uppercase tracking-wide mb-2">Filtr pozice</div>
      <div className="flex rounded-xl bg-gray-50 p-0.5 gap-0.5">
        {([
          ["all", "Vše", players.length],
          ["GK", "Brankáři", counts.GK],
          ["DEF", "Obrana", counts.DEF],
          ["MID", "Záloha", counts.MID],
          ["FWD", "Útok", counts.FWD],
        ] as Array<[PosFilter, string, number]>).map(([pos, label, count]) => (
          <button
            key={pos}
            onClick={() => onChange(pos)}
            aria-pressed={value === pos}
            className={`flex-1 py-1.5 px-1 rounded-soft text-center transition-all font-heading font-bold ${
              value === pos
                ? "bg-white shadow-sm text-pitch-600"
                : "text-muted hover:text-ink"
            }`}
          >
            <div className="text-xs sm:text-sm truncate">{label}</div>
            <div className={`text-micro tabular-nums ${value === pos ? "text-pitch-500" : "text-muted-light"}`}>{count}</div>
          </button>
        ))}
      </div>
    </div>
  );
}

export function SquadAttributeTable({ players, potential = new Map() }: { players: Player[]; potential?: PotentialMap }) {
  const [sortKey, setSortKey] = useState<SortKey>("rat");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const sorted = [...players].sort((a, b) => {
    const va = getVal(a, sortKey, potential);
    const vb = getVal(b, sortKey, potential);
    const cmp = typeof va === "string" ? va.localeCompare(vb as string, "cs") : (va as number) - (vb as number);
    return sortDir === "asc" ? cmp : -cmp;
  });

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir(sortDir === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir(key === "name" ? "asc" : "desc"); }
  };

  return (
    <>
      <div className="card overflow-x-auto table-scroll">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b-2 border-gray-200">
              {COLUMNS.map((col) => {
                const dots = col.skill ? keyPositions(col.skill) : [];
                return (
                  <th key={col.key}
                    onClick={() => toggleSort(col.key)}
                    title={columnTip(col)}
                    aria-sort={sortKey === col.key ? (sortDir === "asc" ? "ascending" : "descending") : "none"}
                    className={`py-2.5 px-1 font-heading uppercase cursor-help select-none hover:text-pitch-500 transition-colors whitespace-nowrap ${
                      sortKey === col.key ? "text-pitch-600 bg-pitch-50" : "text-muted"
                    } ${col.key === "name" ? "text-left pl-3 sticky left-0 bg-white z-10" : "text-center"}`}
                  >
                    <div className={`flex flex-col gap-0.5 ${col.key === "name" ? "items-start" : "items-center"}`}>
                      <span>{col.label}{sortKey === col.key ? (sortDir === "asc" ? " ↑" : " ↓") : ""}</span>
                      {dots.length > 0 && dots.length < 4 && (
                        <span className="flex gap-0.5" aria-hidden="true">
                          {dots.map((p) => (
                            <span key={p} className={`w-1 h-1 rounded-full ${POS_DOT_COLOR[p]}`} />
                          ))}
                        </span>
                      )}
                    </div>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {sorted.map((p) => {
              const lc = p.lifeContext as unknown as Record<string, number> | undefined;
              const cond = lc?.condition ?? 100;
              const morale = lc?.morale ?? 50;
              const rel = p.coach_relationship ?? 50;
              const relBand = coachRelationBand(rel);
              const isQuit = p.status === "quit";
              const pot = potential.get(p.id);
              const potColor = pot?.uroven === "hvezda" ? "text-gold-600"
                : pot?.uroven === "nadejny" ? "text-pitch-500"
                : pot?.uroven === "prumer" ? "text-blue-600" : "text-muted";

              return (
                <tr key={p.id} className={`border-b border-gray-50 hover:bg-pitch-50/30 transition-colors ${isQuit ? "opacity-40" : ""}`}>
                  {/* Jméno — sticky */}
                  <td className="py-2 px-1.5 pl-3 sticky left-0 bg-white z-10">
                    <Link href={`/hrac/${p.id}`}
                      className="font-heading font-bold text-sm hover:text-pitch-500 underline decoration-pitch-500/20 transition-colors whitespace-nowrap">
                      {p.first_name} {p.last_name}
                    </Link>
                    {p.loan_from_team_id && (
                      <span className="ml-1.5 text-micro bg-yellow-100 text-yellow-700 font-heading font-bold px-1.5 py-0.5 rounded-full">Host.</span>
                    )}
                    {(() => {
                      const inj = p.injury;
                      if (!inj) return null;
                      const daysLabel = inj.daysRemaining === 1 ? "den" : inj.daysRemaining < 5 ? "dny" : "dní";
                      const tip = `Zraněný${inj.type ? `: ${inj.type}` : ""} · ${inj.daysRemaining} ${daysLabel} do návratu`;
                      return (
                        <span className="ml-1.5 text-micro bg-red-100 text-red-700 font-heading font-bold px-1.5 py-0.5 rounded-full cursor-help" title={tip} aria-label={tip}>🩹</span>
                      );
                    })()}
                    {(() => {
                      const abs = (p as unknown as { absence?: { reason?: string } | null }).absence;
                      if (!abs) return null;
                      const tip = `Chybí dnes${abs.reason ? `: ${abs.reason}` : ""}`;
                      return (
                        <span className="ml-1.5 text-micro bg-amber-100 text-amber-700 font-heading font-bold px-1.5 py-0.5 rounded-full cursor-help" title={tip} aria-label={tip}>🚫</span>
                      );
                    })()}
                    {(lc as unknown as { hangover?: number | boolean } | undefined)?.hangover ? (
                      <span className="ml-1.5 cursor-help" title="Ranní kocovina po včerejší výhře (−15 kondice)" aria-label="Kocovina">🍺</span>
                    ) : null}
                  </td>
                  <td className="py-2 px-1 text-center"><PositionBadge position={p.position as Pos} /></td>
                  <td className="py-2 px-1 text-center tabular-nums text-muted">{p.age}</td>
                  <td className="py-1.5 px-1 text-center">
                    <span className={`${VALUE_BADGE} ${attrBg(p.overall_rating ?? 0)}`}>{p.overall_rating}</span>
                  </td>
                  {/* Potenciál: barva nese verdikt skauta, ať jde kádr přeletět očima. */}
                  <td
                    className={`py-2 px-1 text-center tabular-nums font-heading font-bold ${potColor}`}
                    title={pot?.slovne ?? "Bez skauta v realizačním týmu potenciál neodhadneš"}
                  >
                    {pot?.strop ?? "—"}
                  </td>
                  {COLUMNS.filter((col) => col.skill).map((col) => {
                    const v = skillValue(p, col.skill!);
                    const isKey = attributeImportance(p.position, col.skill!) === "key";
                    // Podklad sám je mezi štítky skoro neviditelný, proto se ostatní atributy
                    // ztlumí. Klíčové pak v řádku vystoupí bez nové barvy.
                    return (
                      <td key={col.key} className={`py-1.5 px-1 text-center ${isKey ? "bg-pitch-50/70" : "opacity-40"}`}>
                        {typeof v === "number"
                          ? <span className={`${VALUE_BADGE} ${attrBg(v)}`}>{v}</span>
                          : <span className="text-muted">—</span>}
                      </td>
                    );
                  })}
                  <td className={`py-2 px-1 text-center tabular-nums font-heading font-bold ${condColor(cond)}`}>{cond}%</td>
                  <td className="py-2 px-1 text-center" title={`${morale}%`}>{moraleIcon(morale)}</td>
                  <td className="py-2 px-1 text-center" title={`${relBand.label} (${rel}/100)`}>
                    <span className="inline-flex items-center gap-1 tabular-nums">
                      <span>{relBand.icon}</span>
                      <span className="text-micro text-muted">{rel}</span>
                    </span>
                  </td>
                  <td className="py-2 px-1.5 text-center tabular-nums text-muted">{(p.weekly_wage ?? 0).toLocaleString("cs")}</td>
                </tr>
              );
            })}
            {sorted.length === 0 && (
              <tr>
                <td colSpan={COLUMNS.length} className="py-6 text-center text-sm text-muted">Žádní hráči neodpovídají filtru.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="card p-3 space-y-2 text-sm text-muted">
        <p>
          <span className="inline-flex items-center gap-1.5 rounded bg-pitch-50/70 px-2 py-0.5 font-bold text-pitch-700">
            <span className="text-pitch-500 text-micro leading-none" aria-hidden>●</span>Zvýrazněné
          </span>{" "}
          jsou atributy klíčové pro post hráče, stejně jako v dovednostech hráče. Ostatní jsou ztlumené.
        </p>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span>Tečky u hlaviček: pro koho je atribut klíčový</span>
          <span className="flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-gold-500" /> Brankář</span>
          <span className="flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-blue-500" /> Obrana</span>
          <span className="flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-pitch-500" /> Záloha</span>
          <span className="flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-card-red" /> Útok</span>
        </div>
        <p>Klepnutím na hlavičku sloupce podle něj seřadíš. Najetím myší zjistíš, co atribut dělá.</p>
      </div>
    </>
  );
}
