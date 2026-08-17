#!/bin/bash
# Smaže veškerá herní data z LOKÁLNÍ D1, zachová seed data.
# Použití: bash apps/api/scripts/wipe-game-data.sh
#
# ── Proč se seznam tabulek negeneruje ručně ──────────────────────────────────
# Předchozí verze měla natvrdo vypsaných 30 tabulek `DELETE FROM`. Herních tabulek
# je ale 95 — zbylých 65 (staff_members, fans, cup_*, village_*, season_recap,
# team_achievements, journalists, coach_interviews, referees …) zůstávalo po
# „vyčištění" v databázi. Odtud pocházely osiřelé záznamy: týmy, jejichž liga
# už neexistovala (nález 2026-08-17).
#
# Proto se seznam odvozuje ze schématu: smaže se VŠECHNO kromě výslovně
# vyjmenovaných seed tabulek. Nová migrace se tím pádem uklidí sama a skript
# nemůže zastarat.
set -euo pipefail

DB=$(find apps/api/.wrangler -name "*.sqlite" -path "*/d1/*" 2>/dev/null | head -1)
if [ -z "$DB" ]; then
  echo "ERROR: D1 database not found (apps/api/.wrangler/**/d1/*.sqlite)"
  exit 1
fi

# ── Tabulky, které wipe NESMÍ smazat ────────────────────────────────────────
# Ověřeno 2026-08-17 podle toho, kdo do nich zapisuje: tyhle plní výhradně
# migrace nebo admin seed-upload endpoint, nikoli běžící hra.
#   villages, district_surnames, district_sponsors — migrace
#   commentary_templates, crowd_reactions          — migrace
#   d1_migrations                                  — infrastruktura wrangleru
#   game_clock                                     — řeší se zvlášť (reset, ne smazání)
#   users                                          — řeší se zvlášť (mazat kromě 'ai')
KEEP="villages district_surnames district_sponsors commentary_templates crowd_reactions d1_migrations game_clock users"

is_kept() {
  for k in $KEEP; do [ "$1" = "$k" ] && return 0; done
  return 1
}

TABLES=$(sqlite3 "$DB" "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name")

echo "Database: $DB"
echo "Wiping game data..."

# Sestavit SQL: DELETE pro všechno mimo KEEP.
# foreign_keys = OFF → na pořadí mazání nezáleží, což je u 88 tabulek k nezaplacení.
SQL="PRAGMA foreign_keys = OFF;\n"
WIPED=0
for t in $TABLES; do
  if is_kept "$t"; then continue; fi
  SQL="${SQL}DELETE FROM \"$t\";\n"
  WIPED=$((WIPED + 1))
done

# ── Zvláštní případy ────────────────────────────────────────────────────────
# users: smazat všechny kromě systémového 'ai' (na něm visí AI týmy).
SQL="${SQL}DELETE FROM users WHERE id != 'ai';\n"
SQL="${SQL}INSERT OR IGNORE INTO users (id, email, password_hash) VALUES ('ai', 'ai@system', 'none');\n"
# game_clock: NEMAZAT, jen vynulovat posun. Chybějící řádek by herní čas TIŠE zastavil.
SQL="${SQL}INSERT INTO game_clock (id, offset_days) VALUES (1, 0) ON CONFLICT(id) DO UPDATE SET offset_days = 0;\n"
SQL="${SQL}PRAGMA foreign_keys = ON;\n"

printf "%b" "$SQL" | sqlite3 "$DB"
echo "Vyprázdněno tabulek: $WIPED (+ users kromě 'ai', game_clock vynulován)"

# ── Ověření ─────────────────────────────────────────────────────────────────
# Kontroluje se KAŽDÁ tabulka, ne jen hrstka. Kdyby někdy zbyla data, ukáže se to tady.
echo ""
echo "=== OVĚŘENÍ ==="
FAIL=0

for t in $TABLES; do
  if is_kept "$t"; then continue; fi
  n=$(sqlite3 "$DB" "SELECT COUNT(*) FROM \"$t\";")
  if [ "$n" != "0" ]; then
    echo "  ✗ $t má po wipe $n řádků"
    FAIL=$((FAIL + 1))
  fi
done

u=$(sqlite3 "$DB" "SELECT COUNT(*) FROM users WHERE id != 'ai';")
[ "$u" = "0" ] || { echo "  ✗ users (mimo 'ai'): $u"; FAIL=$((FAIL + 1)); }

# Seed musí PŘEŽÍT — prázdná seed tabulka je stejná chyba jako nesmazaná herní.
for t in villages district_surnames district_sponsors commentary_templates crowd_reactions; do
  n=$(sqlite3 "$DB" "SELECT COUNT(*) FROM \"$t\";" 2>/dev/null || echo 0)
  if [ "$n" = "0" ]; then
    echo "  ✗ SEED tabulka $t je prázdná — hra bez ní nepojede"
    FAIL=$((FAIL + 1))
  else
    echo "  ✓ seed $t: $n řádků"
  fi
done

clock=$(sqlite3 "$DB" "SELECT offset_days FROM game_clock WHERE id = 1;" 2>/dev/null || echo "CHYBÍ")
[ "$clock" = "0" ] && echo "  ✓ game_clock vynulován" || { echo "  ✗ game_clock: $clock"; FAIL=$((FAIL + 1)); }
ai=$(sqlite3 "$DB" "SELECT COUNT(*) FROM users WHERE id = 'ai';")
[ "$ai" = "1" ] && echo "  ✓ systémový uživatel 'ai' zachován" || { echo "  ✗ chybí uživatel 'ai'"; FAIL=$((FAIL + 1)); }

echo ""
if [ "$FAIL" = "0" ]; then
  echo "HOTOVO — herní data smazána, seed zachován."
else
  echo "SELHALO — $FAIL problémů výše."
  exit 1
fi
