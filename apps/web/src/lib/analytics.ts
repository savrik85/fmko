import posthog from "posthog-js";

const POSTHOG_KEY = process.env.NEXT_PUBLIC_POSTHOG_KEY;
const POSTHOG_HOST = process.env.NEXT_PUBLIC_POSTHOG_HOST || "https://eu.i.posthog.com";

let isInitialized = false;

/**
 * Určí prostředí podle domény. Testing i produkce posílají do stejného PostHog
 * projektu, tahle vlastnost je u každé události a podle ní se dají oddělit.
 */
function detectEnvironment(): "production" | "testing" | "development" {
  const host = window.location.hostname;
  if (host === "prales.fun" || host === "www.prales.fun") return "production";
  if (host === "test.prales.fun") return "testing";
  return "development";
}

/**
 * Normalizuje cestu a zařadí ji do odpovídající herní sekce.
 * Zabraňuje fragmentaci URL s dynamickými ID v analytických přehledech.
 */
export function categorizePath(pathname: string): { normalizedPath: string; featureArea: string } {
  // Nahradí UUID, ID hráčů nebo číselné ID za zástupný znak :id
  const normalizedPath = pathname
    .replace(/\/[a-f0-9-]{8,}(?=\/|$)/gi, "/:id")
    .replace(/\/cm[a-z0-9_]{10,}(?=\/|$)/gi, "/:id");

  let featureArea = "ostatni";
  if (pathname === "/" || pathname === "/prehled") {
    featureArea = "prehled";
  } else if (pathname === "/vice") {
    featureArea = "menu_vice";
  } else if (
    pathname.startsWith("/zapas") ||
    pathname.startsWith("/pratelaky") ||
    pathname.startsWith("/zapasovy-den")
  ) {
    featureArea = "zapasy_a_taktika";
  } else if (
    pathname.startsWith("/kadr") ||
    pathname.startsWith("/trenink") ||
    pathname.startsWith("/u21") ||
    pathname.startsWith("/zamestnanci")
  ) {
    featureArea = "tym_a_trenink";
  } else if (pathname.startsWith("/hrac")) {
    featureArea = "detail_hrace";
  } else if (
    pathname.startsWith("/prestupy") ||
    pathname.startsWith("/sledovani")
  ) {
    featureArea = "prestupy_a_trh";
  } else if (pathname.startsWith("/vybaveni")) {
    featureArea = "vybaveni_a_bazar";
  } else if (
    pathname.startsWith("/finance") ||
    pathname.startsWith("/sponzori")
  ) {
    featureArea = "finance_a_sponzori";
  } else if (pathname.startsWith("/hospoda")) {
    featureArea = "hospoda";
  } else if (pathname.startsWith("/fanousci")) {
    featureArea = "fanousci_a_kotel";
  } else if (pathname.startsWith("/incidenty")) {
    featureArea = "incidenty";
  } else if (
    pathname.startsWith("/muj-klub") ||
    pathname.startsWith("/stadion") ||
    pathname.startsWith("/reputace")
  ) {
    featureArea = "klub_a_stadion";
  } else if (
    pathname.startsWith("/tym") ||
    pathname.startsWith("/manazer") ||
    pathname.startsWith("/klub/")
  ) {
    featureArea = "ostatni_kluby";
  } else if (
    pathname.startsWith("/obec") ||
    pathname.startsWith("/udalosti")
  ) {
    featureArea = "zivot_v_obci";
  } else if (pathname.startsWith("/sazky")) {
    featureArea = "sazky";
  } else if (
    pathname.startsWith("/liga") ||
    pathname.startsWith("/pohar") ||
    pathname.startsWith("/soutez") ||
    pathname.startsWith("/rozpis") ||
    pathname.startsWith("/kalendar") ||
    pathname.startsWith("/sin-slavy") ||
    pathname.startsWith("/hlasovani")
  ) {
    featureArea = "souteze_a_tabulky";
  } else if (pathname.startsWith("/telefon")) {
    featureArea = "telefon_a_sms";
  } else if (
    pathname.startsWith("/zpravodaj") ||
    pathname.startsWith("/novinky") ||
    pathname.startsWith("/redakce")
  ) {
    featureArea = "noviny_a_redakce";
  } else if (pathname.startsWith("/rozhodci")) {
    featureArea = "rozhodci";
  } else if (
    pathname.startsWith("/nastaveni") ||
    pathname.startsWith("/napoveda") ||
    pathname.startsWith("/admin") ||
    pathname.startsWith("/aplikace") ||
    pathname.startsWith("/pozvat")
  ) {
    featureArea = "nastaveni_a_podpora";
  } else if (
    pathname.startsWith("/prihlaseni") ||
    pathname.startsWith("/registrace") ||
    pathname.startsWith("/onboarding") ||
    pathname.startsWith("/create") ||
    pathname.startsWith("/pozvanka/")
  ) {
    featureArea = "registrace";
  } else if (pathname.startsWith("/nova-sezona") || pathname.startsWith("/konec-sezony")) {
    featureArea = "konec_sezony";
  }

  return { normalizedPath, featureArea };
}

