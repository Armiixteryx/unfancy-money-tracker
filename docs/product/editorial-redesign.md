# Editorial redesign

## Accepted direction

Refresh every product screen on web, iOS, and Android using the [Monarch Refero reference](https://styles.refero.design/style/a9dd8050-c03a-4901-b7fa-a9cc0ca54812). Retain Unfancy’s navy and emerald identity. Apply the same layout, typography, and control language to light and dark modes.

Use local Fraunces Regular for page and section headings and Inter Regular/Medium/Semibold for body copy, labels, inputs, navigation, and financial amounts. Financial amounts use tabular numerals. Typography hierarchy comes from size and spacing rather than heavy weights. Page titles are 32px on mobile and 40px on desktop; section headings are 24px.

Light mode uses Linen `#EFECEA`, white cards, Stone `#DCD9D6` borders, navy `#102A43`, and emerald `#0F7A3A`. Dark mode retains navy surfaces and warm text, with accessible emerald `#4BC87A` primary actions. Coral is reserved for errors and overspending. Charts use emerald. Controls are pills, cards have 12px corners, and inputs have 8px corners. Minimum interactive targets are 48px.

## Screen composition

- Web navigation becomes a 232px left rail at 1024px. Narrow web and all native platforms retain bottom tabs with the same five labels.
- Web Transactions and Budgets use a list/form workspace at 1200px. Smaller web widths and all native screens use full-screen forms, safe areas, and keyboard avoidance.
- Dashboard prioritizes remaining budget by original currency. Its existing calculation is the sum of the month’s category limits minus the month’s expenses in that currency. Income does not consume the limit. Include currencies with budgets but no transactions. A missing limit is a labeled state with a create-budget action, not a zero remaining figure.
- Converted income and expense snapshots remain supporting information. Missing conversion rates hide combined totals; stale rates and refresh errors remain explicit. No new combined budget calculation is introduced.
- Search, filters, month/period controls, category progress, descriptive reports, and settings retain their existing capabilities. Authentication, voice controls, notices, destructive confirmations, hydration, and recovery share the design system.

## Boundaries

This is a presentation change. Financial storage schemas, voice and authentication contracts, consent, analytics redaction, local recovery, currency precision, and reporting period rules are retained. New copy is translated in English and Spanish. Existing concept images document the previous style and are not the current visual source of truth.
