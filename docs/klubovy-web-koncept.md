# Koncept: Klubový web (veřejný portál klubu & virální motor Pralesu)

> **Vize:** Nahradit stávající interní stránku „Klub“ plnohodnotným **Klubovým webem**, který věrně simuluje oficiální prezentaci fotbalového klubu (po vzoru portálů jako `sparta.cz` nebo webů okresních a krajských celků). Web je **veřejně přístupný bez nutnosti přihlášení**, slouží k přirozenému sdílení mezi kamarády a funguje jako virální růstový kanál pro Prales. Zároveň tvoří živý prvek herní ekonomiky – manažer začíná na prostém retro/okresním webu zdarma a za herní peníze si dokupuje profesionálnější šablony, moduly a vizuální prvky s cenami plně odpovídajícími reálné ekonomice Pralesu.

---

## 1. Mapování všech stávajících dat ze stránky „Klub“ na Klubový web

Na stránce Klub máme v Pralesu bohatou sadu identity, kterou na Klubovém webu plnohodnotně a hrdě vystavíme:

| Stávající sekce / atribut | Kde a jak se zobrazí na Klubovém webu |
| :--- | :--- |
| **Název klubu & Přezdívka (`nickname`)** | V hlavní hlavičce webu (např. *TJ Sokol Kozlovice* – *„Kozlovští berani“*). |
| **Klubové motto (`motto`)** | Podtitul v hlavičce a zápatí webu (např. *„Srdce na hřišti, pivo v kabině“*). |
| **Rok založení (`foundingYear`)** | Prestižní badge v hlavičce: *„Est. 1921“* / *„Založeno 1921“*. |
| **Příběh založení (`foundingStory`)** | V sekci **Historie klubu / O nás** – kompletní příběh vzniku klubu. |
| **Význam barev (`colorsMeaning`)** | V sekci **Klubové symboly & Barvy** (proč klub hraje v zeleno-bílé). |
| **Znak klubu (`badge`)** | Oficiální erb v záhlaví, favicone i v patičce (vzor, barvy, symbol, iniciály). |
| **Dresy: Domácí i Hostující (`jersey`)** | Vizuální prezentace dresů (domácí sada + venkovní sada, šortky, stulpny, vzor dresu, fake/herní sponzor na hrudi). |
| **Klubová šála (`scarfPattern`)** | Zobrazení pletené klubové šály fanoušků v záhlaví sekce Fanzone / Kotel. |
| **Stadion: Název & Přezdívka (`name`, `nickname`)** | Záhlaví stadionu (např. *Stadion Josefa Masopusta* – *„V Rokli“*). |
| **Kapacita & Rok výstavby (`capacity`, `builtYear`)** | Technické parametry areálu v sekci Stadion. |
| **Tribuny (`tribunaNorth`, `tribunaSouth`)** | Názvy severního valu a jižní tribuny v popisu areálu. |
| **Vesnická specialita stadionu (`specialita`)** | Autentický medailonek stadionu: *„U nás na stadionu: Potok hned za bránou, kde se loví míče“* nebo *„Udírna přímo u střídačky hostů“*. |
| **Stav trávníku & povrch (`pitchCondition`, `pitchType`)** | Zápasový stav hřiště v zápasovém centru & Pitch Report. |
| **Klubová hymna (`anthem`)** | Přehrávač hymny se zobrazením textu (lyrics), stylu a názvu skladby. |
| **Chorály kotle (`chants`)** | Přehrávač chorálů a nahrávek z kotle (miláček kotle, vítězná, vzdor). |
| **Maskot klubu (`mascot`)** | Profilová karta maskota s obrázkem, jménem a jeho příběhem. |
| **Obec & Region (`village`)** | Hrdost na domovinu – název obce, okres, kraj a počet obyvatel. |

---

## 2. Anatomie a obsah Klubového webu (Inspirace `sparta.cz`)

Web kombinuje živá data z herního enginu Pralesu s prvky nastavenými manažerem.

