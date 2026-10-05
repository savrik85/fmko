"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useTeam } from "@/context/team-context";
import { apiFetch } from "@/lib/api";
import { Spinner, Card, CardHeader, CardBody, BadgePreview, JerseyPreview } from "@/components/ui";
import type { BadgePattern } from "@/components/ui";
import {
  CLUB_WEBSITE_TEMPLATES,
  CLUB_WEBSITE_ADDONS,
  type ClubWebsiteData,
  type ClubWebsiteTemplate,
  type ClubWebsiteAddon,
} from "@okresni-masina/shared";

interface ClubIdentityData {
  id: string;
  name: string;
  primaryColor: string;
  secondaryColor: string;
  badgePattern: BadgePattern | null;
  jerseyPattern: string | null;
  village: { name: string; district: string; region: string; population: number };
  identity: {
    nickname: string | null;
    motto: string | null;
    foundingYear: number | null;
    foundingStory: string | null;
    colorsMeaning: string | null;
  };
  stadium: {
    name: string | null;
    capacity: number | null;
    pitchCondition: number | null;
    pitchType: string | null;
    nickname: string | null;
    builtYear: number | null;
    specialita: string | null;
    tribunaNorth: string | null;
    tribunaSouth: string | null;
  };
  jersey: {
    pattern: string | null;
    homePrimary: string;
    homeSecondary: string;
    awayPrimary: string | null;
    awaySecondary: string | null;
    awayPattern: string | null;
    sponsor: string | null;
  };
  badge: {
    pattern: BadgePattern | null;
    primary: string;
    secondary: string;
    customInitials: string | null;
    symbol: string | null;
  };
  anthem: {
    url: string | null;
    lyrics: string | null;
    title: string | null;
    style: string | null;
    attemptsUsed: number;
    attemptsMax: number;
    generating: boolean;
  };
  mascot: { name: string | null; imageUrl: string | null; story: string | null };
}

function SectionCard({
  title,
  icon,
  hint,
  children,
}: {
  title: string;
  icon: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <Card className="flex flex-col">
      <CardHeader className="flex items-center gap-3">
        <span className="text-2xl leading-none" aria-hidden>
          {icon}
        </span>
        <div className="flex-1 min-w-0">
          <h2 className="font-heading font-bold text-base text-ink leading-tight">{title}</h2>
          {hint && <div className="text-xs text-muted mt-0.5">{hint}</div>}
        </div>
      </CardHeader>
      <CardBody className="flex-1 flex flex-col">{children}</CardBody>
    </Card>
  );
}

function ActionTile({
  children,
  action,
  href,
}: {
  children: React.ReactNode;
  action: string;
  href?: string;
}) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center text-center py-4">
      <div className="text-xs text-muted mb-3 max-w-[260px]">{children}</div>
      {href ? (
        <Link
          href={href}
          className="px-4 py-2 rounded-soft text-xs font-heading font-bold text-white bg-pitch-500 hover:bg-pitch-600 transition-colors"
        >
          {action}
        </Link>
      ) : (
        <button
          type="button"
          disabled
          className="px-4 py-2 rounded-soft text-xs font-heading font-bold text-gray-400 bg-gray-100 cursor-not-allowed"
        >
          {action}
        </button>
      )}
    </div>
  );
}

