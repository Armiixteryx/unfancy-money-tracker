# Product concepts

Visual concepts for the core user stories in Unfancy Money Tracker. Each story is explored as a mobile and browser experience before implementation.

The cross-screen consistency pass is documented in [system-review.md](system-review.md).

## Concept checklist

### Completed

- [x] Dashboard overview — mobile and browser
  - [Dashboard overview concept](dashboard-overview-mobile-browser.png)
  - [Core surfaces overview board](core-surfaces-overview-board.png)
  - Story: View current-month income, expenses, remaining budget, recent transactions, and spending by category.

- [x] Transactions — mobile and browser
  - [Transactions concept](transactions-mobile-browser.png)
  - Browse, search, filter, inspect, add, edit, and delete transactions.
- [x] Transaction form — mobile and browser
  - [Transaction form concept](transaction-form-mobile-browser.png)
  - [Final split-pane concept](transaction-form-split-pane-mobile-browser.png)
  - Capture amount, income/expense type, category, description, date, and currency.
  - Desktop interaction: persistent split-pane detail workspace; mobile interaction: full-screen form.
- [x] Budgets — mobile and browser
  - [Budgets concept](budgets-mobile-browser.png)
  - Create monthly category budgets and review progress or overspending.
- [x] Reports — mobile and browser
  - [Reports concept](reports-mobile-browser.png)
  - Review monthly spending trends, category breakdowns, and factual insights.
- [x] Categories — mobile and browser
  - [Categories concept](categories-mobile-browser.png)
  - Create, rename, archive, and delete categories; deleted categories reassign records to protected Uncategorized.
- [x] Settings — mobile and browser
  - [Settings concept](settings-mobile-browser.png)
  - Change currency and theme, manage local data, and view sync status.
- [x] Local-first and sync onboarding — mobile and browser
  - [Sync onboarding concept](sync-onboarding-mobile-browser.png)
  - Continue anonymously, create an email/password account, and resolve first-sync conflicts.
- [x] CSV Pro preview — mobile and browser
  - [CSV Pro preview concept](csv-pro-preview-mobile-browser.png)
  - Show the paid-feature CTA without implementing export or payment.
- [x] Empty, loading, offline, validation, and conflict states
  - [Cross-cutting states concept](cross-cutting-states-mobile-browser.png)
  - Cover the cross-cutting states for every core surface.

## Story represented by the dashboard concept

> As a user, I want to view my current-month income, expenses, remaining budget, recent transactions, and spending by category, so I can quickly understand how I’m doing financially.

Status: concept set complete. See [system review](system-review.md) for cross-screen corrections to apply before implementation.
