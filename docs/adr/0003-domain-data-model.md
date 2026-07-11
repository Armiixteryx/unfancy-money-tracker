# ADR 0003: Canonical domain data model

## Status

Accepted.

## Context

Unfancy Money Tracker needs a stable domain model that works for anonymous local use and optional cloud sync. Financial values must remain accurate across currencies, category changes must not silently lose history, and the model must stay intentionally smaller than a banking product.

## Decision

### Financial scope

The product models one consolidated financial view of manually entered income and expenses. It has no financial-account, source, destination, transfer, bank-connection, or reconciliation entities.

### Money and dates

Represent money as `{ amount: string; currency: CurrencyCode }`. Amounts are canonical decimal strings: positive for transaction and budget values, normalized without exponent notation, and validated against the ISO precision of the currency. Use `decimal.js` for arithmetic and never pass money through JavaScript floating-point numbers.

Transaction dates are calendar dates in `YYYY-MM-DD` form with no time or timezone component.

### Records and categories

Transactions, budgets, and categories use UUID identifiers. Default categories are seeded with new UUIDs for each dataset; UUIDs are not stable across datasets and are not replaced with built-in slugs.

Expense defaults are Food, Housing, Transport, Shopping, Utilities, Entertainment, Health, Education, and Subscriptions. Income has one default category, Income. Income and expense categories are separate and cannot be mixed.

Every dataset also contains a protected `Uncategorized` system category. It cannot be archived or deleted. Deleting any other category reassigns its transactions and budgets to `Uncategorized`, then records a category deletion tombstone. The tombstone prevents the category from being silently reseeded after reload or sync.

Category UUIDs are retained by transactions; transactions do not store a category-name snapshot. Renaming a category therefore updates its displayed name for historical transactions and reports. Archived categories cannot be selected for new transactions but remain visible on historical records and reports.

### Budgets and aggregates

Budgets are unique by `(calendar month, expense category UUID)`, apply only to expense transactions in that month, use the user’s base currency, do not roll over, and may be exceeded. Income never contributes to a category budget.

Original transaction amounts and currencies are preserved. Dashboard, budget, and report totals are derived values converted to the selected base currency. Conversion uses the latest available rate or a cached stale rate when offline; if no rate exists, the aggregate remains unavailable rather than showing a misleading combined total. Converted values use half-up rounding at the target currency’s ISO precision.

### Persistence and sync

Persist local and cloud data in versioned state envelopes. Syncable records carry record-level tombstones so deletions propagate without silently restoring data. When two datasets contain categories with different UUIDs but the same kind and name, retain both records; sync never auto-merges them. The UI may help users clean up duplicates later.

User preferences for base currency and theme are part of the account-synced state. Existing local records are preserved during initial sync and merged according to ADR 0001.

## Consequences

- Money calculations are deterministic and auditable across platforms.
- Default categories can be deleted without losing transaction or budget references.
- Per-dataset UUIDs make records safe to merge without assuming that built-in categories have globally stable identities.
- Sync may temporarily show duplicate category names; preserving both records avoids destructive automatic merges.
- Category, money, persistence, conversion, and sync behavior require boundary validation and focused tests.
- `decimal.js`, a UUID generator, currency metadata, and a sync-capable persistence implementation will be required before the domain model can be shipped.

## Validation

- Validate positive amounts, canonical decimal normalization, rejected exponent notation, rejected over-precision, and ISO currency precision.
- Verify decimal arithmetic has no floating-point drift and conversion uses half-up rounding.
- Verify UUID uniqueness within a dataset and independent UUID seeding across datasets.
- Test category kind filtering, rename and archive behavior, protected `Uncategorized`, deletion reassignment, and persistent deletion tombstones.
- Test duplicate same-name categories remain distinct during sync.
- Test budget uniqueness, month boundaries, expense-only calculations, base-currency behavior, and overspending.
- Test persisted-state versioning, invalid-data rejection, tombstone retention, and migration compatibility.
- Confirm logs and analytics never contain financial amounts, descriptions, categories, or other sensitive values.
