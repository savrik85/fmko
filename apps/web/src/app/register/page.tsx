"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useTeam } from "@/context/team-context";
import { apiFetch } from "@/lib/api";

export default function RegisterPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const { login } = useTeam();
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const result = await apiFetch<{
        token: string;
        user: { id: string; email: string; displayName: string; teamId: string | null };
      }>("/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, displayName }),
      });
      login(result.token, { id: result.user.id, email: result.user.email, teamId: null, teamName: null });
      router.push("/onboarding");
    } catch (err) {
      setError((err as Error).message);
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen flex">
      {/* Left panel — branding (desktop only) */}
      <div className="hidden lg:flex lg:w-[45%] bg-pitch-700 relative items-center justify-center overflow-hidden">
        <div className="hero-gradient absolute inset-0" />
        <div className="relative z-10 p-12 text-center">
          <div className="text-display text-white/90 mb-4">Prales</div>
          <p className="text-white/50 text-lg max-w-xs mx-auto leading-relaxed">
            Fotbalový manažer zasazený do autentického prostředí českého amatérského fotbalu.
          </p>

          <div className="mt-10 space-y-3 flex flex-col items-center">
            <FeaturePill icon="&#9917;" text="Generované kádry s přezdívkami" />
            <FeaturePill icon="&#128251;" text="Komentáře ve stylu obecního rozhlasu" />
            <FeaturePill icon="&#127866;" text="Kocoviny, rodinné obědy, výmluvy" />
          </div>
        </div>
        <div className="absolute bottom-0 left-0 right-0 h-2 bg-pitch-400/30" />
      </div>

      {/* Right panel — form */}
      <div className="flex-1 flex items-center justify-center p-6">
        <div className="w-full max-w-sm animate-slide-up">
          <div className="lg:hidden text-center mb-10">
            <div className="text-h1 text-pitch-500 uppercase">Prales</div>
            <p className="text-muted text-sm mt-1">Fotbalový manažer z českého okresu</p>
          </div>

          <h2 className="text-h2 text-ink mb-1">Vytvoř si účet</h2>
          <p className="text-muted mb-8">Za minutu budeš mít svůj tým</p>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="input-label">Jméno</label>
              <input type="text" value={displayName} onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Jak ti říkají" required className="input" />
            </div>
            <div>
              <label className="input-label">Email</label>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                placeholder="tvuj@email.cz" required className="input" />
            </div>
            <div>
              <label className="input-label">Heslo</label>
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)}
                placeholder="Alespoň 6 znaků" required minLength={6} className="input" />
            </div>

            {error && (
              <div className="flex items-center gap-2 text-card-red text-sm bg-card-red/5 px-4 py-3 rounded-md">
                &#9888; {error}
              </div>
            )}

            <button type="submit" disabled={loading} className="btn btn-primary btn-lg w-full">
              {loading ? "Registruji..." : "Založit účet a začít hrát"}
            </button>
          </form>

          <div className="divider my-8" />

          <p className="text-center text-sm text-muted">
            Už máš účet?{" "}
            <Link href="/login" className="text-pitch-500 font-semibold hover:underline">Přihlásit se</Link>
          </p>
        </div>
      </div>
    </main>
  );
}

function FeaturePill({ icon, text }: { icon: string; text: string }) {
  return (
    <div className="inline-flex items-center gap-3 bg-white/5 backdrop-blur px-5 py-3 rounded-full text-white/70 text-sm">
      <span>{icon}</span>
      <span>{text}</span>
    </div>
  );
}
