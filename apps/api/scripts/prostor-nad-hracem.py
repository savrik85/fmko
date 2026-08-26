"""
Rozšíření stropů tak, aby měl každý hráč nad sebou prostor odpovídající věku.

Mění VÝHRADNĚ `skills_max.maxPotential`. Nesahá na dovednosti, hodnocení ani mzdy —
rating se počítá z plochých hodnot, takže se nemůže hnout. Strop se navíc zvedá jen
tam, kde plochá dovednost existuje: kde chybí, slouží strop jako záloha do výpočtu
hodnocení a jeho změna by ratingem pohnula.
"""
import json
import io

SCR = "/private/tmp/claude-501/-Users-savrik-Projects-fmko/16b68775-2459-4de9-ae1b-2b7e396e425e/scratchpad"
FYZICKE = {"stamina", "strength"}


def minimalni_prostor(vek: int) -> int:
    """Kolik bodů musí hráči nad dnešní hodnotou zůstat. Mladý má kam růst, veterán ne."""
    if vek <= 19:
        return 18
    if vek <= 23:
        return 12
    if vek <= 27:
        return 8
    if vek <= 31:
        return 4
    return 2


def main() -> None:
    surovy = io.open(f"{SCR}/stropy.json", encoding="utf-8").read()
    zacatek = surovy.find("[")
    hraci = json.JSONDecoder().raw_decode(surovy[zacatek:])[0][0]["results"]

    prikazy = []
    pod_minimem = 0
    for h in hraci:
        try:
            sk = json.loads(h["skills"] or "{}")
            fz = json.loads(h["physical"] or "{}")
            sm = json.loads(h["skills_max"] or "{}")
        except Exception:
            continue

        p = minimalni_prostor(h["age"])
        zmena = False
        nejmensi = None
        for k, v in list(sm.items()):
            if not isinstance(v, dict) or k == "experience":
                continue
            dnes = (fz if k in FYZICKE else sk).get(k)
            stary = v.get("maxPotential")
            if not isinstance(dnes, (int, float)) or not isinstance(stary, (int, float)):
                continue
            nejmensi = stary - dnes if nejmensi is None else min(nejmensi, stary - dnes)
            novy = min(100, max(stary, dnes + p))
            if novy != stary:
                sm[k] = {**v, "maxPotential": novy}
                zmena = True

        if nejmensi is not None and nejmensi < p:
            pod_minimem += 1
        if zmena:
            json_sm = json.dumps(sm, ensure_ascii=False).replace("'", "''")
            prikazy.append(
                f"UPDATE players SET skills_max=json('{json_sm}') WHERE id='{h['id']}';"
            )

    hlavicka = (
        "-- Minimalni prostor nad hracem podle veku: do 19 let 18 bodu, 20-23 dvanact,\n"
        "-- 24-27 osm, 28-31 ctyri, 32+ dva.\n"
        "--\n"
        "-- Meni se VYHRADNE stropy. Zadna soucasna hodnota, hodnoceni ani mzda — rating se\n"
        "-- pocita z plochych dovednosti, takze se nemuze hnout. Strop se zvedá jen tam, kde\n"
        "-- plocha dovednost existuje: kde chybi, slouzi strop jako zaloha do vypoctu ratingu\n"
        "-- a jeho zmena by hodnocenim pohnula.\n"
        "--\n"
        "-- Duvod: sedmnactilety utocnik mel po predchozich zasazich prostor jediny bod\n"
        "-- u kazde dovednosti. Trenink ho nemel kam posunout a v UI svitilo 'rozviji se pomalu'.\n"
    )
    io.open(f"{SCR}/prostor.sql", "w", encoding="utf-8").write(hlavicka + "\n".join(prikazy) + "\n")
    print(f"hráčů: {len(hraci)} | s prostorem pod minimem: {pod_minimem} | k úpravě: {len(prikazy)}")


main()
