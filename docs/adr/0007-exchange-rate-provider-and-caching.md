# ADR 0007: Exchange-rate provider and caching

## Status

Accepted.

## Context

Transactions preserve their original amount and currency, while dashboard, budget, and report views need comparable values in the user’s base currency. ADR 0002 established live rates and stale-cache behavior but left the provider, supported currency scope, refresh cadence, and historical-report semantics undefined.

## Decision

### Provider and supported currencies

Standardize v1 on Frankfurter’s exchange-rate API using the default blended feed (no provider filter). Frankfurter provides daily rates, historical and time-series queries, currency metadata, and does not require an API key. The app performs conversion locally with `decimal.js`; it does not use a provider conversion endpoint. See the [Frankfurter API documentation](https://frankfurter.dev/).

Define an `ExchangeRateProvider` adapter so the source can be replaced without changing domain calculations.

V1 supports this curated ISO 4217 currency set:

`USD, EUR, GBP, CAD, AUD, JPY, CHF, CNY, BRL, MXN, COP, CLP, PEN, ARS, UYU, VES`

Exclude crypto, metals, legacy currencies, and unsupported codes from transaction and base-currency selectors.

### Rate records and cache

Represent a cached rate with its base currency, quote currency, decimal rate, effective rate date, fetched timestamp, and provider identifier. Provider identifiers are `frankfurter-blended | same-currency`; pre-cutover responses are rejected.

The rates Lambda uses a dedicated regional DynamoDB Standard table in `us-east-1`, with on-demand billing, strongly consistent GetItem reads, and GetItem/PutItem permissions limited to that table. Keys include base, quote, and either latest or the **requested** historical date. Keep the actual effective date and original upstream fetch timestamp in each validated record. No indexes, TTL deletion, backups, streams, or replication are configured.

Latest and historical records are fresh for strictly less than 24 hours after their original fetch. At exactly 24 hours, refresh upstream. Reads never renew timestamps; expired records remain indefinitely for stale fallback. Failed refresh returns an available record with `stale` status. Malformed/incompatible cache entries are misses, and cache read/write failures never prevent valid upstream results from being returned. A bounded ten-day prior-date search handles absent weekend/holiday observations.

The client uses the shared `/rates` endpoint and retains a separately validated device/browser rate cache for offline fallback. Query freshness follows the original fetched timestamp rather than time of cache reuse. The development cutover has no compatibility transition: native rate-only MMKV is cleared once using a marker; the web rate-only IndexedDB upgrades from version 1 to 2 and clears its rate store once. Financial records, preferences, authentication, and recovery storage are untouched.

Refresh rates on app launch, app focus, and reconnect when the cached rate is older than 24 hours. A manual retry action is available after provider errors.

Display the effective rate date, fetched age, and one of these statuses: `loading`, `fresh`, `stale`, `unavailable`, or `error`. Keep a stale cached rate visible indefinitely until it is replaced. Show an aggregate as unavailable only when no usable rate exists.

### Conversion semantics

Current dashboard and budget aggregates use the latest available rate. Historical reports use the rate published on each transaction date. When no rate exists on that date because of a weekend or holiday, use the nearest prior published rate and display its actual effective date.

If no prior rate exists, preserve the original-currency values and mark the combined aggregate unavailable. Same-currency conversion always uses a rate of `1` without a provider request.

Preserve original transaction amounts and currencies. Perform conversion and aggregation with `decimal.js`, and apply the half-up rounding defined by ADR 0003 only at target-currency output precision.

## Consequences

- Current and historical views have explicit, explainable rate semantics.
- Reports require historical rate lookups and effective-date metadata in addition to latest-rate caching.
- The curated currency list keeps the UI and currency metadata manageable for v1.
- A provider outage can leave users with stale but clearly labeled aggregates; missing conversions remain unavailable rather than misleading.
- The provider adapter, cache, and rate-status UI are required before multi-currency aggregates can ship.

## Validation

- Provider responses, malformed payloads, unsupported currencies, HTTP errors, timeouts, and rate-limit failures.
- Launch, focus, and reconnect refresh behavior at the 24-hour cache boundary.
- Fresh, stale, unavailable, and error cache states.
- Latest-rate conversion for dashboard and budgets versus transaction-date conversion for reports.
- Weekend and holiday fallback to the nearest prior published rate.
- Missing historical-rate behavior and same-currency conversion.
- Base/quote/requested-date cache isolation, shared reuse, and reload persistence.
- Exact 24-hour expiration for latest and historical rates, stale fallback, malformed entries, and cache read/write failures.
- Pre-cutover response rejection and one-time rate-only cleanup.
- All curated currencies against USD, including COP/VES.
- Currency selector enforcement for the curated ISO list.
- Decimal precision, half-up rounding, and absence of floating-point arithmetic.
- No provider credentials, transaction amounts, descriptions, or categories appear in logs or analytics.
