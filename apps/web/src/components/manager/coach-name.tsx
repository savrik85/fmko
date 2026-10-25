/**
 * Jméno trenéra s odznakem AI. Odznak je samostatný prvek (robot v rámečku), ne text ve jméně,
 * takže si ho nikdo nenapíše do vlastního jména. Dlouhé jméno se zkrátí, odznak zůstane vidět.
 */

export function AiCoachBadge({ className = "" }: { className?: string }) {
  return (
    <span
      role="img"
      aria-label="Trenéra vede AI"
      title="Trenéra vede AI"
      className={`inline-flex shrink-0 items-center justify-center rounded-full border border-gray-200 bg-gray-100 px-1.5 py-px text-[0.8em] leading-none ${className}`}
    >
      🤖
    </span>
  );
}

export function CoachName({ name, isAi, className = "" }: { name: string; isAi: boolean; className?: string }) {
  if (!isAi) return <>{name}</>;
  return (
    <span className={`inline-flex min-w-0 max-w-full items-center gap-1.5 align-middle ${className}`}>
      <span className="truncate">{name}</span>
      <AiCoachBadge />
    </span>
  );
}
