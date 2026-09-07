# Concept system review

## Review purpose

Check that the individual concepts behave like one product before implementation: shared shell, visual language, responsive behavior, product boundaries, and connected user journeys.

## System decisions

### Product shell

- Working product name: **Unfancy Money Tracker**. Do not use the generated placeholder names Finora, FinTrack, or FinanceApp in product UI.
- Primary navigation is the same on mobile and browser: **Dashboard, Transactions, Budgets, Reports, Settings**.
- Mobile uses a five-item bottom navigation. Browser uses a left navigation rail.
- Use **Dashboard**, **Transactions**, **Budgets**, and **Reports** consistently; do not alternate with Overview, Activity, Plans, Home, Budget, or Insights.
- Category management is a Settings sub-area, not a sixth primary navigation item. Category pickers remain available from transaction and budget flows.
- Local data and privacy are Settings content. Export is a Settings/Data & privacy content area and is a Pro preview only.
- Do not show Accounts as a navigation item or feature; V1 has no financial-account model.

### Shared visual language

- Keep the warm neutral surface, midnight navy text, emerald positive state, coral attention state, muted blue information state, rounded cards, and accessible contrast.
- Use one icon style and one status vocabulary across all surfaces.
- Use factual, non-judgmental copy for overspending, conflicts, offline status, and validation.
- Treat amounts and charts as illustrative concept content only. V1 starts empty; concepts must not be read as a demo-data requirement.

### Responsive behavior

- Mobile prioritizes one task per screen and uses full-screen forms or sheets.
- Browser uses the wider canvas for comparison and detail. Transactions uses a persistent split-pane workspace with the list visible beside the detail/form pane.
- Conflict resolution is a compact modal or detail panel over visible product context; it must not cover the whole browser viewport.

## Findings

### Approved direction

- Dashboard hierarchy communicates current-month status quickly.
- Transactions supports search, filtering, row inspection, and direct editing.
- Budgets make category progress and overspending visible without punitive language.
- Reports combine trend, category breakdown, and descriptive observations.
- Settings exposes preference, local-data, exchange-rate, and privacy controls.
- Empty, loading, offline, validation, and conflict states have clear next actions.

### Corrections applied

- Navigation labels and icons now follow the five-item primary IA in the linked artwork.
- Placeholder branding and domains were replaced with Unfancy Money Tracker treatment.
- The Accounts item was removed from the CSV concept.
- Categories are represented as a Settings sub-area while category pickers remain available in transaction/budget flows.
- Settings artwork has no demo-data reset; empty-first behavior remains the product rule.
- Date, currency, amount, and category conventions were normalized across the linked artwork.

## Review outcome

The visual direction is coherent enough to begin implementation of the shared UI shell. The individual concepts remain reference artifacts, while the system decisions in this document and the product definition are the implementation source of truth.
