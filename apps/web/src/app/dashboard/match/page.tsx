"use client";

import { useState } from "react";
import { SmsRoulette, type SmsMessage } from "@/components/match/sms-roulette";
import { LiveMatch } from "@/components/match/live-match";

type MatchPhase = "sms" | "lineup" | "live" | "pub";

// Mock data
const MOCK_SMS: SmsMessage[] = [
  { playerName: "Petr Dvořák", nickname: "Prochás", status: "available", message: "Jasně, tam budu. V kolik?", avatarInitial: "P" },
  { playerName: "Martin Horák", nickname: "Dělo", status: "available", message: "Jo, jedu!", avatarInitial: "M" },
  { playerName: "Tomáš Veselý", nickname: "Veselej", status: "available", message: "Pohodička, počítej se mnou", avatarInitial: "T" },
  { playerName: "Milan Černý", nickname: "Tank", status: "unavailable", message: "Sorry šéfe, včera jsme to s klukama trochu přetáhli... 🤮", avatarInitial: "M" },
  { playerName: "Radek Sedláček", nickname: "Sedla", status: "available", message: "Jsem tam. Mám i brusle k výměně.", avatarInitial: "R" },
  { playerName: "David Kučera", nickname: "Ajťák", status: "available", message: "👍", avatarInitial: "D" },
  { playerName: "Jakub Svoboda", nickname: null, status: "available", message: "Joo, přijdu! Táta mě sveze.", avatarInitial: "J" },
  { playerName: "Ondřej Marek", nickname: "Šnek", status: "maybe", message: "Nevím, manželka má narozeniny... zkusím to", avatarInitial: "O" },
  { playerName: "Filip Jelínek", nickname: null, status: "available", message: "Ok", avatarInitial: "F" },
  { playerName: "Zdeněk Novák", nickname: "Buřtík", status: "available", message: "Budu v bráně! Snad.", avatarInitial: "Z" },
  { playerName: "Jaroslav Procházka", nickname: "Děda", status: "unavailable", message: "Kolena říkají ne. Přijdu fandit.", avatarInitial: "J" },
];

const MOCK_EVENTS = [
  { minute: 3, type: "chance", description: "Šance SK Prachatice", commentary: "Horák pálí — těsně vedle! O chlup.", isGoal: false },
  { minute: 12, type: "foul", description: "Faul", commentary: "Sedláček sekl soupeře zezadu. Rozhodčí píská.", isGoal: false },
  { minute: 18, type: "special", description: "Speciální", commentary: "Divák u lajny: 'To bych dal i já, a to mám padesát!'", isGoal: false },
  { minute: 23, type: "goal", description: "Gól SK Prachatice", commentary: "GÓÓÓL! Horák to tam napálil! Hospodský za plotem přinesl pivo pro gólmana.", isGoal: true },
  { minute: 31, type: "chance", description: "Šance soupeře", commentary: "Střela soupeře — brankář Novák chytá! Výborný zákrok!", isGoal: false },
  { minute: 38, type: "card", description: "Žlutá karta", commentary: "Žlutá karta! Veselý si to mohl odpustit.", isGoal: false },
  { minute: 45, type: "special", description: "Poločas", commentary: "Poločas! U stánku je guláš za padesátku a pivo za třicet.", isGoal: false },
  { minute: 52, type: "special", description: "Speciální", commentary: "Kučera volá na lavičku, jestli mu někdo podá vodu. Správce hřiště nese pivo.", isGoal: false },
  { minute: 58, type: "special", description: "Vyčerpání", commentary: "Marek se drží za kolena a nemůže dál. Kondice na nule.", isGoal: false },
  { minute: 63, type: "chance", description: "Šance soupeře", commentary: "Soupeř hlavičkuje — tyč! Ten zvuk se rozlehl celým hřištěm.", isGoal: false },
  { minute: 67, type: "goal", description: "Gól SK Prachatice", commentary: "Parádní akce! Svoboda si to obhodil a uklidil to k tyči!", isGoal: true },
  { minute: 74, type: "goal", description: "Gól soupeře", commentary: "Brankář Novák pustil míč pod rukama. Gól soupeře.", isGoal: true },
  { minute: 81, type: "foul", description: "Faul", commentary: "Jelínek v souboji o míč trefil všechno kromě míče.", isGoal: false },
  { minute: 88, type: "chance", description: "Šance SK Prachatice", commentary: "Svoboda pálí zpoza vápna — brankář vyráží na roh.", isGoal: false },
  { minute: 90, type: "special", description: "Konec", commentary: "Píská se konec! Rozhodčí utíká k autu — pro jistotu. SK Prachatice vítězí 2:1!", isGoal: false },
];

