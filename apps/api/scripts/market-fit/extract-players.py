"""Z denní zálohy produ (sql.gz) vytáhne jen tabulku players do malé SQLite.

Spuštění: python3 extract-players.py prod-2026-10-25.sql.gz players-2026-10-25.sqlite
"""
import gzip
import sqlite3
import sys

src, dst = sys.argv[1], sys.argv[2]
con = sqlite3.connect(dst)
con.execute("DROP TABLE IF EXISTS players")
buf: list[str] = []
created = inserted = 0
with gzip.open(src, "rt", encoding="utf-8") as f:
    for line in f:
        buf.append(line)
        stmt = "".join(buf)
        if not sqlite3.complete_statement(stmt):
            continue
        buf = []
        head = stmt.lstrip()[:40]
        if head.startswith("CREATE TABLE players ") or head.startswith('CREATE TABLE "players" '):
            con.execute(stmt)
            created += 1
        elif head.startswith('INSERT INTO "players" ') or head.startswith("INSERT INTO players "):
            con.execute(stmt)
            inserted += 1
con.commit()
print(f"{src}: tabulka {created}, hráčů {inserted}")
