import React from "react";

/**
 * Text lekce ze skript. Umí jen to, co obsah smí používat: odstavce oddělené
 * prázdným řádkem, `**tučně**` a řádky „- " jako odrážky. Žádné HTML se nevkládá.
 */

function inline(text: string, key: string): React.ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*)/g).filter(Boolean).map((part, i) =>
    part.startsWith("**") && part.endsWith("**")
      ? <strong key={`${key}-${i}`} className="font-bold text-ink">{part.slice(2, -2)}</strong>
      : <React.Fragment key={`${key}-${i}`}>{part}</React.Fragment>,
  );
}

export function LessonBody({ body }: { body: string }) {
  const blocks = body.trim().split(/\n\s*\n/);
  return (
    <div className="space-y-3">
      {blocks.map((block, bi) => {
        const lines = block.split("\n").map((l) => l.trim()).filter(Boolean);
        const bullets = lines.filter((l) => l.startsWith("- "));
        const text = lines.filter((l) => !l.startsWith("- "));
        return (
          <div key={bi} className="space-y-2">
            {text.length > 0 && (
              <p className="text-base leading-relaxed text-ink-light">{inline(text.join(" "), `p${bi}`)}</p>
            )}
            {bullets.length > 0 && (
              <ul className="space-y-1.5 pl-1">
                {bullets.map((b, li) => (
                  <li key={li} className="flex gap-2 text-base leading-relaxed text-ink-light">
                    <span className="shrink-0 text-pitch-600">•</span>
                    <span>{inline(b.slice(2), `b${bi}-${li}`)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        );
      })}
    </div>
  );
}
