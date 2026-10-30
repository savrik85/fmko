-- Rodinné vazby mezi trenéry (2026-10-30). Váže lidi (users.id), ne kluby: brácha
-- zůstane bráchou, i když jeden z nich převezme jiný klub. Dvojice se ukládá
-- seřazená (user_a_id < user_b_id), zapisuje se ručně (kdo je čí bratr, hra nepozná).
CREATE TABLE IF NOT EXISTS manager_family (
  user_a_id  TEXT NOT NULL,
  user_b_id  TEXT NOT NULL,
  kind       TEXT NOT NULL DEFAULT 'brother',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  PRIMARY KEY (user_a_id, user_b_id)
);
CREATE INDEX IF NOT EXISTS idx_manager_family_b ON manager_family (user_b_id);
