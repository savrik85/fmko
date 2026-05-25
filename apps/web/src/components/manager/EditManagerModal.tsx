"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { apiFetch, type ManagerProfile } from "@/lib/api";
import { generateManagerFace } from "@/lib/manager-avatar";
import { Button } from "@/components/ui";

const FaceAvatar = dynamic(
  () => import("@/components/players/face-avatar").then((m) => m.FaceAvatar),
  { ssr: false, loading: () => <div style={{ width: 160, height: 192 }} className="bg-gray-100 rounded-lg animate-pulse" /> },
);

interface Props {
  manager: ManagerProfile;
  teamId: string;
  onClose: () => void;
  onSaved: (m: ManagerProfile) => void;
}

const NAME_MAX = 30;
const BIO_MAX = 300;

export function EditManagerModal({ manager, teamId, onClose, onSaved }: Props) {
  const [name, setName] = useState(manager.name);
  const [bio, setBio] = useState(manager.bio ?? "");
  const [age, setAge] = useState<string>(manager.age != null ? String(manager.age) : "");
  const [birthplace, setBirthplace] = useState(manager.birthplace ?? "");
  const [avatar, setAvatar] = useState<Record<string, unknown>>(manager.avatar);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const trimmedName = name.trim();
  const nameValid = trimmedName.length >= 1 && trimmedName.length <= NAME_MAX;
  const bioValid = bio.trim().length <= BIO_MAX;
  const ageNum = age === "" ? null : Number(age);
  const ageValid = ageNum === null || (Number.isInteger(ageNum) && ageNum >= 18 && ageNum <= 80);
  const birthplaceValid = birthplace.trim().length <= 50;
  const canSave = nameValid && bioValid && ageValid && birthplaceValid && !saving;

  const randomize = () => setAvatar(generateManagerFace());

  const save = async () => {
    if (!canSave) return;
    setSaving(true);
    setError(null);
    try {
      const updated = await apiFetch<ManagerProfile>(`/api/teams/${teamId}/manager`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: trimmedName,
          bio: bio.trim() || null,
          avatar,
          ...(ageNum !== null ? { age: ageNum } : {}),
          birthplace: birthplace.trim() || null,
        }),
      });
      onSaved(updated);
      onClose();
    } catch (e) {
      console.error("save manager profile:", e);
      setError("Uložení selhalo. Zkus to znovu.");
      setSaving(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-content" style={{ maxWidth: 480 }} onClick={(e) => e.stopPropagation()}>
        <div className="p-4 sm:p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-heading font-bold text-lg">Upravit profil trenéra</h2>
            <button onClick={onClose} className="text-muted hover:text-ink text-xl leading-none">✕</button>
          </div>

          {/* Avatar preview + randomize */}
          <div className="flex flex-col items-center gap-2">
            <div className="bg-gray-50 rounded-xl p-2">
              <FaceAvatar faceConfig={avatar} size={160} />
            </div>
            <button
              onClick={randomize}
              type="button"
              className="text-sm font-heading font-bold text-pitch-600 hover:text-pitch-700 transition-colors"
            >
              🎲 Náhodný avatar
            </button>
          </div>

          {/* Name */}
          <div>
            <label className="block text-[11px] text-muted font-heading uppercase tracking-wide mb-1">
              Jméno trenéra
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={NAME_MAX}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-pitch-500"
              placeholder="Jméno Příjmení"
            />
            <div className="mt-1 flex items-baseline justify-between text-[10px]">
              {!nameValid && trimmedName.length === 0 ? (
                <span className="text-card-red">Jméno nesmí být prázdné</span>
              ) : (
                <span className="text-muted-light">1–{NAME_MAX} znaků</span>
              )}
              <span className={`tabular-nums ${name.length > NAME_MAX - 5 ? "text-amber-600" : "text-muted-light"}`}>
                {name.length}/{NAME_MAX}
              </span>
            </div>
          </div>

          {/* Age + Birthplace — side by side */}
          <div className="flex gap-3">
            <div className="w-24 shrink-0">
              <label className="block text-[11px] text-muted font-heading uppercase tracking-wide mb-1">
                Věk
              </label>
              <input
                type="number"
                value={age}
                onChange={(e) => setAge(e.target.value)}
                min={18}
                max={80}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-pitch-500 tabular-nums"
                placeholder="40"
              />
              <div className="mt-1 text-[10px] text-muted-light">
                {ageValid ? "18–80" : <span className="text-card-red">18–80 let</span>}
              </div>
            </div>
            <div className="flex-1 min-w-0">
              <label className="block text-[11px] text-muted font-heading uppercase tracking-wide mb-1">
                Bydliště
              </label>
              <input
                type="text"
                value={birthplace}
                onChange={(e) => setBirthplace(e.target.value)}
                maxLength={50}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-pitch-500"
                placeholder="Strakonice"
              />
              <div className="mt-1 flex items-baseline justify-between text-[10px]">
                <span className="text-muted-light">max 50 znaků</span>
                <span className="tabular-nums text-muted-light">{birthplace.length}/50</span>
              </div>
            </div>
          </div>

          {/* Bio */}
          <div>
            <label className="block text-[11px] text-muted font-heading uppercase tracking-wide mb-1">
              O sobě (volitelné)
            </label>
            <textarea
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              maxLength={BIO_MAX}
              rows={4}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-pitch-500 resize-none"
              placeholder="Filozofie, motto, něco o sobě..."
            />
            <div className="mt-1 flex items-baseline justify-between text-[10px]">
              <span className="text-muted-light">max {BIO_MAX} znaků</span>
              <span className={`tabular-nums ${bio.length > BIO_MAX - 30 ? "text-amber-600" : "text-muted-light"}`}>
                {bio.length}/{BIO_MAX}
              </span>
            </div>
          </div>

          {error && (
            <div className="text-sm text-card-red bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              {error}
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-2 justify-end pt-2 border-t border-gray-100">
            <Button variant="ghost" onClick={onClose} disabled={saving}>Zrušit</Button>
            <Button variant="primary" onClick={save} disabled={!canSave}>
              {saving ? "Ukládám..." : "Uložit"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
