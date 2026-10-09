-- Výměna víc hráčů za jednoho: hráči, které kupující přidává k nabídce, mají vlastní tabulku.
-- `transfer_offers.offered_player_id` unesl jen jednoho a nové nabídky do něj už nepíšou.
-- Bez cizího klíče na players: hráč se při odchodu maže a historie výměny má zůstat
-- (jméno se dohledá v departed_players).
-- MUSÍ běžet PŘED nasazením kódu: seznamy nabídek z tabulky čtou a bez ní spadnou.
CREATE TABLE IF NOT EXISTS transfer_offer_swap_players (
  offer_id   TEXT NOT NULL,
  player_id  TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (offer_id, player_id)
);
CREATE INDEX IF NOT EXISTS idx_transfer_offer_swap_players_player ON transfer_offer_swap_players(player_id);

-- Dosavadní výměny (i uzavřené), ať historie, listina přestupů i kariéra hráče dál vědí, s kým se měnilo.
INSERT OR IGNORE INTO transfer_offer_swap_players (offer_id, player_id, sort_order)
  SELECT id, offered_player_id, 0 FROM transfer_offers WHERE offered_player_id IS NOT NULL;
