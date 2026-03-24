"use client";

import { useState, useEffect } from "react";
import { useTeam } from "@/context/team-context";
import { apiFetch, type Team } from "@/lib/api";
import { Card, CardBody, Spinner, SectionLabel, useConfirm } from "@/components/ui";

interface ActiveContract {
  id: string;
  category: "main" | "stadium";
  sponsorName: string;
  sponsorType: string;
  monthlyAmount: number;
  winBonus: number;
  seasonsTotal: number;
  seasonsRemaining: number;
  earlyTerminationFee: number;
  isNamingRights: boolean;
  signedAt: string;
}

interface SponsorOffer {
  sponsorName: string;
  sponsorType: string;
  monthlyAmount: number;
  winBonus: number;
  seasons: number;
  earlyTerminationFee: number;
  requirement?: string;
}

interface SponsorsData {
  mainContract: ActiveContract | null;
  stadiumContract: ActiveContract | null;
  stadiumName: string | null;
  teamName: string;
  mainOffers: SponsorOffer[];
  stadiumOffers: SponsorOffer[];
  canChangeMainSponsor: boolean;
  season: number;
}

function formatCZK(v: number): string { return v.toLocaleString("cs") + " Kč"; }

export default function SponsorsPage() {
  const { teamId, setTeam: setTeamCtx } = useTeam();
  const [data, setData] = useState<SponsorsData | null>(null);
  const [team, setTeam] = useState<Team | null>(null);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState(false);
  const [renameInput, setRenameInput] = useState("");
  const [showRename, setShowRename] = useState(false);
  const { confirm, dialog: confirmDialog } = useConfirm();

  const refresh = async () => {
    if (!teamId) return;
    const [s, t] = await Promise.all([
      apiFetch<SponsorsData>(`/api/teams/${teamId}/sponsors`),
      apiFetch<Team>(`/api/teams/${teamId}`),
    ]);
    setData(s); setTeam(t);
  };

  useEffect(() => {
    refresh().then(() => setLoading(false)).catch(() => setLoading(false));
  }, [teamId]);

  const handleSign = async (offer: SponsorOffer, category: "main" | "stadium") => {
    if (!teamId || acting) return;
    const isMain = category === "main";
    const details = [
      { label: "Měsíční příjem", value: `+${formatCZK(offer.monthlyAmount)}`, color: "text-pitch-500" },
      ...(offer.winBonus > 0 ? [{ label: "Bonus za výhru", value: `+${formatCZK(offer.winBonus)}`, color: "text-pitch-400" }] : []),
      { label: "Sankce za zrušení", value: `-${formatCZK(offer.earlyTerminationFee)}`, color: "text-card-red" },
    ];
    if (isMain) {
      details.push({ label: "Změna názvu", value: "Ano (název se změní)", color: "text-gold-600" });
      details.push({ label: "Dopad na reputaci", value: "-3 reputace", color: "text-card-red" });
    }
    const ok = await confirm({
      title: `Podepsat smlouvu — ${offer.sponsorName}?`,
      description: isMain
        ? `Název týmu se změní na sponzorský. Změna hlavního sponzora je možná max 1x za sezónu.`
        : `Smlouva na sponzora stadionu na ${offer.seasons} ${offer.seasons === 1 ? "sezónu" : "sezóny"}`,
      details,
      confirmLabel: "Podepsat",
    });
    if (!ok) return;
    setActing(true);
    const res = await apiFetch<{ ok: boolean; newTeamName?: string }>(`/api/teams/${teamId}/sponsors/sign`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...offer, category }),
    }).catch(() => null);
    if (res?.newTeamName && teamId) {
      setTeamCtx(teamId, res.newTeamName);
    }
    await refresh();
    setActing(false);
  };

  const handleTerminate = async (category: "main" | "stadium") => {
    if (!teamId || acting) return;
    const contract = category === "main" ? data?.mainContract : data?.stadiumContract;
    if (!contract) return;
    const fee = Math.round(contract.earlyTerminationFee * (contract.seasonsRemaining / 3));
    const isMain = category === "main";

    const details = [
      { label: "Sankce", value: `-${formatCZK(fee)}`, color: "text-card-red" },
    ];
    let description = `Zbývá ${contract.seasonsRemaining} sezón ze smlouvy s ${contract.sponsorName}.`;
    if (isMain) {
      details.push({ label: "Dopad na reputaci", value: "-2 reputace", color: "text-card-red" });
      if (!data?.canChangeMainSponsor) {
        description += " Tuto sezónu už jsi změnil název — novou sponzorskou smlouvu uzavřeš až příští sezónu.";
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
    setActing(true);
    const res = await apiFetch<{ ok: boolean; newTeamName?: string }>(`/api/teams/${teamId}/sponsors/terminate`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ category }),
    }).catch(() => null);
    if (res?.newTeamName && teamId) {
      setTeamCtx(teamId, res.newTeamName);
    }
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
    setActing(true);
    const res = await apiFetch<{ ok: boolean; newName?: string }>(`/api/teams/${teamId}/rename`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: renameInput.trim() }),
    }).catch(() => null);
    if (res?.newName && teamId) {
      setTeamCtx(teamId, res.newName);
    }
    setShowRename(false);
    setRenameInput("");
    await refresh();
    setActing(false);
  };

  if (loading) return <div className="page-container flex items-center justify-center min-h-[50vh]"><Spinner /></div>;
  if (!data || !team) return <div className="page-container">Data nenalezena.</div>;

  const hasMainSponsor = !!data.mainContract;

  return (
    <div className="page-container space-y-5">
      {confirmDialog}

      {/* Team name + rename */}
      <Card>
        <CardBody>
          <div className="flex items-center justify-between">
            <div>
              <div className="text-xs text-muted font-heading uppercase mb-1">Název klubu</div>
              <div className="font-heading font-bold text-xl">{data.teamName}</div>
            </div>
            {!hasMainSponsor && data.canChangeMainSponsor && !showRename && (
              <button onClick={() => setShowRename(true)} className="text-sm text-pitch-500 font-heading font-bold hover:text-pitch-600 transition-colors">
                Přejmenovat
              </button>
            )}
            {!data.canChangeMainSponsor && (
              <span className="text-xs text-muted bg-surface px-2 py-1 rounded-full">Změna 1x/sezónu vyčerpána</span>
            )}
          </div>
          {showRename && (
            <div className="mt-3 pt-3 border-t border-gray-100 flex gap-2">
              <input
                type="text" value={renameInput} onChange={(e) => setRenameInput(e.target.value)}
                placeholder="Nový název klubu..." maxLength={50}
                className="input flex-1"
              />
              <button onClick={handleRename} disabled={acting || !renameInput.trim()}
                className="btn btn-primary btn-sm">Uložit</button>
              <button onClick={() => { setShowRename(false); setRenameInput(""); }}
                className="btn btn-ghost btn-sm">Zrušit</button>
            </div>
          )}
          {showRename && (
            <p className="text-xs text-card-red mt-2">Přejmenování stojí -3 reputace a je možné max 1x za sezónu.</p>
          )}
        </CardBody>
      </Card>

      <p className="text-sm text-muted">
        Nabídky závisí na reputaci tvého klubu ({team.reputation}). Lepší reputace = lepší nabídky.
      </p>

      {/* ── Main sponsor ── */}
      <div>
        <SectionLabel>{"\u{1F4DD}"} Hlavní sponzor</SectionLabel>
        {data.mainContract ? (
          <ContractCard contract={data.mainContract} category="main" onTerminate={() => handleTerminate("main")} acting={acting} />
        ) : !data.canChangeMainSponsor ? (
          <Card>
            <CardBody>
              <p className="text-center text-muted py-4">
                Tuto sezónu již nelze podepsat nového hlavního sponzora (limit 1x za sezónu).
              </p>
            </CardBody>
          </Card>
        ) : (
          <OffersList offers={data.mainOffers} category="main" onSign={handleSign} acting={acting} />
        )}
      </div>

      {/* ── Stadium sponsor ── */}
      <div>
        <SectionLabel>{"\u{1F3DF}"} Sponzor stadionu {data.stadiumName ? `(${data.stadiumName})` : ""}</SectionLabel>
        {data.stadiumContract ? (
          <ContractCard contract={data.stadiumContract} category="stadium" onTerminate={() => handleTerminate("stadium")} acting={acting} />
        ) : (
          <OffersList offers={data.stadiumOffers} category="stadium" onSign={handleSign} acting={acting} />
        )}
      </div>
    </div>
  );
}

