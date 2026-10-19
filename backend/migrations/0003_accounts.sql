-- Authentication is separate from the immutable traveller/discovery ledger.
CREATE TABLE profiles (
  traveller_id TEXT PRIMARY KEY REFERENCES travellers(id),
  public_id TEXT NOT NULL UNIQUE DEFAULT (lower(hex(randomblob(16)))),
  display_name TEXT NOT NULL DEFAULT 'Traveller',
  legacy_enabled INTEGER NOT NULL DEFAULT 1 CHECK(legacy_enabled IN (0,1)),
  anonymised INTEGER NOT NULL DEFAULT 0 CHECK(anonymised IN (0,1))
);
INSERT INTO profiles(traveller_id) SELECT id FROM travellers;
CREATE TRIGGER traveller_profile AFTER INSERT ON travellers BEGIN
  INSERT INTO profiles(traveller_id) VALUES(NEW.id);
END;

CREATE TABLE accounts (
  traveller_id TEXT PRIMARY KEY REFERENCES travellers(id),
  username TEXT UNIQUE COLLATE NOCASE,
  password_hash TEXT,
  google_sub TEXT UNIQUE,
  recovery_hash TEXT NOT NULL UNIQUE,
  version INTEGER NOT NULL DEFAULT 1,
  CHECK(username IS NULL OR username = lower(username)),
  CHECK((username IS NULL) = (password_hash IS NULL))
);
CREATE TRIGGER account_disables_legacy AFTER INSERT ON accounts BEGIN
  UPDATE profiles SET legacy_enabled=0 WHERE traveller_id=NEW.traveller_id;
END;
CREATE TABLE sessions (
  token_hash TEXT PRIMARY KEY,
  traveller_id TEXT NOT NULL REFERENCES accounts(traveller_id),
  account_version INTEGER NOT NULL,
  authenticated_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX sessions_traveller ON sessions(traveller_id);
CREATE INDEX sessions_expiry ON sessions(expires_at);

-- No verifier, authorization code, ID token, email or bearer token is persisted.
CREATE TABLE oauth_attempts (
  state_hash TEXT PRIMARY KEY,
  challenge TEXT NOT NULL,
  nonce_hash TEXT NOT NULL,
  origin TEXT NOT NULL,
  mode TEXT NOT NULL CHECK(mode IN ('login','link','migrate')),
  traveller_id TEXT REFERENCES travellers(id),
  session_hash TEXT,
  display_name TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX oauth_expiry ON oauth_attempts(expires_at);
CREATE TABLE auth_limits (
  key_hash TEXT PRIMARY KEY,
  attempts INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX auth_limits_expiry ON auth_limits(expires_at);
