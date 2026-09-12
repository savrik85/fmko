"use client";

/**
 * Kotel na stránce stadionu.
 *
 * Pouští nahrané chorály klubu. Původně to bylo schované na zápasový den, což
 * znamenalo, že to hráč skoro nikdy neuvidí — domácí zápas je jednou za dva
 * týdny. Teď je to vidět vždycky, když je co pustit, a zápasový den to jen
 * jinak popíše.
 *
 * Proč to není prosté `autoplay`: prohlížeče zvuk bez zásahu uživatele
 * zablokují a `play()` skončí odmítnutým příslibem, o kterém se nikde nedozvíš.
 * Volba se proto jednou klikne, uloží do prohlížeče, a v zápasový den se
 * spuštění zkusí samo. Když ho prohlížeč odmítne, zůstane vidět tlačítko.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { apiFetch } from "@/lib/api";

const KLIC = "stadion-kotel-zvuk";

const DRUH_LABEL: Record<string, string> = {
  domov: "Domácí",
  oblibenec: "Miláček kotle",
  rival: "Proti soupeři",
  trener_pro: "Za trenéra",
  trener_proti: "Proti trenérovi",
  vyhra: "Vítězná",
  vzdor: "Vzdor",
  vybaveni: "Stížnost",
};

interface ChoralAudio {
  id: string;
  kind: string;
  text: string;
  sila: number;
  audio: { url: string; vybrana: string } | null;
}

export function KotelPrehravac({ teamId, zapasovyDen }: {
  teamId: string;
  zapasovyDen: boolean;
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

  // V zápasový den se spuštění zkusí samo, pokud to hráč někdy dřív zapnul.
  // Odmítnutí není chyba, jen to znamená, že si prohlížeč vyžádá kliknutí.
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

  return (
    <div className="card p-3 sm:p-4 space-y-3">
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

      <div className="flex items-center gap-3 flex-wrap">
        <button
          type="button"
          onClick={prepni}
          className={`px-3 py-2 rounded font-bold text-sm border ${
            hraje ? "bg-pitch-500 text-white border-pitch-500" : "border-line hover:bg-parchment"
          }`}
        >
          {hraje ? "⏸ Ztlumit kotel" : "▶ Pustit kotel"}
        </button>
        <div className="min-w-0">
          <p className="text-sm font-bold">{vybrany.text}</p>
          <p className="text-sm text-muted">
            {blokovano
              ? "Prohlížeč zvuk sám nepustí, musíš kliknout."
              : zapasovyDen
                ? "Dnes se hraje doma, tak ať je to slyšet."
                : "Takhle to u vás zní, když se hraje."}
          </p>
        </div>
      </div>

      {choraly.length > 1 && (
        <div className="flex gap-2 flex-wrap">
          {choraly.map((ch) => (
            <button
              key={ch.id}
              type="button"
              onClick={() => prepniChoral(ch.id)}
              className={`px-2.5 py-1.5 rounded text-sm border ${
                ch.id === vybrany.id
                  ? "bg-pitch-500 text-white border-pitch-500 font-bold"
                  : "border-line hover:bg-parchment"
              }`}
            >
              {DRUH_LABEL[ch.kind] ?? ch.kind}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
