"""
Co udela s hodnocenim srovnani `skills` a `physical` u vydrze a sily.

Vydrz a sila ziji ve dvou kopiich. Profil hrace, zapasovy engine i trenink ctou `physical`;
`overallRatingFromFlat` cte naopak `skills`, a ten ma prednost. Kopie se rozesly, takze
hrac vidi na obrazovce silu, kterou mu rating nezapocital.

Skript nic nemeni — jen spocita, jak by hodnoceni dopadlo pri dvou zpusobech srovnani:
  A) pravdu ma `physical`  — zdroj, ze ktereho cte zbytek hry
  B) vetsi z obou cisel    — nikomu se nic nesebere
"""
import json
import io
import sys

VAHY = {
    "GK": {"goalkeeping": 6, "defense": 3, "speed": 2, "technique": 1, "passing": 1,
           "strength": 1, "stamina": 1, "heading": 2, "creativity": 2, "experience": 2},
    "DEF": {"speed": 1, "stamina": 2, "strength": 3, "technique": 1, "shooting": 0.5,
            "passing": 2, "heading": 3, "defense": 3, "vision": 2, "creativity": 1,
            "setPieces": 0.5, "experience": 2},
    "MID": {"speed": 2, "stamina": 3, "strength": 1, "technique": 2, "shooting": 1.5,
            "passing": 3, "heading": 1, "defense": 1.5, "vision": 3, "creativity": 2,
            "setPieces": 1, "experience": 2},
    "FWD": {"speed": 3, "stamina": 1.5, "strength": 1.5, "technique": 3, "shooting": 3,
            "passing": 2, "heading": 2, "defense": 0.5, "vision": 2, "creativity": 2,
            "setPieces": 1, "experience": 1.5},
}
POZICE_CZ = {"GK": "BRA", "DEF": "OBR", "MID": "ZÁL", "FWD": "ÚTO"}


def hodnoceni(pozice, skills, physical, talent, zaloha):
    """Doslovny prepis `overallRatingFromFlat` vcetne zalohy na `.current`."""
    vahy = VAHY.get(pozice, VAHY["FWD"])
    plna = sum(vahy.values())
    soucet = vaha_celkem = 0.0
    for klic, vaha in vahy.items():
        h = None
        if isinstance(skills.get(klic), (int, float)):
            h = skills[klic]
        if h is None and isinstance(physical.get(klic), (int, float)):
            h = physical[klic]
        if h is None and zaloha:
            z = zaloha.get(klic)
            if isinstance(z, (int, float)):
                h = z
            elif isinstance(z, dict) and isinstance(z.get("current"), (int, float)):
                h = z["current"]
        if h is None:
            continue
        soucet += h * vaha
        vaha_celkem += vaha
    if vaha_celkem < plna / 2:
        return None
    return round(soucet / vaha_celkem + talent * 0.15)


def main():
    surovy = io.open(sys.argv[1], encoding="utf-8").read()
    hraci = json.JSONDecoder().raw_decode(surovy[surovy.find("["):])[0][0]["results"]

    radky = []
    for h in hraci:
        skills = json.loads(h["skills"] or "{}")
        physical = json.loads(h["physical"] or "{}")
        zaloha = json.loads(h["skills_max"] or "{}")
        talent = h["hidden_talent"] or 0
        poz = h["position"]

        ted = hodnoceni(poz, skills, physical, talent, zaloha)
        varianty = {}
        for nazev, vyber in (("A", lambda s, p: p), ("B", lambda s, p: max(s, p))):
            upravene = dict(skills)
            for attr in ("stamina", "strength"):
                s, p = skills.get(attr), physical.get(attr)
                if isinstance(s, (int, float)) and isinstance(p, (int, float)):
                    upravene[attr] = vyber(s, p)
                elif isinstance(p, (int, float)):
                    upravene[attr] = p
            varianty[nazev] = hodnoceni(poz, upravene, physical, talent, zaloha)

        radky.append({
            "jmeno": f"{h['first_name']} {h['last_name']}",
            "vek": h["age"], "poz": POZICE_CZ.get(poz, poz), "tym": h["tym"],
            "ulozene": h["overall_rating"], "ted": ted,
            "a": varianty["A"], "b": varianty["B"],
            "vydrz": (skills.get("stamina"), physical.get("stamina")),
            "sila": (skills.get("strength"), physical.get("strength")),
            "mzda": h["weekly_wage"] or 0,
        })

    for tym in sorted({r["tym"] for r in radky}):
        skupina = sorted([r for r in radky if r["tym"] == tym], key=lambda r: -(r["ted"] or 0))
        print(f"\n=== {tym} ===")
        print(f"{'hráč':<20}{'věk':>4}{'poz':>5}{'dnes':>6}{'A':>4}{'B':>4}{'rozdíl A':>10}"
              f"{'výdrž s/p':>12}{'síla s/p':>11}")
        for r in skupina:
            rozdil = (r["a"] or 0) - (r["ted"] or 0)
            znak = f"{rozdil:+d}" if rozdil else "—"
            print(f"{r['jmeno']:<20}{r['vek']:>4}{r['poz']:>5}{r['ted']:>6}{r['a']:>4}{r['b']:>4}{znak:>10}"
                  f"{f'{r[chr(118)+chr(121)+chr(100)+chr(114)+chr(122)][0]}/{r[chr(118)+chr(121)+chr(100)+chr(114)+chr(122)][1]}':>12}"
                  f"{f'{r[chr(115)+chr(105)+chr(108)+chr(97)][0]}/{r[chr(115)+chr(105)+chr(108)+chr(97)][1]}':>11}")
        zmeneni = [r for r in skupina if (r["a"] or 0) != (r["ted"] or 0)]
        prum_a = sum((r["a"] or 0) - (r["ted"] or 0) for r in skupina) / len(skupina)
        prum_b = sum((r["b"] or 0) - (r["ted"] or 0) for r in skupina) / len(skupina)
        print(f"  změní se {len(zmeneni)} z {len(skupina)} | průměr A {prum_a:+.2f} | průměr B {prum_b:+.2f}"
              f" | nejvíc {max(((r['a'] or 0) - (r['ted'] or 0)) for r in skupina):+d}"
              f" | nejmíň {min(((r['a'] or 0) - (r['ted'] or 0)) for r in skupina):+d}")


main()
