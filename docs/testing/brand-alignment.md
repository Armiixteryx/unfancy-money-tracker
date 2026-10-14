# Brand alignment validation — October 14, 2026

Implemented the accepted brand alignment in the product definition, editorial redesign, and ADR 0022. Original approved artwork supplies the app identity; selection styles, panel geometry, responsive forms, and web install metadata now follow the kit.

## Automated validation

- `pnpm run typecheck` — passed.
- `pnpm run lint` — passed.
- `pnpm test` — 77 files, 485 tests passed.
- Production and development Expo web exports — passed. Checked one title per route and environment-specific SVG favicon, touch icon, and manifest on Dashboard, Transactions, Budgets, Reports, and Settings. All linked assets, including Expo's ICO fallback, returned successfully. Exported manifest icon bytes match checked-in assets.
- `git diff --check` — passed.

## Browser validation

Used an isolated local origin with synthetic records, without authentication or sync. Inspected English and Spanish, light and dark themes, narrow navigation, Settings identity placement, transaction validation, cancellation of destructive confirmation, reports, and desktop list/form layouts.

| Viewport | Evidence |
| --- | --- |
| Phone 320 px | [Transactions](artifacts/brand-alignment/phone-320-transactions-light.jpg), [Spanish dark Settings](artifacts/brand-alignment/phone-320-settings-spanish-dark.jpg) |
| Phone 390 px | [Dashboard](artifacts/brand-alignment/phone-390-dashboard-light.jpg), [dark Settings](artifacts/brand-alignment/phone-390-settings-dark.jpg) |
| Tablet browser 768 px | [Centered full-screen form](artifacts/brand-alignment/tablet-browser-768-form-light.jpg) |
| Desktop 1440 px | [Light Transactions](artifacts/brand-alignment/desktop-1440-transactions-light.jpg), [dark Transactions](artifacts/brand-alignment/desktop-1440-transactions-dark.jpg) |

Measured navigation at 1023/1024 px and workspace behavior at 1199/1200 px. The rail starts at 1024 px with width 288 px; the split workspace starts at 1200 px. Full-screen forms remain capped at 560 px. See [measurements](artifacts/brand-alignment/breakpoints.json).

The checks exposed and fixed intrinsic logo height expansion, clipped Spanish labels at 320 px, and squeezed transaction descriptions on narrow rows.

## Native builds and remaining visual coverage

Checked attached devices before native testing. The isolated E2E Android build succeeded and installed on the physical Galaxy A54 using `pnpm run android`. The isolated E2E iOS build succeeded and installed on the iPad 10th-generation simulator. Neither build modified the normal app's dataset.

Native visual review remains incomplete: the physical iPad was offline, Simulator activation failed, and neither Simulator nor the Android mirroring window was available through the UI automation surface. The tablet screenshot above is a browser viewport, not native-device evidence. Native navigation and Settings identity conditions are covered by automated tests. Offline/loading/recovery states were not separately exercised visually in this pass.
