/** Typy odpovědí API grémia soutěže. Sdílené mezi stránkou a jejími panely. */

export interface Rules {
  win_bonus: number; draw_bonus: number; place_top: number; place_decay: number;
  place_floor: number; entry_fee: number; referee_fee: number; fine_mult: number;
  interleague_fee_pct: number; ban_own_owner_transfers: number;
  levy_concession_pct: number; levy_gate_pct: number;
  levy_transfer_pct: number; levy_cup_pct: number;
  fine_referee_abuse: number; fine_admin: number; fine_rule: number;
  min_pitch_condition: number; squad_min: number; squad_max: number;
}

export type ProposalUnit = "czk" | "pct" | "switch" | "ratio" | "count";

export interface ProposalKind {
  kind: string; label: string; gesce: string; majority: number;
  min: number | null; max: number | null; nextSeason: boolean; current: number | null;
  unit: ProposalUnit;
  note: string | null;
  counted: [string, string, string] | null;
}

export interface Official {
  role: string; roleLabel: string; teamId: string; teamName: string;
  managerName: string | null; status: string;
}

export interface RoleSlot {
  role: string; label: string;
  agenda: string; powers: string[];
  holder: { teamId: string; teamName: string; managerName: string | null; status: string } | null;
}

export interface State {
  league: {
    id: string; name: string; district: string; level: string;
    seasonNumber: number; sponsoredName: string | null;
  };
  enabled: boolean;
  threshold: number;
  humanClubs: number;
  totalClubs: number;
  balance: number;
  freeBalance: number;
  outstanding: { placement: number; bonus: number; referees: number; total: number };
  playedMatches: number;
  subsidy: number;
  rules: Rules;
  /** Co bude platit příští sezónu, až se přijaté návrhy promítnou. */
  nextRules: Rules;
  projection: {
    cost: { placement: number; bonus: number; referees: number; total: number };
    income: number; projected: number; ok: boolean;
  };
  voters: number;
  activeVoters: number;
  quorumNeeded: number;
  officials: Official[];
  roles: RoleSlot[];
  presidentTeamId: string | null;
  presidentUsedSuspend: number;
  proposalKinds: ProposalKind[];
  deposit: number;
}

export interface Proposal {
  id: string; kind: string; title: string; body: string; gesce: string;
  status: string; majority: number;
  payload: { value?: number; from?: number; budgetNote?: string | null; amount?: number };
  proposedByTeamId: string; proposerName: string | null;
  targetTeamId?: string | null;
  evidence?: string | null;
  defence?: string | null;
  openedGameDate: string; closedGameDate: string | null;
  effectiveFromSeason: number | null;
  resultNote: string | null;
  myAnswer: string | null;
  castCount: number;
  tally: { pro: number; proti: number; zdrzel: number } | null;
  voters: Array<{ teamId: string; teamName: string; answer: string }> | null;
}

export interface Election {
  id: string; role: string; roleLabel: string; status: string;
  winnerTeamId: string | null; winnerName: string | null; winnerManager: string | null;
  votesCast: number; resultNote: string | null;
  candidates: Array<{ teamId: string; teamName: string; managerName: string | null }>;
  myVote: string | null;
}

export interface LedgerEntry {
  id: string; type: string; amount: number; balance_after: number | null;
  description: string; team_id: string | null; team_name: string | null; game_date: string;
}

export interface Meeting {
  id: string; gameDate: string; seasonNumber: number; closed: number; passed: number;
  balanceAfter: number | null;
  attendance: { voters?: number; active?: number; quorum?: number };
  items: Array<{
    kind?: string; title: string; status: string;
    pro?: number; proti?: number; zdrzel?: number;
    resultNote?: string | null;
  }>;
}

export interface EvidenceItem { kind: string; label: string; detail: string }

export interface DisciplineTarget {
  teamId: string; teamName: string;
  managerName: string | null;
  managerAvatar: Record<string, unknown> | null;
  evidence: EvidenceItem[];
}

export interface Sanction {
  id: string; teamId: string; teamName: string; managerName: string | null;
  kind: string; amount: number; reason: string; evidence: string | null;
  issuedBy: string; status: string; gameDate: string;
}

export interface DisciplineData {
  offences: Array<{ kind: string; label: string; evidenceLabel: string; majority: number; freeText: boolean }>;
  limits: { min: number; max: number; chairLimit: number };
  targets: DisciplineTarget[];
  sanctions: Sanction[];
}

export interface RefereeRow {
  refereeId: string; name: string; archetype: string;
  matches: number; avgGrade: number | null; banned: boolean; flagged: boolean;
}

export interface RefereeData {
  minList: number; canBan: boolean; banReason: string | null; usable: number;
  referees: RefereeRow[];
}

export interface BoardMessage {
  id: string; teamId: string; senderName: string; senderRole: string;
  body: string; sentAt: string; targetRole?: string | null;
}

export interface BoardData {
  seat: { role: string; roleLabel: string; status: string } | null;
  messages: BoardMessage[];
  /** Veřejná nástěnka — vidí ji každý klub, i ten bez funkce. */
  publicMessages: BoardMessage[];
  /** Smí tenhle klub na nástěnku psát? (jen kluby s hlasovacím právem) */
  canPost: boolean;
  /** Soukromé vzkazy odborům, už ořezané na to, co smíš vidět. */
  inbox: Record<string, BoardMessage[]>;
  unread: number;
  maxLength: number;
}

export interface SponsorOffer {
  id: string; name: string; amount: number; seasons: number;
  tier: "mistni" | "okresni" | "regionalni";
  conditions: string[]; status: string;
}

export interface SponsorData {
  gatekeeperTeamId: string | null;
  current: {
    name: string; amount: number; satisfaction: number;
    untilSeason: number | null; originalName: string | null;
  } | null;
  offers: SponsorOffer[];
}

export interface GrantsData {
  freeBalance: number;
  min: number; max: number; surplusMaxPct: number;
  pitchThreshold: number;
  kinds: Array<{ kind: string; label: string; targeted: boolean; seasonEnd: boolean }>;
  teams: Array<{
    teamId: string; teamName: string; managerName: string | null;
    vMinusu: boolean; hristePodHranici: boolean;
  }>;
}
