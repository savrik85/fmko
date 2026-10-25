"""Přeměření tržní hodnoty (packages/shared/src/types/market-value.ts) na přestupech mezi lidmi.

Postup (z kořene repa, Python 3, CLOUDFLARE_API_TOKEN v prostředí, wrangler přihlášený):
  1. Noční zálohy produ jako kotvy (ne export přes den, ten zamkne DB):
       npx wrangler r2 object get prales-backups/denni/prod-YYYY-MM-DD.sql.gz --remote --file <dir>/prod-YYYY-MM-DD.sql.gz
     Kotva musí být v každém období mezi přechody sezóny (při přechodu se mění dovednosti bez training_log).
  2. python3 apps/api/scripts/market-fit/extract-players.py <dir>/prod-YYYY-MM-DD.sql.gz <dir>/players-YYYY-MM-DD.sqlite
  3. python3 apps/api/scripts/market-fit/collect-sales.py <dir> <od ISO> <kotva1> [<kotva2> …]
       kotvy: YYYY-MM-DD (seřazené); přestup se počítá od nejbližší kotvy ve stejné sezóně
  4. node_modules/.bin/esbuild apps/api/scripts/market-fit/rating-at-sale.ts --bundle --platform=node --format=esm --outfile=<dir>/rating-at-sale.mjs
     node <dir>/rating-at-sale.mjs <dir>/transfers.json > <dir>/sales.json
  5. python3 apps/api/scripts/market-fit/price-levels.py <dir>/sales.json

Z produ se jen čte (SELECT). Výstup: <dir>/transfers.json.
"""
import json
import os
import sqlite3
import subprocess
import sys
import urllib.request
from datetime import datetime

API_DIR = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".."))
ACCOUNT_ID = "53c9c9b55cf11e04f82d8ad81c854596"

work_dir, since, anchor_days = sys.argv[1], sys.argv[2], sorted(sys.argv[3:])


def prod(sql: str) -> list[dict]:
    if not sql.lstrip().upper().startswith("SELECT"):
        raise SystemExit("z produkce jen SELECT")
    out = subprocess.run(
        ["npx", "wrangler", "d1", "execute", "prales-db-prod", "--remote", "--json", "--command", sql],
        cwd=API_DIR, capture_output=True, text=True, check=False,
    )
    try:
        return json.loads(out.stdout)[0]["results"]
    except (json.JSONDecodeError, KeyError, IndexError, TypeError):
        raise SystemExit(f"dotaz selhal: {sql[:100]}\n{out.stdout[-600:]}\n{out.stderr[-600:]}")


def iso(s: str) -> str:
    s = s.strip().replace(" ", "T")
    return s if s.endswith("Z") or "+" in s[10:] else s + "Z"


def parse_time(s: str) -> datetime:
    return datetime.fromisoformat(s.replace("Z", "+00:00"))


req = urllib.request.Request(
    f"https://api.cloudflare.com/client/v4/accounts/{ACCOUNT_ID}/r2/buckets/prales-backups/objects?prefix=denni/&per_page=1000",
    headers={"Authorization": "Bearer " + os.environ["CLOUDFLARE_API_TOKEN"]},
)
made_at = {o["key"]: o["last_modified"] for o in json.load(urllib.request.urlopen(req))["result"]}
anchors = [(day, made_at[f"denni/prod-{day}.sql.gz"]) for day in anchor_days]
season_starts = [iso(r["created_at"]) for r in prod("SELECT created_at FROM seasons ORDER BY number")]


def season_of(t: str) -> int:
    return sum(1 for s in season_starts if s <= t)


rows = prod(
    "SELECT o.id, o.player_id, o.resolved_at, o.upfront_pct, o.installments, o.sell_on_pct, "
    "(SELECT e.amount FROM transfer_offer_events e WHERE e.offer_id = o.id AND e.event_type = 'accept' ORDER BY e.created_at DESC LIMIT 1) AS accept_amount, "
    "COALESCE(o.counter_amount, o.offer_amount) AS amount, l.name AS league "
    "FROM transfer_offers o JOIN teams s ON s.id = o.to_team_id JOIN teams b ON b.id = o.from_team_id "
    "LEFT JOIN leagues l ON l.id = s.league_id "
    "WHERE o.status = 'accepted' AND COALESCE(o.offer_type, 'transfer') = 'transfer' "
    "AND s.user_id IS NOT NULL AND s.user_id != 'ai' AND b.user_id IS NOT NULL AND b.user_id != 'ai' "
    "AND o.from_team_id != 'virtual_ai' "
    "AND NOT EXISTS (SELECT 1 FROM transfer_offer_swap_players sp WHERE sp.offer_id = o.id) "
    f"AND julianday(o.resolved_at) >= julianday('{since}') ORDER BY o.resolved_at"
)
players = sorted({r["player_id"] for r in rows})
changes: list[dict] = []
for i in range(0, len(players), 40):
    chunk = ",".join(f"'{p}'" for p in players[i:i + 40])
    changes += prod(
        f"SELECT player_id, attribute, old_value, new_value, created_at FROM training_log WHERE player_id IN ({chunk}) "
        f"AND attribute != 'dospivani' AND julianday(created_at) >= julianday('{since}') ORDER BY created_at, id"
    )

dbs = {day: sqlite3.connect(os.path.join(work_dir, f"players-{day}.sqlite")) for day, _ in anchors}
out, skipped = [], {"no_price": 0, "no_anchor": 0, "no_player": 0}
for r in rows:
    sale = iso(r["resolved_at"])
    price = r["accept_amount"] if r["accept_amount"] is not None else r["amount"]
    if not price or price <= 0:
        skipped["no_price"] += 1
        continue
    # Nejbližší kotva ve stejné sezóně (přechod sezóny mění dovednosti mimo training_log).
    same_season = [(d, t) for d, t in anchors if season_of(t) == season_of(sale)]
    if not same_season:
        skipped["no_anchor"] += 1
        continue
    day, anchor_at = min(same_season, key=lambda a: abs((parse_time(a[1]) - parse_time(sale)).total_seconds()))
    p = dbs[day].execute(
        "SELECT position, age, overall_rating, skills, physical, skills_max, hidden_talent FROM players WHERE id = ?",
        (r["player_id"],),
    ).fetchone()
    if not p:
        skipped["no_player"] += 1
        continue
    lo, hi = sorted([sale, anchor_at])
    between = [c for c in changes if c["player_id"] == r["player_id"] and lo < iso(c["created_at"]) <= hi]
    out.append({
        "offerId": r["id"], "playerId": r["player_id"], "saleAt": sale, "price": price,
        "upfrontPct": r["upfront_pct"], "installments": r["installments"], "sellOnPct": r["sell_on_pct"],
        "league": r["league"], "anchorDay": day, "anchorAt": anchor_at, "direction": "back" if sale < anchor_at else "forward",
        "position": p[0], "age": p[1], "anchorRating": p[2], "skills": p[3], "physical": p[4], "skillsMax": p[5],
        "hiddenTalent": p[6],
        "changes": [{"attribute": c["attribute"], "old": c["old_value"], "new": c["new_value"], "at": iso(c["created_at"])} for c in between],
    })
print(f"přestupů mezi lidmi od {since}: {len(rows)}, použito {len(out)}, vynecháno {skipped}")
with open(os.path.join(work_dir, "transfers.json"), "w", encoding="utf-8") as f:
    json.dump(out, f, ensure_ascii=False)
