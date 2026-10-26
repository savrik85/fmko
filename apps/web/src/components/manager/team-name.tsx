/**
 * Název klubu s malým robotem u AI klubu. Robot je samostatný prvek, který se nezkracuje:
 * když se název nevejde, zkrátí se název, robot zůstane vidět (i na mobilu v hustém seznamu).
 */
export function TeamName({ name, isAi, className = "" }: { name: string; isAi: boolean; className?: string }) {
  if (!isAi) return <>{name}</>;
  return (
    <span className={`inline-flex min-w-0 max-w-full items-center gap-1 align-bottom ${className}`}>
      <span className="truncate">{name}</span>
      <span role="img" aria-label="Klub vede AI trenér" title="Klub vede AI trenér" className="shrink-0 text-[0.85em] leading-none">
        🤖
      </span>
    </span>
  );
}
