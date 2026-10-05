import type { ClubWebsiteData, ClubWebsiteMatchSummary } from "@okresni-masina/shared";

export interface TemplateProps {
  data: ClubWebsiteData;
  siteUrl: string;
  unlockedAddons: string[];
  hasSponsorBanner: boolean;
  hasAudioModule: boolean;
  hasPressOfficer: boolean;
  onOpenTickets: () => void;
  onOpenHighlights: (match?: ClubWebsiteMatchSummary | null) => void;
  onOpenLightbox: (photo: { src: string; title: string; desc: string }) => void;
  /** Počet návštěv po započítání této návštěvy (prohlížeč ho dostane z POST /website/visit). */
  visitorCount: number;
  /** Dívá se vlastník klubu (jeho prohlížeč nahrává fotky stadionu z 3D modelu). */
  isOwner: boolean;
}
