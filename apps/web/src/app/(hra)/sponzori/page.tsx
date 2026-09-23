"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useTeam } from "@/context/team-context";
import { apiFetch, type Team } from "@/lib/api";
import { formatCZK } from "@/lib/sponsor-owners";
import { seasonsAccusative, remainingSeasonsText } from "@/lib/sponsor-format";
import type {
  DistrictFirm, PubEncounter, SponsorCategory, SponsorHistoryItem, SponsorOffer, SponsorOverview, SponsorPromiseView, SponsorsData,
} from "@/lib/sponsor-page-types";
import { Card, CardBody, ErrorBox, Spinner, Tabs, useConfirm, useTabParam } from "@/components/ui";
import { ContractsTab } from "@/components/sponsors/contracts-tab";
import { FirmsTab } from "@/components/sponsors/firms-tab";
import { PopularityTab } from "@/components/sponsors/popularity-tab";
import { HistoryTab } from "@/components/sponsors/history-tab";
import { SponsorLink } from "@/components/sponsors/sponsor-link";
import { mySponsorIdsOf } from "@/lib/sponsor-firms";
import { groupPromisesByContract } from "@/lib/sponsor-promises";

const SPONSOR_TABS = ["contracts", "firms", "popularity", "history"] as const;
type SponsorTab = (typeof SPONSOR_TABS)[number];
const TAB_LABELS: Record<SponsorTab, string> = {
  contracts: "Smlouvy",
  firms: "Firmy v okrese",
  popularity: "Oblíbenost",
  history: "Historie",
};
/** Klíč v localStorage: poslední otevřená záložka (jen pohodlí v tomhle prohlížeči). */
const TAB_STORAGE_KEY = "sponzori-tab";

