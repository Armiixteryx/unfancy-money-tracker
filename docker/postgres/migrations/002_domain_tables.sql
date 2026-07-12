-- Normalized projections keep the sync envelope queryable without exposing a general database API.
CREATE TABLE IF NOT EXISTS transactions (
  dataset_id UUID NOT NULL REFERENCES datasets(dataset_id) ON DELETE CASCADE,
  transaction_id UUID NOT NULL,
  amount NUMERIC(38, 18) NOT NULL CHECK (amount > 0),
  currency CHAR(3) NOT NULL CHECK (currency IN ('USD', 'EUR', 'GBP', 'CAD', 'AUD', 'JPY', 'CHF', 'CNY', 'BRL', 'MXN', 'COP', 'CLP', 'PEN', 'ARS', 'UYU', 'VES')),
  transaction_type TEXT NOT NULL CHECK (transaction_type IN ('income', 'expense')),
  category_id UUID NOT NULL,
  description TEXT NOT NULL CHECK (char_length(description) BETWEEN 1 AND 200),
  occurred_on DATE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  revision BIGINT NOT NULL CHECK (revision >= 0),
  tombstone BOOLEAN NOT NULL DEFAULT FALSE,
  PRIMARY KEY (dataset_id, transaction_id)
);

CREATE TABLE IF NOT EXISTS categories (
  dataset_id UUID NOT NULL REFERENCES datasets(dataset_id) ON DELETE CASCADE,
  category_id UUID NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('income', 'expense')),
  name TEXT NOT NULL CHECK (char_length(name) BETWEEN 1 AND 80),
  is_system BOOLEAN NOT NULL,
  is_archived BOOLEAN NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  revision BIGINT NOT NULL CHECK (revision >= 0),
  tombstone BOOLEAN NOT NULL DEFAULT FALSE,
  PRIMARY KEY (dataset_id, category_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS categories_dataset_kind_name_idx
  ON categories (dataset_id, kind, lower(name))
  WHERE tombstone = FALSE;

CREATE TABLE IF NOT EXISTS budgets (
  dataset_id UUID NOT NULL REFERENCES datasets(dataset_id) ON DELETE CASCADE,
  budget_id UUID NOT NULL,
  category_id UUID NOT NULL,
  month CHAR(7) NOT NULL CHECK (month ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  amount NUMERIC(38, 18) NOT NULL CHECK (amount > 0),
  currency CHAR(3) NOT NULL CHECK (currency IN ('USD', 'EUR', 'GBP', 'CAD', 'AUD', 'JPY', 'CHF', 'CNY', 'BRL', 'MXN', 'COP', 'CLP', 'PEN', 'ARS', 'UYU', 'VES')),
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  revision BIGINT NOT NULL CHECK (revision >= 0),
  tombstone BOOLEAN NOT NULL DEFAULT FALSE,
  PRIMARY KEY (dataset_id, budget_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS budgets_dataset_category_month_idx
  ON budgets (dataset_id, category_id, month)
  WHERE tombstone = FALSE;

CREATE TABLE IF NOT EXISTS preferences (
  dataset_id UUID PRIMARY KEY REFERENCES datasets(dataset_id) ON DELETE CASCADE,
  base_currency CHAR(3) NOT NULL CHECK (base_currency IN ('USD', 'EUR', 'GBP', 'CAD', 'AUD', 'JPY', 'CHF', 'CNY', 'BRL', 'MXN', 'COP', 'CLP', 'PEN', 'ARS', 'UYU', 'VES')),
  theme TEXT NOT NULL CHECK (theme IN ('system', 'light', 'dark')),
  analytics_consent BOOLEAN NOT NULL DEFAULT FALSE,
  revision BIGINT NOT NULL CHECK (revision >= 0),
  tombstone BOOLEAN NOT NULL DEFAULT FALSE
);

DO $$
BEGIN
  ALTER TABLE sync_changes
    ADD CONSTRAINT sync_changes_entity_type_check
    CHECK (entity_type IN ('transaction', 'category', 'budget', 'preference'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE sync_changes
    ADD CONSTRAINT sync_changes_operation_tombstone_check
    CHECK ((operation = 'delete' AND tombstone = TRUE AND payload IS NULL) OR (operation = 'upsert' AND tombstone = FALSE));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE sync_records
    ADD CONSTRAINT sync_records_payload_tombstone_check
    CHECK ((operation = 'delete' AND tombstone = TRUE AND payload IS NULL) OR (operation = 'upsert' AND tombstone = FALSE));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
