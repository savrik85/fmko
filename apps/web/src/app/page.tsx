import type { Metadata } from "next";
import { LandingPage } from "@/components/landing/landing-page";

export const metadata: Metadata = {
  title: "Prales. Tvůj okres. Tvoje liga. Vaše rivalita.",
  description: "Založ s kamarády vlastní okresní ligu. Staň se předsedou, veď svůj klub a vyzvi ostatní okresy. Personalizovaná data pro váš okres připravíme do 24 hodin.",
};

export default function Home() { return <LandingPage />; }
