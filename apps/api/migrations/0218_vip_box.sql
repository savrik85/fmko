-- 0218: VIP lóže na hlavní tribuně, úroveň 0–3.
-- Aplikovat ručně: npx wrangler d1 execute prales-db-test --remote --file apps/api/migrations/0218_vip_box.sql
-- Produkce jen po výslovném souhlasu a po záloze (wrangler d1 export).
ALTER TABLE stadiums ADD COLUMN vip_box INTEGER NOT NULL DEFAULT 0;
