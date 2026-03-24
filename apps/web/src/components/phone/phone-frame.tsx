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

  return (
    <div className="sm:flex sm:justify-center sm:items-start sm:py-6 sm:px-4 min-h-screen sm:min-h-0">
      <div className="sm:w-[380px] sm:h-[700px] sm:rounded-[2.5rem] sm:border-[6px] sm:border-gray-800 sm:shadow-2xl sm:overflow-hidden sm:relative bg-white flex flex-col min-h-screen sm:min-h-0">
        {/* Notch */}
        <div className="hidden sm:block absolute top-0 left-1/2 -translate-x-1/2 w-28 h-6 bg-gray-800 rounded-b-2xl z-20" />

        {/* Status bar (desktop only) */}
        <div className="hidden sm:flex items-center justify-between px-6 pt-1.5 pb-0.5 bg-pitch-600 text-white text-[10px] relative z-10">
          <span className="font-medium tabular-nums">{time}</span>
          <div className="flex items-center gap-1.5">
            {/* Signal bars */}
            <svg width="14" height="10" viewBox="0 0 14 10" fill="currentColor" className="opacity-80">
              <rect x="0" y="7" width="2.5" height="3" rx="0.5" />
              <rect x="3.5" y="5" width="2.5" height="5" rx="0.5" />
              <rect x="7" y="2.5" width="2.5" height="7.5" rx="0.5" />
              <rect x="10.5" y="0" width="2.5" height="10" rx="0.5" />
            </svg>
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
        <div className="hidden sm:flex justify-center pb-2 pt-1 bg-white">
          <div className="w-28 h-1 bg-gray-300 rounded-full" />
        </div>
      </div>
    </div>
  );
}
