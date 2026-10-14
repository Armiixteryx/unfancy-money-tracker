# ADR 0022: Editorial design system

## Status

Accepted.

Accessibility-specific requirements and release checks are superseded by [ADR 0026](0026-deferred-accessibility-requirements.md), accepted October 12, 2026. Other decisions remain in effect.

## Context

The product is adopting an editorial interface inspired by Monarch’s Refero style reference while retaining its navy and emerald identity. Colors were already semantic and theme-aware, but typography, shape, and responsive thresholds varied between screens. Width-only form checks could render a desktop workspace on a native tablet.

## Decision

Retain the Expo, React Native, NativeWind, and semantic theme boundaries. Define shared typed typography and layout tokens and small text, input, button, card, and status components. Existing feature components remain focused on their own behavior.

Bundle Fraunces Regular and Inter Regular/Medium/Semibold TTF assets locally and load them through the installed Expo Font library. Expose font readiness through a presentation context. Use an explicit font family per weight, rather than native synthetic font weights. If fonts cannot load, render system fonts and continue application initialization. Font loading never changes dataset initialization or recovery.

Extend the runtime theme to provide inherited text color independently of feature state. Preserve both palettes’ semantic contract and System/Light/Dark preference resolution. Light mode uses warm linen and white surfaces; dark mode retains navy surfaces. Use navy light-mode primary actions, accessible emerald dark-mode primary actions, emerald positive/selection states, and coral destructive states.

Use centralized, platform-aware thresholds: web rail at 1024px and web list/form workspace at 1200px. Native forms remain full-screen regardless of device width. Include safe areas and keyboard avoidance. Keep the content workspace centered within 1200px, independently of the rail.

### Brand alignment extension — October 14, 2026

Use the approved U + treasure kit as the identity source of truth. Bundle its existing PNG lockups and square icon through React Native Image, without a runtime graphics dependency or remote fetch. The light full-colour and dark reverse treatments retain their fixed brand colours; semantic palette resolution applies to UI controls rather than recolouring the logo. Outlined Inter logo lettering is independent of Fraunces interface headings.

The web rail is 288px wide so the 240px horizontal lockup and its clear space fit. Keep the existing 1024px rail and 1200px workspace thresholds. The shared brand component measures its container and falls back to a 48px approved square icon below the horizontal minimum, including narrow authentication cards. Native tablets keep bottom navigation and full-screen forms regardless of width; center form columns with a 560px maximum. Add one Settings identity anchor directly below the heading on native and narrow web, before tracker controls; omit it when the web rail already displays the logo.

Centralize emerald selected-control styles independently of filled primary-action colours. Bring inconsistent Account/shared-tracker panels and dialogs onto the existing typography and geometry tokens without changing their permissions, consent, async lifecycle, or confirmation behavior.

Publish checked-in, reproducibly generated browser assets under separate production/development paths and select HTML metadata using the existing `EXPO_PUBLIC_ENV=prod` gate. Production PNGs remain byte-for-byte copies of approved exports. DEV touch/install icons derive from the approved DEV SVG, with navy padding for maskable safe areas. Use distinct stable manifest IDs, root start URL/scope, and standalone display; no service worker or background/offline data capability is introduced. Normal builds require no image-generation tooling.

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
- Verify logo fit/resizing, both themes, phone/tablet layouts, and clean-versus-DEV metadata and exported assets. Use synthetic records and preserve existing datasets during visual checks.
