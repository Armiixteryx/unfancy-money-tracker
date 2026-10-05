-- Bound retained connections independently of Lambda invocation concurrency.
-- Passwords and login provisioning remain outside versioned SQL.
ALTER ROLE unfancy_sync CONNECTION LIMIT 5;
ALTER ROLE unfancy_rates CONNECTION LIMIT 2;
