import type { CSSProperties } from "react";
import { BadgePreview } from "./badge-preview";
import type { BadgePattern } from "./badge-preview";
import { bestTextOn } from "@/lib/team-color";

interface HeroBackdropProps {
  /** Barva pozadí hlavičky (hlavní barva klubu). */
  primary: string;
  /** Vedlejší barva klubu: šerpa a spodní linka. */
  secondary?: string | null;
  /** Tvar znaku pro vodoznak; bez něj se vodoznak nekreslí. */
  pattern?: string | null;
}

/**
 * Pozadí velké hlavičky detailu: přechod, šerpa ve vedlejší barvě klubu a znak
 * jako vodoznak. Vkládá se jako první potomek prvku s třídami
 * `hero-gradient hero-detail`.
 */
export function HeroBackdrop({ primary, secondary, pattern }: HeroBackdropProps) {
  const darkText = bestTextOn(primary) === "dark";
  const neutral = darkText ? "#111827" : "#FFFFFF";
  // Vedlejší barva shodná s hlavní by na pozadí zmizela.
  const accent = secondary && secondary.toLowerCase() !== primary.toLowerCase() ? secondary : neutral;

  return (
    <div className="hero-backdrop" aria-hidden="true" style={{ "--hero-accent": accent } as CSSProperties}>
      <div className="hero-backdrop-shade" />
      <div className="hero-backdrop-sash" />
      {pattern !== undefined && (
        <div className="hero-backdrop-mark">
          <BadgePreview
            primary={neutral}
            secondary={neutral}
            pattern={(pattern as BadgePattern) || "shield"}
            /* Jen obrys: písmena by se pod dlaždicemi vpravo četla jako šum. */
            initials=""
            size={190}
          />
        </div>
      )}
      <div className="hero-backdrop-edge" />
    </div>
  );
}
