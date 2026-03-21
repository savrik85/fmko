"use client";

import Link from "next/link";
import { useTeam } from "@/context/team-context";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

export default function Home() {
  const { teamId, isLoading } = useTeam();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading && teamId) router.replace("/dashboard");
  }, [teamId, isLoading, router]);

  if (isLoading) return null;

  return (
    <main className="min-h-screen flex flex-col">
      {/* Hero */}
      <div className="flex-1 flex flex-col items-center justify-center p-6 text-center relative">
        {/* Background accent */}
        <div className="absolute inset-0 bg-gradient-to-b from-pitch-50/50 to-transparent pointer-events-none" />

        <div className="relative z-10 animate-slide-up">
          <div className="text-display text-pitch-500 mb-3">Prales</div>
          <p className="text-lg text-muted max-w-md mx-auto mb-10 leading-relaxed">
            Fotbalový manažer z českého okresu. Postav si tým, řeš kocoviny
            a příbuzenské vazby, vyhraj okresní přebor.
          </p>

          <div className="flex flex-col sm:flex-row gap-3 justify-center mb-16">
            <Link href="/register" className="btn btn-primary btn-xl">
              Založit tým
            </Link>
            <Link href="/login" className="btn btn-secondary btn-xl">
              Přihlásit se
            </Link>
          </div>

          {/* Feature cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 max-w-2xl w-full stagger-children">
            <FeatureCard icon="&#9917;" title="Generované postavy" desc="Každý hráč má příběh, přezdívku a vlastní SVG avatar" />
            <FeatureCard icon="&#128251;" title="Obecní rozhlas" desc="Komentáře ve stylu okresního zápasu" />
            <FeatureCard icon="&#127942;" title="Ligový systém" desc="Sezóna, tabulka, postup, sestup" />
          </div>
        </div>
      </div>

      {/* Footer accent */}
      <div className="h-1 bg-gradient-to-r from-pitch-500 via-gold-500 to-pitch-500 opacity-30" />
    </main>
  );
}

function FeatureCard({ icon, title, desc }: { icon: string; title: string; desc: string }) {
  return (
    <div className="card card-hover p-5 text-left">
      <div className="text-2xl mb-2">{icon}</div>
      <h3 className="text-h3 text-pitch-600 mb-1">{title}</h3>
      <p className="text-sm text-muted leading-relaxed">{desc}</p>
    </div>
  );
}
