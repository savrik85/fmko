/**
 * Hřiště areálu P-Mobile pro 3D scénu: z `look` (tournament_venues.look) úrovně vybavení,
 * barvy areálu a přístavby tribun ve tvaru, jaký bere Stadium3D (stejně jako stadion klubu).
 */
export interface VenueExtension {
  slot: string;
  kind: string;
  level: number;
}

export function venueFacilities(look: Record<string, unknown> | null | undefined): Record<string, number> {
  const facilities: Record<string, number> = {};
  for (const [k, v] of Object.entries(look ?? {})) if (typeof v === "number") facilities[k] = v;
  return facilities;
}

export function venueExtensions(look: Record<string, unknown> | null | undefined): VenueExtension[] {
  const raw = look?.extensions;
  if (!Array.isArray(raw)) return [];
  return raw.filter((e): e is VenueExtension =>
    !!e && typeof e === "object"
    && typeof (e as VenueExtension).slot === "string"
    && typeof (e as VenueExtension).kind === "string"
    && typeof (e as VenueExtension).level === "number");
}

export function venueColors(look: Record<string, unknown> | null | undefined, fallback: string): { primary: string; secondary: string } {
  return {
    primary: typeof look?.primary === "string" ? look.primary : fallback,
    secondary: typeof look?.secondary === "string" ? look.secondary : "#FFFFFF",
  };
}
