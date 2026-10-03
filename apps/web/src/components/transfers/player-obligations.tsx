"use client";

/**
 * Smluvní závazky k jednomu hráči z pohledu mého klubu: co za něj splácím nebo mi kdo splácí
 * a komu patří procenta z jeho příštího přestupu. Cizímu klubu server nic nevrátí, takže se
 * karta neukáže.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { apiFetch } from "@/lib/api";
import { SectionLabel } from "@/components/ui";

interface Deal {
  otherTeamId: string; otherTeamName: string; totalAmount: number; remaining: number;
  installmentAmount: number; installmentsPaid: number; installmentsTotal: number; nextPayment: number;
}
interface Clause { otherTeamId: string; otherTeamName: string; pct: number }
interface PlayerObligations { paying: Deal | null; receiving: Deal | null; sellOnOwed: Clause | null; sellOnClaim: Clause | null }

const kc = (v: number) => `${v.toLocaleString("cs-CZ")} Kč`;

function Team({ id, name }: { id: string; name: string }) {
  return <Link href={`/tym/${id}`} className="font-heading font-bold hover:text-pitch-500 underline decoration-pitch-500/20">{name}</Link>;
}

export function PlayerObligationsCard({ teamId, playerId }: { teamId: string; playerId: string }) {
  const [data, setData] = useState<PlayerObligations | null>(null);

  useEffect(() => {
    apiFetch<PlayerObligations>(`/api/teams/${teamId}/players/${playerId}/obligations`)
      .then(setData)
      .catch((e) => console.error("load player obligations:", e));
  }, [teamId, playerId]);

  if (!data || (!data.paying && !data.receiving && !data.sellOnOwed && !data.sellOnClaim)) return null;
  const { paying, receiving, sellOnOwed, sellOnClaim } = data;

  return (
    <div className="card p-4 sm:p-5">
      <div className="flex items-baseline justify-between gap-2">
        <SectionLabel>Smluvní závazky</SectionLabel>
        <Link href="/prestupy?tab=squad&tym=zavazky" className="text-sm text-muted hover:text-pitch-500 underline decoration-pitch-500/20">Všechny závazky</Link>
      </div>
      <ul className="space-y-2 text-sm">
        {paying && (
          <li>
            Splácíš ho klubu <Team id={paying.otherTeamId} name={paying.otherTeamName} />: cena {kc(paying.totalAmount)},
            zbývá <span className="font-heading font-bold tabular-nums">{kc(paying.remaining)}</span>,
            příští pondělí {kc(paying.nextPayment)} (splátka {paying.installmentsPaid + 1} z {paying.installmentsTotal}).
            <span className="block text-muted">Když ho prodáš, zbytek se doplatí hned z ceny prodeje.</span>
          </li>
        )}
        {receiving && (
          <li>
            <Team id={receiving.otherTeamId} name={receiving.otherTeamName} /> ti za něj splácí: cena {kc(receiving.totalAmount)},
            zbývá <span className="font-heading font-bold tabular-nums">{kc(receiving.remaining)}</span>,
            příští pondělí {kc(receiving.nextPayment)} (splátka {receiving.installmentsPaid + 1} z {receiving.installmentsTotal}).
          </li>
        )}
        {sellOnOwed && (
          <li>
            Až ho prodáš, <Team id={sellOnOwed.otherTeamId} name={sellOnOwed.otherTeamName} /> dostane{" "}
            <span className="font-heading font-bold">{sellOnOwed.pct} %</span> z ceny.
            <span className="block text-muted">Propustit ho kvůli tomu nejde. Když odejde sám zadarmo, procenta propadnou.</span>
          </li>
        )}
        {sellOnClaim && (
          <li>
            Až ho <Team id={sellOnClaim.otherTeamId} name={sellOnClaim.otherTeamName} /> prodá, dostaneš{" "}
            <span className="font-heading font-bold">{sellOnClaim.pct} %</span> z ceny.
          </li>
        )}
      </ul>
    </div>
  );
}
