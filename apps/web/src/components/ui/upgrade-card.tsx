import type { ReactNode } from "react";

/**
 * Karta věci, kterou klub vylepšuje po úrovních: zázemí stadionu, vybavení.
 * Hlavička (ikona, název, popis, puntíky úrovně) a pod ní řádky akcí
 * (`UpgradeAction`). Mřížka karet je `UpgradeGrid`.
 *
 * Do 2026-11-18 měl každý z obou seznamů vlastní vzhled: zázemí stadionu karty
 * v mřížce, vybavení řádky pod sebou v jedné kartě.
 */
export function UpgradeGrid({ children }: { children: ReactNode }) {
  return <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">{children}</div>;
}

export function LevelDots({ level, max = 3 }: { level: number; max?: number }) {
  return (
    <span className="flex gap-1 shrink-0" aria-label={`Úroveň ${level} z ${max}`} role="img">
      {Array.from({ length: max }, (_, i) => i + 1).map((l) => (
        <span key={l} className={`w-3 h-3 rounded-full ${l <= level ? "bg-pitch-400" : "bg-gray-200"}`} />
      ))}
    </span>
  );
}

export function UpgradeCard({ icon, title, description, level, maxLevel = 3, children }: {
  icon: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  level: number;
  maxLevel?: number;
  children?: ReactNode;
}) {
  return (
    <div className="card p-4 flex flex-col gap-3">
      <div className="flex items-center gap-2.5">
        <span className="text-2xl shrink-0" aria-hidden>{icon}</span>
        <div className="flex-1 min-w-0">
          <div className="font-heading font-bold">{title}</div>
          {description && <div className="text-sm text-muted leading-snug">{description}</div>}
        </div>
        <LevelDots level={level} max={maxLevel} />
      </div>
      {children}
    </div>
  );
}

/** Řádek akce v kartě: vlevo co a za kolik, vpravo tlačítko (na mobilu pod textem přes celou šířku). */
export function UpgradeAction({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
      <div className="min-w-0 text-sm">{children}</div>
      {action}
    </div>
  );
}

/** Tlačítko akce v kartě. `tone`: hlavní akce (Koupit), oprava, nebo vedlejší (Prodat, Stáhnout). */
export function upgradeButtonClass(tone: "primary" | "secondary" = "primary"): string {
  return `btn ${tone === "primary" ? "btn-primary" : "btn-secondary"} btn-sm min-h-11 w-full sm:w-auto shrink-0`;
}
