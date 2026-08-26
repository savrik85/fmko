"""
Kontrola, ze rozsireni stropu nehne hodnocenim ani jednoho hrace.

Obe strany se ctou z JEDNOHO stazeni produkce, aby se neporovnavaly dva ruzne snapshoty.
Prepocet je doslovny prepis `overallRatingFromFlat` vcetne zalohy na `.current`.

Pri behu zaroven vypise hrace, kterym uz dnes chybi plocha dovednost, kterou jejich pozice
potrebuje — takovym se ze zalohy nacte `current: 0` a hodnoceni jim to sraz.
"""
import json
import io
import re

SCR = "/private/tmp/claude-501/-Users-savrik-Projects-fmko/16b68775-2459-4de9-ae1b-2b7e396e425e/scratchpad"
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


def hodnoceni(pozice, skills, physical, talent, zaloha):
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
    surovy = io.open(f"{SCR}/stropy.json", encoding="utf-8").read()
    hraci = {h["id"]: h for h in json.JSONDecoder().raw_decode(surovy[surovy.find("["):])[0][0]["results"]}
    sql = io.open(f"{SCR}/prostor.sql", encoding="utf-8").read()
    zmeny = re.findall(r"UPDATE players SET skills_max=json\('(.*)'\) WHERE id='([^']+)';", sql)

    rozdily = []
    for sm_novy, pid in zmeny:
        h = hraci[pid]
        skills = json.loads(h["skills"] or "{}")
        physical = json.loads(h["physical"] or "{}")
        talent = h["hidden_talent"] or 0
        a = hodnoceni(h["position"], skills, physical, talent, json.loads(h["skills_max"] or "{}"))
        b = hodnoceni(h["position"], skills, physical, talent, json.loads(sm_novy.replace("''", "'")))
        if a != b:
            rozdily.append((pid, a, b))

    # Kolik hracu ma dnes nulu ze zalohy u dovednosti, kterou jejich pozice pocita
    nulovi = []
    for h in hraci.values():
        skills = json.loads(h["skills"] or "{}")
        physical = json.loads(h["physical"] or "{}")
        sm = json.loads(h["skills_max"] or "{}")
        chybne = []
        for klic in VAHY.get(h["position"], VAHY["FWD"]):
            if klic == "experience":
                continue
            if isinstance(skills.get(klic), (int, float)) or isinstance(physical.get(klic), (int, float)):
                continue
            z = sm.get(klic)
            hodnota = z if isinstance(z, (int, float)) else (z or {}).get("current") if isinstance(z, dict) else None
            if hodnota == 0:
                chybne.append(klic)
        if chybne:
            nulovi.append((h["id"], h["position"], chybne))

    print(f"příkazů v prostor.sql: {len(zmeny)}")
    print(f"změn hodnocení kvůli stropům: {len(rozdily)}")
    for r in rozdily[:10]:
        print("   ", r)
    print(f"\nhráčů, kterým se do hodnocení počítá nula za chybějící dovednost: {len(nulovi)} z {len(hraci)}")
    from collections import Counter
    c = Counter(k for _, _, ks in nulovi for k in ks)
    for k, n in c.most_common():
        print(f"   {k}: {n}")


main()
