# Inventář: ručně stavěné ovládací prvky

Vygenerováno 17. 11. 2026 skriptem `inventar.py` (spuštění z kořene repa:
`python3 -I docs/redesign-prvku/inventar.py`). Projde sledované `.tsx` soubory v
`apps/web/src` kromě míst, která plán vynechává (sekce 1 v `plan.md`).

Hledá se podle řádku, takže inventář obsahuje i falešné shody. Před převodem
každého místa si ho otevři a podle tabulky v sekci 5 plánu rozhodni, jestli do
převodu patří. Co nepatří, zapiš do zprávy uživateli jako „ponecháno“ s důvodem.
Sloupec **Druh** je jen odhad skriptu.

| Oblast | Míst | Souborů |
|---|---|---|
| `loading` | 95 | 74 |
| `errors` | 69 | 40 |
| `money` | 75 | 39 |
| `chips` | 57 | 31 |
| `progress` | 40 | 29 |
| `choices` | 115 | 53 |
| `dialogs` | 51 | 38 |
| `forms` | 58 | 26 |
| `collapsible` | 17 | 11 |

## loading: Načítání (obal kolem `<Spinner>`)

95 míst v 74 souborech.

Podle druhu: stránka 44, sekce 26, v textu nebo tlačítku 25.

| Soubor | Řádek | Druh | Kód |
|---|---|---|---|
| `app/(hra)/fanousci/page.tsx` | 516 | v textu nebo tlačítku | `<Spinner />` |
| `app/(hra)/fanousci/vudce/[id]/page.tsx` | 70 | stránka | `return <div className="page-container flex items-center justify-center min-h-[50vh]"><Spinner size="lg" /></d…` |
| `app/(hra)/finance/page.tsx` | 158 | stránka | `if (loading) return <div className="page-container flex items-center justify-center min-h-[50vh]"><Spinner />…` |
|  | 668 | v textu nebo tlačítku | `return <div className="card p-8 text-center"><Spinner /></div>;` |
| `app/(hra)/hospoda/page.tsx` | 187 | stránka | `if (loading) return <div className="page-container flex items-center justify-center min-h-[40vh]"><Spinner />…` |
| `app/(hra)/hrac/[id]/page.tsx` | 481 | v textu nebo tlačítku | `if (loading) return <div className="min-h-dvh flex items-center justify-center"><Spinner size="lg" /></div>;` |
|  | 1725 | sekce | `<div className="card p-6 flex items-center justify-center min-h-[120px]"><Spinner /></div>` |
| `app/(hra)/incidenty/DetailIncidentu.tsx` | 94 | sekce | `if (!detail) return <div className="flex justify-center py-10"><Spinner /></div>;` |
| `app/(hra)/incidenty/page.tsx` | 22 | stránka | `const NACITANI = <div className="page-container flex items-center justify-center min-h-[50vh]"><Spinner /></d…` |
| `app/(hra)/kadr/page.tsx` | 168 | stránka | `if (loading) return <div className="page-container flex justify-center min-h-[50vh] items-center"><Spinner />…` |
|  | 330 | sekce | `<div className="card p-6 flex items-center justify-center min-h-[120px]"><Spinner /></div>` |
| `app/(hra)/kalendar/page.tsx` | 48 | stránka | `if (loading) return <div className="page-container flex items-center justify-center min-h-[50vh]"><Spinner />…` |
| `app/(hra)/liga/page.tsx` | 226 | stránka | `if (loadingStandings) return <div className="page-container flex items-center justify-center min-h-[50vh]"><S…` |
|  | 325 | sekce | `!loadedTabs.has("zpravodaj") ? <div className="flex justify-center py-8"><Spinner /></div> : (` |
|  | 543 | sekce | `if (!loaded) return <div className="flex items-center justify-center py-12"><Spinner /></div>;` |
| `app/(hra)/manazer/[id]/page.tsx` | 95 | v textu nebo tlačítku | `if (loading) return <div className="min-h-dvh flex items-center justify-center"><Spinner size="lg" /></div>;` |
| `app/(hra)/muj-klub/dres/page.tsx` | 375 | stránka | `return <div className="page-container flex justify-center min-h-[50vh] items-center"><Spinner /></div>;` |
| `app/(hra)/muj-klub/hymna/page.tsx` | 155 | stránka | `if (loading) return <div className="page-container flex justify-center min-h-[50vh] items-center"><Spinner />…` |
|  | 207 | v textu nebo tlačítku | `<Spinner /> Hudba se generuje… (30-90s)` |
| `app/(hra)/muj-klub/identita/page.tsx` | 131 | stránka | `if (loading) return <div className="page-container flex justify-center min-h-[50vh] items-center"><Spinner />…` |
| `app/(hra)/muj-klub/maskot/page.tsx` | 136 | stránka | `if (loading) return <div className="page-container flex justify-center min-h-[50vh] items-center"><Spinner />…` |
| `app/(hra)/muj-klub/page.tsx` | 279 | v textu nebo tlačítku | `<Spinner />` |
| `app/(hra)/muj-klub/stadion/page.tsx` | 15 | v textu nebo tlačítku | `<Spinner />` |
|  | 134 | stránka | `if (loading) return <div className="page-container flex justify-center min-h-[50vh] items-center"><Spinner />…` |
| `app/(hra)/obec/DistrictVillages.tsx` | 79 | stránka | `{!data && !error && <div className="flex justify-center py-16"><Spinner /></div>}` |
| `app/(hra)/obec/[id]/page.tsx` | 255 | stránka | `if (!data) return <div className="page-container flex justify-center py-16"><Spinner /></div>;` |
| `app/(hra)/obec/page.tsx` | 488 | v textu nebo tlačítku | `return <div className="p-8 flex justify-center"><Spinner /></div>;` |
|  | 968 | v textu nebo tlačítku | `<Spinner />` |
| `app/(hra)/pohar/page.tsx` | 102 | stránka | `if (loading) return <div className="flex justify-center py-20"><Spinner /></div>;` |
| `app/(hra)/pohar/tym/[id]/page.tsx` | 57 | stránka | `if (loading) return <div className="flex items-center justify-center min-h-[50vh]"><Spinner size="lg" /></div…` |
| `app/(hra)/pratelaky/page.tsx` | 96 | stránka | `if (loading) return <div className="page-container flex items-center justify-center min-h-[50vh]"><Spinner />…` |
| `app/(hra)/prehled/page.tsx` | 161 | stránka | `return <div className="page-container flex items-center justify-center min-h-[50vh]"><Spinner /></div>;` |
| `app/(hra)/prestupy/DemandsTab.tsx` | 145 | sekce | `if (!data) return <div className="flex justify-center py-8"><Spinner /></div>;` |
| `app/(hra)/prestupy/LoansTab.tsx` | 81 | sekce | `if (!data) return <div className="flex justify-center py-10"><Spinner /></div>;` |
| `app/(hra)/prestupy/ObligationsTab.tsx` | 98 | sekce | `if (!data) return <div className="flex justify-center py-8"><Spinner /></div>;` |
| `app/(hra)/prestupy/WatchlistTab.tsx` | 61 | sekce | `if (players === null) return <div className="flex justify-center py-8"><Spinner /></div>;` |
| `app/(hra)/prestupy/hostovani/[id]/page.tsx` | 103 | stránka | `if (!data) return <div className="flex justify-center py-16"><Spinner /></div>;` |
| `app/(hra)/prestupy/jednani/[id]/page.tsx` | 111 | stránka | `return <div className="min-h-[40vh] flex items-center justify-center"><Spinner /></div>;` |
| `app/(hra)/prestupy/nabidka/[id]/page.tsx` | 130 | v textu nebo tlačítku | `<Spinner />` |
| `app/(hra)/prestupy/page.tsx` | 1066 | stránka | `if (loading) return <div className="page-container flex items-center justify-center min-h-[50vh]"><Spinner />…` |
|  | 1429 | sekce | `{overviewLoading && <div className="flex justify-center py-8"><Spinner /></div>}` |
|  | 1566 | sekce | `{!searchLoaded && <div className="flex justify-center py-8"><Spinner /></div>}` |
| `app/(hra)/reputace/page.tsx` | 172 | stránka | `return <div className="page-container flex items-center justify-center min-h-[50vh]"><Spinner /></div>;` |
| `app/(hra)/rozhodci/[id]/page.tsx` | 56 | stránka | `if (loading) return <div className="page-container flex items-center justify-center min-h-[50vh]"><Spinner si…` |
| `app/(hra)/rozhodci/page.tsx` | 35 | stránka | `if (loading) return <div className="page-container flex items-center justify-center min-h-[50vh]"><Spinner si…` |
| `app/(hra)/rozpis/page.tsx` | 154 | stránka | `if (loading) return <div className="page-container flex items-center justify-center min-h-[50vh]"><Spinner />…` |
|  | 242 | sekce | `<div className="flex items-center justify-center py-12"><Spinner /></div>` |
| `app/(hra)/sazky/page.tsx` | 96 | stránka | `<div className="page-container flex items-center justify-center min-h-[50vh]"><Spinner /></div>` |
| `app/(hra)/sin-slavy/page.tsx` | 43 | stránka | `if (loading) return <div className="page-container flex items-center justify-center min-h-[50vh]"><Spinner si…` |
| `app/(hra)/soutez/page.tsx` | 370 | stránka | `return <div className="page-container flex items-center justify-center min-h-[50vh]"><Spinner /></div>;` |
| `app/(hra)/sponzor/[id]/jednani/page.tsx` | 190 | sekce | `if (!view \|\| !draft) return <div className="flex justify-center py-12"><Spinner /></div>;` |
| `app/(hra)/sponzor/[id]/page.tsx` | 72 | sekce | `if (!data) return <div className="flex justify-center py-12"><Spinner /></div>;` |
| `app/(hra)/sponzori/page.tsx` | 302 | stránka | `if (authLoading \|\| loading) return <div className="page-container flex items-center justify-center min-h-[5…` |
|  | 305 | stránka | `if (!data \|\| !team) return <div className="page-container flex items-center justify-center min-h-[50vh]"><S…` |
| `app/(hra)/stadion/page.tsx` | 26 | v textu nebo tlačítku | `<Spinner />` |
|  | 805 | stránka | `if (loading) return <div className="page-container flex items-center justify-center min-h-[50vh]"><Spinner />…` |
| `app/(hra)/trener/page.tsx` | 23 | v textu nebo tlačítku | `return <div className="min-h-[50dvh] flex items-center justify-center"><Spinner size="lg" /></div>;` |
| `app/(hra)/trener/skripta/page.tsx` | 117 | v textu nebo tlačítku | `if (!data) return <div className="min-h-[50dvh] flex items-center justify-center"><Spinner size="lg" /></div>;` |
|  | 127 | v textu nebo tlačítku | `<Spinner size="lg" />` |
| `app/(hra)/trener/test/page.tsx` | 142 | v textu nebo tlačítku | `if (!exam \|\| !teamId \|\| !courseId) return <div className="min-h-[50dvh] flex items-center justify-center"…` |
|  | 381 | v textu nebo tlačítku | `<div className="card p-6 flex flex-col items-center gap-3"><Spinner /><div className="text-base">Vyhodnocuji……` |
| `app/(hra)/trenink/page.tsx` | 187 | stránka | `if (loading) return <div className="page-container flex items-center justify-center min-h-[50vh]"><Spinner />…` |
| `app/(hra)/turnaj/hriste/[id]/page.tsx` | 16 | v textu nebo tlačítku | `<Spinner />` |
|  | 46 | stránka | `if (loading) return <div className="page-container flex items-center justify-center min-h-[50vh]"><Spinner />…` |
| `app/(hra)/turnaj/page.tsx` | 174 | stránka | `if (loading) return <div className="flex justify-center py-20"><Spinner /></div>;` |
| `app/(hra)/tym/[id]/page.tsx` | 123 | stránka | `if (loading) return <div className="page-container flex justify-center min-h-[50vh] items-center"><Spinner />…` |
| `app/(hra)/tym/[id]/stadion/page.tsx` | 19 | v textu nebo tlačítku | `<Spinner />` |
|  | 109 | stránka | `if (loading) return <div className="page-container flex items-center justify-center min-h-[50vh]"><Spinner />…` |
| `app/(hra)/u21/page.tsx` | 255 | sekce | `<div className="flex items-center justify-center py-12"><Spinner /></div>` |
|  | 319 | v textu nebo tlačítku | `{tab === "kadr" && !squadLoaded && !error && <div className="flex justify-center p-8"><Spinner /></div>}` |
| `app/(hra)/udalosti/page.tsx` | 165 | stránka | `if (loading) return <div className="page-container flex items-center justify-center min-h-[50vh]"><Spinner />…` |
| `app/(hra)/vybaveni/BazarTab.tsx` | 44 | sekce | `if (loading) return <div className="flex justify-center py-10"><Spinner /></div>;` |
| `app/(hra)/vybaveni/page.tsx` | 32 | stránka | `<Suspense fallback={<div className="page-container flex items-center justify-center min-h-[50vh]"><Spinner />…` |
|  | 224 | stránka | `if (loading) return <div className="page-container flex items-center justify-center min-h-[50vh]"><Spinner />…` |
| `app/(hra)/zamestnanci/page.tsx` | 374 | stránka | `if (loading) return <div className="page-container flex items-center justify-center min-h-[50vh]"><Spinner />…` |
| `app/(hra)/zamestnanci/skaut/page.tsx` | 164 | stránka | `if (loading && !data) return <div className="min-h-[40vh] flex items-center justify-center"><Spinner /></div>;` |
| `app/(hra)/zapas/[id]/page.tsx` | 143 | stránka | `if (loading) return <div className="page-container flex items-center justify-center min-h-[50vh]"><Spinner si…` |
| `app/(hra)/zapas/page.tsx` | 605 | stránka | `if (loading) return <div className="page-container flex items-center justify-center min-h-[50vh]"><Spinner />…` |
| `app/nova-sezona/page.tsx` | 41 | v textu nebo tlačítku | `if (loading) return <div className="min-h-dvh flex justify-center items-center bg-pitch-700"><Spinner /></div…` |
| `app/onboarding/page.tsx` | 257 | v textu nebo tlačítku | `{!access && !accessError ? <Spinner /> : <button className="btn btn-primary" onClick={() => setAccessAttempt(…` |
|  | 358 | v textu nebo tlačítku | `<Spinner />` |
| `components/league/league-stats.tsx` | 80 | sekce | `if (!loaded) return <div className="flex items-center justify-center py-12"><Spinner /></div>;` |
| `components/manager/CoachEducationTab.tsx` | 183 | sekce | `if (!data) return <div className="flex justify-center py-10"><Spinner /></div>;` |
| `components/manager/CoachKabinaTab.tsx` | 154 | sekce | `if (!data) return <div className="flex justify-center py-10"><Spinner /></div>;` |
| `components/match/live-match.tsx` | 116 | v textu nebo tlačítku | `<Spinner size="sm" />` |
| `components/onboarding/step-location.tsx` | 160 | stránka | `<div className="flex-1 flex items-center justify-center py-20"><Spinner /></div>` |
| `components/players/squad-analysis-tab.tsx` | 970 | sekce | `if (loading) return <div className="card p-6 flex items-center justify-center min-h-[120px]"><Spinner /></div…` |
| `components/players/squad-body-tab.tsx` | 81 | sekce | `if (loading) return <div className="card p-6 flex items-center justify-center min-h-[120px]"><Spinner /></div…` |
| `components/players/u21-attributes.tsx` | 37 | v textu nebo tlačítku | `if (!players) return <div className="flex justify-center p-8"><Spinner /></div>;` |
| `components/referees/disciplinary-panel.tsx` | 79 | sekce | `if (loading) return <div className="flex items-center justify-center py-12"><Spinner size="lg" /></div>;` |
| `components/relations/RelationSection.tsx` | 159 | v textu nebo tlačítku | `if (loading) return <div className="card p-4 sm:p-5 flex justify-center"><Spinner /></div>;` |
|  | 593 | sekce | `if (!relations) return <div className="flex justify-center py-10"><Spinner /></div>;` |
| `components/scouting/ScoutReportSheet.tsx` | 142 | sekce | `{!data && !error && <div className="py-8 flex justify-center"><Spinner /></div>}` |
| `components/sponsors/history-tab.tsx` | 24 | sekce | `if (!items) return <div className="flex justify-center py-8"><Spinner /></div>;` |
| `components/sponsors/popularity-tab.tsx` | 34 | sekce | `if (!overview) return <div className="flex justify-center py-8"><Spinner /></div>;` |

## errors: Chybové hlášky a červené rámečky

69 míst v 40 souborech.

Podle druhu: tón (mapa nebo podmínka) 31, hláška 22, tlačítko 16.

