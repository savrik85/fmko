"use client";

import { useEffect, useMemo, useState } from "react";
import { apiFetch, showError } from "@/lib/api";
import { ChoiceGroup } from "@/components/ui";
import { PRIMARY_BUTTON, dayLabel, dayShort, sumCosts, type CostLine, type DayOption, type FriendlyLimits, type TeamOption } from "./friendly-ui";
import { formatKc } from "@/lib/format";

type Mode = "challenge" | "offer";

interface Quote {
  distanceKm: number;
  neutralVillage: { id: string; name: string } | null;
  myCosts: CostLine[];
  opponentCosts: CostLine[];
  opponentBusy: Array<{ date: string; text: string }>;
}

const STAKES = [0, 500, 1000, 2000, 5000, 10000];

/**
 * Formulář přáteláku. Výzva jde konkrétnímu klubu, nabídka termínu je veřejná
 * a vezme ji kdokoli. Podmínky jsou u obou stejné: den, místo, kdo platí, sázka, vzkaz.
 */
export function FriendlyForm({ mode, teamId, teams, days, limits, budget, onDone, initialOpponentId = null }: {
  mode: Mode;
  teamId: string;
  teams: TeamOption[];
  days: DayOption[];
  limits: FriendlyLimits;
  budget: number;
  onDone: (message: string) => void;
  /** Soupeř předvybraný z karty rivala („Vyzvat znovu"). */
  initialOpponentId?: string | null;
}) {
  const [opponentId, setOpponentId] = useState(initialOpponentId ?? "");
  const [date, setDate] = useState("");
  const [venue, setVenue] = useState<"home" | "away" | "neutral">("home");
  const [payer, setPayer] = useState<"each" | "me">("each");
  const [stake, setStake] = useState(0);
  const [message, setMessage] = useState("");
  const [quote, setQuote] = useState<Quote | null>(null);
  const [sending, setSending] = useState(false);

  const opponent = teams.find((t) => t.id === opponentId) ?? null;
  const linked = !!opponent?.linked;

  // Kluby se stejným majitelem spolu hrají jen bez peněz.
  useEffect(() => {
    if (linked) { setStake(0); setPayer("each"); }
  }, [linked]);

  const apiVenue = mode === "challenge"
    ? ({ home: "challenger", away: "opponent", neutral: "neutral" } as const)[venue]
    : ({ home: "poster", away: "taker", neutral: "neutral" } as const)[venue];
  const apiPayer = mode === "challenge"
    ? ({ each: "each", me: "challenger" } as const)[payer]
    : ({ each: "each", me: "poster" } as const)[payer];

  useEffect(() => {
    if (mode !== "challenge" || !opponentId) { setQuote(null); return; }
    let alive = true;
    apiFetch<Quote>(`/api/teams/${teamId}/friendlies/quote?opponent=${opponentId}&venue=${apiVenue}&costPayer=${apiPayer}`)
      .then((q) => { if (alive) setQuote(q); })
      .catch((e) => console.error("náklady přáteláku:", e));
    return () => { alive = false; };
  }, [mode, teamId, opponentId, apiVenue, apiPayer]);

  const opponentBusy = useMemo(() => new Map((quote?.opponentBusy ?? []).map((b) => [b.date, b.text])), [quote]);
  const blockedReason = (d: DayOption) => d.busy ?? opponentBusy.get(d.date) ?? null;
  const selectedBlocked = date ? blockedReason(days.find((d) => d.date === date) ?? { date, busy: null }) : null;

  // Den, který mezitím přestal být volný (soupeř vybraný až po dni), se zruší.
  useEffect(() => {
    if (date && selectedBlocked) setDate("");
  }, [date, selectedBlocked]);

  const byDistrict = useMemo(() => {
    const map = new Map<string, TeamOption[]>();
    for (const t of teams) {
      const k = t.district ?? "Ostatní";
      map.set(k, [...(map.get(k) ?? []), t]);
    }
    return [...map.entries()];
  }, [teams]);

  const busyList = days.filter((d) => d.busy);
  const canSubmit = !!date && !selectedBlocked && (mode === "offer" || !!opponentId) && stake <= budget && !sending;

  const submit = async () => {
    if (!canSubmit) return;
    setSending(true);
    try {
      const body = JSON.stringify({ date, venue: apiVenue, costPayer: apiPayer, stake, message });
      if (mode === "challenge") {
        await apiFetch(`/api/teams/${teamId}/challenge/${opponentId}`, { method: "POST", headers: { "Content-Type": "application/json" }, body });
        onDone(`Výzva pro ${opponent?.name ?? "soupeře"} odeslána. Dostane ji do telefonu.`);
      } else {
        await apiFetch(`/api/teams/${teamId}/friendly-offers`, { method: "POST", headers: { "Content-Type": "application/json" }, body });
        onDone(`Termín ${dayLabel(date)} je venku. Jakmile ho někdo vezme, dostaneš zprávu.`);
      }
    } catch (e) {
      console.error("odeslání přáteláku:", e);
      showError(mode === "challenge" ? "Výzvu se nepodařilo odeslat" : "Termín se nepodařilo zveřejnit", (e as Error)?.message || "Zkus to znovu.");
    } finally {
      setSending(false);
    }
  };

  const select = "w-full min-h-11 rounded-control bg-black/5 px-3 text-sm font-heading font-bold text-ink";
  const label = "text-sm font-heading font-bold text-muted mb-1.5";
  const venueOptions = [
    { key: "home" as const, label: "U mě" },
    { key: "away" as const, label: mode === "challenge" ? "U soupeře" : "U toho, kdo vezme" },
    { key: "neutral" as const, label: "Na neutrálu" },
  ];

  return (
    <div className="card p-4 space-y-4">
      {mode === "challenge" && (
        <div>
          <div className={label}>Koho vyzveš</div>
          <select aria-label="Soupeř" value={opponentId} onChange={(e) => setOpponentId(e.target.value)} className={select}>
            <option value="">Vyber klub</option>
            {byDistrict.map(([district, list]) => (
              <optgroup key={district} label={district}>
                {list.map((t) => (
                  <option key={t.id} value={t.id}>{t.name}{t.linked ? " (stejný majitel)" : ""}</option>
                ))}
              </optgroup>
            ))}
          </select>
          {linked && (
            <p className="text-sm text-muted mt-1.5">Klub má stejného majitele jako ty. Hrát spolu můžete, ale jen bez sázky a každý za své.</p>
          )}
        </div>
      )}

      <div>
        <div className={label}>Den (hraje se v 18:00)</div>
        <ChoiceGroup ariaLabel="Den zápasu" columns={7} value={date} onChange={setDate}
          options={days.map((d) => {
            const reason = blockedReason(d);
            const s = dayShort(d.date);
            return { value: d.date, label: s.weekday, hint: s.day, disabled: !!reason, title: reason ?? undefined };
          })} />
        {(busyList.length > 0 || opponentBusy.size > 0) && (
          <ul className="text-sm text-muted mt-2 space-y-0.5">
            {busyList.map((d) => <li key={d.date}>{dayShort(d.date).day} {d.busy}</li>)}
            {[...opponentBusy.entries()].filter(([dt]) => !busyList.some((b) => b.date === dt)).map(([dt, text]) => (
              <li key={`o-${dt}`}>{dayShort(dt).day} {text}</li>
            ))}
          </ul>
        )}
      </div>

      <div>
        <div className={label}>Kde se hraje</div>
        <ChoiceGroup ariaLabel="Kde se hraje" columns={3} value={venue} onChange={setVenue}
          options={venueOptions.map((o) => ({ value: o.key, label: o.label }))} />
        <p className="text-sm text-muted mt-1.5">
          {venue === "neutral"
            ? mode === "challenge" && quote?.neutralVillage
              ? `Obecní hřiště v obci ${quote.neutralVillage.name}, zhruba napůl cesty. Bez výhody domácích a bez vstupného.`
              : "Obecní hřiště zhruba napůl cesty. Bez výhody domácích a bez vstupného."
            : "Domácí mají výhodu domácího hřiště a berou vstupné i bufet."}
        </p>
      </div>

      <div>
        <div className={label}>Kdo platí náklady</div>
        <ChoiceGroup ariaLabel="Kdo platí náklady" columns={2} value={payer} onChange={setPayer}
          options={[{ value: "each", label: "Každý své" }, { value: "me", label: "Platím za oba", disabled: linked }]} />
        {mode === "challenge" && quote ? (
          <div className="text-sm mt-2 space-y-0.5">
            <div className="text-muted">Vzdálenost {quote.distanceKm} km</div>
            <div><span className="font-heading font-bold">Ty zaplatíš:</span> {quote.myCosts.length ? quote.myCosts.map((l) => `${l.label.toLowerCase()} ${formatKc(l.amount)}`).join(", ") : "nic"}{quote.myCosts.length > 1 ? `, celkem ${formatKc(sumCosts(quote.myCosts))}` : ""}</div>
            <div><span className="font-heading font-bold">Soupeř zaplatí:</span> {quote.opponentCosts.length ? quote.opponentCosts.map((l) => `${l.label.toLowerCase()} ${formatKc(l.amount)}`).join(", ") : "nic"}</div>
          </div>
        ) : (
          <p className="text-sm text-muted mt-1.5">
            Hostitel platí rozhodčího ({formatKc(limits.refereeFee)}), host cestovné ({formatKc(limits.travelBase)} a {limits.travelPerKm} Kč za km).
            Na neutrálu se rozhodčí i pronájem hřiště ({formatKc(limits.rentalFee)}) dělí napůl. Strhává se v den zápasu.
          </p>
        )}
      </div>

      <div>
        <div className={label}>O kolik se hraje</div>
        <ChoiceGroup ariaLabel="O kolik se hraje" columns={6} value={String(stake)} onChange={(v) => setStake(Number(v))}
          options={STAKES.map((v) => ({ value: String(v), label: v === 0 ? "Bez sázky" : formatKc(v), disabled: v > 0 && (linked || v > budget) }))} />
        <p className="text-sm text-muted mt-1.5">
          {stake > 0
            ? `Sázku složíte oba, až soupeř kývne. Vítěz bere ${formatKc(stake * 2)}, při remíze se vrací.`
            : "Přátelák jen na trénink, bez peněz navíc."}
        </p>
      </div>

      <div>
        <div className={label}>Vzkaz (nepovinný)</div>
        <textarea value={message} onChange={(e) => setMessage(e.target.value.slice(0, limits.maxMessage))} rows={2}
          placeholder={mode === "challenge" ? "Třeba: přijeďte, po zápase guláš a pivo" : "Třeba: hledáme soupeře na rozehrání před ligou"}
          className="w-full rounded-control bg-black/5 px-3 py-2 text-sm text-ink" />
        <div className="text-sm text-muted text-right">{message.length}/{limits.maxMessage}</div>
      </div>

      <button type="button" onClick={submit} disabled={!canSubmit} className={`w-full ${PRIMARY_BUTTON}`}>
        {sending ? "Odesílám…" : mode === "challenge" ? "Odeslat výzvu" : "Zveřejnit termín"}
      </button>
      {!date && <p className="text-sm text-muted text-center -mt-2">Vyber den zápasu.</p>}
    </div>
  );
}
