import type { ClubWebsiteData, ClubWebsiteMatchSummary } from "@okresni-masina/shared";

export interface TemplateProps {
  data: ClubWebsiteData;
  siteUrl: string;
  unlockedAddons: string[];
  hasSponsorBanner: boolean;
  hasAudioModule: boolean;
  hasStadiumGallery: boolean;
  hasPressOfficer: boolean;
  onOpenTickets: () => void;
  onOpenHighlights: (match?: ClubWebsiteMatchSummary | null) => void;
  onOpenLightbox: (photo: { src: string; title: string; desc: string }) => void;
  onBackToGame: () => void;
}
