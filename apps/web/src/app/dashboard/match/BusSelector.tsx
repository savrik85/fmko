"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";

const BUS_TIERS_VESNICE = [
  {
    key: "traktor" as const,
    label: "Vlek za traktorem",
    icon: "🚜",
    cost: 1200,
    range: "8-12 lidí",
    desc: "Strejda Pepa zapřáhne starý vlek za zetor. Pomalý, smrdí naftou, ale levně. Babičky to milují.",
  },
  {
    key: "karosa" as const,
    label: "Stará Karosa",
    icon: "🚌",
    cost: 2000,
    range: "18-25 lidí",
    desc: "Vyřazená z OAD v devadesátých. Drnčí, na kopcích řve, ale doveze pětadvacet lidí v kuse.",
  },
  {
    key: "autokar" as const,
    label: "Pohodlný autokar",
    icon: "🚍",
    cost: 3500,
    range: "30-45 lidí",
    desc: "Klimatizace, čalouněná sedadla, dokonce i WC. Lidi se těší už cestou tam.",
  },
];

const BUS_TIERS_MESTO = [
  {
    key: "traktor" as const,
    label: "Lístky na MHD",
    icon: "🚇",
    cost: 1200,
    range: "8-12 lidí",
    desc: "Rozdáš pár jízdenek na metro a tramvaj. Důchodci a děti dorazí z přilehlé čtvrti.",
  },
  {
    key: "karosa" as const,
    label: "Mikrobus od sponzora",
    icon: "🚐",
    cost: 2000,
    range: "18-25 lidí",
    desc: "Místní firma půjčí dodávku s řidičem. Sváží partu kolegů a jejich známé.",
  },
  {
    key: "autokar" as const,
    label: "Pohodlný autokar",
    icon: "🚍",
    cost: 3500,
    range: "30-45 lidí",
    desc: "Klimatizace, čalouněná sedadla. Hodí se na delší dojezd ze sousední městské části.",
  },
];

type BusSize = (typeof BUS_TIERS_VESNICE)[number]["key"];

interface NearbyVillage {
  id: string;
  name: string;
  population: number;
  distanceKm: number;
}

interface OrderedBus {
  id: string;
  busSize: BusSize;
  cost: number;
  sourceVillageId: string;
  sourceVillageName: string;
  attendeesBrought: number | null;
}

interface SatelliteInfo {
  villageId: string;
  villageName: string;
  consecutiveBuses: number;
  casualCount: number;
}

interface FanbaseResponse {
  satellites: SatelliteInfo[];
  homeVillage?: { isCity?: boolean };
}

