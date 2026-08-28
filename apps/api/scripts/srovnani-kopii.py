"""
Srovna `skills` s `physical` u vydrze a sily — varianta A: pravdu ma `physical`.

Vydrz a sila ziji ve dvou kopiich. Profil hrace, zapasovy engine i trenink ctou `physical`;
`overallRatingFromFlat` cte naopak `skills`, ktere ma prednost. Kopie se rozesly (trenink
zapisoval kazde zlepseni zvlast a starsi z nich premazal), takze hrac videl na obrazovce
silu, kterou mu rating nezapocital. Priciny jsou opravene v kodu; tohle srovnava data.

Samotne srovnani se dela PRIKAZEM V SQL nad zivymi hodnotami, ne zapisem celeho `skills`
ze snimku. Mezi stazenim a spustenim bezi na produkci crony a zapis ze snimku by jejich
praci premazal — presne ta chyba, kterou tenhle ukol opravuje. Overeno na kopii: zapis
ze snimku nechal 69 hracu nesrovnanych, protoze se mezitim zmenili.

Hodnoceni se prepocitava az druhym pruchodem z CERSTVE stazenych dat (`--rating`), a meni
JEN sloupec `overall_rating` — soubezna zmena dovednosti se tim nemuze ztratit.

Hodnoceni se posouva JEN o to, co udelalo srovnani: `ulozene + (po - pred)`. Prepocitat
ho cele nejde — ulozene hodnoceni u 771 hracu dnes nesedi s jejich atributy (prumerne
o 3,19 bodu), protoze vahy hodnoceni se zmenily a ratingy se pak vratily na puvodni.
Cely prepocet by tedy do teto opravy propasoval uplne jinou zmenu, az +17 bodu.

Mzda zustava: hybe se pomerne pri kazdem treninku, takze si novy zaklad vezme sama pri
prvnim dalsim zlepseni. Retroaktivni skok by smazal vyjednana navyseni.

    python3 srovnani-kopii.py            -> srovnani.sql + srovnani-vraceni.sql + odhad dopadu
    python3 srovnani-kopii.py --rating   -> srovnani-rating.sql z <SCR>/po-srovnani.json
"""
import json
import io
import os
import sys
from collections import Counter

# Slozka se snimky a vygenerovanym SQL. Prepinatelna, aby sla stejna priprava
# projet nejdriv nad testem a teprve pak nad produkci, aniz by si soubory lezly do cesty.
SCR = os.environ.get("SROVNANI_DIR") or (
    "/private/tmp/claude-501/-Users-savrik-Projects-fmko/16b68775-2459-4de9-ae1b-2b7e396e425e/scratchpad")
FYZICKE = ("stamina", "strength")
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


def nacti(soubor):
    surovy = io.open(f"{SCR}/{soubor}", encoding="utf-8").read()
    return json.JSONDecoder().raw_decode(surovy[surovy.find("["):])[0][0]["results"]


def rozparsuj(h):
    return (json.loads(h["skills"] or "{}"), json.loads(h["physical"] or "{}"),
            json.loads(h["skills_max"] or "{}"), h["hidden_talent"] or 0)


