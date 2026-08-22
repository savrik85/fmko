"""
Jednorázový přepočet overall_rating (+ mzdy) po opravě daily-tick driftu.

Beze změny dat: spočítá dopad a vygeneruje SQL. Nic neaplikuje.
  python3 prepocet.py            -> souhrn dopadu
  python3 prepocet.py --sql out.sql -> navíc zapíše UPDATE příkazy
"""
import json, re, sys, statistics
from collections import defaultdict

SRC = "/private/tmp/claude-501/-Users-savrik-Projects-fmko/9dc0d63a-9e55-4f8a-ba2f-56e13278f303/scratchpad/all.json"

# Shodné s RATING_WEIGHTS v apps/api/src/skills/generator.ts
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

# Drift, který bug přidal za jeden trénink. Zkalibrováno na 784 trénovaných hráčích v poli,
# kde je známé i správné hodnocení ze vzorce (průměrná chyba 2,4 bodu).
# Používá se jen tam, kde atributy pro vzorec chybí.
DRIFT_PER_TRAINING = 0.86


def load():
    raw = open(SRC, encoding="utf-8").read()
    m = re.search(r"\[\s*\{", raw)
    return json.loads(raw[m.start():])[0]["results"]


def jload(s):
    try:
        return json.loads(s) if s else {}
    except (json.JSONDecodeError, TypeError):
        return {}


def rating_from_flat(pos, skills, physical, ht, fallback, expcol=None):
    """Zrcadlí overallRatingFromFlat() z generator.ts — včetně prahu poloviční váhy."""
    w = W.get(pos)
    if not w:
        return None
    full = sum(w.values())
    ws = tw = 0.0
    for k, weight in w.items():
        v = skills.get(k)
        if not isinstance(v, (int, float)):
            v = physical.get(k)
        if not isinstance(v, (int, float)):
            e = fallback.get(k)
            if isinstance(e, (int, float)):
                v = e
            elif isinstance(e, dict) and isinstance(e.get("current"), (int, float)):
                v = e["current"]
        if not isinstance(v, (int, float)) and k == "experience" and expcol is not None:
            v = expcol
        if not isinstance(v, (int, float)):
            continue
        ws += v * weight
        tw += weight
    if tw < full / 2:
        return None
    return round(ws / tw + ht * 0.15)


def base_wage(r):
    return round(10 + (r / 100) * 400)


def main():
    rows = load()
    updates, skipped_gk, changes = [], [], []

    by_method = defaultdict(int)

    for r in rows:
        pos, ovr, tr = r["pos"], r["ovr"], r["tr"]

        # 1) Vzorec z atributů — přesné. U brankářů sedí brankářské dovednosti ve skills_max
        #    (gk_skills je prázdné u všech), proto se doplňují odtud.
        new_ovr = rating_from_flat(pos, jload(r["skills"]), jload(r["physical"]),
                                   r["ht"] or 0, jload(r["sm"]), r["expcol"])
        method = "vzorec"

        # 2) Bez atributů zbývá odečíst drift, který bug přidal za odtrénované body.
        #    Ověřeno proti vzorci tam, kde jde spočítat obojí: shoda na 96 % do ±4 bodů.
        if new_ovr is None:
            if not tr:
                skipped_gk.append(r)   # netrénoval → drift nemá odkud vzniknout, nesahat
                continue
            new_ovr = round(ovr - DRIFT_PER_TRAINING * tr)
            method = "odhad z tréninků"

        new_ovr = max(1, new_ovr)
        by_method[method] += 1

        # Mzda se posune jen v poměru změny hodnocení — zachová vyjednané navýšení
        # a hráčům pod vzorcem samo nepřidá. Beze změny ratingu = beze změny mzdy.
        old_base = base_wage(ovr)
        new_wage = (round(r["mzda"] * (base_wage(new_ovr) / old_base))
                    if r["mzda"] and old_base else base_wage(new_ovr))

        if new_ovr != ovr or new_wage != r["mzda"]:
            updates.append((r["id"], new_ovr, new_wage))
        changes.append((ovr - new_ovr, r["mzda"] - new_wage, r, new_ovr, new_wage))

    diffs = [c[0] for c in changes]
    print(f"Hráčů zpracováno        : {len(changes)}  z toho "
          + ", ".join(f"{v}× {k}" for k, v in by_method.items()))
    print(f"Nedotčeno               : {len(skipped_gk)}  (chybí atributy a zároveň netrénovali)")
    print(f"Skutečných UPDATE       : {len(updates)}")
    print()
    print(f"Průměrný pokles ratingu : {statistics.mean(diffs):+.1f}")
    print(f"Medián                  : {statistics.median(diffs):+.0f}")
    print(f"Největší pokles         : {max(diffs):+}")
    print(f"Beze změny / růst       : {sum(1 for d in diffs if d <= 0)} hráčů")
    print()

    wage_delta = sum(c[1] for c in changes)
    print(f"Celková týdenní úspora na mzdách: {wage_delta:,} Kč".replace(",", " "))
    print()

    per_team = defaultdict(list)
    for d, _, r, _, _ in changes:
        if r["uid"] and r["uid"] != "ai":
            per_team[r["tym"]].append(d)
    print("DOPAD NA LIDSKÉ TÝMY (průměrný pokles hodnocení)")
    print(f"{'tým':32}{'hráčů':8}{'⌀ pokles':11}{'největší'}")
    for tym, ds in sorted(per_team.items(), key=lambda x: -statistics.mean(x[1])):
        print(f"{tym:32}{len(ds):<8}{statistics.mean(ds):<+11.1f}{max(ds):+}")

    if "--sql" in sys.argv:
        out = sys.argv[sys.argv.index("--sql") + 1]
        with open(out, "w", encoding="utf-8") as f:
            for pid, o, w in updates:
                f.write(f"UPDATE players SET overall_rating = {o}, weekly_wage = {w} WHERE id = '{pid}';\n")
        print(f"\nSQL zapsáno: {out} ({len(updates)} příkazů)")


main()
