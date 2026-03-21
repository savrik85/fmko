"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useTeam } from "@/context/team-context";
import { apiFetch } from "@/lib/api";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
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
        user: { id: string; email: string; teamId: string | null; teamName: string | null };
      }>("/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      login(result.token, result.user);
      router.push(result.user.teamId ? "/dashboard" : "/onboarding");
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
          <div className="text-display text-white/90 mb-4">Okresní<br />Mašina</div>
          <p className="text-white/50 text-lg max-w-xs mx-auto leading-relaxed">
            Postav si tým z místních borců. Řeš kocoviny, rodinné obědy a příbuzenské vazby.
          </p>
          <div className="mt-12 flex justify-center gap-6 text-white/30">
            <div className="text-center">
              <div className="text-3xl font-heading font-bold text-white/50">310</div>
              <div className="text-xs mt-1">obcí</div>
            </div>
            <div className="w-px bg-white/10" />
            <div className="text-center">
              <div className="text-3xl font-heading font-bold text-white/50">60+</div>
              <div className="text-xs mt-1">komentářů</div>
            </div>
            <div className="w-px bg-white/10" />
            <div className="text-center">
              <div className="text-3xl font-heading font-bold text-white/50">31k</div>
              <div className="text-xs mt-1">avatarů</div>
            </div>
          </div>
        </div>
        {/* Decorative grass stripe */}
        <div className="absolute bottom-0 left-0 right-0 h-2 bg-pitch-400/30" />
      </div>

      {/* Right panel — form */}
      <div className="flex-1 flex items-center justify-center p-6">
        <div className="w-full max-w-sm animate-slide-up">
          {/* Mobile logo */}
          <div className="lg:hidden text-center mb-10">
            <div className="text-h1 text-pitch-500 uppercase">Prales</div>
          </div>

          <h2 className="text-h2 text-ink mb-1">Vítej zpátky</h2>
          <p className="text-muted mb-8">Přihlas se ke svému týmu</p>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="input-label">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="tvuj@email.cz"
                required
                className="input"
              />
            </div>

            <div>
              <label className="input-label">Heslo</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Tvoje heslo"
                required
                className="input"
              />
            </div>

            {error && (
              <div className="flex items-center gap-2 text-card-red text-sm bg-card-red/5 px-4 py-3 rounded-md">
                <span>&#9888;</span> {error}
              </div>
            )}

            <button type="submit" disabled={loading} className="btn btn-primary btn-lg w-full">
              {loading ? "Přihlašuji..." : "Přihlásit se"}
            </button>
          </form>

          <div className="divider my-8" />

          <p className="text-center text-sm text-muted">
            Nemáš účet?{" "}
            <Link href="/register" className="text-pitch-500 font-semibold hover:underline">
              Zaregistrovat se
            </Link>
          </p>
        </div>
      </div>
    </main>
  );
}
