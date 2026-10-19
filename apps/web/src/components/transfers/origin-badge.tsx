/** Štítek „odkud“ na trhu a u poptávek: okres, u jiné soutěže téhož okresu název soutěže. */
export function OriginBadge({ origin }: { origin?: string | null }) {
  if (!origin) return null;
  return (
    <span className="mr-1.5 px-1.5 rounded-full text-micro font-heading font-bold bg-sky-50 text-sky-700 border border-sky-200 whitespace-nowrap">
      {origin}
    </span>
  );
}
