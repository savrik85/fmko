import posthog from "posthog-js";

const POSTHOG_KEY = process.env.NEXT_PUBLIC_POSTHOG_KEY;
const POSTHOG_HOST = process.env.NEXT_PUBLIC_POSTHOG_HOST || "https://eu.i.posthog.com";

let isInitialized = false;

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
      person_profiles: "always", // Sleduje anonymní i přihlášené návštěvníky a po přihlášení spojí historii
      capture_pageview: false, // V Next.js App Routeru sledujeme změny stránek v PostHogPageView
      capture_pageleave: true, // Měří přesný čas strávený na jednotlivých stránkách a odchody
      autocapture: true, // Automaticky zaznamenává kliknutí na tlačítka, odkazy a formulářové prvky
      session_recording: {
        maskAllInputs: false,
        maskInputOptions: {
          password: true, // Hesla vždy striktně maskovat
        },
      },
    });

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
 * Zaznamenání zobrazení stránky pro Next.js App Router.
 */
export function trackPageView(url: string) {
  if (typeof window === "undefined" || !POSTHOG_KEY) return;
  try {
    posthog.capture("$pageview", {
      $current_url: url,
    });
  } catch (err) {
    console.warn("[Analytics] Chyba při trackPageView:", err);
  }
}

export { posthog };
