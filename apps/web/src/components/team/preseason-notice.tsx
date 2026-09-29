"use client";

import { useTeam } from "@/context/team-context";

/** „05. 10." — den a měsíc posledního kola v pražském čase. */
function formatDay(iso: string): string | null {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return new Intl.DateTimeFormat("cs-CZ", { day: "2-digit", month: "2-digit", timeZone: "Europe/Prague" }).format(d);
}

/**
 * Hláška pro klub v lize bez zápasů. Liga vznikla, když už ostatní soutěže hrály,
 * a rozpis dostane s novou sezónou. Bez ní stránky tvrdily jen „žádný zápas“.
 */
export function PreseasonNotice({ className = "" }: { className?: string }) {
  const { preseason } = useTeam();
  if (!preseason) return null;
  const day = preseason.startsAfter ? formatDay(preseason.startsAfter) : null;
  return (
    <div className={`card p-4 ${className}`} role="status">
      <div className="font-heading font-bold text-base">Přípravné období</div>
      <p className="text-sm mt-1">
        Soutěž začne s novou sezónou, hned jak ostatní ligy dohrají poslední kolo{day ? ` (${day})` : ""}.
        Do té doby můžeš trénovat a skládat kádr.
      </p>
    </div>
  );
}
