"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useTeam } from "@/context/team-context";
import { apiFetch } from "@/lib/api";
import { Spinner, SectionLabel } from "@/components/ui";

type StavIncidentu = "hrozi" | "otevreny" | "policie" | "probiha" | "uzavreny";

interface Incident {
  id: string;
  kind: string;
  label: string;
  emoji: string;
  category: string;
  status: StavIncidentu;
  severity: number;
  gameDate: string;
  deadline: string | null;
  text: string;
  ztraty: string[];
  pachatel: { playerId: string; jmeno: string | null } | null;
  resolution: string | null;
  resolvedOn: string | null;
}

interface Poskozeni {
  id: string;
  facility: string;
  label: string;
  levels: number;
  cost: number;
  popis: string;
  gameDate: string | null;
}

const STAV_LABEL: Record<StavIncidentu, string> = {
  hrozi: "Hrozí", otevreny: "Řeší se", policie: "Šetří policie", probiha: "Probíhá", uzavreny: "Uzavřeno",
};

const STAV_TRIDA: Record<StavIncidentu, string> = {
  hrozi: "bg-amber-100 text-amber-700",
  otevreny: "bg-red-100 text-red-700",
  policie: "bg-blue-100 text-blue-700",
  probiha: "bg-amber-100 text-amber-700",
  uzavreny: "bg-gray-100 text-muted",
};

const VYSLEDEK_LABEL: Record<string, string> = {
  nevyreseno: "Nevyřešeno",
  konec_sezony: "Uzavřeno koncem sezóny",
  bez_skody: "Bez škody",
  nechat_byt: "Trenér to nechal být",
};

function datum(iso: string): string {
  return new Date(iso).toLocaleDateString("cs-CZ", { day: "numeric", month: "numeric", timeZone: "UTC" });
}

