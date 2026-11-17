# Nahlásit chybu ze hry přes menu u kroužku nápovědy

Datum: 2026-11-17 · stav: návrh k odsouhlasení

## Proč

Hráči posílají screeny s chybami na WhatsApp. Autor se pak musí doptávat, na jaké stránce
to bylo, za jaký klub, kdy a na jakém telefonu. Většina hlášení chodí z mobilu.

Cíl: hráč nahlásí chybu přímo ze hry. Hlášení přijde do adminu i se screenem a s tím,
na co se autor dneska doptává. Autor hráči odpoví z adminu a odpověď mu přijde jako SMS
do Telefonu ve hře. Autor pak hráčům řekne, ať místo WhatsAppu používají tlačítko.

Stejné místo (menu u kroužku nápovědy) později poslouží i pro sdílení screenů do Socek
s vodoznakem a odkazem na hru (samostatný projekt, viz Ne-cíle).

## Cíle

1. Kroužek nápovědy (`?`) v horní liště otevře malé rozbalovací menu:
   **Nápověda ke stránce** a **Nahlásit chybu**. Na stránkách bez nápovědy jen Nahlásit chybu.
2. Kroužek je na každé stránce hry. Dnes se tam, kde nápověda není, neukazuje
   (`components/ui/napoveda.tsx`, `Napoveda` vrací `null`, když `findHelp` nic nenajde;
   schovaný je i v detailu konverzace v Telefonu).
3. Nahlásit chybu zavře menu, vyfotí stránku přesně tak, jak ji hráč nechal (rozbalené části,
   rozepsaný text, odscrollované místo), a otevře okno s náhledem screenu a nepovinným komentářem.
4. Ke každému hlášení se samo přibalí kontext (viz níže). Hráč nic technického nevyplňuje.
5. Hlášení se objeví v adminu. Autor ho tam vidí i se screenem, odpoví hráči a označí ho
   jako vyřešené.
6. Odpověď přijde hráči jako SMS do Telefonu.
7. Tlačítko Nahlásit chybu je i na chybové stránce „Něco se pokazilo“.

## Ne-cíle (tentokrát ne)

- Sdílení screenů do Socek nebo ven s vodoznakem a odkazem na hru. Přijde potom jako třetí
  položka stejného menu a použije stejné focení stránky.
- Menu Více jako vrstva nad stránkou. Zvažovalo se jen kvůli hlášení, autor ho zamítl.
  Více zůstává stránkou jako dnes.
- Nahlášení z otevřeného okna (plachty). Okna zakrývají celou obrazovku i horní lištu;
  chybu v okně hráč nahlásí screenem z galerie (viz Průběh).
- Kreslení nebo zakrývání ve screenu.
- Konverzace v hlášení. Odpověď autora je jednosměrná SMS; když hráč potřebuje něco dodat,
  pošle nové hlášení.
- Upozornění autorovi mimo admin (push, e-mail, Linear).

## Anti-cíle (selhání, i kdyby to technicky fungovalo)

- **Ztráta pohodlí:** hlášení nesmí hráče odvést z jeho stránky ani ji načíst znovu.
- **Nepořádek v UI:** žádná nová ikona v horní liště, žádná plovoucí bublina, nic v každém okně.
- **Hráč vyplňuje technické věci:** stránka, zařízení a podobně se zjišťují samy.

## Zvažované přístupy

Kde tlačítko bude:

| Přístup | Výhody | Nevýhody | Stav |
|---|---|---|---|
| Uvnitř panelu nápovědy | nic nepřibude | nápověda je o něčem jiném, autorovi se to nelíbí | zamítnuto |
| Vlastní ikonka v horní liště | vždy po ruce | lišta je na mobilu plná | zamítnuto |
| Plovoucí bublina | vidět všude | překrývá obsah | zamítnuto |
| Ve Více, které hráče vrátí zpět a vyfotí | bez změny navigace | ztratí chvilkový stav stránky | zamítnuto (anti-cíl) |
| Více jako vrstva nad stránkou | stránka zůstane | mění navigaci všem kvůli jedné položce | zamítnuto |
| **Menu u kroužku nápovědy** | stránka zůstane, nic nového v liště, mobil i počítač, později i sdílení | nápověda je o ťuknutí dál | **vybráno autorem** |

Jak vznikne screen:

| Přístup | Výhody | Nevýhody | Stav |
|---|---|---|---|
| **Vyfocení stránky v prohlížeči** (knihovna DOM → obrázek) | hráč nic nedělá | 3D stadion a cizí obrázky můžou vyjít prázdné | **hlavní cesta** |
| Screen z galerie (hráč si ho udělá tlačítky telefonu) | přesně to, co hráč viděl; řeší i chybu v okně | krok navíc | **doplněk ve formuláři** |

## Jak to funguje

### Menu u kroužku nápovědy

```
‹  Kádr  (?)            3.   12 400 Kč
         ┌─────────────────────────┐
         │ 📖 Nápověda ke stránce  │
         │ 🐞 Nahlásit chybu       │
         └─────────────────────────┘
```

- Kroužek zůstává, jak je (tenký kroužek s `?` u názvu stránky, `HelpButton` varianta `bar`).
- Ťuknutí otevře menu pod kroužkem; ťuknutí vedle nebo Escape ho zavře.
- Nápověda ke stránce otevře dnešní panel nápovědy (`HelpPanel`).
- Plovoucí varianta pro onboarding (`NapovedaOnboarding`) se nemění.
- Horní lišta je na mobilu i na počítači, takže jiné místo není potřeba.

