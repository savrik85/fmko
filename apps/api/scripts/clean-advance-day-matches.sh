#!/bin/bash
# Vyčistí zápasová data která neměl generovat advance-day.
# Smaže odsimulované zápasy z 1. kola + jejich stats, ratings, zranění.
# ZACHOVÁ: hráče, týmy, ligu, kalendář, sponzory — jen zápasová data.
#
# Použití:
#   PRODUKCE: bash scripts/clean-advance-day-matches.sh prod
#   TEST:     bash scripts/clean-advance-day-matches.sh test

ENV="${1:-test}"
if [ "$ENV" = "prod" ]; then
  DB="prales-db-prod"
  FLAGS="--remote"
elif [ "$ENV" = "test" ]; then
  DB="prales-db-test"
  FLAGS="--remote --env testing"
else
  echo "Použití: bash scripts/clean-advance-day-matches.sh [test|prod]"
  exit 1
fi

echo "=== Čistím zápasová data generovaná advance-day ==="
echo "Flags: $FLAGS"
echo ""

# 1. Smaž match_player_stats pro odsimulované zápasy
echo "Mažu match_player_stats..."
npx wrangler d1 execute $DB $FLAGS --command \
  "DELETE FROM match_player_stats WHERE match_id IN (SELECT id FROM matches WHERE status = 'simulated')" 2>&1 | grep changes

# 2. Smaž player_stats (sezónní agregáty — budou se přegenerovat)
echo "Mažu player_stats..."
npx wrangler d1 execute $DB $FLAGS --command \
  "DELETE FROM player_stats" 2>&1 | grep changes

# 3. Smaž zranění ze zápasů
echo "Mažu injuries ze zápasů..."
npx wrangler d1 execute $DB $FLAGS --command \
  "DELETE FROM injuries WHERE match_id IS NOT NULL" 2>&1 | grep changes

# 4. Smaž training_log z match experience
echo "Mažu training_log (match experience)..."
npx wrangler d1 execute $DB $FLAGS --command \
  "DELETE FROM training_log WHERE training_type = 'match'" 2>&1 | grep changes

# 5. Smaž zpravodaj (round_results)
echo "Mažu zpravodaj..."
npx wrangler d1 execute $DB $FLAGS --command \
  "DELETE FROM news WHERE type = 'round_results'" 2>&1 | grep changes

# 6. Resetuj odsimulované zápasy zpět na 'scheduled'
echo "Resetuju zápasy na scheduled..."
npx wrangler d1 execute $DB $FLAGS --command \
  "UPDATE matches SET status = 'scheduled', home_score = NULL, away_score = NULL, events = NULL, player_ratings = NULL, commentary = NULL, weather = NULL, attendance = NULL, pitch_condition = NULL, stadium_name = NULL, home_seen_at = NULL, away_seen_at = NULL WHERE status = 'simulated'" 2>&1 | grep changes

# 6b. Resetuj seen_at i na scheduled zápasech (záloha může mít staré seen_at)
echo "Resetuju seen_at na všech zápasech..."
npx wrangler d1 execute $DB $FLAGS --command \
  "UPDATE matches SET home_seen_at = NULL, away_seen_at = NULL WHERE home_seen_at IS NOT NULL OR away_seen_at IS NOT NULL" 2>&1 | grep changes

# 7. Resetuj season_calendar na scheduled
echo "Resetuju calendar na scheduled..."
npx wrangler d1 execute $DB $FLAGS --command \
  "UPDATE season_calendar SET status = 'scheduled' WHERE status = 'simulated'" 2>&1 | grep changes

# 8. Resetuj lineups
echo "Mažu lineups..."
npx wrangler d1 execute $DB $FLAGS --command \
  "DELETE FROM lineups" 2>&1 | grep changes

# 9. Resetuj condition a morale hráčů na 100/70
echo "Resetuju condition a morale..."
npx wrangler d1 execute $DB $FLAGS --command \
  "UPDATE players SET life_context = json_set(life_context, '$.condition', 100, '$.morale', 70) WHERE status = 'active' OR status IS NULL" 2>&1 | grep changes

# 10. Resetuj suspended_matches
echo "Resetuju suspensions..."
npx wrangler d1 execute $DB $FLAGS --command \
  "UPDATE players SET suspended_matches = 0 WHERE suspended_matches > 0" 2>&1 | grep changes

echo ""
echo "=== Hotovo ==="
echo "Ověř: npx wrangler d1 execute $DB $FLAGS --command \"SELECT COUNT(*) FROM matches WHERE status = 'simulated'\""
