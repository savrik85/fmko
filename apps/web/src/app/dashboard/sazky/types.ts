/** Zrcadlo odpovědí API. Klient nic neodvozuje — popisky i kurzy chodí ze serveru. */

export interface Limits {
  minStake: number;
  maxStake: number;
  maxPayout: number;
  maxSelections: number;
  ticketsPerRound: number;
  levyPct: number;
}

export interface Nabidka {
  selection: string;
  label: string;
  oddsX100: number;
}

export interface Strana {
  id: string;
  name: string;
  color: string | null;
  /** Pořadí v tabulce; 0 = ještě se nehrálo. */
  pos: number;
  played: number;
  points: number;
  goalsFor: number;
  goalsAgainst: number;
  /** Posledních pět výsledků, nejnovější první: „V" | „R" | „P". */
  form: string[];
}

export interface Zapas {
  matchId: string;
  home: Strana;
  away: Strana;
  ownMatch: boolean;
  markets: {
    result: Nabidka[];
    dchance: Nabidka[];
    totals: Nabidka[];
    scorers: Nabidka[];
  } | null;
}

export type Board =
  | { open: false; closedReason: string }
  | {
      open: true;
      calendarId: string;
      gameWeek: number;
      scheduledAt: string;
      seasonNumber: number;
      canBet: boolean;
      blockedReason: string | null;
      budget: number;
      ticketsLeft: number;
      limits: Limits;
      matches: Zapas[];
    };

export type StavTiketu = "open" | "won" | "lost" | "void" | "confiscated";
export type StavTipu = "pending" | "won" | "lost" | "void";

export interface Tip {
  matchId: string;
  market: string;
  label: string;
  oddsX100: number;
  result: StavTipu;
  zapas: string;
  vysledek: string | null;
}

export interface Tiket {
  id: string;
  cislo: string;
  stake: number;
  levy: number;
  totalOddsX100: number;
  potentialPayout: number;
  capped: boolean;
  payout: number;
  status: StavTiketu;
  gameWeek: number | null;
  /** Kdy byl vyvěšen do arény. null = nesdílený. */
  sharedAt: string | null;
  selections: Tip[];
}

export interface Bilance {
  tickets: number;
  staked: number;
  won: number;
  levy: number;
  net: number;
}

export interface TiketyOdpoved {
  tickets: Tiket[];
  summary: Bilance;
}

/** Jeden vybraný tip v košíku. Žije jen v paměti stránky. */
export interface VybranyTip {
  matchId: string;
  market: "result" | "dchance" | "totals" | "scorers";
  /** Kód, který chce server. */
  serverMarket: "1x2" | "dchance" | "totals" | "scorer";
  selection: string;
  oddsX100: number;
  label: string;
  zapas: string;
}

// ── Tiketaréna ──────────────────────────────────────────────────────────────

export interface ArenaTip {
  market: string;
  label: string;
  oddsX100: number;
  result: StavTipu;
  zapas: string;
  vysledek: string | null;
}

export interface ArenaKomentar {
  id: string;
  teamId: string;
  teamName: string;
  authorName: string | null;
  authorAvatar: Record<string, unknown> | null;
  body: string;
  createdAt: string;
  muzuSmazat: boolean;
}

export interface ArenaTiket {
  id: string;
  cislo: string;
  teamId: string;
  teamName: string;
  authorName: string | null;
  authorAvatar: Record<string, unknown> | null;
  stake: number;
  totalOddsX100: number;
  potentialPayout: number;
  payout: number;
  capped: boolean;
  status: StavTiketu;
  gameWeek: number | null;
  sharedAt: string;
  /** Co k tiketu napsal autor při vyvěšení. */
  vzkaz: string | null;
  jeMuj: boolean;
  tipy: ArenaTip[];
  komentare: ArenaKomentar[];
}

export interface ArenaOdpoved {
  tickets: ArenaTiket[];
  maxComment: number;
  maxNote: number;
}
