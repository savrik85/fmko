import type { ReactNode } from "react";

/**
 * Kreslené ikony položek menu ve stejném rukopisu jako spodní lišta:
 * mřížka 24 × 24, jen obrys, zaoblené konce. Klíčem je adresa položky.
 */
const MENU_LINE_ICONS: Record<string, ReactNode> = {
  "/zpravodaj": <><path d="M4 5.5h12.5v13a1.5 1.5 0 001.5 1.5H6a2 2 0 01-2-2z" /><path d="M16.5 9.5H20v8.75a1.75 1.75 0 01-3.5 0" /><path d="M7.5 9.5H13M7.5 13H13M7.5 16.5h3.5" /></>,
  "/kadr": <><circle cx="9" cy="8" r="3.2" /><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6" /><circle cx="17" cy="9" r="2.4" /><path d="M16.5 14.2c2.6.3 4.5 2.5 4.5 5.3" /></>,
  "/u21": <><path d="M12 20.5v-8" /><path d="M12 12c0-3.2 2.2-5.5 6.5-5.5 0 3.7-2.2 5.5-6.5 5.5z" /><path d="M12 15c0-2.6-1.9-4.5-5.5-4.5 0 3 1.9 4.5 5.5 4.5z" /></>,
  "/trenink": <path d="M6.5 7v10M17.5 7v10M3.5 9.5v5M20.5 9.5v5M6.5 12h11" />,
  "/zamestnanci": <><rect x="3.5" y="5" width="17" height="14" rx="2" /><circle cx="9" cy="10.5" r="2" /><path d="M5.8 16c.6-1.5 1.7-2.3 3.2-2.3s2.6.8 3.2 2.3M15 10h3M15 13.5h3" /></>,
  "/prestupy": <path d="M4 9h13l-3.5-3.5M20 15H7l3.5 3.5" />,
  "/rozpis": <path d="M9 7h11M9 12h11M9 17h11M4.5 7h.01M4.5 12h.01M4.5 17h.01" />,
  "/pohar": <><circle cx="12" cy="15.5" r="4.5" /><path d="M8 3.5h8M8.5 3.5l2 7.7M15.5 3.5l-2 7.7" /></>,
  "/turnaj": <><circle cx="12" cy="12" r="8.5" /><path d="M12 8.3l3.5 2.5-1.3 4.1H9.8l-1.3-4.1zM12 3.5v4.8M20.1 9.4l-4.6 1.4M17 18.9l-2.8-4M7 18.9l2.8-4M3.9 9.4l4.6 1.4" /></>,
  "/pratelaky": <><circle cx="12" cy="12" r="8.5" /><path d="M8.5 14c.9 1.4 2.1 2 3.5 2s2.6-.6 3.5-2M9 9.5v.5M15 9.5v.5" /></>,
  "/kalendar": <><rect x="4" y="5.5" width="16" height="14.5" rx="2" /><path d="M4 10h16M8.5 3.5v4M15.5 3.5v4M8.5 14h.01M12 14h.01M15.5 14h.01" /></>,
  "/rozhodci": <><circle cx="9" cy="14.5" r="5" /><path d="M9 9.5h12V13h-7.3M9 14.5h.01M6 4.5l1 2M10.5 4v2" /></>,
  "/finance": <><path d="M4 7.5a2 2 0 012-2h11v3" /><path d="M4 7.5v10a2 2 0 002 2h13a1 1 0 001-1v-9a1 1 0 00-1-1H6a2 2 0 01-2-2z" /><path d="M16 14h.01" /></>,
  "/sponzori": <><rect x="3.5" y="7.5" width="17" height="12" rx="2" /><path d="M9 7.5V6a2 2 0 012-2h2a2 2 0 012 2v1.5M3.5 13h17" /></>,
  "/vybaveni": <path d="M8.5 4L4 6.5l1.5 4 2.5-1V20h8V9.5l2.5 1 1.5-4L15.5 4a3.5 3.5 0 01-7 0z" />,
  "/stadion": <><ellipse cx="12" cy="8.5" rx="8.5" ry="3.5" /><path d="M3.5 8.5v6.5c0 1.9 3.8 3.5 8.5 3.5s8.5-1.6 8.5-3.5V8.5M8 11.6v6.4M16 11.6v6.4" /></>,
  "/muj-klub": <><circle cx="12" cy="12" r="8.5" /><path d="M3.5 12h17M12 3.5c2.5 2.3 3.8 5.1 3.8 8.5s-1.3 6.2-3.8 8.5c-2.5-2.3-3.8-5.1-3.8-8.5s1.3-6.2 3.8-8.5z" /></>,
  "/obec": <path d="M3 20h18M5 20v-8.5l5-4 5 4V20M15 14h4v6M9 20v-4h2v4" />,
  "/fanousci": <path d="M4 10v4h3l7 4V6l-7 4H4zM17.5 9.5a4 4 0 010 5" />,
  "/hospoda": <><path d="M6 8h10v10a2 2 0 01-2 2H8a2 2 0 01-2-2z" /><path d="M16 10.5h2.5A1.5 1.5 0 0120 12v2.5a1.5 1.5 0 01-1.5 1.5H16M9.5 11.5v5M12.5 11.5v5" /><path d="M6 8a3 3 0 013-3.5 2.5 2.5 0 014 0A3 3 0 0116 8" /></>,
  "/udalosti": <path d="M5 21V4M5 5h12l-2.5 3.5L17 12H5" />,
  "/incidenty": <path d="M12 4l9 15.5H3zM12 10v4.5M12 17.2v.1" />,
  "/sazky": <path d="M4 8.5a2 2 0 012-2h12a2 2 0 012 2v2a1.5 1.5 0 000 3v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2a1.5 1.5 0 000-3zM14 6.5v11" />,
  "/reputace": <path d="M12 4l2.5 5.2 5.7.7-4.2 3.9 1.1 5.6L12 16.6l-5.1 2.8L8 13.8 3.8 9.9l5.7-.7z" />,
  "/soutez": <path d="M4 9.5L12 5l8 4.5M5 20h14M6.5 10.5v7M10.2 10.5v7M13.8 10.5v7M17.5 10.5v7" />,
  "/hlasovani": <><rect x="4" y="11" width="16" height="9" rx="1.5" /><path d="M9 11V5h6v6M10.5 8l1 1 2-2" /></>,
  "/trener": <><circle cx="12" cy="8" r="3.5" /><path d="M5.5 20c0-3.6 2.9-6.5 6.5-6.5s6.5 2.9 6.5 6.5" /></>,
  "/novinky": <path d="M11 4l1.7 4.8 4.8 1.7-4.8 1.7L11 17l-1.7-4.8-4.8-1.7 4.8-1.7zM18 15l.8 2.2 2.2.8-2.2.8L18 21l-.8-2.2L15 18l2.2-.8z" />,
  "/napoveda": <path d="M12 6.5c-2-1.3-4.5-1.8-8-1.5v13c3.5-.3 6 .2 8 1.5 2-1.3 4.5-1.8 8-1.5V5c-3.5-.3-6 .2-8 1.5zM12 6.5v13" />,
  "/nastaveni": <><path d="M4 7h9M17 7h3M4 12h3M11 12h9M4 17h11M19 17h1" /><circle cx="15" cy="7" r="2" /><circle cx="9" cy="12" r="2" /><circle cx="17" cy="17" r="2" /></>,
  "/aplikace": <><rect x="7" y="2.5" width="10" height="19" rx="2.5" /><path d="M12 8v6M9.5 11.5L12 14l2.5-2.5" /></>,
  "/admin": <path d="M12 3.5l7 2.5v5.5c0 4.3-2.9 7.3-7 9-4.1-1.7-7-4.7-7-9V6z" />,
};

/** Kreslená ikona položky menu; položka bez kresby dostane svůj emoji znak. */
export function MenuLineIcon({ href, fallback }: { href: string; fallback: string }) {
  const icon = MENU_LINE_ICONS[href];
  if (!icon) return <span aria-hidden="true">{fallback}</span>;
  return (
    <svg width="27" height="27" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {icon}
    </svg>
  );
}
