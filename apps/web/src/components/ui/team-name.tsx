export function TeamName({ name, base = "text-sm", className = "" }: { name: string; base?: string; className?: string }) {
  const size = name.length > 30 ? "text-[9px]" : name.length > 22 ? "text-[10px]" : name.length > 15 ? "text-xs" : base;
  return <span className={`${size} ${className}`}>{name}</span>;
}
