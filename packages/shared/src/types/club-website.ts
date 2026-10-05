export type ClubWebsiteTemplate =
  | "retro_2004"
  | "village_patriot"
  | "regional_standard"
  | "profi_league"
  | "champions";

export type ClubWebsiteAddon =
  | "custom_slug"
  | "sponsor_banner"
  | "audio_module"
  | "stadium_gallery"
  | "press_officer";

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
    description: "Prémiový tmavý portál s klubovým podsvícením, velký zápasový odpočet a TV sekce.",
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
  custom_slug: {
    id: "custom_slug",
    name: "Vlastní URL adresa (slug)",
    price: 10000,
    description: "Unikátní webová adresa (např. prales.cz/klub/fk-kozlovice) místo číselného ID.",
  },
  sponsor_banner: {
    id: "sponsor_banner",
    name: "Sponzorská reklamní lišta",
    price: 16000,
    description: "Reklamní plocha na webu, která přináší týdenní pasivní příjem z návštěvnosti.",
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
    budget: number;
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
  } | null;
  staff: ClubWebsiteStaff[];
  roster: {
    aTeam: ClubWebsitePlayer[];
    u21Team: ClubWebsitePlayer[];
  };
  matches: {
    lastMatch: {
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
    } | null;
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
  concessions: {
    beerPrice: number;
    sausagePrice: number;
    lemonadePrice: number;
    beerName: string;
    sausageName: string;
    lemonadeName: string;
  };
  tickets: {
    adultPrice: number;
    childPrice: number;
    seasonPassPrice: number;
  };
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

export interface ClubWebsiteTransfer {
  id: string;
  direction: "in" | "out";
  kind: "transfer" | "swap" | "free_agent" | "released";
  playerId: string;
  playerName: string;
  otherTeamId: string | null;
  otherTeamName: string | null;
  fee: number;
  date: string;
  seasonNumber: number | null;
  headline: string;
  story: string;
  quote?: string;
  isAiGenerated?: boolean;
}


