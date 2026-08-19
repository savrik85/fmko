-- Veřejná nástěnka soutěže vedle neveřejného kabinetu.
--
-- Sdílí tabulku, protože je to totéž vlákno s jiným publikem — jen se liší,
-- kdo do něj vidí. Výchozí 'kabinet' drží stávající zprávy tam, kde byly.
ALTER TABLE competition_board_messages ADD COLUMN scope TEXT NOT NULL DEFAULT 'kabinet';
CREATE INDEX IF NOT EXISTS idx_comp_board_scope
  ON competition_board_messages(league_id, scope, sent_at);
