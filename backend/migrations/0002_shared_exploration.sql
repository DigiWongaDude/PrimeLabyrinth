-- One shared location per generation, starting room and complete canonical path.
-- Traveller identity is attribution, never part of the shared location key.
CREATE TABLE discoveries (
  generation INTEGER NOT NULL CHECK(generation > 0),
  root_triple TEXT NOT NULL,
  path TEXT NOT NULL,
  canonical_path TEXT NOT NULL UNIQUE,
  parent_path TEXT,
  a INTEGER NOT NULL,
  b INTEGER NOT NULL,
  c INTEGER NOT NULL,
  first_discovered_at TEXT NOT NULL,
  first_traveller_id TEXT NOT NULL,
  PRIMARY KEY(generation, root_triple, path),
  CHECK(canonical_path = 'g' || generation || ':' || root_triple || ':' || path),
  FOREIGN KEY(first_traveller_id, path) REFERENCES visits(traveller_id, path)
);
CREATE INDEX discoveries_triple ON discoveries(a,b,c);
CREATE INDEX discoveries_recent ON discoveries(first_discovered_at DESC,canonical_path);
CREATE INDEX visits_shared_location ON visits(canonical_path);

-- Backfill without changing personal history. Historical timestamps can tie;
-- use lexical traveller ID only as a deterministic migration tie-break.
INSERT INTO discoveries(generation,root_triple,path,canonical_path,parent_path,a,b,c,first_discovered_at,first_traveller_id)
SELECT 5,'2,2,3',path,canonical_path,parent_path,a,b,c,discovered_at,traveller_id
FROM (
  SELECT *,row_number() OVER (PARTITION BY canonical_path ORDER BY discovered_at,traveller_id) AS position
  FROM visits
) WHERE position=1;

CREATE TRIGGER discoveries_immutable_update BEFORE UPDATE ON discoveries BEGIN
  SELECT RAISE(ABORT,'immutable_discovery');
END;
CREATE TRIGGER discoveries_immutable_delete BEFORE DELETE ON discoveries BEGIN
  SELECT RAISE(ABORT,'immutable_discovery');
END;

-- Both root registration and server-verified moves insert visits. This trigger
-- runs inside that SAME transaction, not a background task or second API write.
-- First committed insertion owns discovery; retries and later visitors reuse it.
CREATE TRIGGER visits_share_discovery AFTER INSERT ON visits BEGIN
  INSERT INTO discoveries(generation,root_triple,path,canonical_path,parent_path,a,b,c,first_discovered_at,first_traveller_id)
    VALUES(5,'2,2,3',NEW.path,NEW.canonical_path,NEW.parent_path,NEW.a,NEW.b,NEW.c,NEW.discovered_at,NEW.traveller_id)
    ON CONFLICT(canonical_path) DO NOTHING;
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM discoveries WHERE canonical_path=NEW.canonical_path AND path=NEW.path
      AND parent_path IS NEW.parent_path AND a=NEW.a AND b=NEW.b AND c=NEW.c
  ) THEN RAISE(ABORT,'discovery_identity_mismatch') END;
END;
