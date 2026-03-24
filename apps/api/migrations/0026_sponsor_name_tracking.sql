-- Track when team last changed main sponsor (once per season limit)
ALTER TABLE teams ADD COLUMN last_main_sponsor_change_season INTEGER DEFAULT 0;
