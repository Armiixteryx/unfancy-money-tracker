-- Shared trackers use the existing per-dataset revision stream. Keep the full
-- owner_subject UNIQUE constraint so the schema-8 personal bootstrap conflict
-- target remains valid; shared rows have no personal owner_subject.
ALTER TABLE datasets ALTER COLUMN owner_subject DROP NOT NULL;
ALTER TABLE datasets
  ADD COLUMN tracker_kind text NOT NULL DEFAULT 'personal'
    CHECK (tracker_kind IN ('personal','shared')),
  ADD COLUMN tracker_name text NOT NULL DEFAULT 'Personal tracker'
    CHECK (length(tracker_name) BETWEEN 1 AND 80),
  ADD COLUMN archived_at timestamptz;
ALTER TABLE datasets ADD CONSTRAINT datasets_owner_matches_kind CHECK (
  (tracker_kind='personal' AND owner_subject IS NOT NULL) OR
  (tracker_kind='shared' AND owner_subject IS NULL)
);

CREATE TABLE tracker_memberships (
  membership_id uuid PRIMARY KEY CHECK (substring(membership_id::text,15,1)='7'),
  dataset_id uuid NOT NULL REFERENCES datasets(id),
  subject text NOT NULL,
  email text NOT NULL CHECK (length(email) BETWEEN 3 AND 320),
  role text NOT NULL CHECK (role IN ('admin','member')),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  revoked_at timestamptz,
  revoked_by_subject text
);
CREATE UNIQUE INDEX tracker_memberships_one_active_subject
  ON tracker_memberships(dataset_id,subject) WHERE revoked_at IS NULL;
CREATE INDEX tracker_memberships_active_subject
  ON tracker_memberships(subject,dataset_id) WHERE revoked_at IS NULL;

CREATE TABLE tracker_invitations (
  invitation_id uuid PRIMARY KEY CHECK (substring(invitation_id::text,15,1)='7'),
  dataset_id uuid NOT NULL REFERENCES datasets(id),
  token_hash text NOT NULL UNIQUE CHECK (token_hash ~ '^[0-9a-f]{64}$'),
  target_subject text NOT NULL,
  target_email text NOT NULL CHECK (length(target_email) BETWEEN 3 AND 320),
  role text NOT NULL CHECK (role IN ('admin','member')),
  invited_by_subject text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  expires_at timestamptz NOT NULL,
  accepted_at timestamptz,
  revoked_at timestamptz,
  CHECK (expires_at > created_at),
  CHECK (accepted_at IS NULL OR revoked_at IS NULL)
);
CREATE UNIQUE INDEX tracker_invitations_one_pending_target
  ON tracker_invitations(dataset_id,target_subject)
  WHERE accepted_at IS NULL AND revoked_at IS NULL;
CREATE INDEX tracker_invitations_dataset
  ON tracker_invitations(dataset_id,created_at DESC);

-- This table is immutable creator metadata for shared transactions. Keeping it
-- outside transaction payloads preserves old mutation hashes and change JSON.
CREATE TABLE transaction_authorship (
  dataset_id uuid NOT NULL REFERENCES datasets(id),
  transaction_id uuid NOT NULL CHECK (substring(transaction_id::text,15,1)='7'),
  creator_subject text NOT NULL,
  creator_email text NOT NULL CHECK (length(creator_email) BETWEEN 3 AND 320),
  creator_membership_id uuid NOT NULL CHECK (substring(creator_membership_id::text,15,1)='7'),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY(dataset_id,transaction_id)
);

ALTER TABLE mutation_requests
  ADD COLUMN sender_subject text,
  ADD COLUMN membership_id uuid;
ALTER TABLE mutation_requests ADD CONSTRAINT mutation_request_sender_context CHECK (
  membership_id IS NULL OR sender_subject IS NOT NULL
);

CREATE FUNCTION reject_tracker_membership_delete() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Tracker membership rows are retained';
END $$;
CREATE TRIGGER retained_tracker_memberships
  BEFORE DELETE ON tracker_memberships
  FOR EACH ROW EXECUTE FUNCTION reject_tracker_membership_delete();

CREATE FUNCTION protect_tracker_membership_identity() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  active_admins integer;
BEGIN
  IF NEW.membership_id<>OLD.membership_id OR NEW.dataset_id<>OLD.dataset_id OR
     NEW.subject<>OLD.subject OR OLD.revoked_at IS NOT NULL THEN
    RAISE EXCEPTION 'Tracker membership identity is immutable';
  END IF;
  IF OLD.role='admin' AND OLD.revoked_at IS NULL AND
     (NEW.role<>'admin' OR NEW.revoked_at IS NOT NULL) THEN
    PERFORM 1 FROM datasets WHERE id=OLD.dataset_id FOR UPDATE;
    SELECT count(*) INTO active_admins FROM tracker_memberships
      WHERE dataset_id=OLD.dataset_id AND role='admin' AND revoked_at IS NULL;
    IF active_admins<=1 THEN RAISE EXCEPTION 'Last tracker admin'; END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER protected_tracker_membership_identity
  BEFORE UPDATE ON tracker_memberships
  FOR EACH ROW EXECUTE FUNCTION protect_tracker_membership_identity();

CREATE FUNCTION reject_transaction_authorship_modification() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Transaction authorship is immutable'; END $$;
CREATE TRIGGER immutable_transaction_authorship
  BEFORE UPDATE OR DELETE ON transaction_authorship
  FOR EACH ROW EXECUTE FUNCTION reject_transaction_authorship_modification();

GRANT SELECT,INSERT,UPDATE ON tracker_memberships,tracker_invitations TO unfancy_sync;
GRANT SELECT,INSERT ON transaction_authorship TO unfancy_sync;
