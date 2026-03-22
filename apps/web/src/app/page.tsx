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
    <main className="min-h-screen bg-auth relative overflow-hidden flex flex-col items-center justify-center p-6">
      {/* Decorative background */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-[-20%] left-[50%] -translate-x-1/2 w-[600px] h-[600px] rounded-full bg-pitch-400/[0.08]" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[400px] h-[400px] rounded-full bg-gold-500/[0.04]" />
      </div>

      <div className="relative z-10 text-center max-w-xl mx-auto animate-slide-up">
        {/* Logo */}
        <h1 className="text-display text-white mb-4">PRALES</h1>
        <p className="text-lg text-white/40 max-w-md mx-auto mb-12 leading-relaxed">
          Fotbalový manažer z českého okresu. Postav si tým, řeš kocoviny
          a příbuzenské vazby, vyhraj okresní přebor.
        </p>

        {/* CTA */}
        <div className="flex flex-col sm:flex-row gap-3 justify-center mb-16">
          <Link href="/register" className="btn btn-primary-dark btn-xl">
            Založit tým
          </Link>
          <Link href="/login" className="btn btn-xl text-white/50 hover:text-white border border-white/10 hover:border-white/20 transition-all">
            Přihlásit se
          </Link>
        </div>

        {/* Feature cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 w-full stagger-children">
          <FeatureCard icon="&#9917;" title="Generované postavy" desc="Každý hráč má příběh, přezdívku a vlastní avatar" />
          <FeatureCard icon="&#128251;" title="Obecní rozhlas" desc="Komentáře ve stylu okresního zápasu" />
          <FeatureCard icon="&#127942;" title="Ligový systém" desc="Sezóna, tabulka, postup, sestup" />
        </div>
      </div>

      {/* Footer accent */}
      <div className="absolute bottom-0 left-0 right-0 h-1 bg-gradient-to-r from-pitch-500 via-gold-500 to-pitch-500 opacity-20" />
    </main>
  );
}

function FeatureCard({ icon, title, desc }: { icon: string; title: string; desc: string }) {
  return (
    <div className="card-dark p-5 text-left">
      <div className="text-2xl mb-2">{icon}</div>
      <h3 className="font-heading font-bold text-white text-lg mb-1">{title}</h3>
      <p className="text-sm text-white/40 leading-relaxed">{desc}</p>
    </div>
  );
}
