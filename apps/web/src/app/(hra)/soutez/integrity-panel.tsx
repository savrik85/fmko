"use client";

/**
 * Agenda komisaře pro integritu — kniha sázek a listina přestupů.
 *
 * Obojí je odpověď na tutéž otázku: nejde tady o něco podezřelého? Příznaky
 * u přestupů nejsou obvinění, jen zvýraznění — rozhodnutí je vždycky na
 * člověku, protože falešné obvinění je horší než přehlédnutý obchod.
 */

import { useEffect, useState } from "react";
import { apiAction, apiFetch } from "@/lib/api";
import { Modal, EntityLink, ListRow, RowValue, StatusChip, ChipTone } from "@/components/ui";
import { Empty, Ornament, Rozbaleni, czk, plural } from "./ui";
import { ClubAuditSection } from "./club-audit-section";
import type { State } from "./types";

interface TipKnihy { label: string; oddsX100: number; result: string; zapas: string }

interface ZaznamKnihy {
  ticketId: string; cislo: string; teamId: string; teamName: string;
  stake: number; totalOddsX100: number; payout: number; status: string;
  gameWeek: number | null; bezici: boolean; tipy: TipKnihy[];
}

interface ZaznamPrestupu {
  hrac: string; playerId: string; zKlubu: string | null; doKlubu: string;
  castka: number; druh: string; gameDate: string; priznaky: string[];
  vymena?: boolean; protihrac?: string | null;
}

interface FriendlyStakeRecord {
  challengeId: string; date: string | null;
  challengerId: string; challengerName: string; opponentId: string; opponentName: string;
  stake: number; status: string; challengerGoals: number | null; opponentGoals: number | null; linked: boolean;
}

interface BookData { tickets: ZaznamKnihy[]; transfers: ZaznamPrestupu[]; friendlyStakes?: FriendlyStakeRecord[] }

const FRIENDLY_STAKE_STATUS: Record<string, { label: string; tone: ChipTone }> = {
  held: { label: "Složeno", tone: "neutral" },
  paid: { label: "Vyplaceno", tone: "ok" },
  refunded: { label: "Vráceno", tone: "warn" },
};

/** „2026-11-09" → „9. 11." */
const shortDay = (day: string) => {
  const [, m, d] = day.slice(0, 10).split("-");
  return `${Number(d)}. ${Number(m)}.`;
};

const kurz = (x: number) => (x / 100).toFixed(2).replace(".", ",");

const STAV: Record<string, { label: string; tone: ChipTone }> = {
  open: { label: "Běží", tone: "neutral" },
  won: { label: "Vyhraný", tone: "ok" },
  lost: { label: "Prohraný", tone: "danger" },
  void: { label: "Vrácený", tone: "warn" },
  confiscated: { label: "Zabaveno", tone: "danger" },
};

