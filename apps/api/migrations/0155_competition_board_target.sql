-- Soukromý vzkaz konkrétnímu odboru — stížnost nebo nápad, který nemá viset
-- na veřejné nástěnce, ale nepatří ani do kabinetu vedení.
--
-- Čte ho jen držitel té funkce a prezident (je jim nadřízený a zastupuje
-- neobsazené funkce). Odesílatel vidí vždycky svoje.
ALTER TABLE competition_board_messages ADD COLUMN target_role TEXT;
CREATE INDEX IF NOT EXISTS idx_comp_board_target
  ON competition_board_messages(league_id, target_role, sent_at);