// ═══ Components ═══

function ContractCard({ contract, category, onTerminate, acting }: {
  contract: ActiveContract; category: "main" | "stadium"; onTerminate: () => void; acting: boolean;
}) {
  const icon = category === "main" ? "\u{1F4DD}" : "\u{1F3DF}";
  return (
    <Card>
      <CardBody>
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-xl bg-pitch-500/10 flex items-center justify-center text-2xl shrink-0">{icon}</div>
          <div className="flex-1">
            <div className="font-heading font-bold text-lg">{contract.sponsorName}</div>
            <div className="text-sm text-muted">{contract.sponsorType}</div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-3">
              <div>
                <div className="text-pitch-500 font-heading font-bold tabular-nums">+{formatCZK(contract.monthlyAmount)}</div>
                <div className="text-xs text-muted">měsíčně</div>
              </div>
              {contract.winBonus > 0 && (
                <div>
                  <div className="text-pitch-400 font-heading font-bold tabular-nums">+{formatCZK(contract.winBonus)}</div>
                  <div className="text-xs text-muted">za výhru</div>
                </div>
              )}
              <div>
                <div className="font-heading font-bold tabular-nums">{contract.seasonsRemaining}/{contract.seasonsTotal}</div>
                <div className="text-xs text-muted">zbývá sezón</div>
              </div>
              <div>
                <div className="text-card-red font-heading font-bold tabular-nums text-sm">{formatCZK(contract.earlyTerminationFee)}</div>
                <div className="text-xs text-muted">sankce</div>
              </div>
            </div>
          </div>
        </div>
        <div className="mt-4 pt-3 border-t border-gray-100">
          <button onClick={onTerminate} disabled={acting}
            className="text-sm text-card-red hover:text-red-700 font-heading font-bold transition-colors">
            Ukončit smlouvu předčasně
          </button>
        </div>
      </CardBody>
    </Card>
  );
}

