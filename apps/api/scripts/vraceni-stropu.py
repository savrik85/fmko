"""
Zpatecni listek k `prostor-nad-hracem.py`.

Vezme TENTYZ snapshot produkce, ze ktereho vznikl `prostor.sql`, a vyrobi prikazy, ktere
u dotcenych hracu vrati `skills_max` presne do puvodniho stavu. Zadny jiny sloupec.
"""
import json
import io
import re

SCR = "/private/tmp/claude-501/-Users-savrik-Projects-fmko/16b68775-2459-4de9-ae1b-2b7e396e425e/scratchpad"


def main():
    surovy = io.open(f"{SCR}/stropy.json", encoding="utf-8").read()
    hraci = {h["id"]: h for h in json.JSONDecoder().raw_decode(surovy[surovy.find("["):])[0][0]["results"]}
    dotceni = re.findall(r"WHERE id='([^']+)';", io.open(f"{SCR}/prostor.sql", encoding="utf-8").read())

    radky = []
    for pid in dotceni:
        puvodni = hraci[pid]["skills_max"] or "{}"
        radky.append(f"UPDATE players SET skills_max=json('{puvodni.replace(chr(39), chr(39) * 2)}') WHERE id='{pid}';")

    io.open(f"{SCR}/vraceni-stropu.sql", "w", encoding="utf-8").write(
        "-- Vraceni stropu do stavu pred `prostor.sql`.\n"
        "-- Data pochazeji ze stejneho stazeni produkce, ze ktereho vznikla oprava,\n"
        "-- takze se vraci presne to, co tam bylo — ne prepocet.\n"
        + "\n".join(radky) + "\n"
    )
    print(f"vracených hráčů: {len(radky)}")


main()
