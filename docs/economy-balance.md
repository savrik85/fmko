# Ekonomická analýza fmko — po balance úpravách

> Stav: 2026-04-11, po sadě úprav (ticket prices, attendance, refreshments rename, concession rebalance, fans history)

## Shrnutí změn v této iteraci

1. **Vstupné**: vesnice 10→20, obec 20→30, mestys 30→40, město 50 (strop)
2. **Attendance**: 0.5–1.5 % populace → **2.0–4.5 %**, min 8 → 15
3. **Refreshments L1 cena**: 10 000 → **5 000 Kč**, rename (Pivní stan z bazaru / Karavan / Hospůdka)
4. **External concession**: baseLease 200→50, levelBonus 400→250 (L0=50, L1=300, L2=550, L3=800 Kč/týden)
5. **Self demand rates**: sausage 0.35→0.40, beer 0.55→0.65, lemonade 0.25→0.30

---

## Self vs External — konkrétní čísla

### Modelová obec (5000 obyvatel, reputace 50, satisfaction 50)

**Attendance**: `pop × (0.02 + rand × 0.025)` = 100–225 diváků/zápas, typicky ~150

**Self mode** (L1 quality, default sell prices):

| Produkt | Wholesale | Sell | Margin | Demand (150 div.) | Profit |
|---------|-----------|------|--------|-------------------|--------|
| Pivo (Měšťan 10°) | 14 Kč | 25 Kč | 11 Kč | 150×0.65 = 98 ks | 1 078 Kč |
| Klobása (Kostelecké) | 15 Kč | 30 Kč | 15 Kč | 150×0.40 = 60 ks | 900 Kč |
| Limonáda (Sirup) | 8 Kč | 15 Kč | 7 Kč | 150×0.30 = 45 ks | 315 Kč |
| **Celkem** | | | | | **~2 293 Kč/zápas** |

**External mode** (L1): `(50 + 1×250) × (50/50) = 300 Kč/týden`

**Poměr**: self **7.6×** výhodnější pro střední klub. Rozdíl ~2 000 Kč/zápas je odměna za aktivní správu skladu a cen.

### Vesnice (400 obyvatel, rep 50)

**Attendance**: 8–18 → min 15 diváků

**Self**: Pivo 15×0.65 = 10 ks × 11 = 110, Klobása 15×0.40 = 6 × 15 = 90, Limo 15×0.30 = 5 × 7 = 35 → **~235 Kč/zápas**

**External L1**: 300 Kč/týden

**Vesnice**: external lehce lepší (300 vs 235) — *záměrně*, protože vesnice má málo diváků a self se nevyplatí bez upgrade týmu. Pokud vesnice má satisfaction 75+ (satMul 1.15), self ~270 Kč — srovnatelné.

### Město (14 500 obyvatel, rep 70)

**Attendance**: 290–652 → typicky ~420, často limitováno kapacitou stadionu (obvykle 600–1200)

**Self**: Pivo 420×0.65×1.0 = 273 × 11 = 3 003, Klobása 420×0.40 = 168 × 15 = 2 520, Limo 420×0.30 = 126 × 7 = 882 → **~6 405 Kč/zápas**

**External L1**: (50+250) × (70/50) = **420 Kč/týden**

**Poměr**: self **15×** výhodnější pro velký klub.

---

## Typický týdenní budget (obec, L1, rep 50, 1 domácí/týden)

| Položka | Týdně | Sezónně (30 týdnů) |
|---------|-------|---------------------|
| **Příjmy** | | |
| Vstupné (~150 × 30 Kč × 0.65 fence) | +2 925 | +87 750 |
| Concession self | +2 293 | +68 790 (15 domácích) |
| Sponzoři | +2 000 | +60 000 |
| Dotace obce | +2 326 | +69 780 |
| Členské příspěvky | +465 | +13 950 |
| Bonusy výsledky (~50% win) | +800 | +24 000 |
| **Celkem příjem** | **~10 809** | **~324 270** |
| **Výdaje** | | |
| Platy hráčů (20 × ~150) | -3 000 | -90 000 |
| Údržba stadionu | -233 | -6 990 |
| Vybavení | -116 | -3 480 |
| Tréninky (6/týden × 400) | -2 400 | -72 000 |
| Zápasy (rozhodčí, cestovné, catering) | -1 125 | -33 750 |
| Concession wholesale (self mode) | -988 | -29 640 |
| **Celkem výdaje** | **~7 862** | **~235 860** |
| **Čistý zisk** | **+2 947** | **+88 410** |

**Verdikt**: Ekonomika je zdravá. Přebytek ~88k Kč/sezónu stačí na 1–2 facility upgrades ročně. Není tam riziko bankrotu pro týmy co hrají aktivně (self concession + tréninky).

### Srovnání s external mode

Pokud tým použije external místo self:
- -2 293 Kč/zápas self + 300 Kč/týden external = -1 993 Kč/týden (30 týdnů = -59 790 Kč)
- Ušetří ~988 Kč/týden na wholesale nákupu (30 týdnů = 29 640 Kč)
- **Netto ztráta z external**: -30 150 Kč/sezónu

Takže aktivní hráč, který spravuje self concession, vydělá o ~30k Kč více za sezónu — přesně ta „odměna za práci" kterou jsme chtěli.

---

## Diagnóza a závěr

✅ **Ekonomika je vyvážená** — střední klub má přebytek ~88k/sezónu, žádné týmy nekrachují
✅ **Self concession je odměněn za práci** — +30k/sezónu oproti externímu
✅ **External je "safe fallback"** — pro casual hráče nebo malé vesnice
✅ **Vstupné přijatelné** — maximum 50 Kč u města, minimum 20 Kč u vesnice

⚠️ **Výjimka** — pro nejmenší vesnice (< 300 obyvatel) je self mode ztratový. Řešení není potřeba, je to realistické.

⚠️ **Risk** — velké týmy (město) mohou mít nadprůměrný příjem. Stadium capacity cap + attendance ×(1+ficility bonus) může dát 500+ diváků × 2 500 Kč/zápas = 1.25M Kč/sezóna jen z concession. Pokud je to problém, snížit demand rates nebo zavést concession operating cost.
