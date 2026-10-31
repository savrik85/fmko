"use client";

import { useEffect, useState } from "react";
import { clientOnly } from "@/components/client-only";
import { apiFetch, type ManagerProfile } from "@/lib/api";
import { generateManagerFace } from "@/lib/manager-avatar";
import { Button, Sheet, IconButton } from "@/components/ui";

const FaceAvatar = clientOnly(
  () => import("@/components/players/face-avatar").then((m) => m.FaceAvatar),
  <div style={{ width: 160, height: 192 }} className="bg-gray-100 rounded-soft animate-pulse" />,
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
  // Bydliště se vybírá ze seznamu obcí, aby ho šlo spárovat s profilem obce.
  const [place, setPlace] = useState<{ id: string | null; name: string }>({ id: manager.birthplaceVillageId ?? null, name: manager.birthplace ?? "" });
  const placeChanged = place.id !== (manager.birthplaceVillageId ?? null) || (!place.id && !place.name && !!manager.birthplace);
  const [avatar, setAvatar] = useState<Record<string, unknown>>(manager.avatar);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const trimmedName = name.trim();
  const nameValid = trimmedName.length >= 1 && trimmedName.length <= NAME_MAX;
  const bioValid = bio.trim().length <= BIO_MAX;
  const ageNum = age === "" ? null : Number(age);
  const ageValid = ageNum === null || (Number.isInteger(ageNum) && ageNum >= 18 && ageNum <= 80);
  const canSave = nameValid && bioValid && ageValid && !saving;

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
          ...(placeChanged ? { birthplaceVillageId: place.id } : {}),
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
    <Sheet open onClose={onClose} maxWidth="480px" title="Upravit profil trenéra" className="flex flex-col">
        {/* Sticky header */}
        <div className="flex items-center justify-between px-4 py-3 sm:px-6 sm:py-4 border-b border-gray-100 bg-paper">
          <h2 className="font-heading font-bold text-base sm:text-lg">Upravit profil trenéra</h2>
          <IconButton label="Zavřít" onClick={onClose} className="-mr-2">✕</IconButton>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto px-4 py-3 sm:px-6 sm:py-4 space-y-3">
          {/* Avatar preview + randomize — kompaktnejsi na mobile */}
          <div className="flex flex-col items-center gap-1.5">
            <div className="bg-gray-50 rounded-xl p-1.5 sm:p-2">
              <FaceAvatar faceConfig={avatar} size={120} />
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
            <label className="block text-micro text-muted font-heading uppercase tracking-wide mb-1">
              Jméno trenéra
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={NAME_MAX}
              className="w-full px-3 py-2 border border-gray-200 rounded-soft text-sm focus:outline-none focus:border-pitch-500"
              placeholder="Jméno Příjmení"
            />
            <div className="mt-1 flex items-baseline justify-between text-micro">
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
              <label className="block text-micro text-muted font-heading uppercase tracking-wide mb-1">
                Věk
              </label>
              <input
                type="number"
                value={age}
                onChange={(e) => setAge(e.target.value)}
                min={18}
                max={80}
                className="w-full px-3 py-2 border border-gray-200 rounded-soft text-sm focus:outline-none focus:border-pitch-500 tabular-nums"
                placeholder="40"
              />
              <div className="mt-1 text-micro text-muted-light">
                {ageValid ? "18–80" : <span className="text-card-red">18–80 let</span>}
              </div>
            </div>
            <div className="flex-1 min-w-0">
              <label className="block text-micro text-muted font-heading uppercase tracking-wide mb-1">
                Bydliště
              </label>
              <VillagePicker value={place} onChange={setPlace} />
            </div>
          </div>

          {/* Bio */}
          <div>
            <label className="block text-micro text-muted font-heading uppercase tracking-wide mb-1">
              O sobě (volitelné)
            </label>
            <textarea
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              maxLength={BIO_MAX}
              rows={4}
              className="w-full px-3 py-2 border border-gray-200 rounded-soft text-sm focus:outline-none focus:border-pitch-500 resize-none"
              placeholder="Filozofie, motto, něco o sobě..."
            />
            <div className="mt-1 flex items-baseline justify-between text-micro">
              <span className="text-muted-light">max {BIO_MAX} znaků</span>
              <span className={`tabular-nums ${bio.length > BIO_MAX - 30 ? "text-amber-600" : "text-muted-light"}`}>
                {bio.length}/{BIO_MAX}
              </span>
            </div>
          </div>

          {error && (
            <div className="text-sm text-card-red bg-red-50 border border-red-200 rounded-soft px-3 py-2">
              {error}
            </div>
          )}
        </div>

        {/* Sticky footer s tlacitky — vzdy viditelny i kdyz user scrolluje */}
        <div
          className="flex gap-2 px-4 py-3 sm:px-6 sm:py-4 border-t border-gray-100 bg-paper"
          style={{ paddingBottom: "calc(0.75rem + env(safe-area-inset-bottom, 0px))" }}
        >
          <Button variant="ghost" onClick={onClose} disabled={saving} className="flex-1 sm:flex-none">Zrušit</Button>
          <Button variant="primary" onClick={save} disabled={!canSave} className="flex-1 sm:flex-none">
            {saving ? "Ukládám..." : "Uložit"}
          </Button>
        </div>
    </Sheet>
  );
}

