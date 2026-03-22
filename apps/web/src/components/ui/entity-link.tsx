import React from "react";
import Link from "next/link";

type EntityType = "player" | "team" | "village";

interface EntityLinkProps {
  type: EntityType;
  id: string;
  children: React.ReactNode;
  className?: string;
}

const ROUTES: Record<EntityType, string> = {
  player: "/dashboard/player",
  team: "/team",
  village: "/village",
};

/**
 * FM-style clickable entity link.
 * Click on player/team/village name → navigates to detail page.
 * Uses .entity-link CSS class (green underlined text).
 */
export function EntityLink({ type, id, children, className = "" }: EntityLinkProps) {
  return (
    <Link href={`${ROUTES[type]}/${id}`} className={`entity-link ${className}`}>
      {children}
    </Link>
  );
}
