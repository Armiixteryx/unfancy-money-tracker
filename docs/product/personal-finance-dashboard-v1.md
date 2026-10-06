# Unfancy Money Tracker — V1 Product Definition

## Product summary

Build a polished, cross-platform finance tracker for individuals who want one clear view of their income, expenses, budgets, and spending.

Users enter transactions manually or optionally record a single expense by voice. Voice audio is processed remotely by Vercel/SpaceXAI, and its parser-derived description plus active expense-category choices are classified by Cloudflare; completed transactions persist locally, with separate opt-in cloud synchronization. V1 does **not** model bank, cash, credit, or savings accounts; transactions have no source/destination fields and transfers are out of scope.

The app supports optional email/password Cognito login. One encrypted local dataset remains shared across guest and signed-in use. Sign-in enables voice independently; a separate Settings action enables sync for one personal cloud dataset across devices. Sync uploads financial records and currency preferences to PostgreSQL on RDS, while device language, theme, analytics consent, and first-run notice choices remain local. Optional voice processing sends recordings and derived text/category choices remotely.

## Product decisions

| Decision | V1 choice |
| --- | --- |
| Target user | General individual tracking income, expenses, and monthly budgets |
| Financial model | One consolidated view; no financial accounts or transfers |
| Transaction fields | Positive amount, income/expense type, category, description, date, currency |
| Categories | Fixed-slug system and UUIDv7 custom income and expense categories; protected system defaults plus custom create, rename, archive, and delete |
| Budgets | One expense-category budget per calendar month; no rollover |
| Currency | Preserve original currency; store canonical decimal amounts; use latest rates for current aggregates and transaction-date rates for historical reports |
| Localization | Bundled English and neutral Latin American Spanish; System / English / Español selection, default System; device region independently controls money and date formatting |
| Data and identity | Optional login for voice and separately enabled sync; one shared local dataset; one canonical cloud dataset per login |
| Insights | Descriptive reporting only; no financial advice |
| Monetization experiment | CSV export is a non-functional Pro-feature preview; record CTA interest without payment or export |
| First-run safety notice | Show a dismissible warning on first launch that this is not a serious application and must not be used to store real data |

## Personas

### Primary persona — General individual tracker

Someone seeking an understandable monthly picture of income, expenses, category spending, and budget progress, without bank connection or account-reconciliation complexity.

### Portfolio objective

The product should demonstrate thoughtful product, design, and engineering practice through useful empty states, privacy-conscious analytics, complete edge states, clear tradeoffs, and responsive UI. This is an evaluation objective, not a user persona.

## Core user stories

- View current-month income, expenses, remaining budget, recent transactions, and category spending.
- Add, edit, delete, search, and filter income and expense transactions.
- Hold to record one expense in Spanish or English, or use accessible start/stop controls; review the saved result and edit it immediately.
- Use protected system income and expense categories; create, rename, archive, or delete custom categories.
- Create monthly category budgets and monitor progress or overspending.
- Review monthly trends and category breakdowns.
- Change base currency, theme, and UI language, and inspect exchange-rate freshness.
- Use the tracker anonymously with local persistence from the first launch.
- Open the CSV export CTA and see a Pro-feature preview.

## Information architecture

Primary navigation:

1. Dashboard
2. Transactions
3. Budgets
4. Reports
5. Settings

The same five labels are used on mobile bottom navigation and the browser left rail. Category management is a Settings sub-area; it is not a sixth primary route. Export is also a Settings sub-area.

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

- Base currency, theme, and System / English / Español language preference.
- Choose a non-empty set of desired currencies for new transaction and budget forms; the base currency is always included.
- Category management.
- Exchange-rate status.
- Local-data and privacy controls.

### Shared UI rules

- Use the working product name **Unfancy Money Tracker** in product UI; generated concept placeholder names are not part of scope.
- Use the labels Dashboard, Transactions, Budgets, Reports, and Settings consistently across platforms.
- Browser Transactions uses a persistent split-pane workspace; mobile uses a full-screen transaction form.
- Conflict resolution is a compact modal or detail panel over visible product context, not a full-viewport takeover.

## UI direction

