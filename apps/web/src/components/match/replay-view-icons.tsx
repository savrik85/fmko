// Ikony přepínače záznamu: plánek hřiště (2D) a kamera (video ze 3D scény).

export function PitchIcon({ className = "w-5 h-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" aria-hidden="true">
      <rect x="2" y="5" width="20" height="14" rx="1" />
      <path d="M12 5v14" />
      <circle cx="12" cy="12" r="2.5" />
      <path d="M2 9.5a2.5 2.5 0 0 1 0 5M22 9.5a2.5 2.5 0 0 0 0 5" />
    </svg>
  );
}

export function VideoIcon({ className = "w-5 h-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden="true">
      {/* Trojúhelník „play“ je díra v těle kamery (evenodd), takže sedí na bílém i barevném tlačítku. */}
      <path fillRule="evenodd" d="M4.5 6h9A2.5 2.5 0 0 1 16 8.5v7a2.5 2.5 0 0 1-2.5 2.5h-9A2.5 2.5 0 0 1 2 15.5v-7A2.5 2.5 0 0 1 4.5 6zM7.5 9.5v5l4-2.5z" />
      <path d="M17.5 10.5 22 7.5v9l-4.5-3z" />
    </svg>
  );
}
