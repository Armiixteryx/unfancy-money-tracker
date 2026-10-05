CREATE TABLE datasets (
  id uuid PRIMARY KEY CHECK (substring(id::text,15,1) = '7'),
  owner_subject text NOT NULL UNIQUE,
  revision bigint NOT NULL DEFAULT 0 CHECK (revision >= 0 AND revision <= 9007199254740991),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE TABLE categories (
  dataset_id uuid NOT NULL REFERENCES datasets(id), id text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('income','expense')), name text NOT NULL CHECK (length(name) BETWEEN 1 AND 80),
  default_category_key text, is_system boolean NOT NULL, is_archived boolean NOT NULL,
  created_at timestamptz NOT NULL, updated_at timestamptz NOT NULL,
  PRIMARY KEY (dataset_id,id), UNIQUE(dataset_id,id,kind),
  CHECK ((is_system AND default_category_key IS NOT NULL AND NOT is_archived AND id = kind || '-' || default_category_key AND
    ((kind='income' AND default_category_key IN ('income','uncategorized')) OR
     (kind='expense' AND default_category_key IN ('food','housing','transport','shopping','utilities','entertainment','health','education','subscriptions','uncategorized')))) OR
    (NOT is_system AND default_category_key IS NULL AND id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'))
);
CREATE TABLE transactions (
  dataset_id uuid NOT NULL REFERENCES datasets(id), id uuid NOT NULL CHECK (substring(id::text,15,1)='7'),
  amount numeric NOT NULL CHECK (amount > 0 AND amount::text !~ 'NaN|Infinity'), currency text NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
  type text NOT NULL CHECK (type IN ('income','expense')), category_id text NOT NULL,
  description text NOT NULL CHECK (length(description) BETWEEN 1 AND 200), date date NOT NULL,
  created_at timestamptz NOT NULL, updated_at timestamptz NOT NULL,
  PRIMARY KEY(dataset_id,id), FOREIGN KEY(dataset_id,category_id,type) REFERENCES categories(dataset_id,id,kind)
);
CREATE TABLE budgets (
  dataset_id uuid NOT NULL REFERENCES datasets(id), id uuid NOT NULL CHECK (substring(id::text,15,1)='7'),
  category_id text NOT NULL, kind text NOT NULL DEFAULT 'expense' CHECK (kind='expense'),
  month date NOT NULL CHECK (extract(day FROM month)=1), amount numeric NOT NULL CHECK (amount > 0 AND amount::text !~ 'NaN|Infinity'),
  currency text NOT NULL CHECK (currency ~ '^[A-Z]{3}$'), created_at timestamptz NOT NULL, updated_at timestamptz NOT NULL,
  PRIMARY KEY(dataset_id,id), UNIQUE(dataset_id,category_id,month), FOREIGN KEY(dataset_id,category_id,kind) REFERENCES categories(dataset_id,id,kind)
);
CREATE TABLE currency_preferences (
  dataset_id uuid PRIMARY KEY REFERENCES datasets(id), base_currency text NOT NULL CHECK (base_currency ~ '^[A-Z]{3}$'),
  selected_currencies text[] NOT NULL CHECK (cardinality(selected_currencies)>0 AND base_currency=ANY(selected_currencies))
);
CREATE TABLE sync_records (
  dataset_id uuid NOT NULL REFERENCES datasets(id), record_type text NOT NULL CHECK(record_type IN ('category','transaction','budget','preference')),
  record_id text NOT NULL, revision bigint NOT NULL CHECK (revision>0), deleted boolean NOT NULL,
  edited_at timestamptz NOT NULL, committed_at timestamptz NOT NULL,
  PRIMARY KEY(dataset_id,record_type,record_id)
);
CREATE TABLE sync_changes (
  dataset_id uuid NOT NULL REFERENCES datasets(id), revision bigint NOT NULL,
  change jsonb NOT NULL, PRIMARY KEY(dataset_id,revision)
);
CREATE TABLE mutation_acknowledgments (
  dataset_id uuid NOT NULL REFERENCES datasets(id), mutation_id uuid NOT NULL CHECK(substring(mutation_id::text,15,1)='7'),
  request_hash text NOT NULL, acknowledgment jsonb NOT NULL,
  PRIMARY KEY(dataset_id,mutation_id)
);
CREATE TABLE exchange_rates (
  cache_key text PRIMARY KEY, base text NOT NULL, quote text NOT NULL,
  rate numeric NOT NULL CHECK(rate>0 AND rate::text !~ 'NaN|Infinity'), effective_date date NOT NULL,
  fetched_at timestamptz NOT NULL, provider text NOT NULL CHECK(provider IN ('frankfurter-blended','same-currency')),
  status text NOT NULL CHECK(status IN ('fresh','stale'))
);
CREATE FUNCTION reject_change_modification() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Immutable sync history'; END $$;
CREATE TRIGGER immutable_changes BEFORE UPDATE OR DELETE ON sync_changes FOR EACH ROW EXECUTE FUNCTION reject_change_modification();
CREATE TRIGGER immutable_acknowledgments BEFORE UPDATE OR DELETE ON mutation_acknowledgments FOR EACH ROW EXECUTE FUNCTION reject_change_modification();
-- Portable non-login privilege roles; the explicit migration deployment configures login passwords.
CREATE ROLE unfancy_sync NOLOGIN;
CREATE ROLE unfancy_rates NOLOGIN;
GRANT USAGE ON SCHEMA public TO unfancy_sync, unfancy_rates;
GRANT SELECT, INSERT, UPDATE, DELETE ON datasets,categories,transactions,budgets,currency_preferences,sync_records TO unfancy_sync;
GRANT SELECT, INSERT ON sync_changes,mutation_acknowledgments TO unfancy_sync;
GRANT SELECT, INSERT, UPDATE ON exchange_rates TO unfancy_rates;

CREATE FUNCTION protect_category_identity() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP='DELETE' THEN
    IF OLD.is_system THEN RAISE EXCEPTION 'Protected category'; END IF;
    RETURN OLD;
  END IF;
  IF NEW.id<>OLD.id OR NEW.dataset_id<>OLD.dataset_id OR NEW.kind<>OLD.kind OR NEW.is_system<>OLD.is_system OR
    (OLD.is_system AND (NEW.name<>OLD.name OR NEW.is_archived OR NEW.default_category_key IS DISTINCT FROM OLD.default_category_key)) THEN
    RAISE EXCEPTION 'Protected category identity';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER protected_categories BEFORE UPDATE OR DELETE ON categories FOR EACH ROW EXECUTE FUNCTION protect_category_identity();
