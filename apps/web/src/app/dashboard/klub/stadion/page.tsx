"use client";

import { useState, useEffect } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTeam } from "@/context/team-context";
import { apiFetch, showError } from "@/lib/api";
import { Spinner, Card, CardHeader, CardBody, SectionLabel } from "@/components/ui";

const Stadium3D = dynamic(
  () => import("@/components/stadium/stadium-3d/Stadium3D").then((m) => m.Stadium3D),
  {
    ssr: false,
    loading: () => (
      <div className="h-full flex items-center justify-center text-white/60 text-sm bg-[#1a2030]">
        <Spinner />
      </div>
    ),
  }
);

interface StadiumFullData {
  stadiumName: string | null;
  capacity: number;
  pitchCondition: number;
  pitchType: string;
  facilities: Record<string, number>;
  customization: {
    fenceColor: string | null;
    standColor: string | null;
    seatColor: string | null;
    roofColor: string | null;
    accentColor: string | null;
    scoreboardLevel: number;
    flagSize: number;
  };
}

interface ClubStadium {
  name: string;
  primaryColor: string;
  secondaryColor: string;
  badge: { pattern: string | null; customInitials: string | null };
  stadium: {
    name: string | null;
    capacity: number | null;
    pitchType: string | null;
    nickname: string | null;
    builtYear: number | null;
    specialita: string | null;
    tribunaNorth: string | null;
    tribunaSouth: string | null;
    namingSponsor: string | null;
  };
}