function OffersList({ offers, category, onSign, acting }: {
  offers: SponsorOffer[]; category: "main" | "stadium";
  onSign: (offer: SponsorOffer, category: "main" | "stadium") => void; acting: boolean;
}) {
  if (offers.length === 0) {
    return (
      <Card><CardBody><p className="text-center text-muted py-4">Žádné nabídky. Zvyš reputaci pro lepší sponzory.</p></CardBody></Card>
    );
  }
  return (
    <div className="space-y-3">
      {offers.map((offer, i) => (
        <Card key={i}>
          <CardBody>
            <div className="flex items-start gap-4">
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-heading font-bold text-base">{offer.sponsorName}</span>
                  <span className="text-xs text-muted bg-surface px-2 py-0.5 rounded-full">{offer.sponsorType}</span>
                </div>
                <div className="flex flex-wrap gap-x-5 gap-y-1 mt-2 text-sm">
                  <span className="text-pitch-500 font-heading font-bold">+{formatCZK(offer.monthlyAmount)}/měs</span>
                  {offer.winBonus > 0 && <span className="text-pitch-400 font-heading">+{formatCZK(offer.winBonus)} za výhru</span>}
                  <span className="text-muted">{offer.seasons} {offer.seasons === 1 ? "sezóna" : offer.seasons <= 4 ? "sezóny" : "sezón"}</span>
                </div>
                <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1.5 text-xs">
                  <span className="text-card-red">Sankce: {formatCZK(offer.earlyTerminationFee)}</span>
                  {category === "main" && <span className="text-gold-600">Změní název klubu &middot; -3 reputace</span>}
                  {offer.requirement && <span className="text-gold-600">{offer.requirement}</span>}
                </div>
              </div>
              <button onClick={() => onSign(offer, category)} disabled={acting} className="shrink-0 btn btn-primary btn-sm">
                Podepsat
              </button>
            </div>
          </CardBody>
        </Card>
      ))}
    </div>
  );
}
