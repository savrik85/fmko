# Souhrn měření modelů AI trenéra do markdown tabulek (zápas, simulace, týdenní správa).
import json
import statistics as st
import sys

def pct(a, b):
    return f"{100 * a / b:.0f} %" if b else "-"

def match_table(path, sim_path=None):
    d = json.load(open(path))
    sim = json.load(open(sim_path))["summary"] if sim_path else {}
    rows = []
    for m, rs in d["results"].items():
        rs = [r for r in rs if r]
        n = len(rs)
        valid = rs if m == "fallback" else [r for r in rs if r.get("used") == "model"]
        lat = [r["latencyMs"] for r in valid if r.get("latencyMs")]
        tout = [r["tokensOut"] for r in valid if r.get("tokensOut")]
        errs = {}
        for r in rs:
            if m != "fallback" and r.get("used") != "model":
                e = (r.get("error") or "?")
                key = "timeout" if "timeout" in e else e[:40]
                errs[key] = errs.get(key, 0) + 1
        poor = sum(1 for r in valid if r["score"]["tacticEff"] < 0.9)
        hard_bad = sum(1 for r in valid if r["score"]["hardBad"])
        tired = sum(r["score"]["tiredStarters"] for r in valid)
        plan = sum(r["score"]["planRules"] for r in valid)
        kept = sum(r["score"]["planKept"] for r in valid)
        youth = [r["score"]["youthStarts"] for r in valid]
        s = sim.get(m, {})
        rows.append({
            "model": m, "n": n, "valid": len(valid),
            "lat_med": st.median(lat) / 1000 if lat else 0, "lat_p90": sorted(lat)[int(0.9 * (len(lat) - 1))] / 1000 if lat else 0,
            "tok_med": st.median(tout) if tout else 0, "poor": poor, "hard_bad": hard_bad, "tired": tired,
            "plan": plan, "kept": kept, "youth": st.mean(youth) if youth else 0,
            "pts": s.get("pointsPerMatch"), "delta": s.get("deltaVsFallback"), "better": s.get("betterThanFallback"), "worse": s.get("worseThanFallback"),
            "errs": errs,
        })
    print("| model | rozhodnutí | platných | medián doby | 90. percentil | výstupních tokenů | slabá taktika | tvrdost proti sudímu | unavení v základu | pokyny (prošlo) | body/zápas v simulaci | rozdíl proti pravidlu | lepší / horší než pravidlo | selhání |")
    print("|---|---|---|---|---|---|---|---|---|---|---|---|---|---|")
    for r in rows:
        print(f"| {r['model']} | {r['n']} | {r['valid']} ({pct(r['valid'], r['n'])}) | {r['lat_med']:.1f} s | {r['lat_p90']:.1f} s | {r['tok_med']:.0f} | {r['poor']} | {r['hard_bad']} | {r['tired']} | {r['plan']} ({r['kept']}) | {r['pts'] if r['pts'] is not None else '-'} | {r['delta'] if r['delta'] is not None else '-'} | {r['better']} / {r['worse']} | {', '.join(f'{k}: {v}' for k, v in r['errs'].items()) or '-'} |")

def weekly_table(path):
    d = json.load(open(path))
    print("| model | rozhodnutí | platných | medián doby | bannery (podepsáno / volných) | trávník pod 45 opraven | podíl utracených peněz nad rezervou | přeskočeno pro rezervu | nábor | stavby | vybavení |")
    print("|---|---|---|---|---|---|---|---|---|---|---|")
    for m, rs in d["results"].items():
        rs = [r for r in rs if r]
        n = len(rs)
        valid = rs if m == "fallback" else [r for r in rs if r.get("used") == "model"]
        lat = [r["latencyMs"] for r in valid if r.get("latencyMs")]
        signed = sum(r["score"]["bannersSigned"] for r in valid)
        wanted = sum(r["score"]["bannersWanted"] for r in valid)
        need = [r for r in valid if r["score"]["pitchNeeded"]]
        fixed = sum(1 for r in need if r["score"]["pitchFixed"])
        share = [r["score"]["spendShare"] for r in valid if r["score"]["spendable"] > 0]
        skipped = sum(r["score"]["skippedForMoney"] for r in valid)
        hires = sum(r["score"]["actions"].count("hire") for r in valid)
        stad = sum(r["score"]["actions"].count("stadium_upgrade") for r in valid)
        equip = sum(r["score"]["actions"].count("equipment_upgrade") for r in valid)
        print(f"| {m} | {n} | {len(valid)} ({pct(len(valid), n)}) | {st.median(lat) / 1000 if lat else 0:.1f} s | {signed} / {wanted} | {fixed} / {len(need)} | {st.mean(share) if share else 0:.2f} | {skipped} | {hires} | {stad} | {equip} |")