Use a warm editorial fintech system inspired by the Monarch Refero style reference, retaining Unfancy’s navy and emerald identity. Light mode uses a linen canvas, white cards, and warm gray hairline borders; dark mode uses navy surfaces and high-contrast warm text. Use Fraunces Regular for page and section headings, Inter for UI copy and tabular financial amounts, pill controls, 12px card corners, 8px input corners, and restrained elevation. Navy is the light-mode primary action; emerald supplies selection, positive states, charts, and the accessible dark-mode primary action. Coral indicates errors and overspending. See [editorial redesign](editorial-redesign.md) and ADR 0021.

### Mobile

- Bottom tabs: Dashboard, Transactions, Budgets, Reports, Settings.
- Dashboard answers “How am I doing this month?” in the first viewport: remaining budget is primary; income and expenses are supporting metrics. Remaining budget retains the existing monthly limits minus monthly expense calculation per original currency, includes budget-only currencies, and is not presented as a combined converted total. Without a limit, show “No budget set” with a create-budget action.
- Show recent activity, category spending, and only the most relevant budget attention below the summary.
- Keep the add-transaction action persistently easy to reach.

### Browser

- Compact left navigation from 1024px and a header action for adding a transaction. Below that width, use bottom tabs.
- Preserve dashboard hierarchy while using the wider layout for a side-by-side spending trend, category breakdown, recent activity, and budget attention.
- Do not duplicate mobile navigation patterns merely to fill space.
- Use a persistent split-pane workspace for Transactions: the list remains visible while the selected transaction or new-transaction form occupies the detail pane. Web from 1200px uses the split pane. Smaller browser widths and all native sizes use a full-screen form.

## Product rules and edge cases

- Transaction amount must be positive. Required fields are type, amount, category, description, date, and currency.
- Archived categories cannot be selected for new transactions, but remain visible on historic transactions and reports.
- System categories use fixed `${kind}-${defaultCategoryKey}` slugs shared across datasets and cannot be renamed, archived, or deleted. Income has Income and Uncategorized; expenses have Food, Housing, Transport, Shopping, Utilities, Entertainment, Health, Education, Subscriptions, and Uncategorized.
- Deleting a custom or legacy user-managed category moves its transactions and budgets to the matching income/expense Uncategorized category and records a deletion tombstone. Deleted defaults from older datasets are not silently reseeded.
- Transactions retain the category ID rather than a category-name snapshot, so renames update historical labels and reports.
- Transaction amounts are canonical decimal strings, dates use `YYYY-MM-DD`, and converted aggregates use half-up rounding at the target currency’s ISO precision.
- Income never consumes a category budget.
- Budgets apply only to expense transactions inside their selected calendar month, do not roll over, and may be exceeded.
- Keep original transaction amount/currency for display. Convert dashboard and budget aggregates using the latest available rate; convert historical reports using the rate published on each transaction date.
- Rates use Frankfurter’s blended feed through a shared backend cache; latest and historical lookups refresh after 24 hours. The PostgreSQL development cutover explicitly resets old cloud storage and requires a confirmed local record reset before uploading historical non-v7 records. Hydration itself preserves records and migration backups.
- Display rate freshness. When current rates cannot load, use cached rates with a visible stale notice. When no rate is available, show original-currency figures and explain why a combined total is unavailable.
- Local data and pending changes persist across login/logout. Sync uploads only after a separate opt-in. Reconnecting the same login resumes; connecting another login requires a confirmed local reset.
- Local reset clears local records, pending edits, and the sync binding while leaving cloud records intact. The app has no cloud-reset action.
- Destructive data actions require explicit confirmation and clearly state their local/cloud impact before confirmation.
- Empty states lead to the next relevant action: add a transaction, create a budget, or select a reporting period.

## Localization and regional entry

English and neutral Latin American Spanish ship with the app and work offline. System selects the first supported preferred device language, with English fallback. Language switches immediately without restarting navigation, clearing form drafts, or restarting voice operations; the browser document language follows the UI. Device regional conventions control number, money, calendar-date, month, and timestamp display independently of UI language. Money displays explicit currency codes and preserves exact decimal precision.

System categories use stable semantic keys and the bundled English/Spanish labels as language aliases at presentation boundaries, while retaining fixed system slugs and stored English names. Custom, renamed, and unidentifiable legacy names remain unchanged. Voice sends resolved active category names with the existing category IDs and marks only expense Uncategorized as the fallback, independently of system protection. No additional synonym lists or category-name search are included.

