"""
Doplnit chybějící / nulové atributy ve `skills` a přepočítat hodnocení.

Nic neaplikuje — spočítá dopad a vygeneruje SQL.
  python3 doplnit.py --sql out.sql
"""
import json, re, sys, statistics
from collections import Counter

SRC = "/private/tmp/claude-501/-Users-savrik-Projects-fmko/9dc0d63a-9e55-4f8a-ba2f-56e13278f303/scratchpad/fix_all.json"

W = {
    "DEF": {"speed": 1, "stamina": 2, "strength": 3, "technique": 1, "shooting": 0.5,
            "passing": 2, "heading": 3, "defense": 3, "vision": 2, "experience": 2},
    "MID": {"speed": 2, "stamina": 3, "strength": 1, "technique": 2, "shooting": 1.5,
            "passing": 3, "heading": 1, "defense": 1.5, "vision": 3, "experience": 2},
    "FWD": {"speed": 3, "stamina": 1.5, "strength": 1.5, "technique": 3, "shooting": 3,
            "passing": 2, "heading": 2, "defense": 0.5, "vision": 2, "experience": 1.5},
    "GK": {"reflexes": 3, "positioning": 3, "rushing": 2, "catching": 3, "kicking": 1,
           "distribution": 1, "strength": 1, "reach": 2, "communication": 2, "experience": 2},
}

# Atributy, které profil zobrazuje a musí mít každý hráč.
SHOWN = ["speed", "technique", "shooting", "passing", "heading", "defense",
         "vision", "experience", "creativity", "setPieces"]


def jl(s):
    try:
        return json.loads(s) if s else {}
    except (json.JSONDecodeError, TypeError):
        return {}


def from_max(sm, key):
    e = sm.get(key)
    if isinstance(e, (int, float)):
        return e
    if isinstance(e, dict) and isinstance(e.get("current"), (int, float)):
        return e["current"]
    return None


def fill(r):
    """Vrátí doplněné skills + seznam co se doplnilo."""
    sk = dict(jl(r["skills"]))
    sm = jl(r["sm"])
    ph = jl(r["physical"])
    filled = []

    def known(k):
        v = sk.get(k)
        return v if isinstance(v, (int, float)) and v > 0 else None

    # základ pro odhad — z toho, co hráč reálně má
    base_pool = [v for k, v in sk.items() if isinstance(v, (int, float)) and v > 0 and k != "goalkeeping"]
    base = round(statistics.mean(base_pool)) if base_pool else 20

    for key in SHOWN + ["stamina", "strength"]:
        cur = sk.get(key)
        if isinstance(cur, (int, float)) and cur > 0:
            continue

        # Zkušenost se odvíjí od věku — stejně jako v generátoru: (věk − 16) × ~4,5.
        if key == "experience":
            sk[key] = min(100, max(1, round((r["age"] - 16) * 4.5)))
            filled.append(key)
            continue

        # 1) skills_max, 2) physical (stamina/strength),
        # 3) odvození z příbuzných atributů, 4) hráčův průměr
        v = from_max(sm, key)
        if v is None and key in ("stamina", "strength") and isinstance(ph.get(key), (int, float)):
            v = ph[key]
        if v is None and key == "vision":
            rel = [x for x in (known("technique"), known("passing")) if x is not None]
            v = round(statistics.mean(rel)) if rel else base
        if v is None:
            v = base

        v = max(1, min(100, round(v)))
        sk[key] = v
        filled.append(key)

    return sk, filled


def rating(pos, sk, ph, ht):
    w = W.get(pos)
    if not w:
        return None
    full = sum(w.values())
    ws = tw = 0.0
    for k, weight in w.items():
        v = sk.get(k)
        if not isinstance(v, (int, float)):
            v = ph.get(k)
        if not isinstance(v, (int, float)):
            continue
        ws += v * weight
        tw += weight
    if tw < full / 2:
        return None
    return round(ws / tw + (ht or 0) * 0.15)


def main():
    raw = open(SRC, encoding="utf-8").read()
    m = re.search(r"\[\s*\{", raw)
    rows = json.loads(raw[m.start():])[0]["results"]

    updates, stats, rating_shift = [], Counter(), []
    for r in rows:
        sk, filled = fill(r)
        if not filled:
            continue
        for k in filled:
            stats[k] += 1

        new_ovr = rating(r["pos"], sk, jl(r["physical"]), r["ht"])
        old_ovr = r["ovr"]
        if new_ovr is None:
            new_ovr = old_ovr
        new_ovr = max(1, new_ovr)
        rating_shift.append(new_ovr - old_ovr)

        # mzda se posune v poměru změny hodnocení (zachová vyjednané navýšení)
        bw = lambda x: round(10 + (x / 100) * 400)
        new_wage = round(r["mzda"] * (bw(new_ovr) / bw(old_ovr))) if r["mzda"] and bw(old_ovr) else r["mzda"]

        updates.append((r["id"], json.dumps(sk, ensure_ascii=False), new_ovr, new_wage))

    print(f"Hráčů s chybějícím nebo nulovým atributem: {len(updates)} z {len(rows)}")
    print()
    print("Doplněno podle atributu:")
    for k, v in stats.most_common():
        print(f"  {k:12} {v}")
    print()
    if rating_shift:
        print(f"Dopad na hodnocení: průměr {statistics.mean(rating_shift):+.2f}, "
              f"medián {statistics.median(rating_shift):+.0f}, "
              f"rozsah {min(rating_shift):+} až {max(rating_shift):+}")
        print(f"  beze změny: {sum(1 for x in rating_shift if x == 0)} hráčů")

    if "--sql" in sys.argv:
        out = sys.argv[sys.argv.index("--sql") + 1]
        with open(out, "w", encoding="utf-8") as f:
            for pid, skills, ovr, wage in updates:
                esc = skills.replace("'", "''")
                f.write(f"UPDATE players SET skills = '{esc}', overall_rating = {ovr}, weekly_wage = {wage} WHERE id = '{pid}';\n")
        print(f"\nSQL zapsáno: {out} ({len(updates)} příkazů)")


main()