export function IntegrityPanel({ state, teamId, jsemKomisar, onChanged }: {
  state: State; teamId: string | null; jsemKomisar: boolean; onChanged: () => void;
}) {
  const [data, setData] = useState<BookData | null>(null);
  const [chyba, setChyba] = useState<string | null>(null);
  const [zabavit, setZabavit] = useState<ZaznamKnihy | null>(null);
  const [zablokovat, setZablokovat] = useState(false);
  const [duvod, setDuvod] = useState("");
  const [cil, setCil] = useState("");
  const [kol, setKol] = useState(5);
  const [odesilam, setOdesilam] = useState(false);

  useEffect(() => {
    if (!teamId) return;
    apiFetch<BookData>(`/api/teams/${teamId}/betting/book`)
      .then(setData)
      .catch((e) => {
        console.error("načtení knihy sázek:", e);
        setChyba(e instanceof Error ? e.message : "Knihu sázek se nepodařilo načíst.");
      });
  }, [teamId]);

  if (chyba) {
    return (
      <div className="card p-5">
        <Ornament>Kniha sázek</Ornament>
        <p className="text-sm text-muted leading-snug mt-2">{chyba}</p>
      </div>
    );
  }
  if (!data) return <Empty>Načítám knihu sázek…</Empty>;

  const podezrele = data.transfers.filter((t) => t.priznaky.length > 0);
  const friendlyStakes = data.friendlyStakes ?? [];

  const provedZabaveni = async () => {
    if (!zabavit || !teamId) return;
    setOdesilam(true);
    const ok = await apiAction(
      apiFetch(`/api/teams/${teamId}/betting/tickets/${zabavit.ticketId}/confiscate`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: duvod }),
      }),
      "Výhru se nepodařilo zabavit",
    );
    setOdesilam(false);
    if (ok) { setZabavit(null); setDuvod(""); onChanged(); }
  };

  const provedZakaz = async () => {
    if (!teamId || !cil) return;
    setOdesilam(true);
    const ok = await apiAction(
      apiFetch(`/api/teams/${teamId}/betting/bans`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetTeamId: cil, rounds: kol, reason: duvod }),
      }),
      "Zákaz se nepodařilo uložit",
    );
    setOdesilam(false);
    if (ok) { setZablokovat(false); setDuvod(""); setCil(""); onChanged(); }
  };

  return (
    <div className="space-y-4">
      {/* ── Přestupy k prověření ─────────────────────────────────────────── */}
      {/* Zabalené jako všechno ostatní. Počet podezřelých je vidět v poznámce,
          takže se sem dá zajít cíleně, automatické rozbalení nejdelšího seznamu
          by zrušilo důvod, proč jsou tyhle sekce sbalovací. */}
      <Rozbaleni
        title="Přestupy soutěže"
        right={`${data.transfers.length} ${plural(data.transfers.length, "obchod", "obchody", "obchodů")}`}
        note={data.transfers.length === 0
          ? "Letos se v soutěži zatím nikdo neprodal."
          : podezrele.length === 0
            ? "Nic se zatím nevymyká."
            : (
              <span style={{ color: "#A32B1F" }}>
                {podezrele.length === 1
                  ? "Jeden obchod stojí za pohled."
                  : `${podezrele.length} ${plural(podezrele.length, "obchod", "obchody", "obchodů")} stojí za pohled.`}{" "}
                <span className="text-muted">
                  Není to obvinění, jen upozornění, že se něco vymyká.
                </span>
              </span>
            )}
      >
        {data.transfers.length > 0 && (
          <>
            <ul className="-mx-4 sm:-mx-5 mt-3 border-t border-line divide-y divide-line-soft">
              {data.transfers.map((t, i) => (
                <li key={i}>
                  <ListRow tone={t.priznaky.length > 0 ? "danger" : undefined}
                    title={t.playerId ? <EntityLink type="player" id={t.playerId}>{t.hrac}</EntityLink> : t.hrac}
                    /* Odkud kam je u kontroly přestupu hlavní údaj, proto zalamovací
                       řádek a ne `meta`, která by cílový klub na telefonu usekla. */
                    detail={<>
                      <span className="block text-muted">{`${t.druh} · ${t.zKlubu ?? "volný hráč"} → ${t.doKlubu}${t.vymena && t.protihrac ? ` · za ${t.protihrac}` : ""}`}</span>
                      {t.priznaky.map((p, j) => <span key={j} className="block" style={{ color: "#A32B1F" }}>⚠ {p}</span>)}
                    </>}
                    /* U výměny nese peníze jen jedna strana; „zdarma" by u té
                       druhé lhalo, protihodnotou byl hráč. */
                    trailing={<RowValue>{t.castka > 0 ? (t.vymena ? `doplatek ${czk(t.castka)}` : czk(t.castka)) : t.vymena ? "bez doplatku" : "zdarma"}</RowValue>} />
                </li>
              ))}
            </ul>
          </>
        )}
      </Rozbaleni>

      {/* ── Kniha sázek ──────────────────────────────────────────────────── */}
      <Rozbaleni
        title="Kniha sázek"
        right={`${data.tickets.length} ${plural(data.tickets.length, "tiket", "tikety", "tiketů")}`}
        note={data.tickets.length === 0
          ? "Zatím si nikdo nevsadil."
          : "Všechny tikety klubů soutěže včetně těch, které ještě běží. Kromě tebe do ní vidí jen prezident soutěže."}
      >
        {data.tickets.length > 0 && (
          <ul className="-mx-4 sm:-mx-5 mt-3 border-t border-line divide-y divide-line-soft">
            {data.tickets.map((t) => {
              const s = STAV[t.status] ?? STAV.open;
              return (
                <li key={t.ticketId}>
                  <ListRow
                    title={<EntityLink type="team" id={t.teamId}>{t.teamName}</EntityLink>}
                    meta={<><span className="font-commentary tabular-nums tracking-widest">č. {t.cislo}</span>{t.gameWeek != null && ` · ${t.gameWeek}. kolo`}</>}
                    detail={
                      <>
                        <span className="block">{t.tipy.map((x) => `${x.zapas} ${x.label}`).join(" + ")}</span>
                        <span className="flex items-center gap-3 mt-1 flex-wrap tabular-nums">
                          <span>vklad <b className="font-heading">{czk(t.stake)}</b></span>
                          <span>kurz <b className="font-heading">{kurz(t.totalOddsX100)}</b></span>
                          {t.payout > 0 && <span className="text-pitch-600">výplata <b className="font-heading">{czk(t.payout)}</b></span>}
                          {jsemKomisar && t.status === "won" && t.teamId !== teamId && (
                            <button type="button" onClick={() => { setZabavit(t); setDuvod(""); }}
                              className="ml-auto font-heading font-bold text-card-red cursor-pointer">
                              Zabavit výhru
                            </button>
                          )}
                        </span>
                      </>
                    }
                    trailing={<StatusChip tone={s.tone}>{s.label}</StatusChip>} />
                </li>
              );
            })}
          </ul>
        )}
      </Rozbaleni>

      {/* ── Přáteláky o peníze ───────────────────────────────────────────── */}
      <Rozbaleni
        title="Přáteláky o peníze"
        right={`${friendlyStakes.length} ${plural(friendlyStakes.length, "zápas", "zápasy", "zápasů")}`}
        note={friendlyStakes.length === 0
          ? "O peníze se zatím nehrálo."
          : "Přáteláky klubů soutěže, ve kterých si obě strany složily sázku. Vítěz bere obě."}
      >
        {friendlyStakes.length > 0 && (
          <ul className="-mx-4 sm:-mx-5 mt-3 border-t border-line divide-y divide-line-soft">
            {friendlyStakes.map((f) => {
              const s = FRIENDLY_STAKE_STATUS[f.status] ?? FRIENDLY_STAKE_STATUS.held;
              const played = f.challengerGoals != null && f.opponentGoals != null;
              return (
                <li key={f.challengeId}>
                  <ListRow tone={f.linked ? "danger" : undefined}
                    title={<>
                      <EntityLink type="team" id={f.challengerId}>{f.challengerName}</EntityLink>
                      <span className="font-normal">{played ? ` ${f.challengerGoals}:${f.opponentGoals} ` : " a "}</span>
                      <EntityLink type="team" id={f.opponentId}>{f.opponentName}</EntityLink>
                    </>}
                    meta={<>{f.date ? `${shortDay(f.date)} · ` : ""}každý složil <b className="font-heading text-ink">{czk(f.stake)}</b></>}
                    detail={f.linked ? <span style={{ color: "#A32B1F" }}>⚠ Kluby mají podle listiny stejného majitele.</span> : undefined}
                    trailing={<StatusChip tone={s.tone}>{s.label}</StatusChip>} />
                </li>
              );
            })}
          </ul>
        )}
      </Rozbaleni>

      {/* ── Účetnictví klubů ─────────────────────────────────────────────── */}
      {teamId && <ClubAuditSection teamId={teamId} />}

      {/* Ovládání zůstává mimo rozbalení — jinak by se k němu komisař proklikával. */}
      {jsemKomisar && (
        <button type="button" onClick={() => { setZablokovat(true); setDuvod(""); setCil(""); }}
          className="w-full min-h-12 rounded-soft bg-pitch-500 text-white font-heading font-bold text-sm cursor-pointer">
          Zakázat klubu sázení
        </button>
      )}

      {/* ── Zabavení výhry ───────────────────────────────────────────────── */}
      <Modal isOpen={!!zabavit} onClose={() => setZabavit(null)} title="Zabavit výhru" zavritKlikemVedle={false}>
        <div className="p-4 space-y-3">
          <p className="text-sm leading-snug">
            Tiket č. {zabavit?.cislo} klubu <b>{zabavit?.teamName}</b>, výhra{" "}
            <b>{czk(zabavit?.payout ?? 0)}</b>. Peníze půjdou do pokladny soutěže
            a klub dostane zprávu i s tvým odůvodněním.
          </p>
          <div>
            <label htmlFor="duvod-zabaveni" className="text-micro font-heading font-bold uppercase tracking-wide text-muted">
              Proč výhru zabavuješ
            </label>
            <textarea id="duvod-zabaveni" value={duvod} onChange={(e) => setDuvod(e.target.value)}
              rows={3} maxLength={300}
              className="input w-full mt-1 text-sm"
              placeholder="Aspoň větu, klub i grémium to uvidí." />
          </div>
          <button type="button" onClick={provedZabaveni} disabled={odesilam || duvod.trim().length < 10}
            className="w-full min-h-12 rounded-soft bg-card-red text-white font-heading font-bold text-sm disabled:opacity-50 cursor-pointer">
            {odesilam ? "Zabavuji…" : "Zabavit výhru"}
          </button>
        </div>
      </Modal>

      {/* ── Zákaz sázení ─────────────────────────────────────────────────── */}
      <Modal isOpen={zablokovat} onClose={() => setZablokovat(false)} title="Zakázat klubu sázení" zavritKlikemVedle={false}>
        <div className="p-4 space-y-3">
          <p className="text-sm text-muted leading-snug">
            Zákaz platí okamžitě a klub se proti němu může odvolat k zasedání.
            Vlastnímu klubu ho uložit nemůžeš.
          </p>
          <div>
            <label htmlFor="cil-zakazu" className="text-micro font-heading font-bold uppercase tracking-wide text-muted">
              Klub
            </label>
            <select id="cil-zakazu" value={cil} onChange={(e) => setCil(e.target.value)}
                    className="select w-full mt-1 text-sm">
              <option value="">Vyber klub</option>
              {[...new Map(data.tickets.filter((t) => t.teamId !== teamId)
                .map((t) => [t.teamId, t.teamName])).entries()]
                .map(([id, nazev]) => <option key={id} value={id}>{nazev}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="pocet-kol" className="text-micro font-heading font-bold uppercase tracking-wide text-muted">
              Na kolik kol
            </label>
            <input id="pocet-kol" type="number" min={1} max={30} value={kol}
              onChange={(e) => setKol(Math.max(1, Math.min(30, Number(e.target.value) || 1)))}
              className="input w-full mt-1 text-sm tabular-nums" />
          </div>
          <div>
            <label htmlFor="duvod-zakazu" className="text-micro font-heading font-bold uppercase tracking-wide text-muted">
              Za co
            </label>
            <textarea id="duvod-zakazu" value={duvod} onChange={(e) => setDuvod(e.target.value)}
              rows={3} maxLength={300} className="input w-full mt-1 text-sm"
              placeholder="Aspoň větu, klub i grémium to uvidí." />
          </div>
          <button type="button" onClick={provedZakaz}
            disabled={odesilam || !cil || duvod.trim().length < 10}
            className="w-full min-h-12 rounded-soft bg-pitch-500 text-white font-heading font-bold text-sm disabled:opacity-50 cursor-pointer">
            {odesilam ? "Ukládám…" : "Zakázat sázení"}
          </button>
        </div>
      </Modal>
    </div>
  );
}
