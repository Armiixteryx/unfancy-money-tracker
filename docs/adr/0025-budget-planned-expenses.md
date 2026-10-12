# ADR 0025: Reusable planned expenses within monthly budgets

## Status

Accepted October 8, 2026. Extends ADRs 0003, 0004, 0005, 0021, and 0024. The owner approved the plan and mobile/browser concepts before implementation.

## Context

Monthly category limits need an editable list of expected expenses without treating a plan as actual spending. Items may use different currencies and should be reusable when copying a budget or recording an expense.

## Decision

Each budget may contain an ordered list of planned expenses with a UUIDv7 identity, required description of up to 200 characters, positive canonical amount, and original currency. The budget supplies the category; items have no date, completion state, or transaction link. The limit remains independently editable. Editing the budget currency never converts stored item amounts.

Display original amounts and an aggregate converted into the budget currency using latest exchange rates and the existing decimal/half-up rules. Show freshness and visibly stale cached rates. With a missing rate, display original-currency totals and withhold the combined total and unallocated/over-limit comparison. Planned totals never affect actual spending, dashboard balances, or reports.

Record expense opens the existing transaction form for review with the item's description, amount, original currency, and budget category. Default the date to the device's local calendar day for the current month, otherwise the first day of the budget month. All fields remain editable. Saving creates a normal expense; the planned item stays reusable. There is no automatic creation, completion tracking, separate named template library, or built-in starter set.

Budget copying includes planned items with fresh UUIDv7 identities and preserves existing destination budgets under the existing skip rules. Admins manage shared planned lists; members can read them and create normal expenses. Archive, membership, lifecycle, local-save, and privacy boundaries continue to apply. Drafts and saves capture the originating tracker and never redirect after switching.

Local schema 10 extends schema 9 without discarding records or recovery backups. Submitted outbox entries and request hashes remain unchanged. Lists travel inside the existing budget sync record, with whole-budget revisions and manual conflicts. PostgreSQL stores ordered items in a normalized child table and writes them atomically with their parent. Budget deletion removes its planned items without deleting actual transactions; category reassignment retains the list.

For legacy mutations, omission of the list preserves the stored list; omission on a new budget means empty. An explicit empty array clears the list. Change history publishes the complete effective budget while retry hashing retains the original submitted content. Migration and compatible backend release precede clients through the existing staged deployment gates. This feature request does not itself request a cloud deployment.

## Consequences

Plans and actuals remain independent; recording repeatedly is allowed by design. Concurrent item edits resolve at the whole-budget level. Multi-currency planning requires rate availability to compare a plan against the limit. Older clients can still edit limits without silently deleting a list.

## Validation

Cover input precision and description validation, duplicate item identities, original-currency preservation, conversion rounding and missing/stale rates, item CRUD/copy, failed saves and retries, restart/recovery, unchanged submitted mutations, merge/replacement/conflicts, SQL atomicity, legacy omission/explicit clearing, shared permissions, and tracker invalidation. Validate the mobile/browser flow with synthetic data and record actual device evidence separately from builds and unit checks.
