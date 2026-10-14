# Editorial redesign

## Accepted direction

Refresh every product screen on web, iOS, and Android using the [Monarch Refero reference](https://styles.refero.design/style/a9dd8050-c03a-4901-b7fa-a9cc0ca54812). Retain Unfancy’s navy and emerald identity. Apply the same layout, typography, and control language to light and dark modes.

Use local Fraunces Regular for page and section headings and Inter Regular/Medium/Semibold for body copy, labels, inputs, navigation, and financial amounts. Financial amounts use tabular numerals. Typography hierarchy comes from size and spacing rather than heavy weights. Page titles are 32px on mobile and 40px on desktop; section headings are 24px.

Light mode uses Linen `#EFECEA`, white cards, Stone `#DCD9D6` borders, navy `#102A43`, and emerald `#0F7A3A`. Dark mode retains navy surfaces and warm text, with emerald `#4BC87A` primary actions. Coral is reserved for errors and overspending. Charts use emerald. Controls are pills, cards have 12px corners, and inputs have 8px corners. Existing 48px control geometry is a design choice rather than an accessibility acceptance requirement.

## Screen composition

- Web navigation uses a 288px left rail at 1024px, providing room for the approved 240px horizontal logo and its clear space. Narrow web and all native platforms, including tablets, retain bottom tabs with the same five labels.
- Web Transactions and Budgets use a list/form workspace at 1200px. Smaller web widths and all native screens use full-screen forms, safe areas, and keyboard avoidance. Form columns are centered and capped at 560px so native tablets retain readable, restrained controls.
- Dashboard prioritizes remaining budget by original currency. Its existing calculation is the sum of the month’s category limits minus the month’s expenses in that currency. Income does not consume the limit. Include currencies with budgets but no transactions. A missing limit is a labeled state with a create-budget action, not a zero remaining figure.
- Converted income and expense snapshots remain supporting information. Missing conversion rates hide combined totals; stale rates and refresh errors remain explicit. No new combined budget calculation is introduced.
- Search, filters, month/period controls, category progress, descriptive reports, and settings retain their existing capabilities. Authentication, voice controls, notices, destructive confirmations, hydration, and recovery share the design system.

## Approved brand alignment

Accepted October 14, 2026: use the supplied U + treasure identity from the [brand kit](../../artifacts/brand-kit/usage-guide.md) in navigation, authentication, and loading. Logo lettering remains the outlined Inter wordmark; Fraunces is reserved for interface headings. Light surfaces use the supplied full-colour lockup; dark mode uses the approved reverse lockup on its navy field. The logo's navy, cream, and gold do not follow semantic action colours.

Keep the horizontal artwork at 240px wide with its supplied proportions and clear space. A narrower container uses the approved 48px square icon instead of shrinking the descriptor. Native and narrow-web Settings show one brand anchor below the page heading; screens with a web rail do not duplicate it. Dashboard content retains priority in the first viewport.

Selected filters, periods, categories, currencies, and preferences use subtle emerald fills with emerald text and borders in both themes. Filled primary actions remain navy in light mode and emerald in dark mode. Shared-tracker panels and dialogs follow the same heading, card, input, and pill-control tokens as the rest of the app.

Web includes the product title, SVG favicon, Apple touch icon, and standalone manifest metadata. Production uses the approved clean icon set, while other environments use DEV artwork throughout the browser/install set. This supplies install metadata without adding a service worker or offline caching. Native tablets retain portrait orientation, full-screen forms, safe areas, and keyboard avoidance regardless of width.

## Current validation priority

Accessibility-specific acceptance and certification are deferred under ADR 0026. Visual legibility and ordinary interaction checks remain in scope.

## Boundaries

This is a presentation change. Financial storage schemas, voice and authentication contracts, consent, analytics redaction, local recovery, currency precision, and reporting period rules are retained. New copy is translated in English and Spanish. Existing concept images document the previous style and are not the current visual source of truth.
