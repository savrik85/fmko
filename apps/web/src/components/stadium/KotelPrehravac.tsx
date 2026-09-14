"use client";

/**
 * Kotel na stránce stadionu.
 *
 * Pouští nahrané chorály klubu dokola. Původně to bylo schované na zápasový
 * den, což znamenalo, že to hráč skoro nikdy neuvidí, domácí zápas je jednou
 * za dva týdny. Teď je to vidět vždycky, když je co pustit.
 *
 * Proč to není prosté `autoplay`: prohlížeče zvuk bez zásahu uživatele
 * zablokují a `play()` skončí odmítnutým příslibem, o kterém se nikde
 * nedozvíš. Volba se proto jednou klikne, uloží do prohlížeče, a v zápasový
 * den se spuštění zkusí samo. Když ho prohlížeč odmítne, řekne se to nahlas
 * a zůstane vidět tlačítko.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { apiFetch } from "@/lib/api";

const KLIC = "stadion-kotel-zvuk";

const DRUH: Record<string, { label: string; ikona: string }> = {
  domov: { label: "Domácí", ikona: "🏡" },
  oblibenec: { label: "Miláček kotle", ikona: "⭐" },
  rival: { label: "Proti soupeři", ikona: "⚔️" },
  trener_pro: { label: "Za trenéra", ikona: "🙌" },
  trener_proti: { label: "Proti trenérovi", ikona: "✊" },
  vyhra: { label: "Vítězná", ikona: "🏆" },
  vzdor: { label: "Vzdor", ikona: "🪨" },
  vybaveni: { label: "Stížnost", ikona: "🚽" },
};

function druh(kind: string) {
  return DRUH[kind] ?? { label: kind, ikona: "📣" };
}

interface ChoralAudio {
  id: string;
  kind: string;
  text: string;
  duvod: string;
  sila: number;
  silaWord: string;
  audio: { url: string; vybrana: string } | null;
}

export function KotelPrehravac({ teamId, zapasovyDen, cizi }: {
  teamId: string;
  zapasovyDen: boolean;
  /** Náhled cizího stadionu: popisky mluví o nich, ne o nás. */
  cizi?: boolean;
}) {
  const [choraly, setChoraly] = useState<ChoralAudio[]>([]);
  const [vybranyId, setVybranyId] = useState<string | null>(null);
  const [hraje, setHraje] = useState(false);
  const [blokovano, setBlokovano] = useState(false);
  const prvek = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    let zruseno = false;
    (async () => {
      const res = await apiFetch<{ chants?: ChoralAudio[] }>(`/api/teams/${teamId}/fans/chants`)
        .catch((e) => { console.error("chorály pro stadion:", e); return null; });
      if (zruseno || !res?.chants) return;
      // Domácí chorál napřed, zbytek podle toho, jak nahlas se zpívá.
      const sNahravkou = res.chants
        .filter((ch) => ch.audio)
        .sort((a, b) => (a.kind === "domov" ? -1 : b.kind === "domov" ? 1 : b.sila - a.sila));
      setChoraly(sNahravkou);
      setVybranyId((d) => d ?? sNahravkou[0]?.id ?? null);
    })();
    return () => { zruseno = true; };
  }, [teamId]);

  const vybrany = useMemo(
    () => choraly.find((ch) => ch.id === vybranyId) ?? choraly[0] ?? null,
    [choraly, vybranyId],
  );

  useEffect(() => {
    if (!vybrany?.audio || !zapasovyDen) return;
    let chce = false;
    try {
      chce = window.localStorage.getItem(KLIC) === "1";
    } catch (e) {
      console.warn("čtení volby zvuku:", e);
    }
    if (!chce) return;
    const el = prvek.current;
    if (!el) return;
    el.play().then(() => setHraje(true)).catch((e) => {
      console.warn("prohlížeč zvuk sám nepustil:", e);
      setBlokovano(true);
    });
  }, [vybrany, zapasovyDen]);

  if (!vybrany?.audio) return null;

  const prepni = async () => {
    const el = prvek.current;
    if (!el) return;
    if (hraje) {
      el.pause();
      setHraje(false);
      try { window.localStorage.setItem(KLIC, "0"); } catch (e) { console.warn("uložení volby zvuku:", e); }
      return;
    }
    try {
      await el.play();
      setHraje(true);
      setBlokovano(false);
      try { window.localStorage.setItem(KLIC, "1"); } catch (e) { console.warn("uložení volby zvuku:", e); }
    } catch (e) {
      console.error("zvuk se nepodařilo pustit:", e);
      setBlokovano(true);
    }
  };

  const prepniChoral = (id: string) => {
    prvek.current?.pause();
    setHraje(false);
    setVybranyId(id);
  };

  const d = druh(vybrany.kind);

  return (
    <div className="card p-4 sm:p-5">
      {/* `key` na adrese: bez něj si prohlížeč po přepnutí nechá načtenou tu
          starou nahrávku a tlačítko vypadá jako mrtvé. */}
      <audio
        key={`${vybrany.id}-${vybrany.audio.vybrana}`}
        ref={prvek}
        loop
        preload="metadata"
        src={`${vybrany.audio.url}?v=${vybrany.audio.vybrana}`}
        onEnded={() => setHraje(false)}
      />

      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
        <h3 className="font-heading font-bold text-sm uppercase tracking-wide text-muted">
          {cizi ? "Co se u nich zpívá" : "Chorály kotle"}
        </h3>
        <span className="text-sm text-muted">
          {zapasovyDen ? "dnes se hraje doma" : `nahráno ${choraly.length}`}
        </span>
      </div>

      {/* Co se zrovna zpívá. Text je to hlavní, proto největší. */}
      <div className="mt-3 rounded-soft bg-gray-50 p-3">
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
          <span className="text-sm font-bold">{d.ikona} {d.label}</span>
          <span className="text-sm text-muted">{vybrany.silaWord}</span>
        </div>
        <p className="font-heading font-bold text-base mt-1.5 leading-snug break-words">
          {vybrany.text}
        </p>
        <p className="text-sm text-muted mt-1">{vybrany.duvod}</p>
      </div>

      {/* Ovládání pod obsahem, ne v něm: na mobilu se to vedle sebe mačkalo. */}
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={prepni}
          className={`px-4 py-2 rounded-soft font-heading font-bold text-sm border ${
            hraje
              ? "bg-pitch-500 text-white border-pitch-500"
              : "bg-white border-gray-200 hover:bg-gray-50"
          }`}
        >
          {hraje ? "⏸ Ztlumit" : "▶ Pustit kotel"}
        </button>
        <span className="text-sm text-muted">
          {blokovano
            ? "Prohlížeč zvuk sám nepustí, musíš kliknout."
            : hraje
              ? "Hraje dokola, dokud to nevypneš."
              : "Nahrávka běží dokola jako na tribuně."}
        </span>
      </div>

      {choraly.length > 1 && (
        <div className="mt-3 pt-3 border-t border-gray-100">
          <div className="text-sm text-muted mb-1.5">Co pustit</div>
          <div className="flex gap-2 flex-wrap">
            {choraly.map((ch) => {
              const dd = druh(ch.kind);
              return (
                <button
                  key={ch.id}
                  type="button"
                  onClick={() => prepniChoral(ch.id)}
                  className={`px-3 py-1.5 rounded-soft text-sm border ${
                    ch.id === vybrany.id
                      ? "bg-pitch-500 text-white border-pitch-500 font-bold"
                      : "bg-white border-gray-200 hover:bg-gray-50"
                  }`}
                >
                  {dd.ikona} {dd.label}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
