# Unfancy Money Tracker — V1 Product Definition

## Product summary

Build a polished, cross-platform finance tracker for individuals who want one clear view of their income, expenses, budgets, and spending.

Users enter transactions manually. V1 does **not** model bank, cash, credit, or savings accounts; transactions have no source/destination fields and transfers are out of scope.

The app is anonymous and local-first by default. Users may optionally create an email-and-password account to back up and sync their data across devices.

## Product decisions

| Decision | V1 choice |
| --- | --- |
| Target user | General individual tracking income, expenses, and monthly budgets |
| Financial model | One consolidated view; no financial accounts or transfers |
| Transaction fields | Positive amount, income/expense type, category, description, date, currency |
| Categories | UUID-backed income and expense categories; defaults plus custom create, rename, archive, and delete |
| Budgets | One expense-category budget per calendar month; no rollover |
| Currency | Preserve original currency; store canonical decimal amounts and convert aggregates to a user-selected base currency with live rates and half-up rounding |
| Data and identity | Anonymous local use first; optional email/password account enables sync |
| Initial sync | Merge local and cloud data; ask the user to resolve conflicts or duplicate candidates |
| Insights | Descriptive reporting only; no financial advice |
| Monetization experiment | CSV export is a non-functional Pro-feature preview; record CTA interest without payment or export |

## Personas

### Primary persona — General individual tracker

Someone seeking an understandable monthly picture of income, expenses, category spending, and budget progress, without bank connection or account-reconciliation complexity.

### Portfolio objective

The product should demonstrate thoughtful product, design, and engineering practice through useful empty states, privacy-conscious analytics, complete edge states, clear tradeoffs, and responsive UI. This is an evaluation objective, not a user persona.

## Core user stories

- View current-month income, expenses, remaining budget, recent transactions, and category spending.
- Add, edit, delete, search, and filter income and expense transactions.
- Use UUID-backed income and expense categories; create, rename, archive, or delete categories.
- Create monthly category budgets and monitor progress or overspending.
- Review monthly trends and category breakdowns.
- Change base currency and theme, and inspect exchange-rate freshness.
- Start anonymously, then sign up/sign in to back up and synchronize existing data.
- Open the CSV export CTA and see a Pro-feature preview.

## Information architecture

Primary navigation:

1. Dashboard
2. Transactions
3. Budgets
4. Reports
5. Settings

The same five labels are used on mobile bottom navigation and the browser left rail. Category management is a Settings sub-area; it is not a sixth primary route. Sync/backup and export are also Settings sub-areas.

### Dashboard

- Current-month income, expenses, and remaining budget.
- Recent activity.
- Category spending and budget-attention states.

### Transactions

- Search and filter by type, category, currency, and date.
- Add, edit, and delete transaction flows.

### Budgets

- Month selection.
- Create and edit one category limit per month.
- Spent, remaining, and over-budget states with access to contributing transactions.

### Reports

- Period selection.
- Monthly spending trend and category breakdown.
- Descriptive observations based only on available data.

### Settings

- Base currency and theme.
- Category management.
- Exchange-rate status.
- Optional account/sync entry points.
- Local-data and sync status.

### Shared UI rules

- Use the working product name **Unfancy Money Tracker** in product UI; generated concept placeholder names are not part of scope.
- Use the labels Dashboard, Transactions, Budgets, Reports, and Settings consistently across platforms.
- Browser Transactions uses a persistent split-pane workspace; mobile uses a full-screen transaction form.
- Conflict resolution is a compact modal or detail panel over visible product context, not a full-viewport takeover.

## UI direction

Use a calm, modern fintech system: warm off-white surfaces, deep navy typography, emerald for positive states, coral for overspending, restrained sky-blue chart accents, soft gray borders, rounded cards, and accessible contrast.

### Mobile

- Bottom tabs: Overview, Activity, Plans, Insights, Settings.
- Dashboard answers “How am I doing this month?” in the first viewport: remaining budget is primary; income and expenses are supporting metrics.
- Show recent activity, category spending, and only the most relevant budget attention below the summary.
- Keep the add-transaction action persistently easy to reach.

### Browser

- Compact left navigation and a header action for adding a transaction.
- Preserve dashboard hierarchy while using the wider layout for a side-by-side spending trend, category breakdown, recent activity, and budget attention.
- Do not duplicate mobile navigation patterns merely to fill space.
- Use a persistent split-pane workspace for Transactions: the list remains visible while the selected transaction or new-transaction form occupies the detail pane. Mobile uses a full-screen transaction form.

## Product rules and edge cases

- Transaction amount must be positive. Required fields are type, amount, category, description, date, and currency.
- Archived categories cannot be selected for new transactions, but remain visible on historic transactions and reports.
- Default categories are seeded with new UUIDs per dataset. Income has one default Income category; expense defaults are Food, Housing, Transport, Shopping, Utilities, Entertainment, Health, Education, and Subscriptions.
- Uncategorized is a protected system category. Deleting another category moves its transactions and budgets to Uncategorized and records a deletion tombstone; deleted defaults are not silently reseeded.
- Transactions retain the category UUID rather than a category-name snapshot, so renames update historical labels and reports.
- Transaction amounts are canonical decimal strings, dates use `YYYY-MM-DD`, and converted aggregates use half-up rounding at the target currency’s ISO precision.
- Income never consumes a category budget.
- Budgets apply only to expense transactions inside their selected calendar month, do not roll over, and may be exceeded.
- Keep original transaction amount/currency for display. Convert aggregate figures to base currency using the latest live rate.
- Display rate freshness. When current rates cannot load, use cached rates with a visible stale notice. When no rate is available, show original-currency figures and explain why a combined total is unavailable.
- Anonymous data persists locally. Sign-up/sign-in must retain and upload existing local data.
- Initial sync never silently discards local or cloud data. Same-record concurrent edits and suspected duplicates require a user decision; unresolved items remain visible.
- Authentication includes sign-up, sign-in, password reset, sign-out, loading, invalid-credential, and offline states.
- Destructive data actions require explicit confirmation and clearly state their local/cloud impact before confirmation.
- Empty states lead to the next relevant action: add a transaction, create a budget, or select a reporting period.

## Analytics and privacy

Track dashboard/report views, transaction and budget creation, transaction filtering, sync-account intent/completion, and CSV-export/upgrade interest.

Never send transaction amounts, descriptions, categories, or other financial contents to analytics.

## Acceptance checks

- Transaction CRUD, filtering, category management, budget calculations, and reports work across web, iOS, and Android.
- Base-currency conversion covers current, cached, and unavailable-rate states with correct rounding and original-currency display.
- Anonymous use, account creation/sign-in, local-to-cloud merge, user-resolved sync conflicts, password recovery, sign-out, and offline recovery are represented and testable.
- Empty, loading, invalid-input, destructive-confirmation, and Pro-preview states are present.
- Money validation, currency precision, category deletion reassignment, UUID seeding, and budget uniqueness follow the domain model.
- Analytics events fire once per intended action and contain no sensitive financial data.

## Out of scope for v1

- Bank connections or transaction imports.
- Financial-account balances, source/destination details, and transfers.
- Shared household finances.
- Investments, loans, debt tracking, or financial advice.
- CSV download, payments, and subscription enforcement.
- Pre-populated demo data and demo-data reset.
