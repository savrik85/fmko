"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTeam } from "@/context/team-context";
import { apiFetch } from "@/lib/api";
import { Button, Input, ErrorBox } from "@/components/ui";
import styles from "@/components/landing/registration.module.css";

type Activation = { name: string; email: string; district: string; isFounder: boolean };
export default function ActivationPage() {
  const [activationToken, setActivationToken] = useState("");
  const [info, setInfo] = useState<Activation | null>(null);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const { login } = useTeam();
  const router = useRouter();
  useEffect(() => {
    // Fragment neodchází serveru ani v Referer. Po převzetí se odstraní z adresy.
    const token = new URLSearchParams(window.location.hash.slice(1)).get("token") ?? sessionStorage.getItem("prales_activation") ?? "";
    window.history.replaceState(null, "", window.location.pathname);
    if (token) sessionStorage.setItem("prales_activation", token);
    setActivationToken(token);
    if (!token) { setError("Otevři aktivační odkaz z e-mailu."); setLoading(false); return; }
    apiFetch<Activation>("/api/registration/activation", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token }) })
      .then(setInfo).catch(e => setError(e.message === "Network error" ? "Odkaz teď nejde ověřit. Zkus obnovit stránku." : e.message)).finally(() => setLoading(false));
  }, []);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (loading) return;
    if (password !== confirm) { setError("Hesla se neshodují."); return; }
    setError(""); setLoading(true);
    try {
      const result = await apiFetch<{ token: string; user: { id: string; email: string; teamId: null; teamName: null } }>("/api/registration/activate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token: activationToken, password }) });
      sessionStorage.removeItem("prales_activation"); sessionStorage.removeItem("onboarding_step"); sessionStorage.removeItem("onboarding_state");
      login(result.token, result.user); router.replace("/onboarding");
    } catch (e) { setError((e as Error).message === "Network error" ? "Aktivaci se nepodařilo dokončit. Zkus to znovu; pokud už aktivace proběhla, přihlas se zvoleným heslem." : (e as Error).message); setLoading(false); }
  }
  return <main className={styles.page}><header className={styles.header}><Link href="/" className={styles.logo}>PRALES.</Link><Link href="/prihlaseni">Přihlásit se →</Link></header><div className={styles.activation}><section className={styles.card}>
    <p className={styles.eyebrow}>OKRES JE PŘIPRAVENÝ</p><h1 className="text-h1 mb-5">{info ? `${info.name}, jde se na hřiště.` : "Aktivace účtu"}</h1>
    {loading && !info && <p role="status">Ověřuji aktivační odkaz…</p>}
    {info && <><p className={styles.description}>Okres <strong>{info.district}</strong> je připravený. {info.isFounder ? "Po založení klubu získáš první předsednický mandát a můžeš pozvat kamarády." : "Aktivuj účet a připoj svůj klub do okresní ligy."}</p><form onSubmit={submit} className={styles.form}>
      <Input label="E-mail" autoComplete="username" value={info.email} readOnly />
      <Input label="Heslo" type="password" name="new-password" autoComplete="new-password" minLength={8} maxLength={128} pattern="(?=.*[a-z])(?=.*[A-Z])(?=.*[0-9]).{8,128}" title="8–128 znaků, malé i velké písmeno a číslo" aria-describedby="password-help" value={password} onChange={e => setPassword(e.target.value)} required />
      <p id="password-help" className={styles.small}>Alespoň 8 znaků, malé i velké písmeno a číslo.</p>
      <Input label="Heslo znovu" type="password" name="new-password-confirm" autoComplete="new-password" maxLength={128} value={confirm} onChange={e => setConfirm(e.target.value)} required />
      <Button type="submit" disabled={loading} className={styles.submit}>{loading ? "Aktivuji účet…" : "Aktivovat účet a založit tým →"}</Button>
    </form></>}
    <div className="mt-5"><ErrorBox message={error} /></div>{!info && !loading && <p className={`${styles.small} mt-5`}>Potřebuješ nový odkaz? Napiš na <a href="mailto:admin@prales.fun">admin@prales.fun</a>.</p>}
  </section></div></main>;
}
