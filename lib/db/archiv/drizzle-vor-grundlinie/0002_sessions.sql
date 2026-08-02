-- Anmeldesitzungen fuer die Wiederherstellung nach einem Reload.
--
-- Gespeichert wird nur der SHA-256-Hash des Sitzungstokens. Weder IP-Adresse
-- noch User-Agent werden erfasst; beides ist personenbezogen und fuer die
-- Funktion nicht erforderlich.

CREATE TABLE IF NOT EXISTS sessions (
  id                  text PRIMARY KEY,
  user_id             text NOT NULL,
  token_hash          text NOT NULL UNIQUE,
  created_at          timestamp DEFAULT now(),
  last_used_at        timestamp DEFAULT now(),
  expires_at          timestamp NOT NULL,
  absolute_expires_at timestamp NOT NULL,
  revoked_at          timestamp
);

-- Der Lookup laeuft ausschliesslich ueber den Hash.
CREATE INDEX IF NOT EXISTS sessions_token_hash_idx ON sessions (token_hash);

-- Fuer "auf allen Geraeten abmelden" und den Loeschlauf.
CREATE INDEX IF NOT EXISTS sessions_user_id_idx ON sessions (user_id);

COMMENT ON TABLE sessions IS
  'Anmeldesitzungen. Enthaelt nur Hashes, keine Klartexttoken, keine IP, keinen User-Agent.';
