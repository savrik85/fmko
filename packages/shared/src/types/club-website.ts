export type ClubWebsiteTemplate =
  | "retro_2004"
  | "village_patriot"
  | "regional_standard"
  | "profi_league"
  | "champions";

export type ClubWebsiteAddon =
  | "sponsor_banner"
  | "audio_module"
  | "stadium_gallery"
  | "press_officer";

/**
 * Převede název týmu na čistou URL adresu (slug).
 * Např. "FK Rohlík Břevnov" -> "fk-rohlik-brevnov"
 */
export function slugifyTeamName(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export interface TemplateDefinition {
  id: ClubWebsiteTemplate;
  name: string;
  price: number;
  description: string;
  tier: number;
}

export interface AddonDefinition {
  id: ClubWebsiteAddon;
  name: string;
  price: number;
  description: string;
  /** Už se neprodává (obsah je na webu pro všechny). Kdo ho koupil, tomu zůstává v seznamu. */
  retired?: boolean;
}

export const CLUB_WEBSITE_TEMPLATES: Record<ClubWebsiteTemplate, TemplateDefinition> = {
  retro_2004: {
    id: "retro_2004",
    name: "Okresní přebor 2004",
    price: 0,
    description: "Retro začátek tisíciletí: Times New Roman / Arial, jednoduchá tabulka, počítadlo návštěv.",
    tier: 0,
  },
  village_patriot: {
    id: "village_patriot",
    name: "Vesnický patriot",
    price: 9000,
    description: "Rustikální dřevěná nástěnka u klandru, pivní tácek, fotka klobásy, přátelský venkovský styl.",
    tier: 1,
  },
  regional_standard: {
    id: "regional_standard",
    name: "Krajský standard",
    price: 36000,
    description: "Čistý moderní responzivní web s kartami hráčů a klubovými barvami.",
    tier: 2,
  },
  profi_league: {
    id: "profi_league",
    name: "Profi Liga (Sparta styl)",
    price: 110000,
    description: "Prémiový tmavý portál s klubovým podsvícením, odpočtem do výkopu a záznamy zápasů.",
    tier: 3,
  },
  champions: {
    id: "champions",
    name: "Champions Portál",
    price: 280000,
    description: "Supermoderní design velkoklubů s animovanými kartami a luxusní sponzorskou zónou.",
    tier: 4,
  },
};

export const CLUB_WEBSITE_ADDONS: Record<ClubWebsiteAddon, AddonDefinition> = {
  sponsor_banner: {
    id: "sponsor_banner",
    name: "Sponzorská reklamní lišta",
    price: 16000,
    description: "Lišta se skutečnými partnery klubu (sponzor na dresu, stadionu i bannerech) nahoře na webu.",
  },
  audio_module: {
    id: "audio_module",
    name: "Audio modul hymny a chorálů",
    price: 6000,
    description: "Přehrávač klubové hymny a chorálů pro návštěvníky webu.",
  },
  stadium_gallery: {
    id: "stadium_gallery",
    name: "Rozšířená fotogalerie areálu",
    price: 8000,
    description: "Prezentace fotek tribun, kotle, zázemí a klobásového stánku.",
    retired: true,
  },
  press_officer: {
    id: "press_officer",
    name: "Tiskový mluvčí (prohlášení vedení)",
    price: 12000,
    description: "Možnost publikovat vlastní oficiální zprávy a prohlášení pro fanoušky.",
  },
};

export interface ClubWebsitePlayer {
  id: string;
  firstName: string;
  lastName: string;
  position: string;
  positionName?: string;
  overallRating: number;
  age: number;
  squadNumber: number | null;
  avatar: Record<string, unknown>;
  stats: {
    appearances: number;
    goals: number;
    assists: number;
    cleanSheets: number;
    minutesPlayed: number;
  };
}

export interface ClubWebsiteStaff {
  id: string;
  role: string;
  profession: string;
  firstName: string;
  lastName: string;
  gender: string;
  age: number;
  avatar: Record<string, unknown>;
  description: string | null;
}

export interface ClubWebsiteMatchHighlight {
  minute: number;
  type: string;
  isHome: boolean;
  playerName: string;
  description: string;
  detail?: string;
  source?: string;
}

export interface ClubWebsiteMatchSummary {
  id: string;
  round: number;
  isHome: boolean;
  scoreHome: number;
  scoreAway: number;
  opponent: {
    id: string;
    name: string;
    primaryColor: string;
    badge: string;
  };
  date: string;
  highlights?: ClubWebsiteMatchHighlight[];
}

export interface ClubWebsiteData {
  team: {
    id: string;
    name: string;
    primaryColor: string;
    secondaryColor: string;
    badgePattern: string;
    jerseyPattern: string;
    village: {
      name: string;
      district: string;
      region: string;
      population: number;
    };
    identity: {
      nickname: string | null;
      motto: string | null;
      foundingYear: number | null;
      foundingStory: string | null;
      colorsMeaning: string | null;
    };
    stadium: {
      name: string | null;
      capacity: number | null;
      pitchCondition: number | null;
      pitchType: string | null;
      nickname: string | null;
      builtYear: number | null;
      specialita: string | null;
      tribunaNorth: string | null;
      tribunaSouth: string | null;
      namingSponsor: string | null;
      facilities?: Record<string, number>;
      customization?: {
        fenceColor?: string | null;
        standColor?: string | null;
        seatColor?: string | null;
        roofColor?: string | null;
        accentColor?: string | null;
        scoreboardLevel?: number;
        flagSize?: number;
        ultrasText?: string | null;
        ultrasBannerColor?: string | null;
        ultrasTextColor?: string | null;
        flagColor?: string | null;
        mowingPattern?: string | null;
        netPattern?: string | null;
        netStyle?: string | null;
        surroundSurface?: string | null;
      };
      standExtensions?: Array<{ slot: string; kind: string; level: number }>;
      sponsors?: string[];
    };
    jersey: {
      pattern: string | null;
      homePrimary: string;
      homeSecondary: string;
      awayPrimary: string | null;
      awaySecondary: string | null;
      awayPattern: string | null;
      sponsor: string | null;
      homeShortsColor: string | null;
      homeSocksColor: string | null;
      awayShortsColor: string | null;
      awaySocksColor: string | null;
    };
    badge: {
      pattern: string | null;
      primary: string;
      secondary: string;
      customPrimary: string | null;
      customSecondary: string | null;
      customInitials: string | null;
      symbol: string | null;
    };
    scarfPattern: string | null;
    anthem: {
      url: string | null;
      lyrics: string | null;
      title: string | null;
      style: string | null;
    };
    chants: Array<{
      id: string;
      kind: string;
      text: string;
      duvod: string;
      sila: number;
      url: string;
    }>;
    mascot: {
      name: string | null;
      imageUrl: string | null;
      story: string | null;
    };
    league: { id: string; name: string } | null;
  };
  website: {
    template: ClubWebsiteTemplate;
    unlockedTemplates: ClubWebsiteTemplate[];
    unlockedAddons: ClubWebsiteAddon[];
    customSlug: string | null;
    announcement: string | null;
    sponsorBannerEnabled: boolean;
    visitorCount: number;
  };
  manager: {
    name: string;
    age: number;
    reputation: number;
    avatar: Record<string, unknown>;
    licence: string;
    bio?: string | null;
    birthplace?: string | null;
  } | null;
  staff: ClubWebsiteStaff[];
  roster: {
    aTeam: ClubWebsitePlayer[];
    u21Team: ClubWebsitePlayer[];
  };
  matches: {
    lastMatch: ClubWebsiteMatchSummary | null;
    recentMatches?: ClubWebsiteMatchSummary[];
    upcomingMatches?: Array<{
      id: string;
      round: number;
      isHome: boolean;
      stadiumName: string;
      scheduledAt: string | null;
      opponent: {
        id: string;
        name: string;
        primaryColor: string;
        badge: string;
      };
    }>;
    standings?: Array<{
      pos: number;
      teamId: string;
      teamName: string;
      played: number;
      won: number;
      drawn: number;
      lost: number;
      gf: number;
      ga: number;
      points: number;
      isCurrentTeam: boolean;
    }>;
    nextMatch: {
      id: string;
      round: number;
      isHome: boolean;
      stadiumName: string;
      scheduledAt: string | null;
      isRival: boolean;
      opponent: {
        id: string;
        name: string;
        primaryColor: string;
        badge: string;
      };
    } | null;
  };
  /** null = klub tenhle produkt v bufetu nenabízí (kvalita 0), řádek se na webu nezobrazí. */
  concessions: {
    beerPrice: number | null;
    sausagePrice: number | null;
    lemonadePrice: number | null;
    beerName: string | null;
    sausageName: string | null;
    lemonadeName: string | null;
  };
  /** Anketa k příštímu zápasu; null, když klub žádný naplánovaný zápas nemá. */
  poll: {
    matchId: string;
    votes: { win: number; draw: number; loss: number };
  } | null;
  tickets: {
    /** Skutečná cena lístku, jakou klub vybere u vstupu (stejný výpočet jako tržby ze zápasu). */
    adultPrice: number;
    price?: number;
    childPrice?: number;
    seasonPassPrice?: number;
  };
  stadiumPhotos: ClubWebsiteStadiumPhotos;
  interviews: Array<{
    id: string;
    gameWeek: number;
    questions: string[];
    answers: string[];
    createdAt: string;
  }>;
  news: Array<{
    id: string;
    type: string;
    headline: string;
    body: string;
    created_at: string;
  }>;
  transfers: ClubWebsiteTransfer[];
}

/** Úhly, ze kterých se fotí 3D model stadionu pro klubový web. */
export const STADIUM_PHOTO_VIEWPOINTS = ["overview", "main_stand", "behind_goal", "dugout"] as const;
export type StadiumPhotoViewpoint = (typeof STADIUM_PHOTO_VIEWPOINTS)[number];

/** Přesně to, co dostane 3D model stadionu při focení. Z těchto dat se počítá i `version`. */
export interface ClubWebsiteStadiumRender {
  pitchCondition: number;
  pitchType: string;
  facilities: Record<string, number>;
  standExtensions: Array<{ slot: string; kind: string; level: number }>;
  teamColor: string;
  secondaryColor: string;
  badgePattern: string;
  badgeInitials: string;
  badgeSymbol: string | null;
  badgePrimary: string;
  badgeSecondary: string;
  stadiumName: string;
  sponsors: string[];
  customization: NonNullable<ClubWebsiteData["team"]["stadium"]["customization"]>;
}

export interface ClubWebsiteStadiumPhotos {
  /** Otisk aktuální podoby stadionu; fotka z jiné verze se nepoužije. */
  version: string;
  render: ClubWebsiteStadiumRender;
  /** Hotové fotky ze serveru pro aktuální verzi (chybějící úhel tu není). */
  photos: Partial<Record<StadiumPhotoViewpoint, string>>;
}

export interface ClubWebsiteTransfer {
  id: string;
  direction: "in" | "out";
  kind: "transfer" | "swap" | "free_agent" | "released";
  playerId: string;
  playerName: string;
  otherTeamId: string | null;
  otherTeamName: string | null;
  date: string;
  seasonNumber: number | null;
  headline: string;
  story: string;
  /** Slova hráče bez uvozovek a bez podpisu; šablona je obalí do „ “. */
  quote?: string;
}


