-- Historical visits, active journey, and future constructed world are separate.
CREATE TABLE travellers (
  id TEXT PRIMARY KEY,
  token_hash TEXT NOT NULL UNIQUE,
  active_path TEXT NOT NULL DEFAULT 'ROOT',
  revision INTEGER NOT NULL DEFAULT 0 CHECK(revision >= 0),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE visits (
  traveller_id TEXT NOT NULL REFERENCES travellers(id),
  path TEXT NOT NULL,
  canonical_path TEXT NOT NULL,
  parent_path TEXT,
  a INTEGER NOT NULL,
  b INTEGER NOT NULL,
  c INTEGER NOT NULL,
  discovered_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  spatial_metadata TEXT,
  PRIMARY KEY(traveller_id, path),
  UNIQUE(traveller_id, canonical_path),
  FOREIGN KEY(traveller_id, parent_path) REFERENCES visits(traveller_id, path)
);
CREATE INDEX visits_history ON visits(traveller_id, discovered_at, path);
CREATE TRIGGER visits_immutable_update BEFORE UPDATE ON visits BEGIN
  SELECT RAISE(ABORT, 'immutable_visit');
END;
CREATE TRIGGER visits_immutable_delete BEFORE DELETE ON visits BEGIN
  SELECT RAISE(ABORT, 'immutable_visit');
END;

-- This ledger both deduplicates retries and records successful transitions.
CREATE TABLE commands (
  traveller_id TEXT NOT NULL REFERENCES travellers(id),
  request_id TEXT NOT NULL,
  expected_revision INTEGER NOT NULL,
  action TEXT NOT NULL CHECK(action IN ('advance','retrace')),
  door INTEGER,
  result_path TEXT NOT NULL,
  parent_path TEXT,
  a INTEGER NOT NULL,
  b INTEGER NOT NULL,
  c INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY(traveller_id, request_id),
  UNIQUE(traveller_id, expected_revision)
);
CREATE TRIGGER commands_guard BEFORE INSERT ON commands BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM travellers WHERE id=NEW.traveller_id AND revision=NEW.expected_revision
  ) THEN RAISE(ABORT, 'stale_revision') END;
  SELECT CASE WHEN NEW.expected_revision >= 50000 THEN RAISE(ABORT, 'journey_limit') END;
  SELECT CASE WHEN (SELECT count(*) FROM visits WHERE traveller_id=NEW.traveller_id) >= 10000
    AND NOT EXISTS (SELECT 1 FROM visits WHERE traveller_id=NEW.traveller_id AND path=NEW.result_path)
    THEN RAISE(ABORT, 'visit_limit') END;
END;
-- A single INSERT and these triggers are one SQLite transaction. A failure in
-- any trigger rolls back command, discovery and active-string change together.
CREATE TRIGGER commands_apply AFTER INSERT ON commands BEGIN
  INSERT INTO visits(traveller_id,path,canonical_path,parent_path,a,b,c)
    VALUES(NEW.traveller_id,NEW.result_path,'g5:2,2,3:' || NEW.result_path,NEW.parent_path,NEW.a,NEW.b,NEW.c)
    ON CONFLICT(traveller_id,path) DO NOTHING;
  UPDATE travellers SET active_path=NEW.result_path,revision=revision+1
    WHERE id=NEW.traveller_id;
END;

-- Reserved only: no Stage A API writes occupancy or assigns a world floor.
-- Door level remains an elevation INSIDE a room, not a world floor.
CREATE TABLE world_occupancy (
  id TEXT PRIMARY KEY,
  traveller_id TEXT NOT NULL,
  visit_path TEXT NOT NULL,
  x INTEGER NOT NULL,
  y INTEGER NOT NULL,
  world_floor INTEGER NOT NULL,
  lifecycle TEXT NOT NULL,
  replaces_id TEXT REFERENCES world_occupancy(id),
  metadata TEXT,
  FOREIGN KEY(traveller_id,visit_path) REFERENCES visits(traveller_id,path)
);
CREATE INDEX occupancy_location ON world_occupancy(traveller_id,x,y,world_floor);