### 🔝 A. Zápasové centrum & Prodej vstupenek (Match Bar v hlavičce)
* **🔥 Derby Alert (Zvýšená pohotovost při rivalitě):**
  * Pokud je soupeřem okresní rival (ze systému `rivalita`), zápasový box se orámuje červeným výstražným pruhem:  
    *„POZOR: Blíží se DERBY s FK Horní Lhota! Zvýšená pořadatelská služba, pivo se točí do kelímků a parkování u hasičárny je vyhrazeno pro domácí.“*
* **Tlačítko „VSTUPENKY“ přímo v hlavní navigaci (jako na Sparta.cz):**
  * Informace o vstupném na domácí zápasy (např. *Dospělí 30 Kč*, *Děti a senioři zdarma*).
  * Informace o permanentkách na celou sezónu (sleva na 15 domácích kol).
  * **Virtuální lístek / „Kup hráčům pivo“:** Tlačítko pro návštěvníky zvenčí (kamarády), kterým mohou symbolicky podpořit klub malým darem do klubové kasy.
* **Následující zápas (Hero banner):**
  * Soupeř, datum a čas výkopu, stadion, odpočet do výkopu (*„Výkop za: 1 den, 4 hodiny“*).
  * Partner utkání (sponzor) a ligové sázkové kurzy (domácí / remíza / hosté).
  * **🌤️ Počasí na hřišti & Způsobilost terénu (Pitch Report):**  
    Živý stav areálu přímo z enginu zápasu (teplota, stav počasí, vlhkost trávníku):  
    *„Aktuálně na stadionu: 15 °C, polojasno. Trávník po ranním sečení, terén způsobilý.“* (nebo v listopadu: *„Těžký, podmáčený terén, doporučeny kolíky.“*).
  * **🗞️ Zápasový bulletin / Program ke stažení či prolistování:**  
    Odkaz na oficiální zápasový program ke kolu (napojeno na herní modul `zpravodaj` – představení soupeře, slovo trenéra, minulý výsledek a soupiska).
* **Poslední odehraný zápas:**
  * Výsledek (např. *TJ Sokol Kozlovice 3 : 1 FK Horní Lhota*), střelci gólů, návštěva utkání, odkaz na report a sestřih.

---

### 🍻 B. Ceník občerstvení (Klubový bufet & Kiosek na hřišti)
Nedílná součást fotbalové kultury – propojeno přímo s herním modulem koncesí (bufetu) a prodejními cenami:
* **Nabídka nápojů a jídla:**
  * **Pivo z tanku/sudu:** Značka piva (např. *Měšťan 10°*, *Kozel 11°*), aktuální prodejní cena (např. *25 Kč*).
  * **Klobása z udírny s hořčicí a chlebem:** Značka / původ (např. *Kostelecká*, *Místní řezník*), prodejní cena (např. *30 Kč*).
  * **Nealko / Malinovka:** Točená limonáda, prodejní cena (např. *15 Kč*).
  * Případné speciality (párek v rohlíku, káva, rum).
* **Provozní informace:**
  * Typ občerstvení (např. *„Pivní stan z bazaru“*, *„Karavan u rohového praporku“*, *„Zděná hospůdka Na Hřišti“*).
  * Hláška: *„Kiosek otevírá 45 minut před výkopem, točíme i o poločase a po zápase!“*

---

### 👥 C. Týmy & Kádry (A-tým & U21 Rezerva)
Přepínatelná sekce pro **A-tým** a **U21** (případně dorost/mládež). Každá kategorie obsahuje:
1. **Soupiska (Kádr):**
   * Členění podle formací: **Brankáři**, **Obránci**, **Záložníci**, **Útočníci**.
   * Karta hráče: Číslo dresu, portrét (avatar), národnost, věk, odehrané zápasy, góly, asistence a čistá konta.
   * *Ochrana taktiky:* Zobrazují se pouze reálné veřejné statistiky a výkony, nikoliv skryté vnitřní herní atributy.
