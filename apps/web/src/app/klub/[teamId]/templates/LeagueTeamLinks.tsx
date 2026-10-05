import Link from "next/link";
import type { ClubWebsiteData } from "@okresni-masina/shared";
import { useTeamHref } from "./shared";

type Standings = NonNullable<ClubWebsiteData["matches"]["standings"]>;

/**
 * Odkazy na klubové weby ostatních týmů z ligy, do patičky všech šablon.
 * Barvy se předávají přes className, aby seděly k designu šablony.
 */
export function LeagueTeamLinks({
  standings,
  title = "Další kluby z naší ligy",
  className = "",
  titleClassName = "",
  linkClassName = "hover:underline",
  separator,
}: {
  standings: Standings;
  title?: string;
  className?: string;
  titleClassName?: string;
  linkClassName?: string;
  separator?: string;
}) {
  const teamHref = useTeamHref();
  const others = standings.filter((s) => !s.isCurrentTeam);
  if (others.length === 0) return null;

  return (
    <nav aria-label={title} className={className}>
      <div className={titleClassName}>{title}</div>
      <ul className="flex flex-wrap gap-x-3 gap-y-1 justify-center">
        {others.map((s, i) => (
          <li key={s.teamId}>
            <Link href={teamHref(s.teamId)} className={linkClassName}>
              {s.teamName}
            </Link>
            {separator && i < others.length - 1 ? (
              <span aria-hidden="true" className="ml-3 opacity-50">{separator}</span>
            ) : null}
          </li>
        ))}
      </ul>
    </nav>
  );
}