export default function SponsorsPage() {
  const { teamId, isLoading: authLoading, setTeam: setTeamCtx } = useTeam();
  const router = useRouter();
  const [tab, setTab] = useTabParam(SPONSOR_TABS, "tab", TAB_STORAGE_KEY);
  const [data, setData] = useState<SponsorsData | null>(null);
  const [team, setTeam] = useState<Team | null>(null);
  const [firms, setFirms] = useState<{ firms: DistrictFirm[]; pub: PubEncounter | null } | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [acting, setActing] = useState(false);
  const [renameInput, setRenameInput] = useState("");
  const [showRename, setShowRename] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const { confirm, dialog: confirmDialog } = useConfirm();
  const [overview, setOverview] = useState<SponsorOverview | null>(null);
  const [overviewError, setOverviewError] = useState<string | null>(null);
  const [history, setHistory] = useState<SponsorHistoryItem[] | null>(null);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [promises, setPromises] = useState<SponsorPromiseView[]>([]);

  // Poslední aktuální teamId — pozdní odpověď z předchozího týmu se po přepnutí zahodí.
  const teamIdRef = useRef(teamId);
  useEffect(() => { teamIdRef.current = teamId; }, [teamId]);

  // Přehled se načítá až při otevření záložky a po každé akci, která hýbe náklonností (hospoda).
  const loadOverview = async () => {
    if (!teamId) return;
    const requestedTeamId = teamId;
    setOverviewError(null);
    const o = await apiFetch<SponsorOverview>(`/api/teams/${requestedTeamId}/sponsor-overview`)
      .catch((e) => {
        console.error("sponsor-overview:", e);
        if (teamIdRef.current === requestedTeamId) setOverviewError((e as Error).message);
        return null;
      });
    if (teamIdRef.current !== requestedTeamId) return;
    setOverview(o);
  };

  // Historie se načítá až při otevření záložky; výpověď smlouvy se v ní projeví při dalším otevření.
  async function loadHistory() {
    if (!teamId) return;
    const requestedTeamId = teamId;
    setHistoryError(null);
    const h = await apiFetch<{ contracts: SponsorHistoryItem[] }>(`/api/teams/${requestedTeamId}/sponsor-history`)
      .catch((e) => {
        console.error("sponsor-history:", e);
        if (teamIdRef.current === requestedTeamId) setHistoryError((e as Error).message);
        return null;
      });
    if (teamIdRef.current !== requestedTeamId) return;
    setHistory(h?.contracts ?? null);
  }

  // Přepnutí týmu — staré přehledy a historie zmizí, dokud se nenačtou znovu pro nový tým.
  useEffect(() => {
    setOverview(null);
    setOverviewError(null);
    setHistory(null);
    setHistoryError(null);
  }, [teamId]);

  useEffect(() => {
    if (tab === "popularity") void loadOverview();
    if (tab === "history") void loadHistory();
  }, [tab, teamId]);

  const refresh = async () => {
    if (!teamId) return;
    const [s, t] = await Promise.all([
      apiFetch<SponsorsData>(`/api/teams/${teamId}/sponsors`),
      apiFetch<Team>(`/api/teams/${teamId}`),
    ]);
    setData(s); setTeam(t);
    const f = await apiFetch<{ firms: DistrictFirm[]; pub: PubEncounter | null }>(`/api/teams/${teamId}/sponsor-owners`)
      .catch((e) => { console.error("sponsor-owners:", e); return null; });
    setFirms(f);
    const pr = await apiFetch<{ promises: SponsorPromiseView[] }>(`/api/teams/${teamId}/sponsor-promises`)
      .catch((e) => { console.error("sponsor-promises:", e); return null; });
    setPromises(pr?.promises ?? []);
  };

  const handlePub = async (action: "beer" | "ignore") => {
    if (!teamId || !firms?.pub || acting) return;
    setActionError(null);
    setActing(true);
    await apiFetch(`/api/teams/${teamId}/sponsor-owners/pub/${firms.pub.id}`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action }),
    }).catch((e) => { console.error("sponsor pub:", e); setActionError((e as Error).message); return null; });
    await refresh();
    if (tab === "popularity") await loadOverview();
    setActing(false);
  };

  // Dokud se nenačte přihlášení, teamId ještě není. Dřív se v tu chvíli načítání „dokončilo"
  // naprázdno a stránka ukázala „Data nenalezena", než klub vůbec dorazil.
  useEffect(() => {
    if (authLoading) return;
    if (!teamId) { setLoading(false); return; }
    setLoading(true);
    setLoadError(null);
    refresh()
      .catch((e) => { console.error("sponzori refresh:", e); setLoadError((e as Error).message); })
      .finally(() => setLoading(false));
  }, [teamId, authLoading]);

  const handleSign = async (offer: SponsorOffer, category: SponsorCategory) => {
    if (!teamId || acting) return;
    const isMain = category === "main";
    const isBanner = category === "banner";
    const details = [
      { label: "Týdenní příjem", value: `+${formatCZK(Math.round(offer.monthlyAmount / 4.3))}`, color: "text-pitch-500" },
      ...(offer.winBonus > 0 ? [{ label: "Bonus za výhru", value: `+${formatCZK(offer.winBonus)}`, color: "text-pitch-400" }] : []),
      { label: "Výpovědní pokuta", value: `-${formatCZK(offer.earlyTerminationFee)}`, color: "text-card-red" },
    ];
    if (isMain) {
      details.push({ label: "Změna názvu", value: "Ano (název se změní)", color: "text-gold-600" });
      details.push({ label: "Dopad na reputaci", value: "-3 reputace", color: "text-card-red" });
    }
    const description = isMain
      ? `Název týmu se změní na sponzorský. Změna hlavního sponzora je možná max 1x za sezónu.`
      : isBanner
      ? `Reklamní banner kolem hřiště na ${seasonsAccusative(offer.seasons)}`
      : `Smlouva na sponzora stadionu na ${seasonsAccusative(offer.seasons)}`;
    const ok = await confirm({
      title: `Podepsat smlouvu ${offer.sponsorName}?`,
      description,
      details,
      confirmLabel: "Podepsat",
    });
    if (!ok) return;
    setActionError(null);
    setActing(true);
    const res = await apiFetch<{ ok: boolean; newTeamName?: string }>(`/api/teams/${teamId}/sponsors/sign`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...offer, category }),
    }).catch((e) => { console.error("sponsors/sign:", e); setActionError((e as Error).message); return null; });
    if (res?.newTeamName && teamId) {
      setTeamCtx(teamId, res.newTeamName);
    }
    await refresh();
    setActing(false);
  };

  const handleTerminate = async (category: SponsorCategory, contractId?: string) => {
    if (!teamId || acting) return;
    const contract = category === "main"
      ? data?.mainContract
      : category === "stadium"
      ? data?.stadiumContract
      : data?.bannerContracts.find((c) => c.id === contractId);
    if (!contract) return;
    // terminationFee: API ho počítá stejným vzorcem jako POST /sponsors/terminate (prorataTerminationFee).
    const fee = contract.terminationFee;
    const isMain = category === "main";

    const details = [
      { label: "Výpovědní pokuta", value: `-${formatCZK(fee)}`, color: "text-card-red" },
    ];
    const clawback = contract.clawback ?? 0;
    if (clawback > 0) details.push({ label: "Vrácení zálohy", value: `-${formatCZK(clawback)}`, color: "text-card-red" });
    const forfeitPenalty = contract.forfeitPenalty ?? 0;
    if (forfeitPenalty > 0) details.push({ label: "Propadlé sliby", value: `pokuta ${formatCZK(forfeitPenalty)}`, color: "text-card-red" });
    let description = `${remainingSeasonsText(contract.seasonsRemaining)} ze smlouvy s ${contract.sponsorName}.`;
    if (isMain) {
      details.push({ label: "Dopad na reputaci", value: "-2 reputace", color: "text-card-red" });
      if (!data?.canChangeMainSponsor) {
        description += " Tuto sezónu už jsi změnil název, novou sponzorskou smlouvu uzavřeš až příští sezónu.";
      }
    }

    const ok = await confirm({
      title: "Ukončit smlouvu předčasně?",
      description,
      details,
      confirmLabel: "Ukončit smlouvu",
      variant: "danger",
    });
    if (!ok) return;
    setActionError(null);
    setActing(true);
    const res = await apiFetch<{ ok: boolean; newTeamName?: string }>(`/api/teams/${teamId}/sponsors/terminate`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ category, contractId }),
    }).catch((e) => { console.error("sponsors/terminate:", e); setActionError((e as Error).message); return null; });
    if (res?.newTeamName && teamId) {
      setTeamCtx(teamId, res.newTeamName);
    }
    await refresh();
    setActing(false);
  };

  const handleRenew = async (category: SponsorCategory, contractId?: string) => {
    if (!teamId || acting) return;
    const contract = category === "main"
      ? (data?.mainContract ?? data?.mainExpired)
      : category === "stadium"
      ? (data?.stadiumContract ?? data?.stadiumExpired)
      : data?.bannerContracts.find((c) => c.id === contractId);
    // Hlavní sponzor a stadion: prodloužení je jednání s majitelem firmy.
    if (category !== "banner") {
      if (contract?.sponsorId) router.push(`/sponzor/${contract.sponsorId}`);
      return;
    }
    if (!contract?.renewal) return;
    const r = contract.renewal;
    const ok = await confirm({
      title: `Prodloužit smlouvu s firmou ${contract.sponsorName}?`,
      description: `Nová smlouva na ${seasonsAccusative(r.seasons)} za podmínek podle aktuální reputace. Beze změny názvu klubu a bez sankce.`,
      details: [
        { label: "Nově týdně", value: `+${formatCZK(Math.round(r.monthlyAmount / 4.3))}`, color: "text-pitch-500" },
        ...(r.winBonus > 0 ? [{ label: "Za výhru", value: `+${formatCZK(r.winBonus)}`, color: "text-pitch-400" }] : []),
        { label: "Délka", value: seasonsAccusative(r.seasons) },
      ],
      confirmLabel: "Prodloužit smlouvu",
    });
    if (!ok) return;
    setActionError(null);
    setActing(true);
    await apiFetch(`/api/teams/${teamId}/sponsors/renew`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contractId: contract.id }),
    }).catch((e) => { console.error("sponsors/renew:", e); setActionError((e as Error).message); return null; });
    await refresh();
    setActing(false);
  };

  const handleSleeveLogo = async (promiseId: string) => {
    if (!teamId || acting) return;
    const ok = await confirm({
      title: "Dát logo sponzora na rukáv?",
      description: "Logo sponzora stadionu bude na rukávu dresu po celou dobu smlouvy. Slib se tím splní.",
      confirmLabel: "Dát logo na rukáv",
    });
    if (!ok) return;
    setActionError(null);
    setActing(true);
    await apiFetch(`/api/teams/${teamId}/sponsor-promises/${promiseId}/sleeve-logo`, { method: "POST" })
      .catch((e) => { console.error("sponsor-promises/sleeve-logo:", e); setActionError((e as Error).message); return null; });
    await refresh();
    setActing(false);
  };

  const handleRename = async () => {
    if (!teamId || acting || !renameInput.trim()) return;
    const ok = await confirm({
      title: `Přejmenovat na "${renameInput.trim()}"?`,
      description: "Název lze změnit max 1x za sezónu. Fanoušci budou nespokojení.",
      details: [
        { label: "Dopad na reputaci", value: "-3 reputace", color: "text-card-red" },
      ],
      confirmLabel: "Přejmenovat",
    });
    if (!ok) return;
    setActionError(null);
    setActing(true);
    const res = await apiFetch<{ ok: boolean; newName?: string }>(`/api/teams/${teamId}/rename`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: renameInput.trim() }),
    }).catch((e) => { console.error("team/rename:", e); return null; });
    if (res?.newName && teamId) {
      setTeamCtx(teamId, res.newName);
    }
    setShowRename(false);
    setRenameInput("");
    await refresh();
    setActing(false);
  };

  if (authLoading || loading) return <div className="page-container flex items-center justify-center min-h-[50vh]"><Spinner /></div>;
  if (loadError) return <div className="page-container"><ErrorBox message={`Sponzory se nepodařilo načíst: ${loadError}`} /></div>;
  if (!teamId) return <div className="page-container text-base text-muted">Sponzory uvidíš, až budeš mít klub.</div>;
  if (!data || !team) return <div className="page-container flex items-center justify-center min-h-[50vh]"><Spinner /></div>;

  const hasMainSponsor = !!data.mainContract;
  const favors = new Map<number, number>((firms?.firms ?? []).map((f) => [f.sponsorId, f.favor]));
  const promisesByContract = groupPromisesByContract(promises);

  return (
    <div className="page-container space-y-5">
      {confirmDialog}

      {/* Název klubu + přejmenování */}
      <Card>
        <CardBody>
          {/* Na mobilu pod sebou (dlouhý název se jinak lámal po slovech), vedle sebe až od sm:. */}
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
            <div className="min-w-0">
              <div className="text-sm text-muted font-heading uppercase mb-1">Název klubu</div>
              <div className="font-heading font-bold text-xl break-words">{data.teamName}</div>
            </div>
            {!hasMainSponsor && data.canChangeMainSponsor && !showRename && (
              <button onClick={() => setShowRename(true)} className="self-start sm:self-auto shrink-0 min-h-11 text-sm text-pitch-500 font-heading font-bold hover:text-pitch-600 transition-colors">
                Přejmenovat
              </button>
            )}
            {!data.canChangeMainSponsor && (
              <span className="self-start sm:self-auto text-sm text-muted bg-surface px-2 py-1 rounded-full sm:shrink-0">Změna 1× za sezónu vyčerpána</span>
            )}
          </div>
          {showRename && (
            <div className="mt-3 pt-3 border-t border-gray-100 flex flex-wrap gap-2">
              <input
                type="text" value={renameInput} onChange={(e) => setRenameInput(e.target.value)}
                placeholder="Nový název klubu..." maxLength={50}
                className="input basis-full sm:basis-0 sm:flex-1 min-w-0"
              />
              <button onClick={handleRename} disabled={acting || !renameInput.trim()}
                className="btn btn-primary btn-sm min-h-11">Uložit</button>
              <button onClick={() => { setShowRename(false); setRenameInput(""); }}
                className="btn btn-ghost btn-sm min-h-11">Zrušit</button>
            </div>
          )}
          {showRename && (
            <p className="text-sm text-card-red mt-2">Přejmenování stojí -3 reputace a je možné max 1× za sezónu.</p>
          )}
        </CardBody>
      </Card>

      {actionError && (
        <div className="text-sm text-card-red bg-red-50 border border-red-200 rounded-soft px-3 py-2">{actionError}</div>
      )}

      {firms?.pub && (
        <Card>
          <CardBody>
            <div className="text-sm">
              🍺 V hospodě sedí <span className="font-heading font-bold text-base">{firms.pub.ownerName}</span>, majitel{" "}
              <SponsorLink id={firms.pub.sponsorId} name={firms.pub.sponsorName} className="font-heading font-bold text-base" />.
              Pozvat ho na pivo stojí {formatCZK(firms.pub.beerCost)}.
            </div>
            <div className="flex flex-wrap gap-2 mt-3">
              <button onClick={() => handlePub("beer")} disabled={acting} className="btn btn-primary btn-sm min-h-11">Pozvat na pivo</button>
              <button onClick={() => handlePub("ignore")} disabled={acting} className="btn btn-ghost btn-sm min-h-11">Nechat ho být</button>
            </div>
          </CardBody>
        </Card>
      )}

      <Tabs
        value={tab}
        onChange={setTab}
        ariaLabel="Sponzoři"
        layout="grid"
        items={SPONSOR_TABS.map((key) => ({ key, label: TAB_LABELS[key] }))}
      />

      {tab === "contracts" && (
        <ContractsTab
          data={data}
          reputation={team.reputation}
          favors={favors}
          acting={acting}
          onSign={handleSign}
          onTerminate={handleTerminate}
          onRenew={handleRenew}
          promisesByContract={promisesByContract}
          onSleeveLogo={handleSleeveLogo}
        />
      )}
      {tab === "firms" && <FirmsTab firms={firms?.firms ?? null} mySponsorIds={mySponsorIdsOf(data)} stadiumSponsorId={data.stadiumContract?.sponsorId ?? null} />}
      {tab === "popularity" && <PopularityTab overview={overview} error={overviewError} />}
      {tab === "history" && <HistoryTab items={history} error={historyError} mainContract={data.mainContract} />}
    </div>
  );
}
