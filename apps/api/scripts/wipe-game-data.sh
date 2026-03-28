#!/bin/bash
# Smaže veškerá herní data, zachová seed data (villages, surnames, sponsors, commentary, crowd_reactions)
# Použití: bash apps/api/scripts/wipe-game-data.sh

DB=$(find apps/api/.wrangler -name "*.sqlite" -path "*/d1/*" 2>/dev/null | head -1)
if [ -z "$DB" ]; then
  echo "ERROR: D1 database not found"
  exit 1
fi

echo "Database: $DB"
echo "Wiping game data..."

sqlite3 "$DB" <<'SQL'
PRAGMA foreign_keys = OFF;

DELETE FROM training_log;
DELETE FROM match_player_stats;
DELETE FROM player_stats;
DELETE FROM injuries;
DELETE FROM relationships;
DELETE FROM player_contracts;
DELETE FROM messages;
DELETE FROM conversations;
DELETE FROM news;
DELETE FROM notifications;
DELETE FROM chat_messages;
DELETE FROM sponsor_contracts;
DELETE FROM transactions;
DELETE FROM lineups;
DELETE FROM matches;
DELETE FROM season_calendar;
DELETE FROM seasonal_events;
DELETE FROM equipment;
DELETE FROM stadiums;
DELETE FROM managers;
DELETE FROM free_agents;
DELETE FROM transfer_offers;
DELETE FROM transfer_listings;
DELETE FROM transfer_bids;
DELETE FROM classifieds;
DELETE FROM players;
DELETE FROM leagues;
DELETE FROM seasons;
DELETE FROM teams;
DELETE FROM users WHERE id != 'ai';

-- Re-create AI user if missing
INSERT OR IGNORE INTO users (id, email, password_hash) VALUES ('ai', 'ai@system', 'none');

PRAGMA foreign_keys = ON;
SQL

echo ""
echo "=== GAME DATA (should be 0) ==="
for t in users teams players matches seasons leagues; do
  if [ "$t" = "users" ]; then
    c=$(sqlite3 "$DB" "SELECT COUNT(*) FROM users WHERE id != 'ai';")
    ai=$(sqlite3 "$DB" "SELECT COUNT(*) FROM users WHERE id = 'ai';")
    echo "  $t: $c (AI user: $ai)"
  else
    c=$(sqlite3 "$DB" "SELECT COUNT(*) FROM $t;")
    echo "  $t: $c"
  fi
done

echo ""
echo "=== SEED DATA (preserved) ==="
for t in villages district_surnames district_sponsors commentary_templates crowd_reactions; do
  c=$(sqlite3 "$DB" "SELECT COUNT(*) FROM $t;")
  echo "  $t: $c"
done

echo ""
echo "Done. Ready for fresh registration."
