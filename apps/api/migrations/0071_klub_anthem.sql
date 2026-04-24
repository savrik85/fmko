-- Klub: krok 8 - hymna klubu (lyrics + audio)
-- Text hymny (Gemini) + audio URL z Suno AI + limit pokusu
-- anthem_task_id: background task ID z sunoapi.org pro polling stavu

ALTER TABLE teams ADD COLUMN anthem_url TEXT;
ALTER TABLE teams ADD COLUMN anthem_lyrics TEXT;
ALTER TABLE teams ADD COLUMN anthem_title TEXT;
ALTER TABLE teams ADD COLUMN anthem_style TEXT;
ALTER TABLE teams ADD COLUMN anthem_attempts_used INTEGER DEFAULT 0;
ALTER TABLE teams ADD COLUMN anthem_task_id TEXT;
