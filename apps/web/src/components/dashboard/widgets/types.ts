import type { ComponentType } from "react";
import type { Team, Player, ManagerProfile, TeamMatchResults } from "@/lib/api";
import type { WidgetHeight } from "./widget-heights";

export type { WidgetHeight };

// ── Layout ──────────────────────────────────────────────────────────────────

/** Šířka widgetu v třísloupcové mřížce. Na mobilu se ignoruje — vždy jeden sloupec. */
export type WidgetWidth = 1 | 2 | 3;

export interface LayoutItem {
  id: string;
  w: WidgetWidth;
  /** Klíč barevného odlišení; chybí = bílá karta jako dosud. */
  c?: string;
  /** Výška; chybí = použije se výchozí výška widgetu z katalogu. */
  h?: WidgetHeight;
}

// ── Datové zdroje ───────────────────────────────────────────────────────────

/**
 * Klíč datového zdroje. Widget deklaruje, co potřebuje, a useDashboardData
 * načte jen sjednocení potřeb aktivních widgetů — ne všechno pokaždé.
 */
export type DataKey =
  | "team" | "players" | "standings" | "schedule" | "manager" | "matchResults"
  | "preview" | "news" | "achievements" | "pubSession" | "hallOfFame"
  | "budget" | "transactions" | "wages" | "sponsors"
  | "fans" | "fansHistory" | "fanbase" | "fanbaseHistory" | "concessionSales"
  | "trainingStats" | "trainingPlan" | "attendance"
  | "leagueStats" | "reputation" | "managerHistory" | "injuries"
  | "stadium" | "equipment" | "staff" | "trophies" | "cup" | "u21"
  | "events" | "offers" | "watchlist" | "seasonHistory"
  | "freeAgents" | "market" | "leagueTransfers"
  | "teamStats" | "relations" | "relationships" | "seasonInfo" | "leagueResults";

/** Stav jednoho zdroje. Widget si podle něj vybere skeleton / chybu / obsah. */
export interface DataSlot<T> {
  data: T | null;
  loading: boolean;
  error: boolean;
}

// ── Tvary odpovědí, které nejsou v lib/api ──────────────────────────────────

export interface Standing {
  pos: number;
  team: string;
  teamId: string | null;
  points: number;
  played: number;
  wins: number;
  draws: number;
  losses: number;
  gf: number;
  ga: number;
  form?: string[];
  isPlayer?: boolean;
  primaryColor?: string;
  secondaryColor?: string;
  badgePattern?: string;
}

export interface ScheduleMatch {
  id: string;
  calendarId?: string | null;
  round: number | null;
  status: string;
  homeName: string;
  homeColor?: string;
  homeSecondary?: string;
  homeBadge?: string;
  awayName: string;
  awayColor?: string;
  awaySecondary?: string;
  awayBadge?: string;
  homeScore: number | null;
  awayScore: number | null;
  scheduledAt: string | null;
  isFriendly?: boolean;
  isCup?: boolean;
  roundName?: string | null;
  homeTeamId?: string | null;
  awayTeamId?: string | null;
  isHome: boolean;
  promoted?: boolean;
  promotionCost?: number | null;
  presetSlot?: "A" | "B" | "C" | null;
  hasLineup?: boolean;
  isDefaultLineup?: boolean;
  defaultPresetSlot?: "A" | "B" | "C" | null;
}

export interface PreviewTeam {
  id: string;
  name: string;
  primaryColor: string;
  secondaryColor: string;
  badgePattern: string;
  position: number;
  points: number;
  played: number;
  wins: number;
  draws: number;
  losses: number;
  goalsFor: number;
  goalsAgainst: number;
  form: string[];
  avgRating: number;
  squadSize: number;
  squad?: Array<{ age: number; position?: string; rating?: number }>;
  isPlayer?: boolean;
}

export interface MatchPreview {
  matchId: string;
  round: number | null;
  scheduledAt: string | null;
  isHome: boolean;
  isCup?: boolean;
  roundName?: string | null;
  home: PreviewTeam;
  away: PreviewTeam;
  venue: { name: string; capacity: number; pitchCondition: number; pitchType: string };
  weather: { icon: string; expected: string; temperature: number; description: string };
  /** Kurzy sázkové kanceláře v setinách. null = na tenhle zápas nejsou vypsané. */
  odds: { home: number | null; draw: number | null; away: number | null } | null;
}

