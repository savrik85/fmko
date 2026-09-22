"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { sponsorTypeLabel } from "@/lib/sponsor-types";
import { Card, CardBody, Spinner, SectionLabel, ErrorBox } from "@/components/ui";
import { useTeam } from "@/context/team-context";
import { OwnerCard, type OwnerInfo, type MyTeamInfo } from "@/components/sponsors/owner-card";

interface SponsorContractRow {
  teamId: string;
  teamName: string;
  category: "main" | "stadium" | "banner";
  status: "active" | "expired" | "terminated";
  seasonsTotal: number;
  seasonsRemaining: number;
  signedAt: string;
}

interface SponsorDetail {
  id: number;
  name: string;
  type: string;
  district: string;
  mainClub: SponsorContractRow | null;
  priorityClub: { teamId: string; teamName: string } | null;
  activeContracts: SponsorContractRow[];
  history: SponsorContractRow[];
  owner: OwnerInfo | null;
  myTeam: MyTeamInfo | null;
}

const CATEGORY_LABEL: Record<SponsorContractRow["category"], string> = {
  main: "Hlavní sponzor",
  stadium: "Název stadionu",
  banner: "Banner",
};
const STATUS_LABEL: Record<SponsorContractRow["status"], string> = {
  active: "Platí",
  expired: "Vypršela",
  terminated: "Ukončena předčasně",
};

function sezony(n: number): string {
  return `${n} ${n === 1 ? "sezóna" : n <= 4 ? "sezóny" : "sezón"}`;
}

function TeamLink({ id, name }: { id: string; name: string }) {
  return <Link href={`/tym/${id}`} className="font-heading font-bold text-base hover:text-pitch-600 hover:underline">{name}</Link>;
}

export default function SponsorDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { teamId } = useTeam();
  const [data, setData] = useState<SponsorDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = () => {
    apiFetch<SponsorDetail>(`/api/sponsors/${id}${teamId ? `?teamId=${teamId}` : ""}`)
      .then(setData)
      .catch((e) => { console.error("sponsor detail:", e); setError((e as Error).message); });
  };
  useEffect(load, [id, teamId]);

  if (error) return <div className="page-container"><ErrorBox message={error} /></div>;
  if (!data) return <div className="flex justify-center py-12"><Spinner /></div>;

  const others = data.activeContracts.filter((c) => c.category !== "main");

  return (
    <div className="page-container space-y-5">
      <Card>
        <CardBody>
          <div className="text-sm text-muted font-heading uppercase tracking-wide">Sponzor · okres {data.district}</div>
          <div className="font-heading font-bold text-2xl">{data.name}</div>
          <div className="text-sm text-muted">{sponsorTypeLabel(data.type)}</div>
        </CardBody>
      </Card>

      {data.owner && (
        <OwnerCard sponsorId={data.id} teamId={teamId} owner={data.owner} myTeam={data.myTeam} onChanged={load} />
      )}

      <div>
        <SectionLabel>{"\u{1F4DD}"} Hlavní sponzor klubu</SectionLabel>
        <Card>
          <CardBody>
            {data.mainClub ? (
              <div>
                <TeamLink id={data.mainClub.teamId} name={data.mainClub.teamName} />
                <div className="text-sm text-muted">Smlouva ještě na {sezony(data.mainClub.seasonsRemaining)}</div>
              </div>
            ) : data.priorityClub ? (
              <div className="text-base">
                Zatím nikde. Letos jedná přednostně s klubem{" "}
                <TeamLink id={data.priorityClub.teamId} name={data.priorityClub.teamName} />.
              </div>
            ) : (
              <div className="text-base text-muted">Zatím nikde. Hledá klub, se kterým by šel do názvu.</div>
            )}
            <p className="text-sm text-muted mt-2">Hlavním sponzorem může být vždy jen u jednoho klubu.</p>
          </CardBody>
        </Card>
      </div>

      {others.length > 0 && (
        <div>
          <SectionLabel>{"\u{1F3AF}"} Další smlouvy</SectionLabel>
          <Card>
            <CardBody>
              <ul className="divide-y divide-gray-100">
                {others.map((c, i) => (
                  <li key={i} className="py-2 flex items-center justify-between gap-3">
                    <TeamLink id={c.teamId} name={c.teamName} />
                    <span className="text-sm text-muted shrink-0">{CATEGORY_LABEL[c.category]}</span>
                  </li>
                ))}
              </ul>
            </CardBody>
          </Card>
        </div>
      )}

      <div>
        <SectionLabel>{"\u{1F4DC}"} Dřívější spolupráce</SectionLabel>
        <Card>
          <CardBody>
            {data.history.length === 0 ? (
              <p className="text-center text-muted py-3">Zatím žádné.</p>
            ) : (
              <ul className="divide-y divide-gray-100">
                {data.history.map((c, i) => (
                  <li key={i} className="py-2">
                    <TeamLink id={c.teamId} name={c.teamName} />
                    <div className="text-sm text-muted">
                      {CATEGORY_LABEL[c.category]} · {sezony(c.seasonsTotal)} · {STATUS_LABEL[c.status]}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
