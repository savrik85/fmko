# Vstupní stránka a registrace okresu

Samostatná adresa `/vitejte` zobrazí vstupní stránku i přihlášeným hráčům. Úvod `/` představuje Prales, příběhy hráčů, kluby, vedení ligy, partu kamarádů a meziligové poháry. `/registrace` sbírá jen jméno, e-mail a okres. Existující pozvánky předvyberou okres zvoucího týmu.

## Vyřízení žádosti

1. V administraci otevři **Nové okresy a registrace**. Žádosti starší než 24 hodin se zvýrazní.
2. Připrav a zkontroluj místní data pro uvedený okres: obce, příjmení, sponzory i další reálie. Tato změna data sama negeneruje a nespouští časované odemknutí.
3. Potvrď připravenost dat a vytvoř aktivační odkaz. API navíc ověří, že okres skutečně má obce, příjmení a sponzory.
4. Zkopíruj připravený text a odešli ho na e-mail uvedený v žádosti. Odesílání e-mailů zatím není napojené na poskytovatele; tlačítko žádný e-mail neposílá. Do 24 hodin je provozní závazek, který vyřizuje správce.
5. Příjemce si přes odkaz nastaví heslo, aktivuje účet a založí klub ve svém okrese. První zakladatel získá první předsednický mandát; poté se mohou připojit ostatní. Připravené okresy lze vybrat v běžné registraci. Pozvánky ze hry také vedou do registrace se správným okresem.

První žádost o nový okres rezervuje zakladatele. Další žádosti stejného okresu se připojují jako manažeři; existující ligy a jejich předsedové se nepřepisují. Zakladatelský mandát se neobnovuje po rezignaci ani automaticky v dalších sezónách.

Aktivační odkaz je jednorázový a platí 7 dní. V databázi je pouze SHA-256 otisk; nové vygenerování zneplatní předchozí odkaz. Token je v URL fragmentu a ověřuje se přes POST. Veřejné podání žádosti nevytváří účet ani session. Registrace přes původní `/auth/register` je uzavřená, aby neobcházela nový tok. Stávající přihlášení a změny hesla zůstávají.

## Nasazení

Před nasazením nového API je nutné aplikovat **0225_district_registration.sql** na cílovou databázi. Současný CI workflow migrace automaticky neaplikuje. Migrace zachová jako připravené Prahu, Prachatice a všechny okresy s již existujícími lidskými týmy. Ostatní okresy se odemykají ručně. Nové tabulky používají existující D1 a auth používá současné KV sessions; nejsou potřeba nové služby ani secrets.

Migraci aplikuj nejprve na příslušné prostředí, pak nasaď API a web podle projektových pravidel. Testovací web používá `https://test.prales.fun/vitejte`, API `https://api-test.prales.fun` a databázi `prales-db-test`. Produkce vyžaduje samostatný výslovný pokyn.

## Ověření

`npm test --workspace=apps/api -- src/registration/registration.test.ts` ověřuje tok na skutečné izolované D1 přes Miniflare: validaci, duplicity, oprávnění, kontrolu dat, expiraci/rotaci a souběh aktivací, serverové omezení okresu a jednorázový mandát zakladatele. Testy používají fiktivní kontakty a nic neodesílají.