### Nahlásit chybu

Kde:
- menu u kroužku nápovědy (mobil i počítač),
- chybová stránka: tlačítko v `AppErrorPanel` (`components/app-error-panel.tsx`),
  k hlášení se přidá text chyby a `digest`.

Průběh:
1. Hráč ťukne na Nahlásit chybu.
2. Menu se zavře.
3. Vyfotí se viditelná část obrazovky tak, jak ji hráč vidí, i s horní a spodní lištou,
   tedy jako screen tlačítky telefonu, ne celá dlouhá stránka.
4. Otevře se okno:

```
┌ Nahlásit chybu ──────────────┐
│ ┌──────────┐                 │
│ │ náhled   │  Co se stalo?   │
│ │ screenu  │  (nepovinné)    │
│ └──────────┘  [____________] │
│ Přiložit vlastní screen      │
│                    [Odeslat] │
└──────────────────────────────┘
```

5. „Přiložit vlastní screen“ nahradí náhled obrázkem z galerie (pro chybu v okně: screen
   tlačítky telefonu, zavřít okno, nahlásit, přiložit).
6. Když vyfocení selže, okno se otevře bez náhledu a s výzvou přiložit screen z galerie.
   Hlášení jde odeslat i bez obrázku (třeba jen s komentářem).
7. Po odeslání krátké potvrzení („Díky, hlášení dorazilo“). Okno se nezavírá kliknutím vedle,
   aby se rozepsaný komentář neztratil.

Co se přibalí samo (hráč to nevidí):
- adresa stránky (cesta a parametry),
- uživatel a klub (id a název),
- čas,
- prohlížeč (user agent), rozměr obrazovky a hustota pixelů, jestli běží jako nainstalovaná
  aplikace nebo v prohlížeči,
- verze webu (commit buildu),
- posledních pár chyb z konzole a neošetřených výjimek od načtení aplikace,
- posledních pár navštívených stránek,
- odkaz na nahrávku v PostHogu v čase nahlášení (`posthog.get_session_replay_url`),
- u chybové stránky text chyby a `digest`.

### Admin

- Nová záložka **Hlášení** v administraci (`admin/admin-tabs.ts`) s počtem nevyřešených.
- Seznam od nejnovějšího: kdo (klub), kdy, stránka, začátek komentáře, náhled screenu, stav.
- Detail: screen v plné velikosti, komentář, všechen přibalený kontext, odkaz na nahrávku.
- Odpověď hráči: textové pole a tlačítko Odeslat. Odpověď odejde jako SMS (viz níže)
  a uloží se u hlášení. Odpovědět jde víckrát.
- Stav: nové → vyřešené (a zpět).

### Odpověď hráči

- Přes existující `sendSystemSMS` (`messaging/system-sms.ts`) do systémové konverzace klubu.
- Odesílatel: „Tvůrce hry“ (návrh, autor může změnit).
- Text odpovědi doplní krátký odkaz na to, k čemu patří (např. datum hlášení a začátek
  komentáře), aby hráč věděl, o čem řeč.
- Hráč na systémovou SMS neodpovídá; když chce něco dodat, nahlásí znovu.
- Hlášení si ukládá uživatele i klub, ze kterého přišlo. Odpověď jde do **současného** klubu
  uživatele (klub mohl mezitím převzít AI trenér nebo ho hráč opustil). Když uživatel žádný
  klub nemá, admin ukáže „nejde doručit“ a odpověď nepustí. *(rozhodnutí stavitele)*

### Data a úložiště

- Nová tabulka hlášení v D1 (migrace `CREATE TABLE`, na testu i produ ručně přes wrangler,
  na produ jen po souhlasu a se zálohou).
- Screen do R2 `SEED_DATA` pod vlastní předponu, jako jiné obrázky (`club-website.ts:1246`).
  Servíruje ho jen admin.
- Obrázek se před odesláním zmenší a zkomprimuje (WebP/JPEG, do ~1 MB).
- Strop na počet hlášení od jednoho uživatele za hodinu proti omylu i spamu.
- Hlásit můžou jen přihlášení.

## Pořadí

1. Zkouška: menu u kroužku a vyfocení stránky (bez odesílání a adminu). Ověřit na iPhonu
   v Safari i v nainstalované aplikaci; podle toho vybrat knihovnu.
2. Odeslání, tabulka, R2, admin, odpověď SMS, chybová stránka.

## Omezení

- Pravidla z `CLAUDE.md`: identifikátory anglicky, texty pro hráče česky bez dlouhé pomlčky,
  žádný prázdný catch, práce na `testing`, na `main` jen po výslovném souhlasu.
- UI nejdřív na localhostu, testing až po OK, push jen na výslovný pokyn.
- Ověřit na 375 px (iPhone) v prohlížeči i v nainstalované aplikaci, včetně safe area.

## Co zůstává na stavitelovi

- Výběr knihovny na vyfocení stránky (např. `modern-screenshot`, `@zumer/snapdom`).
  Rozhoduje, jak věrně vyfotí stránku v Safari na iPhonu i v nainstalované aplikaci
  (písma, obrázky, `position: fixed` lišty) a jak rychle to zvládne.
- Jak zachytit chyby z konzole (vlastní malý zásobník od startu aplikace).
- Jak dostat verzi buildu do webu (dnes žádná proměnná `NEXT_PUBLIC_*` s commitem není).
- Přesná podoba rozbalovacího menu a okna hlášení.
- Podoba seznamu a detailu v adminu.
