# ADR 0012: Runtime color themes

## Status

Accepted.

## Context

Unfancy Money Tracker persists a `system`, `light`, or `dark` appearance preference, but the interface currently renders one fixed light palette. Theme behavior must remain consistent across web, iOS, and Android without duplicating screens or storing platform-derived state.

## Decision

Define typed semantic light and dark color palettes at the shared UI boundary. Components consume the active palette through an application theme provider instead of importing fixed literal colors. The dark palette uses deep navy surfaces, warm high-contrast text, emerald positive states, coral negative states, and emerald accents rather than pure black. ADR 0021 extends this semantic contract with shared editorial typography, warm light neutrals, and component geometry.

Persist only the user's preference. Resolve `system` against the current platform color scheme at runtime and respond to operating-system scheme changes. Before local data hydration, during recovery, or when the platform reports no scheme, use the system scheme with light as the final fallback.

Apply the resolved theme to screen and navigation surfaces, status-bar content, native system background, and browser root color scheme. Theme changes are presentation-only and do not alter domain records, financial calculations, analytics payloads, or the sync contract.

Use dedicated semantic tokens for subdued success, error, information, warning, and promotional surfaces. Do not rely on color alone for financial or system status, and keep essential text and control states at WCAG AA contrast.

## Consequences

- The existing appearance selector becomes effective immediately and continues to persist through the preferences record.
- UI components create styles from the active semantic palette instead of module-level fixed colors.
- Adding or changing a theme requires a complete typed palette and cross-platform visual verification.
- The loading theme may change once an explicit persisted preference becomes available after hydration.

## Validation

- Unit-test explicit and system preference resolution, including the no-scheme fallback.
- Verify both palettes implement the same semantic token contract.
- Verify theme persistence and hydration without replacing `system` with a derived value.
- Check contrast, status bars, navigation, forms, charts, empty states, errors, destructive confirmations, and offline/sync states on web, iOS, and Android.
