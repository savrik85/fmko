"use client";

import { useEffect, useRef } from "react";
import "leaflet/dist/leaflet.css";
import type { Map as LeafletMap, LayerGroup } from "leaflet";
import { badgeSvgMarkup, type BadgePattern } from "@/components/ui/badge-preview";

/** Obec na mapě okresu (GET /api/villages/district/:district/map). */
export interface MapVillage {
  id: string;
  name: string;
  population: number;
  size: string;
  lat: number;
  lng: number;
  events: number;
  clubs: Array<{
    id: string;
    name: string;
    isAi: boolean;
    leagueName: string | null;
    primaryColor: string;
    secondaryColor: string;
    badge: { pattern: string | null; primary: string | null; secondary: string | null; initials: string | null; symbol: string | null };
  }>;
}

export function clubInitials(name: string): string {
  return name.split(" ").map((w) => w[0]).filter(Boolean).slice(0, 3).join("").toUpperCase();
}

const SIZE_LABEL: Record<string, string> = {
  hamlet: "osada",
  village: "vesnice",
  town: "městys",
  small_city: "město",
  city: "město",
};

export function villageSizeLabel(size: string): string {
  return SIZE_LABEL[size] ?? "obec";
}

/** Znak klubu jako SVG řetězec. Hodnoty escapuje `badgeSvgMarkup`, obal `<svg>` je tady. */
export function clubBadgeSvg(club: MapVillage["clubs"][number], size: number): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">${badgeSvgMarkup({
    primary: club.badge.primary ?? club.primaryColor,
    secondary: club.badge.secondary ?? club.secondaryColor,
    pattern: (club.badge.pattern ?? "shield") as BadgePattern,
    initials: club.badge.initials || clubInitials(club.name),
    symbol: club.badge.symbol,
    size,
  })}</svg>`;
}

// OpenStreetMap: CARTO od 2026 chce API klíč. Tlumené barvy dodá CSS filtr níž (béžový design).
const TILES = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
const ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>';

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]!));
}

/**
 * Mapa okresu: obce s klubem mají znak klubu, ostatní jen tečku. Kliknutí vybere obec
 * (detail vykreslí stránka vedle mapy, ať odkazy jdou přes Next a ne přes HTML v bublině).
 */
export function DistrictMap({ villages, selectedId, homeVillageName, onSelect, className = "" }: {
  villages: MapVillage[];
  selectedId: string | null;
  homeVillageName?: string | null;
  onSelect: (id: string) => void;
  className?: string;
}) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<LeafletMap | null>(null);
  const layer = useRef<LayerGroup | null>(null);
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;

  // Mapa jen v prohlížeči: Leaflet sahá na window už při importu.
  useEffect(() => {
    let cancelled = false;
    import("leaflet").then((L) => {
      if (cancelled || !el.current || map.current) return;
      map.current = L.map(el.current, { scrollWheelZoom: false, zoomControl: true, attributionControl: true });
      L.tileLayer(TILES, { attribution: ATTRIBUTION, maxZoom: 16 }).addTo(map.current);
      layer.current = L.layerGroup().addTo(map.current);
      map.current.setView([49.5, 14.5], 9);
      // Při oddálení by se popisky obcí slily do sebe: ukážou se až od přiblížení 11.
      const toggleLabels = () => el.current?.classList.toggle("dmap-zoomed-out", (map.current?.getZoom() ?? 0) < 11);
      map.current.on("zoomend", toggleLabels);
      toggleLabels();
    }).catch((e) => console.error("Načtení mapy se nezdařilo:", e));
    return () => {
      cancelled = true;
      map.current?.remove();
      map.current = null;
      layer.current = null;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    import("leaflet").then((L) => {
      const m = map.current;
      const group = layer.current;
      if (cancelled || !m || !group) return;
      group.clearLayers();
      for (const v of villages) {
        const selected = v.id === selectedId;
        const home = !!homeVillageName && v.name === homeVillageName;
        let marker;
        if (v.clubs.length > 0) {
          const size = selected ? 40 : 30;
          const badges = v.clubs.slice(0, 3).map((c) => clubBadgeSvg(c, size)).join("");
          const html = `<div class="dmap-pin${selected ? " is-selected" : ""}${home ? " is-home" : ""}">
            <div class="dmap-badges">${badges}</div>
            <div class="dmap-label">${escapeHtml(v.name)}</div>
          </div>`;
          const width = Math.max(size * Math.min(3, v.clubs.length), 90);
          marker = L.marker([v.lat, v.lng], {
            icon: L.divIcon({ html, className: "", iconSize: [width, size + 20], iconAnchor: [width / 2, size / 2] }),
            zIndexOffset: selected ? 1000 : home ? 500 : 100,
            keyboard: true,
            title: v.name,
          });
        } else {
          marker = L.circleMarker([v.lat, v.lng], {
            radius: selected ? 7 : 4, color: selected ? "#2D5F2D" : "#7a7466", weight: selected ? 3 : 1,
            fillColor: "#f5efe1", fillOpacity: 1,
          }).bindTooltip(escapeHtml(v.name), { direction: "top", offset: [0, -4] });
        }
        marker.on("click", () => onSelectRef.current(v.id));
        group.addLayer(marker);
      }
      if (villages.length === 1) {
        m.setView([villages[0].lat, villages[0].lng], 12);
      } else if (villages.length > 1 && !selectedId) {
        // Výřez podle obcí s klubem; obce bez klubu na okraji okresu by mapu zbytečně oddálily.
        const focus = villages.some((v) => v.clubs.length > 0) ? villages.filter((v) => v.clubs.length > 0) : villages;
        const bounds = L.latLngBounds(focus.map((v) => [v.lat, v.lng] as [number, number]));
        m.fitBounds(bounds, { padding: [24, 24] });
      }
    }).catch((e) => console.error("Vykreslení obcí na mapě se nezdařilo:", e));
    return () => { cancelled = true; };
  }, [villages, selectedId, homeVillageName]);

  return (
    <>
      <style>{`
        .dmap-pin { display: flex; flex-direction: column; align-items: center; cursor: pointer; }
        .dmap-badges { display: flex; gap: 1px; filter: drop-shadow(0 1px 2px rgba(0,0,0,.35)); }
        .dmap-label { margin-top: 1px; padding: 0 5px; border-radius: 6px; background: rgba(255,253,247,.92);
          font: 600 11px/16px var(--font-heading, sans-serif); color: #1f2a1f; white-space: nowrap; box-shadow: 0 1px 2px rgba(0,0,0,.15); }
        .dmap-pin.is-home .dmap-label { background: #2D5F2D; color: #fff; }
        .dmap-pin.is-selected .dmap-label { outline: 2px solid #2D5F2D; }
        .dmap-zoomed-out .dmap-pin:not(.is-selected):not(.is-home) .dmap-label { display: none; }
        .leaflet-container { font-family: inherit; background: #efe9dc; }
        .leaflet-tile-pane { filter: sepia(.3) saturate(.75) brightness(1.03); }
      `}</style>
      <div ref={el} className={`w-full rounded-card overflow-hidden ${className}`} role="application" aria-label="Mapa obcí okresu" />
    </>
  );
}
