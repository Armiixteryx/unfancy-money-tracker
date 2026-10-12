# ADR 0026: Defer accessibility requirements

## Status

Accepted October 12, 2026 at the owner's request. Supersedes accessibility-specific requirements and validation in ADRs 0009, 0012, 0017, and 0022 and the previous agent-guide rule.

## Context

The owner has decided that accessibility will not be a project focus right now and requested that the current testing stop. Earlier guidance made accessible labels, focus behavior, semantic controls, target sizes, color-independent indicators, and contrast compliance part of acceptance.

## Decision

Remove accessibility as a V1 requirement and release gate. Do not require VoiceOver or other screen-reader testing, focus or semantic-label audits, accessibility target-size checks, or WCAG/AA certification to finish a feature. These checks may be reconsidered in a future explicit product decision.

Keep existing accessibility support and ordinary usability behavior; this decision does not request removing labels, controls, keyboard behavior, or existing tests from the implementation. Continue requiring legible financial information, functional controls, responsive layouts, validation, and complete loading, empty, offline, error, and destructive-confirmation states.

Stop the active device-test cycle. Preserve existing test evidence and clearly distinguish completed checks from interrupted checks. Clean up temporary test accounts and credentials without deleting user data or recordings.

## Consequences

Accessibility coverage and certification are not promised for V1. Features can finish without a dedicated accessibility audit. Historical ADRs and test records remain available with this superseding decision. No runtime, storage, permission, or financial behavior changes are required.

## Validation

Verify that the agent guide and current product definition describe the deferred priority, that relevant earlier decisions point to this record, and that interrupted test work and temporary account cleanup are reported accurately.
