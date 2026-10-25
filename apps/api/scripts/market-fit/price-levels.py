"""Kolik lidé platí proti dnešní tržní hodnotě: medián poměru ceny k vzorci podle oken a věku, s intervaly.

Vstup: sales.json z rating-at-sale.ts (pole marketValue = dnešní vzorec). Postup viz collect-sales.py.
Symbolické ceny (pod 10 % tržní hodnoty) nejsou obchod, ale dar: vynechají se.
"""
import json
import random
import statistics
import sys
from datetime import datetime, timezone

rows = [r for r in json.load(open(sys.argv[1])) if r["ratingAtSale"] is not None and r["marketValue"]]
now = datetime.now(timezone.utc)


def days_ago(s: str) -> float:
    return (now - datetime.fromisoformat(s.replace("Z", "+00:00"))).total_seconds() / 86400


def summary(label: str, ratios: list[float]) -> None:
    if len(ratios) < 3:
        print(f"  {label}: {len(ratios)} prodejů")
        return
    random.seed(7)
    boots = sorted(statistics.median(random.choices(ratios, k=len(ratios))) for _ in range(4000))
    print(f"  {label}: {len(ratios):>3} prodejů, medián ×{statistics.median(ratios):.2f} (90 % ×{boots[200]:.2f}–×{boots[3800]:.2f})")


for window in (30, 45, 60, 120):
    sel = [r for r in rows if days_ago(r["saleAt"]) <= window]
    ratios = [(r, r["price"] / r["marketValue"]) for r in sel]
    kept = [(r, x) for r, x in ratios if x >= 0.1]
    print(f"posledních {window} dní (symbolických cen vynecháno: {len(ratios) - len(kept)}):")
    summary("vše", [x for _, x in kept])
    summary("do 21 let", [x for r, x in kept if r["age"] <= 21])
    summary("22 a víc", [x for r, x in kept if r["age"] > 21])