export interface NewsArticle { id: string; type: string; headline: string; icon: string; date: string }

export interface Achievement { key: string; icon: string; title: string; tier: string; earnedAt: string | null }

export interface HallOfFameRank {
  myRank: number | null;
  myTotal: number;
  myGold: number;
  mySilver: number;
  myBronze: number;
  top3: Array<{ rank: number; teamName: string; total: number }>;
  totalEntries: number;
}

export interface PubAttendee {
  playerId: string; firstName: string; lastName: string; alcohol: number;
  teamId: string; isVisitor: boolean; fromTeamName?: string;
}

export interface PubIncident {
  type: string; playerIds: string[]; text: string;
  effects?: Array<{ playerId: string; type: string; delta?: number; injuryDays?: number; label: string }>;
}

export interface PubSession {
  gameDate: string;
  dailySpecial?: string | null;
  attendees: PubAttendee[];
  incidents: PubIncident[];
}

export interface BudgetData {
  budget: number;
  playerCount: number;
  wageBill: { weekly: number; topPlayers: Array<{ name: string; weeklyWage: number; position?: string }> };
  weekly: {
    income: { sponsors: number; baseSponsor: number; subsidy: number; playerContributions: number; total: number };
    expenses: { wages: number; maintenance: number; equipment: number; training: number; loanRepayment: number; total: number };
    net: number;
    netWithLoan?: number;
  };
  forecast: { weeklyNet: number; weeksUntilBankrupt: number | null; in4Weeks: number; inSeason: number; series?: Array<{ week: number; budget: number }> };
  remainingMatches: number;
  purchaseBlocked?: boolean;
}

export interface Transaction {
  id: string; type: string; amount: number; balanceAfter: number;
  description: string; gameDate: string; createdAt: string;
}

export interface WagesData {
  players: Array<{ name: string; position: string; rating: number; age: number; weeklyWage: number }>;
  totalWeekly: number;
  totalMonthly: number;
}

export interface SponsorContract {
  id: string; category: string; sponsorName: string;
  monthlyAmount: number; winBonus: number; seasonsRemaining?: number;
}

export interface SponsorsData {
  mainContract: SponsorContract | null;
  stadiumContract: SponsorContract | null;
  bannerContracts: SponsorContract[];
}

export interface FansData {
  satisfaction: number;
  loyalty: number;
  expectedPerformance: number;
  lastMatchDelta: number;
  lastMatchReasons: string[];
}

export interface FansHistoryItem {
  gamedate: string; satisfactionBefore: number; satisfactionAfter: number;
  delta: number; opponentName: string | null; result: string | null; attendance: number;
}

export interface FanbaseData {
  tiers: { hardcore: number; regular: number; casual: number };
  totalLoyal: number;
  capacity: number;
  expectedNextHomeAttendance: number;
}

export interface FanbaseHistoryPoint {
  gamedate: string; hardcore: number; regular: number; casual: number;
  totalLoyal: number; reputation: number; satisfaction: number;
}

export interface ConcessionSaleMatch {
  gamedate: string; opponentName: string | null; attendance: number;
  totalRevenue: number; totalProfit: number;
  products: Array<{ productKey: string; soldCount: number; revenue: number; profit: number }>;
}

export interface TrainingStats {
  totalImprovements: number;
  totalDeclines: number;
  trainingSessions: number;
  topImprovers: Array<{ playerId: string; name: string; totalGains: number; topAttribute: string | null }>;
  skillBreakdown: Array<{ attribute: string; gains: number; losses: number }>;
  attendanceTop?: Array<{ name: string; pct: number }>;
  attendanceBottom?: Array<{ name: string; pct: number }>;
}

export interface TrainingPlan {
  type: string;
  approach: string;
  sessionsPerWeek: number;
  trainingDays: number[] | null;
  restPlayerIds?: string[];
}

export interface AttendancePlayer {
  playerId: string; firstName: string; lastName: string; position: string;
  trainingAttended: number; trainingTotal: number; trainingPct: number;
  matchesAvailable: number; matchesPlayed: number; matchesMissed: number;
  breakdown: { injury: number; suspension: number; excuse: number; bench: number; notNominated: number };
}

export interface AttendanceData {
  players: AttendancePlayer[];
  matchesAvailable: number;
}

