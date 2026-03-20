"""
FMK-26: Zpracování příjmení dle regionu.

Generuje vážené sady příjmení pro každý kraj ČR.
Data vychází z veřejných statistik ČSÚ o četnosti příjmení.

Výstup: data/seed/surnames_by_region.json
"""

import json
from pathlib import Path

OUTPUT_DIR = Path(__file__).parent.parent.parent / "data" / "seed"

# Celorepublikově nejčastější příjmení (mužský tvar + ženský tvar)
# Váhy odpovídají přibližné relativní četnosti v populaci
COMMON_SURNAMES = {
    "Novák": 0.045, "Svoboda": 0.038, "Novotný": 0.036,
    "Dvořák": 0.035, "Černý": 0.032, "Procházka": 0.030,
    "Kučera": 0.028, "Veselý": 0.026, "Horák": 0.024,
    "Němec": 0.023, "Pokorný": 0.022, "Marek": 0.021,
    "Pospíšil": 0.020, "Hájek": 0.019, "Jelínek": 0.018,
    "Král": 0.017, "Růžička": 0.016, "Beneš": 0.016,
    "Fiala": 0.015, "Sedláček": 0.015, "Doležal": 0.014,
    "Zeman": 0.014, "Kolář": 0.013, "Navrátil": 0.013,
    "Čermák": 0.012, "Vaněk": 0.012, "Urban": 0.011,
    "Blažek": 0.011, "Kříž": 0.011, "Kopecký": 0.010,
    "Konečný": 0.010, "Malý": 0.010, "Holub": 0.009,
    "Čech": 0.009, "Štěpánek": 0.009, "Staněk": 0.009,
    "Kadlec": 0.008, "Vlček": 0.008, "Polák": 0.008,
    "Šimek": 0.008, "Kratochvíl": 0.007, "Bartoš": 0.007,
    "Kovář": 0.007, "Musil": 0.007, "Říha": 0.007,
    "Tomášek": 0.006, "Mareš": 0.006, "Moravec": 0.006,
    "Pavlík": 0.006, "Janda": 0.006, "Šťastný": 0.006,
}

