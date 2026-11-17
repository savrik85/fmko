"use client";

/**
 * FM tabulka atributů kádru. Stejná pro kádr A-týmu i pro záložku Atributy v U21.
 *
 * Klíčové atributy postu (váha v hodnocení 2+, `attributeImportance`) mají v každém řádku
 * stejné zvýraznění jako karta Dovednosti v profilu hráče: zelený podklad a stejné barevné
 * štítky hodnot (`attrBg`). Hráč se tak učí jeden vizuální jazyk.
 */

import { PromiseBadge } from "@/components/players/promise-card";
import { attributeImportance, coachRelationBand } from "@okresni-masina/shared";
import { PositionBadge, DataTable, ListCard, type DataColumn, StatusChip, ChoiceGroup } from "@/components/ui";
import type { Player } from "@/lib/api";
import { ATTRIBUTE_INFO, getTooltip, type AttrKey } from "@/lib/attribute-info";
import { attrBg, attrValue } from "@/lib/player-attrs";

type Pos = "GK" | "DEF" | "MID" | "FWD";
export type PosFilter = "all" | Pos;
export type PotentialMap = Map<string, { strop: number | null; uroven: string | null; slovne: string | null }>;

type SortKey = "name" | "pos" | "age" | "rat" | "pot" | "spd" | "tec" | "sho" | "pas" | "hea" | "def" | "vis" | "exp" | "cre" | "set" | "gk" | "sta" | "str" | "cond" | "mor" | "rel" | "wage";

const POSITIONS: Pos[] = ["GK", "DEF", "MID", "FWD"];
const POS_ORDER: Record<string, number> = { GK: 0, DEF: 1, MID: 2, FWD: 3 };
const POS_ACCUSATIVE: Record<Pos, string> = { GK: "brankáře", DEF: "obránce", MID: "záložníky", FWD: "útočníky" };

// skill: klíč v `skills` i ve vahách hodnocení. Jen u těchhle sloupců se zvýrazňuje.
const COLUMNS: Array<{ key: SortKey; label: string; tip?: string; attrKey?: AttrKey; skill?: string }> = [
  { key: "name", label: "Jméno", tip: "Jméno hráče" },
  { key: "pos", label: "Poz", tip: "Pozice" },
  { key: "age", label: "Věk", attrKey: "age" },
  { key: "rat", label: "Hod", attrKey: "rat" },
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
  { key: "rel", label: "Vzt", tip: "Vztah hráče k tobě: ❤️ jste kamarádi, 👍 má tě rád, 🤝 bere tě, 🙄 nemá tě rád, 💢 nesnáší tě" },
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
      <ChoiceGroup ariaLabel="Filtr pozice" size="sm" columns={5} value={value} onChange={onChange}
        options={([
          ["all", "Vše", players.length],
          ["GK", "Brankáři", counts.GK],
          ["DEF", "Obrana", counts.DEF],
          ["MID", "Záloha", counts.MID],
          ["FWD", "Útok", counts.FWD],
        ] as Array<[PosFilter, string, number]>).map(([pos, label, count]) => ({
          value: pos, label: <span className="text-xs sm:text-sm">{label}</span>, hint: <span className="tabular-nums">{count}</span>,
        }))} />
    </div>
  );
}

/** Jméno do přilepeného sloupce: na telefonu iniciála křestního jména, ať sloupec nezabere půl displeje. */
export function StickyPlayerName({ firstName, lastName }: { firstName: string; lastName: string }) {
  return (
    <>
      <span className="sm:hidden">{firstName[0]}. {lastName}</span>
      <span className="hidden sm:inline">{firstName} {lastName}</span>
    </>
  );
}

