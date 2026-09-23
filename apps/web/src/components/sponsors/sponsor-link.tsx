import Link from "next/link";

/**
 * Jméno sponzora jako odkaz na jeho stránku (sponzor mimo okresní seznam odkaz nemá).
 * `hoverClassName` nahradí výchozí hover styl celý (ne jen doplní) — na tmavém pozadí
 * (telefon) by se `hover:text-pitch-600` proti `hover:text-white` mohlo v generovaném
 * CSS prohodit podle pořadí tříd napříč projektem, ne podle pořadí v JSX.
 */
export function SponsorLink(
  { id, name, className, hoverClassName = "hover:text-pitch-600 hover:underline" }:
  { id: number | null | undefined; name: string; className?: string; hoverClassName?: string },
) {
  if (!id) return <span className={className}>{name}</span>;
  return <Link href={`/sponzor/${id}`} className={`${className ?? ""} ${hoverClassName}`}>{name}</Link>;
}