export default function StadionPage() {
  const { teamId } = useTeam();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [capacity, setCapacity] = useState<number | null>(null);
  const [namingSponsor, setNamingSponsor] = useState<string | null>(null);
  const [stadiumFull, setStadiumFull] = useState<StadiumFullData | null>(null);
  const [teamClub, setTeamClub] = useState<{ primary: string; secondary: string; pattern: string; initials: string } | null>(null);
  const [activeSponsors, setActiveSponsors] = useState<string[]>([]);

  const [name, setName] = useState("");
  const [nickname, setNickname] = useState("");
  const [builtYear, setBuiltYear] = useState<string>("");
  const [specialita, setSpecialita] = useState("");
  const [tribunaNorth, setTribunaNorth] = useState("");
  const [tribunaSouth, setTribunaSouth] = useState("");

  useEffect(() => {
    if (!teamId) return;
    Promise.all([
      apiFetch<ClubStadium>(`/api/teams/${teamId}/club`),
      apiFetch<StadiumFullData>(`/api/teams/${teamId}/stadium`).catch((e) => { console.error("stadium full:", e); return null; }),
      apiFetch<{ active: Array<{ sponsor_name: string }> }>(`/api/game/teams/${teamId}/sponsors`).catch((e) => { console.error("sponsors:", e); return null; }),
    ]).then(([club, full, sponsors]) => {
      setName(club.stadium.name ?? "");
      setNickname(club.stadium.nickname ?? "");
      setBuiltYear(club.stadium.builtYear != null ? String(club.stadium.builtYear) : "");
      setSpecialita(club.stadium.specialita ?? "");
      setTribunaNorth(club.stadium.tribunaNorth ?? "");
      setTribunaSouth(club.stadium.tribunaSouth ?? "");
      setCapacity(club.stadium.capacity);
      setNamingSponsor(club.stadium.namingSponsor);
      setStadiumFull(full);
      setTeamClub({
        primary: club.primaryColor,
        secondary: club.secondaryColor,
        pattern: club.badge.pattern ?? "shield",
        initials: club.badge.customInitials || club.name.split(" ").map((w) => w[0]).filter(Boolean).slice(0, 3).join("").toUpperCase(),
      });
      if (sponsors?.active) {
        setActiveSponsors(sponsors.active.map((s) => s.sponsor_name).filter(Boolean));
      }
      setLoading(false);
    }).catch((e) => { console.error("load stadion:", e); setLoading(false); });
  }, [teamId]);

  async function handleSave() {
    if (!teamId || saving) return;
    setSaving(true);
    try {
      const yearNum = builtYear.trim() ? parseInt(builtYear, 10) : null;
      const payload: Record<string, unknown> = {
        nickname: nickname.trim() || null,
        builtYear: yearNum,
        specialita: specialita.trim() || null,
        tribunaNorth: tribunaNorth.trim() || null,
        tribunaSouth: tribunaSouth.trim() || null,
      };
      // Název posíláme jen pokud nemáme naming rights sponzora
      if (!namingSponsor) payload.stadiumName = name.trim() || null;
      await apiFetch(`/api/teams/${teamId}/club/stadium`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      setSavedAt(Date.now());
      setTimeout(() => setSavedAt(null), 3000);
    } catch (e) {
      console.error("save stadion:", e);
      showError("Uložení selhalo", (e as Error).message || "Zkus to prosím znovu.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div className="page-container flex justify-center min-h-[50vh] items-center"><Spinner /></div>;

  return (
    <div className="page-container">
      <div className="mb-5">
        <Link href="/dashboard/klub" className="text-sm text-muted hover:text-ink">← Zpět na Klub</Link>
        <h1 className="font-heading font-extrabold text-2xl text-ink mt-1">Stadion</h1>
        <p className="text-sm text-muted mt-0.5">Název, přezdívka, tribuny a vesnická specialita stadionu.</p>
      </div>

      {stadiumFull && teamClub && (
        <Card variant="dark" className="mb-4 overflow-hidden">
          <div className="h-[320px] sm:h-[400px] relative">
            <Stadium3D
              pitchCondition={stadiumFull.pitchCondition}
              pitchType={stadiumFull.pitchType}
              facilities={stadiumFull.facilities}
              teamColor={teamClub.primary}
              secondaryColor={teamClub.secondary}
              badgePattern={teamClub.pattern}
              badgeInitials={teamClub.initials}
              stadiumName={name}
              sponsors={activeSponsors}
              customization={stadiumFull.customization}
            />
            <div className="absolute bottom-3 left-3 text-white/60 text-xs font-heading bg-black/50 px-2 py-1 rounded backdrop-blur-sm">
              Táhni myší pro rotaci · Scroll pro zoom
            </div>
          </div>
        </Card>
      )}

      <Card className="mb-4">
        <CardHeader>
          <h2 className="font-heading font-bold text-base text-ink flex items-center gap-2">
            <span>{"\u{1F3DF}️"}</span> Základní údaje
          </h2>
        </CardHeader>
        <CardBody className="flex flex-col gap-4">
          <div>
            <SectionLabel>Název stadionu</SectionLabel>
            {namingSponsor ? (
              <>
                <div className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-gray-50 text-ink">{name || "—"}</div>
                <div className="text-xs text-amber-700 mt-1">
                  Název určuje sponzor <strong>{namingSponsor}</strong> (naming rights). Změníš ho po ukončení smlouvy v sekci Sponzoři.
                </div>
              </>
            ) : (
              <input type="text" value={name} onChange={(e) => setName(e.target.value.slice(0, 60))}
                placeholder="např. Sportovní areál Bohdalec"
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:border-pitch-500 focus:outline-none" />
            )}
          </div>
          <div>
            <SectionLabel>Přezdívka (volitelné)</SectionLabel>
            <input type="text" value={nickname} onChange={(e) => setNickname(e.target.value.slice(0, 40))}
              placeholder="např. Kotel, Pekelné hřiště, U Lípy"
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:border-pitch-500 focus:outline-none" />
            <div className="text-xs text-muted mt-1">Jak říkají stadionu domácí fanoušci.</div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <SectionLabel>Rok výstavby</SectionLabel>
              <input type="number" value={builtYear} onChange={(e) => setBuiltYear(e.target.value.slice(0, 4))}
                placeholder="1923" min={1800} max={2100}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:border-pitch-500 focus:outline-none" />
            </div>
            <div>
              <SectionLabel>Kapacita</SectionLabel>
              <div className="px-3 py-2 border border-gray-200 rounded-lg text-sm bg-gray-50 text-muted tabular-nums">
                {capacity != null ? capacity.toLocaleString("cs") : "–"}
              </div>
              <div className="text-xs text-muted mt-1">Upravuje se v sekci Stadion (rozšíření tribun).</div>
            </div>
          </div>
        </CardBody>
      </Card>

      <Card className="mb-4">
        <CardHeader>
          <h2 className="font-heading font-bold text-base text-ink flex items-center gap-2">
            <span>{"\u{1FA91}"}</span> Tribuny
          </h2>
        </CardHeader>
        <CardBody className="flex flex-col gap-4">
          <div>
            <SectionLabel>Severní tribuna</SectionLabel>
            <input type="text" value={tribunaNorth} onChange={(e) => setTribunaNorth(e.target.value.slice(0, 40))}
              placeholder="např. Medvědí tribuna"
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:border-pitch-500 focus:outline-none" />
          </div>
          <div>
            <SectionLabel>Jižní tribuna</SectionLabel>
            <input type="text" value={tribunaSouth} onChange={(e) => setTribunaSouth(e.target.value.slice(0, 40))}
              placeholder="např. U Pekaře"
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:border-pitch-500 focus:outline-none" />
          </div>
        </CardBody>
      </Card>

      <Card className="mb-4">
        <CardHeader>
          <h2 className="font-heading font-bold text-base text-ink flex items-center gap-2">
            <span>{"\u{1F37A}"}</span> Vesnická specialita
          </h2>
        </CardHeader>
        <CardBody>
          <SectionLabel>Co se u nás peče, pije, grilujeme</SectionLabel>
          <input type="text" value={specialita} onChange={(e) => setSpecialita(e.target.value.slice(0, 80))}
            placeholder="např. smažák a pivo Kozel, klobása od řezníka Vepřáka"
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:border-pitch-500 focus:outline-none" />
          <div className="text-xs text-muted mt-1">Co návštěvník zápasu ochutná v bufetu nebo za tribunou.</div>
        </CardBody>
      </Card>

      <div className="mt-6 sticky bottom-0 bg-canvas/95 backdrop-blur-sm border-t border-gray-200 -mx-3 sm:-mx-8 px-3 sm:px-8 py-3 flex items-center justify-end gap-3">
        {savedAt && <span className="text-sm text-pitch-600 font-bold">{"\u{2705}"} Uloženo</span>}
        <button type="button" onClick={() => router.push("/dashboard/klub")}
          className="px-4 py-2 rounded-lg text-sm font-heading font-bold text-muted hover:text-ink">Zrušit</button>
        <button type="button" onClick={handleSave} disabled={saving}
          className="px-6 py-2 rounded-lg text-sm font-heading font-bold text-white bg-pitch-500 hover:bg-pitch-600 disabled:opacity-50 transition-colors">
          {saving ? "Ukládám..." : "Uložit"}
        </button>
      </div>
    </div>
  );
}