# Regionální specifika — příjmení typičtější pro daný region
REGIONAL_SPECIFICS: dict[str, dict[str, float]] = {
    "CZ010": {  # Praha — kosmopolitní, mix
        "Novák": 0.050, "Svoboda": 0.040, "Dvořák": 0.038,
        "Černý": 0.035, "Procházka": 0.033, "Novotný": 0.030,
        "Kučera": 0.028, "Veselý": 0.026, "Horák": 0.024,
        "Němec": 0.023, "Pokorný": 0.022, "Marek": 0.020,
        "Hájek": 0.020, "Král": 0.019, "Fiala": 0.018,
        "Beneš": 0.017, "Jelínek": 0.016, "Pospíšil": 0.015,
        "Růžička": 0.014, "Sedláček": 0.014, "Zeman": 0.013,
        "Kolář": 0.013, "Čermák": 0.012, "Urban": 0.012,
        "Blažek": 0.011, "Kopecký": 0.011, "Kříž": 0.010,
    },
    "CZ020": {  # Středočeský
        "Novák": 0.048, "Dvořák": 0.040, "Procházka": 0.035,
        "Černý": 0.033, "Novotný": 0.032, "Svoboda": 0.030,
        "Veselý": 0.028, "Kučera": 0.026, "Horák": 0.024,
        "Sedláček": 0.022, "Pokorný": 0.020, "Hájek": 0.020,
        "Kadlec": 0.018, "Kratochvíl": 0.016, "Jelínek": 0.015,
        "Marek": 0.015, "Pospíšil": 0.014, "Doležal": 0.014,
        "Fiala": 0.013, "Šimek": 0.013, "Mareš": 0.012,
        "Kolář": 0.012, "Beneš": 0.011, "Holub": 0.011,
        "Tomášek": 0.010, "Kopecký": 0.010, "Vlček": 0.010,
    },
    "CZ031": {  # Jihočeský
        "Novák": 0.045, "Dvořák": 0.042, "Procházka": 0.035,
        "Novotný": 0.033, "Svoboda": 0.030, "Černý": 0.028,
        "Veselý": 0.026, "Kučera": 0.024, "Sedláček": 0.022,
        "Hájek": 0.020, "Jelínek": 0.018, "Kratochvíl": 0.017,
        "Kadlec": 0.016, "Mareš": 0.015, "Holub": 0.015,
        "Šimek": 0.014, "Fiala": 0.013, "Pokorný": 0.013,
        "Horák": 0.012, "Malý": 0.012, "Čech": 0.011,
        "Janda": 0.011, "Beneš": 0.010, "Vlček": 0.010,
        "Kopecký": 0.009, "Musil": 0.009, "Tomášek": 0.009,
    },
    "CZ032": {  # Plzeňský
        "Novák": 0.044, "Dvořák": 0.038, "Černý": 0.035,
        "Novotný": 0.032, "Procházka": 0.030, "Svoboda": 0.028,
        "Kučera": 0.026, "Veselý": 0.024, "Horák": 0.022,
        "Hájek": 0.020, "Fiala": 0.018, "Marek": 0.016,
        "Sedláček": 0.016, "Jelínek": 0.015, "Kovář": 0.014,
        "Kadlec": 0.014, "Kratochvíl": 0.013, "Šimek": 0.013,
        "Beneš": 0.012, "Malý": 0.012, "Blažek": 0.011,
        "Janda": 0.011, "Kolář": 0.010, "Holub": 0.010,
        "Vlček": 0.009, "Čech": 0.009, "Polák": 0.009,
    },
    "CZ041": {  # Karlovarský
        "Novák": 0.042, "Svoboda": 0.038, "Černý": 0.035,
        "Novotný": 0.032, "Dvořák": 0.030, "Procházka": 0.028,
        "Kučera": 0.026, "Horák": 0.024, "Veselý": 0.022,
        "Němec": 0.020, "Pokorný": 0.018, "Fiala": 0.017,
        "Kovář": 0.016, "Marek": 0.015, "Hájek": 0.014,
        "Kolář": 0.014, "Jelínek": 0.013, "Polák": 0.013,
        "Beneš": 0.012, "Šimek": 0.012, "Blažek": 0.011,
        "Vaněk": 0.011, "Čermák": 0.010, "Urban": 0.010,
        "Zeman": 0.009, "Kopecký": 0.009, "Malý": 0.009,
    },
    "CZ042": {  # Ústecký
        "Novák": 0.043, "Svoboda": 0.037, "Černý": 0.034,
        "Novotný": 0.032, "Dvořák": 0.030, "Procházka": 0.028,
        "Kučera": 0.025, "Horák": 0.023, "Veselý": 0.022,
        "Němec": 0.020, "Pokorný": 0.018, "Kovář": 0.017,
        "Marek": 0.016, "Fiala": 0.015, "Kolář": 0.015,
        "Hájek": 0.014, "Polák": 0.013, "Šimek": 0.013,
        "Jelínek": 0.012, "Beneš": 0.012, "Blažek": 0.011,
        "Vaněk": 0.011, "Čermák": 0.010, "Bartoš": 0.010,
        "Urban": 0.009, "Kopecký": 0.009, "Zeman": 0.009,
    },
    "CZ051": {  # Liberecký
        "Novák": 0.044, "Dvořák": 0.036, "Novotný": 0.034,
        "Svoboda": 0.032, "Černý": 0.030, "Procházka": 0.028,
        "Kučera": 0.026, "Veselý": 0.024, "Horák": 0.022,
        "Němec": 0.020, "Hájek": 0.018, "Marek": 0.016,
        "Pokorný": 0.016, "Fiala": 0.015, "Jelínek": 0.014,
        "Šimek": 0.014, "Kolář": 0.013, "Kovář": 0.013,
        "Beneš": 0.012, "Malý": 0.011, "Sedláček": 0.011,
        "Blažek": 0.010, "Čermák": 0.010, "Vaněk": 0.010,
        "Kopecký": 0.009, "Urban": 0.009, "Holub": 0.009,
    },
    "CZ052": {  # Královéhradecký
        "Novák": 0.046, "Dvořák": 0.038, "Novotný": 0.035,
        "Procházka": 0.032, "Černý": 0.030, "Svoboda": 0.028,
        "Kučera": 0.026, "Veselý": 0.024, "Horák": 0.022,
        "Sedláček": 0.020, "Hájek": 0.019, "Pokorný": 0.018,
        "Jelínek": 0.016, "Pospíšil": 0.015, "Marek": 0.015,
        "Doležal": 0.014, "Kadlec": 0.013, "Kratochvíl": 0.013,
        "Fiala": 0.012, "Šimek": 0.012, "Beneš": 0.011,
        "Kopecký": 0.011, "Holub": 0.010, "Malý": 0.010,
        "Kolář": 0.009, "Vlček": 0.009, "Tomášek": 0.009,
    },
    "CZ053": {  # Pardubický
        "Novák": 0.045, "Dvořák": 0.037, "Novotný": 0.034,
        "Procházka": 0.032, "Svoboda": 0.030, "Černý": 0.028,
        "Kučera": 0.025, "Veselý": 0.023, "Horák": 0.022,
        "Sedláček": 0.020, "Pospíšil": 0.018, "Pokorný": 0.017,
        "Hájek": 0.016, "Doležal": 0.015, "Jelínek": 0.014,
        "Marek": 0.014, "Kadlec": 0.013, "Fiala": 0.013,
        "Šimek": 0.012, "Kopecký": 0.011, "Malý": 0.011,
        "Kratochvíl": 0.010, "Beneš": 0.010, "Holub": 0.010,
        "Říha": 0.009, "Musil": 0.009, "Pavlík": 0.009,
    },
    "CZ063": {  # Vysočina
        "Novák": 0.044, "Dvořák": 0.040, "Novotný": 0.036,
        "Procházka": 0.033, "Svoboda": 0.030, "Černý": 0.028,
        "Veselý": 0.026, "Kučera": 0.024, "Sedláček": 0.022,
        "Horák": 0.020, "Doležal": 0.018, "Pospíšil": 0.017,
        "Kadlec": 0.016, "Hájek": 0.015, "Jelínek": 0.014,
        "Kratochvíl": 0.014, "Pokorný": 0.013, "Marek": 0.013,
        "Holub": 0.012, "Musil": 0.011, "Fiala": 0.011,
        "Šimek": 0.010, "Malý": 0.010, "Říha": 0.010,
        "Kopecký": 0.009, "Beneš": 0.009, "Kolář": 0.009,
    },
    "CZ064": {  # Jihomoravský
        "Novák": 0.042, "Svoboda": 0.036, "Novotný": 0.034,
        "Dvořák": 0.032, "Černý": 0.030, "Procházka": 0.028,
        "Kučera": 0.024, "Veselý": 0.022, "Navrátil": 0.020,
        "Konečný": 0.019, "Horák": 0.018, "Pokorný": 0.017,
        "Marek": 0.016, "Doležal": 0.016, "Pospíšil": 0.015,
        "Hájek": 0.014, "Fiala": 0.014, "Sedláček": 0.013,
        "Musil": 0.013, "Bartoš": 0.012, "Jelínek": 0.011,
        "Říha": 0.011, "Pavlík": 0.010, "Kovář": 0.010,
        "Šimek": 0.009, "Moravec": 0.009, "Staněk": 0.009,
    },
    "CZ071": {  # Olomoucký
        "Novák": 0.040, "Svoboda": 0.034, "Novotný": 0.032,
        "Dvořák": 0.030, "Černý": 0.028, "Procházka": 0.026,
        "Navrátil": 0.024, "Konečný": 0.022, "Kučera": 0.020,
        "Veselý": 0.018, "Horák": 0.017, "Pokorný": 0.016,
        "Pospíšil": 0.015, "Marek": 0.015, "Doležal": 0.014,
        "Hájek": 0.013, "Bartoš": 0.013, "Fiala": 0.012,
        "Říha": 0.012, "Sedláček": 0.011, "Pavlík": 0.011,
        "Moravec": 0.010, "Staněk": 0.010, "Musil": 0.010,
        "Kovář": 0.009, "Jelínek": 0.009, "Šimek": 0.009,
    },
    "CZ072": {  # Zlínský
        "Novák": 0.038, "Svoboda": 0.032, "Novotný": 0.030,
        "Dvořák": 0.028, "Černý": 0.026, "Procházka": 0.024,
        "Navrátil": 0.024, "Konečný": 0.022, "Bartoš": 0.020,
        "Kučera": 0.018, "Veselý": 0.017, "Horák": 0.016,
        "Pavlík": 0.015, "Pospíšil": 0.015, "Marek": 0.014,
        "Říha": 0.014, "Doležal": 0.013, "Fiala": 0.012,
        "Pokorný": 0.012, "Hájek": 0.011, "Staněk": 0.011,
        "Moravec": 0.010, "Kovář": 0.010, "Sedláček": 0.010,
        "Musil": 0.009, "Polák": 0.009, "Blažek": 0.009,
    },
    "CZ080": {  # Moravskoslezský
        "Novák": 0.036, "Svoboda": 0.030, "Novotný": 0.028,
        "Dvořák": 0.026, "Černý": 0.025, "Procházka": 0.023,
        "Navrátil": 0.022, "Konečný": 0.022, "Bartoš": 0.020,
        "Kučera": 0.018, "Polák": 0.017, "Kovář": 0.016,
        "Horák": 0.015, "Veselý": 0.015, "Marek": 0.014,
        "Pavlík": 0.014, "Staněk": 0.013, "Říha": 0.013,
        "Pospíšil": 0.012, "Doležal": 0.012, "Fiala": 0.011,
        "Pokorný": 0.011, "Moravec": 0.010, "Hájek": 0.010,
        "Šimek": 0.009, "Blažek": 0.009, "Musil": 0.009,
    },
}

