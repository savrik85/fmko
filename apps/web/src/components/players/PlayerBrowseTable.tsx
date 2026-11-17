"use client";

/**
 * Tabulka hráčů na procházení — kádr cizího týmu, sledovaní hráči, hráči na prodej.
 *
 * Počítač: řaditelná tabulka. Mobil: seznam bez sloupců navíc; u každého hráče čtyři
 * klíčové dovednosti jeho pozice s popiskem a výběr řazení nad seznamem.
 *
 * Dovednosti a kondici cizích hráčů posílá API už zaokrouhlené. Tržní cena je jen odhad
 * zaokrouhlený na tisíce, stejně jako v profilu hráče. U hráčů na prodej je navíc cena
 * z inzerátu a tlačítko nabídky.
 */

import { useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { marketValue, marketValueEstimate } from "@okresni-masina/shared";
import { PositionBadge, DataTable, EntityCell, RatingPill, ratingToneIn, ListCard, ListRow, ListEmpty, type DataColumn } from "@/components/ui";
import { attrBg } from "@/lib/player-attrs";
import { FaceAvatar } from "@/components/players/face-avatar";
import { TeamName } from "@/components/manager/team-name";
import { formatKc } from "@/lib/format";

type Position = "GK" | "DEF" | "MID" | "FWD";
type SkillKey = "speed" | "technique" | "shooting" | "passing" | "heading" | "defense" | "goalkeeping";
type PosFilter = "all" | Position;
type SortKey = "position" | "name" | "club" | "age" | "rating" | SkillKey | "condition" | "value" | "price";
type SortDir = "asc" | "desc";

export interface BrowseRow {
  id: string;
  firstName: string;
  lastName: string;
  nickname?: string | null;
  age: number;
  position: Position;
  rating: number;
  skills: Partial<Record<SkillKey, number>>;
  avatar?: Record<string, unknown> | null;
  condition?: number | null;
  injury?: { type: string | null; daysRemaining: number } | null;
  club?: { id: string; name: string } | null;
  form?: { matches: number; goals: number; assists: number; avgRating: number } | null;
  watchedSince?: string | null;
  /** Co udělá klik na řádek. Bez něj profil hráče; volný hráč profil nemá. */
  onOpen?: () => void;
  /** Text místo klubu, když hráč žádný nemá (třeba „volný hráč"). */
  clubLabel?: string;
  /** Klub vede AI trenér: u názvu klubu robot. */
  clubIsAi?: boolean;
  /** Cena z inzerátu (sloupec `price`). */
  price?: number | null;
  /** Štítek za jménem (třeba okres hráče z jiné soutěže). */
  tag?: ReactNode;
  /** Tlačítko u hráče (sloupec `action`), třeba nabídka na hráče z trhu. */
  action?: ReactNode;
}

const POS_LABELS: Record<Position, string> = { GK: "BRA", DEF: "OBR", MID: "ZÁL", FWD: "ÚTO" };
const POS_ORDER: Record<string, number> = { GK: 0, DEF: 1, MID: 2, FWD: 3 };

const SKILL_COLUMNS: Array<{ key: SkillKey; short: string; label: string }> = [
  { key: "speed", short: "Rch", label: "Rychlost" },
  { key: "technique", short: "Tch", label: "Technika" },
  { key: "shooting", short: "Stř", label: "Střelba" },
  { key: "passing", short: "Při", label: "Přihrávky" },
  { key: "heading", short: "Hlv", label: "Hlavičky" },
  { key: "defense", short: "Obr", label: "Obrana" },
  { key: "goalkeeping", short: "Brn", label: "Brankář" },
];

/** Čtyři dovednosti, podle kterých se hráč na své pozici posuzuje. */
const KEY_SKILLS: Record<Position, SkillKey[]> = {
  GK: ["goalkeeping", "defense", "heading", "passing"],
  DEF: ["defense", "heading", "speed", "passing"],
  MID: ["technique", "passing", "shooting", "speed"],
  FWD: ["shooting", "speed", "technique", "heading"],
};

const MOBILE_SORTS: Array<{ key: SortKey; label: string }> = [
  { key: "position", label: "Pozice" },
  { key: "rating", label: "Hodnocení" },
  { key: "value", label: "Tržní cena" },
  { key: "age", label: "Věk" },
];
const PRICE_SORT: { key: SortKey; label: string } = { key: "price", label: "Cena" };

const rowValue = (r: BrowseRow) => marketValueEstimate(marketValue(r.rating, r.age, r.position));
const formatValue = (v: number) => `cca ${formatKc(v)}`;
const skillShort = (k: SkillKey) => SKILL_COLUMNS.find((c) => c.key === k)?.short ?? k;
const formatForm = (f: NonNullable<BrowseRow["form"]>) =>
  `${f.matches} z · ${f.goals} g · ${f.assists} a${f.matches > 0 ? ` · ${f.avgRating.toFixed(1)}` : ""}`;
function formatDay(iso: string): string {
  const d = new Date(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(iso) ? `${iso.replace(" ", "T")}Z` : iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString("cs", { day: "numeric", month: "numeric" });
}

function attrColor(value: number): string {
  if (value >= 70) return "text-pitch-400 font-bold";
  if (value >= 50) return "text-pitch-600";
  if (value >= 30) return "text-ink";
  if (value >= 15) return "text-gold-600";
  return "text-card-red";
}

function sortValue(r: BrowseRow, key: SortKey): number | string {
  switch (key) {
    case "position": return POS_ORDER[r.position] ?? 9;
    case "name": return r.lastName;
    case "club": return r.club?.name ?? r.clubLabel ?? "";
    case "age": return r.age;
    case "rating": return r.rating;
    case "condition": return r.condition ?? 0;
    case "value": return rowValue(r);
    case "price": return r.price ?? 0;
    default: return r.skills[key] ?? 0;
  }
}

export function PlayerBrowseTable({ rows, color, onColorText, ratingColor, columns, onRemove, emptyText, defaultSort = "position" }: {
  rows: BrowseRow[];
  color: string;
  onColorText: string;
  ratingColor: string;
  columns: { club?: boolean; condition?: boolean; form?: boolean; watchedSince?: boolean; price?: boolean; action?: boolean; value?: boolean };
  onRemove?: (row: BrowseRow) => void;
  emptyText?: string;
  /** Výchozí řazení (pozice vzestupně, ostatní sestupně). */
  defaultSort?: SortKey;
}) {
  const router = useRouter();
  const [filter, setFilter] = useState<PosFilter>("all");
  const [sortKey, setSortKey] = useState<SortKey>(defaultSort);
  const [sortDir, setSortDir] = useState<SortDir>(defaultSort === "position" ? "asc" : "desc");
  const showValue = columns.value !== false;
  const mobileSorts = [...MOBILE_SORTS.filter((m) => showValue || m.key !== "value"), ...(columns.price ? [PRICE_SORT] : [])];

  const baseRows = useMemo(() => {
    const list = filter === "all" ? rows : rows.filter((r) => r.position === filter);
    return [...list].sort((a, b) => POS_ORDER[a.position] - POS_ORDER[b.position] || b.rating - a.rating);
  }, [rows, filter]);

  const sorted = useMemo(() => {
    const list = filter === "all" ? rows : rows.filter((r) => r.position === filter);
    return [...list].sort((a, b) => {
      const av = sortValue(a, sortKey);
      const bv = sortValue(b, sortKey);
      const cmp = typeof av === "string" ? av.localeCompare(bv as string, "cs") : (av as number) - (bv as number);
      const directed = sortDir === "asc" ? cmp : -cmp;
      return directed || POS_ORDER[a.position] - POS_ORDER[b.position] || b.rating - a.rating;
    });
  }, [rows, filter, sortKey, sortDir]);

  if (rows.length === 0) return <ListEmpty icon="👤">{emptyText ?? "Nikdo tu není."}</ListEmpty>;

  const avatar = (r: BrowseRow, size: number) => r.avatar && typeof r.avatar === "object" && Object.keys(r.avatar).length > 2
    ? <FaceAvatar faceConfig={r.avatar} size={size} className="shrink-0" />
    : (
      // span, ne div: na telefonu je portrét uvnitř řádku, který je odkaz nebo tlačítko.
      <span className={`rounded-full flex items-center justify-center text-sm font-bold shrink-0 ${onColorText}`}
        style={{ backgroundColor: color, width: size, height: size }}>
        {r.firstName[0]}
      </span>
    );

  const open = (r: BrowseRow) => (r.onOpen ? r.onOpen() : router.push(`/hrac/${r.id}`));

  const removeButton = (r: BrowseRow) => onRemove && (
    <button onClick={(e) => { e.stopPropagation(); onRemove(r); }}
      className="text-sm font-heading font-bold text-card-red hover:underline whitespace-nowrap">
      Odebrat
    </button>
  );

  const ratings = rows.map((r) => r.rating);
  // Na telefonu se barva hodnocení měří proti hráčům, které seznam právě ukazuje.
  const mobileRatings = sorted.map((r) => r.rating);
  const tableColumns: DataColumn<BrowseRow>[] = [
    { key: "name", header: "Hráč", align: "left", sortValue: (r) => r.lastName,
      cell: (r) => (
        <EntityCell leading={avatar(r, 28)}
          name={`${r.firstName} ${r.lastName}`}
          meta={r.nickname || r.tag ? <>{r.nickname && <span className="text-gold-600">„{r.nickname}“</span>}{r.tag && <span className="block">{r.tag}</span>}</> : undefined} />
      ) },
    ...(columns.club ? [{
      key: "club", header: "Klub", align: "left" as const, sortValue: (r: BrowseRow) => r.club?.name ?? r.clubLabel ?? "",
      cell: (r: BrowseRow) => r.club
        ? <Link href={`/tym/${r.club.id}`} onClick={(e) => e.stopPropagation()} className="block min-w-[170px] hover:underline"><TeamName name={r.club.name} isAi={r.clubIsAi === true} wrap /></Link>
        : <span className="block min-w-[170px] text-muted"><TeamName name={r.clubLabel ?? "bez klubu"} isAi={r.clubIsAi === true} wrap /></span>,
    }] : []),
    { key: "position", header: "Poz", title: "Pozice", width: "w-16", sortValue: (r) => POS_ORDER[r.position] ?? 9, firstDir: "asc",
      cell: (r) => <PositionBadge position={r.position} /> },
    { key: "age", header: "Věk", width: "w-12", sortValue: (r) => r.age, cell: (r) => r.age },
    { key: "rating", header: "Hod.", title: "Hodnocení", width: "w-14", sortValue: (r) => r.rating,
      cell: (r) => <RatingPill value={r.rating} tone={ratingToneIn(r.rating, ratings)} /> },
    ...SKILL_COLUMNS.map((c): DataColumn<BrowseRow> => ({
      key: c.key, header: c.short, title: c.label, width: "w-11", sortValue: (r) => r.skills[c.key] ?? 0,
      cell: (r) => r.skills[c.key] == null ? "-" : (
        <span className={`inline-flex w-[30px] h-6 rounded-tight items-center justify-center text-meta font-bold ${attrBg(r.skills[c.key] ?? 0)}`}>{r.skills[c.key]}</span>
      ),
    })),
    ...(columns.condition ? [{
      key: "condition", header: "Kon", title: "Kondice", width: "w-16", sortValue: (r: BrowseRow) => r.condition ?? 0,
      cell: (r: BrowseRow) => <span className="whitespace-nowrap">{r.condition ?? "-"} %</span>,
    }] : []),
    ...(columns.form ? [{
      key: "form", header: "Forma", title: "Zápasy · góly · asistence · průměrná známka", align: "left" as const,
      cell: (r: BrowseRow) => <span className="whitespace-nowrap">{r.form ? formatForm(r.form) : "-"}</span>,
    }] : []),
    ...(columns.price ? [{
      key: "price", header: "Cena", title: "Cena z inzerátu", align: "right" as const, emphasis: true, sortValue: (r: BrowseRow) => r.price ?? 0,
      cell: (r: BrowseRow) => <span className="whitespace-nowrap">{r.price != null ? formatKc(r.price) : "-"}</span>,
    }] : []),
    ...(showValue ? [{
      key: "value", header: "Cena", title: "Tržní cena (odhad)", align: "right" as const, emphasis: true, sortValue: (r: BrowseRow) => rowValue(r),
      cell: (r: BrowseRow) => <span className="whitespace-nowrap">{formatValue(rowValue(r))}</span>,
    }] : []),
    { key: "state", header: "Stav", width: "w-20",
      cell: (r) => r.injury
        ? <span className="whitespace-nowrap font-bold text-card-red" title={r.injury.type ?? "Zranění"}>🩹 {r.injury.daysRemaining} d</span>
        : <span className="text-muted">-</span> },
    ...(columns.watchedSince ? [{
      key: "watchedSince", header: "Sleduji od", align: "left" as const,
      cell: (r: BrowseRow) => <span className="whitespace-nowrap">{r.watchedSince ? formatDay(r.watchedSince) : "-"}</span>,
    }] : []),
    ...(onRemove ? [{ key: "remove", header: "", align: "right" as const, cell: (r: BrowseRow) => removeButton(r) }] : []),
    ...(columns.action ? [{
      key: "action", header: "", align: "right" as const,
      cell: (r: BrowseRow) => <span className="whitespace-nowrap" onClick={(e) => e.stopPropagation()}>{r.action}</span>,
    }] : []),
  ];

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 mb-4">
        {/* Mobil: pět stejně širokých tlačítek v jednom řádku, zalomené zabíraly půl displeje. */}
        <div className="grid grid-cols-5 gap-1 w-full md:flex md:w-auto md:gap-2">
          {(["all", "GK", "DEF", "MID", "FWD"] as PosFilter[]).map((pos) => (
            <button key={pos} onClick={() => setFilter(pos)}
              className={`px-1 py-1.5 md:px-3 rounded-full text-sm font-heading font-bold whitespace-nowrap transition-colors ${filter === pos ? onColorText : "bg-gray-100 text-muted hover:bg-gray-200"}`}
              style={filter === pos ? { backgroundColor: color } : undefined}>
              {pos === "all" ? "Vše" : `${POS_LABELS[pos]} ${rows.filter((r) => r.position === pos).length}`}
            </button>
          ))}
        </div>
        {/* Mobil nemá záhlaví tabulky, řadí se výběrem */}
        <label className="md:hidden flex items-center gap-2 text-sm text-muted ml-auto">
          Řadit
          <select value={sortKey} onChange={(e) => { const k = e.target.value as SortKey; setSortKey(k); setSortDir(k === "position" ? "asc" : "desc"); }}
            className="select !text-sm !font-heading font-bold !py-1.5">
            {mobileSorts.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
          </select>
        </label>
      </div>

      {/* ── Počítač: řaditelná tabulka s přilepeným sloupcem hráče ── */}
      <div className="hidden md:block -mx-4 sm:-mx-5">
        <DataTable columns={tableColumns} rows={baseRows} rowKey={(r) => r.id}
          onRowClick={open} scroll={{ minWidth: 960 }}
          defaultSort={{ key: defaultSort, dir: defaultSort === "position" ? "asc" : "desc" }}
          empty="Na tomhle postu tu nikdo není." />
      </div>

      {/* ── Mobil: seznam s popsanými dovednostmi ── */}
      <ListCard className="md:hidden">
        {sorted.length === 0 && <ListEmpty icon="👤">Na tomhle postu tu nikdo není.</ListEmpty>}
        {sorted.map((r) => {
          const name = `${r.firstName} ${r.lastName}`;
          // Řádek s tlačítkem (Odebrat, Podepsat, Nabídnout…) nesmí být sám klikací:
          // tlačítko v tlačítku nejde. Detail pak otevírá jméno.
          const hasButtons = !!onRemove || (!!columns.action && r.action != null);
          const nameLink = !hasButtons ? name : r.onOpen
            ? <button type="button" onClick={r.onOpen} className="text-left hover:underline">{name}</button>
            : <Link href={`/hrac/${r.id}`} className="hover:underline">{name}</Link>;
          return (
            <ListRow key={r.id}
              href={!hasButtons && !r.onOpen ? `/hrac/${r.id}` : undefined}
              onClick={!hasButtons && r.onOpen ? r.onOpen : undefined}
              tone={r.injury ? "danger" : undefined}
              leading={avatar(r, 30)}
              title={nameLink}
              meta={
                <span className="inline-flex items-center gap-1.5 tabular-nums">
                  <PositionBadge position={r.position} />
                  <span>{r.age} let{columns.price || !showValue ? "" : ` · ${formatValue(rowValue(r))}`}</span>
                </span>
              }
              trailing={<RatingPill value={r.rating} tone={ratingToneIn(r.rating, mobileRatings)} />}
              detail={
                <>
                  {/* Klub na vlastním řádku celý: vedle věku se dlouhé jméno usekávalo. */}
                  {columns.club && (r.club || r.clubLabel) && (
                    <span className="block text-muted break-words"><TeamName name={r.club?.name ?? r.clubLabel ?? ""} isAi={r.clubIsAi === true} wrap /></span>
                  )}
                  {r.tag && <span className="block mt-0.5">{r.tag}</span>}
                  <span className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1">
                    {KEY_SKILLS[r.position].map((k) => (
                      <span key={k} className="tabular-nums">
                        <span className="text-muted">{skillShort(k)}</span>{" "}
                        <span className={`font-heading font-bold ${attrColor(r.skills[k] ?? 0)}`}>{r.skills[k] ?? "-"}</span>
                      </span>
                    ))}
                    {r.injury && (
                      <span className="font-heading font-bold text-card-red" title={r.injury.type ?? "Zranění"}>🩹 zraněn {r.injury.daysRemaining} d</span>
                    )}
                  </span>
                  {(columns.form && r.form) || onRemove ? (
                    <span className="flex items-center justify-between gap-2 mt-1 text-muted">
                      <span className="tabular-nums">{columns.form && r.form ? `Forma: ${formatForm(r.form)}` : ""}</span>
                      {removeButton(r)}
                    </span>
                  ) : null}
                  {columns.price || columns.action ? (
                    <span className="flex items-center justify-between gap-2 mt-1.5">
                      <span className="tabular-nums min-w-0">
                        {columns.price && r.price != null && <span className="font-heading font-bold text-ink">{formatKc(r.price)}</span>}
                      </span>
                      {columns.action && <span className="shrink-0">{r.action}</span>}
                    </span>
                  ) : null}
                </>
              } />
          );
        })}
      </ListCard>
    </div>
  );
}
