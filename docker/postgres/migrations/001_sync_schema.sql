CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS datasets (
  dataset_id UUID PRIMARY KEY,
  owner_subject TEXT NOT NULL,
  revision BIGINT NOT NULL DEFAULT 0 CHECK (revision >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (owner_subject, dataset_id)
);

CREATE TABLE IF NOT EXISTS sync_records (
  dataset_id UUID NOT NULL REFERENCES datasets(dataset_id) ON DELETE CASCADE,
  entity_type TEXT NOT NULL CHECK (entity_type IN ('transaction', 'category', 'budget', 'preference')),
  record_id UUID NOT NULL,
  revision BIGINT NOT NULL CHECK (revision >= 0),
  base_revision BIGINT NOT NULL CHECK (base_revision >= 0),
  operation TEXT NOT NULL CHECK (operation IN ('upsert', 'delete')),
  payload JSONB,
  tombstone BOOLEAN NOT NULL DEFAULT FALSE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (dataset_id, entity_type, record_id),
  CHECK ((operation = 'delete' AND tombstone = TRUE) OR (operation = 'upsert' AND tombstone = FALSE))
);

CREATE TABLE IF NOT EXISTS sync_changes (
  sequence BIGSERIAL PRIMARY KEY,
  dataset_id UUID NOT NULL REFERENCES datasets(dataset_id) ON DELETE CASCADE,
  entity_type TEXT NOT NULL,
  record_id UUID NOT NULL,
  revision BIGINT NOT NULL CHECK (revision >= 0),
  operation TEXT NOT NULL,
  payload JSONB,
  tombstone BOOLEAN NOT NULL,
  idempotency_key UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (dataset_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS sync_changes_dataset_cursor_idx
  ON sync_changes (dataset_id, sequence);

CREATE TABLE IF NOT EXISTS sync_idempotency (
  dataset_id UUID NOT NULL REFERENCES datasets(dataset_id) ON DELETE CASCADE,
  idempotency_key UUID NOT NULL,
  response JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (dataset_id, idempotency_key)
);

