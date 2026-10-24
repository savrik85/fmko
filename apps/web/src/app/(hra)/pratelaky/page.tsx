"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useTeam } from "@/context/team-context";
import { apiFetch, showError } from "@/lib/api";
import { SectionLabel, Spinner, Tabs, useTabParam, useConfirm } from "@/components/ui";
import { FriendlyForm } from "./FriendlyForm";
import { FriendlyRecord } from "./FriendlyRecord";
import {
  FixtureCard, FriendlyCard, PRIMARY_BUTTON, SECONDARY_BUTTON, StakeTag, StatusPill, TAG, TeamLink,
  dayLabel, formatCZK, sumCosts, venueText,
  type FriendliesData, type FriendlyView, type OfferView,
} from "./friendly-ui";

const TAB_KEYS = ["matches", "challenge", "offers", "record"] as const;

const OFFER_VENUE_TEXT: Record<OfferView["venue"], string> = {
  poster: "u nich",
  taker: "u tebe",
  neutral: "na neutrálu",
};

export default function FriendlyPage() {
  const { teamId } = useTeam();
  const [data, setData] = useState<FriendliesData | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const [showOfferForm, setShowOfferForm] = useState(false);
  const [challengeTarget, setChallengeTarget] = useState<string | null>(null);
  const [tab, setTab] = useTabParam(TAB_KEYS);
  const { confirm, dialog: confirmDialog } = useConfirm({ sheet: true });
  const topRef = useRef<HTMLDivElement>(null);

  const load = useCallback(() => {
    if (!teamId) return;
    apiFetch<FriendliesData>(`/api/teams/${teamId}/challenges`)
      .then(setData)
      .catch((e) => console.error("načtení přáteláků:", e))
      .finally(() => setLoading(false));
  }, [teamId]);

  useEffect(() => { load(); }, [load]);

  const flash = (msg: string) => {
    setNotice(msg);
    setTimeout(() => setNotice(""), 5000);
  };

  const act = async (id: string, path: string, errorTitle: string, success: string) => {
    if (!teamId || busyId) return;
    setBusyId(id);
    try {
      await apiFetch(`/api/teams/${teamId}${path}`, { method: "POST" });
      flash(success);
      load();
    } catch (e) {
      console.error(`${errorTitle}:`, e);
      showError(errorTitle, (e as Error)?.message || "Zkus to znovu.");
    } finally {
      setBusyId(null);
    }
  };

  const accept = async (f: FriendlyView) => {
    const details = [
      { label: "Kdy", value: f.date ? `${dayLabel(f.date)} v 18:00` : "nejbližší volný den" },
      { label: "Kde", value: venueText(f.venue, f.neutralVillage) },
      ...(f.stake > 0 ? [{ label: "Sázka", value: `${formatCZK(f.stake)} složíš hned` }] : []),
      { label: "Tvoje náklady", value: sumCosts(f.myCosts) > 0 ? formatCZK(sumCosts(f.myCosts)) : "nic" },
    ];
    const ok = await confirm({ title: `Přátelák s ${f.opponent.name}?`, details, confirmLabel: "Přijmout" });
    if (ok) await act(f.id, `/challenge/${f.id}/accept`, "Výzvu se nepodařilo přijmout", `Přátelák s ${f.opponent.name} je domluvený${f.date ? ` na ${dayLabel(f.date)}` : "."}`);
  };

  const take = async (o: OfferView) => {
    const details = [
      { label: "Kdy", value: `${dayLabel(o.date)} v 18:00` },
      { label: "Kde", value: o.venue === "neutral" && o.neutralVillage ? `neutrální hřiště, ${o.neutralVillage}` : OFFER_VENUE_TEXT[o.venue] },
      ...(o.stake > 0 ? [{ label: "Sázka", value: `${formatCZK(o.stake)} složíš hned` }] : []),
      { label: "Tvoje náklady", value: sumCosts(o.myCosts) > 0 ? formatCZK(sumCosts(o.myCosts)) : "nic" },
    ];
    const ok = await confirm({ title: `Hrát s ${o.team.name}?`, details, confirmLabel: "Beru termín" });
    if (ok) await act(o.id, `/friendly-offers/${o.id}/take`, "Termín se nepodařilo vzít", `Přátelák s ${o.team.name} je domluvený na ${dayLabel(o.date)}`);
  };

  // Z karty rivala rovnou do výzvy s vybraným soupeřem.
  const challengeAgain = (opponentId: string) => {
    setChallengeTarget(opponentId);
    setTab("challenge");
    // Karta rivala bývá hluboko dole, formulář začíná nahoře.
    setTimeout(() => topRef.current?.scrollIntoView({ block: "start" }), 0);
  };

  if (loading) return <div className="page-container flex items-center justify-center min-h-[50vh]"><Spinner /></div>;
  if (!data || !teamId) return <div className="page-container"><div className="card p-6 text-center text-muted">Přáteláky se nepodařilo načíst.</div></div>;

  const openOffers = data.offers.filter((o) => !o.blocked).length;

  return (
    <div ref={topRef} className="page-container space-y-5">
      {confirmDialog}
      <Tabs
        items={[
          { key: "matches", label: "Zápasy", count: data.incoming.length || null },
          { key: "challenge", label: "Vyzvat" },
          { key: "offers", label: "Volné termíny", count: openOffers || null },
          { key: "record", label: "Bilance" },
        ]}
        value={tab}
        onChange={setTab}
        layout="grid"
      />

      {notice && <div className="card px-4 py-3 text-sm font-heading font-bold text-pitch-600">{notice}</div>}

      {tab === "matches" && (
        <MatchesTab data={data} busyId={busyId} onAccept={accept}
          onDecline={(f) => act(f.id, `/challenge/${f.id}/decline`, "Výzvu se nepodařilo odmítnout", "Výzva odmítnuta.")}
          onCancel={(f) => act(f.id, `/challenge/${f.id}/cancel`, "Výzvu se nepodařilo stáhnout", "Výzva stažena.")}
          onGoChallenge={() => setTab("challenge")} onGoOffers={() => setTab("offers")} />
      )}

      {tab === "challenge" && (
        <div className="space-y-3">
          <p className="text-sm text-muted">
            Vyzvi konkrétní klub na den, kdy oba máte volno. Mezi přáteláky musí být aspoň {data.limits.restDays} dny
            a v den ligy, poháru nebo turnaje se nehraje.
          </p>
          <FriendlyForm key={challengeTarget ?? "none"} mode="challenge" teamId={teamId} teams={data.teams} days={data.days}
            limits={data.limits} budget={data.budget} initialOpponentId={challengeTarget}
            onDone={(msg) => { flash(msg); setChallengeTarget(null); setTab("matches"); load(); }} />
        </div>
      )}

      {tab === "offers" && (
        <div className="space-y-5">
          <div>
            <SectionLabel>Nabízejí termín ({data.offers.length})</SectionLabel>
            {data.offers.length === 0 ? (
              <div className="card p-6 text-center text-muted text-sm">Teď nikdo volný termín nenabízí. Nabídni svůj, ať tě někdo vyzve.</div>
            ) : (
              <div className="space-y-3">
                {data.offers.map((o) => (
                  <FixtureCard key={o.id}
                    date={o.date}
                    crest={o.team.crest}
                    title={<TeamLink id={o.team.id} name={o.team.name} />}
                    place={`18:00 · ${o.venue === "neutral" && o.neutralVillage ? `neutrální hřiště, ${o.neutralVillage}` : `hraje se ${OFFER_VENUE_TEXT[o.venue]}`}${o.distanceKm != null ? ` · ${o.distanceKm} km` : ""}`}
                    tags={
                      <div className="flex flex-wrap gap-1.5 mt-2">
                        {o.stake > 0 && <StakeTag stake={o.stake} />}
                        {o.costPayer === "poster" && <span className={TAG}>náklady platí oni</span>}
                        {o.myCosts && <span className={TAG}>{sumCosts(o.myCosts) > 0 ? `tvoje náklady ${formatCZK(sumCosts(o.myCosts))}` : "neplatíš nic"}</span>}
                      </div>
                    }
                    message={o.message}
                    warning={o.blocked}
                    actions={
                      <button onClick={() => take(o)} disabled={!!o.blocked || busyId === o.id} className={PRIMARY_BUTTON}>Beru termín</button>
                    }
                  />
                ))}
              </div>
            )}
          </div>

          <div>
            <SectionLabel>Moje nabídky ({data.myOffers.length}/{data.limits.maxOpenOffers})</SectionLabel>
            {data.myOffers.length > 0 && (
              <div className="space-y-3 mb-3">
                {data.myOffers.map((o) => (
                  <FixtureCard key={o.id}
                    date={o.date}
                    crest={data.me?.crest}
                    title={<span className="font-heading font-bold text-base">Hledáš soupeře</span>}
                    place={`18:00 · ${o.venue === "poster" ? "u tebe" : o.venue === "taker" ? "u soupeře" : "na neutrálu"}${o.costPayer === "poster" ? " · platíš za oba" : ""}`}
                    tags={o.stake > 0 ? <div className="flex flex-wrap gap-1.5 mt-2"><StakeTag stake={o.stake} /></div> : null}
                    message={o.message}
                    actions={
                      <button onClick={() => act(o.id, `/friendly-offers/${o.id}/withdraw`, "Nabídku se nepodařilo stáhnout", "Nabídka stažena.")}
                        disabled={busyId === o.id} className={SECONDARY_BUTTON}>
                        Stáhnout
                      </button>
                    }
                  />
                ))}
              </div>
            )}
            {data.myOffers.length < data.limits.maxOpenOffers && (
              showOfferForm ? (
                <FriendlyForm mode="offer" teamId={teamId} teams={data.teams} days={data.days} limits={data.limits} budget={data.budget}
                  onDone={(msg) => { flash(msg); setShowOfferForm(false); load(); }} />
              ) : (
                <button onClick={() => setShowOfferForm(true)} className={`w-full ${PRIMARY_BUTTON}`}>Nabídnout volný termín</button>
              )
            )}
          </div>
        </div>
      )}

      {tab === "record" && <FriendlyRecord data={data} onChallenge={challengeAgain} />}
    </div>
  );
}

