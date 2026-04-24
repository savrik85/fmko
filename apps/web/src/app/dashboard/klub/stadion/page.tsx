"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTeam } from "@/context/team-context";
import { apiFetch } from "@/lib/api";
import { Spinner, Card, CardHeader, CardBody, SectionLabel } from "@/components/ui";

interface ClubStadium {
  stadium: {
    name: string | null;
    capacity: number | null;
    pitchType: string | null;
    nickname: string | null;
    builtYear: number | null;
    specialita: string | null;
    tribunaNorth: string | null;
    tribunaSouth: string | null;
  };
}

export default function StadionPage() {
  const { teamId } = useTeam();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [capacity, setCapacity] = useState<number | null>(null);

  const [name, setName] = useState("");
  const [nickname, setNickname] = useState("");
  const [builtYear, setBuiltYear] = useState<string>("");
  const [specialita, setSpecialita] = useState("");
  const [tribunaNorth, setTribunaNorth] = useState("");
  const [tribunaSouth, setTribunaSouth] = useState("");

  useEffect(() => {
    if (!teamId) return;
    apiFetch<ClubStadium>(`/api/teams/${teamId}/club`).then((data) => {
      setName(data.stadium.name ?? "");
      setNickname(data.stadium.nickname ?? "");
      setBuiltYear(data.stadium.builtYear != null ? String(data.stadium.builtYear) : "");
      setSpecialita(data.stadium.specialita ?? "");
      setTribunaNorth(data.stadium.tribunaNorth ?? "");
      setTribunaSouth(data.stadium.tribunaSouth ?? "");
      setCapacity(data.stadium.capacity);
      setLoading(false);
    }).catch((e) => { console.error("load stadion:", e); setLoading(false); });
  }, [teamId]);

  async function handleSave() {
    if (!teamId || saving) return;
    setSaving(true);
    try {
      const yearNum = builtYear.trim() ? parseInt(builtYear, 10) : null;
      await apiFetch(`/api/teams/${teamId}/club/stadium`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          stadiumName: name.trim() || null,
          nickname: nickname.trim() || null,
          builtYear: yearNum,
          specialita: specialita.trim() || null,
          tribunaNorth: tribunaNorth.trim() || null,
          tribunaSouth: tribunaSouth.trim() || null,
        }),
      });
      setSavedAt(Date.now());
      setTimeout(() => setSavedAt(null), 3000);
    } catch (e) {
      console.error("save stadion:", e);
      alert((e as Error).message || "Uložení selhalo");
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

      <Card className="mb-4">
        <CardHeader>
          <h2 className="font-heading font-bold text-base text-ink flex items-center gap-2">
            <span>{"\u{1F3DF}️"}</span> Základní údaje
          </h2>
        </CardHeader>
        <CardBody className="flex flex-col gap-4">
          <div>
            <SectionLabel>Název stadionu</SectionLabel>
            <input type="text" value={name} onChange={(e) => setName(e.target.value.slice(0, 60))}
              placeholder="např. Sportovní areál Bohdalec"
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:border-pitch-500 focus:outline-none" />
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
