# Načítání: skákající míč místo kolečka

Datum: 2026-11-23 · Stav: návrh ke schválení

## Proč

Při načítání se dnes ukazuje anonymní zelené kolečko. Hra má mít charakter okresního fotbalu
i ve chvíli, kdy hráč čeká. Načítání ale nesmí zdržovat ani problikávat.

## Cíle

- Místo kolečka míč, všude najednou přes sdílenou komponentu.
- Při delším načítání krátká hláška z okresního fotbalu.
- Rychlé načtení neukáže nic, žádné problikutí.

## Ne-cíle

- Skeletony. Ty budou samostatný krok po průchodu stránkami, kde načítání problikává.
- Zrychlování načítání (cache, přednačítání).

## Anti-cíle

- Načítání prodloužené kvůli animaci (žádná minimální doba zobrazení).
- Posun rozložení stránek tam, kde je dnes malé kolečko (tlačítka, řádky).
- Těžká knihovna na animace.

## Přístupy

| Varianta | Za | Proti |
|---|---|---|
| **1 · Skákající míč** (vybráno) | hned čitelný, funguje i malý | méně originální než lajnovačka |
| 2 · Lajnovačka | nejvíc okresní | potřebuje šířku, do tlačítka se nevejde |
| 3 · Míč do sítě | hezká scénka | smyčka skoro 2 s, při rychlém načtení je vidět jen půlka |

Uživatel vybral variantu 1 v ukázce 2026-11-23.

## Návrh

Vše v `apps/web/src/components/ui/spinner.tsx` a stylech v `apps/web/src/app/globals.css`.

- **`Spinner`** (`sm` / `md` / `lg`, 34 míst): místo kolečka **točící se míč** ve stejných rozměrech
  jako dnes. Rozložení se nikde nemění. Patří sem tlačítka a malá místa.
- **`PageLoading` a `SectionLoading`** (71 souborů): **skákající míč se stínem**, při dopadu se zplácne.
  - Ukáže se až po 300 ms. Do té doby prázdno (ne prázdný stav).
  - Po 1,5 s se pod míčem objeví hláška, střídá se asi po 2,6 s, první je náhodná.
- **Čtyři vlastní kolečka** s `animate-spin` mimo komponentu (`StadiumPhotoCard`, `Stadium3D`,
  `reveal-card`, `step-reveal`) se nahradí `<Spinner />`. *(moje volba, ať je to všude stejné)*
- Míč je SVG přímo v komponentě, animace v CSS. Bez knihovny.
- Kdo má v systému zapnuté omezení pohybu (`prefers-reduced-motion`), uvidí míč bez pohybu, hláška zůstane.
- `role="status"` a `aria-label="Načítám"` zůstávají.
- `spinner.tsx` dostane `"use client"` (časovače). Všechny soubory, které `PageLoading`/`SectionLoading`
  používají, už klientské jsou.

### Hlášky

Krátké, ze skutečných situací na okresním hřišti, bez dlouhé pomlčky. *(seznam je můj návrh)*

- Správce ještě lajnuje hřiště…
- Hledám klíče od kabiny…
- Pumpuju míče…
- Dresy ještě schnou na šňůře…
- Rozhodčí ještě parkuje…
- Vytahuju branky z kůlny…
- Natahuju sítě na branky…
- Zapichuju rohové praporky…
- Na stánku se rozpaluje gril…
- Paní u okýnka vydává párky…
- Kluci se ještě převlíkají…
- Ještě se seče trávník…
- Pokladník přepočítává drobné…
- Rozhodčí hledá píšťalku…

## Ověření

- Lokálně `next build`, pak v prohlížeči na 375 px:
  - rychlá stránka: nic neproblikne;
  - pomalá síť (throttling): míč po 300 ms, hláška po 1,5 s;
  - tlačítko s `Spinner size="sm"` nezmění rozměr;
  - tmavý přehrávač zápasu (`MatchReplayViewer`): míč je vidět.

## Nechávám na implementaci

Přesné pixely, křivky animace a délka smyčky (ukázka: 0,9 s skok, 1,8 s otočka).
