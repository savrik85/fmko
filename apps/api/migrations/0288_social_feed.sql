-- Socky jako společná zeď všech okresů: příspěvky manažerů, komentáře, lajky,
-- skrývání a nahlašování. Automatické příspěvky se neukládají znovu: zeď je skládá
-- z článků Zpravodaje (`news`), komentáře se k nim vážou přes `target_key`.
--
-- target_key:
--   post:<social_posts.id>                      příspěvek manažera
--   news:<news.id>                              článek Zpravodaje
--   bundle:transfers:<okres>:<YYYY-MM-DD>       denní souhrn přestupů okresu
--   comment:<social_comments.id>                (jen lajky) komentář
--   fanpost:<fan_posts.id>                      (jen lajky) hlas fanouška pod výsledky

CREATE TABLE IF NOT EXISTS social_posts (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL,
  team_id     TEXT NOT NULL,
  body        TEXT NOT NULL,
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  -- Smazal autor.
  deleted_at  TEXT,
  -- Stáhl admin po nahlášení.
  removed_at  TEXT
);
CREATE INDEX IF NOT EXISTS idx_social_posts_created ON social_posts(created_at);
CREATE INDEX IF NOT EXISTS idx_social_posts_user ON social_posts(user_id, created_at);

CREATE TABLE IF NOT EXISTS social_comments (
  id            TEXT PRIMARY KEY,
  target_key    TEXT NOT NULL,
  -- manager | fan | journalist
  author_kind   TEXT NOT NULL,
  -- Jen u manažera.
  user_id       TEXT,
  -- Klub manažera, nebo klub, kterému fanoušek fandí. U novináře prázdné.
  team_id       TEXT,
  -- fan_leaders.id / journalists.id, ať se dá poznat, že píše pořád tentýž člověk.
  persona_id    TEXT,
  author_name   TEXT NOT NULL,
  author_avatar TEXT,
  reply_to_id   TEXT,
  body          TEXT NOT NULL,
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  deleted_at    TEXT,
  removed_at    TEXT
);
CREATE INDEX IF NOT EXISTS idx_social_comments_target ON social_comments(target_key, created_at);
CREATE INDEX IF NOT EXISTS idx_social_comments_created ON social_comments(created_at);
CREATE INDEX IF NOT EXISTS idx_social_comments_user ON social_comments(user_id, created_at);

CREATE TABLE IF NOT EXISTS social_likes (
  target_key  TEXT NOT NULL,
  user_id     TEXT NOT NULL,
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  PRIMARY KEY (target_key, user_id)
);

-- Co si kdo skryl. kind: item | team | district | category
CREATE TABLE IF NOT EXISTS social_mutes (
  user_id     TEXT NOT NULL,
  kind        TEXT NOT NULL,
  value       TEXT NOT NULL,
  -- Čitelný popis pro seznam skrytého („klub FK Engel Vimperk").
  label       TEXT NOT NULL,
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  PRIMARY KEY (user_id, kind, value)
);

CREATE TABLE IF NOT EXISTS social_reports (
  id           TEXT PRIMARY KEY,
  target_key   TEXT NOT NULL,
  user_id      TEXT NOT NULL,
  reason       TEXT,
  created_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  resolved_at  TEXT,
  -- removed | dismissed
  resolution   TEXT
);
CREATE INDEX IF NOT EXISTS idx_social_reports_open ON social_reports(resolved_at, created_at);
CREATE UNIQUE INDEX IF NOT EXISTS idx_social_reports_once ON social_reports(target_key, user_id);

-- Zeď čte články všech soutěží v časovém okně; dosavadní index začíná soutěží.
CREATE INDEX IF NOT EXISTS idx_news_created ON news(created_at);
-- Hlasy fanoušků pod výsledky kola hledají zápasy soutěže a kola.
CREATE INDEX IF NOT EXISTS idx_matches_league_round ON matches(league_id, round);
