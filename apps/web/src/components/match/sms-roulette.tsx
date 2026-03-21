"use client";

import { useState, useEffect } from "react";

export type SmsStatus = "available" | "unavailable" | "maybe";

export interface SmsMessage {
  playerName: string;
  nickname: string | null;
  status: SmsStatus;
  message: string;
  avatarInitial: string;
}

interface Props {
  messages: SmsMessage[];
  onComplete: (available: SmsMessage[]) => void;
}

export function SmsRoulette({ messages, onComplete }: Props) {
  const [revealedCount, setRevealedCount] = useState(0);
  const [skipped, setSkipped] = useState(false);

  const revealed = skipped ? messages : messages.slice(0, revealedCount);
  const isComplete = revealed.length === messages.length;

  useEffect(() => {
    if (skipped || isComplete) return;
    const timer = setTimeout(() => {
      setRevealedCount((c) => c + 1);
    }, 800 + Math.random() * 600);
    return () => clearTimeout(timer);
  }, [revealedCount, skipped, isComplete]);

  const statusColor: Record<SmsStatus, string> = {
    available: "bg-pitch-500",
    unavailable: "bg-card-red",
    maybe: "bg-card-yellow",
  };

  const statusIcon: Record<SmsStatus, string> = {
    available: "\u2705",
    unavailable: "\u274C",
    maybe: "\u{1F937}",
  };

  const availableCount = revealed.filter((m) => m.status === "available").length;
  const unavailableCount = revealed.filter((m) => m.status === "unavailable").length;

  return (
    <div className="flex flex-col h-full">
      {/* Phone header */}
      <div className="bg-gray-800 text-white px-5 py-3 flex justify-between items-center rounded-t-card">
        <div>
          <div className="font-heading font-bold">Zápasová skupina</div>
          <div className="text-xs text-gray-400">{messages.length} hráčů</div>
        </div>
        <div className="flex gap-3 text-sm">
          <span className="text-pitch-400">{availableCount} \u2705</span>
          <span className="text-card-red">{unavailableCount} \u274C</span>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 bg-gray-900 overflow-y-auto px-4 py-3 space-y-2.5">
        {revealed.map((msg, i) => (
          <div
            key={i}
            className="flex gap-3 items-start animate-[slideIn_0.3s_ease-out]"
          >
            {/* Avatar */}
            <div
              className={`w-9 h-9 rounded-full shrink-0 flex items-center justify-center text-white font-bold text-sm ${statusColor[msg.status]}`}
            >
              {msg.avatarInitial}
            </div>

            {/* Bubble */}
            <div className="flex-1">
              <div className="flex items-baseline gap-2 mb-0.5">
                <span className="text-gray-300 text-sm font-medium">
                  {msg.nickname ? `${msg.playerName} "${msg.nickname}"` : msg.playerName}
                </span>
                <span className="text-xs">{statusIcon[msg.status]}</span>
              </div>
              <div className="bg-gray-700 text-gray-100 rounded-xl rounded-tl-sm px-3 py-2 text-sm inline-block max-w-[85%]">
                {msg.message}
              </div>
            </div>
          </div>
        ))}

        {!isComplete && !skipped && (
          <div className="flex gap-3 items-center py-2">
            <div className="w-9 h-9 rounded-full bg-gray-700 shrink-0 flex items-center justify-center">
              <span className="flex gap-1">
                <span className="w-1.5 h-1.5 bg-gray-500 rounded-full animate-bounce" />
                <span className="w-1.5 h-1.5 bg-gray-500 rounded-full animate-bounce [animation-delay:0.1s]" />
                <span className="w-1.5 h-1.5 bg-gray-500 rounded-full animate-bounce [animation-delay:0.2s]" />
              </span>
            </div>
            <span className="text-gray-500 text-sm">Píše...</span>
          </div>
        )}
      </div>

      {/* Bottom actions */}
      <div className="bg-gray-800 px-4 py-3 flex gap-3">
        {!isComplete && !skipped ? (
          <button
            onClick={() => setSkipped(true)}
            className="flex-1 py-3 rounded-card bg-gray-700 text-gray-300 font-heading font-bold text-sm hover:bg-gray-600 transition-colors"
          >
            Přeskočit animaci
          </button>
        ) : (
          <button
            onClick={() => onComplete(revealed.filter((m) => m.status === "available"))}
            className="flex-1 py-3 rounded-card bg-pitch-500 text-white font-heading font-bold hover:bg-pitch-400 transition-colors"
          >
            Sestavit tým ({availableCount} dostupných)
          </button>
        )}
      </div>
    </div>
  );
}
