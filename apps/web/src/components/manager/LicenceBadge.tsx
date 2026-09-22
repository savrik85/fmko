import { licenceLabel } from "@okresni-masina/shared";

/**
 * Trenérská licence jako štítek. Bez licence se ukazuje jen tam, kde to dává
 * smysl (vlastní profil, žebříček) — `showNone`.
 */
export function LicenceBadge({ level, showNone = false, className = "" }: { level: number; showNone?: boolean; className?: string }) {
  if (level <= 0 && !showNone) return null;
  const tone = level >= 3
    ? "bg-amber-50 text-amber-800 border-amber-300"
    : level >= 1
      ? "bg-pitch-50 text-pitch-700 border-pitch-200"
      : "bg-surface text-muted border-gray-200";
  return (
    <span className={`inline-flex items-center gap-1 text-sm font-heading font-bold px-2 py-0.5 rounded-full border whitespace-nowrap ${tone} ${className}`}
      title="Trenérská licence">
      🎓 {licenceLabel(level)}
    </span>
  );
}
