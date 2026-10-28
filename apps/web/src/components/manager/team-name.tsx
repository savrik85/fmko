/**
 * Název klubu s malým robotem u AI klubu. Robot je samostatný prvek, který se nezkracuje:
 * když se název nevejde, zkrátí se název, robot zůstane vidět (i na mobilu v hustém seznamu).
 */
export function TeamName({ name, isAi, className = "", wrap = false }: { name: string; isAi: boolean; className?: string; wrap?: boolean }) {
  if (!isAi) return <>{name}</>;
  // Víceřádkový název (karta zápasu): zalomí se jako text a robot drží u posledního slova.
  if (wrap) {
    const cut = name.lastIndexOf(" ");
    const head = cut >= 0 ? name.slice(0, cut + 1) : "";
    const last = cut >= 0 ? name.slice(cut + 1) : name;
    return (
      <span className={className}>
        {head}
        <span className="whitespace-nowrap">
          {last}{" "}
          <span role="img" aria-label="Klub vede AI trenér" title="Klub vede AI trenér" className="text-[0.85em] leading-none">🤖</span>
        </span>
      </span>
    );
  }
  return (
    <span className={`inline-flex min-w-0 max-w-full items-center gap-1 align-bottom ${className}`}>
      <span className="truncate">{name}</span>
      <span role="img" aria-label="Klub vede AI trenér" title="Klub vede AI trenér" className="shrink-0 text-[0.85em] leading-none">
        🤖
      </span>
    </span>
  );
}
