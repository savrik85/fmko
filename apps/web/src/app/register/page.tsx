"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useTeam } from "@/context/team-context";
import { apiFetch } from "@/lib/api";
import { Button, Input, ErrorBox } from "@/components/ui";

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
    <main className="min-h-screen bg-auth relative overflow-hidden flex items-center justify-center p-4">
      {/* Decorative background */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-[-20%] left-[50%] -translate-x-1/2 w-[600px] h-[600px] rounded-full bg-pitch-400/[0.08]" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[400px] h-[400px] rounded-full bg-gold-500/[0.04]" />
      </div>

      <div className="w-full max-w-[400px] relative z-10">
        {/* Logo */}
        <div className="text-center mb-10 animate-slide-up">
          <h1 className="text-display text-white">PRALES</h1>
          <p className="text-label text-white/25 mt-3">Fotbalový manažer z českého okresu</p>
        </div>

        {/* Form card */}
        <div className="card-dark p-8 animate-slide-up" style={{ animationDelay: "80ms" }}>
          <h2 className="text-h2 text-white mb-1">Vytvoř si účet</h2>
          <p className="text-white/40 text-sm mb-8">Za minutu budeš mít svůj tým</p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <Input variant="dark" label="Jméno" type="text" value={displayName}
              onChange={(e) => setDisplayName(e.target.value)} placeholder="Jak ti říkají" required />

            <Input variant="dark" label="Email" type="email" value={email}
              onChange={(e) => setEmail(e.target.value)} placeholder="tvuj@email.cz" required />

            <Input variant="dark" label="Heslo" type="password" value={password}
              onChange={(e) => setPassword(e.target.value)} placeholder="Alespoň 6 znaků" required minLength={6} />

            <ErrorBox message={error} variant="dark" />

            <Button variant="primary-dark" size="lg" type="submit" disabled={loading} className="w-full">
              {loading ? "Registruji..." : "Založit účet a začít hrát"}
            </Button>
          </form>
        </div>

        <div className="divider-dark my-8" />

        <p className="text-center text-sm text-white/30 animate-slide-up" style={{ animationDelay: "200ms" }}>
          Už máš účet?{" "}
          <Link href="/login" className="text-pitch-300 font-semibold hover:text-white transition-colors">
            Přihlásit se
          </Link>
        </p>
      </div>
    </main>
  );
}
