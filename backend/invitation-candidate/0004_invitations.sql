-- REVIEW CANDIDATE ONLY. Not in Wrangler's migrations_dir. Do not apply remotely
-- until the invitation-aware API and its route tests are implemented/reviewed.
CREATE TABLE invitations (
  id TEXT PRIMARY KEY NOT NULL,
  token_hash TEXT NOT NULL UNIQUE CHECK(length(token_hash)=64 AND token_hash NOT GLOB '*[^0-9a-f]*'),
  created_at INTEGER NOT NULL DEFAULT (unixepoch()) CHECK(typeof(created_at)='integer'),
  expires_at INTEGER NOT NULL CHECK(typeof(expires_at)='integer'),
  revoked_at INTEGER CHECK(revoked_at IS NULL OR typeof(revoked_at)='integer'),
  operator_reference TEXT CHECK(operator_reference IS NULL OR length(operator_reference)<=64),
  CHECK(expires_at>created_at AND expires_at<=created_at+604800),
  CHECK(revoked_at IS NULL OR revoked_at>=created_at)
);
CREATE TABLE invitation_redemptions (
  invite_hash TEXT PRIMARY KEY NOT NULL REFERENCES invitations(token_hash),
  traveller_id TEXT NOT NULL UNIQUE REFERENCES travellers(id),
  redeemed_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE TRIGGER invitation_redeem_guard BEFORE INSERT ON invitation_redemptions BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM invitations WHERE token_hash=NEW.invite_hash
    AND created_at<=unixepoch() AND expires_at>unixepoch() AND revoked_at IS NULL
  ) OR NEW.redeemed_at<>unixepoch() THEN RAISE(ABORT,'invitation_unavailable') END;
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM profiles WHERE traveller_id=NEW.traveller_id AND anonymised=0
  ) OR EXISTS (SELECT 1 FROM accounts WHERE traveller_id=NEW.traveller_id)
    THEN RAISE(ABORT,'admission_required') END;
END;
CREATE TRIGGER invitation_redemption_no_update BEFORE UPDATE ON invitation_redemptions BEGIN
  SELECT RAISE(ABORT,'immutable_redemption');
END;
CREATE TRIGGER invitation_redemption_no_delete BEFORE DELETE ON invitation_redemptions BEGIN
  SELECT RAISE(ABORT,'immutable_redemption');
END;
-- Expiry cannot be extended, a revoked invitation cannot be revived, and an
-- operator cannot change its identity to turn a spent credential into a new one.
CREATE TRIGGER invitation_identity_immutable BEFORE UPDATE ON invitations BEGIN
  SELECT CASE WHEN NEW.id IS NOT OLD.id OR NEW.token_hash IS NOT OLD.token_hash
    OR NEW.created_at IS NOT OLD.created_at OR NEW.expires_at IS NOT OLD.expires_at
    OR (OLD.revoked_at IS NOT NULL AND NEW.revoked_at IS NOT OLD.revoked_at)
    THEN RAISE(ABORT,'immutable_invitation') END;
END;

CREATE TABLE legacy_upgrade_eligibility (
  traveller_id TEXT PRIMARY KEY NOT NULL REFERENCES travellers(id)
);
INSERT INTO legacy_upgrade_eligibility(traveller_id)
  SELECT p.traveller_id FROM profiles p WHERE p.legacy_enabled=1 AND p.anonymised=0
  AND NOT EXISTS (SELECT 1 FROM accounts a WHERE a.traveller_id=p.traveller_id);
-- Seal the snapshot. No post-migration account can manufacture an exemption.
CREATE TRIGGER legacy_eligibility_no_insert BEFORE INSERT ON legacy_upgrade_eligibility BEGIN
  SELECT RAISE(ABORT,'sealed_legacy_snapshot');
END;
CREATE TRIGGER legacy_eligibility_no_update BEFORE UPDATE ON legacy_upgrade_eligibility BEGIN
  SELECT RAISE(ABORT,'sealed_legacy_snapshot');
END;

-- Transaction-local proof transport: insert with the presented credential hash,
-- then insert the account in the SAME db.batch. The account trigger consumes it.
-- Never commit this INSERT on its own. No raw token is stored.
CREATE TABLE legacy_upgrade_proofs (
  traveller_id TEXT PRIMARY KEY NOT NULL REFERENCES legacy_upgrade_eligibility(traveller_id),
  token_hash TEXT NOT NULL
);
CREATE TRIGGER legacy_proof_guard BEFORE INSERT ON legacy_upgrade_proofs BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM travellers t JOIN profiles p ON p.traveller_id=t.id
    JOIN legacy_upgrade_eligibility e ON e.traveller_id=t.id
    WHERE t.id=NEW.traveller_id AND t.token_hash=NEW.token_hash
    AND p.legacy_enabled=1 AND p.anonymised=0
    AND NOT EXISTS (SELECT 1 FROM accounts a WHERE a.traveller_id=t.id)
  ) THEN RAISE(ABORT,'legacy_proof_invalid') END;
END;
CREATE TRIGGER legacy_proof_no_update BEFORE UPDATE ON legacy_upgrade_proofs BEGIN
  SELECT RAISE(ABORT,'legacy_proof_invalid');
END;

CREATE TRIGGER account_admission_guard BEFORE INSERT ON accounts BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM profiles WHERE traveller_id=NEW.traveller_id AND anonymised=0
  ) THEN RAISE(ABORT,'admission_required') END;
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM invitation_redemptions WHERE traveller_id=NEW.traveller_id
  ) AND NOT EXISTS (
    SELECT 1 FROM legacy_upgrade_proofs proof
    JOIN legacy_upgrade_eligibility e ON e.traveller_id=proof.traveller_id
    JOIN travellers t ON t.id=proof.traveller_id
    JOIN profiles p ON p.traveller_id=t.id
    WHERE t.id=NEW.traveller_id AND proof.token_hash=t.token_hash
    AND p.legacy_enabled=1 AND p.anonymised=0
  ) THEN RAISE(ABORT,'admission_required') END;
END;
CREATE TRIGGER account_consumes_admission AFTER INSERT ON accounts BEGIN
  DELETE FROM legacy_upgrade_proofs WHERE traveller_id=NEW.traveller_id;
  DELETE FROM legacy_upgrade_eligibility WHERE traveller_id=NEW.traveller_id;
  -- Also protects against a future rollback to a credential-only Worker.
  UPDATE travellers SET token_hash=lower(hex(randomblob(32))) WHERE id=NEW.traveller_id;
END;

ALTER TABLE oauth_attempts ADD COLUMN invite_hash TEXT
  CHECK(invite_hash IS NULL OR (length(invite_hash)=64 AND invite_hash NOT GLOB '*[^0-9a-f]*'));
-- This is deliberately not a FK: returning Google users can log in with an
-- absent/unknown invitation. New subjects must redeem it in their transaction.

-- Existing profiles retain their ability to resume. New travellers must never
-- acquire usable legacy credentials, even if old route code is accidentally run.
DROP TRIGGER traveller_profile;
CREATE TRIGGER traveller_profile AFTER INSERT ON travellers BEGIN
  INSERT INTO profiles(traveller_id,legacy_enabled) VALUES(NEW.id,0);
END;