export function BusSelector({
  teamId,
  matchId,
}: {
  teamId: string;
  matchId: string;
}) {
  const [villages, setVillages] = useState<NearbyVillage[]>([]);
  const [ordered, setOrdered] = useState<OrderedBus[]>([]);
  const [satellites, setSatellites] = useState<SatelliteInfo[]>([]);
  const [isCityTeam, setIsCityTeam] = useState(false);
  const [selectedVillage, setSelectedVillage] = useState<string>("");
  const [busSize, setBusSize] = useState<BusSize>("karosa");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const reload = () => {
    setLoading(true);
    Promise.all([
      apiFetch<{ villages: NearbyVillage[] }>(
        `/api/teams/${teamId}/villages-nearby`,
      ),
      apiFetch<{ buses: OrderedBus[] }>(
        `/api/teams/${teamId}/match/${matchId}/bus`,
      ),
      apiFetch<FanbaseResponse>(`/api/teams/${teamId}/fanbase`),
    ])
      .then(([vs, bs, fb]) => {
        setVillages(vs.villages);
        setOrdered(bs.buses);
        setSatellites(fb.satellites ?? []);
        setIsCityTeam(!!fb.homeVillage?.isCity);
        if (!selectedVillage && vs.villages.length > 0) {
          setSelectedVillage(vs.villages[0].id);
        }
        setLoading(false);
      })
      .catch((e) => {
        console.error("BusSelector load:", e);
        setLoading(false);
      });
  };

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [teamId, matchId]);

  if (loading) {
    return (
      <div className="card p-3 text-sm text-muted">Načítám okolní obce…</div>
    );
  }

  if (villages.length === 0) {
    return (
      <div className="card p-3 text-sm text-muted">
        🚌 Žádné okolní obce v dosahu (do 10 km). Autobus nelze objednat.
      </div>
    );
  }

  const BUS_TIERS = isCityTeam ? BUS_TIERS_MESTO : BUS_TIERS_VESNICE;
  const selectedTier = BUS_TIERS.find((t) => t.key === busSize)!;
  const selectedSatellite = satellites.find(
    (s) => s.villageId === selectedVillage,
  );
  const orderedSourceIds = new Set(ordered.map((b) => b.sourceVillageId));
  const availableVillages = villages.filter(
    (v) => !orderedSourceIds.has(v.id),
  );

  const submit = async () => {
    if (!selectedVillage) return;
    setSubmitting(true);
    setError(null);
    try {
      await apiFetch(`/api/teams/${teamId}/match/${matchId}/bus`, {
        method: "POST",
        body: JSON.stringify({ sourceVillageId: selectedVillage, busSize }),
      });
      reload();
    } catch (e) {
      const msg =
        e instanceof Error ? e.message : "Objednávka busu se nezdařila";
      setError(msg);
      console.error("BusSelector submit:", e);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="card p-3 space-y-3">
      <div className="flex items-baseline justify-between">
        <div className="font-heading font-bold text-sm">
          🚌 Doprava fanoušků z okolí
        </div>
        <div className="text-[10px] text-muted">
          3 zápasy v řadě = stálí fanoušci
        </div>
      </div>

      {ordered.length > 0 && (
        <div className="space-y-1">
          {ordered.map((b) => {
            const tier = BUS_TIERS.find((t) => t.key === b.busSize);
            return (
              <div
                key={b.id}
                className="flex items-center gap-2 px-2 py-1.5 rounded bg-pitch-500/10 text-sm"
              >
                <span className="text-base">{tier?.icon ?? "🚌"}</span>
                <span className="font-heading font-bold">
                  {tier?.label ?? b.busSize}
                </span>
                <span className="text-muted">z {b.sourceVillageName}</span>
                <span className="ml-auto text-pitch-600 font-heading font-bold">
                  ✓ {b.cost.toLocaleString("cs")} Kč
                </span>
              </div>
            );
          })}
        </div>
      )}

      {availableVillages.length === 0 ? (
        <div className="text-sm text-muted">
          Pro všechny okolní obce už je bus objednán.
        </div>
      ) : (
        <>
          <div>
            <label className="text-[10px] text-muted font-heading uppercase tracking-wide block mb-1">
              Z které obce
            </label>
            <select
              value={selectedVillage}
              onChange={(e) => setSelectedVillage(e.target.value)}
              className="w-full px-2 py-2 rounded border border-gray-300 bg-white text-sm"
            >
              {availableVillages.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name} · {v.distanceKm} km · {v.population.toLocaleString("cs")} obyv.
                </option>
              ))}
            </select>
            {selectedSatellite && (
              <div className="mt-1 text-xs text-muted">
                Streak {selectedSatellite.villageName}:{" "}
                <span className="font-heading font-bold text-pitch-600">
                  {selectedSatellite.consecutiveBuses}/3
                </span>{" "}
                · {selectedSatellite.casualCount} stálých už chodí
              </div>
            )}
          </div>

          <div>
            <label className="text-[10px] text-muted font-heading uppercase tracking-wide block mb-1">
              Velikost dopravního prostředku
            </label>
            <div className="grid grid-cols-3 gap-1.5">
              {BUS_TIERS.map((t) => (
                <button
                  key={t.key}
                  onClick={() => setBusSize(t.key)}
                  className={`px-2 py-2 rounded border-2 text-left transition-all ${
                    busSize === t.key
                      ? "border-pitch-500 bg-pitch-500/10"
                      : "border-gray-200 hover:border-gray-300"
                  }`}
                >
                  <div className="text-xl">{t.icon}</div>
                  <div className="font-heading font-bold text-xs leading-tight">
                    {t.label}
                  </div>
                  <div className="text-[10px] text-muted">{t.range}</div>
                  <div className="text-[10px] text-pitch-600 font-heading font-bold mt-0.5">
                    {t.cost.toLocaleString("cs")} Kč
                  </div>
                </button>
              ))}
            </div>
            <div className="mt-1.5 text-[11px] text-muted italic">
              {selectedTier.desc}
            </div>
          </div>

          {error && (
            <div className="text-xs text-card-red font-heading font-bold">
              ⚠ {error}
            </div>
          )}

          <button
            onClick={submit}
            disabled={submitting || !selectedVillage}
            className="w-full py-2 rounded bg-pitch-500 text-white font-heading font-bold text-sm hover:bg-pitch-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {submitting
              ? "Objednávám…"
              : `Objednat — ${selectedTier.cost.toLocaleString("cs")} Kč`}
          </button>
        </>
      )}
    </div>
  );
}
