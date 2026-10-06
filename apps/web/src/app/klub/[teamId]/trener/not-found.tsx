import Link from "next/link";

/** Neznámý klub na stránce trenéra: skutečná 404. */
export default function CoachNotFound() {
  return (
    <main className="min-h-screen flex items-center justify-center bg-[#0a0f0a] text-white p-6">
      <div className="text-center max-w-md">
        <div className="text-6xl mb-4" aria-hidden="true">🤷‍♂️</div>
        <h1 className="text-3xl font-heading font-[900] mb-2">Klub nenalezen</h1>
        <p className="text-white/70 text-base mb-8">Tenhle klub na Pralesu není, nebo odkaz nesedí.</p>
        <Link
          href="/"
          className="inline-block px-8 py-3 bg-amber-500 hover:bg-amber-400 text-black rounded-full font-heading font-bold"
        >
          Zpět na úvod
        </Link>
      </div>
    </main>
  );
}
