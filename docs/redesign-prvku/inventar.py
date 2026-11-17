"""Inventář ručně stavěných ovládacích prvků. Spuštění z kořene repa:
    python3 -I docs/redesign-prvku/inventar.py > /tmp/inventar-body.md
Výstup je tělo souboru inventar.md (bez úvodu)."""
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2] / "apps" / "web" / "src"
EXCLUDE = re.compile(
    r"app/\(hra\)/admin/|app/klub/|zapasovy-den|/zaznam/|components/stadium/|MatchReplayViewer"
    r"|components/ui/|app/\(hra\)/telefon/|app/\(hra\)/zpravodaj/|app/\(hra\)/redakce/|components/landing/"
)

files = sorted(
    p for p in ROOT.rglob("*.tsx")
    if not EXCLUDE.search(str(p.relative_to(ROOT))) and "node_modules" not in str(p)
)
tracked = set(subprocess.run(["git", "ls-files"], cwd=ROOT, capture_output=True, text=True).stdout.split())
files = [p for p in files if str(p.relative_to(ROOT)) in tracked]


def clip(s: str, n: int = 110) -> str:
    s = re.sub(r"\s+", " ", s.strip())
    s = s.replace("|", "\\|")
    return s if len(s) <= n else s[: n - 1] + "…"


AREAS = []


def area(key, title, matcher):
    AREAS.append((key, title, matcher))


SMALL_TEXT = r"text-(micro|xs|\[1[01]px\]|\[9px\])"
area("loading", "Načítání (obal kolem `<Spinner>`)",
     lambda l, prev: "<Spinner" in l)
area("errors", "Chybové hlášky a červené rámečky",
     lambda l, prev: re.search(r"bg-red-50|border-red-200|border-red-300", l) and "ErrorBox" not in l)
area("money", "Částky v Kč",
     lambda l, prev: re.search(r"toLocaleString\([^)]*\)\}?\s?Kč", l)
     or re.search(r"(const|function)\s+\w+\s*=?\s*\(?\s*\w+(:\s*number)?\s*\)?\s*(=>|\{)[^\n]*Kč", l))
area("chips", "Štítky (ručně stavěné pilulky)",
     lambda l, prev: re.search(r"<Badge[ >]", l) or (
         "rounded-full" in l and re.search(SMALL_TEXT, l) and re.search(r"\bpx-(1|1\.5|2|2\.5|3)\b", l)
         and "<button" not in l and not re.search(r"\bw-\d+ h-\d+\b|\bh-\d+ w-\d+\b", l)))
area("progress", "Proužky průběhu",
     lambda l, prev: "rounded-full" in l and "overflow-hidden" in l
     and re.search(r"\bh-(1|1\.5|2|2\.5|3)\b", l) and re.search(r"bg-(gray-(100|200)|surface-3|line|ink/10|black/10)", l))
area("choices", "Výběr z voleb (zvýraznění vybrané volby)",
     lambda l, prev: "aria-pressed" in l or re.search(
         r"\?\s*[\"'`][^\"'`]*(bg-pitch-(500|600|700)|border-pitch-(400|500|600)|ring-pitch-(400|500)|bg-pitch-50 )[^\"'`]*[\"'`]\s*:", l))
area("dialogs", "Dialogy a překrytí obrazovky",
     lambda l, prev: re.search(r"fixed inset-0|window\.confirm\(|<Modal[ >]|<ConfirmDialog[ >]|useConfirm\(\)", l))
area("forms", "Formulářová pole bez sdíleného vzhledu",
     lambda l, prev: (re.search(r"<input[ >]", l) and not re.search(r"className=\"[^\"]*\binput\b", l)
                      and not re.search(r"type=\"(checkbox|radio|range|file|hidden|color)\"", l))
     or (re.search(r"<select[ >]", l) and not re.search(r"\bselect\b[^\"]*\"", l.split("<select", 1)[1]))
     or ("<textarea" in l))
area("collapsible", "Sbalovací bloky (`<details>`)",
     lambda l, prev: "<details" in l)

def kind(key, l):
    if key == "loading":
        if re.search(r"min-h-\[(40|50|60)vh\]|page-container|py-(16|20|24)", l): return "stránka"
        if re.search(r"py-(6|8|10|12)|h-(32|40|48)|min-h-\[\d+px\]", l): return "sekce"
        return "v textu nebo tlačítku"
    if key == "errors":
        if re.search(r"<button|\bBTN\b|hover:", l): return "tlačítko"
        if re.search(r"^\s*[\w\"']+\s*:\s*[\"'`]", l) or re.search(r"\?\s*[\"'`]", l): return "tón (mapa nebo podmínka)"
        return "hláška"
    if key == "money":
        return "funkce" if re.search(r"(const|function)\s+\w+", l) else "přímo v textu"
    if key == "dialogs":
        if "window.confirm" in l: return "window.confirm"
        if "useConfirm()" in l: return "useConfirm bez plachty"
        if "<Modal" in l or "<ConfirmDialog" in l: return "Modal / ConfirmDialog"
        return "vlastní překrytí"
    if key == "forms":
        return "select" if "<select" in l else "textarea" if "<textarea" in l else "input"
    return ""

hits = {k: [] for k, _, _ in AREAS}
for p in files:
    rel = str(p.relative_to(ROOT))
    lines = p.read_text(encoding="utf-8").splitlines()
    for i, line in enumerate(lines):
        prev = lines[i - 1] if i else ""
        for key, _, match in AREAS:
            if match(line, prev):
                hits[key].append((rel, i + 1, clip(line), kind(key, line)))

out = []
for key, title, _ in AREAS:
    rows = hits[key]
    nfiles = len({r[0] for r in rows})
    out.append(f"## {key}: {title}\n")
    out.append(f"{len(rows)} míst v {nfiles} souborech.\n")
    kinds = {}
    for r in rows:
        if r[3]: kinds[r[3]] = kinds.get(r[3], 0) + 1
    if kinds:
        out.append("Podle druhu: " + ", ".join(f"{k} {v}" for k, v in sorted(kinds.items(), key=lambda x: -x[1])) + ".\n")
    by_file = {}
    for rel, ln, snip, kd in rows:
        by_file.setdefault(rel, []).append((ln, snip, kd))
    has_kind = bool(kinds)
    out.append("| Soubor | Řádek |" + (" Druh |" if has_kind else "") + " Kód |\n|---|---|" + ("---|" if has_kind else "") + "---|")
    for rel, items in by_file.items():
        for j, (ln, snip, kd) in enumerate(items):
            out.append(f"| {('`' + rel + '`') if j == 0 else ''} | {ln} |" + (f" {kd} |" if has_kind else "") + f" `{snip}` |")
    out.append("")

sys.stdout.write("\n".join(out))
for key, _, _ in AREAS:
    sys.stderr.write(f"{key}: {len(hits[key])} míst / {len({r[0] for r in hits[key]})} souborů\n")