export default function MujKlubPage() {
  const { teamId, budget, refreshTeam } = useTeam();
  const [activeTab, setActiveTab] = useState<"web" | "sablony" | "identita">("web");
  const [websiteData, setWebsiteData] = useState<ClubWebsiteData | null>(null);
  const [clubData, setClubData] = useState<ClubIdentityData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Editable fields in settings
  const [slugInput, setSlugInput] = useState("");
  const [announcementInput, setAnnouncementInput] = useState("");
  const [sponsorBannerChecked, setSponsorBannerChecked] = useState(false);

  const loadData = async () => {
    if (!teamId) return;
    try {
      const [webRes, clubRes] = await Promise.all([
        apiFetch<ClubWebsiteData>(`/api/teams/${teamId}/website`),
        apiFetch<ClubIdentityData>(`/api/teams/${teamId}/club`),
      ]);
      setWebsiteData(webRes);
      setClubData(clubRes);
      if (webRes?.website) {
        setSlugInput(webRes.website.customSlug || "");
        setAnnouncementInput(webRes.website.announcement || "");
        setSponsorBannerChecked(webRes.website.sponsorBannerEnabled || false);
      }
    } catch (e) {
      console.error("load club web data:", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [teamId]);

  const handleCopyLink = () => {
    const slugOrId = websiteData?.website?.customSlug || teamId;
    const url = `${window.location.origin}/klub/${slugOrId}`;
    navigator.clipboard.writeText(url);
    setActionMessage("Odkaz na klubový web byl zkopírován do schránky!");
    setTimeout(() => setActionMessage(null), 3000);
  };

  const handleSelectTemplate = async (templateId: ClubWebsiteTemplate) => {
    if (!teamId) return;
    setSaving(true);
    setErrorMessage(null);
    try {
      await apiFetch(`/api/teams/${teamId}/website/select-template`, {
        method: "POST",
        body: JSON.stringify({ template: templateId }),
      });
      setActionMessage("Šablona byla aktivována!");
      await loadData();
    } catch (err: any) {
      setErrorMessage(err?.message || "Nepodařilo se aktivovat šablonu");
    } finally {
      setSaving(false);
      setTimeout(() => setActionMessage(null), 3000);
    }
  };

  const handleBuyTemplate = async (templateId: ClubWebsiteTemplate) => {
    if (!teamId) return;
    const tpl = CLUB_WEBSITE_TEMPLATES[templateId];
    if (!window.confirm(`Opravdu chceš zakoupit šablonu "${tpl.name}" za ${tpl.price.toLocaleString("cs")} Kč?`)) {
      return;
    }
    setSaving(true);
    setErrorMessage(null);
    try {
      const res: any = await apiFetch(`/api/teams/${teamId}/website/buy-template`, {
        method: "POST",
        body: JSON.stringify({ template: templateId }),
      });
      setActionMessage(res?.message || "Šablona byla zakoupena!");
      window.dispatchEvent(new Event("team-budget-changed"));
      if (refreshTeam) refreshTeam();
      await loadData();
    } catch (err: any) {
      setErrorMessage(err?.message || "Nepodařilo se zakoupit šablonu");
    } finally {
      setSaving(false);
      setTimeout(() => setActionMessage(null), 4000);
    }
  };

  const handleBuyAddon = async (addonId: ClubWebsiteAddon) => {
    if (!teamId) return;
    const add = CLUB_WEBSITE_ADDONS[addonId];
    if (!window.confirm(`Opravdu chceš zakoupit vylepšení "${add.name}" za ${add.price.toLocaleString("cs")} Kč?`)) {
      return;
    }
    setSaving(true);
    setErrorMessage(null);
    try {
      const res: any = await apiFetch(`/api/teams/${teamId}/website/buy-addon`, {
        method: "POST",
        body: JSON.stringify({ addon: addonId }),
      });
      setActionMessage(res?.message || "Vylepšení bylo zakoupeno!");
      window.dispatchEvent(new Event("team-budget-changed"));
      if (refreshTeam) refreshTeam();
      await loadData();
    } catch (err: any) {
      setErrorMessage(err?.message || "Nepodařilo se zakoupit vylepšení");
    } finally {
      setSaving(false);
      setTimeout(() => setActionMessage(null), 4000);
    }
  };

  const handleSaveSettings = async () => {
    if (!teamId) return;
    setSaving(true);
    setErrorMessage(null);
    try {
      await apiFetch(`/api/teams/${teamId}/website`, {
        method: "PATCH",
        body: JSON.stringify({
          customSlug: slugInput.trim() || null,
          announcement: announcementInput.trim() || null,
          sponsorBannerEnabled: sponsorBannerChecked,
        }),
      });
      setActionMessage("Nastavení webu bylo úspěšně uloženo!");
      await loadData();
    } catch (err: any) {
      setErrorMessage(err?.message || "Chyba při ukládání nastavení");
    } finally {
      setSaving(false);
      setTimeout(() => setActionMessage(null), 3000);
    }
  };

  if (loading) {
    return (
      <div className="page-container flex justify-center min-h-[50vh] items-center">
        <Spinner />
      </div>
    );
  }

  const website = websiteData?.website;
  const activeTemplateId = website?.template || "retro_2004";
  const unlockedTemplates = website?.unlockedTemplates || ["retro_2004"];
  const unlockedAddons = website?.unlockedAddons || [];
  const publicSlug = website?.customSlug || teamId;

  return (
    <div className="page-container space-y-6">
      {/* Top Banner & Title */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="font-heading font-extrabold text-2xl text-ink">Klubový web</h1>
            <span className="px-2 py-0.5 rounded-full text-xs font-heading font-bold bg-amber-100 text-amber-800">
              Veřejný portál
            </span>
          </div>
          <p className="text-sm text-muted mt-1">
            Oficiální webová prezentace tvého klubu pro fanoušky, soupeře i neregistrované návštěvníky.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Link
            href={`/klub/${publicSlug}`}
            target="_blank"
            className="px-4 py-2 rounded-soft text-sm font-heading font-bold text-white bg-pitch-500 hover:bg-pitch-600 transition-colors flex items-center gap-1.5 shadow"
          >
            <span>🌐</span>
            <span>Otevřít web</span>
          </Link>
          <button
            type="button"
            onClick={handleCopyLink}
            className="px-3 py-2 rounded-soft text-sm font-heading font-bold text-ink bg-gray-100 hover:bg-gray-200 transition-colors border border-gray-200"
            title="Kopírovat veřejný odkaz"
          >
            🔗 Sdílet
          </button>
        </div>
      </div>

      {/* Notifications */}
      {actionMessage && (
        <div className="p-4 rounded-soft bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm font-heading font-bold animate-in fade-in flex items-center gap-2">
          <span>✅</span>
          <span>{actionMessage}</span>
        </div>
      )}
      {errorMessage && (
        <div className="p-4 rounded-soft bg-red-50 border border-red-200 text-red-800 text-sm font-heading font-bold animate-in fade-in flex items-center gap-2">
          <span>⚠️</span>
          <span>{errorMessage}</span>
        </div>
      )}

      {/* Tabs navigation */}
      <div className="flex border-b border-gray-200 gap-2 font-heading font-bold text-sm">
        <button
          type="button"
          onClick={() => setActiveTab("web")}
          className={`pb-3 px-4 transition-colors border-b-2 flex items-center gap-2 ${
            activeTab === "web"
              ? "border-pitch-500 text-pitch-600"
              : "border-transparent text-muted hover:text-ink"
          }`}
        >
          <span>🖥️</span>
          <span>Náhled & Nastavení</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("sablony")}
          className={`pb-3 px-4 transition-colors border-b-2 flex items-center gap-2 ${
            activeTab === "sablony"
              ? "border-pitch-500 text-pitch-600"
              : "border-transparent text-muted hover:text-ink"
          }`}
        >
          <span>🎨</span>
          <span>Šablony & Vylepšení</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("identita")}
          className={`pb-3 px-4 transition-colors border-b-2 flex items-center gap-2 ${
            activeTab === "identita"
              ? "border-pitch-500 text-pitch-600"
              : "border-transparent text-muted hover:text-ink"
          }`}
        >
          <span>🏛️</span>
          <span>Klubová data & Vzhled</span>
        </button>
      </div>

      {/* ═══ TAB 1: NÁHLED & NASTAVENÍ ═══ */}
      {activeTab === "web" && (
        <div className="space-y-6">
          {/* Status & Stats Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Card className="p-4">
              <div className="text-xs uppercase font-heading font-bold text-muted">Aktivní šablona</div>
              <div className="text-xl font-heading font-extrabold text-ink mt-1">
                {CLUB_WEBSITE_TEMPLATES[activeTemplateId]?.name || "Okresní přebor 2004"}
              </div>
              <div className="text-xs text-muted mt-0.5">
                Tier {CLUB_WEBSITE_TEMPLATES[activeTemplateId]?.tier ?? 0}
              </div>
            </Card>

            <Card className="p-4">
              <div className="text-xs uppercase font-heading font-bold text-muted">Návštěvnost webu</div>
              <div className="text-xl font-heading font-extrabold text-pitch-600 mt-1 tabular-nums">
                {website?.visitorCount || 1} zobrazení
              </div>
              <div className="text-xs text-muted mt-0.5">Počítadlo zobrazení stránek</div>
            </Card>

            <Card className="p-4">
              <div className="text-xs uppercase font-heading font-bold text-muted">Veřejná adresa</div>
              <div className="text-sm font-heading font-extrabold text-ink mt-1 truncate">
                prales.cz/klub/{publicSlug}
              </div>
              <div className="text-xs text-muted mt-0.5">
                {website?.customSlug ? "Vlastní URL aktivní" : "Základní systémová adresa"}
              </div>
            </Card>
          </div>

          {/* Quick Customization Form */}
          <Card className="p-6">
            <CardHeader className="px-0 pt-0">
              <h2 className="font-heading font-bold text-lg text-ink">Rychlé nastavení prezentace</h2>
              <p className="text-xs text-muted mt-0.5">
                Zde můžeš nastavit vlastní webovou adresu, oficiální prohlášení a reklamní lištu.
              </p>
            </CardHeader>

            <CardBody className="px-0 pb-0 space-y-5">
              {/* Custom Slug */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label htmlFor="slug-input" className="text-xs font-heading font-bold text-ink uppercase">
                    Vlastní adresa webu (Slug)
                  </label>
                  {!unlockedAddons.includes("custom_slug") && (
                    <span className="text-xs text-amber-600 font-heading font-bold">
                      Vyžaduje doplněk Vlastní URL adresa (10 000 Kč)
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted font-mono bg-gray-100 px-3 py-2 rounded-soft border border-gray-200">
                    prales.cz/klub/
                  </span>
                  <input
                    id="slug-input"
                    type="text"
                    value={slugInput}
                    onChange={(e) => setSlugInput(e.target.value)}
                    disabled={!unlockedAddons.includes("custom_slug")}
                    placeholder="např. fk-kozlovice"
                    className="flex-1 px-3 py-2 text-sm rounded-soft border border-gray-200 focus:outline-none focus:ring-2 focus:ring-pitch-500 disabled:bg-gray-50 disabled:text-gray-400 font-mono"
                  />
                </div>
              </div>

              {/* Announcement */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label htmlFor="announcement-input" className="text-xs font-heading font-bold text-ink uppercase">
                    Oficiální prohlášení vedení klubu
                  </label>
                  {!unlockedAddons.includes("press_officer") && (
                    <span className="text-xs text-amber-600 font-heading font-bold">
                      Vyžaduje modul Tiskový mluvčí (12 000 Kč)
                    </span>
                  )}
                </div>
                <textarea
                  id="announcement-input"
                  rows={3}
                  value={announcementInput}
                  onChange={(e) => setAnnouncementInput(e.target.value)}
                  disabled={!unlockedAddons.includes("press_officer")}
                  placeholder="Zde můžeš napsat aktuální zprávu pro fanoušky a novináře, která bude zvýrazněna na úvodní stránce..."
                  className="w-full px-3 py-2 text-sm rounded-soft border border-gray-200 focus:outline-none focus:ring-2 focus:ring-pitch-500 disabled:bg-gray-50 disabled:text-gray-400"
                />
              </div>

              {/* Sponsor Banner Toggle */}
              <div className="flex items-center justify-between p-4 rounded-soft bg-gray-50 border border-gray-200">
                <div>
                  <div className="text-xs font-heading font-bold text-ink uppercase">
                    Sponzorská reklamní lišta
                  </div>
                  <div className="text-xs text-muted mt-0.5">
                    Zobrazí na webu banner partnerů klubu a zvyšuje prestiž.
                  </div>
                </div>
                {unlockedAddons.includes("sponsor_banner") ? (
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={sponsorBannerChecked}
                      onChange={(e) => setSponsorBannerChecked(e.target.checked)}
                      className="sr-only peer"
                    />
                    <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-pitch-500"></div>
                  </label>
                ) : (
                  <span className="text-xs text-amber-600 font-heading font-bold">
                    Vyžaduje modul Sponzorská lišta (16 000 Kč)
                  </span>
                )}
              </div>

              {/* Save Button */}
              <div className="flex justify-end pt-2">
                <button
                  type="button"
                  onClick={handleSaveSettings}
                  disabled={saving}
                  className="px-6 py-2 rounded-soft text-sm font-heading font-bold text-white bg-pitch-500 hover:bg-pitch-600 disabled:opacity-50 transition-colors shadow"
                >
                  {saving ? "Ukládám..." : "Uložit nastavení"}
                </button>
              </div>
            </CardBody>
          </Card>
        </div>
      )}

      {/* ═══ TAB 2: ŠABLONY & VYLEPŠENÍ ═══ */}
      {activeTab === "sablony" && (
        <div className="space-y-8">
          {/* Templates Section */}
          <div>
            <div className="mb-4">
              <h2 className="font-heading font-extrabold text-xl text-ink">Designové šablony webu</h2>
              <p className="text-xs text-muted mt-0.5">
                Vyber si vzhled svého klubového webu od retro okresního stylu až po supermoderní portál.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {(Object.keys(CLUB_WEBSITE_TEMPLATES) as ClubWebsiteTemplate[]).map((tplId) => {
                const tpl = CLUB_WEBSITE_TEMPLATES[tplId];
                const isOwned = unlockedTemplates.includes(tplId);
                const isActive = activeTemplateId === tplId;
                const canAfford = (budget ?? 0) >= tpl.price;

                return (
                  <Card
                    key={tplId}
                    className={`flex flex-col justify-between p-5 border-2 transition-all ${
                      isActive
                        ? "border-pitch-500 ring-2 ring-pitch-500/20 shadow-md bg-pitch-50/20"
                        : "border-gray-200 hover:border-gray-300"
                    }`}
                  >
                    <div>
                      <div className="flex items-center justify-between gap-2 mb-2">
                        <span className="text-xs font-heading font-bold uppercase tracking-wider text-muted">
                          Tier {tpl.tier}
                        </span>
                        {isActive && (
                          <span className="px-2 py-0.5 rounded-full text-xs font-heading font-bold bg-pitch-500 text-white">
                            Aktivní
                          </span>
                        )}
                        {isOwned && !isActive && (
                          <span className="px-2 py-0.5 rounded-full text-xs font-heading font-bold bg-gray-200 text-gray-700">
                            Zakoupeno
                          </span>
                        )}
                      </div>

                      <h3 className="font-heading font-extrabold text-lg text-ink">{tpl.name}</h3>
                      <p className="text-xs text-muted mt-1 leading-relaxed">{tpl.description}</p>
                    </div>

                    <div className="mt-6 pt-4 border-t border-gray-100 flex items-center justify-between">
                      <div className="text-sm font-heading font-extrabold text-ink">
                        {tpl.price === 0 ? "Zdarma" : `${tpl.price.toLocaleString("cs")} Kč`}
                      </div>

                      {isActive ? (
                        <button
                          type="button"
                          disabled
                          className="px-4 py-1.5 rounded-soft text-xs font-heading font-bold text-gray-400 bg-gray-100 cursor-default"
                        >
                          Vybráno
                        </button>
                      ) : isOwned ? (
                        <button
                          type="button"
                          onClick={() => handleSelectTemplate(tplId)}
                          disabled={saving}
                          className="px-4 py-1.5 rounded-soft text-xs font-heading font-bold text-pitch-700 bg-pitch-100 hover:bg-pitch-200 transition-colors"
                        >
                          Aktivovat
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => handleBuyTemplate(tplId)}
                          disabled={saving || !canAfford}
                          className={`px-4 py-1.5 rounded-soft text-xs font-heading font-bold text-white transition-colors ${
                            canAfford ? "bg-pitch-500 hover:bg-pitch-600 shadow" : "bg-gray-300 cursor-not-allowed"
                          }`}
                        >
                          Koupit šablonu
                        </button>
                      )}
                    </div>
                  </Card>
                );
              })}
            </div>
          </div>

          {/* Addons Section */}
          <div>
            <div className="mb-4">
              <h2 className="font-heading font-extrabold text-xl text-ink">Doplňky a moduly webu</h2>
              <p className="text-xs text-muted mt-0.5">
                Rozšiř možnosti své klubové prezentace o unikátní funkce.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {(Object.keys(CLUB_WEBSITE_ADDONS) as ClubWebsiteAddon[]).map((addonId) => {
                const add = CLUB_WEBSITE_ADDONS[addonId];
                const isOwned = unlockedAddons.includes(addonId);
                const canAfford = (budget ?? 0) >= add.price;

                return (
                  <Card key={addonId} className="p-5 flex flex-col justify-between border border-gray-200">
                    <div>
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <h3 className="font-heading font-bold text-base text-ink">{add.name}</h3>
                        {isOwned ? (
                          <span className="px-2 py-0.5 rounded-full text-xs font-heading font-bold bg-emerald-100 text-emerald-800">
                            Aktivní
                          </span>
                        ) : (
                          <span className="text-xs font-heading font-bold text-muted">
                            {add.price.toLocaleString("cs")} Kč
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-muted mt-1 leading-relaxed">{add.description}</p>
                    </div>

                    <div className="mt-4 pt-3 border-t border-gray-100 flex justify-end">
                      {isOwned ? (
                        <span className="text-xs text-muted font-heading font-bold">Zakoupeno</span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => handleBuyAddon(addonId)}
                          disabled={saving || !canAfford}
                          className={`px-4 py-1.5 rounded-soft text-xs font-heading font-bold text-white transition-colors ${
                            canAfford ? "bg-pitch-500 hover:bg-pitch-600 shadow" : "bg-gray-300 cursor-not-allowed"
                          }`}
                        >
                          Koupit doplněk
                        </button>
                      )}
                    </div>
                  </Card>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ═══ TAB 3: KLUBOVÁ DATA & VZHLED (PŮVODNÍ DLAŽDICE IDENTITA, STADION ATD.) ═══ */}
      {activeTab === "identita" && clubData && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <SectionCard title="Identita" icon="🏷️" hint="Motto, přezdívka, založení, příběh">
              <div className="text-sm text-ink/80 mb-3 space-y-1">
                {clubData.identity.nickname && <div className="font-bold">📢 {clubData.identity.nickname}</div>}
                {clubData.identity.motto && <div className="italic text-muted">&ldquo;{clubData.identity.motto}&rdquo;</div>}
                {clubData.identity.foundingYear && (
                  <div className="text-xs text-muted">Založeno {clubData.identity.foundingYear}</div>
                )}
                {clubData.identity.foundingStory && (
                  <div className="text-xs text-ink/70 mt-2 line-clamp-3">{clubData.identity.foundingStory}</div>
                )}
                {clubData.identity.colorsMeaning && (
                  <div className="text-xs text-ink/70 mt-1">🎨 {clubData.identity.colorsMeaning}</div>
                )}
              </div>
              <ActionTile action={clubData.identity.nickname || clubData.identity.motto ? "Upravit identitu" : "Vyplnit identitu"} href="/muj-klub/identita">
                Klubové motto, přezdívky fanoušků, rok založení a příběh jak klub vznikl.
              </ActionTile>
            </SectionCard>

            <SectionCard title="Stadion" icon="🏟️" hint="Kapacita, přezdívka, tribuny">
              <div className="text-sm text-ink/80 mb-3 space-y-1">
                <div className="font-bold">
                  {clubData.stadium.name || "Bez názvu"}
                  {clubData.stadium.nickname && <span className="text-muted font-normal"> — &ldquo;{clubData.stadium.nickname}&rdquo;</span>}
                </div>
                <div className="text-muted text-xs flex flex-wrap gap-x-3">
                  {clubData.stadium.capacity != null && <span>Kapacita: <span className="tabular-nums text-ink/70">{clubData.stadium.capacity.toLocaleString("cs")}</span></span>}
                  {clubData.stadium.builtYear != null && <span>Postaveno: <span className="text-ink/70">{clubData.stadium.builtYear}</span></span>}
                </div>
                {(clubData.stadium.tribunaNorth || clubData.stadium.tribunaSouth) && (
                  <div className="text-muted text-xs">
                    Tribuny: <span className="text-ink/70">{[clubData.stadium.tribunaNorth, clubData.stadium.tribunaSouth].filter(Boolean).join(" · ")}</span>
                  </div>
                )}
                {clubData.stadium.specialita && (
                  <div className="text-muted text-xs">U nás: <span className="text-ink/70">{clubData.stadium.specialita}</span></div>
                )}
              </div>
              <ActionTile action={clubData.stadium.name ? "Upravit stadion" : "Doplnit stadion"} href="/muj-klub/stadion">
                Přezdívka stadionu, rok výstavby, názvy tribun a vesnická specialita.
              </ActionTile>
            </SectionCard>

            <SectionCard title="Dres a znak" icon="👕" hint="Domácí, hostující, vzor a barvy">
              <div className="flex items-center justify-center gap-5 mb-3">
                <BadgePreview
                  primary={clubData.badge.primary}
                  secondary={clubData.badge.secondary || "#FFFFFF"}
                  pattern={clubData.badge.pattern ?? "shield"}
                  initials={clubData.badge.customInitials || clubData.name.slice(0, 3).toUpperCase()}
                  symbol={clubData.badge.symbol}
                  size={72}
                />
                <div className="flex flex-col items-center gap-1">
                  <JerseyPreview
                    primary={clubData.jersey.homePrimary}
                    secondary={clubData.jersey.homeSecondary || "#FFFFFF"}
                    pattern={clubData.jersey.pattern || "solid"}
                    size={64}
                  />
                  <span className="text-micro font-heading font-bold text-muted uppercase tracking-wider">Domácí</span>
                </div>
                {clubData.jersey.awayPrimary && (
                  <div className="flex flex-col items-center gap-1">
                    <JerseyPreview
                      primary={clubData.jersey.awayPrimary}
                      secondary={clubData.jersey.awaySecondary || "#FFFFFF"}
                      pattern={clubData.jersey.awayPattern || "solid"}
                      size={64}
                    />
                    <span className="text-micro font-heading font-bold text-muted uppercase tracking-wider">Hostující</span>
                  </div>
                )}
              </div>
              {clubData.jersey.sponsor && (
                <div className="text-center text-xs text-muted mb-2">Sponzor: <span className="font-bold text-ink">{clubData.jersey.sponsor}</span></div>
              )}
              <ActionTile action="Upravit dres" href="/muj-klub/dres">
                Vlastní vzor dresu (pruhy, šachovnice, gradient), hostující barvy a partner.
              </ActionTile>
            </SectionCard>

            <SectionCard title="Hymna a maskot" icon="🎵" hint="AI hymna a maskot klubu">
              <div className="text-sm text-muted mb-3">
                <div className="flex items-center gap-3 mb-2">
                  {clubData.mascot.imageUrl && (
                    <img src={clubData.mascot.imageUrl} alt={clubData.mascot.name || "Maskot"} className="w-16 h-16 rounded-soft object-cover border border-gray-200" />
                  )}
                  <div className="flex-1 min-w-0">
                    <div>Maskot: {clubData.mascot.name ? <span className="text-ink font-bold">{clubData.mascot.name}</span> : <span className="text-ink/70">neurčený</span>}</div>
                    <div>Hymna: {clubData.anthem.url ? <span className="text-ink font-bold">{clubData.anthem.title || "Hotová"}</span> : <span className="text-ink/70">žádná</span>}</div>
                  </div>
                </div>
                {clubData.anthem.url && (
                  <audio controls src={clubData.anthem.url} className="w-full mt-2" />
                )}
              </div>
              <div className="flex gap-2">
                <Link href="/muj-klub/hymna" className="flex-1 px-3 py-2 rounded-soft text-xs font-heading font-bold text-center text-white bg-pitch-500 hover:bg-pitch-600 transition-colors">
                  🎵 Hymna
                </Link>
                <Link href="/muj-klub/maskot" className="flex-1 px-3 py-2 rounded-soft text-xs font-heading font-bold text-center text-white bg-pitch-500 hover:bg-pitch-600 transition-colors">
                  🧸 Maskot
                </Link>
              </div>
            </SectionCard>

            <SectionCard title="Ceník občerstvení" icon="🍺" hint="Ceny piva a klobásy v bufetu">
              <div className="text-xs text-muted mb-3">
                Nastavení nabídky a prodejních cen občerstvení u klandru. Ceny se automaticky promítají do klubového webu.
              </div>
              <ActionTile action="Přejít do bufetu" href="/fanousci?tab=concession">
                Správa zásob, kvality piva a klobás.
              </ActionTile>
            </SectionCard>

            <SectionCard title="Vstupné na stadion" icon="🎟️" hint="Základní vstupné fanoušků">
              <div className="text-xs text-muted mb-3">
                Cena lístku pro domácí zápasy ovlivňuje návštěvnost i výnosy z pokladny.
              </div>
              <ActionTile action="Správa vstupného" href="/fanousci">
                Nastavení výše vstupného a vztahů s fanoušky.
              </ActionTile>
            </SectionCard>

            <SectionCard title="Přestupy a posily" icon="🔄" hint="Příchody, odchody a jednání">
              <div className="text-xs text-muted mb-3">
                Sleduj přestupový trh, vyjednávej příchody posil a prodávej hráče. Všechny uskutečněné transfery se automaticky zobrazí na klubovém webu jako novinářské představovačky a rozlučky.
              </div>
              <ActionTile action="Přejít na přestupy" href="/prestupy">
                Přestupový trh a jednání s hráči.
              </ActionTile>
            </SectionCard>
          </div>
        </div>
      )}
    </div>
  );
}
