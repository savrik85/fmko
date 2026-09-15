"use client";

import { useState, useEffect } from "react";

/** Phone-shaped container — on desktop renders as a phone mockup, on mobile goes full-screen */
export function PhoneFrame({ children }: { children: React.ReactNode }) {
  const [time, setTime] = useState("");

  useEffect(() => {
    const update = () => setTime(new Date().toLocaleTimeString("cs", { hour: "2-digit", minute: "2-digit" }));
    update();
    const interval = setInterval(update, 30000);
    return () => clearInterval(interval);
  }, []);

  // Telefon vypadá jako telefon i na mobilu.
  //
  // Dřív se všechna „telefonní" omáčka (rámeček, výřez, čárka domů) vypínala
  // přes `sm:` a na mobilu zbyl holý seznam přes celou šířku. Logika za tím
  // byla, že na telefonu už telefon nepotřebuješ. Jenže tohle je herní
  // rekvizita, ne responzivní stránka: má vypadat jako mobil, který držíš
  // ve hře. Na malém displeji je proto rámeček tenčí a rohy menší, ať se
  // neukusuje z obsahu.
  return (
    <div className="flex justify-center items-start p-2 sm:py-6 sm:px-4 h-full sm:h-auto">
      <div className="w-full sm:w-[380px] h-full sm:h-[700px] rounded-[1.75rem] sm:rounded-[2.5rem] border-4 sm:border-[6px] border-gray-800 shadow-xl sm:shadow-2xl overflow-hidden relative bg-white flex flex-col">
        {/* Notch */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-24 sm:w-28 h-5 sm:h-6 bg-gray-800 rounded-b-2xl z-20" />

        {/* Stavový řádek. Na mobilu taky: bez něj to nepůsobí jako telefon,
            ale jako obyčejná stránka se seznamem.
            ŽÁDNÉ odsazení o safe area. Výřez displeje řeší horní lišta
            aplikace nad tímhle; když jsem ho přidal i sem, naskočil na iPhonu
            uprostřed stránky tlustý prázdný zelený pruh o 47 px. */}
        <div className="flex shrink-0 items-center justify-between px-6 pt-1.5 pb-0.5 bg-pitch-600 text-white text-sm relative z-10">
          <span className="font-medium tabular-nums">{time}</span>
          <div className="flex items-center gap-1.5">
            {/* Signal bars */}
            <svg width="14" height="10" viewBox="0 0 14 10" fill="currentColor" className="opacity-80">
              <rect x="0" y="7" width="2.5" height="3" rx="0.5" />
              <rect x="3.5" y="5" width="2.5" height="5" rx="0.5" />
              <rect x="7" y="2.5" width="2.5" height="7.5" rx="0.5" />
              <rect x="10.5" y="0" width="2.5" height="10" rx="0.5" />
            </svg>
            {/* Datová síť — na vsi se přes ni posílá iMessage, SMS jdou přes operátora */}
            <span className="font-medium tracking-tight opacity-80">4G</span>
            {/* Battery */}
            <svg width="18" height="10" viewBox="0 0 18 10" fill="currentColor" className="opacity-80">
              <rect x="0" y="1" width="15" height="8" rx="1.5" stroke="currentColor" strokeWidth="1" fill="none" />
              <rect x="1.5" y="2.5" width="10" height="5" rx="0.5" />
              <rect x="15.5" y="3" width="1.5" height="4" rx="0.5" />
            </svg>
          </div>
        </div>

        {/* Screen content */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {children}
        </div>

        {/* Home bar */}
        <div className="flex shrink-0 justify-center pb-2 pt-1 bg-white">
          <div className="w-28 h-1 bg-gray-300 rounded-full" />
        </div>
      </div>
    </div>
  );
}
