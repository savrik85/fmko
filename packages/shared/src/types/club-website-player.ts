import type { ClubWebsiteTemplate } from "./club-website";

/** Veřejný profil hráče na klubovém webu. Jen to, co by o hráči napsal klubový web: žádné skryté atributy. */
export interface ClubWebsitePlayerProfile {
  /** Hezké adresy webů klubů v profilu (ID klubu → slug). */
  teamSlugs: Record<string, string>;
  /** Klub, z jehož webu se profil otevřel (záhlaví, barvy, odkaz zpět). */
  club: {
    id: string;
    name: string;
    slug: string | null;
    /** Šablona webu klubu: profil hráče vypadá stejně jako zbytek jeho webu. */
    template: ClubWebsiteTemplate;
    primaryColor: string;
    secondaryColor: string;
  };
  player: {
    id: string;
    firstName: string;
    lastName: string;
    nickname: string | null;
    age: number;
    position: string;
    positionName: string;
    overallRating: number;
    squadNumber: number | null;
    nationality: string | null;
    description: string | null;
    avatar: Record<string, unknown>;
    /** active | released | quit… (propuštěný hráč už v klubu není) */
    status: string | null;
  };
  /** Kde hráč hraje teď; null = bez klubu. */
  currentTeam: { id: string; name: string } | null;
  /** Hraje za klub, z jehož webu se profil otevřel? */
  playsForClub: boolean;
  seasons: Array<{
    seasonNumber: number;
    teamId: string;
    teamName: string;
    appearances: number;
    goals: number;
    assists: number;
    yellowCards: number;
    redCards: number;
    manOfMatch: number;
    minutesPlayed: number;
    avgRating: number | null;
    cleanSheets: number;
  }>;
  /** Kariéra po klubech (bez částek, ty kluby nezveřejňují). */
  career: Array<{
    teamId: string;
    teamName: string;
    joinedAt: string | null;
    leftAt: string | null;
    joinType: string | null;
    leaveType: string | null;
  }>;
}
