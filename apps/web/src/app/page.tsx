export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-8">
      <h1 className="font-heading text-6xl font-extrabold text-pitch-500 mb-4">
        Okresní Mašina
      </h1>
      <p className="text-xl text-muted mb-8">
        Postav si tým. Vyhraj okres.
      </p>
      <button className="bg-pitch-500 hover:bg-pitch-400 text-white font-heading text-xl font-bold px-8 py-4 rounded-card shadow-card hover:shadow-hover transition-all">
        Založit tým
      </button>
    </main>
  );
}
