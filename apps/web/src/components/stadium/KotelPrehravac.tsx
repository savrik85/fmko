"use client";

/**
 * Kotel na stránce stadionu.
 *
 * V zápasovém režimu pouští dokola nahraný chorál klubu, ať to při pohledu na
 * hřiště nezní jako prázdný areál.
 *
 * Proč to není prosté `autoplay`: prohlížeče zvuk bez zásahu uživatele
 * zablokují a `play()` skončí odmítnutým příslibem, o kterém se nikde nedozvíš.
 * Takže se volba jednou klikne, uloží do prohlížeče, a při dalších návštěvách
 * se spuštění zkusí. Když ho prohlížeč odmítne, zůstane vidět tlačítko.
 */

import { useEffect, useRef, useState } from "react";
import { apiFetch } from "@/lib/api";

const KLIC = "stadion-kotel-zvuk";

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
  const [choral, setChoral] = useState<ChoralAudio | null>(null);
  const [hraje, setHraje] = useState(false);
  const [blokovano, setBlokovano] = useState(false);
  const prvek = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    let zruseno = false;
    (async () => {
      const res = await apiFetch<{ chants?: ChoralAudio[] }>(`/api/teams/${teamId}/fans/chants`)
        .catch((e) => { console.error("chorály pro stadion:", e); return null; });
      if (zruseno || !res?.chants) return;
      // Domácí chorál má přednost, jinak ten nejsilnější s nahrávkou.
      const sNahravkou = res.chants.filter((ch) => ch.audio);
      const vybrany = sNahravkou.find((ch) => ch.kind === "domov")
        ?? sNahravkou.sort((a, b) => b.sila - a.sila)[0]
        ?? null;
      setChoral(vybrany);
    })();
    return () => { zruseno = true; };
  }, [teamId]);

  // Uživatel to zapnul někdy dřív, tak se spuštění zkusí samo. Odmítnutí není
  // chyba, jen to znamená, že si prohlížeč vyžádá kliknutí.
  useEffect(() => {
    if (!choral?.audio || !zapasovyDen) return;
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
  }, [choral, zapasovyDen]);

  if (!zapasovyDen || !choral?.audio) return null;

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

  return (
    <div className="card p-3 sm:p-4 flex items-center gap-3 flex-wrap">
      <audio
        ref={prvek}
        loop
        preload="none"
        src={`${choral.audio.url}?v=${choral.audio.vybrana}`}
      />
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
        <p className="text-sm font-bold truncate">{choral.text}</p>
        <p className="text-sm text-muted">
          {blokovano
            ? "Prohlížeč zvuk sám nepustí, musíš kliknout."
            : "Dnes se hraje doma, tak ať je to slyšet."}
        </p>
      </div>
    </div>
  );
}