2. **Interaktivní taktické hřiště (Základní 11):**
   * Grafické zobrazení aktuální nebo nejčastější základní sestavy na trávníku v klubových dresech.

---

### 👔 D. Realizační tým (Trenérský štáb & personál)
Přesně podle profesionálních klubů má realizační tým vlastní prestižní sekci:
* **Vedení klubu:**
  * **Manažer / Majitel** (avatar, jméno, bilance zápasů, herní reputace, klubová vize).
  * **Sportovní ředitel / Hlavní skaut** (pokud má klub najatého).
* **Trenérský štáb:**
  * **Hlavní trenér** (trenérská licence, fotka, preferovaný herní styl, statistika W-D-L).
  * **Asistent trenéra** (vliv na kabinu a trénink).
  * **Trenér brankářů** (specialista na gólmany).
  * **Kondiční trenér** (fitness a regenerace).
* **Zdravotní a servisní tým:**
  * **Fyzioterapeut / Klubový lékař** (péče o zraněné hráče).
  * **Vedoucí mužstva / Kustod** (zázemí, dresy).
  * *Vesnické a nižší soutěže:* volitelné role jako „Správce hřiště & hospodský“, „Hlasatel s amplionem“, „Zdravotnice s alpou a ledem“.

---

### 🏟️ E. Stadion & Areál (Vizuální chlouba klubu & fotogalerie)
Sekce věnovaná domácímu stánku s bohatou fotogalerií a parametry:
* **Profil stadionu:**
  * Název a přezdívka stadionu (*„Stadion Josefa Masopusta – V Rokli“*).
  * Kapacita (k sezení, stání, celková), rok výstavby.
  * Názvy tribun (Severní val, Jižní krytá tribuna).
  * Vesnická specialita stadionu.
  * Typ a stav trávníku, zavlažování a sečení.
  * Osvětlení (má / nemá umělé osvětlení – noční vs. denní vizuál).
* **Fotogalerie areálu:**
  * **Hlavní tribuna & hřiště:** Využití stávajícího `Stadium3D` i dynamických fotek areálu podle úrovně vybavení (od dřevěného zábradlí po betonové tribuny).
  * **Domácí kotel & Sektor hostů:** Zobrazení vyvěšené choreo plachty, kterou pro klub tvoří kotel.
  * **Zázemí:** Fotka stánku s občerstvením, střídačky, VIP boxy, kabiny a klubovna.
  * **Historické proměny:** Archiv fotek areálu po jednotlivých modernizacích.

---

### 🎙️ F. Tiskové středisko & Rozhovory (Media Hub)
* **Pozápasové rozhovory:**
  * Archiv všech tiskovek a rozhovorů, které trenér v Pralesu po zápasech poskytl médiím (otázky novinářů z redakčního enginu a trenérovy autentické odpovědi).
* **Klubové novinky (Bleskovky):**
  * Automatické tiskové zprávy: posily, marodka, přestupové spekulace, postupové oslavy.
* **Prohlášení vedení:**
  * Možnost pro manažera publikovat vlastní článek nebo vzkaz fanouškům.

---

### 🏆 G. Historie, Trofeje & Fanoušci
* **Historie a příběh založení:** Kompletní `foundingStory` a milníky klubu.
* **Síň slávy:** Vyhrané poháry, ligové tituly, postupy, ocenění manažera.
* **Identita, Barvy & Hymna:** Význam barev (`colorsMeaning`), přehrávač klubové hymny a chorálů nahraných z kotle, karta maskota s fotkou a příběhem, klubová šála.

---

### 🤝 H. Sponzorská pyramida (v patičce webu)
* **Generální partner** (hlavní logo na hrudi dresu).
* **Hlavní partneři** (stadium naming rights, partneři utkání).
* **Dodavatelé & Lokální partneři** (místní pivovar, pekárna, autoservis).

---

## 3. Administrace pro manažera (Jak se data upravují)

