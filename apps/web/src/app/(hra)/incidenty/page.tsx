"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useTeam } from "@/context/team-context";
import { apiFetch } from "@/lib/api";
import { Spinner, SectionLabel, ListCard, ListRow, ListEmpty, RowIcon } from "@/components/ui";
import { DetailIncidentu } from "./DetailIncidentu";
import { datum, stavPilulka, VYSLEDEK_LABEL, type Incident } from "./typy";
import { formatKc } from "@/lib/format";

interface Poskozeni {
  id: string;
  facility: string;
  label: string;
  levels: number;
  cost: number;
  popis: string;
  gameDate: string | null;
}

const NACITANI = <div className="page-container flex items-center justify-center min-h-[50vh]"><Spinner /></div>;

export default function IncidentyStranka() {
  return <Suspense fallback={NACITANI}><Incidenty /></Suspense>;
}

function Incidenty() {
  const { teamId } = useTeam();
  const vybrane = useSearchParams().get("id");
  const [incidenty, setIncidenty] = useState<Incident[] | null>(null);
  const [chyba, setChyba] = useState(false);
  const [poskozeni, setPoskozeni] = useState<Poskozeni[]>([]);
  const [opravujeId, setOpravujeId] = useState<string | null>(null);
  const [opravaZprava, setOpravaZprava] = useState<{ typ: "ok" | "chyba"; text: string } | null>(null);

  const nactiSeznam = useCallback(() => {
    if (!teamId) return;
    apiFetch<{ incidents: Incident[] }>(`/api/teams/${teamId}/incidents`)
      .then((d) => { setIncidenty(d.incidents); setChyba(false); })
      .catch((e) => { console.error("incidents fetch:", e); setChyba(true); });
  }, [teamId]);

  useEffect(() => { nactiSeznam(); }, [nactiSeznam]);

  useEffect(() => {
    if (!teamId) return;
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

  if (vybrane && teamId) {
    return (
      <div className="page-container space-y-4">
        <Link href="/incidenty" className="inline-block text-sm font-heading font-bold text-pitch-600 hover:text-pitch-500">
          ← Všechny incidenty
        </Link>
        <DetailIncidentu key={vybrane} teamId={teamId} incidentId={vybrane} onZmena={nactiSeznam} />
      </div>
    );
  }

  if (chyba) {
    return <div className="page-container"><div className="card p-4 text-sm text-muted">Incidenty se nepodařilo načíst.</div></div>;
  }
  if (!incidenty) return NACITANI;

  const zive = incidenty.filter((i) => i.status !== "uzavreny");
  const uzavrene = incidenty.filter((i) => i.status === "uzavreny");

  return (
    <div className="page-container space-y-5">
      <div className="card p-4 sm:p-5">
        <SectionLabel>Incidenty v klubu</SectionLabel>
        <p className="text-sm text-muted">
          Krádeže, rozbité vybavení a další průšvihy. Ukradené vybavení v klubu opravdu chybí
          a rozbité zařízení nefunguje, dokud ho neopravíš. Otevři incident a zjisti, kdo za tím stojí:
          stopy, obvinění, policie. Proti zlodějům zvenku pomáhá zabezpečení areálu ve vybavení.
          Občas přijde i dobrá zpráva: řemeslník opraví škodu zdarma, dorazí dar nebo se v kádru
          najde hrdina. Ty žádné rozhodnutí nečekají, jen si je přečti.
        </p>
      </div>
      {poskozeni.length > 0 && (
        <ListCard title="Rozbité zařízení" count={poskozeni.length}>
          <p className="px-4 pt-3 text-meta text-muted">Dokud rozbité zařízení neopravíš, nefunguje.</p>
          {opravaZprava && (
            <p className={`px-4 pt-1 text-meta ${opravaZprava.typ === "ok" ? "text-pitch-600" : "text-card-red"}`}>
              {opravaZprava.text}
            </p>
          )}
          {poskozeni.map((p) => (
            <ListRow key={p.id} tone="danger"
              leading={<RowIcon>🔧</RowIcon>}
              title={p.label}
              meta={`Oprava ${formatKc(p.cost)} · o ${p.levels} ${p.levels === 1 ? "úroveň" : "úrovně"}`}
              trailing={
                <button onClick={() => opravit(p)} disabled={opravujeId === p.id}
                  className="px-3 py-2 rounded-control text-sm font-bold bg-pitch-500 text-white hover:bg-pitch-600 disabled:opacity-50">
                  Opravit
                </button>
              } />
          ))}
        </ListCard>
      )}
      <IncidentList title="Řeší se" incidents={zive} empty="Teď je v klubu klid." />
      {uzavrene.length > 0 && <IncidentList title="Uzavřené za poslední měsíc" incidents={uzavrene} />}
    </div>
  );
}

function IncidentList({ title, incidents, empty }: { title: string; incidents: Incident[]; empty?: string }) {
  return (
    <ListCard title={title}>
      {incidents.length === 0
        ? <ListEmpty icon="🕊️">{empty}</ListEmpty>
        : incidents.map((i) => <IncidentRow key={i.id} incident={i} />)}
    </ListCard>
  );
}

/**
 * Řádek incidentu. Celý řádek není odkaz: uvnitř jsou odkazy na hráče. Štítek stavu
 * je u názvu, ne vpravo, aby popis pod ním měl na telefonu celou šířku.
 */
function IncidentRow({ incident: i }: { incident: Incident }) {
  const outcome = i.status === "uzavreny" && i.resolution ? VYSLEDEK_LABEL[i.resolution] : undefined;
  const positive = i.category === "pozitivni";
  const pill = stavPilulka(i);
  const href = `/incidenty?id=${encodeURIComponent(i.id)}`;
  const playerLink = "font-heading font-bold text-ink underline decoration-pitch-500/20 hover:text-pitch-500";
  return (
    <ListRow
      leading={<RowIcon>{i.emoji}</RowIcon>}
      title={<>
        <Link href={href} className="hover:text-pitch-500">{i.label}</Link>
        <span className={`ml-2 align-middle inline-block px-2 py-0.5 rounded-full text-micro font-bold whitespace-nowrap ${pill.trida}`}>{pill.label}</span>
      </>}
      meta={<>
        {datum(i.gameDate)}
        {i.status === "otevreny" && i.deadline && ` · uzavře se ${datum(i.deadline)}`}
        {i.status === "hrozi" && i.deadline && ` · rozhodne se ${datum(i.deadline)}`}
        {i.status === "probiha" && i.endsOn && ` · potrvá do ${datum(i.endsOn)}`}
        {outcome && ` · ${outcome}`}
      </>}
      detail={
        <span className="block space-y-1.5 mt-1">
          <span className="block text-ink">{i.text}</span>
          {i.ztraty.length > 0 && (
            <span className="block space-y-0.5">
              {i.ztraty.map((z, n) => (
                <span key={n} className={`block ${positive ? "text-pitch-600" : "text-card-red"}`}>{z}</span>
              ))}
            </span>
          )}
          {i.pachatel?.jmeno && (
            <span className="block">
              Pachatel:{" "}
              {i.pachatel.playerId ? (
                <Link href={`/hrac/${i.pachatel.playerId}`} className={playerLink}>{i.pachatel.jmeno}</Link>
              ) : (
                <span className="font-heading font-bold text-ink">{i.pachatel.jmeno}</span>
              )}
            </span>
          )}
          {i.ohlasil?.jmeno && (
            <span className="block">
              Ohlásil to:{" "}
              <Link href={`/hrac/${i.ohlasil.playerId}`} className={playerLink}>{i.ohlasil.jmeno}</Link>
            </span>
          )}
          {i.dotceny?.jmeno && (
            <span className="block">
              Týká se:{" "}
              <Link href={`/hrac/${i.dotceny.playerId}`} className={playerLink}>{i.dotceny.jmeno}</Link>
            </span>
          )}
          <span className="block pt-0.5">
            <Link href={href} className="font-heading font-bold text-pitch-600 hover:text-pitch-500">
              {i.status === "otevreny" ? "Vyšetřovat a rozhodnout →" : i.status === "hrozi" ? "Promluvit si →" : "Otevřít →"}
            </Link>
          </span>
        </span>
      } />
  );
}
