-- Rozpad běhu na fáze (JSON) — kde se utratí ~2000 dotazů na jedno kolo.
-- Celkové číslo říká, že je to moc, ale ne kde; bez rozpadu by se optimalizovalo poslepu.
ALTER TABLE queue_runs ADD COLUMN phases TEXT;
