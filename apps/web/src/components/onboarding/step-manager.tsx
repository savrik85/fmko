"use client";

import { useState, useCallback } from "react";
import { FaceAvatar } from "@/components/players/face-avatar";
import type { ManagerBackstory } from "@okresni-masina/shared";

const BACKSTORIES: Array<{
  key: ManagerBackstory;
  label: string;
  description: string;
  icon: string;
  hint: string;
}> = [
  { key: "byvaly_hrac", label: "Bývalý hráč", description: "Hrál tu jako mladý, vrací se jako trenér", icon: "\u{26BD}", hint: "Starší hráči ti věří od začátku" },
  { key: "mistni_ucitel", label: "Místní učitel", description: "Učí na místní škole, zná každou rodinu", icon: "\u{1F4DA}", hint: "Dobrý vztah s celým kádrem" },
  { key: "pristehovalec", label: "Přistěhovalec", description: "Nikdo tě tu nezná, musíš si důvěru vybudovat", icon: "\u{1F697}", hint: "Těžký start, ale disciplinovaný tým" },
  { key: "syn_trenera", label: "Syn předchozího trenéra", description: "Otec tu trénoval 20 let, teď předává", icon: "\u{1F3C6}", hint: "Mladí nadšení, staří skeptičtí" },
  { key: "hospodsky", label: "Hospodský", description: "Vlastníš místní hospodu, platíš pivo po zápase", icon: "\u{1F37A}", hint: "Oblíbený u kluků co rádi zajdou" },
];

function generateManagerFace(): Record<string, unknown> {
  const r = () => Math.random();
  const pick = <T,>(arr: T[]): T => arr[Math.floor(r() * arr.length)];

  const skinColors = ["#f2d6cb", "#ddb7a0", "#e8c4a0", "#f5d5c0", "#d4a882"];
  const hairColors = ["#3b2214", "#5b3a1a", "#8b6e3e", "#8e8e8e", "#b0b0b0"];
  const headIds = ["head1", "head3", "head6", "head8", "head9", "head10", "head11", "head13"];
  const eyeIds = ["eye1", "eye3", "eye6", "eye9", "eye11", "eye13"];
  const noseIds = ["nose1", "nose2", "nose6", "nose9", "nose13", "honker"];
  const mouthIds = ["mouth", "mouth2", "mouth3", "smile3", "straight", "closed"];
  const hairIds = ["short-fade", "crop-fade2", "spike4", "short-bald"];
  const earIds = ["ear1", "ear2", "ear3"];
  const eyebrowIds = ["eyebrow2", "eyebrow3", "eyebrow7", "eyebrow10", "eyebrow14"];

  const skinColor = pick(skinColors);
  const bald = r() < 0.35;

  return {
    fatness: 0.3 + r() * 0.35,
    teamColors: ["#555555", "#FFFFFF", "#333333"],
    hairBg: { id: "none" },
    body: { id: pick(["body", "body2", "body3"]), color: skinColor, size: 0.95 + r() * 0.1 },
    jersey: { id: "jersey" },
    ear: { id: pick(earIds), size: 0.6 + r() * 0.4 },
    head: { id: pick(headIds), shave: "rgba(0,0,0,0)", fatness: 0.3 + r() * 0.3 },
    eyeLine: { id: pick(["line1", "line2", "line3"]) },
    smileLine: { id: pick(["line1", "line2"]), size: 0.9 + r() * 0.3 },
    miscLine: { id: "none" },
    facialHair: { id: r() < 0.4 ? pick(["goatee3", "goatee4", "fullgoatee2"]) : "none" },
    eye: { id: pick(eyeIds), angle: -3 + r() * 6 },
    eyebrow: { id: pick(eyebrowIds), angle: -3 + r() * 6 },
    hair: { id: bald ? "short-bald" : pick(hairIds), color: pick(hairColors), flip: r() < 0.5 },
    mouth: { id: pick(mouthIds), flip: r() < 0.5 },
    nose: { id: pick(noseIds), flip: r() < 0.5, size: 0.7 + r() * 0.5 },
    glasses: { id: r() < 0.15 ? "glasses1" : "none" },
    accessories: { id: "none" },
  };
}

interface Props {
  villageName: string;
  initialName: string;
  onBack: () => void;
  onSubmit: (name: string, backstory: ManagerBackstory, avatar: Record<string, unknown>) => void;
}

export function StepManager({ villageName, initialName, onBack, onSubmit }: Props) {
  const [name, setName] = useState(initialName);
  const [backstory, setBackstory] = useState<ManagerBackstory | null>(null);
  const [avatar, setAvatar] = useState<Record<string, unknown>>(() => generateManagerFace());

  const randomize = useCallback(() => setAvatar(generateManagerFace()), []);

  return (
    <div className="flex-1 p-5 sm:p-8 w-full max-w-4xl mx-auto">
      <button onClick={onBack} className="btn btn-ghost btn-sm mb-4 -ml-2">&#8592; Zpět</button>

      <div className="mb-6">
        <p className="text-label mb-2">Krok 2 ze 4</p>
        <h2 className="text-h1 text-ink">Kdo jsi?</h2>
        <p className="text-muted mt-1">Zvol si svůj příběh v {villageName}</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_220px] gap-6">
        {/* Left — name + backstory selection */}
        <div className="space-y-6">
          {/* Name input */}
          <div>
            <label className="input-label">Jméno trenéra</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Jak ti říkají?"
              maxLength={30}
              className="input"
            />
          </div>

          {/* Backstory cards */}
          <div>
            <p className="text-label mb-3">Tvůj příběh</p>
            <div className="space-y-2">
              {BACKSTORIES.map((bs) => {
                const selected = backstory === bs.key;
                return (
                  <button
                    key={bs.key}
                    onClick={() => setBackstory(bs.key)}
                    className={`w-full p-4 rounded-xl text-left transition-all border-2 flex items-start gap-3 ${
                      selected
                        ? "border-pitch-500 bg-pitch-500/5"
                        : "border-transparent bg-surface hover:border-pitch-500/20"
                    }`}
                  >
                    <span className="text-2xl mt-0.5">{bs.icon}</span>
                    <div className="flex-1">
                      <div className="font-heading font-bold text-base">{bs.label}</div>
                      <div className="text-sm text-muted mt-0.5">{bs.description}</div>
                      <div className="text-xs text-pitch-500 font-medium mt-1">{bs.hint}</div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Right — avatar preview */}
        <div className="lg:sticky lg:top-8 self-start">
          <div className="card p-6 text-center">
            <div className="flex justify-center mb-3">
              <div className="bg-gray-100 rounded-xl p-2">
                <FaceAvatar faceConfig={avatar} size={100} />
              </div>
            </div>
            <div className="font-heading font-bold text-lg">{name || "Trenér"}</div>
            {backstory && (
              <div className="text-sm text-muted mt-1">{BACKSTORIES.find((b) => b.key === backstory)?.label}</div>
            )}
            <button
              onClick={randomize}
              className="btn btn-ghost btn-sm mt-3 mx-auto"
            >
              &#127922; Náhodný vzhled
            </button>
          </div>

          <button
            onClick={() => backstory && name.trim() && onSubmit(name.trim(), backstory, avatar)}
            disabled={!backstory || !name.trim()}
            className="btn btn-primary btn-lg w-full mt-4"
          >
            Pokračovat
          </button>
        </div>
      </div>
    </div>
  );
}