export interface LeagueStatsRow {
  playerId: string; name: string; position: string; teamId: string; teamName: string;
  goals: number; assists: number; appearances: number; avgRating: number;
  yellowCards: number; redCards: number;
}

export interface LeagueStats {
  topScorers: LeagueStatsRow[];
  topAssists: LeagueStatsRow[];
  topRated?: LeagueStatsRow[];
  mostCards?: LeagueStatsRow[];
  mostAppearances?: LeagueStatsRow[];
}

export interface ReputationData {
  reputation: number;
  tier?: { key: string; label: string; note?: string };
  history: Array<{ delta: number; newValue: number; source: string; description: string; gameDate: string }>;
  unlocks?: { next: { label?: string; missingReputation?: number } | null };
}

export interface ManagerHistoryEntry {
  attr: string; attrLabel: string; oldValue: number; newValue: number;
  delta: number; source: string; date: string;
}

export interface InjuryEntry {
  id: string; playerId: string; firstName: string; lastName: string;
  position: string; type: string; severity: string;
  daysRemaining: number; daysTotal: number;
}

export interface StadiumData {
  stadiumName: string | null;
  capacity: number;
  pitchCondition: number;
  pitchType: string;
  facilities: Record<string, number>;
}

export interface EquipmentCategory {
  key: string; label: string; level: number; condition: number; effectiveLevel: number;
}

export interface EquipmentData {
  categories: EquipmentCategory[];
}

export interface StaffMember {
  id: string; role: string | null; profession: string;
  firstName: string; lastName: string; age: number;
  coaching: number; medicine: number; maintenance: number;
  judgement: number; communication: number; workRate: number; charm: number;
  weeklyWage: number;
}

export interface CupSide { name: string; color: string | null; isBig: boolean; teamId: string | null }

export interface CupMyMatch {
  matchId: string; round: number; roundName: string; opponent: CupSide | null;
  isHome: boolean; myScore: number | null; oppScore: number | null;
  status: string; won: boolean | null; daysUntil?: number | null;
}

export interface CupData {
  cup: { name: string; seasonNumber: number; status: string; totalRounds: number; currentRound: number } | null;
  myTeam: { name: string; eliminatedRound: number | null; alive: boolean; isChampion: boolean } | null;
  myMatches: CupMyMatch[];
  prizes?: Array<{ round: number; roundName: string; prize: number }>;
}

export interface SeasonHistoryEntry {
  seasonNumber?: number;
  season_number?: number;
  leagueName?: string;
  finalStandings?: Array<{ teamId?: string; team?: string; pos?: number; points?: number }>;
}

export interface SeasonalEvent {
  id: string; title?: string; headline?: string; description?: string;
  icon?: string; gameWeek?: number; status?: string; resolved?: boolean;
}

export interface TransferOffer {
  id: string;
  player_name?: string;
  playerName?: string;
  offer_amount?: number;
  offerAmount?: number;
  status: string;
  from_team_name?: string;
  offer_type?: string;
}

export interface FreeAgent {
  id: string; firstName: string; lastName: string; age: number;
  position: string; overallRating: number; weeklyWage: number;
  occupation: string; villageName: string | null; distanceKm: number | null;
}

export interface MarketListing {
  id: string; playerId: string; playerName: string; playerAge: number;
  position: string; overallRating: number; teamName: string; askingPrice: number;
}

export interface LeagueTransfer {
  playerId: string; playerName: string; age?: number; position?: string;
  fromTeamId: string | null; fromTeam: string | null;
  toTeamId: string; toTeam: string;
  fee: number; date: string; joinType?: string;
}

export interface TeamStatRow {
  playerId: string; firstName: string; lastName: string; nickname: string; position: string;
  appearances: number; goals: number; assists: number;
  yellowCards: number; redCards: number; minutesPlayed: number;
  avgRating: number; cleanSheets: number; manOfMatch: number;
}

export interface ManagerRelation {
  teamId: string; teamName: string; primaryColor: string;
  managerName: string; isAi: boolean; archetypeLabel: string;
  respect: number; heat: number; label: string; loyalAlly: boolean;
}

export interface SquadRelationship {
  id: string; type: string; strength: number;
  player_a_id: string; player_b_id: string;
  player_a_name: string; player_b_name: string;
}

export interface SeasonInfo {
  season: number;
  currentDay: number;
  totalDays: number;
  gameDate: string;
  upcoming: Array<{ type: string; date: string; title: string; subtitle?: string; status?: string; isHome?: boolean }>;
}

