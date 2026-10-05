import Link from "next/link";

/** Neznámá adresa klubového webu: skutečná 404, aby vyhledávače neindexovaly prázdné stránky. */
export default function ClubWebsiteNotFound() {
  return (
    <main className="min-h-screen flex items-center justify-center bg-[#0a0f0a] text-white p-6">
      <div className="text-center max-w-md">
        <div className="text-6xl mb-4">🤷‍♂️</div>
        <h1 className="text-3xl font-heading font-[900] mb-2">Klubový web nenalezen</h1>
        <p className="text-white/70 text-base mb-8">
          Tento odkaz na klubový web je neplatný nebo klub ještě nebyl založen.
        </p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Link
            href="/"
            className="inline-block px-8 py-3 bg-amber-500 hover:bg-amber-400 text-black rounded-full font-heading font-bold shadow-lg transition-transform hover:scale-105"
          >
            Zpět na úvod
          </Link>
          <Link
            href="/registrace"
            className="inline-block px-8 py-3 border border-white/30 hover:bg-white/10 text-white rounded-full font-heading font-bold transition"
          >
            Založit vlastní klub
          </Link>
        </div>
      </div>
    </main>
  );
}