| Soubor | Řádek | Druh | Kód |
|---|---|---|---|
| `app/(hra)/finance/page.tsx` | 181 | hláška | `<div className="bg-red-50 border border-red-200 rounded-soft px-3 py-2 text-xs text-card-red max-w-sm">` |
|  | 766 | hláška | `{error && <div className="bg-red-50 border border-red-200 rounded-soft p-3 text-sm text-card-red">{error}</di…` |
| `app/(hra)/hrac/[id]/page.tsx` | 495 | tón (mapa nebo podmínka) | `const conditionFill = condition >= 80 ? tone.fill : condition >= 50 ? "bg-gold-400" : condition >= 20 ? "bg-o…` |
|  | 501 | hláška | `<span className="inline-flex items-center gap-1 bg-red-500/20 text-red-50 border border-red-300/30 rounded-co…` |
|  | 1007 | tón (mapa nebo podmínka) | `red: "bg-red-50 text-card-red border-red-200",` |
|  | 1245 | tón (mapa nebo podmínka) | `const tone = band.tone === "good" ? "bg-pitch-500" : band.tone === "neutral" ? "bg-amber-400" : "bg-red-500";` |
|  | 1653 | hláška | `<Filter id="L" label="Prohry" count={lossesCount} color="bg-red-500" />` |
|  | 1774 | tón (mapa nebo podmínka) | `m.reason === "Zranění" ? "bg-red-50 text-red-700"` |
| `app/(hra)/incidenty/DetailIncidentu.tsx` | 418 | hláška | `className="w-full px-3 py-2 rounded-soft text-sm font-heading font-bold border border-red-200 text-card-red d…` |
| `app/(hra)/manazer/[id]/page.tsx` | 276 | tón (mapa nebo podmínka) | `red: "bg-red-50 text-card-red border-red-200",` |
| `app/(hra)/muj-klub/hymna/page.tsx` | 326 | hláška | `<div className="mt-3 p-3 rounded-soft bg-red-50 border border-red-200 text-sm text-red-800">` |
| `app/(hra)/muj-klub/maskot/page.tsx` | 271 | hláška | `<div className="p-3 rounded-soft bg-red-50 border border-red-200 text-sm text-red-800">{error}</div>` |
| `app/(hra)/muj-klub/page.tsx` | 333 | hláška | `<div className="p-4 rounded-soft bg-red-50 border border-red-200 text-red-800 text-sm font-heading font-bold …` |
| `app/(hra)/napoveda/page.tsx` | 128 | tón (mapa nebo podmínka) | `const styleBg = f.style === "offensive" ? "bg-red-50 border-red-200"` |
| `app/(hra)/nastaveni/page.tsx` | 208 | tón (mapa nebo podmínka) | `<div className={`text-sm font-heading font-bold px-3 py-2 rounded-soft ${status.type === "ok" ? "bg-pitch-50 …` |
| `app/(hra)/obec/page.tsx` | 836 | tón (mapa nebo podmínka) | `bad: "bg-red-50 text-card-red",` |
| `app/(hra)/pratelaky/friendly-ui.tsx` | 233 | tón (mapa nebo podmínka) | `red: "bg-red-50 text-card-red border-red-100",` |
| `app/(hra)/prestupy/jednani/[id]/page.tsx` | 66 | tón (mapa nebo podmínka) | `refused: "bg-red-50 text-red-700",` |
|  | 67 | tón (mapa nebo podmínka) | `broken_off: "bg-red-50 text-red-700",` |
| `app/(hra)/prestupy/nabidka/[id]/components/InterestBadge.tsx` | 15 | hláška | `3: { chip: "bg-red-50 text-red-700 border border-red-200", dot: "bg-red-500" },` |
| `app/(hra)/prestupy/page.tsx` | 2276 | tón (mapa nebo podmínka) | `o.player_interest >= 3 ? "bg-red-50 text-red-700 border border-red-200"` |
|  | 2281 | tón (mapa nebo podmínka) | `<span className={`w-1.5 h-1.5 rounded-full ${o.player_interest >= 3 ? "bg-red-500" : o.player_interest === 2 …` |
|  | 2853 | tlačítko | `className="w-full text-left rounded-xl bg-white border border-gray-200 hover:border-card-red hover:bg-red-50 …` |
| `app/(hra)/sponzor/[id]/jednani/page.tsx` | 267 | hláška | `{error && <div className="text-sm text-card-red bg-red-50 border border-red-200 rounded-soft px-3 py-2">{erro…` |
| `app/(hra)/sponzori/page.tsx` | 353 | hláška | `<div className="text-sm text-card-red bg-red-50 border border-red-200 rounded-soft px-3 py-2">{actionError}</…` |
| `app/(hra)/stadion/page.tsx` | 1551 | tlačítko | `className="min-h-11 w-full sm:w-auto px-4 py-2 rounded-soft text-sm font-heading font-bold border-2 border-re…` |
| `app/(hra)/trener/test/page.tsx` | 368 | tón (mapa nebo podmínka) | `<div className={`sticky top-0 z-10 card p-3 flex items-center justify-between ${low ? "bg-red-50 border borde…` |
|  | 448 | tón (mapa nebo podmínka) | `<div className={`card p-5 sm:p-6 border-2 ${result.passed ? "border-pitch-500 bg-pitch-50" : "border-red-300 …` |
|  | 491 | tón (mapa nebo podmínka) | `: chosen && !r.isCorrect ? "border-red-300 bg-red-50 text-red-800"` |
| `app/(hra)/trenink/page.tsx` | 580 | tón (mapa nebo podmínka) | `s.verdict === "pretizeny" ? "bg-red-50 text-card-red" : "bg-gold-300/20 text-gold-700"` |
|  | 720 | tón (mapa nebo podmínka) | `<span className="px-1.5 py-0.5 rounded bg-red-50 text-card-red text-micro font-heading font-bold">{absentList…` |
| `app/(hra)/tym/[id]/page.tsx` | 506 | tón (mapa nebo podmínka) | `const bg = value >= 60 ? "bg-pitch-50 text-pitch-700" : value >= 40 ? "bg-gray-100 text-ink" : "bg-red-50 tex…` |
| `app/(hra)/u21/page.tsx` | 314 | hláška | `<div className="card border-l-4 border-card-red bg-red-50 p-3 text-sm text-red-800">` |
| `app/(hra)/udalosti/DistrictEvents.tsx` | 47 | tón (mapa nebo podmínka) | `bad: "bg-red-50 text-card-red",` |
| `app/(hra)/udalosti/page.tsx` | 92 | tón (mapa nebo podmínka) | `bad: "bg-red-50 text-card-red",` |
| `app/(hra)/vice/page.tsx` | 266 | tlačítko | `className="w-full mt-6 py-3 rounded-xl text-center text-sm font-heading font-bold text-card-red bg-red-50 hov…` |
| `app/(hra)/zamestnanci/skaut/page.tsx` | 413 | tlačítko | `<button onClick={stop} className="w-full py-2.5 rounded-xl font-heading font-bold border-2 border-red-200 tex…` |
|  | 429 | tlačítko | `<button onClick={stop} className="w-full py-2.5 rounded-xl font-heading font-bold border-2 border-red-200 tex…` |
|  | 445 | tlačítko | `<button onClick={stop} className="w-full py-2.5 rounded-xl font-heading font-bold border-2 border-red-200 tex…` |
|  | 481 | tlačítko | `<button onClick={stop} className="w-full py-2.5 rounded-xl font-heading font-bold border-2 border-red-200 tex…` |
|  | 502 | tlačítko | `className="px-3 py-2 rounded-control text-meta font-bold border border-red-200 text-red-700 bg-white hover:bg…` |
| `app/(hra)/zapas/[id]/page.tsx` | 600 | hláška | `FWD: { label: "Útok", bg: "bg-red-50", border: "border-l-red-400", text: "text-red-700" },` |
| `app/(hra)/zapas/page.tsx` | 113 | tón (mapa nebo podmínka) | `className={`ml-1 text-micro font-heading font-bold px-1 rounded ${good ? "bg-pitch-50 text-pitch-700" : "bg-r…` |
|  | 1302 | tón (mapa nebo podmínka) | `r.type === "rivals" \|\| r.type === "in_laws" ? "bg-red-50 text-card-red" : "bg-pitch-50 text-pitch-600"` |
| `components/MatchBreakdown.tsx` | 57 | tón (mapa nebo podmínka) | `HIGH_NEGATIVE: "border-red-300 bg-red-50 text-red-900",` |
| `components/dashboard/widgets/items/shared.tsx` | 63 | tón (mapa nebo podmínka) | `const bg = value >= 60 ? "bg-pitch-50 text-pitch-700" : value >= 40 ? "bg-gray-100 text-ink" : "bg-red-50 tex…` |
| `components/dashboard/widgets/widget-frame.tsx` | 128 | tlačítko | `className="w-8 h-8 rounded-control bg-white text-card-red hover:bg-red-50 transition-colors font-bold"` |
| `components/manager/CoachEducationTab.tsx` | 294 | hláška | `<div className="mt-3 rounded-soft bg-red-50 border border-red-200 p-3 text-sm text-red-800">` |
| `components/manager/CoachKabinaTab.tsx` | 73 | hláška | `const TONE_BAR: Record<string, string> = { good: "bg-pitch-500", neutral: "bg-amber-400", bad: "bg-red-500" };` |
|  | 109 | tón (mapa nebo podmínka) | `delta > 0 ? "bg-pitch-50 text-pitch-600" : delta < 0 ? "bg-red-50 text-card-red" : "bg-gray-50 text-muted"` |
|  | 128 | tón (mapa nebo podmínka) | `tone === "bad" ? "bg-red-50 text-red-700 border-red-200" : "bg-amber-50 text-amber-800 border-amber-200"` |
|  | 197 | tlačítko | `onlyTrouble ? "bg-red-50 text-red-700 border-red-200" : "bg-surface text-muted border-gray-100 hover:text-ink"` |
| `components/manager/EditManagerModal.tsx` | 167 | hláška | `<div className="text-sm text-card-red bg-red-50 border border-red-200 rounded-soft px-3 py-2">` |
| `components/players/academy-card.tsx` | 234 | hláška | `<div className="card p-3 text-sm border-l-4 border-red-400 bg-red-50 flex flex-wrap items-center justify-betw…` |
|  | 489 | hláška | `{p.weakness && <span className="rounded-full bg-red-50 px-2 py-0.5 text-xs text-red-700">slabina: {p.weakness…` |
| `components/relations/RelationSection.tsx` | 80 | tón (mapa nebo podmínka) | `rival: "bg-red-50 text-red-700 border border-red-200",` |
|  | 202 | tlačítko | `className={`${BTN} bg-red-50 border-red-200 hover:bg-red-100`}>` |
|  | 220 | tlačítko | `className={`${BTN} bg-red-50 border-red-200 hover:bg-red-100`}>` |
|  | 280 | tlačítko | `className={`${BTN} bg-red-50 border-red-200 hover:bg-red-100`}>` |
|  | 292 | tlačítko | `className={`${BTN} bg-red-50 border-red-200 hover:bg-red-100`}>` |
|  | 399 | tlačítko | `className={`${BTN} bg-red-50 border-red-200 hover:bg-red-100`}>` |
|  | 505 | tlačítko | `className={`${BTN} bg-red-50 border-red-200 hover:bg-red-100`}>` |
| `components/scouting/WillingnessBadge.tsx` | 6 | hláška | `0: { chip: "bg-red-50 text-red-700 border border-red-200", dot: "bg-red-500" },` |
| `components/sponsors/contracts-tab.tsx` | 74 | hláška | `<div className="text-sm text-card-red bg-red-50 border border-red-200 rounded-soft px-3 py-2">` |
| `components/sponsors/history-tab.tsx` | 22 | hláška | `return <div className="text-sm text-card-red bg-red-50 border border-red-200 rounded-soft px-3 py-2">Historii…` |
| `components/sponsors/negotiation/owner-reply-dialog.tsx` | 14 | tón (mapa nebo podmínka) | `reject: "bg-red-50 text-card-red",` |
|  | 15 | tón (mapa nebo podmínka) | `insulted: "bg-red-50 text-card-red",` |
|  | 16 | tón (mapa nebo podmínka) | `walked_away: "bg-red-50 text-card-red",` |
| `components/sponsors/popularity-tab.tsx` | 32 | hláška | `return <div className="text-sm text-card-red bg-red-50 border border-red-200 rounded-soft px-3 py-2">Přehled …` |

## money: Částky v Kč

75 míst v 39 souborech.

Podle druhu: přímo v textu 57, funkce 18.

| Soubor | Řádek | Druh | Kód |
|---|---|---|---|
| `app/(hra)/fanousci/page.tsx` | 388 | funkce | `const priceStr = promotionPrice != null ? `${promotionPrice.toLocaleString("cs")} Kč` : "500–2 500 Kč";` |
|  | 718 | přímo v textu | `{promotionPrice.toLocaleString("cs")} Kč` |
| `app/(hra)/hrac/[id]/page.tsx` | 645 | přímo v textu | `? ` · hostování za ${player.loan.fee.toLocaleString("cs")} Kč`` |
|  | 743 | přímo v textu | `: `Na trhu za ${myListing.askingPrice.toLocaleString("cs")} Kč`}</span>` |
|  | 1078 | přímo v textu | `<DetailRow label="Mzda" value={`${player.weekly_wage.toLocaleString("cs")} Kč/týd`} />` |
|  | 1085 | přímo v textu | `? `${value.toLocaleString("cs")} Kč`` |
|  | 1086 | přímo v textu | `: `cca ${marketValueEstimate(value).toLocaleString("cs")} Kč`;` |
|  | 1222 | přímo v textu | `? `Výměna za: ${c.swapPartner}${c.fee > 0 ? ` · doplatek ${c.fee.toLocaleString("cs")} Kč` : ""}`` |
|  | 1224 | přímo v textu | `? `Přestupní částka: ${c.fee.toLocaleString("cs")} Kč${c.installments ? ` · na splátky (${c.installments}× tý…` |
| `app/(hra)/incidenty/page.tsx` | 112 | přímo v textu | `meta={`Oprava ${p.cost.toLocaleString("cs-CZ")} Kč · o ${p.levels} ${p.levels === 1 ? "úroveň" : "úrovně"}`}` |
| `app/(hra)/muj-klub/page.tsx` | 206 | přímo v textu | `if (!window.confirm(`Opravdu chceš zakoupit šablonu "${tpl.name}" za ${tpl.price.toLocaleString("cs")} Kč?`))…` |
|  | 231 | přímo v textu | `if (!window.confirm(`Opravdu chceš zakoupit vylepšení "${add.name}" za ${add.price.toLocaleString("cs")} Kč?`…` |
|  | 461 | přímo v textu | `Vyžaduje modul {CLUB_WEBSITE_ADDONS.press_officer.name} ({CLUB_WEBSITE_ADDONS.press_officer.price.toLocaleStr…` |
|  | 498 | přímo v textu | `Vyžaduje modul {CLUB_WEBSITE_ADDONS.sponsor_banner.name} ({CLUB_WEBSITE_ADDONS.sponsor_banner.price.toLocaleS…` |
|  | 570 | přímo v textu | `{tpl.price === 0 ? "Zdarma" : `${tpl.price.toLocaleString("cs")} Kč`}` |
|  | 638 | přímo v textu | `{add.price.toLocaleString("cs")} Kč` |
| `app/(hra)/obec/page.tsx` | 403 | přímo v textu | `? `Hotovo, obec přispěla ${res.offeredAmount?.toLocaleString("cs")} Kč.`` |
|  | 567 | přímo v textu | `{ text: `obec dá ${i.offered_amount.toLocaleString("cs-CZ")} Kč`, tone: "good" },` |
|  | 568 | přímo v textu | `{ text: `ty doplatíš ${i.required_contribution.toLocaleString("cs-CZ")} Kč`, tone: "bad" },` |
|  | 585 | přímo v textu | `{ text: `−${p.cost_money.toLocaleString("cs-CZ")} Kč`, tone: "bad" },` |
|  | 672 | přímo v textu | `{!slotTakenByMe && !slotTakenByOther && !myInv && <span className="block text-xs text-muted mt-0.5">dárek {gi…` |
| `app/(hra)/pohar/page.tsx` | 146 | přímo v textu | `<div className="font-heading font-bold tabular-nums text-base leading-tight">{p.prize.toLocaleString("cs")} K…` |
|  | 160 | přímo v textu | `note={myEarnings > 0 ? `${status}, vyděláno ${myEarnings.toLocaleString("cs")} Kč` : status}` |
| `app/(hra)/pratelaky/friendly-ui.tsx` | 94 | funkce | `export const formatCZK = (v: number) => `${v.toLocaleString("cs")} Kč`;` |
| `app/(hra)/prestupy/DemandsTab.tsx` | 57 | funkce | `const formatCZK = (v: number) => `${v.toLocaleString("cs")}\u00a0Kč`;` |
| `app/(hra)/prestupy/ObligationsTab.tsx` | 33 | funkce | `const kc = (v: number) => `${v.toLocaleString("cs-CZ")} Kč`;` |
| `app/(hra)/prestupy/hostovani/[id]/page.tsx` | 20 | funkce | `const kc = (v: number) => `${v.toLocaleString("cs-CZ")} Kč`;` |
| `app/(hra)/prestupy/jednani/[id]/page.tsx` | 274 | přímo v textu | `<div className="font-heading font-[900] text-2xl tabular-nums mt-1">{n.terms.amount.toLocaleString("cs")} Kč<…` |
|  | 306 | přímo v textu | `Podpisem zaplatíš hned {payNow.toLocaleString("cs")} Kč{n.terms.installments > 0 ? `, zbytek ve ${n.terms.ins…` |
| `app/(hra)/prestupy/nabidka/[id]/components/ActionBar.tsx` | 82 | přímo v textu | `? `Přijetím zaplatíš hned ${payNow.toLocaleString("cs")} Kč${terms.installments > 0 ? `, zbytek ve ${terms.in…` |
|  | 83 | přímo v textu | `: `Kupující při přijetí pošle hned ${(payNow - adminFee).toLocaleString("cs")} Kč${terms.installments > 0 ? `…` |
|  | 89 | přímo v textu | `<div className="flex justify-between gap-3"><span>Doplacení splátek pro {saleDeductions.settleTo}</span><span…` |
|  | 92 | přímo v textu | `<div className="flex justify-between gap-3"><span>{saleDeductions.sellOnPct} % pro {saleDeductions.sellOnTo}<…` |
|  | 96 | přímo v textu | `<span className="font-heading font-bold">{(currentAmount - saleDeductions.settle - saleDeductions.sellOn).toL…` |
| `app/(hra)/prestupy/nabidka/[id]/components/OfferTimeline.tsx` | 122 | přímo v textu | `{e.amount > 0 ? `${e.amount.toLocaleString("cs")} Kč` : hasSwap ? "bez doplatku" : "zdarma"}` |
| `app/(hra)/prestupy/nabidka/[id]/components/PlayerHero.tsx` | 125 | přímo v textu | `{currentAmount > 0 ? `${currentAmount.toLocaleString("cs")} Kč` : offeredPlayers.length > 0 ? "Bez doplatku" …` |
|  | 138 | přímo v textu | `+ administrační poplatek {adminFee.toLocaleString("cs")} Kč` |
| `app/(hra)/prestupy/nabidka/[id]/components/TeamSide.tsx` | 102 | přímo v textu | `{team.budget.toLocaleString("cs")} Kč` |
| `app/(hra)/prestupy/page.tsx` | 1510 | přímo v textu | `trailing={<span className="text-body font-bold tabular-nums text-pitch-600">{s.earned.toLocaleString("cs")} K…` |
|  | 1528 | přímo v textu | `trailing={<span className="text-body font-bold tabular-nums text-card-red">{b.spent.toLocaleString("cs")} Kč<…` |
|  | 2093 | přímo v textu | `castka != null && castka > 0 ? `${castka.toLocaleString("cs")} Kč` : null, when \|\| null].filter(Boolean).jo…` |
| `app/(hra)/reputace/page.tsx` | 57 | funkce | `const CZK = (n: number) => `${n.toLocaleString("cs")} Kč`;` |
| `app/(hra)/rozpis/page.tsx` | 120 | funkce | `const priceStr = promotionPrice != null ? `${promotionPrice.toLocaleString("cs")} Kč` : "500–2 500 Kč";` |
|  | 195 | přímo v textu | `? <span className="hidden sm:inline">, zaplaceno {nextHome.promotionCost.toLocaleString("cs")} Kč</span>` |
| `app/(hra)/sazky/ui.tsx` | 31 | přímo v textu | `return `${n.toLocaleString("cs")} Kč`;` |
|  | 35 | přímo v textu | `return `${n > 0 ? "+" : n < 0 ? "−" : ""}${Math.abs(n).toLocaleString("cs")} Kč`;` |
| `app/(hra)/soutez/ui.tsx` | 21 | přímo v textu | `return `${Math.round(n).toLocaleString("cs")} Kč`;` |
|  | 26 | přímo v textu | `return `${n > 0 ? "+" : "−"}${Math.abs(Math.round(n)).toLocaleString("cs")} Kč`;` |
| `app/(hra)/trener/test/page.tsx` | 463 | přímo v textu | `Máš jeden opravný termín. Přihlásit se na něj můžeš v záložce Vzdělání (cena {result.retakePrice.toLocaleStri…` |
| `app/(hra)/turnaj/competition.tsx` | 88 | přímo v textu | `return `${n.toLocaleString("cs")} Kč`;` |
| `app/(hra)/turnaj/page.tsx` | 106 | přímo v textu | `return `${n.toLocaleString("cs")} Kč`;` |
| `app/(hra)/tym/[id]/TransferOverview.tsx` | 31 | funkce | `const fmtCZK = (v: number) => `${v.toLocaleString("cs")} Kč`;` |
| `app/(hra)/tym/[id]/page.tsx` | 309 | přímo v textu | `{isOwnTeam && <InfoRow label="Rozpočet" value={`${team.budget.toLocaleString("cs")} Kč`} />}` |
| `app/(hra)/zamestnanci/page.tsx` | 68 | funkce | `function czk(n: number): string { return `${n.toLocaleString("cs")} Kč`; }` |
| `app/(hra)/zamestnanci/skaut/page.tsx` | 85 | funkce | `const kc = (v: number) => `${v.toLocaleString("cs")} Kč`;` |
| `app/(hra)/zapas/BusSelector.tsx` | 208 | přímo v textu | `✓ {b.cost.toLocaleString("cs")} Kč` |
|  | 269 | přímo v textu | `{t.cost.toLocaleString("cs")} Kč` |
|  | 292 | přímo v textu | `: `Objednat za ${selectedTier.cost.toLocaleString("cs")} Kč`}` |
| `app/(hra)/zapas/[id]/page.tsx` | 453 | přímo v textu | `{inc.fine > 0 && `Pokuta ${inc.fine.toLocaleString("cs")} Kč. `}` |
| `components/dashboard/widgets/items/fan-groups-widgets.tsx` | 232 | přímo v textu | `{pokuty.toLocaleString("cs-CZ")} Kč` |
|  | 238 | přímo v textu | `{opravy.toLocaleString("cs-CZ")} Kč` |
|  | 249 | přímo v textu | `trailing={<span className="text-meta text-muted tabular-nums">{x.cost.toLocaleString("cs-CZ")} Kč</span>} />` |
| `components/dashboard/widgets/items/match-widgets.tsx` | 97 | funkce | `const priceStr = promotionPrice != null ? `${promotionPrice.toLocaleString("cs")} Kč` : "500–2 500 Kč";` |
| `components/manager/CoachEducationTab.tsx` | 79 | funkce | `const czk = (v: number) => `${v.toLocaleString("cs")} Kč`;` |
| `components/players/PlayerBrowseTable.tsx` | 88 | funkce | `const formatValue = (v: number) => `cca ${v.toLocaleString("cs")} Kč`;` |
|  | 89 | funkce | `const formatPrice = (v: number) => `${v.toLocaleString("cs")} Kč`;` |
| `components/players/academy-card.tsx` | 101 | funkce | `const kc = (n: number) => `${n.toLocaleString("cs")} Kč`;` |
| `components/referees/disciplinary-panel.tsx` | 58 | přímo v textu | `trailing={<RowValue tone="minus">−{f.amount.toLocaleString("cs")} Kč</RowValue>} />` |
|  | 118 | přímo v textu | `{total.toLocaleString("cs")} Kč` |
|  | 135 | přímo v textu | `trailing={<RowValue tone="minus">−{t.sum.toLocaleString("cs")} Kč</RowValue>} />` |
| `components/scouting/ScoutReportSheet.tsx` | 208 | přímo v textu | `<div><span className="text-muted">Klub si řekne asi </span><span className="font-heading font-bold tabular-nu…` |
|  | 211 | přímo v textu | `<div><span className="text-muted">Chce </span><span className="font-heading font-bold tabular-nums">{r.weekly…` |
| `components/staff/StaffTaskBox.tsx` | 43 | funkce | `function czk(n: number): string { return `${n.toLocaleString("cs")} Kč`; }` |
| `components/transfers/player-obligations.tsx` | 22 | funkce | `const kc = (v: number) => `${v.toLocaleString("cs-CZ")} Kč`;` |
| `components/transfers/transfer-terms.tsx` | 22 | funkce | `const kc = (v: number) => `${v.toLocaleString("cs-CZ")} Kč`;` |

## chips: Štítky (ručně stavěné pilulky)

57 míst v 31 souborech.

| Soubor | Řádek | Kód |
|---|---|---|
| `app/(hra)/aplikace/page.tsx` | 168 | `<span key={f} className="text-xs bg-pitch-50 text-pitch-700 font-heading font-bold px-2 py-1 rounded-full">` |
|  | 197 | `<span className="text-xs font-heading font-bold bg-pitch-50 text-pitch-700 px-2 py-0.5 rounded-full">` |
| `app/(hra)/hrac/[id]/page.tsx` | 545 | `<span className="bg-yellow-300 text-gray-900 text-xs font-heading font-bold px-2 py-0.5 rounded-full whitespa…` |
|  | 1226 | `trailing={<span className={`text-micro px-2 py-0.5 rounded-full font-bold whitespace-nowrap ${chip}`}>{c.join…` |
|  | 1785 | `<span className={`inline-block text-micro px-2 py-0.5 rounded-full font-bold whitespace-nowrap ${reasonColor}…` |
| `app/(hra)/incidenty/page.tsx` | 153 | `<span className={`ml-2 align-middle inline-block px-2 py-0.5 rounded-full text-micro font-bold whitespace-now…` |
| `app/(hra)/muj-klub/hymna/page.tsx` | 186 | `{a.isSelected && <span className="text-micro font-bold bg-pitch-500 text-white px-2 py-0.5 rounded-full">AKTU…` |
| `app/(hra)/muj-klub/maskot/page.tsx` | 171 | `<span className="absolute top-2 left-2 text-micro font-bold bg-pitch-500 text-white px-2 py-0.5 rounded-full"…` |
| `app/(hra)/nastaveni/page.tsx` | 191 | `<span key={req} className={`text-micro px-1.5 py-0.5 rounded-full font-heading font-bold ${ok ? "bg-pitch-50 …` |
| `app/(hra)/obec/DistrictVillages.tsx` | 27 | `{shown.map((c) => <Badge key={c.id} club={c} size={size} />)}` |
|  | 105 | `leading={<Badge club={c} size={32} />}` |
| `app/(hra)/prestupy/hostovani/[id]/page.tsx` | 156 | `<span className={`text-xs font-heading font-bold px-2 py-0.5 rounded-full ${state.className}`}>{state.label}<…` |
| `app/(hra)/prestupy/nabidka/[id]/components/TeamSide.tsx` | 101 | `<span className="px-2 py-0.5 rounded-full bg-gray-100 text-xs font-heading font-bold tabular-nums">` |
|  | 106 | `<span className="px-2 py-0.5 rounded-full bg-gold-500/10 text-xs font-heading font-bold text-gold-600 tabular…` |
| `app/(hra)/prestupy/nabidka/[id]/page.tsx` | 230 | `<span className="px-3 py-1 rounded-full bg-gray-100 text-xs font-heading font-bold uppercase tracking-wider t…` |
| `app/(hra)/prestupy/page.tsx` | 107 | `<div key={p.id} className="inline-flex items-center gap-1.5 bg-gold-50 border border-gold-300/60 rounded-full…` |
|  | 228 | `<div className="absolute top-3 left-3 flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-pitch-500 text-wh…` |
|  | 1191 | `<span className="text-xs font-heading font-bold px-2 py-0.5 rounded-full bg-pitch-50 text-pitch-700">{loanTer…` |
|  | 2154 | `{isYouth && <span className="text-xs bg-pitch-100 text-pitch-700 px-2 py-0.5 rounded-full font-heading font-b…` |
|  | 2275 | `<span className={`inline-flex items-center gap-1 rounded-full text-micro font-heading font-bold px-2 py-0.5 ${` |
|  | 2475 | `<span className="text-xs px-2 py-0.5 rounded-full bg-gold-50 text-gold-700 font-heading font-bold">Z trhu</sp…` |
|  | 2549 | `<span className="text-xs px-2 py-0.5 rounded-full bg-gold-50 text-gold-700 font-heading font-bold">Z trhu</sp…` |
| `app/(hra)/sazky/ui.tsx` | 85 | `className="text-micro font-heading font-bold uppercase tracking-wide px-2 py-0.5 rounded-full"` |
| `app/(hra)/soutez/integrity-panel.tsx` | 205 | `trailing={<span className="text-micro font-bold uppercase tracking-wide px-2 py-0.5 rounded-full whitespace-n…` |
|  | 236 | `trailing={<span className="text-micro font-bold uppercase tracking-wide px-2 py-0.5 rounded-full whitespace-n…` |
| `app/(hra)/soutez/ui.tsx` | 156 | `className="text-xs font-semibold px-2 py-1 rounded-full shrink-0 whitespace-nowrap"` |
| `app/(hra)/udalosti/DistrictEvents.tsx` | 99 | `<span className="inline-block mt-1.5 text-xs font-heading font-bold px-2 py-0.5 rounded-full bg-surface text-…` |
| `app/(hra)/vice/page.tsx` | 84 | `<span className={`absolute top-2 right-2 ${badge.bg ?? "bg-card-red"} text-white text-[11px] font-bold min-w-…` |
|  | 89 | `<span className={`absolute top-2 right-2 ${badge.bg ?? "bg-pitch-500"} text-white text-[10px] font-bold h-[21…` |
|  | 232 | `<span className="bg-card-red text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full shrink-0">` |
|  | 237 | `<span className="bg-pitch-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full shrink-0">` |
| `app/(hra)/zamestnanci/page.tsx` | 390 | `<span className={`ml-2 align-middle inline-block rounded-full bg-surface-3 px-2 py-0.5 text-micro font-bold t…` |
| `components/dashboard/bottom-nav.tsx` | 142 | `<span className="absolute top-0 right-2 bg-card-red text-white text-[9px] font-bold min-w-[16px] h-4 px-1 rou…` |
| `components/dashboard/fm-sidebar.tsx` | 19 | `const MENU_BADGE = "inline-flex items-center justify-center min-w-[18px] h-[18px] px-1.5 rounded-full text-wh…` |
|  | 202 | `<span className="flex items-center gap-1 text-micro font-heading font-bold uppercase tracking-wider bg-white/…` |
| `components/dashboard/gremium-vyveska.tsx` | 69 | `className="inline-block text-micro font-bold px-2 py-0.5 rounded-full shrink-0 whitespace-nowrap"` |
| `components/manager/CoachEducationTab.tsx` | 217 | `<span className="text-xs font-heading font-bold px-2.5 py-0.5 rounded-full bg-pitch-600 text-white">` |
|  | 222 | `<span className="text-xs font-heading font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-900 border b…` |
|  | 396 | `<span className="text-xs font-heading font-bold px-2 py-0.5 rounded-full bg-pitch-50 text-pitch-700 border bo…` |
| `components/match/live-match.tsx` | 84 | `className={`px-3 py-1 rounded-full text-xs font-heading font-bold transition-colors ${` |
| `components/players/academy-card.tsx` | 480 | `{p.promising && <span className="ml-2 align-middle rounded-full bg-pitch-50 px-2 py-0.5 text-micro font-bold …` |
|  | 481 | `{p.coachSon && <span className="ml-2 align-middle rounded-full bg-gold-50 px-2 py-0.5 text-micro font-bold te…` |
|  | 488 | `{p.strengths.map((st) => <span key={st} className="rounded-full bg-pitch-50 px-2 py-0.5 text-xs font-semibold…` |
|  | 489 | `{p.weakness && <span className="rounded-full bg-red-50 px-2 py-0.5 text-xs text-red-700">slabina: {p.weakness…` |
|  | 649 | `<span className="flex flex-wrap gap-1.5">{t.strengths.map((x) => <span key={x} className="rounded-full bg-pit…` |
| `components/players/promise-card.tsx` | 51 | `<span className="ml-1.5 text-micro bg-amber-100 text-amber-800 font-heading font-bold px-1.5 py-0.5 rounded-f…` |
| `components/players/reveal-card.tsx` | 191 | `<span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-micro font-heading font-bold …` |
| `components/players/squad-attribute-table.tsx` | 224 | `{p.loan_from_team_id && <span className="text-micro bg-yellow-100 text-yellow-700 font-bold px-1.5 py-0.5 rou…` |
|  | 226 | `{inj && <span className="text-micro bg-red-100 text-red-700 font-bold px-1.5 py-0.5 rounded-full cursor-help"…` |
|  | 227 | `{abs && <span className="text-micro bg-amber-100 text-amber-700 font-bold px-1.5 py-0.5 rounded-full cursor-h…` |
| `components/players/u21-rozvoj.tsx` | 255 | `<span className={`text-micro px-2 py-0.5 rounded-full font-heading font-bold whitespace-nowrap ${k.barva}`}>` |
|  | 271 | `<span className={`text-micro px-2 py-0.5 rounded-full font-heading font-bold border whitespace-nowrap ${ramec…` |
| `components/relations/RelationSection.tsx` | 71 | `<span className="text-xs font-heading font-bold px-2 py-0.5 rounded-full bg-amber-50 text-amber-800 border bo…` |
|  | 88 | `<span className={`text-xs font-heading font-bold px-2 py-0.5 rounded-full ${STATUS_STYLES[status.key] ?? "bg-…` |
| `components/transfers/loan-status-card.tsx` | 49 | `<span className={`text-xs font-heading font-bold px-2 py-0.5 rounded-full ${state.className}`}>{state.label}<…` |
| `components/transfers/origin-badge.tsx` | 5 | `<span className="mr-1.5 px-1.5 rounded-full text-micro font-heading font-bold bg-sky-50 text-sky-700 border b…` |
| `components/transfers/revealed-potential.tsx` | 36 | `className="inline-block text-xs font-heading font-bold px-2 py-0.5 rounded-full bg-gold-50 text-gold-700 whit…` |

## progress: Proužky průběhu

40 míst v 29 souborech.

| Soubor | Řádek | Kód |
|---|---|---|
| `app/(hra)/fanousci/FanGroupsPanel.tsx` | 152 | `<div className="mt-1 h-2 w-full rounded-full bg-gray-100 overflow-hidden">` |
| `app/(hra)/fanousci/page.tsx` | 630 | `<div className="h-3 bg-gray-100 rounded-full overflow-hidden">` |
| `app/(hra)/fanousci/vudce/[id]/page.tsx` | 129 | `<div className="flex-1 h-2 rounded-full bg-ink/10 overflow-hidden">` |
| `app/(hra)/finance/page.tsx` | 724 | `<div className="h-2 bg-gray-200 rounded-full overflow-hidden">` |
|  | 895 | `<div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">` |
| `app/(hra)/hlasovani/page.tsx` | 90 | `<span className="block h-2 bg-gray-100 rounded-full overflow-hidden">` |
|  | 105 | `<span className="block h-2 bg-gray-100 rounded-full overflow-hidden">` |
| `app/(hra)/hrac/[id]/PlayerCompare.tsx` | 289 | `<div className="h-2.5 rounded-full bg-gray-100 flex justify-end overflow-hidden">` |
|  | 296 | `<div className="h-2.5 rounded-full bg-gray-100 flex justify-start overflow-hidden">` |
| `app/(hra)/hrac/[id]/page.tsx` | 1253 | `<div className="h-2 bg-gray-100 rounded-full overflow-hidden">` |
|  | 1453 | `<div className="flex-1 h-2 rounded-full bg-gray-100 overflow-hidden">` |
| `app/(hra)/kalendar/page.tsx` | 87 | `<div className="h-2 bg-gray-100 rounded-full overflow-hidden">` |
| `app/(hra)/manazer/[id]/page.tsx` | 502 | `<div className="relative h-2 rounded-full bg-gray-100 overflow-hidden mb-1.5">` |
| `app/(hra)/obec/page.tsx` | 272 | `<div className="h-2 w-full rounded-full bg-gray-100 overflow-hidden">` |
| `app/(hra)/prestupy/ObligationsTab.tsx` | 54 | `<span className="block h-2 mt-1.5 rounded-full bg-gray-100 overflow-hidden" aria-label={`Splaceno ${pct} %`}>` |
| `app/(hra)/prestupy/page.tsx` | 1512 | `<span className="block bg-gray-100 rounded-full h-1.5 overflow-hidden mt-1">` |
|  | 1530 | `<span className="block bg-gray-100 rounded-full h-1.5 overflow-hidden mt-1">` |
| `app/(hra)/rozhodci/[id]/page.tsx` | 109 | `<div className="flex-1 h-2 rounded-full bg-ink/10 overflow-hidden">` |
| `app/(hra)/trenink/page.tsx` | 495 | `<div className="flex h-2 rounded-full overflow-hidden bg-gray-100">` |
|  | 728 | `<div className="mt-2.5 bg-gray-100 rounded-full h-1.5 overflow-hidden">` |
|  | 795 | `<span className="flex-1 bg-gray-100 rounded-full h-1.5 overflow-hidden min-w-0">` |
|  | 818 | `<span className="flex-1 bg-gray-100 rounded-full h-1.5 overflow-hidden min-w-0">` |
|  | 906 | `<span className="w-16 sm:w-24 bg-gray-100 rounded-full h-1.5 overflow-hidden" aria-hidden="true">` |
|  | 930 | `<span className="flex-1 bg-gray-100 rounded-full h-1.5 overflow-hidden">` |
| `app/(hra)/zapas/[id]/page.tsx` | 687 | `<span className="w-12 h-1.5 rounded-full bg-gray-100 overflow-hidden hidden sm:block" title={matchRating != n…` |
| `app/(hra)/zapas/page.tsx` | 1292 | `<div className="flex-1 bg-gray-100 rounded-full h-2 overflow-hidden">` |
| `components/dashboard/widgets/items/fan-groups-widgets.tsx` | 28 | `<span className="block h-1.5 rounded-full bg-gray-100 overflow-hidden">` |
| `components/manager/CoachEducationTab.tsx` | 265 | `<div className="h-2 rounded-full bg-gray-100 overflow-hidden">` |
| `components/manager/CoachKabinaTab.tsx` | 215 | `<span className="block h-1.5 rounded-full bg-gray-100 overflow-hidden mt-1">` |
| `components/match/referee-card.tsx` | 87 | `<div className="flex-1 h-2 rounded-full bg-ink/10 overflow-hidden">` |
| `components/players/academy-card.tsx` | 189 | `<div className="relative h-3 rounded-full bg-gray-200 overflow-hidden">` |
| `components/players/potential-progress.tsx` | 152 | `<div className="relative h-2.5 rounded-full bg-gray-100 overflow-hidden">` |
| `components/players/reveal-card.tsx` | 205 | `<div className="flex-1 h-2.5 bg-gray-100 rounded-full overflow-hidden">` |
| `components/players/squad-analysis-tab.tsx` | 354 | `<div className="h-2.5 rounded-full bg-gray-100 flex justify-end overflow-hidden">` |
|  | 358 | `<div className="h-2.5 rounded-full bg-gray-100 flex justify-start overflow-hidden">` |
| `components/players/u21-rozvoj.tsx` | 278 | `<span className="block relative h-2 rounded-full bg-gray-100 overflow-hidden mt-2 mb-1.5">` |
| `components/relations/RelationSection.tsx` | 102 | `<div className="h-2 rounded-full bg-gray-100 overflow-hidden relative">` |
| `components/sponsors/owner-card.tsx` | 93 | `<div className="h-2 rounded-full bg-gray-100 mt-1 overflow-hidden">` |
| `components/sponsors/popularity-tab.tsx` | 72 | `<div className="h-2.5 mt-1 rounded-full bg-surface-3 overflow-hidden"` |
| `components/sponsors/request-section.tsx` | 53 | `<div className="h-2 rounded-full bg-gray-100 mt-1 overflow-hidden">` |

## choices: Výběr z voleb (zvýraznění vybrané volby)

115 míst v 53 souborech.

| Soubor | Řádek | Kód |
|---|---|---|
| `app/(hra)/fanousci/ChoralyPanel.tsx` | 107 | `className={`rounded-lg border p-3 ${domaci ? "border-pitch-500 bg-pitch-50" : "border-line"}`}` |
| `app/(hra)/finance/page.tsx` | 897 | `className={`h-full ${positive ? "bg-pitch-500" : "bg-card-red"}`}` |
| `app/(hra)/hrac/[id]/PlayerCompare.tsx` | 174 | `other ? "border-pitch-500/40 text-ink" : "border-gray-200 text-muted"` |
| `app/(hra)/hrac/[id]/page.tsx` | 1245 | `const tone = band.tone === "good" ? "bg-pitch-500" : band.tone === "neutral" ? "bg-amber-400" : "bg-red-500";` |
|  | 1540 | `<div key={s.label} className={`p-3 rounded-soft ${s.highlight ? "bg-pitch-50 border border-pitch-100" : "bg-g…` |
| `app/(hra)/kalendar/page.tsx` | 153 | `<div key={i} className={`min-h-[60px] sm:min-h-[80px] border-b border-r border-gray-50 px-0.5 sm:px-1.5 py-1 …` |
| `app/(hra)/liga/page.tsx` | 250 | `<button key={l.id} type="button" aria-pressed={active}` |
|  | 252 | `className={`px-3 py-1.5 rounded-full text-sm font-heading font-bold transition-colors ${active ? "bg-pitch-60…` |
| `app/(hra)/muj-klub/dres/page.tsx` | 262 | `active ? "border-pitch-500 bg-pitch-50" : "border-gray-200 hover:border-gray-300 bg-white"` |
|  | 487 | `active ? "border-pitch-500 bg-pitch-50" : "border-gray-200 hover:border-gray-300 bg-white"` |
|  | 516 | `active ? "border-pitch-500 bg-pitch-50" : "border-gray-200 hover:border-gray-300 bg-white"` |
| `app/(hra)/muj-klub/hymna/page.tsx` | 181 | `<div key={a.id} className={`rounded-xl border-2 p-4 transition-colors ${a.isSelected ? "border-pitch-500 bg-p…` |
|  | 244 | `lyricsMode === "auto" ? "bg-pitch-500 text-white" : "bg-gray-100 text-ink hover:bg-gray-200"` |
|  | 250 | `lyricsMode === "custom" ? "bg-pitch-500 text-white" : "bg-gray-100 text-ink hover:bg-gray-200"` |
|  | 304 | `active ? "border-pitch-500 bg-pitch-50 text-pitch-700 font-bold" : "border-gray-200 hover:border-gray-300 bg-…` |
| `app/(hra)/muj-klub/identita/page.tsx` | 158 | `aria-pressed={active}` |
|  | 160 | `active ? "border-pitch-500 bg-pitch-500 text-white" : "border-gray-200 text-ink hover:border-pitch-300"` |
| `app/(hra)/muj-klub/maskot/page.tsx` | 166 | `<div key={m.id} className={`rounded-xl border-2 overflow-hidden transition-colors ${m.isSelected ? "border-pi…` |
|  | 236 | `active ? "border-pitch-500 bg-pitch-50" : "border-gray-200 hover:border-gray-300 bg-white"` |
|  | 254 | `active ? "border-pitch-500 bg-pitch-50 text-pitch-700 font-bold" : "border-gray-200 hover:border-gray-300 bg-…` |
| `app/(hra)/muj-klub/page.tsx` | 596 | `canAfford ? "bg-pitch-500 hover:bg-pitch-600 shadow" : "bg-gray-300 cursor-not-allowed"` |
|  | 654 | `canAfford ? "bg-pitch-500 hover:bg-pitch-600 shadow" : "bg-gray-300 cursor-not-allowed"` |
| `app/(hra)/nastaveni/page.tsx` | 191 | `<span key={req} className={`text-micro px-1.5 py-0.5 rounded-full font-heading font-bold ${ok ? "bg-pitch-50 …` |
|  | 208 | `<div className={`text-sm font-heading font-bold px-3 py-2 rounded-soft ${status.type === "ok" ? "bg-pitch-50 …` |
|  | 248 | `className={`relative inline-flex h-7 w-12 items-center rounded-full transition-colors flex-shrink-0 mt-1.5 di…` |
|  | 285 | `className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors disabled:opacity-40 flex…` |
| `app/(hra)/pratelaky/friendly-ui.tsx` | 124 | ``${CHIP} ${disabled ? "bg-black/5 text-muted/60 line-through cursor-not-allowed" : on ? "bg-pitch-500 text-wh…` |
|  | 240 | `const cls = result === "W" ? "bg-pitch-500" : result === "L" ? "bg-card-red" : "bg-gray-400";` |
| `app/(hra)/prestupy/DemandsTab.tsx` | 66 | `const chipClass = (on: boolean) => `${CHIP} ${on ? "bg-pitch-500 text-white" : "bg-black/5 text-ink hover:bg-…` |
| `app/(hra)/prestupy/jednani/[id]/page.tsx` | 361 | `className={`px-2.5 py-1 rounded text-sm font-heading font-bold tabular-nums transition-colors ${amount === pr…` |
| `app/(hra)/prestupy/nabidka/[id]/components/ActionBar.tsx` | 174 | `v === preset ? "bg-pitch-500 text-white" : "bg-black/5 text-muted hover:bg-black/10"` |
| `app/(hra)/prestupy/page.tsx` | 523 | `aria-pressed={aktivni === k}` |
|  | 525 | `aktivni === k ? "bg-pitch-500 text-white" : "bg-surface-2 text-muted hover:text-ink"` |
|  | 695 | `aria-pressed={on}` |
|  | 697 | `on ? "bg-pitch-500 text-white" : "bg-surface text-muted hover:text-ink"` |
|  | 1583 | `pocetDalsich > 0 ? "bg-pitch-500 text-white" : "bg-surface text-muted hover:text-ink"` |
|  | 1753 | `filterOpen \|\| activeCount > 0 ? "bg-pitch-500 text-white" : "bg-surface text-muted hover:text-ink"` |
|  | 1808 | `filters.ratingMin === v ? "bg-pitch-500 text-white" : "bg-surface text-muted hover:text-ink"` |
|  | 2035 | `className={`px-3 py-1.5 rounded-soft text-sm font-heading font-bold transition-colors ${offersView === "activ…` |
|  | 2041 | `className={`px-3 py-1.5 rounded-soft text-sm font-heading font-bold transition-colors ${offersView === "histo…` |
|  | 2902 | `className={`px-2.5 py-1 rounded text-sm font-heading font-bold transition-colors ${price === v ? "bg-pitch-50…` |
| `app/(hra)/reputace/page.tsx` | 386 | `m.reached ? "bg-pitch-600 border-white" : "bg-white border-gray-300"` |
| `app/(hra)/sazky/ui.tsx` | 17 | `type="button" onClick={onClick} aria-pressed={vybrano}` |
|  | 20 | `${vybrano ? "bg-pitch-500 text-white" : "bg-gray-50 text-ink hover:bg-gray-100 active:bg-gray-200"}`}` |
| `app/(hra)/stadion/page.tsx` | 432 | `aktivni === h.id ? "bg-pitch-500 text-white shadow-sm" : "text-muted hover:text-ink"` |
|  | 752 | `<div className={`rounded-lg p-3 space-y-2 ${previewing ? "bg-pitch-50 border border-pitch-400" : "bg-gray-50"…` |
|  | 1024 | `className={`flex items-center gap-2 px-3 py-2 rounded-soft border-2 transition-colors text-sm font-heading fo…` |
|  | 1042 | `className={`w-10 h-10 rounded-control border-2 flex items-center justify-center text-sm ${current === null ? …` |
|  | 1052 | `className={`w-10 h-10 rounded-control border-2 ${current === c ? "border-pitch-500" : "border-gray-200 hover:…` |
| `app/(hra)/trener/skripta/page.tsloading: 95 míst / 74 souborů
x` | 142 | `i === index ? "bg-pitch-500 text-white border-pitch-500" : "bg-surface text-ink border-gray-200 hover:border-…` |
| `app/(hra)/trener/test/page.tsx` | 392 | `selected ? "border-pitch-500 bg-pitch-50" : "border-gray-200 bg-white hover:border-pitch-300"` |
|  | 395 | `selected ? "bg-pitch-500 text-white" : "bg-surface text-muted"` |
|  | 423 | `} ${answers[i] >= 0 ? "bg-pitch-500 text-white" : "bg-surface text-muted"}`}` |
|  | 448 | `<div className={`card p-5 sm:p-6 border-2 ${result.passed ? "border-pitch-500 bg-pitch-50" : "border-red-300 …` |
|  | 492 | `: chosen ? "border-pitch-500 bg-pitch-50" : "border-transparent text-muted"` |
| `app/(hra)/trenink/page.tsx` | 265 | `val ? "border-pitch-500/40 text-ink" : "border-gray-200 text-muted"` |
| `app/(hra)/tym/[id]/page.tsx` | 256 | `f === "W" ? "bg-pitch-500" : f === "L" ? "bg-card-red" : "bg-gray-500"` |
|  | 506 | `const bg = value >= 60 ? "bg-pitch-50 text-pitch-700" : value >= 40 ? "bg-gray-100 text-ink" : "bg-red-50 tex…` |
| `app/(hra)/u21/page.tsx` | 401 | `{[true, false].map((own) => <button key={String(own)} aria-pressed={onlyOurMatches === own} onClick={() => se…` |
| `app/(hra)/vybaveni/BazarTab.tsx` | 73 | `onlyAvailable ? "bg-pitch-500 text-white" : "bg-surface text-muted hover:text-ink"` |
|  | 187 | `canBuy ? "bg-pitch-500 text-white hover:bg-pitch-600" : "bg-gray-100 text-gray-400 cursor-not-allowed"` |
| `app/(hra)/vybaveni/page.tsx` | 377 | `canUpgrade ? "bg-pitch-500 text-white hover:bg-pitch-600" : "bg-gray-100 text-gray-400 cursor-not-allowed"` |
| `app/(hra)/zamestnanci/skaut/page.tsx` | 278 | ``px-3 py-2 rounded-soft text-sm font-heading font-bold transition-colors ${active ? "bg-pitch-500 text-white"…` |
|  | 591 | `<button key={p} type="button" aria-pressed={positions.includes(p)} className={chip(positions.includes(p))} on…` |
|  | 664 | `<button key={p} type="button" aria-pressed={positions.includes(p)} className={chip(positions.includes(p))} on…` |
|  | 722 | `<button key={p} type="button" aria-pressed={positions.includes(p)} className={chip(positions.includes(p))} on…` |
|  | 784 | `className={`rounded-xl border-2 p-3 text-center transition-colors ${radius === t.km ? "border-pitch-500 bg-pi…` |
| `app/(hra)/zapas/[id]/page.tsx` | 576 | `lineupSort === "position" ? "bg-pitch-500 text-white" : "bg-gray-100 text-ink hover:bg-gray-200"` |
|  | 582 | `lineupSort === "rating" ? "bg-pitch-500 text-white" : "bg-gray-100 text-ink hover:bg-gray-200"` |
| `app/(hra)/zapas/page.tsx` | 113 | `className={`ml-1 text-micro font-heading font-bold px-1 rounded ${good ? "bg-pitch-50 text-pitch-700" : "bg-r…` |
|  | 1518 | `<span className={`w-3.5 h-3.5 rounded-full border-2 shrink-0 ${isSelected ? "border-pitch-600 bg-pitch-600" :…` |
| `components/dashboard/widgets/items/fan-groups-widgets.tsx` | 24 | `? (v >= 60 ? "bg-pitch-500" : v >= 35 ? "bg-amber-500" : "bg-card-red")` |
| `components/dashboard/widgets/items/league-widgets.tsx` | 128 | `p.avgRating >= 7 ? "bg-pitch-50 text-pitch-600" : "bg-gray-50 text-ink"` |
| `components/dashboard/widgets/items/match-widgets.tsx` | 50 | `<div className={`flex items-center gap-4 ${isMatchDay ? "rounded-xl ring-2 ring-pitch-400 bg-pitch-50/30 p-3 …` |
|  | 327 | `f === "W" ? "bg-pitch-500" : f === "L" ? "bg-card-red" : "bg-gray-300"` |
| `components/dashboard/widgets/items/shared.tsx` | 63 | `const bg = value >= 60 ? "bg-pitch-50 text-pitch-700" : value >= 40 ? "bg-gray-100 text-ink" : "bg-red-50 tex…` |
|  | 84 | `const cls = result === "W" ? "bg-pitch-500" : result === "L" ? "bg-card-red" : "bg-gray-400";` |
| `components/dashboard/widgets/widget-frame.tsx` | 81 | `dragging ? "ring-pitch-500 shadow-lg" : "ring-pitch-300"` |
|  | 145 | `aria-pressed={width === w}` |
|  | 148 | `width === w ? "bg-pitch-500 text-white" : "bg-white text-muted hover:bg-gray-100"` |
|  | 164 | `aria-pressed={height === h.value}` |
|  | 167 | `height === h.value ? "bg-pitch-500 text-white" : "bg-white text-muted hover:bg-gray-100"` |
|  | 181 | `aria-pressed={!tint}` |
|  | 184 | `!tint ? "ring-2 ring-pitch-500 ring-offset-1" : "ring-1 ring-gray-300"` |
|  | 193 | `aria-pressed={tint?.key === c.key}` |
|  | 196 | `tint?.key === c.key ? "ring-2 ring-pitch-500 ring-offset-1" : "ring-1 ring-black/10"` |
| `components/dashboard/widgets/widget-picker.tsx` | 117 | `already ? "bg-pitch-500 text-white" : "bg-gray-100 text-muted"` |
|  | 162 | `active ? "bg-pitch-500 text-white" : "bg-white text-muted hover:bg-gray-100 border border-gray-200"` |
| `components/manager/CoachKabinaTab.tsx` | 109 | `delta > 0 ? "bg-pitch-50 text-pitch-600" : delta < 0 ? "bg-red-50 text-card-red" : "bg-gray-50 text-muted"` |
| `components/match/live-match.tsx` | 99 | `className={`flex gap-3 items-start ${event.isGoal ? "bg-pitch-500/5 -mx-2 px-2 py-2 rounded-card" : ""}`}` |
| `components/onboarding/step-club-name.tsx` | 54 | `className={`p-4 rounded-xl text-center transition-all border-2 ${namingChoice === opt.key ? "border-pitch-500…` |
|  | 68 | `className={`p-3 rounded-xl text-sm font-heading font-bold transition-all border-2 ${teamName === n ? "border-…` |
|  | 90 | `className={`p-3 rounded-xl text-center transition-all border-2 text-sm ${stadiumChoice === opt.key ? "border-…` |
| `components/onboarding/step-team.tsx` | 273 | `className={`p-1.5 rounded-soft transition-all border-2 flex flex-col items-center ${jerseyPattern === jp.id ?…` |
|  | 287 | `className={`p-2 rounded-soft transition-all border-2 flex flex-col items-center ${badgePattern === bp.id ? "b…` |
| `components/players/academy-card.tsx` | 418 | `aria-pressed={active}` |
|  | 419 | `className={`w-full flex-1 text-left rounded-soft border p-3 min-h-11 transition-colors ${active ? "border-pit…` |
|  | 779 | `{[1, 2, 3].map((l) => <span key={l} className={`h-1.5 flex-1 rounded-full ${e.level >= l ? "bg-pitch-500" : "…` |
| `components/players/squad-analysis-tab.tsx` | 298 | `positive ? "bg-pitch-50 text-pitch-700" : "bg-card-red/10 text-card-red"` |
| `components/players/squad-attribute-table.tsx` | 162 | `aria-pressed={value === pos}` |
|  | 251 | `? <span className={`${VALUE_BADGE} ${attrBg(v)} ${isKey ? "ring-1 ring-pitch-500/40" : "opacity-40"}`}>{v}</s…` |
| `components/players/u21-rozvoj.tsx` | 283 | `className={`absolute inset-y-0 left-0 ${h.pripravenyDoAcka ? "bg-pitch-500" : "bg-pitch-300"}`}` |
| `components/players/youth-section-nav.tsx` | 28 | `active ? "border-pitch-500 bg-pitch-500 text-white" : "border-gray-200 bg-white text-ink hover:border-pitch-5…` |
| `components/scouting/ScoutReportSheet.tsx` | 303 | `className={`px-2.5 py-1 rounded text-sm font-heading font-bold tabular-nums transition-colors ${amount === pr…` |
| `components/sponsors/firms-tab.tsx` | 48 | `aria-pressed={active}` |
|  | 50 | `active ? "bg-pitch-500 text-white" : "bg-surface-2 text-muted hover:text-ink"` |
| `components/sponsors/negotiation/demands-form.tsx` | 112 | `key={n} type="button" aria-pressed={proposal.seasons === n}` |
|  | 114 | `className={`flex-1 min-h-11 rounded-control text-sm font-heading font-bold ${proposal.seasons === n ? "bg-pit…` |
| `components/sponsors/negotiation/promise-picker.tsx` | 44 | `<div key={kind} className={`rounded-soft border p-3 ${chosen ? "border-pitch-500 bg-pitch-50" : "border-line-…` |
|  | 46 | `type="button" onClick={() => toggle(kind)} disabled={disabled} aria-pressed={!!chosen}` |
| `components/sponsors/request-section.tsx` | 54 | `<div className={`h-full ${pct >= 100 ? "bg-pitch-500" : "bg-gold-500"}`} style={{ width: `${pct}%` }} />` |
| `components/staff/StaffTaskBox.tsx` | 347 | `<label key={p.id} className={`block ${disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer"} ${select…` |
| `components/transfers/loan-listing-dialog.tsx` | 42 | `className={`py-2 px-2 rounded-soft text-sm font-heading font-bold transition-colors ${days === d.days ? "bg-p…` |
|  | 64 | `className={`flex gap-3 items-start p-3 rounded-soft border cursor-pointer transition-colors ${playingTime ===…` |
| `components/transfers/revealed-potential.tsx` | 19 | `<label className={`flex gap-3 items-start p-3 rounded-soft border cursor-pointer transition-colors ${checked …` |

## dialogs: Dialogy a překrytí obrazovky

51 míst v 38 souborech.

Podle druhu: useConfirm bez plachty 19, Modal / ConfirmDialog 17, vlastní překrytí 10, window.confirm 5.

| Soubor | Řádek | Druh | Kód |
|---|---|---|---|
| `app/(hra)/fanousci/FanGroupsPanel.tsx` | 272 | useConfirm bez plachty | `const { confirm, dialog } = useConfirm();` |
| `app/(hra)/fanousci/page.tsx` | 307 | useConfirm bez plachty | `const { confirm, dialog: confirmDialog } = useConfirm();` |
| `app/(hra)/hrac/[id]/SquadNumberEditor.tsx` | 97 | Modal / ConfirmDialog | `<Modal isOpen={open} onClose={() => setOpen(false)} title="Číslo dresu" maxWidth="520px">` |
| `app/(hra)/hrac/[id]/page.tsx` | 176 | useConfirm bez plachty | `const { confirm, dialog: confirmDialog } = useConfirm();` |
|  | 1894 | vlastní překrytí | `<div className="fixed inset-0 z-[var(--z-sheet)] flex items-center justify-center bg-black/40 p-4">` |
|  | 1976 | vlastní překrytí | `<div className="fixed inset-0 z-[var(--z-sheet)] flex items-center justify-center bg-black/40 p-4">` |
| `app/(hra)/muj-klub/dres/page.tsx` | 633 | Modal / ConfirmDialog | `<Modal isOpen={zoomedKit !== null} onClose={() => setZoomedKit(null)} maxWidth="760px">` |
| `app/(hra)/muj-klub/page.tsx` | 206 | window.confirm | `if (!window.confirm(`Opravdu chceš zakoupit šablonu "${tpl.name}" za ${tpl.price.toLocaleString("cs")} Kč?`))…` |
|  | 231 | window.confirm | `if (!window.confirm(`Opravdu chceš zakoupit vylepšení "${add.name}" za ${add.price.toLocaleString("cs")} Kč?`…` |
| `app/(hra)/obec/page.tsx` | 934 | Modal / ConfirmDialog | `<Modal isOpen onClose={onClose} maxWidth="640px">` |
| `app/(hra)/prehled/page.tsx` | 40 | useConfirm bez plachty | `const { confirm, dialog: confirmDialog } = useConfirm();` |
| `app/(hra)/prestupy/hostovani/[id]/page.tsx` | 61 | useConfirm bez plachty | `const { confirm, dialog: confirmDialog } = useConfirm();` |
| `app/(hra)/prestupy/page.tsx` | 1361 | vlastní překrytí | `<div className="fixed inset-0 z-[var(--z-sheet)] flex items-center justify-center bg-black/70" onClick={() =>…` |
| `app/(hra)/rozpis/page.tsx` | 99 | useConfirm bez plachty | `const { confirm, dialog: confirmDialog } = useConfirm();` |
| `app/(hra)/soutez/club-audit-section.tsx` | 141 | Modal / ConfirmDialog | `<Modal isOpen={!!audit} onClose={() => setAudit(null)} title="Účetnictví klubu" maxWidth="640px">` |
| `app/(hra)/soutez/discipline.tsx` | 227 | Modal / ConfirmDialog | `<Modal isOpen onClose={onClose} title="Návrh na pokutu" zavritKlikemVedle={false}>` |
| `app/(hra)/soutez/integrity-panel.tsx` | 256 | Modal / ConfirmDialog | `<Modal isOpen={!!zabavit} onClose={() => setZabavit(null)} title="Zabavit výhru" zavritKlikemVedle={false}>` |
|  | 280 | Modal / ConfirmDialog | `<Modal isOpen={zablokovat} onClose={() => setZablokovat(false)} title="Zakázat klubu sázení" zavritKlikemVedl…` |
| `app/(hra)/soutez/page.tsx` | 837 | Modal / ConfirmDialog | `<Modal isOpen onClose={onClose} title="Nový návrh" zavritKlikemVedle={false}>` |
| `app/(hra)/soutez/panels.tsx` | 514 | Modal / ConfirmDialog | `<Modal isOpen onClose={onClose} title="Pozastavit pravomoc" zavritKlikemVedle={false}>` |
|  | 566 | Modal / ConfirmDialog | `<Modal isOpen onClose={onClose} title="Rezignovat na funkci" zavritKlikemVedle={false}>` |
|  | 695 | Modal / ConfirmDialog | `<Modal isOpen onClose={onClose} title="Žádost o dotaci" zavritKlikemVedle={false}>` |
|  | 788 | Modal / ConfirmDialog | `<Modal isOpen onClose={onClose} title="Návrh na dotaci" zavritKlikemVedle={false}>` |
| `app/(hra)/soutez/referees-panel.tsx` | 191 | Modal / ConfirmDialog | `<Modal isOpen onClose={onClose} title="Stopka rozhodčímu" zavritKlikemVedle={false}>` |
|  | 271 | Modal / ConfirmDialog | `<Modal isOpen onClose={onClose} title="Vyškrtnutí rozhodčího" zavritKlikemVedle={false}>` |
|  | 409 | Modal / ConfirmDialog | `<Modal isOpen onClose={onClose} title="Výměna rozhodčího" zavritKlikemVedle={false}>` |
| `app/(hra)/sponzor/[id]/jednani/page.tsx` | 71 | useConfirm bez plachty | `const { confirm, dialog } = useConfirm();` |
| `app/(hra)/sponzori/page.tsx` | 45 | useConfirm bez plachty | `const { confirm, dialog: confirmDialog } = useConfirm();` |
| `app/(hra)/stadion/page.tsx` | 515 | useConfirm bez plachty | `const { confirm, dialog: confirmDialog } = useConfirm();` |
| `app/(hra)/trener/skripta/page.tsx` | 126 | vlastní překrytí | `<div className="fixed inset-0 z-20 flex items-center justify-center" aria-live="polite">` |
| `app/(hra)/trener/test/page.tsx` | 227 | useConfirm bez plachty | `const { confirm, dialog } = useConfirm();` |
| `app/(hra)/u21/page.tsx` | 107 | useConfirm bez plachty | `const { confirm, dialog: confirmDialog } = useConfirm();` |
| `app/(hra)/udalosti/page.tsx` | 133 | useConfirm bez plachty | `const { confirm, dialog: confirmDialog } = useConfirm();` |
|  | 320 | useConfirm bez plachty | `const { confirm, dialog } = useConfirm();` |
| `app/(hra)/vybaveni/SellDialog.tsx` | 23 | useConfirm bez plachty | `// useConfirm() se tu použít nesmí: jeho dialog by se otevřel nad modalem a hráč` |
|  | 43 | Modal / ConfirmDialog | `<Modal isOpen={!!option} onClose={onClose} maxWidth="34rem">` |
| `app/(hra)/vybaveni/page.tsx` | 52 | useConfirm bez plachty | `const { confirm, dialog: confirmDialog } = useConfirm();` |
| `app/(hra)/zamestnanci/page.tsx` | 197 | useConfirm bez plachty | `const { confirm, dialog } = useConfirm();` |
| `app/(hra)/zapas/page.tsx` | 1382 | vlastní překrytí | `<div className="fixed inset-0 z-[var(--z-sheet)] bg-black/50" onClick={() => setEditSlot(null)} />` |
| `app/konec-sezony/page.tsx` | 99 | vlastní překrytí | `return <div className="fixed inset-0 bg-[#061106] flex items-center justify-center text-white/30 font-heading…` |
| `app/onboarding/page.tsx` | 356 | vlastní překrytí | `<div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[var(--z-sheet)]">` |
| `components/dashboard/announcement-dialog.tsx` | 98 | vlastní překrytí | `className="fixed inset-0 z-[var(--z-sheet)] flex items-end sm:items-center justify-center p-0 sm:p-4"` |
| `components/dashboard/widgets/items/match-widgets.tsx` | 83 | useConfirm bez plachty | `const { confirm, dialog: confirmDialog } = useConfirm();` |
| `components/dashboard/widgets/widget-picker.tsx` | 46 | Modal / ConfirmDialog | `<Modal isOpen={isOpen} onClose={onClose} maxWidth="760px">` |
| `components/manager/CoachEducationTab.tsx` | 123 | useConfirm bez plachty | `const { confirm, dialog } = useConfirm();` |
| `components/relations/RelationSection.tsx` | 140 | window.confirm | `if (confirmText && !window.confirm(confirmText)) return;` |
|  | 345 | window.confirm | `if (confirmText && !window.confirm(confirmText)) return;` |
|  | 463 | window.confirm | `if (choice === "jab" && !window.confirm("Rýpnutí vyjde v novinách a zvedne napětí. Pokračovat?")) return;` |
| `components/sponsors/negotiation/owner-reply-dialog.tsx` | 57 | vlastní překrytí | `<div className="fixed inset-0 z-[var(--z-dialog)] flex items-center justify-center p-4" onClick={onClose}>` |
| `components/sponsors/owner-card.tsx` | 47 | useConfirm bez plachty | `const { confirm, dialog } = useConfirm();` |
| `components/transfers/loan-listing-dialog.tsx` | 29 | vlastní překrytí | `<div className="fixed inset-0 z-[var(--z-sheet)] flex items-center justify-center bg-black/40 p-4">` |

## forms: Formulářová pole bez sdíleného vzhledu

58 míst v 26 souborech.

Podle druhu: textarea 25, input 22, select 11.

| Soubor | Řádek | Druh | Kód |
|---|---|---|---|
| `app/(hra)/muj-klub/hymna/page.tsx` | 259 | textarea | `<textarea value={hints} onChange={(e) => setHints(e.target.value.slice(0, 500))}` |
|  | 277 | input | `<input type="text" value={title} onChange={(e) => setTitle(e.target.value.slice(0, 100))}` |
|  | 282 | textarea | `<textarea value={lyrics} onChange={(e) => setLyrics(e.target.value.slice(0, 3000))}` |
| `app/(hra)/muj-klub/identita/page.tsx` | 192 | input | `<input type="text" value={nickname} onChange={(e) => setNickname(e.target.value.slice(0, 40))}` |
|  | 1errors: 69 míst / 40 souborů
99 | input | `<input type="number" value={foundingYear} onChange={(e) => setFoundingYear(e.target.value.slice(0, 4))}` |
|  | 216 | input | `<input type="text" value={motto} onChange={(e) => setMotto(e.target.value.slice(0, 120))}` |
|  | 233 | textarea | `<textarea value={foundingStory} onChange={(e) => setFoundingStory(e.target.value.slice(0, 2000))}` |
|  | 251 | textarea | `<textarea value={colorsMeaning} onChange={(e) => setColorsMeaning(e.target.value.slice(0, 500))}` |
| `app/(hra)/muj-klub/maskot/page.tsx` | 223 | input | `<input type="text" value={name} onChange={(e) => setName(e.target.value.slice(0, 50))}` |
| `app/(hra)/muj-klub/page.tsx` | 465 | textarea | `<textarea` |
| `app/(hra)/muj-klub/stadion/page.tsx` | 184 | input | `<input type="text" value={name} onChange={(e) => setName(e.target.value.slice(0, 60))}` |
|  | 191 | input | `<input type="text" value={nickname} onChange={(e) => setNickname(e.target.value.slice(0, 40))}` |
|  | 199 | input | `<input type="number" value={builtYear} onChange={(e) => setBuiltYear(e.target.value.slice(0, 4))}` |
|  | 223 | input | `<input type="text" value={tribunaNorth} onChange={(e) => setTribunaNorth(e.target.value.slice(0, 40))}` |
|  | 229 | input | `<input type="text" value={tribunaSouth} onChange={(e) => setTribunaSouth(e.target.value.slice(0, 40))}` |
|  | 244 | input | `<input type="text" value={specialita} onChange={(e) => setSpecialita(e.target.value.slice(0, 80))}` |
| `app/(hra)/nastaveni/page.tsx` | 177 | input | `<input id="pw-current" name="current-password" type="password" autoComplete="current-password"` |
|  | 183 | input | `<input id="pw-new" name="new-password" type="password" autoComplete="new-password"` |
|  | 201 | input | `<input id="pw-new-2" name="new-password-confirm" type="password" autoComplete="new-password"` |
| `app/(hra)/pratelaky/FriendlyForm.tsx` | 124 | select | `<select aria-label="Soupeř" value={opponentId} onChange={(e) => setOpponentId(e.target.value)} className={sel…` |
|  | 223 | textarea | `<textarea value={message} onChange={(e) => setMessage(e.target.value.slice(0, limits.maxMessage))} rows={2}` |
| `app/(hra)/prestupy/DemandsTab.tsx` | 340 | select | `<select aria-label="Věk od" value={ageMin} onChange={(e) => setAgeMin(Number(e.target.value))} className={sel…` |
|  | 343 | select | `<select aria-label="Věk do" value={ageMax} onChange={(e) => setAgeMax(Number(e.target.value))} className={sel…` |
|  | 351 | input | `<input type="number" inputMode="numeric" min={1} max={85} value={minRating} onChange={(e) => setMinRating(e.t…` |
|  | 360 | select | `<select aria-label="Dovednost" value={r.skill} onChange={(e) => updateRow(i, { skill: e.target.value })} clas…` |
|  | 366 | input | `<input type="number" inputMode="numeric" min={1} max={99} value={r.min} onChange={(e) => updateRow(i, { min: …` |
|  | 390 | textarea | `<textarea value={note} onChange={(e) => setNote(e.target.value.slice(0, noteMax))} rows={2}` |
| `app/(hra)/prestupy/nabidka/[id]/components/ActionBar.tsx` | 188 | textarea | `<textarea` |
| `app/(hra)/prestupy/nabidka/[id]/components/MessageDialog.tsx` | 22 | textarea | `<textarea` |
| `app/(hra)/prestupy/page.tsx` | 1653 | input | `<input type="number" value={searchAgeMin \|\| ""} onChange={(e) => setSearchAgeMin(parseInt(e.target.value) \…` |
|  | 1657 | input | `<input type="number" value={searchAgeMax < 99 ? searchAgeMax : ""} onChange={(e) => setSearchAgeMax(parseInt(…` |
| `app/(hra)/sazky/arena.tsx` | 121 | textarea | `<textarea` |
| `app/(hra)/sazky/tiket.tsx` | 162 | input | `<input id="vklad" type="number" inputMode="numeric" value={vklad}` |
| `app/(hra)/sazky/tikety.tsx` | 107 | textarea | `<textarea id={`vzkaz-${t.id}`} value={vzkaz} onChange={(e) => setVzkaz(e.target.value)}` |
| `app/(hra)/soutez/discipline.tsx` | 275 | textarea | `<textarea className="input w-full mt-1" rows={3} maxLength={200}` |
| `app/(hra)/soutez/integrity-panel.tsx` | 267 | textarea | `<textarea id="duvod-zabaveni" value={duvod} onChange={(e) => setDuvod(e.target.value)}` |
|  | 290 | select | `<select id="cil-zakazu" value={cil} onChange={(e) => setCil(e.target.value)}` |
|  | 302 | input | `<input id="pocet-kol" type="number" min={1} max={30} value={kol}` |
|  | 310 | textarea | `<textarea id="duvod-zakazu" value={duvod} onChange={(e) => setDuvod(e.target.value)}` |
| `app/(hra)/soutez/page.tsx` | 710 | textarea | `<textarea className="input w-full mt-2" rows={2} maxLength={150}` |
|  | 927 | textarea | `<textarea className="input w-full mt-1" rows={3} maxLength={500}` |
| `app/(hra)/soutez/panels.tsx` | 527 | textarea | `<textarea className="input w-full mt-1" rows={3} maxLength={300}` |
|  | 722 | textarea | `<textarea className="input w-full mt-1" rows={3} maxLength={500}` |
|  | 858 | textarea | `<textarea className="input w-full mt-1" rows={3} maxLength={500}` |
|  | 1074 | textarea | `<textarea className="input w-full" rows={3} maxLength={maxLength}` |
| `app/(hra)/soutez/referees-panel.tsx` | 219 | textarea | `<textarea className="input w-full mt-1" rows={3} maxLength={200}` |
|  | 304 | textarea | `<textarea className="input w-full mt-1" rows={3} maxLength={200}` |
|  | 455 | textarea | `<textarea className="input w-full mt-1" rows={3} maxLength={200}` |
| `app/(hra)/u21/page.tsx` | 406 | select | `<select aria-label="Kolo soutěže" value={activeRound} onChange={(e) => setSelectedRound(Number(e.target.value…` |
|  | 633 | select | `<select className="w-full min-h-11 rounded-lg border border-gray-200 bg-surface px-2 text-sm text-ink" value=…` |
| `app/(hra)/zamestnanci/skaut/page.tsx` | 758 | select | `<select value={ageMin} onChange={(e) => { const v = Number(e.target.value); setAgeMin(v); if (v > ageMax) set…` |
|  | 763 | select | `<select value={ageMax} onChange={(e) => { const v = Number(e.target.value); setAgeMax(v); if (v < ageMin) set…` |
| `app/registrace/page.tsx` | 92 | select | `<div><label htmlFor="district" className="input-label">Váš okres</label><select id="district" name="district"…` |
| `components/admin/league-requests.tsx` | 48 | textarea | `{invite?.id === request.id && <div className="bg-pitch-50 p-4 rounded space-y-2 ph-no-capture" data-ph-no-cap…` |
| `components/manager/EditManagerModal.tsx` | 150 | textarea | `<textarea` |
| `components/onboarding/step-club-name.tsx` | 77 | input | `<input type="text" value={customName} onChange={(e) => setCustomName(e.target.value)}` |
|  | 97 | input | `<input type="text" value={customStadium} onChange={(e) => setCustomStadium(e.target.value)}` |
| `components/players/PlayerBrowseTable.tsx` | 249 | select | `<select value={sortKey} onChange={(e) => { const k = e.target.value as SortKey; setSortKey(k); setSortDir(k =…` |

## collapsible: Sbalovací bloky (`<details>`)

17 míst v 11 souborech.

| Soubor | Řádek | Kód |
|---|---|---|
| `app/(hra)/fanousci/FanGroupsPanel.tsx` | 217 | `<details className="rounded-lg" style={{ background: "var(--color-paper)" }}>` |
|  | 269 | `// Jeden dialog pro celý panel. Uvnitř <details> s akcemi by ho sbalený` |
|  | 278 | `<details className="card p-4 sm:p-5 group">` |
|  | 360 | `<details className="mt-3 group">` |
| `app/(hra)/fanousci/page.tsx` | 552 | `<details className="card p-4 sm:p-5 group">` |
| `app/(hra)/hrac/[id]/page.tsx` | 1799 | `<details className="card">` |
| `app/(hra)/muj-klub/hymna/page.tsx` | 216 | `<details className="mt-3">` |
| `app/(hra)/obec/page.tsx` | 778 | `<details className="card p-4 sm:p-5 group">` |
| `app/(hra)/soutez/club-audit-section.tsx` | 205 | `<details>` |
| `app/(hra)/soutez/ui.tsx` | 187 | `<details className="card p-4 sm:p-5 group">` |
| `app/(hra)/trenink/page.tsx` | 766 | `<details className="card group">` |
|  | 855 | `<details className="card group">` |
| `app/(hra)/zamestnanci/page.tsx` | 424 | `<details className="text-xs group">` |
| `components/players/academy-card.tsx` | 392 | `<details className="text-sm">` |
|  | 465 | `<details key={g.age} className="card overflow-hidden" open>` |
| `components/players/squad-analysis-tab.tsx` | 780 | `<details className="card group">` |
|  | 811 | `<details className="card group">` |
| `money` | 75 | 39 |
| `chips` | 57 | 31 |
| `progress` | 40 | 29 |
| `choices` | 115 | 53 |
| `dialogs` | 51 | 38 |
| `forms` | 58 | 26 |
| `collapsible` | 17 | 11 |

## loading: Načítání (obal kolem `<Spinner>`)

95 míst v 74 souborech.

Podle druhu: stránka 44, sekce 26, v textu nebo tlačítku 25.

| Soubor | Řádek | Druh | Kód |
|---|---|---|---|
| `app/(hra)/fanousci/page.tsx` | 516 | v textu nebo tlačítku | `<Spinner />` |
| `app/(hra)/fanousci/vudce/[id]/page.tsx` | 70 | stránka | `return <div className="page-container flex items-center justify-center min-h-[50vh]"><Spinner size="lg" /></d…` |
| `app/(hra)/finance/page.tsx` | 158 | stránka | `if (loading) return <div className="page-container flex items-center justify-center min-h-[50vh]"><Spinner />…` |
|  | 668 | v textu nebo tlačítku | `return <div className="card p-8 text-center"><Spinner /></div>;` |
| `app/(hra)/hospoda/page.tsx` | 187 | stránka | `if (loading) return <div className="page-container flex items-center justify-center min-h-[40vh]"><Spinner />…` |
| `app/(hra)/hrac/[id]/page.tsx` | 481 | v textu nebo tlačítku | `if (loading) return <div className="min-h-dvh flex items-center justify-center"><Spinner size="lg" /></div>;` |
|  | 1725 | sekce | `<div className="card p-6 flex items-center justify-center min-h-[120px]"><Spinner /></div>` |
| `app/(hra)/incidenty/DetailIncidentu.tsx` | 94 | sekce | `if (!detail) return <div className="flex justify-center py-10"><Spinner /></div>;` |
| `app/(hra)/incidenty/page.tsx` | 22 | stránka | `const NACITANI = <div className="page-container flex items-center justify-center min-h-[50vh]"><Spinner /></d…` |
| `app/(hra)/kadr/page.tsx` | 168 | stránka | `if (loading) return <div className="page-container flex justify-center min-h-[50vh] items-center"><Spinner />…` |
|  | 330 | sekce | `<div className="card p-6 flex items-center justify-center min-h-[120px]"><Spinner /></div>` |
| `app/(hra)/kalendar/page.tsx` | 48 | stránka | `if (loading) return <div className="page-container flex items-center justify-center min-h-[50vh]"><Spinner />…` |
| `app/(hra)/liga/page.tsx` | 226 | stránka | `if (loadingStandings) return <div className="page-container flex items-center justify-center min-h-[50vh]"><S…` |
|  | 325 | sekce | `!loadedTabs.has("zpravodaj") ? <div className="flex justify-center py-8"><Spinner /></div> : (` |
|  | 543 | sekce | `if (!loaded) return <div className="flex items-center justify-center py-12"><Spinner /></div>;` |
| `app/(hra)/manazer/[id]/page.tsx` | 95 | v textu nebo tlačítku | `if (loading) return <div className="min-h-dvh flex items-center justify-center"><Spinner size="lg" /></div>;` |
| `app/(hra)/muj-klub/dres/page.tsx` | 375 | stránka | `return <div className="page-container flex justify-center min-h-[50vh] items-center"><Spinner /></div>;` |
| `app/(hra)/muj-klub/hymna/page.tsx` | 155 | stránka | `if (loading) return <div className="page-container flex justify-center min-h-[50vh] items-center"><Spinner />…` |
|  | 207 | v textu nebo tlačítku | `<Spinner /> Hudba se generuje… (30-90s)` |
| `app/(hra)/muj-klub/identita/page.tsx` | 131 | stránka | `if (loading) return <div className="page-container flex justify-center min-h-[50vh] items-center"><Spinner />…` |
| `app/(hra)/muj-klub/maskot/page.tsx` | 136 | stránka | `if (loading) return <div className="page-container flex justify-center min-h-[50vh] items-center"><Spinner />…` |
| `app/(hra)/muj-klub/page.tsx` | 279 | v textu nebo tlačítku | `<Spinner />` |
| `app/(hra)/muj-klub/stadion/page.tsx` | 15 | v textu nebo tlačítku | `<Spinner />` |
|  | 134 | stránka | `if (loading) return <div className="page-container flex justify-center min-h-[50vh] items-center"><Spinner />…` |
| `app/(hra)/obec/DistrictVillages.tsx` | 79 | stránka | `{!data && !error && <div className="flex justify-center py-16"><Spinner /></div>}` |
| `app/(hra)/obec/[id]/page.tsx` | 255 | stránka | `if (!data) return <div className="page-container flex justify-center py-16"><Spinner /></div>;` |
| `app/(hra)/obec/page.tsx` | 488 | v textu nebo tlačítku | `return <div className="p-8 flex justify-center"><Spinner /></div>;` |
|  | 968 | v textu nebo tlačítku | `<Spinner />` |
| `app/(hra)/pohar/page.tsx` | 102 | stránka | `if (loading) return <div className="flex justify-center py-20"><Spinner /></div>;` |
| `app/(hra)/pohar/tym/[id]/page.tsx` | 57 | stránka | `if (loading) return <div className="flex items-center justify-center min-h-[50vh]"><Spinner size="lg" /></div…` |
| `app/(hra)/pratelaky/page.tsx` | 96 | stránka | `if (loading) return <div className="page-container flex items-center justify-center min-h-[50vh]"><Spinner />…` |
| `app/(hra)/prehled/page.tsx` | 161 | stránka | `return <div className="page-container flex items-center justify-center min-h-[50vh]"><Spinner /></div>;` |
| `app/(hra)/prestupy/DemandsTab.tsx` | 145 | sekce | `if (!data) return <div className="flex justify-center py-8"><Spinner /></div>;` |
| `app/(hra)/prestupy/LoansTab.tsx` | 81 | sekce | `if (!data) return <div className="flex justify-center py-10"><Spinner /></div>;` |
| `app/(hra)/prestupy/ObligationsTab.tsx` | 98 | sekce | `if (!data) return <div className="flex justify-center py-8"><Spinner /></div>;` |
| `app/(hra)/prestupy/WatchlistTab.tsx` | 61 | sekce | `if (players === null) return <div className="flex justify-center py-8"><Spinner /></div>;` |
| `app/(hra)/prestupy/hostovani/[id]/page.tsx` | 103 | stránka | `if (!data) return <div className="flex justify-center py-16"><Spinner /></div>;` |
| `app/(hra)/prestupy/jednani/[id]/page.tsx` | 111 | stránka | `return <div className="min-h-[40vh] flex items-center justify-center"><Spinner /></div>;` |
| `app/(hra)/prestupy/nabidka/[id]/page.tsx` | 130 | v textu nebo tlačítku | `<Spinner />` |
| `app/(hra)/prestupy/page.tsx` | 1066 | stránka | `if (loading) return <div className="page-container flex items-center justify-center min-h-[50vh]"><Spinner />…` |
|  | 1429 | sekce | `{overviewLoading && <div className="flex justify-center py-8"><Spinner /></div>}` |
|  | 1566 | sekce | `{!searchLoaded && <div className="flex justify-center py-8"><Spinner /></div>}` |
| `app/(hra)/reputace/page.tsx` | 172 | stránka | `return <div className="page-container flex items-center justify-center min-h-[50vh]"><Spinner /></div>;` |
| `app/(hra)/rozhodci/[id]/page.tsx` | 56 | stránka | `if (loading) return <div className="page-container flex items-center justify-center min-h-[50vh]"><Spinner si…` |
| `app/(hra)/rozhodci/page.tsx` | 35 | stránka | `if (loading) return <div className="page-container flex items-center justify-center min-h-[50vh]"><Spinner si…` |
| `app/(hra)/rozpis/page.tsx` | 154 | stránka | `if (loading) return <div className="page-container flex items-center justify-center min-h-[50vh]"><Spinner />…` |
|  | 242 | sekce | `<div className="flex items-center justify-center py-12"><Spinner /></div>` |
| `app/(hra)/sazky/page.tsx` | 96 | stránka | `<div className="page-container flex items-center justify-center min-h-[50vh]"><Spinner /></div>` |
| `app/(hra)/sin-slavy/page.tsx` | 43 | stránka | `if (loading) return <div className="page-container flex items-center justify-center min-h-[50vh]"><Spinner si…` |
| `app/(hra)/soutez/page.tsx` | 370 | stránka | `return <div className="page-container flex items-center justify-center min-h-[50vh]"><Spinner /></div>;` |
| `app/(hra)/sponzor/[id]/jednani/page.tsx` | 190 | sekce | `if (!view \|\| !draft) return <div className="flex justify-center py-12"><Spinner /></div>;` |
| `app/(hra)/sponzor/[id]/page.tsx` | 72 | sekce | `if (!data) return <div className="flex justify-center py-12"><Spinner /></div>;` |
| `app/(hra)/sponzori/page.tsx` | 302 | stránka | `if (authLoading \|\| loading) return <div className="page-container flex items-center justify-center min-h-[5…` |
|  | 305 | stránka | `if (!data \|\| !team) return <div className="page-container flex items-center justify-center min-h-[50vh]"><S…` |
| `app/(hra)/stadion/page.tsx` | 26 | v textu nebo tlačítku | `<Spinner />` |
|  | 805 | stránka | `if (loading) return <div className="page-container flex items-center justify-center min-h-[50vh]"><Spinner />…` |
| `app/(hra)/trener/page.tsx` | 23 | v textu nebo tlačítku | `return <div className="min-h-[50dvh] flex items-center justify-center"><Spinner size="lg" /></div>;` |
| `app/(hra)/trener/skripta/page.tsx` | 117 | v textu nebo tlačítku | `if (!data) return <div className="min-h-[50dvh] flex items-center justify-center"><Spinner size="lg" /></div>;` |
|  | 127 | v textu nebo tlačítku | `<Spinner size="lg" />` |
| `app/(hra)/trener/test/page.tsx` | 142 | v textu nebo tlačítku | `if (!exam \|\| !teamId \|\| !courseId) return <div className="min-h-[50dvh] flex items-center justify-center"…` |
|  | 381 | v textu nebo tlačítku | `<div className="card p-6 flex flex-col items-center gap-3"><Spinner /><div className="text-base">Vyhodnocuji……` |
| `app/(hra)/trenink/page.tsx` | 187 | stránka | `if (loading) return <div className="page-container flex items-center justify-center min-h-[50vh]"><Spinner />…` |
| `app/(hra)/turnaj/hriste/[id]/page.tsx` | 16 | v textu nebo tlačítku | `<Spinner />` |
|  | 46 | stránka | `if (loading) return <div className="page-container flex items-center justify-center min-h-[50vh]"><Spinner />…` |
| `app/(hra)/turnaj/page.tsx` | 174 | stránka | `if (loading) return <div className="flex justify-center py-20"><Spinner /></div>;` |
| `app/(hra)/tym/[id]/page.tsx` | 123 | stránka | `if (loading) return <div className="page-container flex justify-center min-h-[50vh] items-center"><Spinner />…` |
| `app/(hra)/tym/[id]/stadion/page.tsx` | 19 | v textu nebo tlačítku | `<Spinner />` |
|  | 109 | stránka | `if (loading) return <div className="page-container flex items-center justify-center min-h-[50vh]"><Spinner />…` |
| `app/(hra)/u21/page.tsx` | 255 | sekce | `<div className="flex items-center justify-center py-12"><Spinner /></div>` |
|  | 319 | v textu nebo tlačítku | `{tab === "kadr" && !squadLoaded && !error && <div className="flex justify-center p-8"><Spinner /></div>}` |
| `app/(hra)/udalosti/page.tsx` | 165 | stránka | `if (loading) return <div className="page-container flex items-center justify-center min-h-[50vh]"><Spinner />…` |
| `app/(hra)/vybaveni/BazarTab.tsx` | 44 | sekce | `if (loading) return <div className="flex justify-center py-10"><Spinner /></div>;` |
| `app/(hra)/vybaveni/page.tsx` | 32 | stránka | `<Suspense fallback={<div className="page-container flex items-center justify-center min-h-[50vh]"><Spinner />…` |
|  | 224 | stránka | `if (loading) return <div className="page-container flex items-center justify-center min-h-[50vh]"><Spinner />…` |
| `app/(hra)/zamestnanci/page.tsx` | 374 | stránka | `if (loading) return <div className="page-container flex items-center justify-center min-h-[50vh]"><Spinner />…` |
| `app/(hra)/zamestnanci/skaut/page.tsx` | 164 | stránka | `if (loading && !data) return <div className="min-h-[40vh] flex items-center justify-center"><Spinner /></div>;` |
| `app/(hra)/zapas/[id]/page.tsx` | 143 | stránka | `if (loading) return <div className="page-container flex items-center justify-center min-h-[50vh]"><Spinner si…` |
| `app/(hra)/zapas/page.tsx` | 605 | stránka | `if (loading) return <div className="page-container flex items-center justify-center min-h-[50vh]"><Spinner />…` |
| `app/nova-sezona/page.tsx` | 41 | v textu nebo tlačítku | `if (loading) return <div className="min-h-dvh flex justify-center items-center bg-pitch-700"><Spinner /></div…` |
| `app/onboarding/page.tsx` | 257 | v textu nebo tlačítku | `{!access && !accessError ? <Spinner /> : <button className="btn btn-primary" onClick={() => setAccessAttempt(…` |
|  | 358 | v textu nebo tlačítku | `<Spinner />` |
| `components/league/league-stats.tsx` | 80 | sekce | `if (!loaded) return <div className="flex items-center justify-center py-12"><Spinner /></div>;` |
| `components/manager/CoachEducationTab.tsx` | 183 | sekce | `if (!data) return <div className="flex justify-center py-10"><Spinner /></div>;` |
| `components/manager/CoachKabinaTab.tsx` | 154 | sekce | `if (!data) return <div className="flex justify-center py-10"><Spinner /></div>;` |
| `components/match/live-match.tsx` | 116 | v textu nebo tlačítku | `<Spinner size="sm" />` |
| `components/onboarding/step-location.tsx` | 160 | stránka | `<div className="flex-1 flex items-center justify-center py-20"><Spinner /></div>` |
| `components/players/squad-analysis-tab.tsx` | 970 | sekce | `if (loading) return <div className="card p-6 flex items-center justify-center min-h-[120px]"><Spinner /></div…` |
| `components/players/squad-body-tab.tsx` | 81 | sekce | `if (loading) return <div className="card p-6 flex items-center justify-center min-h-[120px]"><Spinner /></div…` |
| `components/players/u21-attributes.tsx` | 37 | v textu nebo tlačítku | `if (!players) return <div className="flex justify-center p-8"><Spinner /></div>;` |
| `components/referees/disciplinary-panel.tsx` | 79 | sekce | `if (loading) return <div className="flex items-center justify-center py-12"><Spinner size="lg" /></div>;` |
| `components/relations/RelationSection.tsx` | 159 | v textu nebo tlačítku | `if (loading) return <div className="card p-4 sm:p-5 flex justify-center"><Spinner /></div>;` |
|  | 593 | sekce | `if (!relations) return <div className="flex justify-center py-10"><Spinner /></div>;` |
| `components/scouting/ScoutReportSheet.tsx` | 142 | sekce | `{!data && !error && <div className="py-8 flex justify-center"><Spinner /></div>}` |
| `components/sponsors/history-tab.tsx` | 24 | sekce | `if (!items) return <div className="flex justify-center py-8"><Spinner /></div>;` |
| `components/sponsors/popularity-tab.tsx` | 34 | sekce | `if (!overview) return <div className="flex justify-center py-8"><Spinner /></div>;` |

## errors: Chybové hlášky a červené rámečky

69 míst v 40 souborech.

Podle druhu: tón (mapa nebo podmínka) 31, hláška 22, tlačítko 16.

| Soubor | Řádek | Druh | Kód |
|---|---|---|---|
| `app/(hra)/finance/page.tsx` | 181 | hláška | `<div className="bg-red-50 border border-red-200 rounded-soft px-3 py-2 text-xs text-card-red max-w-sm">` |
|  | 766 | hláška | `{error && <div className="bg-red-50 border border-red-200 rounded-soft p-3 text-sm text-card-red">{error}</di…` |
| `app/(hra)/hrac/[id]/page.tsx` | 495 | tón (mapa nebo podmínka) | `const conditionFill = condition >= 80 ? tone.fill : condition >= 50 ? "bg-gold-400" : condition >= 20 ? "bg-o…` |
|  | 501 | hláška | `<span className="inline-flex items-center gap-1 bg-red-500/20 text-red-50 border border-red-300/30 rounded-co…` |
|  | 1007 | tón (mapa nebo podmínka) | `red: "bg-red-50 text-card-red border-red-200",` |
|  | 1245 | tón (mapa nebo podmínka) | `const tone = band.tone === "good" ? "bg-pitch-500" : band.tone === "neutral" ? "bg-amber-400" : "bg-red-500";` |
|  | 1653 | hláška | `<Filter id="L" label="Prohry" count={lossesCount} color="bg-red-500" />` |
|  | 1774 | tón (mapa nebo podmínka) | `m.reason === "Zranění" ? "bg-red-50 text-red-700"` |
| `app/(hra)/incidenty/DetailIncidentu.tsx` | 418 | hláška | `className="w-full px-3 py-2 rounded-soft text-sm font-heading font-bold border border-red-200 text-card-red d…` |
| `app/(hra)/manazer/[id]/page.tsx` | 276 | tón (mapa nebo podmínka) | `red: "bg-red-50 text-card-red border-red-200",` |
| `app/(hra)/muj-klub/hymna/page.tsx` | 326 | hláška | `<div className="mt-3 p-3 rounded-soft bg-red-50 border border-red-200 text-sm text-red-800">` |
| `app/(hra)/muj-klub/maskot/page.tsx` | 271 | hláška | `<div className="p-3 rounded-soft bg-red-50 border border-red-200 text-sm text-red-800">{error}</div>` |
| `app/(hra)/muj-klub/page.tsx` | 333 | hláška | `<div className="p-4 rounded-soft bg-red-50 border border-red-200 text-red-800 text-sm font-heading font-bold …` |
| `app/(hra)/napoveda/page.tsx` | 128 | tón (mapa nebo podmínka) | `const styleBg = f.style === "offensive" ? "bg-red-50 border-red-200"` |
| `app/(hra)/nastaveni/page.tsx` | 208 | tón (mapa nebo podmínka) | `<div className={`text-sm font-heading font-bold px-3 py-2 rounded-soft ${status.type === "ok" ? "bg-pitch-50 …` |
| `app/(hra)/obec/page.tsx` | 836 | tón (mapa nebo podmínka) | `bad: "bg-red-50 text-card-red",` |
| `app/(hra)/pratelaky/friendly-ui.tsx` | 233 | tón (mapa nebo podmínka) | `red: "bg-red-50 text-card-red border-red-100",` |
| `app/(hra)/prestupy/jednani/[id]/page.tsx` | 66 | tón (mapa nebo podmínka) | `refused: "bg-red-50 text-red-700",` |
|  | 67 | tón (mapa nebo podmínka) | `broken_off: "bg-red-50 text-red-700",` |
| `app/(hra)/prestupy/nabidka/[id]/components/InterestBadge.tsx` | 15 | hláška | `3: { chip: "bg-red-50 text-red-700 border border-red-200", dot: "bg-red-500" },` |
| `app/(hra)/prestupy/page.tsx` | 2276 | tón (mapa nebo podmínka) | `o.player_interest >= 3 ? "bg-red-50 text-red-700 border border-red-200"` |
|  | 2281 | tón (mapa nebo podmínka) | `<span className={`w-1.5 h-1.5 rounded-full ${o.player_interest >= 3 ? "bg-red-500" : o.player_interest === 2 …` |
|  | 2853 | tlačítko | `className="w-full text-left rounded-xl bg-white border border-gray-200 hover:border-card-red hover:bg-red-50 …` |
| `app/(hra)/sponzor/[id]/jednani/page.tsx` | 267 | hláška | `{error && <div className="text-sm text-card-red bg-red-50 border border-red-200 rounded-soft px-3 py-2">{erro…` |
| `app/(hra)/sponzori/page.tsx` | 353 | hláška | `<div className="text-sm text-card-red bg-red-50 border border-red-200 rounded-soft px-3 py-2">{actionError}</…` |
| `app/(hra)/stadion/page.tsx` | 1551 | tlačítko | `className="min-h-11 w-full sm:w-auto px-4 py-2 rounded-soft text-sm font-heading font-bold border-2 border-re…` |
| `app/(hra)/trener/test/page.tsx` | 368 | tón (mapa nebo podmínka) | `<div className={`sticky top-0 z-10 card p-3 flex items-center justify-between ${low ? "bg-red-50 border borde…` |
|  | 448 | tón (mapa nebo podmínka) | `<div className={`card p-5 sm:p-6 border-2 ${result.passed ? "border-pitch-500 bg-pitch-50" : "border-red-300 …` |
|  | 491 | tón (mapa nebo podmínka) | `: chosen && !r.isCorrect ? "border-red-300 bg-red-50 text-red-800"` |
| `app/(hra)/trenink/page.tsx` | 580 | tón (mapa nebo podmínka) | `s.verdict === "pretizeny" ? "bg-red-50 text-card-red" : "bg-gold-300/20 text-gold-700"` |
|  | 720 | tón (mapa nebo podmínka) | `<span className="px-1.5 py-0.5 rounded bg-red-50 text-card-red text-micro font-heading font-bold">{absentList…` |
| `app/(hra)/tym/[id]/page.tsx` | 506 | tón (mapa nebo podmínka) | `const bg = value >= 60 ? "bg-pitch-50 text-pitch-700" : value >= 40 ? "bg-gray-100 text-ink" : "bg-red-50 tex…` |
| `app/(hra)/u21/page.tsx` | 314 | hláška | `<div className="card border-l-4 border-card-red bg-red-50 p-3 text-sm text-red-800">` |
| `app/(hra)/udalosti/DistrictEvents.tsx` | 47 | tón (mapa nebo podmínka) | `bad: "bg-red-50 text-card-red",` |
| `app/(hra)/udalosti/page.tsx` | 92 | tón (mapa nebo podmínka) | `bad: "bg-red-50 text-card-red",` |
| `app/(hra)/vice/page.tsx` | 266 | tlačítko | `className="w-full mt-6 py-3 rounded-xl text-center text-sm font-heading font-bold text-card-red bg-red-50 hov…` |
| `app/(hra)/zamestnanci/skaut/page.tsx` | 413 | tlačítko | `<button onClick={stop} className="w-full py-2.5 rounded-xl font-heading font-bold border-2 border-red-200 tex…` |
|  | 429 | tlačítko | `<button onClick={stop} className="w-full py-2.5 rounded-xl font-heading font-bold border-2 border-red-200 tex…` |
|  | 445 | tlačítko | `<button onClick={stop} className="w-full py-2.5 rounded-xl font-heading font-bold border-2 border-red-200 tex…` |
|  | 481 | tlačítko | `<button onClick={stop} className="w-full py-2.5 rounded-xl font-heading font-bold border-2 border-red-200 tex…` |
|  | 502 | tlačítko | `className="px-3 py-2 rounded-control text-meta font-bold border border-red-200 text-red-700 bg-white hover:bg…` |
| `app/(hra)/zapas/[id]/page.tsx` | 600 | hláška | `FWD: { label: "Útok", bg: "bg-red-50", border: "border-l-red-400", text: "text-red-700" },` |
| `app/(hra)/zapas/page.tsx` | 113 | tón (mapa nebo podmínka) | `className={`ml-1 text-micro font-heading font-bold px-1 rounded ${good ? "bg-pitch-50 text-pitch-700" : "bg-r…` |
|  | 1302 | tón (mapa nebo podmínka) | `r.type === "rivals" \|\| r.type === "in_laws" ? "bg-red-50 text-card-red" : "bg-pitch-50 text-pitch-600"` |
| `components/MatchBreakdown.tsx` | 57 | tón (mapa nebo podmínka) | `HIGH_NEGATIVE: "border-red-300 bg-red-50 text-red-900",` |
| `components/dashboard/widgets/items/shared.tsx` | 63 | tón (mapa nebo podmínka) | `const bg = value >= 60 ? "bg-pitch-50 text-pitch-700" : value >= 40 ? "bg-gray-100 text-ink" : "bg-red-50 tex…` |
| `components/dashboard/widgets/widget-frame.tsx` | 128 | tlačítko | `className="w-8 h-8 rounded-control bg-white text-card-red hover:bg-red-50 transition-colors font-bold"` |
| `components/manager/CoachEducationTab.tsx` | 294 | hláška | `<div className="mt-3 rounded-soft bg-red-50 border border-red-200 p-3 text-sm text-red-800">` |
| `components/manager/CoachKabinaTab.tsx` | 73 | hláška | `const TONE_BAR: Record<string, string> = { good: "bg-pitch-500", neutral: "bg-amber-400", bad: "bg-red-500" };` |
|  | 109 | tón (mapa nebo podmínka) | `delta > 0 ? "bg-pitch-50 text-pitch-600" : delta < 0 ? "bg-red-50 text-card-red" : "bg-gray-50 text-muted"` |
|  | 128 | tón (mapa nebo podmínka) | `tone === "bad" ? "bg-red-50 text-red-700 border-red-200" : "bg-amber-50 text-amber-800 border-amber-200"` |
|  | 197 | tlačítko | `onlyTrouble ? "bg-red-50 text-red-700 border-red-200" : "bg-surface text-muted border-gray-100 hover:text-ink"` |
| `components/manager/EditManagerModal.tsx` | 167 | hláška | `<div className="text-sm text-card-red bg-red-50 border border-red-200 rounded-soft px-3 py-2">` |
| `components/players/academy-card.tsx` | 234 | hláška | `<div className="card p-3 text-sm border-l-4 border-red-400 bg-red-50 flex flex-wrap items-center justify-betw…` |
|  | 489 | hláška | `{p.weakness && <span className="rounded-full bg-red-50 px-2 py-0.5 text-xs text-red-700">slabina: {p.weakness…` |
| `components/relations/RelationSection.tsx` | 80 | tón (mapa nebo podmínka) | `rival: "bg-red-50 text-red-700 border border-red-200",` |
|  | 202 | tlačítko | `className={`${BTN} bg-red-50 border-red-200 hover:bg-red-100`}>` |
|  | 220 | tlačítko | `className={`${BTN} bg-red-50 border-red-200 hover:bg-red-100`}>` |
|  | 280 | tlačítko | `className={`${BTN} bg-red-50 border-red-200 hover:bg-red-100`}>` |
|  | 292 | tlačítko | `className={`${BTN} bg-red-50 border-red-200 hover:bg-red-100`}>` |
|  | 399 | tlačítko | `className={`${BTN} bg-red-50 border-red-200 hover:bg-red-100`}>` |
|  | 505 | tlačítko | `className={`${BTN} bg-red-50 border-red-200 hover:bg-red-100`}>` |
| `components/scouting/WillingnessBadge.tsx` | 6 | hláška | `0: { chip: "bg-red-50 text-red-700 border border-red-200", dot: "bg-red-500" },` |
| `components/sponsors/contracts-tab.tsx` | 74 | hláška | `<div className="text-sm text-card-red bg-red-50 border border-red-200 rounded-soft px-3 py-2">` |
| `components/sponsors/history-tab.tsx` | 22 | hláška | `return <div className="text-sm text-card-red bg-red-50 border border-red-200 rounded-soft px-3 py-2">Historii…` |
| `components/sponsors/negotiation/owner-reply-dialog.tsx` | 14 | tón (mapa nebo podmínka) | `reject: "bg-red-50 text-card-red",` |
|  | 15 | tón (mapa nebo podmínka) | `insulted: "bg-red-50 text-card-red",` |
|  | 16 | tón (mapa nebo podmínka) | `walked_away: "bg-red-50 text-card-red",` |
| `components/sponsors/popularity-tab.tsx` | 32 | hláška | `return <div className="text-sm text-card-red bg-red-50 border border-red-200 rounded-soft px-3 py-2">Přehled …` |

## money: Částky v Kč

75 míst v 39 souborech.

Podle druhu: přímo v textu 57, funkce 18.

| Soubor | Řádek | Druh | Kód |
|---|---|---|---|
| `app/(hra)/fanousci/page.tsx` | 388 | funkce | `const priceStr = promotionPrice != null ? `${promotionPrice.toLocaleString("cs")} Kč` : "500–2 500 Kč";` |
|  | 718 | přímo v textu | `{promotionPrice.toLocaleString("cs")} Kč` |
| `app/(hra)/hrac/[id]/page.tsx` | 645 | přímo v textu | `? ` · hostování za ${player.loan.fee.toLocaleString("cs")} Kč`` |
|  | 743 | přímo v textu | `: `Na trhu za ${myListing.askingPrice.toLocaleString("cs")} Kč`}</span>` |
|  | 1078 | přímo v textu | `<DetailRow label="Mzda" value={`${player.weekly_wage.toLocaleString("cs")} Kč/týd`} />` |
|  | 1085 | přímo v textu | `? `${value.toLocaleString("cs")} Kč`` |
|  | 1086 | přímo v textu | `: `cca ${marketValueEstimate(value).toLocaleString("cs")} Kč`;` |
|  | 1222 | přímo v textu | `? `Výměna za: ${c.swapPartner}${c.fee > 0 ? ` · doplatek ${c.fee.toLocaleString("cs")} Kč` : ""}`` |
|  | 1224 | přímo v textu | `? `Přestupní částka: ${c.fee.toLocaleString("cs")} Kč${c.installments ? ` · na splátky (${c.installments}× tý…` |
| `app/(hra)/incidenty/page.tsx` | 112 | přímo v textu | `meta={`Oprava ${p.cost.toLocaleString("cs-CZ")} Kč · o ${p.levels} ${p.levels === 1 ? "úroveň" : "úrovně"}`}` |
| `app/(hra)/muj-klub/page.tsx` | 206 | přímo v textu | `if (!window.confirm(`Opravdu chceš zakoupit šablonu "${tpl.name}" za ${tpl.price.toLocaleString("cs")} Kč?`))…` |
|  | 231 | přímo v textu | `if (!window.confirm(`Opravdu chceš zakoupit vylepšení "${add.name}" za ${add.price.toLocaleString("cs")} Kč?`…` |
|  | 461 | přímo v textu | `Vyžaduje modul {CLUB_WEBSITE_ADDONS.press_officer.name} ({CLUB_WEBSITE_ADDONS.press_officer.price.toLocaleStr…` |
|  | 498 | přímo v textu | `Vyžaduje modul {CLUB_WEBSITE_ADDONS.sponsor_banner.name} ({CLUB_WEBSITE_ADDONS.sponsor_banner.price.toLocaleS…` |
|  | 570 | přímo v textu | `{tpl.price === 0 ? "Zdarma" : `${tpl.price.toLocaleString("cs")} Kč`}` |
|  | 638 | přímo v textu | `{add.price.toLocaleString("cs")} Kč` |
| `app/(hra)/obec/page.tsx` | 403 | přímo v textu | `? `Hotovo, obec přispěla ${res.offeredAmount?.toLocaleString("cs")} Kč.`` |
|  | 567 | přímo v textu | `{ text: `obec dá ${i.offered_amount.toLocaleString("cs-CZ")} Kč`, tone: "good" },` |
|  | 568 | přímo v textu | `{ text: `ty doplatíš ${i.required_contribution.toLocaleString("cs-CZ")} Kč`, tone: "bad" },` |
|  | 585 | přímo v textu | `{ text: `−${p.cost_money.toLocaleString("cs-CZ")} Kč`, tone: "bad" },` |
|  | 672 | přímo v textu | `{!slotTakenByMe && !slotTakenByOther && !myInv && <span className="block text-xs text-muted mt-0.5">dárek {gi…` |
| `app/(hra)/pohar/page.tsx` | 146 | přímo v textu | `<div className="font-heading font-bold tabular-nums text-base leading-tight">{p.prize.toLocaleString("cs")} K…` |
|  | 160 | přímo v textu | `note={myEarnings > 0 ? `${status}, vyděláno ${myEarnings.toLocaleString("cs")} Kč` : status}` |
| `app/(hra)/pratelaky/friendly-ui.tsx` | 94 | funkce | `export const formatCZK = (v: number) => `${v.toLocaleString("cs")} Kč`;` |
| `app/(hra)/prestupy/DemandsTab.tsx` | 57 | funkce | `const formatCZK = (v: number) => `${v.toLocaleString("cs")}\u00a0Kč`;` |
| `app/(hra)/prestupy/ObligationsTab.tsx` | 33 | funkce | `const kc = (v: number) => `${v.toLocaleString("cs-CZ")} Kč`;` |
| `app/(hra)/prestupy/hostovani/[id]/page.tsx` | 20 | funkce | `const kc = (v: number) => `${v.toLocaleString("cs-CZ")} Kč`;` |
| `app/(hra)/prestupy/jednani/[id]/page.tsx` | 274 | přímo v textu | `<div className="font-heading font-[900] text-2xl tabular-nums mt-1">{n.terms.amount.toLocaleString("cs")} Kč<…` |
|  | 306 | přímo v textu | `Podpisem zaplatíš hned {payNow.toLocaleString("cs")} Kč{n.terms.installments > 0 ? `, zbytek ve ${n.terms.ins…` |
| `app/(hra)/prestupy/nabidka/[id]/components/ActionBar.tsx` | 82 | přímo v textu | `? `Přijetím zaplatíš hned ${payNow.toLocaleString("cs")} Kč${terms.installments > 0 ? `, zbytek ve ${terms.in…` |
|  | 83 | přímo v textu | `: `Kupující při přijetí pošle hned ${(payNow - adminFee).toLocaleString("cs")} Kč${terms.installments > 0 ? `…` |
|  | 89 | přímo v textu | `<div className="flex justify-between gap-3"><span>Doplacení splátek pro {saleDeductions.settleTo}</span><span…` |
|  | 92 | přímo v textu | `<div className="flex justify-between gap-3"><span>{saleDeductions.sellOnPct} % pro {saleDeductions.sellOnTo}<…` |
|  | 96 | přímo v textu | `<span className="font-heading font-bold">{(currentAmount - saleDeductions.settle - saleDeductions.sellOn).toL…` |
| `app/(hra)/prestupy/nabidka/[id]/components/OfferTimeline.tsx` | 122 | přímo v textu | `{e.amount > 0 ? `${e.amount.toLocaleString("cs")} Kč` : hasSwap ? "bez doplatku" : "zdarma"}` |
| `app/(hra)/prestupy/nabidka/[id]/components/PlayerHero.tsx` | 125 | přímo v textu | `{currentAmount > 0 ? `${currentAmount.toLocaleString("cs")} Kč` : offeredPlayers.length > 0 ? "Bez doplatku" …` |
|  | 138 | přímo v textu | `+ administrační poplatek {adminFee.toLocaleString("cs")} Kč` |
| `app/(hra)/prestupy/nabidka/[id]/components/TeamSide.tsx` | 102 | přímo v textu | `{team.budget.toLocaleString("cs")} Kč` |
| `app/(hra)/prestupy/page.tsx` | 1510 | přímo v textu | `trailing={<span className="text-body font-bold tabular-nums text-pitch-600">{s.earned.toLocaleString("cs")} K…` |
|  | 1528 | přímo v textu | `trailing={<span className="text-body font-bold tabular-nums text-card-red">{b.spent.toLocaleString("cs")} Kč<…` |
|  | 2093 | přímo v textu | `castka != null && castka > 0 ? `${castka.toLocaleString("cs")} Kč` : null, when \|\| null].filter(Boolean).jo…` |
| `app/(hra)/reputace/page.tsx` | 57 | funkce | `const CZK = (n: number) => `${n.toLocaleString("cs")} Kč`;` |
| `app/(hra)/rozpis/page.tsx` | 120 | funkce | `const priceStr = promotionPrice != null ? `${promotionPrice.toLocaleString("cs")} Kč` : "500–2 500 Kč";` |
|  | 195 | přímo v textu | `? <span className="hidden sm:inline">, zaplaceno {nextHome.promotionCost.toLocaleString("cs")} Kč</span>` |
| `app/(hra)/sazky/ui.tsx` | 31 | přímo v textu | `return `${n.toLocaleString("cs")} Kč`;` |
|  | 35 | přímo v textu | `return `${n > 0 ? "+" : n < 0 ? "−" : ""}${Math.abs(n).toLocaleString("cs")} Kč`;` |
| `app/(hra)/soutez/ui.tsx` | 21 | přímo v textu | `return `${Math.round(n).toLocaleString("cs")} Kč`;` |
|  | 26 | přímo v textu | `return `${n > 0 ? "+" : "−"}${Math.abs(Math.round(n)).toLocaleString("cs")} Kč`;` |
| `app/(hra)/trener/test/page.tsx` | 463 | přímo v textu | `Máš jeden opravný termín. Přihlásit se na něj můžeš v záložce Vzdělání (cena {result.retakePrice.toLocaleStri…` |
| `app/(hra)/turnaj/competition.tsx` | 88 | přímo v textu | `return `${n.toLocaleString("cs")} Kč`;` |
| `app/(hra)/turnaj/page.tsx` | 106 | přímo v textu | `return `${n.toLocaleString("cs")} Kč`;` |
| `app/(hra)/tym/[id]/TransferOverview.tsx` | 31 | funkce | `const fmtCZK = (v: number) => `${v.toLocaleString("cs")} Kč`;` |
| `app/(hra)/tym/[id]/page.tsx` | 309 | přímo v textu | `{isOwnTeam && <InfoRow label="Rozpočet" value={`${team.budget.toLocaleString("cs")} Kč`} />}` |
| `app/(hra)/zamestnanci/page.tsx` | 68 | funkce | `function czk(n: number): string { return `${n.toLocaleString("cs")} Kč`; }` |
| `app/(hra)/zamestnanci/skaut/page.tsx` | 85 | funkce | `const kc = (v: number) => `${v.toLocaleString("cs")} Kč`;` |
| `app/(hra)/zapas/BusSelector.tsx` | 208 | přímo v textu | `✓ {b.cost.toLocaleString("cs")} Kč` |
|  | 269 | přímo v textu | `{t.cost.toLocaleString("cs")} Kč` |
|  | 292 | přímo v textu | `: `Objednat za ${selectedTier.cost.toLocaleString("cs")} Kč`}` |
| `app/(hra)/zapas/[id]/page.tsx` | 453 | přímo v textu | `{inc.fine > 0 && `Pokuta ${inc.fine.toLocaleString("cs")} Kč. `}` |
| `components/dashboard/widgets/items/fan-groups-widgets.tsx` | 232 | přímo v textu | `{pokuty.toLocaleString("cs-CZ")} Kč` |
|  | 238 | přímo v textu | `{opravy.toLocaleString("cs-CZ")} Kč` |
|  | 249 | přímo v textu | `trailing={<span className="text-meta text-muted tabular-nums">{x.cost.toLocaleString("cs-CZ")} Kč</span>} />` |
| `components/dashboard/widgets/items/match-widgets.tsx` | 97 | funkce | `const priceStr = promotionPrice != null ? `${promotionPrice.toLocaleString("cs")} Kč` : "500–2 500 Kč";` |
| `components/manager/CoachEducationTab.tsx` | 79 | funkce | `const czk = (v: number) => `${v.toLocaleString("cs")} Kč`;` |
| `components/players/PlayerBrowseTable.tsx` | 88 | funkce | `const formatValue = (v: number) => `cca ${v.toLocaleString("cs")} Kč`;` |
|  | 89 | funkce | `const formatPrice = (v: number) => `${v.toLocaleString("cs")} Kč`;` |
| `components/players/academy-card.tsx` | 101 | funkce | `const kc = (n: number) => `${n.toLocaleString("cs")} Kč`;` |
| `components/referees/disciplinary-panel.tsx` | 58 | přímo v textu | `trailing={<RowValue tone="minus">−{f.amount.toLocaleString("cs")} Kč</RowValue>} />` |
|  | 118 | přímo v textu | `{total.toLocaleString("cs")} Kč` |
|  | 135 | přímo v textu | `trailing={<RowValue tone="minus">−{t.sum.toLocaleString("cs")} Kč</RowValue>} />` |
| `components/scouting/ScoutReportSheet.tsx` | 208 | přímo v textu | `<div><span className="text-muted">Klub si řekne asi </span><span className="font-heading font-bold tabular-nu…` |
|  | 211 | přímo v textu | `<div><span className="text-muted">Chce </span><span className="font-heading font-bold tabular-nums">{r.weekly…` |
| `components/staff/StaffTaskBox.tsx` | 43 | funkce | `function czk(n: number): string { return `${n.toLocaleString("cs")} Kč`; }` |
| `components/transfers/player-obligations.tsx` | 22 | funkce | `const kc = (v: number) => `${v.toLocaleString("cs-CZ")} Kč`;` |
| `components/transfers/transfer-terms.tsx` | 22 | funkce | `const kc = (v: number) => `${v.toLocaleString("cs-CZ")} Kč`;` |

## chips: Štítky (ručně stavěné pilulky)

57 míst v 31 souborech.

| Soubor | Řádek | Kód |
|---|---|---|
| `app/(hra)/aplikace/page.tsx` | 168 | `<span key={f} className="text-xs bg-pitch-50 text-pitch-700 font-heading font-bold px-2 py-1 rounded-full">` |
|  | 197 | `<span className="text-xs font-heading font-bold bg-pitch-50 text-pitch-700 px-2 py-0.5 rounded-full">` |
| `app/(hra)/hrac/[id]/page.tsx` | 545 | `<span className="bg-yellow-300 text-gray-900 text-xs font-heading font-bold px-2 py-0.5 rounded-full whitespa…` |
|  | 1226 | `trailing={<span className={`text-micro px-2 py-0.5 rounded-full font-bold whitespace-nowrap ${chip}`}>{c.join…` |
|  | 1785 | `<span className={`inline-block text-micro px-2 py-0.5 rounded-full font-bold whitespace-nowrap ${reasonColor}…` |
| `app/(hra)/incidenty/page.tsx` | 153 | `<span className={`ml-2 align-middle inline-block px-2 py-0.5 rounded-full text-micro font-bold whitespace-now…` |
| `app/(hra)/muj-klub/hymna/page.tsx` | 186 | `{a.isSelected && <span className="text-micro font-bold bg-pitch-500 text-white px-2 py-0.5 rounded-full">AKTU…` |
| `app/(hra)/muj-klub/maskot/page.tsx` | 171 | `<span className="absolute top-2 left-2 text-micro font-bold bg-pitch-500 text-white px-2 py-0.5 rounded-full"…` |
| `app/(hra)/nastaveni/page.tsx` | 191 | `<span key={req} className={`text-micro px-1.5 py-0.5 rounded-full font-heading font-bold ${ok ? "bg-pitch-50 …` |
| `app/(hra)/obec/DistrictVillages.tsx` | 27 | `{shown.map((c) => <Badge key={c.id} club={c} size={size} />)}` |
|  | 105 | `leading={<Badge club={c} size={32} />}` |
| `app/(hra)/prestupy/hostovani/[id]/page.tsx` | 156 | `<span className={`text-xs font-heading font-bold px-2 py-0.5 rounded-full ${state.className}`}>{state.label}<…` |
| `app/(hra)/prestupy/nabidka/[id]/components/TeamSide.tsx` | 101 | `<span className="px-2 py-0.5 rounded-full bg-gray-100 text-xs font-heading font-bold tabular-nums">` |
|  | 106 | `<span className="px-2 py-0.5 rounded-full bg-gold-500/10 text-xs font-heading font-bold text-gold-600 tabular…` |
| `app/(hra)/prestupy/nabidka/[id]/page.tsx` | 230 | `<span className="px-3 py-1 rounded-full bg-gray-100 text-xs font-heading font-bold uppercase tracking-wider t…` |
| `app/(hra)/prestupy/page.tsx` | 107 | `<div key={p.id} className="inline-flex items-center gap-1.5 bg-gold-50 border border-gold-300/60 rounded-full…` |
|  | 228 | `<div className="absolute top-3 left-3 flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-pitch-500 text-wh…` |
|  | 1191 | `<span className="text-xs font-heading font-bold px-2 py-0.5 rounded-full bg-pitch-50 text-pitch-700">{loanTer…` |
|  | 2154 | `{isYouth && <span className="text-xs bg-pitch-100 text-pitch-700 px-2 py-0.5 rounded-full font-heading font-b…` |
|  | 2275 | `<span className={`inline-flex items-center gap-1 rounded-full text-micro font-heading font-bold px-2 py-0.5 ${` |
|  | 2475 | `<span className="text-xs px-2 py-0.5 rounded-full bg-gold-50 text-gold-700 font-heading font-bold">Z trhu</sp…` |
|  | 2549 | `<span className="text-xs px-2 py-0.5 rounded-full bg-gold-50 text-gold-700 font-heading font-bold">Z trhu</sp…` |
| `app/(hra)/sazky/ui.tsx` | 85 | `className="text-micro font-heading font-bold uppercase tracking-wide px-2 py-0.5 rounded-full"` |
| `app/(hra)/soutez/integrity-panel.tsx` | 205 | `trailing={<span className="text-micro font-bold uppercase tracking-wide px-2 py-0.5 rounded-full whitespace-n…` |
|  | 236 | `trailing={<span className="text-micro font-bold uppercase tracking-wide px-2 py-0.5 rounded-full whitespace-n…` |
| `app/(hra)/soutez/ui.tsx` | 156 | `className="text-xs font-semibold px-2 py-1 rounded-full shrink-0 whitespace-nowrap"` |
| `app/(hra)/udalosti/DistrictEvents.tsx` | 99 | `<span className="inline-block mt-1.5 text-xs font-heading font-bold px-2 py-0.5 rounded-full bg-surface text-…` |
| `app/(hra)/vice/page.tsx` | 84 | `<span className={`absolute top-2 right-2 ${badge.bg ?? "bg-card-red"} text-white text-[11px] font-bold min-w-…` |
|  | 89 | `<span className={`absolute top-2 right-2 ${badge.bg ?? "bg-pitch-500"} text-white text-[10px] font-bold h-[21…` |
|  | 232 | `<span className="bg-card-red text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full shrink-0">` |
|  | 237 | `<span className="bg-pitch-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full shrink-0">` |
| `app/(hra)/zamestnanci/page.tsx` | 390 | `<span className={`ml-2 align-middle inline-block rounded-full bg-surface-3 px-2 py-0.5 text-micro font-bold t…` |
| `components/dashboard/bottom-nav.tsx` | 142 | `<span className="absolute top-0 right-2 bg-card-red text-white text-[9px] font-bold min-w-[16px] h-4 px-1 rou…` |
| `components/dashboard/fm-sidebar.tsx` | 19 | `const MENU_BADGE = "inline-flex items-center justify-center min-w-[18px] h-[18px] px-1.5 rounded-full text-wh…` |
|  | 202 | `<span className="flex items-center gap-1 text-micro font-heading font-bold uppercase tracking-wider bg-white/…` |
| `components/dashboard/gremium-vyveska.tsx` | 69 | `className="inline-block text-micro font-bold px-2 py-0.5 rounded-full shrink-0 whitespace-nowrap"` |
| `components/manager/CoachEducationTab.tsx` | 217 | `<span className="text-xs font-heading font-bold px-2.5 py-0.5 rounded-full bg-pitch-600 text-white">` |
|  | 222 | `<span className="text-xs font-heading font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-900 border b…` |
|  | 396 | `<span className="text-xs font-heading font-bold px-2 py-0.5 rounded-full bg-pitch-50 text-pitch-700 border bo…` |
| `components/match/live-match.tsx` | 84 | `className={`px-3 py-1 rounded-full text-xs font-heading font-bold transition-colors ${` |
| `components/players/academy-card.tsx` | 480 | `{p.promising && <span className="ml-2 align-middle rounded-full bg-pitch-50 px-2 py-0.5 text-micro font-bold …` |
|  | 481 | `{p.coachSon && <span className="ml-2 align-middle rounded-full bg-gold-50 px-2 py-0.5 text-micro font-bold te…` |
|  | 488 | `{p.strengths.map((st) => <span key={st} className="rounded-full bg-pitch-50 px-2 py-0.5 text-xs font-semibold…` |
|  | 489 | `{p.weakness && <span className="rounded-full bg-red-50 px-2 py-0.5 text-xs text-red-700">slabina: {p.weakness…` |
|  | 649 | `<span className="flex flex-wrap gap-1.5">{t.strengths.map((x) => <span key={x} className="rounded-full bg-pit…` |
| `components/players/promise-card.tsx` | 51 | `<span className="ml-1.5 text-micro bg-amber-100 text-amber-800 font-heading font-bold px-1.5 py-0.5 rounded-f…` |
| `components/players/reveal-card.tsx` | 191 | `<span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-micro font-heading font-bold …` |
| `components/players/squad-attribute-table.tsx` | 224 | `{p.loan_from_team_id && <span className="text-micro bg-yellow-100 text-yellow-700 font-bold px-1.5 py-0.5 rou…` |
|  | 226 | `{inj && <span className="text-micro bg-red-100 text-red-700 font-bold px-1.5 py-0.5 rounded-full cursor-help"…` |
|  | 227 | `{abs && <span className="text-micro bg-amber-100 text-amber-700 font-bold px-1.5 py-0.5 rounded-full cursor-h…` |
| `components/players/u21-rozvoj.tsx` | 255 | `<span className={`text-micro px-2 py-0.5 rounded-full font-heading font-bold whitespace-nowrap ${k.barva}`}>` |
|  | 271 | `<span className={`text-micro px-2 py-0.5 rounded-full font-heading font-bold border whitespace-nowrap ${ramec…` |
| `components/relations/RelationSection.tsx` | 71 | `<span className="text-xs font-heading font-bold px-2 py-0.5 rounded-full bg-amber-50 text-amber-800 border bo…` |
|  | 88 | `<span className={`text-xs font-heading font-bold px-2 py-0.5 rounded-full ${STATUS_STYLES[status.key] ?? "bg-…` |
| `components/transfers/loan-status-card.tsx` | 49 | `<span className={`text-xs font-heading font-bold px-2 py-0.5 rounded-full ${state.className}`}>{state.label}<…` |
| `components/transfers/origin-badge.tsx` | 5 | `<span className="mr-1.5 px-1.5 rounded-full text-micro font-heading font-bold bg-sky-50 text-sky-700 border b…` |
| `components/transfers/revealed-potential.tsx` | 36 | `className="inline-block text-xs font-heading font-bold px-2 py-0.5 rounded-full bg-gold-50 text-gold-700 whit…` |

## progress: Proužky průběhu

40 míst v 29 souborech.

| Soubor | Řádek | Kód |
|---|---|---|
| `app/(hra)/fanousci/FanGroupsPanel.tsx` | 152 | `<div className="mt-1 h-2 w-full rounded-full bg-gray-100 overflow-hidden">` |
| `app/(hra)/fanousci/page.tsx` | 630 | `<div className="h-3 bg-gray-100 rounded-full overflow-hidden">` |
| `app/(hra)/fanousci/vudce/[id]/page.tsx` | 129 | `<div className="flex-1 h-2 rounded-full bg-ink/10 overflow-hidden">` |
| `app/(hra)/finance/page.tsx` | 724 | `<div className="h-2 bg-gray-200 rounded-full overflow-hidden">` |
|  | 895 | `<div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">` |
| `app/(hra)/hlasovani/page.tsx` | 90 | `<span className="block h-2 bg-gray-100 rounded-full overflow-hidden">` |
|  | 105 | `<span className="block h-2 bg-gray-100 rounded-full overflow-hidden">` |
| `app/(hra)/hrac/[id]/PlayerCompare.tsx` | 289 | `<div className="h-2.5 rounded-full bg-gray-100 flex justify-end overflow-hidden">` |
|  | 296 | `<div className="h-2.5 rounded-full bg-gray-100 flex justify-start overflow-hidden">` |
| `app/(hra)/hrac/[id]/page.tsx` | 1253 | `<div className="h-2 bg-gray-100 rounded-full overflow-hidden">` |
|  | 1453 | `<div className="flex-1 h-2 rounded-full bg-gray-100 overflow-hidden">` |
| `app/(hra)/kalendar/page.tsx` | 87 | `<div className="h-2 bg-gray-100 rounded-full overflow-hidden">` |
| `app/(hra)/manazer/[id]/page.tsx` | 502 | `<div className="relative h-2 rounded-full bg-gray-100 overflow-hidden mb-1.5">` |
| `app/(hra)/obec/page.tsx` | 272 | `<div className="h-2 w-full rounded-full bg-gray-100 overflow-hidden">` |
| `app/(hra)/prestupy/ObligationsTab.tsx` | 54 | `<span className="block h-2 mt-1.5 rounded-full bg-gray-100 overflow-hidden" aria-label={`Splaceno ${pct} %`}>` |
| `app/(hra)/prestupy/page.tsx` | 1512 | `<span className="block bg-gray-100 rounded-full h-1.5 overflow-hidden mt-1">` |
|  | 1530 | `<span className="block bg-gray-100 rounded-full h-1.5 overflow-hidden mt-1">` |
| `app/(hra)/rozhodci/[id]/page.tsx` | 109 | `<div className="flex-1 h-2 rounded-full bg-ink/10 overflow-hidden">` |
| `app/(hra)/trenink/page.tsx` | 495 | `<div className="flex h-2 rounded-full overflow-hidden bg-gray-100">` |
|  | 728 | `<div className="mt-2.5 bg-gray-100 rounded-full h-1.5 overflow-hidden">` |
|  | 795 | `<span className="flex-1 bg-gray-100 rounded-full h-1.5 overflow-hidden min-w-0">` |
|  | 818 | `<span className="flex-1 bg-gray-100 rounded-full h-1.5 overflow-hidden min-w-0">` |
|  | 906 | `<span className="w-16 sm:w-24 bg-gray-100 rounded-full h-1.5 overflow-hidden" aria-hidden="true">` |
|  | 930 | `<span className="flex-1 bg-gray-100 rounded-full h-1.5 overflow-hidden">` |
| `app/(hra)/zapas/[id]/page.tsx` | 687 | `<span className="w-12 h-1.5 rounded-full bg-gray-100 overflow-hidden hidden sm:block" title={matchRating != n…` |
| `app/(hra)/zapas/page.tsx` | 1292 | `<div className="flex-1 bg-gray-100 rounded-full h-2 overflow-hidden">` |
| `components/dashboard/widgets/items/fan-groups-widgets.tsx` | 28 | `<span className="block h-1.5 rounded-full bg-gray-100 overflow-hidden">` |
| `components/manager/CoachEducationTab.tsx` | 265 | `<div className="h-2 rounded-full bg-gray-100 overflow-hidden">` |
| `components/manager/CoachKabinaTab.tsx` | 215 | `<span className="block h-1.5 rounded-full bg-gray-100 overflow-hidden mt-1">` |
| `components/match/referee-card.tsx` | 87 | `<div className="flex-1 h-2 rounded-full bg-ink/10 overflow-hidden">` |
| `components/players/academy-card.tsx` | 189 | `<div className="relative h-3 rounded-full bg-gray-200 overflow-hidden">` |
| `components/players/potential-progress.tsx` | 152 | `<div className="relative h-2.5 rounded-full bg-gray-100 overflow-hidden">` |
| `components/players/reveal-card.tsx` | 205 | `<div className="flex-1 h-2.5 bg-gray-100 rounded-full overflow-hidden">` |
| `components/players/squad-analysis-tab.tsx` | 354 | `<div className="h-2.5 rounded-full bg-gray-100 flex justify-end overflow-hidden">` |
|  | 358 | `<div className="h-2.5 rounded-full bg-gray-100 flex justify-start overflow-hidden">` |
| `components/players/u21-rozvoj.tsx` | 278 | `<span className="block relative h-2 rounded-full bg-gray-100 overflow-hidden mt-2 mb-1.5">` |
| `components/relations/RelationSection.tsx` | 102 | `<div className="h-2 rounded-full bg-gray-100 overflow-hidden relative">` |
| `components/sponsors/owner-card.tsx` | 93 | `<div className="h-2 rounded-full bg-gray-100 mt-1 overflow-hidden">` |
| `components/sponsors/popularity-tab.tsx` | 72 | `<div className="h-2.5 mt-1 rounded-full bg-surface-3 overflow-hidden"` |
| `components/sponsors/request-section.tsx` | 53 | `<div className="h-2 rounded-full bg-gray-100 mt-1 overflow-hidden">` |

## choices: Výběr z voleb (zvýraznění vybrané volby)

115 míst v 53 souborech.

| Soubor | Řádek | Kód |
|---|---|---|
| `app/(hra)/fanousci/ChoralyPanel.tsx` | 107 | `className={`rounded-lg border p-3 ${domaci ? "border-pitch-500 bg-pitch-50" : "border-line"}`}` |
| `app/(hra)/finance/page.tsx` | 897 | `className={`h-full ${positive ? "bg-pitch-500" : "bg-card-red"}`}` |
| `app/(hra)/hrac/[id]/PlayerCompare.tsx` | 174 | `other ? "border-pitch-500/40 text-ink" : "border-gray-200 text-muted"` |
| `app/(hra)/hrac/[id]/page.tsx` | 1245 | `const tone = band.tone === "good" ? "bg-pitch-500" : band.tone === "neutral" ? "bg-amber-400" : "bg-red-500";` |
|  | 1540 | `<div key={s.label} className={`p-3 rounded-soft ${s.highlight ? "bg-pitch-50 border border-pitch-100" : "bg-g…` |
| `app/(hra)/kalendar/page.tsx` | 153 | `<div key={i} className={`min-h-[60px] sm:min-h-[80px] border-b border-r border-gray-50 px-0.5 sm:px-1.5 py-1 …` |
| `app/(hra)/liga/page.tsx` | 250 | `<button key={l.id} type="button" aria-pressed={active}` |
|  | 252 | `className={`px-3 py-1.5 rounded-full text-sm font-heading font-bold transition-colors ${active ? "bg-pitch-60…` |
| `app/(hra)/muj-klub/dres/page.tsx` | 262 | `active ? "border-pitch-500 bg-pitch-50" : "border-gray-200 hover:border-gray-300 bg-white"` |
|  | 487 | `active ? "border-pitch-500 bg-pitch-50" : "border-gray-200 hover:border-gray-300 bg-white"` |
|  | 516 | `active ? "border-pitch-500 bg-pitch-50" : "border-gray-200 hover:border-gray-300 bg-white"` |
| `app/(hra)/muj-klub/hymna/page.tsx` | 181 | `<div key={a.id} className={`rounded-xl border-2 p-4 transition-colors ${a.isSelected ? "border-pitch-500 bg-p…` |
|  | 244 | `lyricsMode === "auto" ? "bg-pitch-500 text-white" : "bg-gray-100 text-ink hover:bg-gray-200"` |
|  | 250 | `lyricsMode === "custom" ? "bg-pitch-500 text-white" : "bg-gray-100 text-ink hover:bg-gray-200"` |
|  | 304 | `active ? "border-pitch-500 bg-pitch-50 text-pitch-700 font-bold" : "border-gray-200 hover:border-gray-300 bg-…` |
| `app/(hra)/muj-klub/identita/page.tsx` | 158 | `aria-pressed={active}` |
|  | 160 | `active ? "border-pitch-500 bg-pitch-500 text-white" : "border-gray-200 text-ink hover:border-pitch-300"` |
| `app/(hra)/muj-klub/maskot/page.tsx` | 166 | `<div key={m.id} className={`rounded-xl border-2 overflow-hidden transition-colors ${m.isSelected ? "border-pi…` |
|  | 236 | `active ? "border-pitch-500 bg-pitch-50" : "border-gray-200 hover:border-gray-300 bg-white"` |
|  | 254 | `active ? "border-pitch-500 bg-pitch-50 text-pitch-700 font-bold" : "border-gray-200 hover:border-gray-300 bg-…` |
| `app/(hra)/muj-klub/page.tsx` | 596 | `canAfford ? "bg-pitch-500 hover:bg-pitch-600 shadow" : "bg-gray-300 cursor-not-allowed"` |
|  | 654 | `canAfford ? "bg-pitch-500 hover:bg-pitch-600 shadow" : "bg-gray-300 cursor-not-allowed"` |
| `app/(hra)/nastaveni/page.tsx` | 191 | `<span key={req} className={`text-micro px-1.5 py-0.5 rounded-full font-heading font-bold ${ok ? "bg-pitch-50 …` |
|  | 208 | `<div className={`text-sm font-heading font-bold px-3 py-2 rounded-soft ${status.type === "ok" ? "bg-pitch-50 …` |
|  | 248 | `className={`relative inline-flex h-7 w-12 items-center rounded-full transition-colors flex-shrink-0 mt-1.5 di…` |
|  | 285 | `className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors disabled:opacity-40 flex…` |
| `app/(hra)/pratelaky/friendly-ui.tsx` | 124 | ``${CHIP} ${disabled ? "bg-black/5 text-muted/60 line-through cursor-not-allowed" : on ? "bg-pitch-500 text-wh…` |
|  | 240 | `const cls = result === "W" ? "bg-pitch-500" : result === "L" ? "bg-card-red" : "bg-gray-400";` |
| `app/(hra)/prestupy/DemandsTab.tsx` | 66 | `const chipClass = (on: boolean) => `${CHIP} ${on ? "bg-pitch-500 text-white" : "bg-black/5 text-ink hover:bg-…` |
| `app/(hra)/prestupy/jednani/[id]/page.tsx` | 361 | `className={`px-2.5 py-1 rounded text-sm font-heading font-bold tabular-nums transition-colors ${amount === pr…` |
| `app/(hra)/prestupy/nabidka/[id]/components/ActionBar.tsx` | 174 | `v === preset ? "bg-pitch-500 text-white" : "bg-black/5 text-muted hover:bg-black/10"` |
| `app/(hra)/prestupy/page.tsx` | 523 | `aria-pressed={aktivni === k}` |
|  | 525 | `aktivni === k ? "bg-pitch-500 text-white" : "bg-surface-2 text-muted hover:text-ink"` |
|  | 695 | `aria-pressed={on}` |
|  | 697 | `on ? "bg-pitch-500 text-white" : "bg-surface text-muted hover:text-ink"` |
|  | 1583 | `pocetDalsich > 0 ? "bg-pitch-500 text-white" : "bg-surface text-muted hover:text-ink"` |
|  | 1753 | `filterOpen \|\| activeCount > 0 ? "bg-pitch-500 text-white" : "bg-surface text-muted hover:text-ink"` |
|  | 1808 | `filters.ratingMin === v ? "bg-pitch-500 text-white" : "bg-surface text-muted hover:text-ink"` |
|  | 2035 | `className={`px-3 py-1.5 rounded-soft text-sm font-heading font-bold transition-colors ${offersView === "activ…` |
|  | 2041 | `className={`px-3 py-1.5 rounded-soft text-sm font-heading font-bold transition-colors ${offersView === "histo…` |
|  | 2902 | `className={`px-2.5 py-1 rounded text-sm font-heading font-bold transition-colors ${price === v ? "bg-pitch-50…` |
| `app/(hra)/reputace/page.tsx` | 386 | `m.reached ? "bg-pitch-600 border-white" : "bg-white border-gray-300"` |
| `app/(hra)/sazky/ui.tsx` | 17 | `type="button" onClick={onClick} aria-pressed={vybrano}` |
|  | 20 | `${vybrano ? "bg-pitch-500 text-white" : "bg-gray-50 text-ink hover:bg-gray-100 active:bg-gray-200"}`}` |
| `app/(hra)/stadion/page.tsx` | 432 | `aktivni === h.id ? "bg-pitch-500 text-white shadow-sm" : "text-muted hover:text-ink"` |
|  | 752 | `<div className={`rounded-lg p-3 space-y-2 ${previewing ? "bg-pitch-50 border border-pitch-400" : "bg-gray-50"…` |
|  | 1024 | `className={`flex items-center gap-2 px-3 py-2 rounded-soft border-2 transition-colors text-sm font-heading fo…` |
|  | 1042 | `className={`w-10 h-10 rounded-control border-2 flex items-center justify-center text-sm ${current === null ? …` |
|  | 1052 | `className={`w-10 h-10 rounded-control border-2 ${current === c ? "border-pitch-500" : "border-gray-200 hover:…` |
| `app/(hra)/trener/skripta/page.tsx` | 142 | `i === index ? "bg-pitch-500 text-white border-pitch-500" : "bg-surface text-ink border-gray-200 hover:border-…` |
| `app/(hra)/trener/test/page.tsx` | 392 | `selected ? "border-pitch-500 bg-pitch-50" : "border-gray-200 bg-white hover:border-pitch-300"` |
|  | 395 | `selected ? "bg-pitch-500 text-white" : "bg-surface text-muted"` |
|  | 423 | `} ${answers[i] >= 0 ? "bg-pitch-500 text-white" : "bg-surface text-muted"}`}` |
|  | 448 | `<div className={`card p-5 sm:p-6 border-2 ${result.passed ? "border-pitch-500 bg-pitch-50" : "border-red-300 …` |
|  | 492 | `: chosen ? "border-pitch-500 bg-pitch-50" : "border-transparent text-muted"` |
| `app/(hra)/trenink/page.tsx` | 265 | `val ? "border-pitch-500/40 text-ink" : "border-gray-200 text-muted"` |
| `app/(hra)/tym/[id]/page.tsx` | 256 | `f === "W" ? "bg-pitch-500" : f === "L" ? "bg-card-red" : "bg-gray-500"` |
|  | 506 | `const bg = value >= 60 ? "bg-pitch-50 text-pitch-700" : value >= 40 ? "bg-gray-100 text-ink" : "bg-red-50 tex…` |
| `app/(hra)/u21/page.tsx` | 401 | `{[true, false].map((own) => <button key={String(own)} aria-pressed={onlyOurMatches === own} onClick={() => se…` |
| `app/(hra)/vybaveni/BazarTab.tsx` | 73 | `onlyAvailable ? "bg-pitch-500 text-white" : "bg-surface text-muted hover:text-ink"` |
|  | 187 | `canBuy ? "bg-pitch-500 text-white hover:bg-pitch-600" : "bg-gray-100 text-gray-400 cursor-not-allowed"` |
| `app/(hra)/vybaveni/page.tsx` | 377 | `canUpgrade ? "bg-pitch-500 text-white hover:bg-pitch-600" : "bg-gray-100 text-gray-400 cursor-not-allowed"` |
| `app/(hra)/zamestnanci/skaut/page.tsx` | 278 | ``px-3 py-2 rounded-soft text-sm font-heading font-bold transition-colors ${active ? "bg-pitch-500 text-white"…` |
|  | 591 | `<button key={p} type="button" aria-pressed={positions.includes(p)} className={chip(positions.includes(p))} on…` |
|  | 664 | `<button key={p} type="button" aria-pressed={positions.includes(p)} className={chip(positions.includes(p))} on…` |
|  | 722 | `<button key={p} type="button" aria-pressed={positions.includes(p)} className={chip(positions.includes(p))} on…` |
|  | 784 | `className={`rounded-xl border-2 p-3 text-center transition-colors ${radius === t.km ? "border-pitch-500 bg-pi…` |
| `app/(hra)/zapas/[id]/page.tsx` | 576 | `lineupSort === "position" ? "bg-pitch-500 text-white" : "bg-gray-100 text-ink hover:bg-gray-200"` |
|  | 582 | `lineupSort === "rating" ? "bg-pitch-500 text-white" : "bg-gray-100 text-ink hover:bg-gray-200"` |
| `app/(hra)/zapas/page.tsx` | 113 | `className={`ml-1 text-micro font-heading font-bold px-1 rounded ${good ? "bg-pitch-50 text-pitch-700" : "bg-r…` |
|  | 1518 | `<span className={`w-3.5 h-3.5 rounded-full border-2 shrink-0 ${isSelected ? "border-pitch-600 bg-pitch-600" :…` |
| `components/dashboard/widgets/items/fan-groups-widgets.tsx` | 24 | `? (v >= 60 ? "bg-pitch-500" : v >= 35 ? "bg-amber-500" : "bg-card-red")` |
| `components/dashboard/widgets/items/league-widgets.tsx` | 128 | `p.avgRating >= 7 ? "bg-pitch-50 text-pitch-600" : "bg-gray-50 text-ink"` |
| `components/dashboard/widgets/items/match-widgets.tsx` | 50 | `<div className={`flex items-center gap-4 ${isMatchDay ? "rounded-xl ring-2 ring-pitch-400 bg-pitch-50/30 p-3 …` |
|  | 327 | `f === "W" ? "bg-pitch-500" : f === "L" ? "bg-card-red" : "bg-gray-300"` |
| `components/dashboard/widgets/items/shared.tsx` | 63 | `const bg = value >= 60 ? "bg-pitch-50 text-pitch-700" : value >= 40 ? "bg-gray-100 text-ink" : "bg-red-50 tex…` |
|  | 84 | `const cls = result === "W" ? "bg-pitch-500" : result === "L" ? "bg-card-red" : "bg-gray-400";` |
| `components/dashboard/widgets/widget-frame.tsx` | 81 | `dragging ? "ring-pitch-500 shadow-lg" : "ring-pitch-300"` |
|  | 145 | `aria-pressed={width === w}` |
|  | 148 | `width === w ? "bg-pitch-500 text-white" : "bg-white text-muted hover:bg-gray-100"` |
|  | 164 | `aria-pressed={height === h.value}` |
|  | 167 | `height === h.value ? "bg-pitch-500 text-white" : "bg-white text-muted hover:bg-gray-100"` |
|  | 181 | `aria-pressed={!tint}` |
|  | 184 | `!tint ? "ring-2 ring-pitch-500 ring-offset-1" : "ring-1 ring-gray-300"` |
|  | 193 | `aria-pressed={tint?.key === c.key}` |
|  | 196 | `tint?.key === c.key ? "ring-2 ring-pitch-500 ring-offset-1" : "ring-1 ring-black/10"` |
| `components/dashboard/widgets/widget-picker.tsx` | 117 | `already ? "bg-pitch-500 text-white" : "bg-gray-100 text-muted"` |
|  | 162 | `active ? "bg-pitch-500 text-white" : "bg-white text-muted hover:bg-gray-100 border border-gray-200"` |
| `components/manager/CoachKabinaTab.tsx` | 109 | `delta > 0 ? "bg-pitch-50 text-pitch-600" : delta < 0 ? "bg-red-50 text-card-red" : "bg-gray-50 text-muted"` |
| `components/match/live-match.tsx` | 99 | `className={`flex gap-3 items-start ${event.isGoal ? "bg-pitch-500/5 -mx-2 px-2 py-2 rounded-card" : ""}`}` |
| `components/onboarding/step-club-name.tsx` | 54 | `className={`p-4 rounded-xl text-center transition-all border-2 ${namingChoice === opt.key ? "border-pitch-500…` |
|  | 68 | `className={`p-3 rounded-xl text-sm font-heading font-bold transition-all border-2 ${teamName === n ? "border-…` |
|  | 90 | `className={`p-3 rounded-xl text-center transition-all border-2 text-sm ${stadiumChoice === opt.key ? "border-…` |
| `components/onboarding/step-team.tsx` | 273 | `className={`p-1.5 rounded-soft transition-all border-2 flex flex-col items-center ${jerseyPattern === jp.id ?…` |
|  | 287 | `className={`p-2 rounded-soft transition-all border-2 flex flex-col items-center ${badgePattern === bp.id ? "b…` |
| `components/players/academy-card.tsx` | 418 | `aria-pressed={active}` |
|  | 419 | `className={`w-full flex-1 text-left rounded-soft border p-3 min-h-11 transition-colors ${active ? "border-pit…` |
|  | 779 | `{[1, 2, 3].map((l) => <span key={l} className={`h-1.5 flex-1 rounded-full ${e.level >= l ? "bg-pitch-500" : "…` |
| `components/players/squad-analysis-tab.tsx` | 298 | `positive ? "bg-pitch-50 text-pitch-700" : "bg-card-red/10 text-card-red"` |
| `components/players/squad-attribute-table.tsx` | 162 | `aria-pressed={value === pos}` |
|  | 251 | `? <span className={`${VALUE_BADGE} ${attrBg(v)} ${isKey ? "ring-1 ring-pitch-500/40" : "opacity-40"}`}>{v}</s…` |
| `components/players/u21-rozvoj.tsx` | 283 | `className={`absolute inset-y-0 left-0 ${h.pripravenyDoAcka ? "bg-pitch-500" : "bg-pitch-300"}`}` |
| `components/players/youth-section-nav.tsx` | 28 | `active ? "border-pitch-500 bg-pitch-500 text-white" : "border-gray-200 bg-white text-ink hover:border-pitch-5…` |
| `components/scouting/ScoutReportSheet.tsx` | 303 | `className={`px-2.5 py-1 rounded text-sm font-heading font-bold tabular-nums transition-colors ${amount === pr…` |
| `components/sponsors/firms-tab.tsx` | 48 | `aria-pressed={active}` |
|  | 50 | `active ? "bg-pitch-500 text-white" : "bg-surface-2 text-muted hover:text-ink"` |
| `components/sponsors/negotiation/demands-form.tsx` | 112 | `key={n} type="button" aria-pressed={proposal.seasons === n}` |
|  | 114 | `className={`flex-1 min-h-11 rounded-control text-sm font-heading font-bold ${proposal.seasons === n ? "bg-pit…` |
| `components/sponsors/negotiation/promise-picker.tsx` | 44 | `<div key={kind} className={`rounded-soft border p-3 ${chosen ? "border-pitch-500 bg-pitch-50" : "border-line-…` |
|  | 46 | `type="button" onClick={() => toggle(kind)} disabled={disabled} aria-pressed={!!chosen}` |
| `components/sponsors/request-section.tsx` | 54 | `<div className={`h-full ${pct >= 100 ? "bg-pitch-500" : "bg-gold-500"}`} style={{ width: `${pct}%` }} />` |
| `components/staff/StaffTaskBox.tsx` | 347 | `<label key={p.id} className={`block ${disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer"} ${select…` |
| `components/transfers/loan-listing-dialog.tsx` | 42 | `className={`py-2 px-2 rounded-soft text-sm font-heading font-bold transition-colors ${days === d.days ? "bg-p…` |
|  | 64 | `className={`flex gap-3 items-start p-3 rounded-soft border cursor-pointer transition-colors ${playingTime ===…` |
| `components/transfers/revealed-potential.tsx` | 19 | `<label className={`flex gap-3 items-start p-3 rounded-soft border cursor-pointer transition-colors ${checked …` |

## dialogs: Dialogy a překrytí obrazovky

51 míst v 38 souborech.

Podle druhu: useConfirm bez plachty 19, Modal / ConfirmDialog 17, vlastní překrytí 10, window.confirm 5.

| Soubor | Řádek | Druh | Kód |
|---|---|---|---|
| `app/(hra)/fanousci/FanGroupsPanel.tsx` | 272 | useConfirm bez plachty | `const { confirm, dialog } = useConfirm();` |
| `app/(hra)/fanousci/page.tsx` | 307 | useConfirm bez plachty | `const { confirm, dialog: confirmDialog } = useConfirm();` |
| `app/(hra)/hrac/[id]/SquadNumberEditor.tsx` | 97 | Modal / ConfirmDialog | `<Modal isOpen={open} onClose={() => setOpen(false)} title="Číslo dresu" maxWidth="520px">` |
| `app/(hra)/hrac/[id]/page.tsx` | 176 | useConfirm bez plachty | `const { confirm, dialog: confirmDialog } = useConfirm();` |
|  | 1894 | vlastní překrytí | `<div className="fixed inset-0 z-[var(--z-sheet)] flex items-center justify-center bg-black/40 p-4">` |
|  | 1976 | vlastní překrytí | `<div className="fixed inset-0 z-[var(--z-sheet)] flex items-center justify-center bg-black/40 p-4">` |
| `app/(hra)/muj-klub/dres/page.tsx` | 633 | Modal / ConfirmDialog | `<Modal isOpen={zoomedKit !== null} onClose={() => setZoomedKit(null)} maxWidth="760px">` |
| `app/(hra)/muj-klub/page.tsx` | 206 | window.confirm | `if (!window.confirm(`Opravdu chceš zakoupit šablonu "${tpl.name}" za ${tpl.price.toLocaleString("cs")} Kč?`))…` |
|  | 231 | window.confirm | `if (!window.confirm(`Opravdu chceš zakoupit vylepšení "${add.name}" za ${add.price.toLocaleString("cs")} Kč?`…` |
| `app/(hra)/obec/page.tsx` | 934 | Modal / ConfirmDialog | `<Modal isOpen onClose={onClose} maxWidth="640px">` |
| `app/(hra)/prehled/page.tsx` | 40 | useConfirm bez plachty | `const { confirm, dialog: confirmDialog } = useConfirm();` |
| `app/(hra)/prestupy/hostovani/[id]/page.tsx` | 61 | useConfirm bez plachty | `const { confirm, dialog: confirmDialog } = useConfirm();` |
| `app/(hra)/prestupy/page.tsx` | 1361 | vlastní překrytí | `<div className="fixed inset-0 z-[var(--z-sheet)] flex items-center justify-center bg-black/70" onClick={() =>…` |
| `app/(hra)/rozpis/page.tsx` | 99 | useConfirm bez plachty | `const { confirm, dialog: confirmDialog } = useConfirm();` |
| `app/(hra)/soutez/club-audit-section.tsx` | 141 | Modal / ConfirmDialog | `<Modal isOpen={!!audit} onClose={() => setAudit(null)} title="Účetnictví klubu" maxWidth="640px">` |
| `app/(hra)/soutez/discipline.tsx` | 227 | Modal / ConfirmDialog | `<Modal isOpen onClose={onClose} title="Návrh na pokutu" zavritKlikemVedle={false}>` |
| `app/(hra)/soutez/integrity-panel.tsx` | 256 | Modal / ConfirmDialog | `<Modal isOpen={!!zabavit} onClose={() => setZabavit(null)} title="Zabavit výhru" zavritKlikemVedle={false}>` |
|  | 280 | Modal / ConfirmDialog | `<Modal isOpen={zablokovat} onClose={() => setZablokovat(false)} title="Zakázat klubu sázení" zavritKlikemVedl…` |
| `app/(hra)/soutez/page.tsx` | 837 | Modal / ConfirmDialog | `<Modal isOpen onClose={onClose} title="Nový návrh" zavritKlikemVedle={false}>` |
| `app/(hra)/soutez/panels.tsx` | 514 | Modal / ConfirmDialog | `<Modal isOpen onClose={onClose} title="Pozastavit pravomoc" zavritKlikemVedle={false}>` |
|  | 566 | Modal / ConfirmDialog | `<Modal isOpen onClose={onClose} title="Rezignovat na funkci" zavritKlikemVedle={false}>` |
|  | 695 | Modal / ConfirmDialog | `<Modal isOpen onClose={onClose} title="Žádost o dotaci" zavritKlikemVedle={false}>` |
|  | 788 | Modal / ConfirmDialog | `<Modal isOpen onClose={onClose} title="Návrh na dotaci" zavritKlikemVedle={false}>` |
| `app/(hra)/soutez/referees-panel.tsx` | 191 | Modal / ConfirmDialog | `<Modal isOpen onClose={onClose} title="Stopka rozhodčímu" zavritKlikemVedle={false}>` |
|  | 271 | Modal / ConfirmDialog | `<Modal isOpen onClose={onClose} title="Vyškrtnutí rozhodčího" zavritKlikemVedle={false}>` |
|  | 409 | Modal / ConfirmDialog | `<Modal isOpen onClose={onClose} title="Výměna rozhodčího" zavritKlikemVedle={false}>` |
| `app/(hra)/sponzor/[id]/jednani/page.tsx` | 71 | useConfirm bez plachty | `const { confirm, dialog } = useConfirm();` |
| `app/(hra)/sponzori/page.tsx` | 45 | useConfirm bez plachty | `const { confirm, dialog: confirmDialog } = useConfirm();` |
| `app/(hra)/stadion/page.tsx` | 515 | useConfirm bez plachty | `const { confirm, dialog: confirmDialog } = useConfirm();` |
| `app/(hra)/trener/skripta/page.tsx` | 126 | vlastní překrytí | `<div className="fixed inset-0 z-20 flex items-center justify-center" aria-live="polite">` |
| `app/(hra)/trener/test/page.tsx` | 227 | useConfirm bez plachty | `const { confirm, dialog } = useConfirm();` |
| `app/(hra)/u21/page.tsx` | 107 | useConfirm bez plachty | `const { confirm, dialog: confirmDialog } = useConfirm();` |
| `app/(hra)/udalosti/page.tsx` | 133 | useConfirm bez plachty | `const { confirm, dialog: confirmDialog } = useConfirm();` |
|  | 320 | useConfirm bez plachty | `const { confirm, dialog } = useConfirm();` |
| `app/(hra)/vybaveni/SellDialog.tsx` | 23 | useConfirm bez plachty | `// useConfirm() se tu použít nesmí: jeho dialog by se otevřel nad modalem a hráč` |
|  | 43 | Modal / ConfirmDialog | `<Modal isOpen={!!option} onClose={onClose} maxWidth="34rem">` |
| `app/(hra)/vybaveni/page.tsx` | 52 | useConfirm bez plachty | `const { confirm, dialog: confirmDialog } = useConfirm();` |
| `app/(hra)/zamestnanci/page.tsx` | 197 | useConfirm bez plachty | `const { confirm, dialog } = useConfirm();` |
| `app/(hra)/zapas/page.tsx` | 1382 | vlastní překrytí | `<div className="fixed inset-0 z-[var(--z-sheet)] bg-black/50" onClick={() => setEditSlot(null)} />` |
| `app/konec-sezony/page.tsx` | 99 | vlastní překrytí | `return <div className="fixed inset-0 bg-[#061106] flex items-center justify-center text-white/30 font-heading…` |
| `app/onboarding/page.tsx` | 356 | vlastní překrytí | `<div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[var(--z-sheet)]">` |
| `components/dashboard/announcement-dialog.tsx` | 98 | vlastní překrytí | `className="fixed inset-0 z-[var(--z-sheet)] flex items-end sm:items-center justify-center p-0 sm:p-4"` |
| `components/dashboard/widgets/items/match-widgets.tsx` | 83 | useConfirm bez plachty | `const { confirm, dialog: confirmDialog } = useConfirm();` |
| `components/dashboard/widgets/widget-picker.tsx` | 46 | Modal / ConfirmDialog | `<Modal isOpen={isOpen} onClose={onClose} maxWidth="760px">` |
| `components/manager/CoachEducationTab.tsx` | 123 | useConfirm bez plachty | `const { confirm, dialog } = useConfirm();` |
| `components/relations/RelationSection.tsx` | 140 | window.confirm | `if (confirmText && !window.confirm(confirmText)) return;` |
|  | 345 | window.confirm | `if (confirmText && !window.confirm(confirmText)) return;` |
|  | 463 | window.confirm | `if (choice === "jab" && !window.confirm("Rýpnutí vyjde v novinách a zvedne napětí. Pokračovat?")) return;` |
| `components/sponsors/negotiation/owner-reply-dialog.tsx` | 57 | vlastní překrytí | `<div className="fixed inset-0 z-[var(--z-dialog)] flex items-center justify-center p-4" onClick={onClose}>` |
| `components/sponsors/owner-card.tsx` | 47 | useConfirm bez plachty | `const { confirm, dialog } = useConfirm();` |
| `components/transfers/loan-listing-dialog.tsx` | 29 | vlastní překrytí | `<div className="fixed inset-0 z-[var(--z-sheet)] flex items-center justify-center bg-black/40 p-4">` |

## forms: Formulářová pole bez sdíleného vzhledu

58 míst v 26 souborech.

Podle druhu: textarea 25, input 22, select 11.

| Soubor | Řádek | Druh | Kód |
|---|---|---|---|
| `app/(hra)/muj-klub/hymna/page.tsx` | 259 | textarea | `<textarea value={hints} onChange={(e) => setHints(e.target.value.slice(0, 500))}` |
|  | 277 | input | `<input type="text" value={title} onChange={(e) => setTitle(e.target.value.slice(0, 100))}` |
|  | 282 | textarea | `<textarea value={lyrics} onChange={(e) => setLyrics(e.target.value.slice(0, 3000))}` |
| `app/(hra)/muj-klub/identita/page.tsx` | 192 | input | `<input type="text" value={nickname} onChange={(e) => setNickname(e.target.value.slice(0, 40))}` |
|  | 199 | input | `<input type="number" value={foundingYear} onChange={(e) => setFoundingYear(e.target.value.slice(0, 4))}` |
|  | 216 | input | `<input type="text" value={motto} onChange={(e) => setMotto(e.target.value.slice(0, 120))}` |
|  | 233 | textarea | `<textarea value={foundingStory} onChange={(e) => setFoundingStory(e.target.value.slice(0, 2000))}` |
|  | 251 | textarea | `<textarea value={colorsMeaning} onChange={(e) => setColorsMeaning(e.target.value.slice(0, 500))}` |
| `app/(hra)/muj-klub/maskot/page.tsx` | 223 | input | `<input type="text" value={name} onChange={(e) => setName(e.target.value.slice(0, 50))}` |
| `app/(hra)/muj-klub/page.tsx` | 465 | textarea | `<textarea` |
| `app/(hra)/muj-klub/stadion/page.tsx` | 184 | input | `<input type="text" value={name} onChange={(e) => setName(e.target.value.slice(0, 60))}` |
|  | 191 | input | `<input type="text" value={nickname} onChange={(e) => setNickname(e.target.value.slice(0, 40))}` |
|  | 199 | input | `<input type="number" value={builtYear} onChange={(e) => setBuiltYear(e.target.value.slice(0, 4))}` |
|  | 223 | input | `<input type="text" value={tribunaNorth} onChange={(e) => setTribunaNorth(e.target.value.slice(0, 40))}` |
|  | 229 | input | `<input type="text" value={tribunaSouth} onChange={(e) => setTribunaSouth(e.target.value.slice(0, 40))}` |
|  | 244 | input | `<input type="text" value={specialita} onChange={(e) => setSpecialita(e.target.value.slice(0, 80))}` |
| `app/(hra)/nastaveni/page.tsx` | 177 | input | `<input id="pw-current" name="current-password" type="password" autoComplete="current-password"` |
|  | 183 | input | `<input id="pw-new" name="new-password" type="password" autoComplete="new-password"` |
|  | 201 | input | `<input id="pw-new-2" name="new-password-confirm" type="password" autoComplete="new-password"` |
| `app/(hra)/pratelaky/FriendlyForm.tsx` | 124 | select | `<select aria-label="Soupeř" value={opponentId} onChange={(e) => setOpponentId(e.target.value)} className={sel…` |
|  | 223 | textarea | `<textarea value={message} onChange={(e) => setMessage(e.target.value.slice(0, limits.maxMessage))} rows={2}` |
| `app/(hra)/prestupy/DemandsTab.tsx` | 340 | select | `<select aria-label="Věk od" value={ageMin} onChange={(e) => setAgeMin(Number(e.target.value))} className={sel…` |
|  | 343 | select | `<select aria-label="Věk do" value={ageMax} onChange={(e) => setAgeMax(Number(e.target.value))} className={sel…` |
|  | 351 | input | `<input type="number" inputMode="numeric" min={1} max={85} value={minRating} onChange={(e) => setMinRating(e.t…` |
|  | 360 | select | `<select aria-label="Dovednost" value={r.skill} onChange={(e) => updateRow(i, { skill: e.target.value })} clas…` |
|  | 366 | input | `<input type="number" inputMode="numeric" min={1} max={99} value={r.min} onChange={(e) => updateRow(i, { min: …` |
|  | 390 | textarea | `<textarea value={note} onChange={(e) => setNote(e.target.value.slice(0, noteMax))} rows={2}` |
| `app/(hra)/prestupy/nabidka/[id]/components/ActionBar.tsx` | 188 | textarea | `<textarea` |
| `app/(hra)/prestupy/nabidka/[id]/components/MessageDialog.tsx` | 22 | textarea | `<textarea` |
| `app/(hra)/prestupy/page.tsx` | 1653 | input | `<input type="number" value={searchAgeMin \|\| ""} onChange={(e) => setSearchAgeMin(parseInt(e.target.value) \…` |
|  | 1657 | input | `<input type="number" value={searchAgeMax < 99 ? searchAgeMax : ""} onChange={(e) => setSearchAgeMax(parseInt(…` |
| `app/(hra)/sazky/arena.tsx` | 121 | textarea | `<textarea` |
| `app/(hra)/sazky/tiket.tsx` | 162 | input | `<input id="vklad" type="number" inputMode="numeric" value={vklad}` |
| `app/(hra)/sazky/tikety.tsx` | 107 | textarea | `<textarea id={`vzkaz-${t.id}`} value={vzkaz} onChange={(e) => setVzkaz(e.target.value)}` |
| `app/(hra)/soutez/discipline.tsx` | 275 | textarea | `<textarea className="input w-full mt-1" rows={3} maxLength={200}` |
| `app/(hra)/soutez/integrity-panel.tsx` | 267 | textarea | `<textarea id="duvod-zabaveni" value={duvod} onChange={(e) => setDuvod(e.target.value)}` |
|  | 290 | select | `<select id="cil-zakazu" value={cil} onChange={(e) => setCil(e.target.value)}` |
|  | 302 | input | `<input id="pocet-kol" type="number" min={1} max={30} value={kol}` |
|  | 310 | textarea | `<textarea id="duvod-zakazu" value={duvod} onChange={(e) => setDuvod(e.target.value)}` |
| `app/(hra)/soutez/page.tsx` | 710 | textarea | `<textarea className="input w-full mt-2" rows={2} maxLength={150}` |
|  | 927 | textarea | `<textarea className="input w-full mt-1" rows={3} maxLength={500}` |
| `app/(hra)/soutez/panels.tsx` | 527 | textarea | `<textarea className="input w-full mt-1" rows={3} maxLength={300}` |
|  | 722 | textarea | `<textarea className="input w-full mt-1" rows={3} maxLength={500}` |
|  | 858 | textarea | `<textarea className="input w-full mt-1" rows={3} maxLength={500}` |
|  | 1074 | textarea | `<textarea className="input w-full" rows={3} maxLength={maxLength}` |
| `app/(hra)/soutez/referees-panel.tsx` | 219 | textarea | `<textarea className="input w-full mt-1" rows={3} maxLength={200}` |
|  | 304 | textarea | `<textarea className="input w-full mt-1" rows={3} maxLength={200}` |
|  | 455 | textarea | `<textarea className="input w-full mt-1" rows={3} maxLength={200}` |
| `app/(hra)/u21/page.tsx` | 406 | select | `<select aria-label="Kolo soutěže" value={activeRound} onChange={(e) => setSelectedRound(Number(e.target.value…` |
|  | 633 | select | `<select className="w-full min-h-11 rounded-lg border border-gray-200 bg-surface px-2 text-sm text-ink" value=…` |
| `app/(hra)/zamestnanci/skaut/page.tsx` | 758 | select | `<select value={ageMin} onChange={(e) => { const v = Number(e.target.value); setAgeMin(v); if (v > ageMax) set…` |
|  | 763 | select | `<select value={ageMax} onChange={(e) => { const v = Number(e.target.value); setAgeMax(v); if (v < ageMin) set…` |
| `app/registrace/page.tsx` | 92 | select | `<div><label htmlFor="district" className="input-label">Váš okres</label><select id="district" name="district"…` |
| `components/admin/league-requests.tsx` | 48 | textarea | `{invite?.id === request.id && <div className="bg-pitch-50 p-4 rounded space-y-2 ph-no-capture" data-ph-no-cap…` |
| `components/manager/EditManagerModal.tsx` | 150 | textarea | `<textarea` |
| `components/onboarding/step-club-name.tsx` | 77 | input | `<input type="text" value={customName} onChange={(e) => setCustomName(e.target.value)}` |
|  | 97 | input | `<input type="text" value={customStadium} onChange={(e) => setCustomStadium(e.target.value)}` |
| `components/players/PlayerBrowseTable.tsx` | 249 | select | `<select value={sortKey} onChange={(e) => { const k = e.target.value as SortKey; setSortKey(k); setSortDir(k =…` |

## collapsible: Sbalovací bloky (`<details>`)

17 míst v 11 souborech.

| Soubor | Řádek | Kód |
|---|---|---|
| `app/(hra)/fanousci/FanGroupsPanel.tsx` | 217 | `<details className="rounded-lg" style={{ background: "var(--color-paper)" }}>` |
|  | 269 | `// Jeden dialog pro celý panel. Uvnitř <details> s akcemi by ho sbalený` |
|  | 278 | `<details className="card p-4 sm:p-5 group">` |
|  | 360 | `<details className="mt-3 group">` |
| `app/(hra)/fanousci/page.tsx` | 552 | `<details className="card p-4 sm:p-5 group">` |
| `app/(hra)/hrac/[id]/page.tsx` | 1799 | `<details className="card">` |
| `app/(hra)/muj-klub/hymna/page.tsx` | 216 | `<details className="mt-3">` |
| `app/(hra)/obec/page.tsx` | 778 | `<details className="card p-4 sm:p-5 group">` |
| `app/(hra)/soutez/club-audit-section.tsx` | 205 | `<details>` |
| `app/(hra)/soutez/ui.tsx` | 187 | `<details className="card p-4 sm:p-5 group">` |
| `app/(hra)/trenink/page.tsx` | 766 | `<details className="card group">` |
|  | 855 | `<details className="card group">` |
| `app/(hra)/zamestnanci/page.tsx` | 424 | `<details className="text-xs group">` |
| `components/players/academy-card.tsx` | 392 | `<details className="text-sm">` |
|  | 465 | `<details key={g.age} className="card overflow-hidden" open>` |
| `components/players/squad-analysis-tab.tsx` | 780 | `<details className="card group">` |
|  | 811 | `<details className="card group">` |