Amount entry accepts ASCII and device-localized digits with the device decimal separator, without grouping separators. Grouped/mixed/wrong separators, exponent notation, nonpositive amounts, and excess currency precision produce translated errors with regional examples. A mounted form keeps its amount-entry region until it closes; UI language changes update labels and feedback immediately. Transaction dates and budget months retain ISO text entry with translated labels and instructions. Displayed date-only records cannot shift across timezones; timestamps follow device timezone. Gregorian financial periods and all calculations remain unchanged.

Only the chosen language preference persists. Schema 6 introduced System for older datasets. Schema 7 promotes existing defaults identified by semantic keys to protected, active system categories, including archived keyed defaults. Existing protected Uncategorized categories receive their semantic key if absent. Renamed and unidentifiable legacy categories remain user-managed; migration never infers provenance from names, reseeds deleted defaults, or discards records. UUIDs, references, preferences, tombstones, and migration/recovery backups are preserved. A successful local reset returns language to System; unreadable-preference recovery uses device language. Language choice introduces no analytics events or properties. App-owned iOS microphone permission text is localized; OS-owned dialogs retain system language behavior. See ADR 0018 for implementation and translation maintenance.

## Analytics and privacy

Analytics is opt-in and disabled by default. After an explicit choice, the consent preference remains in the local dataset. Analytics uses a random anonymous distinct ID and never identifies a person or account.

Track dashboard/report views, transaction and budget creation, transaction filtering, and CSV-export/upgrade interest.

Use automatic capture and masked session replay with strict redaction. Mask all user-entered text and financial values, including amounts, descriptions, categories, dates, chart values, and transaction rows. Opting out stops future capture and flushes already queued analytics events.

Allowed event properties are limited to platform, app version, surface, action result, and generic error code. Never send transaction amounts, descriptions, categories, dates, currencies, transaction IDs, email addresses, credentials, tokens, provider error bodies, or other financial contents to analytics, replay, logs, or error reports.

## Acceptance checks

- Transaction CRUD, filtering, category management, budget calculations, and reports work across web, iOS, and Android.
- Base-currency conversion covers current, cached, unavailable-rate, latest-current-aggregate, and transaction-date historical-report states with correct rounding and original-currency display.
- Anonymous local use, persistence, migration, recovery, and local reset are represented and testable.
- Empty, loading, invalid-input, destructive-confirmation, and Pro-preview states are present.
- Money validation, currency precision, category deletion reassignment, UUIDv7 creation and fixed system-slug seeding, and budget uniqueness follow the domain model.
- Analytics is consent-gated, events fire once per intended action, replay is masked, and no sensitive financial data is collected.

## Out of scope for v1

- Bank connections or transaction imports.
- Financial-account balances, source/destination details, and transfers.
- Shared household finances.
- Investments, loans, debt tracking, or financial advice.
- CSV download, payments, and subscription enforcement.
- Pre-populated end-user demo data and demo-data reset. Development-only local fixture tooling is documented separately and is not product UI.

## Voice expense entry

Dashboard and Transactions offer optional remote voice entry with a clear processing notice. Manual entry and navigation remain usable during processing. The microphone is permission-gated, interrupted recordings are canceled, release submits, and a 15-second limit stops and submits automatically. Only one voice operation runs at a time. Submission has a 30-second deadline including upload and no automatic retry.

Say a description, positive amount, and currency for one expense. Initially supported currencies are COP (pesos), USD (dollars/dólares), and VES (bolívares). Unsupported or ambiguous phrases ask the user to record again or enter manually. Categories include current active default/custom expense categories and protected Uncategorized; built-in category matching uses the bundled English and Spanish names for each unchanged category ID, regardless of UI language. Custom and unidentifiable legacy category names remain unchanged. Uncertain classification uses Uncategorized. Category changes during processing are revalidated locally. TODO: extend voice currency support and resolve general currency ambiguity.

After persistence succeeds, show category, description, original amount/currency, and Edit in an eight-second snackbar, paused on hover or keyboard focus. Edit opens the existing mobile form or browser pane. Failed writes retain the record identity and offer local save retry without repeating transcription or creating duplicates. Reset/replacement invalidates pending responses. Temporary recordings are deleted; application logs, analytics and replay exclude voice and financial contents. Provider retention is subject to Vercel/upstream and Cloudflare policies; Zero Data Retention is not promised. See ADR 0017 for details. Production deployment was authorized October 5, 2026; rollout evidence is recorded in the PostgreSQL runbook.

