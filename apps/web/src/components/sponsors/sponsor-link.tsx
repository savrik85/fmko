import Link from "next/link";

/** Jméno sponzora jako odkaz na jeho stránku (sponzor mimo okresní seznam odkaz nemá). */
export function SponsorLink({ id, name, className }: { id: number | null | undefined; name: string; className?: string }) {
  if (!id) return <span className={className}>{name}</span>;
  return <Link href={`/sponzor/${id}`} className={`${className ?? ""} hover:text-pitch-600 hover:underline`}>{name}</Link>;
}