Klubový web nahrazuje původní stránku „Klub“. V menu hry vznikne přehledné centrum:
* **Sekce „Klubový web“ v herním menu:**
  * **Záložka 1: Živý náhled webu** – přesně tak, jak ho vidí veřejnost, s tlačítkem *„Kopírovat veřejný odkaz na web“*.
  * **Záložka 2: Šablony & Vylepšení** – nákup šablon a doplňkových modulů za herní měnu.
  * **Záložka 3: Úprava identity a obsahu** – přímé odkazy na konfiguraci:
    * *Dresy a znak* (`/muj-klub/dres`)
    * *Identita & Příběh* (`/muj-klub/identita`)
    * *Stadion & Tribuny* (`/muj-klub/stadion`)
    * *Hymna & Zvuk* (`/muj-klub/hymna`)
    * *Maskot* (`/muj-klub/maskot`)
    * *Ceník občerstvení* (odkaz do sekce Bufet / Finance)
    * *Ceník vstupného* (nastavení ceny lístků)

---

## 4. Systém šablon a customizace (Ekonomika odpovídající Pralesu)

Běžný sezónní přebytek klubu v Pralesu činí cca **30 000 až 90 000 Kč**. Ceny šablon a modulů představují zdravou výzvu:

| Úroveň | Název šablony | Cena | Popis & Vizuální styl |
| :--- | :--- | :--- | :--- |
| **Tier 0** | **Okresní přebor 2004** | **Zdarma** | Retro web z počátku století. Times New Roman / Arial, modré podtržené odkazy, jednoduchá tabulka, animovaný GIF rotujícího míče, počítadlo návštěv (*„Jste 1 248. návštěvník“*). |
| **Tier 1** | **Vesnický patriot** | **9 000 Kč** | Rustikální dřevěná nástěnka u hřiště, pivní tácek v rohu, fotka klobásy, přátelský venkovský styl. Dosažitelné po cca 3–4 týdnech dobrých tržeb z piva a vstupného. |
| **Tier 2** | **Krajský standard** | **36 000 Kč** | Čistý moderní responzivní web. Karty hráčů s avatary, klubové barvy v hlavičce, přehledné statistiky. Cca polovina sezónního přebytku. |
| **Tier 3** | **Profi Liga (Sparta/Slavia styl)** | **110 000 Kč** | Prémiový tmavý portál s klubovým podsvícením, velký zápasový odpočet, interaktivní 11 na trávníku, moderní fotogalerie stadionu a TV sekce. Prestižní cíl po úspěšném postupu. |
| **Tier 4** | **Champions Portál** | **280 000 Kč** | Supermoderní design prvoligových velkoklubů s animovanými kartami a luxusní sponzorskou zónou pro elitní a bohaté týmy. |

### Doplňkové moduly a nákupy za herní měnu:
* **Vlastní URL slug:** např. `prales.cz/klub/fk-kozlovice` místo ID – **10 000 Kč**.
* **Sponzorská reklamní lišta na webu:** Investice **16 000 Kč** do reklamní plochy, která přináší týdenní pasivní příjem z návštěvnosti.
* **Audio modul pro hymnu a chorály:** **6 000 Kč**.
* **Rozšířená fotogalerie stadionu:** **8 000 Kč**.
* **Tiskový mluvčí (vlastní články manažera):** **12 000 Kč**.

---

## 5. Virální růst (Growth Loop)
1. Manažer nasdílí odkaz na svůj klub kamarádům (WhatsApp, Discord, FB).
2. Náhled zobrazí kartu: logo, fotku stadionu, formu, výsledek a odpočet k zápasu.
3. Návštěvník si projde web: prohlédne soupisku, ceník piva a klobásy v bufetu, stadion a rozhovory trenéra.
4. Může si stáhnout **Zápasový bulletin** k utkání.
5. Přes fixní banner *„Založ si vlastní klub a vyzvi nás v lize!“* se zaregistruje s referral kódem daného manažera (odměna pro oba do hry).
