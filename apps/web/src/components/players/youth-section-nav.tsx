"use client";

/**
 * Přepínač sekce Mládež nahoře na stránce: U21 (dorost) a Akademie (žáci 11–14 let).
 * V menu je jen jedna položka Mládež, obě části se přepínají tady.
 */

import Link from "next/link";
import { usePathname } from "next/navigation";
import { choiceClass } from "@/components/ui/choice";

const SECTIONS = [
  { href: "/u21", label: "U21", note: "dorost, hraje svoji ligu" },
  { href: "/akademie", label: "Akademie", note: "žáci 11–14 let" },
];

export function YouthSectionNav() {
  const pathname = usePathname();
  return (
    <nav aria-label="Mládež" className="grid grid-cols-2 gap-2">
      {SECTIONS.map((s) => {
        const active = pathname.startsWith(s.href);
        return (
          <Link
            key={s.href}
            href={s.href}
            aria-current={active ? "page" : undefined}
            className={`px-3 py-2.5 min-h-11 text-center ${choiceClass(active)}`}
          >
            <span className="block font-heading font-bold text-sm">{s.label}</span>
            <span className={`block text-xs ${active ? "text-pitch-600/80" : "text-muted"}`}>{s.note}</span>
          </Link>
        );
      })}
    </nav>
  );
}