def corr(xs, ys):
    n = len(xs)
    if n < 3:
        return float("nan")
    mx, my = sum(xs) / n, sum(ys) / n
    sx = sum((x - mx) ** 2 for x in xs) ** 0.5
    sy = sum((y - my) ** 2 for y in ys) ** 0.5
    if sx == 0 or sy == 0:
        return float("nan")
    return sum((x - mx) * (y - my) for x, y in zip(xs, ys)) / (sx * sy)

def personality(path, contexts_path=None):
    """Drží se model povahy? Korelace vlastností trenéra s rozhodnutím (Pearson)."""
    d = json.load(open(path))
    ctx = json.load(open(contexts_path)) if contexts_path else None
    print("| model | riziko × útočnost (taktika, tvrdost, pokyny) | mládež × mladí v základu | oblíbená formace použita |")
    print("|---|---|---|---|")
    for m, rs in d["results"].items():
        risk, attack, youth, young = [], [], [], []
        fav = 0
        valid = 0
        for i, r in enumerate(rs):
            if not r or (m != "fallback" and r.get("used") != "model"):
                continue
            p = r.get("profile") or (ctx[i]["profile"] if ctx else None)
            if not p:
                continue
            valid += 1
            dec = r["decision"]
            a = {"offensive": 2, "pressing": 1, "possession": 1, "long_ball": 0.5, "balanced": 0, "defensive": -2}.get(dec["tactic"], 0)
            a += {"hard": 1, "normal": 0, "fair": -1}.get(dec["hardness"], 0)
            a += sum(1 for pl in dec["plan"] if pl.get("action") == "tactic" and pl.get("tactic") in ("offensive", "pressing"))
            a -= sum(1 for pl in dec["plan"] if pl.get("action") == "tactic" and pl.get("tactic") == "defensive")
            risk.append(p["risk"]); attack.append(a)
            youth.append(p["youthFocus"]); young.append(r["score"]["youthStarts"])
            fav += 1 if r["score"]["favouriteFormation"] else 0
        print(f"| {m} | {corr(risk, attack):.2f} | {corr(youth, young):.2f} | {fav} / {valid} |")

def weekly_personality(path):
    d = json.load(open(path))
    print("| model | šetrnost × utraceno nad rezervou | chuť stavět × počet staveb a vybavení | mládež × akademie |")
    print("|---|---|---|---|")
    level = {"keep": None, "none": 0, "minimal": 1, "medium": 2, "high": 3}
    for m, rs in d["results"].items():
        thrift, share, build, builds, youth, acad = [], [], [], [], [], []
        for r in rs:
            if not r or (m != "fallback" and r.get("used") != "model"):
                continue
            p = r["profile"]
            thrift.append(p["thrift"]); share.append(r["score"]["spendShare"])
            build.append(p["building"]); builds.append(r["score"]["actions"].count("stadium_upgrade") + r["score"]["actions"].count("equipment_upgrade"))
            a = level.get(r["decision"]["academy"])
            if a is not None:
                youth.append(p["youthFocus"]); acad.append(a)
        print(f"| {m} | {corr(thrift, share):.2f} | {corr(build, builds):.2f} | {corr(youth, acad):.2f} |")

if __name__ == "__main__":
    kind = sys.argv[1]
    if kind == "match":
        match_table(sys.argv[2], sys.argv[3] if len(sys.argv) > 3 else None)
    elif kind == "weekly":
        weekly_table(sys.argv[2])
    elif kind == "personality":
        personality(sys.argv[2], sys.argv[3] if len(sys.argv) > 3 else None)
    elif kind == "weekly-personality":
        weekly_personality(sys.argv[2])
