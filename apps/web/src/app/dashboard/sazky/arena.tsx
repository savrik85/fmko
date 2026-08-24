"use client";

/**
 * Tiketaréna — vyvěšené tikety soutěže a vlákna pod nimi.
 *
 * Sdílení je vědomé gesto: u běžícího tiketu tím hráč odkrývá, na co vsadil.
 * Proto je u něj vidět, že ještě neskončil, a jde ho z arény stáhnout.
 */

import { useState } from "react";
import { apiAction, apiFetch } from "@/lib/api";
import { EntityLink } from "@/components/ui";
import { FaceAvatar } from "@/components/players/face-avatar";
import { czk, kurz, IkonaTipu, Prazdno, StavPill, TYP_TIKETU } from "./ui";
import type { ArenaOdpoved, ArenaTiket } from "./types";

const TRH: Record<string, string> = {
  "1x2": "Vítěz", dchance: "Neprohra", totals: "Góly", scorer: "Střelec",
};

function kdy(iso: string): string {
  const t = new Date(iso).getTime();
  const min = Math.round((Date.now() - t) / 60000);
  if (min < 1) return "teď";
  if (min < 60) return `před ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `před ${h} h`;
  return new Date(iso).toLocaleDateString("cs", { day: "numeric", month: "numeric" });
}

/**
 * Portrét trenéra. V aréně mluví lidé, ne kluby — proto je vidět tvář a jméno
 * trenéra, a název klubu až pod ním jako odkaz.
 */
function Tvar({ avatar, jmeno, size }: {
  avatar: Record<string, unknown> | null; jmeno: string; size: number;
}) {
  const pouzitelny = !!avatar && Object.keys(avatar).length > 2;
  return (
    <div className="rounded-full overflow-hidden shrink-0 flex items-end justify-center bg-gray-100"
         style={{ width: size, height: size }}>
      {pouzitelny
        ? <FaceAvatar faceConfig={avatar} size={size / 1.2} />
        : <span className="text-sm font-heading font-bold text-muted self-center">
            {jmeno.trim().charAt(0).toUpperCase()}
          </span>}
    </div>
  );
}

function Vlakno({ t, maxComment, teamId, onZmena }: {
  t: ArenaTiket; maxComment: number; teamId: string; onZmena: () => void;
}) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [otevreno, setOtevreno] = useState(t.komentare.length > 0);

  const posli = async () => {
    if (text.trim().length < 2) return;
    setBusy(true);
    const ok = await apiAction(
      apiFetch(`/api/teams/${teamId}/bets/${t.id}/comments`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: text.trim() }),
      }),
      "Komentář se nepodařilo odeslat",
    );
    setBusy(false);
    if (ok) { setText(""); onZmena(); }
  };

  const smaz = async (id: string) => {
    if (await apiAction(
      apiFetch(`/api/teams/${teamId}/bets/comments/${id}`, { method: "DELETE" }),
      "Komentář se nepodařilo smazat",
    )) onZmena();
  };

  return (
    <div className="border-t border-gray-50">
      {!otevreno && (
        <button type="button" onClick={() => setOtevreno(true)}
          className="w-full min-h-11 px-3 text-sm font-heading font-bold text-muted hover:bg-gray-50/50 cursor-pointer">
          Napsat k tiketu
        </button>
      )}

      {otevreno && (
        <div className="px-3 py-2.5 space-y-2.5">
          {t.komentare.map((k) => (
            <div key={k.id} className="flex items-start gap-2 text-sm">
              <Tvar avatar={k.authorAvatar} jmeno={k.authorName ?? k.teamName} size={30} />
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline gap-2 flex-wrap">
                  <span className="text-base font-semibold leading-tight">
                    {k.authorName ?? k.teamName}
                  </span>
                  <EntityLink type="team" id={k.teamId} className="text-micro text-muted">
                    {k.teamName}
                  </EntityLink>
                  <span className="text-micro text-muted">· {kdy(k.createdAt)}</span>
                  {k.muzuSmazat && (
                    <button type="button" onClick={() => smaz(k.id)}
                      className="ml-auto text-micro text-muted hover:text-card-red cursor-pointer">
                      smazat
                    </button>
                  )}
                </div>
                <p className="leading-snug break-words">{k.body}</p>
              </div>
            </div>
          ))}

          <div className="flex items-end gap-2">
            <textarea
              value={text} onChange={(e) => setText(e.target.value)} rows={2} maxLength={maxComment}
              placeholder="Co na to říkáš?"
              className="input flex-1 text-sm resize-none" />
            <button type="button" onClick={posli} disabled={busy || text.trim().length < 2}
              className="min-h-11 px-3 rounded-control bg-pitch-500 text-white font-heading font-bold text-sm disabled:opacity-40 cursor-pointer shrink-0">
              {busy ? "…" : "Poslat"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function ArenaKarta({ t, maxComment, teamId, onZmena }: {
  t: ArenaTiket; maxComment: number; teamId: string; onZmena: () => void;
}) {
  const bezi = t.status === "open";
  const stahni = async () => {
    if (await apiAction(
      apiFetch(`/api/teams/${teamId}/bets/${t.id}/share`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: "{}",
      }),
      "Nepodařilo se stáhnout z arény",
    )) onZmena();
  };

  return (
    <article className="card overflow-hidden">
      <div className="flex items-center gap-2.5 px-3 py-2.5 border-b border-gray-50">
        <Tvar avatar={t.authorAvatar} jmeno={t.authorName ?? t.teamName} size={38} />
        <div className="flex-1 min-w-0">
          <div className="text-base font-semibold leading-tight truncate">
            {t.authorName ?? t.teamName}
          </div>
          <EntityLink type="team" id={t.teamId} className="text-micro text-muted truncate block">
            {t.teamName}
          </EntityLink>
        </div>
        <span className="text-micro text-muted shrink-0">{kdy(t.sharedAt)}</span>
      </div>

      {t.vzkaz && (
        <div className="px-3 pt-2.5">
          <p className="text-base leading-snug break-words">{t.vzkaz}</p>
        </div>
      )}

      <div className="flex items-center gap-2 px-3 pt-2.5 pb-1 flex-wrap">
        <StavPill stav={t.status} />
        <span className="font-commentary text-micro tabular-nums tracking-widest text-muted">č. {t.cislo}</span>
        <span className="text-micro text-muted">{TYP_TIKETU[t.tipy.length] ?? `${t.tipy.length} tipů`}</span>
        {t.gameWeek != null && (
          <span className="ml-auto text-micro text-muted tabular-nums">{t.gameWeek}. kolo</span>
        )}
      </div>

      <ol className="divide-y divide-gray-50">
        {t.tipy.map((s, i) => (
          <li key={i} className="flex items-start gap-2 px-3 py-2">
            <span className="mt-0.5"><IkonaTipu stav={s.result} /></span>
            <div className="flex-1 min-w-0">
              <div className="text-base font-semibold leading-tight break-words">{s.zapas}</div>
              <div className="text-sm text-muted leading-tight break-words">
                {TRH[s.market] ?? s.market}: {s.label}
                {s.vysledek && <> · <span className="tabular-nums text-ink">{s.vysledek}</span></>}
              </div>
            </div>
            <span className={`text-base font-heading font-bold tabular-nums shrink-0
                             ${s.result === "lost" ? "text-muted line-through" : ""}`}>
              {kurz(s.oddsX100)}
            </span>
          </li>
        ))}
      </ol>

      <div className="px-3 py-2 bg-gray-50/60 flex items-center gap-3 flex-wrap text-sm tabular-nums">
        <span className="text-muted">vklad <b className="font-heading text-ink">{czk(t.stake)}</b></span>
        <span className="text-gray-300">·</span>
        <span className="text-muted">kurz <b className="font-heading text-ink">{kurz(t.totalOddsX100)}</b></span>
        <span className="text-gray-300">·</span>
        <span className={t.status === "won" ? "text-pitch-600" : "text-muted"}>
          {bezi ? "může vyhrát " : t.status === "won" ? "vyhrál " : "prohráno "}
          <b className="font-heading">{czk(bezi ? t.potentialPayout : t.payout)}</b>
        </span>
        {t.jeMuj && (
          <button type="button" onClick={stahni}
            className="ml-auto text-micro font-heading font-bold text-muted hover:text-card-red cursor-pointer">
            stáhnout z arény
          </button>
        )}
      </div>

      <Vlakno t={t} maxComment={maxComment} teamId={teamId} onZmena={onZmena} />
    </article>
  );
}

export function Arena({ data, teamId, onZmena }: {
  data: ArenaOdpoved | null; teamId: string; onZmena: () => void;
}) {
  if (!data) return null;
  if (data.tickets.length === 0) {
    return (
      <Prazdno nadpis="V aréně je zatím prázdno">
        Vyvěs svůj tiket na záložce Tikety a ostatní ho uvidí. Můžou se pod ním
        vyjádřit — a ty pod jejich.
      </Prazdno>
    );
  }
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted leading-snug px-1">
        Tikety, které klub sám vyvěsil. U běžících je vidět, na co ještě čekají.
      </p>
      {data.tickets.map((t) => (
        <ArenaKarta key={t.id} t={t} maxComment={data.maxComment} teamId={teamId} onZmena={onZmena} />
      ))}
    </div>
  );
}
