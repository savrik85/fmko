"use client";

/**
 * /trener — vlastní profil trenéra. Adresa do menu: profil má v URL id týmu,
 * které statický odkaz nezná, proto se sem chodí a odsud se přesměruje.
 * Parametry (např. ?tab=vzdelani) jdou s sebou.
 */

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useTeam } from "@/context/team-context";
import { Spinner } from "@/components/ui";

export default function TrenerPage() {
  const router = useRouter();
  const { teamId } = useTeam();

  useEffect(() => {
    if (!teamId) return;
    router.replace(`/manazer/${teamId}${window.location.search}`);
  }, [teamId, router]);

  return <div className="min-h-[50dvh] flex items-center justify-center"><Spinner size="lg" /></div>;
}
