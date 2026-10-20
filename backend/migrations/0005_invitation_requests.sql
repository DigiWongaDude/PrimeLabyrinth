-- Public invitation requests are private moderation data, not accounts or
-- invitations. This migration is authored for local review only; Paul must
-- approve any remote application separately.
CREATE TABLE invitation_requests (
  id TEXT PRIMARY KEY NOT NULL,
  display_name TEXT NOT NULL CHECK(length(display_name) BETWEEN 1 AND 40),
  email TEXT NOT NULL CHECK(length(email) BETWEEN 3 AND 254),
  email_hash TEXT NOT NULL CHECK(length(email_hash)=64 AND email_hash NOT GLOB '*[^0-9a-f]*'),
  message TEXT NOT NULL DEFAULT '' CHECK(length(message)<=1000),
  turnstile_hash TEXT NOT NULL UNIQUE CHECK(length(turnstile_hash)=64 AND turnstile_hash NOT GLOB '*[^0-9a-f]*'),
  privacy_accepted_at INTEGER NOT NULL CHECK(typeof(privacy_accepted_at)='integer'),
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING','APPROVED','REJECTED','EXPIRED')),
  created_at INTEGER NOT NULL DEFAULT(unixepoch()),
  reviewed_at INTEGER,
  reviewer_reference TEXT CHECK(reviewer_reference IS NULL OR length(reviewer_reference)<=64),
  CHECK(reviewed_at IS NULL OR reviewed_at>=created_at)
);
-- A rejected/expired request may be submitted again later. Active requests
-- remain one-per-normalised-email, including concurrent duplicate submissions.
CREATE UNIQUE INDEX invitation_requests_active_email
  ON invitation_requests(email_hash)
  WHERE status IN ('PENDING','APPROVED');
CREATE INDEX invitation_requests_review ON invitation_requests(status,created_at);

CREATE TABLE invitation_request_limits (
  key_hash TEXT PRIMARY KEY NOT NULL CHECK(length(key_hash)=64 AND key_hash NOT GLOB '*[^0-9a-f]*'),
  attempts INTEGER NOT NULL CHECK(attempts>0),
  expires_at INTEGER NOT NULL CHECK(typeof(expires_at)='integer')
);

CREATE TABLE invitation_request_outbox (
  id TEXT PRIMARY KEY NOT NULL,
  request_id TEXT NOT NULL REFERENCES invitation_requests(id),
  kind TEXT NOT NULL CHECK(kind IN ('ACK','REVIEW','INVITATION')),
  template_key TEXT NOT NULL CHECK(template_key IN ('invitation_request_received_v1','invitation_request_review_v1','invitation_delivery_v1')),
  recipient TEXT NOT NULL CHECK(length(recipient)<=254),
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING','SENDING','SENT','UNKNOWN','FAILED')),
  idempotency_key TEXT NOT NULL UNIQUE CHECK(length(idempotency_key)=64 AND idempotency_key NOT GLOB '*[^0-9a-f]*'),
  attempts INTEGER NOT NULL DEFAULT 0 CHECK(attempts>=0),
  provider_message_id TEXT,
  last_error_code TEXT CHECK(last_error_code IS NULL OR length(last_error_code)<=64),
  created_at INTEGER NOT NULL DEFAULT(unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT(unixepoch()),
  CHECK(status!='SENT' OR provider_message_id IS NOT NULL)
);
CREATE INDEX invitation_request_outbox_ready ON invitation_request_outbox(status,updated_at);
CREATE UNIQUE INDEX invitation_request_outbox_kind ON invitation_request_outbox(request_id,kind);

CREATE TABLE invitation_request_approvals (
  request_id TEXT PRIMARY KEY NOT NULL REFERENCES invitation_requests(id),
  approval_id TEXT NOT NULL UNIQUE,
  operator_reference TEXT NOT NULL CHECK(length(operator_reference) BETWEEN 1 AND 64),
  approved_at INTEGER NOT NULL DEFAULT(unixepoch()),
  issuance_state TEXT NOT NULL DEFAULT 'PENDING' CHECK(issuance_state IN ('PENDING','ISSUED','UNKNOWN','FAILED')),
  invitation_id TEXT UNIQUE,
  delivery_state TEXT NOT NULL DEFAULT 'NOT_READY' CHECK(delivery_state IN ('NOT_READY','PENDING','SENDING','SENT','UNKNOWN','FAILED')),
  last_error_code TEXT CHECK(last_error_code IS NULL OR length(last_error_code)<=64),
  updated_at INTEGER NOT NULL DEFAULT(unixepoch())
);
CREATE INDEX invitation_request_approvals_state ON invitation_request_approvals(issuance_state,delivery_state);

CREATE TRIGGER invitation_request_approval_guard BEFORE INSERT ON invitation_request_approvals BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM invitation_requests WHERE id=NEW.request_id AND status='PENDING'
  ) AND NOT EXISTS (
    SELECT 1 FROM invitation_request_approvals WHERE request_id=NEW.request_id
  ) THEN RAISE(ABORT,'request_not_pending') END;
END;
CREATE TRIGGER invitation_request_approval_immutable BEFORE UPDATE ON invitation_request_approvals BEGIN
  SELECT CASE WHEN NEW.request_id IS NOT OLD.request_id
    OR NEW.approval_id IS NOT OLD.approval_id
    OR NEW.operator_reference IS NOT OLD.operator_reference
    OR NEW.approved_at IS NOT OLD.approved_at
    OR (OLD.invitation_id IS NOT NULL AND NEW.invitation_id IS NOT OLD.invitation_id)
    THEN RAISE(ABORT,'immutable_approval') END;
END;
