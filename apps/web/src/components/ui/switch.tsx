"use client";

/**
 * Vypínač (zapnuto / vypnuto). Na dotyku má tlačítko globálně 44 px na výšku,
 * proto je kreslená dráha uvnitř a tlačítko kolem ní je jen průhledná plocha na klepnutí.
 */
export function Switch({ checked, onChange, label, disabled }: {
  checked: boolean;
  onChange: (next: boolean) => void;
  /** Pro čtečku: co vypínač ovládá. */
  label: string;
  disabled?: boolean;
}) {
  return (
    <button type="button" role="switch" aria-checked={checked} aria-label={label} disabled={disabled}
      onClick={() => onChange(!checked)}
      className="shrink-0 inline-flex items-center justify-center min-h-[44px] disabled:opacity-50">
      <span className={`relative inline-flex h-7 w-12 items-center rounded-full transition-colors ${checked ? "bg-pitch-500" : "bg-gray-300"}`}>
        <span className={`inline-block h-5 w-5 rounded-full bg-white shadow-sm transition-transform ${checked ? "translate-x-6" : "translate-x-1"}`} />
      </span>
    </button>
  );
}
