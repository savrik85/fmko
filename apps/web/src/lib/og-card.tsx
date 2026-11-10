import { ImageResponse } from "next/og";

/** Rozměr náhledu pro sociální sítě. */
export const OG_SIZE = { width: 1200, height: 630 };

/**
 * Náhledový obrázek veřejných stránek (úvod, registrace) ve světlém béžovém vzhledu hry:
 * papírové pozadí, zelená hřiště a zlatý akcent. Text je jen latinkou s diakritikou,
 * kterou zvládne výchozí písmo generátoru.
 */
export function ogCard(opts: { eyebrow: string; title: string[]; accent: string; footer: string }): ImageResponse {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between",
          background: "#F5F0E8", padding: "64px 72px", fontFamily: "system-ui, sans-serif", color: "#1A1714",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", fontSize: 40, fontWeight: 800, letterSpacing: 2, color: "#153615" }}>
            PRALES<span style={{ color: "#C4A035" }}>.</span>
          </div>
          <div style={{ display: "flex", fontSize: 22, letterSpacing: 3, color: "#3A7A3A" }}>{opts.eyebrow}</div>
        </div>

        <div style={{ display: "flex", flexDirection: "column" }}>
          {opts.title.map((line) => (
            <div key={line} style={{ display: "flex", fontSize: 84, fontWeight: 800, lineHeight: 1.05, color: "#1A1714" }}>{line}</div>
          ))}
          <div style={{ display: "flex", fontSize: 84, fontWeight: 800, lineHeight: 1.05, color: "#2D5F2D" }}>{opts.accent}</div>
        </div>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", fontSize: 28, color: "#4A443D" }}>{opts.footer}</div>
          <div style={{ display: "flex", background: "#2D5F2D", color: "#FFFFFF", fontSize: 26, fontWeight: 700, padding: "14px 30px", borderRadius: 14 }}>
            prales.fun
          </div>
        </div>
      </div>
    ),
    { ...OG_SIZE },
  );
}
