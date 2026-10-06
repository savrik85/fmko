"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTeam } from "@/context/team-context";
import { apiFetch, showError } from "@/lib/api";
import { Spinner, Card, CardHeader, CardBody, SectionLabel, StickyActions } from "@/components/ui";
import { withClubPrefix, type ClubPrefix } from "@okresni-masina/shared";

interface ClubIdentity {
  identity: {
    nickname: string | null;
    motto: string | null;
    foundingYear: number | null;
    foundingStory: string | null;
    colorsMeaning: string | null;
  };
}

interface PrefixInfo {
  name: string;
  prefix: ClubPrefix | null;
  options: ClubPrefix[];
  canChange: boolean;
}

function AiButton({ onClick, loading, label = "Vygenerovat přes AI" }: { onClick: () => void; loading: boolean; label?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={loading}
      className="text-xs font-heading font-bold text-pitch-600 hover:text-pitch-700 px-3 py-1.5 rounded-soft border border-pitch-200 hover:bg-pitch-50 transition-colors disabled:opacity-50"
    >
      {loading ? "Generuji..." : `\u{2728} ${label}`}
    </button>
  );
}

export default function IdentitaPage() {
  const { teamId, setTeam } = useTeam();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  const [nickname, setNickname] = useState("");
  const [motto, setMotto] = useState("");
  const [foundingYear, setFoundingYear] = useState("");
  const [foundingStory, setFoundingStory] = useState("");
  const [colorsMeaning, setColorsMeaning] = useState("");

  const [genLoading, setGenLoading] = useState<"motto" | "story" | "colors" | null>(null);

  // Zkratka v názvu (FK, SK, AC…): jen ze seznamu, jednou za sezónu.
  const [prefixInfo, setPrefixInfo] = useState<PrefixInfo | null>(null);
  const [prefix, setPrefix] = useState<ClubPrefix | null>(null);

  useEffect(() => {
    if (!teamId) return;
    apiFetch<ClubIdentity>(`/api/teams/${teamId}/club`).then((data) => {
      setNickname(data.identity.nickname ?? "");
      setMotto(data.identity.motto ?? "");
      setFoundingYear(data.identity.foundingYear != null ? String(data.identity.foundingYear) : "");
      setFoundingStory(data.identity.foundingStory ?? "");
      setColorsMeaning(data.identity.colorsMeaning ?? "");
      setLoading(false);
    }).catch((e) => { console.error("load identity:", e); setLoading(false); });
    apiFetch<PrefixInfo>(`/api/teams/${teamId}/club/prefix`).then((data) => {
      setPrefixInfo(data);
      setPrefix(data.prefix);
    }).catch((e) => console.error("load club prefix:", e));
  }, [teamId]);

  async function handleGenerate(kind: "motto" | "story" | "colors") {
    if (!teamId || genLoading) return;
    setGenLoading(kind);
    try {
      const res = await apiFetch<{ text: string }>(`/api/teams/${teamId}/club/identity/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind }),
      });
      if (kind === "motto") setMotto(res.text.slice(0, 120));
      else if (kind === "story") setFoundingStory(res.text.slice(0, 2000));
      else if (kind === "colors") setColorsMeaning(res.text.slice(0, 500));
    } catch (e) {
      console.error("generate identity:", e);
      showError("Generace selhala", (e as Error).message || "Zkus to prosím znovu.");
    } finally {
      setGenLoading(null);
    }
  }

  async function handleSave() {
    if (!teamId || saving) return;
    setSaving(true);
    try {
      if (prefixInfo && prefix && prefix !== prefixInfo.prefix) {
        const res = await apiFetch<{ name: string }>(`/api/teams/${teamId}/club/prefix`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ prefix }),
        });
        setPrefixInfo({ ...prefixInfo, name: res.name, prefix, canChange: false });
        setTeam(teamId, res.name);
      }
      const yearNum = foundingYear.trim() ? parseInt(foundingYear, 10) : null;
      await apiFetch(`/api/teams/${teamId}/club/identity`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nickname: nickname.trim() || null,
          motto: motto.trim() || null,
          foundingYear: yearNum,
          foundingStory: foundingStory.trim() || null,
          colorsMeaning: colorsMeaning.trim() || null,
        }),
      });
      setSavedAt(Date.now());
      setTimeout(() => setSavedAt(null), 3000);
    } catch (e) {
      console.error("save identity:", e);
      showError("Uložení selhalo", (e as Error).message || "Zkus to prosím znovu.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div className="page-container flex justify-center min-h-[50vh] items-center"><Spinner /></div>;

  return (
    <div className="page-container">
      <div className="mb-5">
        <Link href="/muj-klub" className="text-sm text-muted hover:text-ink">← Zpět na Klubový web</Link>
        <h1 className="font-heading font-extrabold text-2xl text-ink mt-1">Identita klubu</h1>
        <p className="text-sm text-muted mt-0.5">Zkratka v názvu, přezdívka, motto, rok založení, příběh a význam barev. AI generace je zdarma a neomezená.</p>
      </div>

      {prefixInfo && (
        <Card className="mb-4">
          <CardHeader>
            <h2 className="font-heading font-bold text-base text-ink flex items-center gap-2">
              <span>{"\u{1F6E1}️"}</span> Zkratka v názvu klubu
            </h2>
          </CardHeader>
          <CardBody className="flex flex-col gap-3">
            <div className="flex flex-wrap gap-2">
              {prefixInfo.options.map((p) => {
                const active = prefix === p;
                return (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setPrefix(p)}
                    disabled={!prefixInfo.canChange}
                    aria-pressed={active}
                    className={`min-w-[3.5rem] px-3 py-2 rounded-soft border text-sm font-heading font-bold transition-colors disabled:opacity-60 ${
                      active ? "border-pitch-500 bg-pitch-500 text-white" : "border-gray-200 text-ink hover:border-pitch-300"
                    }`}
                  >
                    {p}
                  </button>
                );
              })}
            </div>
            <div className="text-sm">
              <span className="text-muted">Název klubu: </span>
              <span className="font-heading font-bold text-base text-ink">
                {prefix ? withClubPrefix(prefixInfo.name, prefix) : prefixInfo.name}
              </span>
            </div>
            <div className="text-sm text-muted">
              {prefixInfo.canChange
                ? "Mění se jen zkratka, sponzor a obec v názvu zůstávají. Změnit ji jde zdarma, jednou za sezónu."
                : "Zkratku už klub v téhle sezóně měnil. Další změna půjde v příští sezóně."}
            </div>
          </CardBody>
        </Card>
      )}

      <Card className="mb-4">
        <CardHeader>
          <h2 className="font-heading font-bold text-base text-ink flex items-center gap-2">
            <span>{"\u{1F3F7}️"}</span> Přezdívka a rok založení
          </h2>
        </CardHeader>
        <CardBody className="flex flex-col gap-4">
          <div>
            <SectionLabel>Přezdívka klubu</SectionLabel>
            <input type="text" value={nickname} onChange={(e) => setNickname(e.target.value.slice(0, 40))}
              placeholder="např. Medvědi, Zelené pruhy, Šumavské psy"
              className="w-full px-3 py-2 border border-gray-200 rounded-soft text-sm focus:border-pitch-500 focus:outline-none" />
            <div className="text-xs text-muted mt-1">Jak týmu říkají fanoušci.</div>
          </div>
          <div>
            <SectionLabel>Rok založení klubu</SectionLabel>
            <input type="number" value={foundingYear} onChange={(e) => setFoundingYear(e.target.value.slice(0, 4))}
              placeholder="1923" min={1800} max={2100}
              className="w-full sm:max-w-[160px] px-3 py-2 border border-gray-200 rounded-soft text-sm focus:border-pitch-500 focus:outline-none" />
          </div>
        </CardBody>
      </Card>

      <Card className="mb-4">
        <CardHeader>
          <div className="flex items-center justify-between gap-3">
            <h2 className="font-heading font-bold text-base text-ink flex items-center gap-2">
              <span>{"\u{1F4AC}"}</span> Klubové motto
            </h2>
            <AiButton onClick={() => handleGenerate("motto")} loading={genLoading === "motto"} />
          </div>
        </CardHeader>
        <CardBody>
          <input type="text" value={motto} onChange={(e) => setMotto(e.target.value.slice(0, 120))}
            placeholder='např. "Síla z lesa", "Nikdy se nevzdáme"'
            className="w-full px-3 py-2 border border-gray-200 rounded-soft text-sm focus:border-pitch-500 focus:outline-none" />
          <div className="text-xs text-muted mt-1">{motto.length}/120 znaků</div>
        </CardBody>
      </Card>

      <Card className="mb-4">
        <CardHeader>
          <div className="flex items-center justify-between gap-3">
            <h2 className="font-heading font-bold text-base text-ink flex items-center gap-2">
              <span>{"\u{1F4D6}"}</span> Příběh založení
            </h2>
            <AiButton onClick={() => handleGenerate("story")} loading={genLoading === "story"} />
          </div>
        </CardHeader>
        <CardBody>
          <textarea value={foundingStory} onChange={(e) => setFoundingStory(e.target.value.slice(0, 2000))}
            placeholder="Jak klub vznikl. Kdo ho založil, kde, za jakých okolností..."
            rows={6}
            className="w-full px-3 py-2 border border-gray-200 rounded-soft text-sm focus:border-pitch-500 focus:outline-none resize-vertical" />
          <div className="text-xs text-muted mt-1">{foundingStory.length}/2000 znaků</div>
        </CardBody>
      </Card>

      <Card className="mb-4">
        <CardHeader>
          <div className="flex items-center justify-between gap-3">
            <h2 className="font-heading font-bold text-base text-ink flex items-center gap-2">
              <span>{"\u{1F3A8}"}</span> Význam barev
            </h2>
            <AiButton onClick={() => handleGenerate("colors")} loading={genLoading === "colors"} />
          </div>
        </CardHeader>
        <CardBody>
          <textarea value={colorsMeaning} onChange={(e) => setColorsMeaning(e.target.value.slice(0, 500))}
            placeholder="Co klubové barvy symbolizují..."
            rows={3}
            className="w-full px-3 py-2 border border-gray-200 rounded-soft text-sm focus:border-pitch-500 focus:outline-none resize-vertical" />
          <div className="text-xs text-muted mt-1">{colorsMeaning.length}/500 znaků</div>
        </CardBody>
      </Card>

      <StickyActions>
        {savedAt && <span className="text-sm text-pitch-600 font-bold">{"\u{2705}"} Uloženo</span>}
        <button type="button" onClick={() => router.push("/muj-klub")}
          className="px-4 py-2 rounded-soft text-sm font-heading font-bold text-muted hover:text-ink">Zrušit</button>
        <button type="button" onClick={handleSave} disabled={saving}
          className="px-6 py-2 rounded-soft text-sm font-heading font-bold text-white bg-pitch-500 hover:bg-pitch-600 disabled:opacity-50 transition-colors">
          {saving ? "Ukládám..." : "Uložit"}
        </button>
      </StickyActions>
    </div>
  );
}