interface VillageOption { id: string; name: string; district: string }

/** Výběr obce ze hry: napíšeš začátek názvu a vybereš ze seznamu. */
function VillagePicker({ value, onChange }: { value: { id: string | null; name: string }; onChange: (v: { id: string | null; name: string }) => void }) {
  const [query, setQuery] = useState("");
  const [options, setOptions] = useState<VillageOption[]>([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) { setOptions([]); return; }
    const timer = setTimeout(() => {
      apiFetch<VillageOption[]>(`/api/villages?search=${encodeURIComponent(q)}`)
        .then((rows) => setOptions(rows.slice(0, 8)))
        .catch((e) => console.error("Hledání obce se nezdařilo:", e));
    }, 250);
    return () => clearTimeout(timer);
  }, [query]);

  if (value.id && !open) {
    return (
      <div className="flex items-center gap-2 min-h-[38px] px-3 border border-gray-200 rounded-soft text-sm">
        <span className="flex-1 min-w-0 truncate font-heading font-bold">{value.name}</span>
        <button type="button" onClick={() => { setOpen(true); setQuery(""); }} className="text-micro text-pitch-700 hover:text-pitch-500">Změnit</button>
        <button type="button" onClick={() => onChange({ id: null, name: "" })} className="text-micro text-muted hover:text-card-red" aria-label="Smazat bydliště">×</button>
      </div>
    );
  }

  return (
    <div className="relative">
      <input
        type="search"
        value={query}
        onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        className="w-full px-3 py-2 border border-gray-200 rounded-soft text-sm focus:outline-none focus:border-pitch-500"
        placeholder={value.name ? `${value.name} (vyber ze seznamu)` : "Začni psát obec"}
        aria-label="Bydliště"
        autoComplete="off"
      />
      {open && options.length > 0 && (
        <ul className="absolute z-10 mt-1 w-full max-h-56 overflow-auto rounded-soft border border-gray-200 bg-white shadow-lg">
          {options.map((o) => (
            <li key={o.id}>
              <button
                type="button"
                onClick={() => { onChange({ id: o.id, name: o.name }); setOpen(false); setQuery(""); }}
                className="w-full text-left px-3 py-2 text-sm hover:bg-pitch-50"
              >
                <span className="font-heading font-bold">{o.name}</span> <span className="text-muted">· {o.district}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="mt-1 text-micro text-muted-light">
        {value.name && !value.id ? "Teď to je jen text. Vyber obec ze seznamu, ať je vidět i v profilu obce." : "Obec ze hry"}
      </div>
    </div>
  );
}