export function SquadAttributeTable({ players, potential = new Map(), promises = new Map() }: {
  players: Player[];
  potential?: PotentialMap;
  /** Běžící sliby hráčům (hráč → co jsi slíbil), značka 🤞 u jména. */
  promises?: Map<string, string>;
}) {
  const header = (col: (typeof COLUMNS)[number]) => {
    const dots = col.skill ? keyPositions(col.skill) : [];
    return (
      <span className={`inline-flex flex-col gap-0.5 ${col.key === "name" ? "items-start" : "items-center"}`}>
        <span>{col.label}</span>
        {dots.length > 0 && dots.length < 4 && (
          <span className="flex gap-0.5" aria-hidden="true">
            {dots.map((pos) => <span key={pos} className={`w-1 h-1 rounded-full ${POS_DOT_COLOR[pos]}`} />)}
          </span>
        )}
      </span>
    );
  };
  const byKey = Object.fromEntries(COLUMNS.map((c) => [c.key, c])) as Record<SortKey, (typeof COLUMNS)[number]>;
  const base = (key: SortKey): Pick<DataColumn<Player>, "key" | "header" | "title" | "sortValue"> => ({
    key, header: header(byKey[key]), title: columnTip(byKey[key]), sortValue: (p) => getVal(p, key, potential),
  });

  const columns: DataColumn<Player>[] = [
    { ...base("name"), align: "left", firstDir: "asc",
      cell: (p) => {
        const lc = p.lifeContext as unknown as Record<string, number> | undefined;
        const inj = p.injury;
        const abs = (p as unknown as { absence?: { reason?: string } | null }).absence;
        const daysLabel = inj ? (inj.daysRemaining === 1 ? "den" : inj.daysRemaining < 5 ? "dny" : "dní") : "";
        const injTip = inj ? `Zraněný${inj.type ? `: ${inj.type}` : ""} · ${inj.daysRemaining} ${daysLabel} do návratu` : "";
        const absTip = abs ? `Chybí dnes${abs.reason ? `: ${abs.reason}` : ""}` : "";
        return (
          <span className={`inline-flex items-center gap-1.5 whitespace-nowrap py-1.5 ${p.status === "quit" ? "opacity-40" : ""}`}>
            <span className="text-body font-bold text-ink"><StickyPlayerName firstName={p.first_name} lastName={p.last_name} /></span>
            {p.loan_from_team_id && <StatusChip tone="warn">Host.</StatusChip>}
            {promises.has(p.id) && <PromiseBadge text={promises.get(p.id)!} />}
            {inj && <StatusChip tone="danger" title={injTip}><span role="img" aria-label={injTip}>🩹</span></StatusChip>}
            {abs && <StatusChip tone="warn" title={absTip}><span role="img" aria-label={absTip}>🚫</span></StatusChip>}
            {(lc as unknown as { hangover?: number | boolean } | undefined)?.hangover ? (
              <span className="cursor-help" title="Ranní kocovina po včerejší výhře (−15 kondice)" aria-label="Kocovina">🍺</span>
            ) : null}
          </span>
        );
      } },
    { ...base("pos"), width: "w-14", firstDir: "asc", cell: (p) => <PositionBadge position={p.position as Pos} /> },
    { ...base("age"), width: "w-11", cell: (p) => p.age },
    { ...base("rat"), width: "w-12", cell: (p) => <span className={`${VALUE_BADGE} ${attrBg(p.overall_rating ?? 0)}`}>{p.overall_rating}</span> },
    // Potenciál: barva nese verdikt skauta, ať jde kádr přeletět očima.
    { ...base("pot"), width: "w-11",
      cell: (p) => {
        const pot = potential.get(p.id);
        const color = pot?.uroven === "hvezda" ? "text-gold-600" : pot?.uroven === "nadejny" ? "text-pitch-500" : pot?.uroven === "prumer" ? "text-blue-600" : "text-muted";
        return <span className={`font-bold ${color}`} title={pot?.slovne ?? "Bez skauta v realizačním týmu potenciál neodhadneš"}>{pot?.strop ?? "-"}</span>;
      } },
    ...COLUMNS.filter((col) => col.skill).map((col): DataColumn<Player> => ({
      ...base(col.key), width: "w-11",
      cell: (p) => {
        const v = skillValue(p, col.skill!);
        // Klíčové atributy postu plné, ostatní ztlumené: v řádku pak vystoupí bez nové barvy.
        const isKey = attributeImportance(p.position, col.skill!) === "key";
        return typeof v === "number"
          ? <span className={`${VALUE_BADGE} ${attrBg(v)} ${isKey ? "ring-1 ring-pitch-500/40" : "opacity-40"}`}>{v}</span>
          : <span className="text-muted">-</span>;
      },
    })),
    { ...base("cond"), width: "w-14",
      cell: (p) => {
        const cond = (p.lifeContext as unknown as Record<string, number> | undefined)?.condition ?? 100;
        return <span className={`font-bold whitespace-nowrap ${condColor(cond)}`}>{cond} %</span>;
      } },
    { ...base("mor"), width: "w-11",
      cell: (p) => {
        const morale = (p.lifeContext as unknown as Record<string, number> | undefined)?.morale ?? 50;
        return <span title={`${morale} %`}>{moraleIcon(morale)}</span>;
      } },
    { ...base("rel"), width: "w-11",
      cell: (p) => {
        const band = coachRelationBand(p.coach_relationship ?? 50);
        return <span className="cursor-help" title={band.label} aria-label={band.label}>{band.icon}</span>;
      } },
    { ...base("wage"), width: "w-16", align: "right", cell: (p) => (p.weekly_wage ?? 0).toLocaleString("cs") },
  ];

  return (
    <>
      <ListCard>
        <DataTable columns={columns} rows={players} rowKey={(p) => p.id}
          rowHref={(p) => `/hrac/${p.id}`} scroll={{ minWidth: "content" }}
          defaultSort={{ key: "rat", dir: "desc" }}
          empty="Žádní hráči neodpovídají filtru." />
      </ListCard>

      <div className="card p-3 space-y-2 text-sm text-muted">
        <p>
          <span className="inline-flex items-center rounded px-2 py-0.5 font-bold text-pitch-700 ring-1 ring-pitch-500/40">Orámované</span>{" "}
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
