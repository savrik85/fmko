-- Tribuna — sociální síť fanoušků v telefonu
--
-- Nálada part, jejich reakce, rivalita i to, koho mají rádi, se dosud daly
-- přečíst jen jako čísla na stránce fanoušků. Tohle je místo, kde to zní jako
-- lidi: krátké příspěvky, které vznikají z TÝCHŽ událostí, co hýbou náladou.
--
-- Žádná AI. Příspěvky se skládají ze šablon deterministicky (seed z události),
-- takže je zadarmo a při opakovaném běhu vyjde totéž.

CREATE TABLE IF NOT EXISTS fan_posts (
  id          TEXT PRIMARY KEY,
  -- Stabilní klíč události, ze které příspěvek vznikl. Partial UNIQUE níž drží
  -- idempotenci: dvakrát zpracovaný zápas nenapíše dvakrát totéž.
  reference_id TEXT,
  -- Čí zeď to je. Příspěvek rivala se zapisuje na zeď OBOU klubů, aby se o něm
  -- dotčený vůbec dozvěděl — proto team_id, ne autorův klub.
  team_id     TEXT NOT NULL,

  author_name   TEXT NOT NULL,
  author_handle TEXT NOT NULL,           -- @neco
  -- vudce | fanousek | novinar | rival | klub
  author_kind   TEXT NOT NULL DEFAULT 'fanousek',
  author_avatar TEXT,                    -- JSON facesjs; u vůdců se bere jejich
  group_id      TEXT,                    -- za kterou partu mluví, když za nějakou

  body        TEXT NOT NULL,
  -- Nálada příspěvku: pozitivni | negativni | neutralni. Barví odznak a dá se
  -- podle ní číst nálada bez čtení všech příspěvků.
  tone        TEXT NOT NULL DEFAULT 'neutralni',
  likes       INTEGER NOT NULL DEFAULT 0,
  -- Na co reaguje: club_event | incident | zapas | oblibenec | rivalita
  topic       TEXT NOT NULL DEFAULT 'zapas',
  game_date   TEXT NOT NULL,
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_fan_posts_ref
  ON fan_posts(reference_id) WHERE reference_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_fan_posts_team
  ON fan_posts(team_id, created_at DESC);
