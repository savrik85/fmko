-- 0242_povolit_vice_skautu_staff_slot.sql
-- Umožnění více skautů v realizačním týmu:
-- Index idx_staff_slot dříve zakazoval duplicitu rolí v týmu (WHERE team_id IS NOT NULL).
-- Nyní platí unikátnost (max 1 na roli) pro všechny specializace kromě 'skaut'.
DROP INDEX IF EXISTS idx_staff_slot;
CREATE UNIQUE INDEX IF NOT EXISTS idx_staff_slot ON staff_members(team_id, role) WHERE team_id IS NOT NULL AND role != 'skaut';