export default function IncidentyPage() {
  const { teamId } = useTeam();
  const [incidenty, setIncidenty] = useState<Incident[] | null>(null);
  const [chyba, setChyba] = useState(false);
  const [poskozeni, setPoskozeni] = useState<Poskozeni[]>([]);
  const [opravujeId, setOpravujeId] = useState<string | null>(null);
  const [opravaZprava, setOpravaZprava] = useState<{ typ: "ok" | "chyba"; text: string } | null>(null);

  useEffect(() => {
    if (!teamId) return;
    apiFetch<{ incidents: Incident[] }>(`/api/teams/${teamId}/incidents`)
      .then((d) => setIncidenty(d.incidents))
      .catch((e) => { console.error("incidents fetch:", e); setChyba(true); });
    apiFetch<{ damage?: Poskozeni[] }>(`/api/teams/${teamId}/fans/groups`)
      .then((d) => setPoskozeni(d.damage ?? []))
      .catch((e) => console.error("damage fetch:", e));
  }, [teamId]);

  async function opravit(p: Poskozeni) {
    if (!teamId) return;
    setOpravujeId(p.id);
    setOpravaZprava(null);
    try {
      await apiFetch(`/api/teams/${teamId}/fans/repair/${p.id}`, { method: "POST" });
      setPoskozeni((list) => list.filter((x) => x.id !== p.id));
      setOpravaZprava({ typ: "ok", text: `Opraveno: ${p.label}.` });
    } catch (e) {
      console.error("repair:", e);
      setOpravaZprava({ typ: "chyba", text: e instanceof Error ? e.message : "Opravu se nepodařilo provést." });
    } finally {
      setOpravujeId(null);
    }
  }

  if (chyba) {
    return <div className="page-container"><div className="card p-4 text-sm text-muted">Incidenty se nepodařilo načíst.</div></div>;
  }
  if (!incidenty) {
    return <div className="page-container flex items-center justify-center min-h-[50vh]"><Spinner /></div>;
  }

  const zive = incidenty.filter((i) => i.status !== "uzavreny");
  const uzavrene = incidenty.filter((i) => i.status === "uzavreny");

  return (
    <div className="page-container space-y-5">
      <div className="card p-4 sm:p-5">
        <SectionLabel>Incidenty v klubu</SectionLabel>
        <p className="text-sm text-muted">
          Krádeže, rozbité vybavení a další průšvihy. Ukradené vybavení v klubu opravdu chybí
          a rozbité zařízení nefunguje, dokud ho neopravíš. Proti zlodějům zvenku pomáhá
          zabezpečení areálu ve vybavení.
        </p>
      </div>
      {poskozeni.length > 0 && (
        <div className="card p-4 sm:p-5">
          <SectionLabel>Rozbité zařízení</SectionLabel>
          <p className="text-sm text-muted">Dokud rozbité zařízení neopravíš, nefunguje.</p>
          {opravaZprava && (
            <p className={`text-sm mt-2 ${opravaZprava.typ === "ok" ? "text-pitch-600" : "text-card-red"}`}>
              {opravaZprava.text}
            </p>
          )}
          <div className="mt-3 space-y-3">
            {poskozeni.map((p) => (
              <div key={p.id} className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="font-heading font-bold text-base">{p.label}</div>
                  <div className="text-sm text-muted">
                    Oprava {p.cost.toLocaleString("cs-CZ")} Kč · o {p.levels} {p.levels === 1 ? "úroveň" : "úrovně"}
                  </div>
                </div>
                <button
                  onClick={() => opravit(p)}
                  disabled={opravujeId === p.id}
                  className="shrink-0 px-3 py-2 rounded-soft text-sm font-heading font-bold bg-pitch-500 text-white hover:bg-pitch-600 disabled:opacity-50"
                >
                  Opravit
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
      <Seznam titulek="Řeší se" incidenty={zive} prazdne="Teď je v klubu klid." />
      {uzavrene.length > 0 && <Seznam titulek="Uzavřené za poslední měsíc" incidenty={uzavrene} />}
    </div>
  );
}

function Seznam({ titulek, incidenty, prazdne }: { titulek: string; incidenty: Incident[]; prazdne?: string }) {
  return (
    <div className="card p-4 sm:p-5">
      <SectionLabel>{titulek}</SectionLabel>
      {incidenty.length === 0
        ? <div className="text-sm text-muted">{prazdne}</div>
        : <div className="space-y-3">{incidenty.map((i) => <Karta key={i.id} incident={i} />)}</div>}
    </div>
  );
}

function Karta({ incident: i }: { incident: Incident }) {
  const vysledek = i.resolution ? VYSLEDEK_LABEL[i.resolution] : undefined;
  return (
    <div className="border border-gray-100 rounded-soft p-3">
      <div className="flex items-start gap-3">
        <span className="text-2xl leading-none" aria-hidden>{i.emoji}</span>
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-heading font-bold text-base">{i.label}</span>
            <span className={`text-xs font-heading font-bold px-2 py-0.5 rounded-full ${STAV_TRIDA[i.status]}`}>{STAV_LABEL[i.status]}</span>
          </div>
          <div className="text-sm text-muted">
            {datum(i.gameDate)}
            {i.status === "otevreny" && i.deadline && ` · uzavře se ${datum(i.deadline)}`}
            {vysledek && ` · ${vysledek}`}
          </div>
          <p className="text-sm mt-2">{i.text}</p>
          {i.ztraty.length > 0 && (
            <ul className="mt-2 space-y-1">
              {i.ztraty.map((z, n) => <li key={n} className="text-sm text-card-red">{z}</li>)}
            </ul>
          )}
          {i.pachatel?.jmeno && (
            <div className="text-sm mt-2">
              Pachatel:{" "}
              <Link href={`/dashboard/player/${i.pachatel.playerId}`} className="text-base font-heading font-bold underline decoration-pitch-500/20 hover:text-pitch-500">
                {i.pachatel.jmeno}
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