function MatchesTab({ data, busyId, onAccept, onDecline, onCancel, onGoChallenge, onGoOffers }: {
  data: FriendliesData;
  busyId: string | null;
  onAccept: (f: FriendlyView) => void;
  onDecline: (f: FriendlyView) => void;
  onCancel: (f: FriendlyView) => void;
  onGoChallenge: () => void;
  onGoOffers: () => void;
}) {
  const empty = data.incoming.length + data.upcoming.length + data.outgoing.length + data.cancelled.length === 0;
  return (
    <div className="space-y-5">
      {data.incoming.length > 0 && (
        <div>
          <SectionLabel>Výzvy pro tebe ({data.incoming.length})</SectionLabel>
          <div className="space-y-3">
            {data.incoming.map((f) => (
              <FriendlyCard key={f.id} f={f} status={<StatusPill tone="gold">čeká na tebe</StatusPill>}>
                <button onClick={() => onAccept(f)} disabled={busyId === f.id || !!f.clash} className={PRIMARY_BUTTON}>Přijmout</button>
                <button onClick={() => onDecline(f)} disabled={busyId === f.id} className={SECONDARY_BUTTON}>Odmítnout</button>
              </FriendlyCard>
            ))}
          </div>
        </div>
      )}

      {data.upcoming.length > 0 && (
        <div>
          <SectionLabel>Domluvené ({data.upcoming.length})</SectionLabel>
          <div className="space-y-3">
            {data.upcoming.map((f) => {
              const today = f.matchStatus === "lineups_open";
              return (
                <FriendlyCard key={f.id} f={f} status={today ? null : <StatusPill tone="muted">domluveno</StatusPill>}>
                  {today && f.matchId && (
                    <Link href={`/zapas?calendarId=${f.matchId}`} className={PRIMARY_BUTTON}>Sestava</Link>
                  )}
                </FriendlyCard>
              );
            })}
          </div>
        </div>
      )}

      {data.outgoing.length > 0 && (
        <div>
          <SectionLabel>Odeslané výzvy ({data.outgoing.length})</SectionLabel>
          <div className="space-y-3">
            {data.outgoing.map((f) => (
              <FriendlyCard key={f.id} f={f} status={<StatusPill tone="muted">čeká na odpověď</StatusPill>}>
                <button onClick={() => onCancel(f)} disabled={busyId === f.id} className={SECONDARY_BUTTON}>Stáhnout</button>
              </FriendlyCard>
            ))}
          </div>
        </div>
      )}

      {data.cancelled.length > 0 && (
        <div>
          <SectionLabel>Zrušené</SectionLabel>
          <div className="space-y-3">
            {data.cancelled.map((f) => (
              // Důvod zrušení se ukáže na místě, kde u příchozí výzvy bývá kolize.
              <FriendlyCard key={f.id} f={{ ...f, myCosts: null, clash: f.cancelReason }} status={<StatusPill tone="red">nehrálo se</StatusPill>} />
            ))}
          </div>
        </div>
      )}

      {empty && (
        <div className="card p-6 text-center space-y-3">
          <p className="text-sm text-muted">Zatím nic domluveného. Vyzvi soupeře, nebo se podívej, kdo nabízí volný termín.</p>
          <div className="flex gap-2 justify-center flex-wrap">
            <button onClick={onGoChallenge} className={PRIMARY_BUTTON}>Vyzvat soupeře</button>
            <button onClick={onGoOffers} className={SECONDARY_BUTTON}>Volné termíny</button>
          </div>
        </div>
      )}
    </div>
  );
}
