"""
Generate SQL INSERT statements for Sprint 1 seed data (50 villages).
Output: apps/api/migrations/0002_seed_villages.sql
"""

import json
import uuid
from pathlib import Path

ROOT = Path(__file__).parent.parent.parent
VILLAGES_PATH = ROOT / "data" / "seed" / "villages.json"
OUTPUT_PATH = ROOT / "apps" / "api" / "migrations" / "0002_seed_villages.sql"

def population_to_size(pop: int) -> str:
    if pop < 500: return "hamlet"
    if pop < 2000: return "village"
    if pop < 5000: return "town"
    if pop < 20000: return "small_city"
    return "city"

def main():
    with open(VILLAGES_PATH, encoding="utf-8") as f:
        all_villages = json.load(f)

    # Select 50 villages: mix of sizes across regions
    selected = []
    by_region = {}
    for v in all_villages:
        r = v["region"]
        by_region.setdefault(r, []).append(v)

    # Pick 3-4 per region, mix of sizes
    for region, villages in sorted(by_region.items()):
        sizes = {"hamlet": [], "village": [], "town": [], "small_city": [], "city": []}
        for v in villages:
            s = population_to_size(v["population"])
            sizes[s].append(v)

        picked = []
        # Pick one of each available size, up to 4
        for size_name in ["hamlet", "village", "town", "small_city", "city"]:
            if sizes[size_name] and len(picked) < 4:
                picked.append(sizes[size_name][0])

        # Fill up to 3-4 if needed
        if len(picked) < 3:
            for v in villages:
                if v not in picked and len(picked) < 3:
                    picked.append(v)

        selected.extend(picked)

    # Trim to 50
    selected = selected[:50]

    lines = ["-- Sprint 1: Seed 50 villages\n"]
    for v in selected:
        vid = str(uuid.uuid5(uuid.NAMESPACE_DNS, f"village:{v['code']}:{v['name']}"))
        name = v["name"].replace("'", "''")
        district = v["district"].replace("'", "''")
        region = v["region"].replace("'", "''")
        size = population_to_size(v["population"])
        lat = v.get("latitude", 50.0)
        lng = v.get("longitude", 15.0)

        lines.append(
            f"INSERT INTO villages (id, name, district, region, population, size, lat, lng) "
            f"VALUES ('{vid}', '{name}', '{district}', '{region}', {v['population']}, '{size}', {lat}, {lng});"
        )

    sql = "\n".join(lines) + "\n"
    OUTPUT_PATH.write_text(sql, encoding="utf-8")
    print(f"Generated {len(selected)} village inserts -> {OUTPUT_PATH}")

if __name__ == "__main__":
    main()
