# Hlídání provozu a AI Gateway

**Zavedeno:** 2026-08-17

## Proč dvě vrstvy hlídání

Cloudflare umí poslat upozornění, když Worker **vyhodí chybu**. Neumí ale
upozornit na **ticho** — a „zápasový tick vůbec neproběhl" nebo „nedohraná kola
se hromadí" žádnou výjimku nevyhodí. Právě tenhle stav je nejzákeřnější: hra se
tváří, že běží, jen se v ní nic neděje.

| Vrstva | Chytá | Kdo to dělá |
|---|---|---|
| Cloudflare Notifications | pád Workeru, výjimky | Cloudflare (nastavit v dashboardu) |
| Hlídač v aplikaci | ticho, hromadění, DLQ | `lib/watchdog.ts`, cron `0 6 UTC` |

### Co hlídač kontroluje

| Kód | Kdy se ozve |
|---|---|
| `zadne_kolo` | poslední odsimulované kolo je starší než 26 h |
| `zaseklá_kola` | kola uvízlá v `lineup_locked` |
| `dlq` | zprávy, které selhaly i po opakování |
| `backlog` | nedohraných splatných kol je víc než 15 |
| `retry` | zprávy se musely doručovat opakovaně |

Při nálezu udělá dvě věci:
1. zaloguje `console.error` s prefixem **`PRALES_WATCHDOG_ALERT`** — na ten se dá
   navěsit upozornění v Cloudflare
2. pošle notifikaci **všem adminům** včetně push (mají tým jako každý manažer)

```bash
GET  /api/admin/watchdog        # jen kontrola, bez notifikací
POST /api/admin/watchdog/test   # včetně rozeslání — ověření, že alerting funguje
```

Ověřeno 2026-08-17: umělý záznam v DLQ hlídač zachytil a rozeslal notifikace
11 adminům; po úklidu se vrátil do zdravého stavu.

---

## ⚠️ Dva kroky, které jdou udělat jen v dashboardu

API token wrangleru na ně nemá práva.

### 1. Upozornění na chyby Workeru

**Dashboard → Notifications → Add → Workers → Script errors**

- Worker: `prales-api` (a případně `prales-api-test`)
- Doručení: e-mail

Tím se pokryje pád Workeru. Hlídač pokrývá ticho — dohromady je to celé.

### 2. AI Gateway pro Gemini

**Dashboard → AI → AI Gateway → Create Gateway**, název např. `prales`.

Pak nastavit secret (základ URL, **bez** koncového lomítka a bez cesty k modelu):

```bash
cd apps/api
npx wrangler secret put AI_GATEWAY_URL --env testing
# hodnota:
# https://gateway.ai.cloudflare.com/v1/53c9c9b55cf11e04f82d8ad81c854596/prales/google-ai-studio
```

Pro produkci totéž bez `--env testing`.

**Bez té proměnné se volá Google přímo, tedy přesně jako dosud.** Produkce se
nezmění, dokud se secret výslovně nenastaví.

Co to přinese: kolik requestů a tokenů jde z kterého prostředí, cachování
opakovaných dotazů, rate limiting a logy jednotlivých volání. Dosud o Gemini
nebylo vidět vůbec nic — ani to, jestli test a produkce sdílejí klíč.

---

## Pokrytí AI Gateway — zatím částečné

Základ se nastavuje jednou na vstupu workeru (fetch / scheduled / queue), takže
přes gateway jde všechno, co používá **sdílený helper** `news/gemini-helper.ts`:

- `ai-reporter`, `ultras-report`, `matchday-preview` (přepojené na `generateText`)
- `season-wrap`, `season-interview`, `season-awards`, `post-match-interview`

**Mimo gateway zatím zůstávají** generátory s vlastním `fetch`:
`round-summary`, `player-interview`, `interview-generator`, `ai-player-chat`,
`promo-generator` a tři volání v `routes/teams.ts` (hymna, maskot).

Do gateway se dostanou, až se přepojí na sdílený helper. Je to mechanická práce,
ale sahá do generátorů, které na produkci fungují — proto se odkládá za sledování
front. Do té doby jsou čísla v gateway **neúplná**, což je potřeba mít na paměti
při čtení analytiky.
