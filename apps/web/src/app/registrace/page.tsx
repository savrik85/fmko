"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { REGISTRATION_DISTRICTS, type RegistrationDistrict } from "@okresni-masina/shared";
import { apiFetch } from "@/lib/api";
import { Button, Input, ErrorBox } from "@/components/ui";
import styles from "@/components/landing/registration.module.css";

export default function RegisterPage() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [district, setDistrict] = useState("");
  const [districts, setDistricts] = useState<RegistrationDistrict[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const status = districts.find(d => d.name === district)?.status;

  function loadDistricts() {
    setLoadError(false);
    apiFetch<RegistrationDistrict[]>("/api/registration/districts").then(setDistricts).catch(() => setLoadError(true));
  }
  useEffect(() => {
    loadDistricts();
    const requested = new URLSearchParams(window.location.search).get("okres");
    if (requested && (REGISTRATION_DISTRICTS as readonly string[]).includes(requested)) setDistrict(requested);
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (loading) return;
    setLoading(true); setError("");
    try {
      await apiFetch("/api/registration/requests", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, email, district }) });
      setSubmitted(true);
    } catch (err) { setError((err as Error).message === "Network error" ? "Registraci se nepodařilo odeslat. Zkontroluj připojení a zkus to znovu." : (err as Error).message); }
    finally { setLoading(false); }
  }

  return <main className={styles.page}>
    <header className={styles.header}><Link className={styles.logo} href="/">PRALES.</Link><Link href="/prihlaseni">Už mám účet →</Link></header>
    <div className={styles.layout}>
      <section className={styles.intro}><p className={styles.eyebrow}>PRVNÍ KROK DO VAŠÍ LIGY</p><h1>Každý okres<br />potřebuje<br /><em>svého předsedu.</em></h1><p>Začni u vás doma. Pozvi kamarády z hospody, práce nebo kabiny a veď první období ligy, která bude patřit vašemu okresu.</p><ol><li><strong>Ty vybereš okres.</strong><span>Jméno a e-mail. Nic dalšího teď nepotřebujeme.</span></li><li><strong>My do 24 hodin připravíme data.</strong><span>Místní jména, obce, sponzory a atmosféru, aby to bylo opravdu vaše.</span></li><li><strong>Ty začneš jako předseda.</strong><span>Po aktivaci založíš klub, pozveš kamarády a na první období povedeš celou soutěž.</span></li></ol><Link href="/" className={styles.back}>Zpátky na hřiště</Link></section>
      <section className={styles.card} aria-labelledby="registration-title">
        {submitted ? <div role="status" className={styles.success}>
          <span className={styles.check} aria-hidden="true">✓</span><p className={styles.eyebrow}>ŽÁDOST JE U NÁS</p><h2 id="registration-title">{district} jde do hry.</h2><p>Žádost jsme přijali. Na <strong>{email.trim()}</strong> dostaneš do 24 hodin další postup a aktivační odkaz.</p><div className={styles.note}>Týmy se odemknou po přípravě okresu. Zatím dej vědět kamarádům, že se chystá vaše liga.</div><p className={styles.small}>Pokud se neozveme, zkontroluj spam nebo napiš na <a href="mailto:admin@prales.fun">admin@prales.fun</a>.</p><Link href="/" className={styles.submit}>Zpět do Pralesa →</Link>
        </div> : <>
          <p className={styles.eyebrow}>JEN TŘI ÚDAJE A JSME VE HŘE</p><h2 id="registration-title">{status === "ready" ? "Přidej se do okresu" : "Rozjeď svůj okres"}</h2><p className={styles.description}>Heslo a vlastní tým vyřešíš až po přípravě dat.</p>
          <form onSubmit={submit} className={styles.form}>
            <Input label="Tvoje jméno" name="name" autoComplete="name" placeholder="Jak ti máme říkat?" value={name} minLength={2} maxLength={80} onChange={e => setName(e.target.value)} required />
            <Input label="E-mail" name="email" type="email" autoComplete="email" autoCapitalize="none" spellCheck={false} placeholder="tvuj@email.cz" maxLength={254} value={email} onChange={e => setEmail(e.target.value)} required />
            <div><label htmlFor="district" className="input-label">Váš okres</label><select id="district" name="district" className="input" value={district} onChange={e => setDistrict(e.target.value)} required aria-describedby="district-help"><option value="" disabled>Vyber okres</option>{REGISTRATION_DISTRICTS.map(name => <option key={name} value={name}>{name}{districts.find(d => d.name === name)?.status === "ready" ? " · připravený" : districts.find(d => d.name === name)?.status === "preparing" ? " · v přípravě" : ""}</option>)}</select></div>
            <div id="district-help" className={styles.note}>{status === "ready" ? "Tento okres už je připravený. Připojíš se jako manažer k existující lize. První předsednický mandát už patří jejímu zakladateli." : status === "preparing" ? "Tenhle okres už má svého zakladatele a připravuje se. Přidej se k němu jako manažer. Ozveme se po dokončení dat." : "Založením nové ligy se staneš jejím prvním předsedou na první období. Do 24 hodin připravíme data pro váš okres a pošleme ti aktivační odkaz."}</div>
            {loadError && <p role="alert" className={styles.small}>Stav okresů teď nejde načíst. <button type="button" onClick={loadDistricts} className="underline">Zkusit znovu</button></p>}
            <ErrorBox message={error} />
            <Button type="submit" size="lg" disabled={loading || !district || !name.trim() || districts.length === 0} className={styles.submit}>{loading ? "Odesílám žádost…" : status === "available" ? "Založit vlastní ligu ↗" : "Odeslat registraci ↗"}</Button>
            <p className={styles.small}>E-mail použijeme pro vyřízení registrace a přístup do hry. Odesláním žádosti se ještě nezakládá tým.</p>
          </form>
        </>}
      </section>
    </div>
  </main>;
}