export default function MatchPage() {
  const [phase, setPhase] = useState<MatchPhase>("sms");
  const [homeScore, setHomeScore] = useState(0);
  const [awayScore, setAwayScore] = useState(0);

  return (
    <div className="h-[calc(100vh-4rem)] sm:h-screen flex flex-col">
      {phase === "sms" && (
        <SmsRoulette
          messages={MOCK_SMS}
          onComplete={() => setPhase("lineup")}
        />
      )}

      {phase === "lineup" && (
        <div className="flex-1 flex flex-col p-6 max-w-lg mx-auto w-full justify-center text-center">
          <h2 className="font-heading text-3xl font-bold text-pitch-500 mb-2">
            Sestava připravena
          </h2>
          <p className="text-muted mb-8">
            9 hráčů dostupných. Formace 3-3-2 (co máme to hrajeme).
          </p>

          {/* Simplified pitch view */}
          <div className="bg-pitch-500 rounded-card p-6 mb-8 aspect-[3/4] relative">
            <div className="absolute inset-0 flex flex-col items-center justify-between py-8">
              {/* FWD */}
              <div className="flex gap-8">
                <PositionDot label="Horák" />
                <PositionDot label="Svoboda" />
              </div>
              {/* MID */}
              <div className="flex gap-6">
                <PositionDot label="Veselý" />
                <PositionDot label="Kučera" />
                <PositionDot label="Jelínek" />
              </div>
              {/* DEF */}
              <div className="flex gap-6">
                <PositionDot label="Dvořák" />
                <PositionDot label="Sedláček" />
                <PositionDot label="Marek" />
              </div>
              {/* GK */}
              <PositionDot label="Novák" />
            </div>
            {/* Center line */}
            <div className="absolute left-4 right-4 top-1/2 border-t border-white/20" />
            <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-16 h-16 rounded-full border border-white/20" />
          </div>

          <div className="flex gap-3">
            <button
              onClick={() => setPhase("sms")}
              className="flex-1 py-3 rounded-card bg-gray-100 text-muted font-heading font-bold"
            >
              Zpět
            </button>
            <button
              onClick={() => setPhase("live")}
              className="flex-1 py-3 rounded-card bg-pitch-500 text-white font-heading font-bold hover:bg-pitch-400 transition-colors"
            >
              Hrát zápas!
            </button>
          </div>
        </div>
      )}

      {phase === "live" && (
        <LiveMatch
          homeTeam="SK Prachatice"
          awayTeam="Sokol Netolice"
          events={MOCK_EVENTS}
          onComplete={(h, a) => { setHomeScore(h); setAwayScore(a); setPhase("pub"); }}
        />
      )}

      {phase === "pub" && (
        <div className="flex-1 bg-amber-950 text-amber-100 p-6 flex flex-col max-w-lg mx-auto w-full">
          <h2 className="font-heading text-3xl font-bold text-amber-200 mb-1">
            Hospoda U Dvořáků
          </h2>
          <p className="text-amber-400 text-sm mb-6">Po zápase</p>

          {/* Result */}
          <div className="bg-amber-900/50 rounded-card p-5 text-center mb-6">
            <div className="font-heading font-extrabold text-4xl text-amber-100 tabular-nums">
              {homeScore} : {awayScore}
            </div>
            <div className="text-amber-400 text-sm mt-1">
              SK Prachatice vs Sokol Netolice
            </div>
            <div className="text-amber-300 font-heading font-bold mt-2">
              {homeScore > awayScore ? "Výhra!" : homeScore < awayScore ? "Prohra..." : "Remíza"}
            </div>
          </div>

          {/* Post-match events */}
          <div className="space-y-3 flex-1">
            <PubEvent
              emoji="\u{1F37A}"
              text="Burian se hádá s Konečným kvůli penaltě. Hospodský říká ať si dají ještě jedno."
            />
            <PubEvent
              emoji="\u{1F4B0}"
              text="Sponzor z autoservisu nabízí nový dres — 2000 Kč bonus za výhru."
            />
            <PubEvent
              emoji="\u{1F44B}"
              text="Chlap u baru říká, že kopal za Horní Lhotu a hledá tým..."
            />
            <PubEvent
              emoji="\u{1F3C6}"
              text="Horák zvolen hráčem zápasu. Dva góly a jedna asistence."
            />
          </div>

          <a
            href="/dashboard"
            className="w-full py-3 rounded-card bg-amber-700 text-amber-100 font-heading font-bold text-center hover:bg-amber-600 transition-colors mt-6 block"
          >
            Zpět na dashboard
          </a>
        </div>
      )}
    </div>
  );
}

function PositionDot({ label }: { label: string }) {
  return (
    <div className="flex flex-col items-center gap-1">
      <div className="w-8 h-8 rounded-full bg-white/90 flex items-center justify-center text-pitch-600 font-bold text-xs">
        {label[0]}
      </div>
      <span className="text-white/70 text-[9px]">{label}</span>
    </div>
  );
}

function PubEvent({ emoji, text }: { emoji: string; text: string }) {
  return (
    <div className="flex gap-3 items-start bg-amber-900/30 rounded-card p-3">
      <span className="text-lg">{emoji}</span>
      <p className="text-sm text-amber-200">{text}</p>
    </div>
  );
}
