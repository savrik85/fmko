"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useTeam } from "@/context/team-context";
import { apiFetch } from "@/lib/api";
import { Card, CardBody, SectionLabel, Spinner } from "@/components/ui";
import { DistrictMap, clubBadgeSvg, villageSizeLabel, type MapVillage } from "@/components/map/DistrictMap";

interface MapResponse {
  district: string;
  districts: string[];
  villages: MapVillage[];
}

function Badge({ club, size }: { club: MapVillage["clubs"][number]; size: number }) {
  return <span className="inline-block shrink-0" style={{ width: size, height: size }} dangerouslySetInnerHTML={{ __html: clubBadgeSvg(club, size) }} />;
}

/** Záložka „Obce okresu“ na stránce Obec: mapa, kde jsou kluby, kolik tu bylo akcí; detail obce na /obec/[id]. */
export function DistrictVillages() {
  const { district: ownDistrict, villageName } = useTeam();
  const [district, setDistrict] = useState<string | null>(null);
  const [data, setData] = useState<MapResponse | null>(null);
  const [error, setError] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (!district && ownDistrict) setDistrict(ownDistrict);
  }, [ownDistrict, district]);

  useEffect(() => {
    if (!district) return;
    setData(null);
    setSelectedId(null);
    apiFetch<MapResponse>(`/api/villages/district/${encodeURIComponent(district)}/map`)
      .then(setData)
      .catch((e) => { console.error("Načtení obcí okresu se nezdařilo:", e); setError(true); });
  }, [district]);

  const villages = data?.villages ?? [];
  const selected = villages.find((v) => v.id === selectedId) ?? null;
  const withClubs = useMemo(() => villages.filter((v) => v.clubs.length > 0), [villages]);
  const others = useMemo(() => {
    const q = search.trim().toLowerCase();
    return villages.filter((v) => v.clubs.length === 0 && (!q || v.name.toLowerCase().includes(q)));
  }, [villages, search]);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-heading font-bold text-xl">Obce okresu {district ?? ""}</h2>
        {data && data.districts.length > 1 && (
          <select
            value={district ?? ""}
            onChange={(e) => setDistrict(e.target.value)}
            aria-label="Okres"
            className="min-h-9 px-3 rounded-control border border-gray-200 bg-white text-sm font-heading"
          >
            {data.districts.map((d) => <option key={d} value={d}>{d}</option>)}
          </select>
        )}
      </div>

      {error && <Card><CardBody><p className="text-card-red text-center">Obce se nepodařilo načíst.</p></CardBody></Card>}
      {!data && !error && <div className="flex justify-center py-16"><Spinner /></div>}

      {data && (
        <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
          <DistrictMap
            villages={villages}
            selectedId={selectedId}
            homeVillageName={district === ownDistrict ? villageName : null}
            onSelect={setSelectedId}
            className="h-[340px] sm:h-[460px] shadow-[var(--shadow-card)]"
          />
          <Card>
            <CardBody>
              {selected ? (
                <div className="space-y-3">
                  <div>
                    <div className="font-heading font-bold text-lg leading-tight">{selected.name}</div>
                    <div className="text-sm text-muted">
                      {villageSizeLabel(selected.size)} · {selected.population.toLocaleString("cs-CZ")} obyvatel
                      {selected.events > 0 && ` · ${selected.events} ${selected.events === 1 ? "akce" : selected.events < 5 ? "akce" : "akcí"}`}
                    </div>
                  </div>
                  {selected.clubs.length > 0 ? (
                    <ul className="space-y-2">
                      {selected.clubs.map((c) => (
                        <li key={c.id}>
                          <Link href={`/tym/${c.id}`} className="flex items-center gap-2.5 hover:text-pitch-600">
                            <Badge club={c} size={32} />
                            <span className="min-w-0">
                              <span className="block font-heading font-bold text-sm leading-tight">{c.name}</span>
                              <span className="block text-xs text-muted">{c.leagueName ?? "bez soutěže"}</span>
                            </span>
                          </Link>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-sm text-muted">V obci nehraje žádný klub.</p>
                  )}
                  <Link href={`/obec/${selected.id}`} className="btn-primary inline-flex items-center justify-center w-full min-h-10 text-sm">
                    Profil obce
                  </Link>
                </div>
              ) : (
                <p className="text-sm text-muted">Klikni na obec na mapě. Obce s klubem mají jeho znak.</p>
              )}
            </CardBody>
          </Card>
        </div>
      )}

      {withClubs.length > 0 && (
        <div>
          <SectionLabel>Obce s klubem ({withClubs.length})</SectionLabel>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {withClubs.map((v) => (
              <Link key={v.id} href={`/obec/${v.id}`} className="card p-3 flex items-center gap-3 hover:shadow-md transition-shadow">
                <div className="flex -space-x-1">
                  {v.clubs.slice(0, 3).map((c) => <Badge key={c.id} club={c} size={30} />)}
                </div>
                <div className="min-w-0">
                  <div className="font-heading font-bold text-sm leading-tight">{v.name}</div>
                  <div className="text-xs text-muted truncate">{v.clubs.map((c) => c.name).join(", ")}</div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}

      {data && villages.length > withClubs.length && (
        <div>
          <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
            <SectionLabel>Ostatní obce</SectionLabel>
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Hledat obec"
              className="min-h-9 px-3 rounded-control border border-gray-200 bg-white text-sm w-full sm:w-56"
            />
          </div>
          <div className="flex flex-wrap gap-1.5">
            {others.map((v) => (
              <Link key={v.id} href={`/obec/${v.id}`} className="px-2.5 py-1 rounded-full bg-surface text-sm text-ink hover:bg-pitch-50">
                {v.name}
              </Link>
            ))}
            {others.length === 0 && <span className="text-sm text-muted">Nic nenalezeno.</span>}
          </div>
        </div>
      )}
    </div>
  );
}