/**
 * Inicializuje PostHog na klientovi.
 * Bezpečně přeskočí inicializaci na serveru nebo pokud chybí API klíč.
 */
export function initPostHog(): typeof posthog | null {
  if (typeof window === "undefined") return null;
  if (isInitialized) return posthog;

  if (!POSTHOG_KEY) {
    if (process.env.NODE_ENV === "development") {
      console.info(
        "[Analytics] PostHog API klíč (NEXT_PUBLIC_POSTHOG_KEY) není nastaven. Sledování běží v tichém režimu."
      );
    }
    return null;
  }

  try {
    posthog.init(POSTHOG_KEY, {
      api_host: POSTHOG_HOST,
      person_profiles: "identified_only", // Profil jen pro přihlášené, historii z doby před přihlášením k němu PostHog připojí
      capture_pageview: false, // V Next.js App Routeru sledujeme změny stránek v PostHogPageView
      capture_pageleave: true, // Měří přesný čas strávený na jednotlivých stránkách a odchody
      capture_exceptions: true, // Automatické zachycení neošetřených JS chyb v prohlížeči (Error tracking)
      capture_performance: true, // Měření Core Web Vitals a rychlosti načítání stránek
      autocapture: true, // Automaticky zaznamenává kliknutí na tlačítka, odkazy a formulářové prvky
      session_recording: {
        maskAllInputs: false, // Pro ladění je potřeba vidět, co hráči píšou
        maskInputOptions: {
          password: true, // Hesla vždy striktně maskovat
        },
      },
    });
    posthog.register({ environment: detectEnvironment() });

    isInitialized = true;
    return posthog;
  } catch (error) {
    console.error("[Analytics] Chyba při inicializaci PostHog:", error);
    return null;
  }
}

/**
 * Spojí aktuální sezení s konkrétním hráčem/uživatelem a jeho týmem.
 */
export function identifyUser(
  userId: string,
  properties?: {
    email?: string | null;
    teamId?: string | null;
    teamName?: string | null;
    villageName?: string | null;
    district?: string | null;
    budget?: number | null;
    leaguePosition?: number | null;
    season?: number | null;
    seasonDay?: number | null;
    isAdmin?: boolean;
    [key: string]: unknown;
  }
) {
  if (typeof window === "undefined" || !POSTHOG_KEY) return;
  try {
    const cleanProps = properties
      ? Object.fromEntries(
          Object.entries(properties).filter(([_, v]) => v !== null && v !== undefined)
        )
      : undefined;

    posthog.identify(userId, cleanProps);
  } catch (err) {
    console.warn("[Analytics] Chyba při identifyUser:", err);
  }
}

/**
 * Odhlásí identitu (při odhlášení ze hry) a vygeneruje nové anonymní ID.
 */
export function resetUser() {
  if (typeof window === "undefined" || !POSTHOG_KEY) return;
  try {
    posthog.reset();
  } catch (err) {
    console.warn("[Analytics] Chyba při resetUser:", err);
  }
}

/**
 * Ruční zaznamenání vlastní herní události (např. nákup, odehrání zápasu, změna taktiky).
 */
export function trackEvent(eventName: string, properties?: Record<string, unknown>) {
  if (typeof window === "undefined" || !POSTHOG_KEY) return;
  try {
    posthog.capture(eventName, properties);
  } catch (err) {
    console.warn("[Analytics] Chyba při trackEvent:", err);
  }
}

/**
 * Zaznamenání zobrazení stránky pro Next.js App Router s obohacením o sekci a záložku.
 */
export function trackPageView(
  url: string,
  extraProperties?: {
    page_path?: string;
    feature_area?: string;
    tab?: string | null;
    [key: string]: unknown;
  }
) {
  if (typeof window === "undefined" || !POSTHOG_KEY) return;
  try {
    posthog.capture("$pageview", {
      $current_url: url,
      ...extraProperties,
    });
  } catch (err) {
    console.warn("[Analytics] Chyba při trackPageView:", err);
  }
}

export { posthog };
