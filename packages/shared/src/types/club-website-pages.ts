import type { ClubWebsiteTemplate } from "./club-website";

/** Klub, z jehož webu se podstránka otevřela: záhlaví, barvy, vzhled šablony, odkaz zpět. */
export interface ClubWebsiteClubRef {
  id: string;
  name: string;
  slug: string | null;
  template: ClubWebsiteTemplate;
  primaryColor: string;
  secondaryColor: string;
  leagueName: string | null;
}

export interface ClubWebsiteScorer {
  minute: number;
  name: string;
  /** Odkaz na profil hráče; null = hráč se nedal dohledat (už není ve hře). */
  playerId: string | null;
  /** Gól našeho klubu? */
  ours: boolean;
  penalty: boolean;
}

export interface ClubWebsiteFixture {
  id: string;
  competition: "league" | "cup";
  competitionName: string;
  round: number;
  /** „3. kolo“, „Čtvrtfinále“… */
  roundName: string;
  /** Termín (naplánovaný zápas) nebo kdy se odehrál. */
  date: string | null;
  isHome: boolean;
  opponent: { id: string | null; name: string };
  played: boolean;
  goalsFor: number | null;
  goalsAgainst: number | null;
  pensFor: number | null;
  pensAgainst: number | null;
  attendance: number | null;
  scorers: ClubWebsiteScorer[];
  manOfMatch: { id: string; name: string } | null;
}

/** /klub/<slug>/zapasy: rozpis a výsledky aktuální sezóny (liga i pohár). */
export interface ClubWebsiteMatchesPage {
  club: ClubWebsiteClubRef;
  teamSlugs: Record<string, string>;
  seasonNumber: number | null;
  fixtures: ClubWebsiteFixture[];
}

export interface ClubWebsiteProgramTeam {
  id: string;
  name: string;
  village: string | null;
  coachName: string | null;
  position: number | null;
  points: number | null;
  played: number | null;
  /** Poslední výsledky od nejstaršího: V výhra, R remíza, P prohra. */
  form: Array<"V" | "R" | "P">;
  topScorer: { name: string; playerId: string | null; goals: number } | null;
  roster: Array<{ id: string; number: number | null; name: string; position: string }>;
}

/** /klub/<slug>/zpravodaj: zápasový program k příštímu zápasu (k vytištění). */
export interface ClubWebsiteProgramPage {
  club: ClubWebsiteClubRef;
  teamSlugs: Record<string, string>;
  match: {
    id: string;
    round: number;
    date: string | null;
    isHome: boolean;
    stadiumName: string | null;
    competitionName: string;
  } | null;
  home: ClubWebsiteProgramTeam | null;
  away: ClubWebsiteProgramTeam | null;
  headToHead: Array<{ date: string | null; homeName: string; awayName: string; homeScore: number; awayScore: number }>;
  /** Rozhovor trenéra před tímto kolem, jinak poslední zodpovězený. */
  coachWord: {
    coachName: string;
    kind: string | null;
    gameWeek: number;
    pairs: Array<{ question: string; answer: string }>;
  } | null;
  ticketPrice: number | null;
  partners: string[];
}

/** /klub/<slug>/trener: trenér a realizační tým. */
export interface ClubWebsiteCoachPage {
  club: ClubWebsiteClubRef;
  teamSlugs: Record<string, string>;
  coach: {
    name: string;
    age: number | null;
    birthplace: string | null;
    bio: string | null;
    background: string | null;
    licence: string;
    avatar: Record<string, unknown>;
    /** Od kdy klub vede (datum v DB). */
    since: string | null;
  } | null;
  /** Bilance soutěžních zápasů klubu od příchodu trenéra (liga i pohár). */
  record: { played: number; wins: number; draws: number; losses: number; goalsFor: number; goalsAgainst: number } | null;
  interviews: Array<{ id: string; kind: string | null; gameWeek: number; createdAt: string }>;
  staff: Array<{ id: string; roleLabel: string; name: string; age: number | null; avatar: Record<string, unknown>; description: string | null }>;
}
