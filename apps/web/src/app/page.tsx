import type { Metadata } from "next";
import { LandingPage } from "@/components/landing/landing-page";

export const metadata: Metadata = {
  title: "Prales. Tvůj okres. Tvoje liga. Vaše rivalita.",
  description: "Fotbalový manažer pro celou kabinu. Založ s kamarády vlastní okresní ligu ze skutečných obcí vašeho okresu. Zdarma, v mobilu, pár minut denně.",
};

export default function Home() { return <LandingPage />; }