export interface LeagueResult {
  id: string;
  round: number | null;
  game_week: number | null;
  home_team_id: string;
  away_team_id: string;
  home_name: string;
  away_name: string;
  home_score: number;
  away_score: number;
}

export interface WatchlistEntry {
  id?: string;
  playerId?: string;
  firstName?: string;
  lastName?: string;
  position?: string;
  age?: number;
  overallRating?: number;
  teamName?: string;
}

// ── Registry ────────────────────────────────────────────────────────────────

/** Kategorie v dialogu „Přidat widget". */
export type WidgetCategory = "prehled" | "kadr" | "zapasy" | "liga" | "finance" | "fanousci" | "klub" | "prestupy";

/** Data předaná widgetu — vždy celý balík, widget si sáhne na to, co deklaroval. */
export interface DashboardData {
  team: DataSlot<Team>;
  players: DataSlot<Player[]>;
  standings: DataSlot<Standing[]>;
  schedule: DataSlot<{ matches: ScheduleMatch[]; promotionPrice?: number }>;
  manager: DataSlot<ManagerProfile>;
  matchResults: DataSlot<TeamMatchResults>;
  preview: DataSlot<MatchPreview>;
  news: DataSlot<NewsArticle[]>;
  achievements: DataSlot<Achievement[]>;
  pubSession: DataSlot<PubSession>;
  hallOfFame: DataSlot<HallOfFameRank>;
  budget: DataSlot<BudgetData>;
  transactions: DataSlot<Transaction[]>;
  wages: DataSlot<WagesData>;
  sponsors: DataSlot<SponsorsData>;
  fans: DataSlot<FansData>;
  fansHistory: DataSlot<FansHistoryItem[]>;
  fanbase: DataSlot<FanbaseData>;
  fanbaseHistory: DataSlot<FanbaseHistoryPoint[]>;
  concessionSales: DataSlot<ConcessionSaleMatch[]>;
  trainingStats: DataSlot<TrainingStats>;
  trainingPlan: DataSlot<TrainingPlan>;
  attendance: DataSlot<AttendanceData>;
  leagueStats: DataSlot<LeagueStats>;
  reputation: DataSlot<ReputationData>;
  managerHistory: DataSlot<ManagerHistoryEntry[]>;
  injuries: DataSlot<InjuryEntry[]>;
  stadium: DataSlot<StadiumData>;
  equipment: DataSlot<EquipmentData>;
  staff: DataSlot<StaffMember[]>;
  trophies: DataSlot<Array<{ season?: number; seasonNumber?: number; title?: string; name?: string; icon?: string; label?: string }>>;
  cup: DataSlot<CupData>;
  u21: DataSlot<Player[]>;
  events: DataSlot<SeasonalEvent[]>;
  offers: DataSlot<TransferOffer[]>;
  watchlist: DataSlot<WatchlistEntry[]>;
  seasonHistory: DataSlot<SeasonHistoryEntry[]>;
  freeAgents: DataSlot<FreeAgent[]>;
  market: DataSlot<MarketListing[]>;
  leagueTransfers: DataSlot<LeagueTransfer[]>;
  teamStats: DataSlot<TeamStatRow[]>;
  relations: DataSlot<ManagerRelation[]>;
  relationships: DataSlot<SquadRelationship[]>;
  seasonInfo: DataSlot<SeasonInfo>;
  leagueResults: DataSlot<LeagueResult[]>;
}

export interface WidgetProps {
  data: DashboardData;
  teamId: string;
  /** V editačním režimu widget nic nenačítá navíc a nesmí nikam navigovat. */
  editing: boolean;
  /** Výška karty — seznamy podle ní volí, kolik položek vypsat. */
  height: WidgetHeight;
}

export interface WidgetDef {
  id: string;
  title: string;
  icon: string;
  category: WidgetCategory;
  /** Jedna věta do dialogu „Přidat widget". */
  description: string;
  defaultWidth: WidgetWidth;
  /** Výchozí výška; bez ní platí střední (2). */
  defaultHeight?: WidgetHeight;
  needs: DataKey[];
  /** Widget si kreslí vlastní obal místo standardní karty (např. Hospoda). */
  bare?: boolean;
  Component: ComponentType<WidgetProps>;
}
