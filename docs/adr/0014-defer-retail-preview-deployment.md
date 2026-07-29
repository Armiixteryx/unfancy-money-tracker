# ADR 0014: Defer retail preview deployment

## Status

Accepted

## Context

A resettable retail preview could later demonstrate the product without requiring live accounts or durable financial data. The earlier runtime fallback exposed an in-memory authentication adapter as `LOCAL PREVIEW`, but it did not provide durable users, provider-faithful sessions, or a trustworthy sync boundary.

Core anonymous tracking, persistence, Cognito authentication, cloud synchronization, conflict handling, and reliability take priority over a separate demonstration environment.

## Decision

Defer the retail preview build and deployment. Remove the accidental runtime fallback and preview label from the current application, but retain preview mode as a future architectural option rather than rejecting it.

A future preview must be explicitly selected at build or deployment time, isolated from development and production users and financial data, synthetic-only, resettable, and visibly identified as a demonstration. It must not present test authentication or simulated persistence as real cloud backup.

## Consequences

- Current implementation effort remains focused on core product behavior.
- Anonymous no-account mode remains a real product feature and is not the deferred preview.
- Test doubles remain available for automated tests without becoming runtime providers.
- A future preview requires a new decision covering hosting, reset behavior, synthetic accounts, analytics, data lifetime, and cost.

## Validation

- Current builds never display `LOCAL PREVIEW`.
- Missing cloud configuration does not activate test authentication or sync.
- Documentation distinguishes anonymous use from the deferred retail preview.
- Production and preview deployments cannot occur through the ordinary development deployment workflow.
