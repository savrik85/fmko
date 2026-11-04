"use client";

/**
 * Mládež → Akademie: družstvo žáků (11–14 let). Dřív záložka U21 (?tab=akademie,
 * přesměrovává se). Mezi U21 a Akademií se přepíná nahoře na stránce (YouthSectionNav).
 */

import { useTeam } from "@/context/team-context";
import { AcademyCard } from "@/components/players/academy-card";
import { YouthSectionNav } from "@/components/players/youth-section-nav";

export default function AcademyPage() {
  const { teamId } = useTeam();
  return (
    <div className="p-3 sm:p-4 md:p-6 space-y-3 max-w-7xl mx-auto w-full">
      <YouthSectionNav />
      {teamId ? <AcademyCard teamId={teamId} /> : <p className="card p-4 text-sm text-muted" role="status">Načítám…</p>}
    </div>
  );
}
