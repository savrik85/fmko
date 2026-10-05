"use client";

import { useParams, useRouter } from "next/navigation";
import { useTeam } from "@/context/team-context";
import { MatchReplayViewer } from "@/components/match/MatchReplayViewer";

export default function MatchReplayPage() {
  const params = useParams();
  const router = useRouter();
  const { teamId } = useTeam();
  const matchId = params.id as string;

  return (
    <div className="max-w-4xl mx-auto px-3 py-2">
      <MatchReplayViewer
        matchId={matchId}
        teamId={teamId}
        showContinueButton={true}
        onContinue={() => router.push(`/zapas/${matchId}`)}
      />
    </div>
  );
}