# Mapování příjmení na ženské tvary
FEMALE_FORMS = {
    "Novák": "Nováková", "Svoboda": "Svobodová", "Novotný": "Novotná",
    "Dvořák": "Dvořáková", "Černý": "Černá", "Procházka": "Procházková",
    "Kučera": "Kučerová", "Veselý": "Veselá", "Horák": "Horáková",
    "Němec": "Němcová", "Pokorný": "Pokorná", "Marek": "Marková",
    "Pospíšil": "Pospíšilová", "Hájek": "Hájková", "Jelínek": "Jelínková",
    "Král": "Králová", "Růžička": "Růžičková", "Beneš": "Benešová",
    "Fiala": "Fialová", "Sedláček": "Sedláčková", "Doležal": "Doležalová",
    "Zeman": "Zemanová", "Kolář": "Kolářová", "Navrátil": "Navrátilová",
    "Čermák": "Čermáková", "Vaněk": "Vaňková", "Urban": "Urbanová",
    "Blažek": "Blažková", "Kříž": "Křížová", "Kopecký": "Kopecká",
    "Konečný": "Konečná", "Malý": "Malá", "Holub": "Holubová",
    "Čech": "Čechová", "Štěpánek": "Štěpánková", "Staněk": "Staňková",
    "Kadlec": "Kadlecová", "Vlček": "Vlčková", "Polák": "Poláková",
    "Šimek": "Šimková", "Kratochvíl": "Kratochvílová", "Bartoš": "Bartošová",
    "Kovář": "Kovářová", "Musil": "Musilová", "Říha": "Říhová",
    "Tomášek": "Tomášková", "Mareš": "Marešová", "Moravec": "Moravcová",
    "Pavlík": "Pavlíková", "Janda": "Jandová", "Šťastný": "Šťastná",
}


def main():
    print("Generuji příjmení dle regionu...")

    output = {}
    for region_code, surnames in REGIONAL_SPECIFICS.items():
        output[region_code] = {
            "surnames": surnames,
            "female_forms": {
                k: FEMALE_FORMS.get(k, k + "ová")
                for k in surnames
            },
        }

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    output_path = OUTPUT_DIR / "surnames_by_region.json"

    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(output, f, ensure_ascii=False, indent=2)

    print(f"Hotovo! Uloženo {len(output)} regionů do {output_path}")
    for code, data in output.items():
        print(f"  {code}: {len(data['surnames'])} příjmení")


if __name__ == "__main__":
    main()