def priprav():
    hraci = nacti("vsichni-pred-narovnanim.json")

    prikazy = [
        "-- Srovnani vydrze a sily: pravdu ma `physical`, `skills` se k nemu dorovna.\n"
        "-- Pocita se z zivych hodnot v dobe spusteni, ne ze snimku — behem prodlevy mezi\n"
        "-- stazenim a spustenim bezi na produkci crony a zapis celeho `skills` ze snimku\n"
        "-- by jejich praci premazal.\n"
        "--\n"
        "-- Podminka `skills` IS NOT NULL je zamerna: kdyz atribut v `skills` vubec neni,\n"
        "-- `overallRatingFromFlat` uz dnes spadne na `physical` a hodnoceni je spravne.\n"
        "-- Takovych je 13 a nemaji co resit."
    ]
    for attr in FYZICKE:
        prikazy.append(
            f"UPDATE players SET skills = json_set(skills, '$.{attr}', json_extract(physical, '$.{attr}'))\n"
            f" WHERE (status IS NULL OR status = 'active')\n"
            f"   AND json_extract(physical, '$.{attr}') IS NOT NULL\n"
            f"   AND json_extract(skills, '$.{attr}') IS NOT NULL\n"
            f"   AND json_extract(skills, '$.{attr}') != json_extract(physical, '$.{attr}');")
    io.open(f"{SCR}/srovnani.sql", "w", encoding="utf-8").write("\n".join(prikazy) + "\n")

    vraceni = ["-- Zpatecni listek k `srovnani.sql`. Vraci `skills` i `overall_rating` do stavu\n"
               "-- ze snimku produkce, ze ktereho oprava vznikla. Pozor: prepise i to, co se\n"
               "-- s temi hraci stalo po snimku — je to nouzova brzda, ne bezny nastroj."]
    dopad = []
    for h in hraci:
        skills, physical, zaloha, talent = rozparsuj(h)
        nove = dict(skills)
        rozeslo = False
        for attr in FYZICKE:
            p, s = physical.get(attr), skills.get(attr)
            if isinstance(p, (int, float)) and isinstance(s, (int, float)) and s != p:
                nove[attr] = p
                rozeslo = True
        if not rozeslo:
            continue
        pred = hodnoceni(h["position"], skills, physical, talent, zaloha)
        po = hodnoceni(h["position"], nove, physical, talent, zaloha)
        dopad.append((h, h["overall_rating"], pred, po))
        json_skills = (h["skills"] or "{}").replace("'", "''")
        vraceni.append(f"UPDATE players SET skills=json('{json_skills}'), "
                       f"overall_rating={h['overall_rating']} WHERE id='{h['id']}';")
    io.open(f"{SCR}/srovnani-vraceni.sql", "w", encoding="utf-8").write("\n".join(vraceni) + "\n")

    print(f"hráčů v produkci: {len(hraci)} | s rozešlými kopiemi: {len(dopad)}")
    viditelne = [po - pred for _, _, pred, po in dopad if po is not None and pred is not None]
    print(f"\nzměna hodnocení, kterou udělá SAMO srovnání:")
    print(f"   průměr {sum(viditelne)/len(viditelne):+.2f} | nejvíc {max(viditelne):+d} | nejmíň {min(viditelne):+d}")
    for d, n in sorted(Counter(viditelne).items()):
        print(f"   {d:+d}: {n:>4} hráčů")
    klesnou = sorted([(h, u, u + po - pred) for h, u, pred, po in dopad
                      if po is not None and pred is not None and po < pred],
                     key=lambda x: x[2] - x[1])
    print(f"\nhráčů, kterým hodnocení klesne: {len(klesnou)}")
    for h, u, novy in klesnou[:12]:
        print(f"   {h['first_name']+' '+h['last_name']:<20}{h['age']:>3} let {h['position']:<4}"
              f"{h['tym'][:28]:<29}{u} → {novy}")
    # Cast rozdilu nedela srovnani, ale to, ze ulozene hodnoceni uz dnes nesedi s atributy.
    drift = [pred - ulozene for _, ulozene, pred, _ in dopad if pred is not None and pred != ulozene]
    print(f"\nz toho: hráčů, kterým uložené hodnocení nesedí s atributy už dnes: {len(drift)}"
          f" (průměr {sum(drift)/len(drift):+.2f})" if drift else "")


def rating():
    """Posun hodnoceni o efekt srovnani — ne cely prepocet.

    Rozdil se bere ze snimku PRED opravou (kolik srovnani pridalo) a pricte se k tomu,
    co ma hrac ulozene ted. Cely prepocet by s sebou pribral i drift ulozenych hodnoceni
    proti dnesnim vaham, coz je uplne jina zmena a patri do samostatneho rozhodnuti.
    """
    pred_snimek = {h["id"]: h for h in nacti("vsichni-pred-narovnanim.json")}
    hraci = nacti("po-srovnani.json")
    radky = ["-- Prepocet `overall_rating` po srovnani kopii. Meni JEN tenhle sloupec, takze\n"
             "-- soubezna zmena dovednosti se nemuze ztratit."]
    zmen = []
    for h in hraci:
        stary = pred_snimek.get(h["id"])
        if not stary:
            continue
        s_skills, s_physical, s_zaloha, s_talent = rozparsuj(stary)
        pred = hodnoceni(stary["position"], s_skills, s_physical, s_talent, s_zaloha)
        skills, physical, zaloha, talent = rozparsuj(h)
        po = hodnoceni(h["position"], skills, physical, talent, zaloha)
        if pred is None or po is None or po == pred:
            continue
        novy = max(1, h["overall_rating"] + po - pred)
        if novy != h["overall_rating"]:
            zmen.append(novy - h["overall_rating"])
            radky.append(f"UPDATE players SET overall_rating={novy} WHERE id='{h['id']}';")
    io.open(f"{SCR}/srovnani-rating.sql", "w", encoding="utf-8").write("\n".join(radky) + "\n")
    print(f"hráčů k přepočtu hodnocení: {len(zmen)}")
    if zmen:
        print(f"   průměr {sum(zmen)/len(zmen):+.2f} | nejvíc {max(zmen):+d} | nejmíň {min(zmen):+d}")
        for d, n in sorted(Counter(zmen).items()):
            print(f"   {d:+d}: {n:>4} hráčů")


rating() if "--rating" in sys.argv else priprav()
