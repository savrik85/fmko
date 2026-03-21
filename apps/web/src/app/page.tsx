import Link from "next/link";

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-6 text-center">
      {/* Hero */}
      <div className="mb-8">
        <div className="text-6xl mb-4">&#9917;</div>
        <h1 className="font-heading text-5xl sm:text-7xl font-extrabold text-pitch-500 leading-tight mb-3">
          Okresní Mašina
        </h1>
        <p className="text-lg sm:text-xl text-muted max-w-md mx-auto">
          Postav si tým. Řeš kocoviny, rodinné obědy a příbuzenské vazby.
          Vyhraj okresní přebor.
        </p>
      </div>

      {/* CTA */}
      <Link
        href="/onboarding"
        className="bg-pitch-500 hover:bg-pitch-400 text-white font-heading text-xl font-bold px-10 py-5 rounded-card shadow-card hover:shadow-hover transition-all mb-12 inline-block"
      >
        Založit tým
      </Link>

      {/* Feature hints */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 max-w-2xl w-full">
        <FeatureCard emoji="&#128104;&#8205;&#129456;" title="Generované postavy" desc="Každý hráč má příběh, přezdívku a vlastní avatar" />
        <FeatureCard emoji="&#128251;" title="Obecní rozhlas" desc="Komentáře jako z okresního zápasu" />
        <FeatureCard emoji="&#127942;" title="Ligový systém" desc="Sezóna, tabulka, postup, sestup" />
      </div>
    </main>
  );
}

function FeatureCard({ emoji, title, desc }: { emoji: string; title: string; desc: string }) {
  return (
    <div className="bg-white rounded-card shadow-card p-5 text-left">
      <div className="text-2xl mb-2">{emoji}</div>
      <h3 className="font-heading font-bold text-pitch-600 mb-1">{title}</h3>
      <p className="text-sm text-muted">{desc}</p>
    </div>
  );
}
