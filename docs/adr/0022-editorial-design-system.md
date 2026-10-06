# ADR 0022: Editorial design system

## Status

Accepted.

## Context

The product is adopting an editorial interface inspired by Monarch’s Refero style reference while retaining its navy and emerald identity. Colors were already semantic and theme-aware, but typography, shape, and responsive thresholds varied between screens. Width-only form checks could render a desktop workspace on a native tablet.

## Decision

Retain the Expo, React Native, NativeWind, and semantic theme boundaries. Define shared typed typography and layout tokens and small text, input, button, card, and status components. Existing feature components remain focused on their own behavior.

Bundle Fraunces Regular and Inter Regular/Medium/Semibold TTF assets locally and load them through the installed Expo Font library. Expose font readiness through a presentation context. Use an explicit font family per weight, rather than native synthetic font weights. If fonts cannot load, render system fonts and continue application initialization. Font loading never changes dataset initialization or recovery.

Extend the runtime theme to provide inherited text color independently of feature state. Preserve both palettes’ semantic contract and System/Light/Dark preference resolution. Light mode uses warm linen and white surfaces; dark mode retains navy surfaces. Use navy light-mode primary actions, accessible emerald dark-mode primary actions, emerald positive/selection states, and coral destructive states.

Use centralized, platform-aware thresholds: web rail at 1024px and web list/form workspace at 1200px. Native forms remain full-screen regardless of device width. Include safe areas and keyboard avoidance. Keep the content workspace centered within 1200px, independently of the rail.

Dashboard remaining-budget presentation uses a feature-local selector over existing money helpers. Include the union of current-month transaction and budget currencies, retaining per-currency subtraction without introducing another conversion policy. New-transaction and new-budget CTAs use the existing forms through consumed route parameters.

## Consequences

- The redesign works offline without remote font services or a new styling framework.
- Shared components enforce font roles, theme colors, readable weights, and control geometry.
- Changes do not require a persisted-data migration or backend contract update.
- Native tablet navigation and forms remain consistent with the mobile product model.
- Historical visual concepts are retained with a pointer to the current product design.

## Validation

- Check palette contracts and AA contrast for canvas/card copy, primary/destructive actions, and subdued status surfaces.
- Test responsive thresholds and native tablet behavior.
- Test dashboard budget-only currencies, missing limits, income exclusion, overspending, and monthly isolation.
- Retain localization, transaction form, voice lifecycle, recovery, and category protection tests.
- Verify web compilation and prefer attached physical Android and Apple devices for native checks. Visual verification requires a working browser or desktop capture connection.