### Voice deployment and optional identity boundary

Voice endpoint selection supports local (default), AWS dev, and the explicitly configured production target. Dev/prod require HTTPS; invalid or missing selected configuration fails without switching services. The AWS dev backend is deployed in `us-east-1` as of October 3, 2026. Authenticated routing, anonymous rejection, CORS, malformed-input handling, Lambda readiness, and configured throttling are verified. Live synthetic recognition validation is incomplete and includes strict-match failures; Amplify main targets the production backend following the owner-authorized October 5, 2026 rollout; the user will perform further recognition tests. Voice requires a Cognito access token issued by the configured pool/client.

Optional Cognito sign-in enables remote voice independently and does not restrict manual tracking or upload records by itself. Sync requires a separate Settings opt-in and binds the local sync metadata to the authenticated cloud dataset. Session expiry must preserve manual entry and must not automatically resubmit audio. New installations show login with Skip login before dataset creation. Existing snapshots or recovery data bypass the introduction. The independent introduction marker survives local reset, recovery, and fixture replacement. Settings offers Account, identity, login, and sign-out. Guests retain all manual features and exchange rates; voice offers Sign in to use voice. Login returns to the originating screen and requires a fresh recording. Registration, email confirmation/resend, and password recovery/reset support English and Spanish. Passwords require 12 characters with uppercase, lowercase, a number, and a symbol; email spelling is preserved. Credentials stay outside financial data and Zustand, in dedicated encrypted native MMKV with a SecureStore key or host-only strict secure web cookies (HTTP only on loopback). Sign-out cancels recording and processing while preserving completed records and local-save retries. Social login, MFA enrollment, and account deletion remain deferred. See ADR 0020. See ADR 0017.

## Restored opt-in synchronization

Settings explains the upload before sync is enabled. Empty cloud uploads immediately after opt-in. Existing cloud offers Merge or Replace local data. Merge preserves distinct transactions/custom categories, shares system slugs, and requires manual choices for competing category/month budgets even with different IDs. Same-ID concurrent edits and deletion versus edit are manual conflicts with both versions, device edit timestamps, and server commit time shown in a compact modal. Resolution uses the observed server revision and can return another conflict.

Replacement requires confirmation that local records and pending edits will be discarded. Download and validate the complete cloud snapshot before replacing durable storage. Language, theme, analytics consent, and first-run notice state remain local during merge/replacement. Schema 8 adds a durable sync binding, outbox, revisions, paginated pull cursor, conflicts, and last-sync time; credentials stay outside financial persistence. Old snapshots are backed up and preserved; built-in IDs/references become fixed slugs. The development reset is explicit, never a hydration side effect.

Sync follows successful local saves, launch, foreground, reconnect, and Sync now. There is no polling or background-task requirement. Unsent edits coalesce while retaining the original base revision. Submitted mutations freeze until acknowledgment; edits during requests remain separate pending work. Push acknowledgments never advance the pull cursor. Server revisions, not device clocks, order commits. Transient failures retry with bounded backoff; auth failure pauses automatic sync and retains pending data. Settings exposes pending counts, last sync, offline/error/auth states, conflicts, and manual retry. Logout stops sync without deleting local records/outbox. Reset, replacement, and auth changes cancel stale sync and voice responses.

AWS keeps Cognito/access-token authentication and API resource identities. Portable normalized PostgreSQL 18.6 replaces DynamoDB, with plain parameterized SQL through `pg`, Flyway Community 13.9.0 migrations, immutable changes/tombstones/acknowledgments, and explicit decimal-string/date serialization. Private sync/cache/migration workers use separate roles, verified TLS, a Secrets Manager endpoint, bounded concurrency, and encrypted storage. Development uses the user-approved one-day automated backup window accepted by AWS after its seven-day setting was rejected; production also retains one-day backups under the owner-approved October 5, 2026 account-plan exception. The internet-connected rate API uses an IAM-invoked private PostgreSQL cache worker, preserving rate freshness/fallback behavior without NAT. Production deployment was authorized October 5, 2026; rollout evidence is recorded in the PostgreSQL runbook. ADR 0021 and the PostgreSQL runbook govern staged rollout and portability.
