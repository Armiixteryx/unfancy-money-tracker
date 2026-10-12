-- Planned expenses are ordered children of a budget. Keeping them in their
-- own table preserves the existing whole-budget sync revision and conflict
-- model while allowing an actual budget deletion to clean them up atomically.
CREATE TABLE budget_planned_expenses (
  dataset_id uuid NOT NULL,
  budget_id uuid NOT NULL,
  id uuid NOT NULL CHECK (
    id::text ~ '^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  ),
  position integer NOT NULL CHECK (position >= 0),
  description text NOT NULL CHECK (
    description = btrim(description) AND length(description) BETWEEN 1 AND 200
  ),
  amount numeric NOT NULL CHECK (
    amount > 0 AND amount::text ~ '^(0|[1-9][0-9]*)(\.[0-9]*[1-9])?$'
  ),
  currency text NOT NULL CHECK (
    currency IN ('USD','EUR','GBP','CAD','AUD','JPY','CHF','CNY','BRL','MXN','COP','CLP','PEN','ARS','UYU','VES')
  ),
  PRIMARY KEY(dataset_id,budget_id,id),
  UNIQUE(dataset_id,id),
  UNIQUE(dataset_id,budget_id,position),
  FOREIGN KEY(dataset_id,budget_id)
    REFERENCES budgets(dataset_id,id) ON DELETE CASCADE,
  CHECK (
    amount = trunc(amount, CASE WHEN currency IN ('JPY','CLP') THEN 0 ELSE 2 END)
  )
);

GRANT SELECT,INSERT,UPDATE,DELETE ON budget_planned_expenses TO unfancy_sync;
