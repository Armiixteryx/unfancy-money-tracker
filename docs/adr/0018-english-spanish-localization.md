# ADR 0018: Bundled English and Spanish localization

## Status

Accepted.

## Context

The same local finance dataset must be usable in English and neutral Latin American Spanish on Android, iOS, and web. UI language must not change financial calculations, stored decimal strings, calendar periods, category identity, or voice-operation identity. Regional conventions can differ from the selected UI language.

## Decision

- Use `i18next`, typed selectors, `react-i18next`, and Expo SDK 54's `expo-localization` 17.x. English and Spanish TypeScript catalogs ship with the app, grouped by feature, with English fallback and no translation-service requests. Interpolation and plural variants belong in catalogs; user descriptions and the product name are preserved.
- Settings offers System / English / Español. System is the default and resolves the first supported preferred device language, falling back to English. Persist only this preference, rather than the resolved language or regional conventions. The provider sits outside the hydration gate and changes language without keying or remounting navigation, forms, or voice operations. Refresh device preferences on foreground entry and browser `languagechange`; update the browser document language.
- Advance the local envelope from schema 5 to 6. Historical snapshots receive `preferences.language = "system"`. Existing migration backup, quarantine, recovery, and write-queue behavior remains in force. Malformed current language values and category keys fail boundary validation. Successful local reset creates a dataset with System. Recovery uses device language when a persisted preference cannot be read.
- Add optional `defaultCategoryKey` to categories. Newly seeded defaults carry stable semantic keys while retaining their UUIDs and stored English names. Migration marks only protected `isSystem` categories as Uncategorized; it never infers a default from a stored name. Resolve category labels at presentation/request boundaries. Custom and legacy non-system names stay unchanged. Rename clears the key, archive retains it, and deletion never triggers reseeding. Voice receives the resolved active category labels with their original IDs in the existing request contract; ADR 0017's remote boundaries remain unchanged.
- Keep region separate from UI language. Read device language/region and reported decimal/grouping separators; browser regional conventions follow its locale preferences. Fall back to `en-US` when unavailable. Financial periods remain Gregorian. Calendar-date display uses UTC calendar values to avoid timezone shifts; timestamps are formatted as instants in the device timezone.
- Format money by grouping exact integer strings with device conventions and separately localizing decimal digits. Bundle English/Spanish plural-rule support for Hermes, which lacks `Intl.PluralRules`; avoid unsupported `Intl.Locale`, `formatToParts`, and BigInt number-formatting APIs. Regional grouping, separators, and digits are inferred from safely representable numeric samples through `format`, then applied to exact financial strings. Never convert arbitrary financial strings through JavaScript `Number`. Always show the currency code and ISO currency precision. Domain reports return factual counts, currencies, months, and aggregates; their prose and labels are generated in presentation code.
- Keep amount drafts distinct from canonical decimal domain input. A mounted form captures its amount-entry region; label/error translations can still change immediately. Edit drafts are ungrouped and use the captured decimal separator. Submission normalizes localized digits and decimal separators before existing domain validation. Reject grouping, wrong/mixed separators, exponent notation, nonpositive amounts, and excess precision (including excess trailing zeros). Provide translated errors and regional examples. Dates and budget months keep ISO text entry (`YYYY-MM-DD`, `YYYY-MM`).
- Domain errors expose stable codes and typed parameters; store/client boundaries expose sanitized codes. Render errors at the point of presentation so already-visible feedback changes language. Unknown errors use a translated generic message; remote provider bodies remain hidden. Transient interpolated notices retain their parameters, rather than user-entered data becoming translation keys.
- Declare supported English/Spanish native locales through the Expo localization plugin and localize the app-owned iOS microphone explanation. Rebuild development clients after native configuration changes. OS-owned dialogs follow system language behavior. Language selection adds no analytics event or property.

## Consequences

Translations work offline and increase bundle size slightly. Existing non-system category names are deliberately preserved, even when they resemble defaults. A device locale change cannot reinterpret an open amount draft; a newly opened form uses the new region. Additional languages, hosted translation services, new date pickers, and deployment are outside this change.

## Translation maintenance

Add feature strings to `src/localization/catalogs/`; common interpolated notices and errors live beside those catalogs. Keep English/Spanish keys, interpolation names, and plural variants aligned. Use typed selectors at presentation boundaries. Add locale-independent facts to domain reports and compose translated sentences in the reporting UI. Never translate descriptions, custom category names, canonical persisted amounts, IDs, or analytics payloads.

Run `pnpm run typecheck`, `pnpm run lint`, and `pnpm test`. The localization tests cover catalog parity, interpolation/plurals, fallback, preferred-language resolution, exact regional amounts, localized digits, migrations, recovery, category provenance, persistence, and reset. Check both languages at narrow and desktop web widths and on native platforms. Use `pnpm run android` and `pnpm run start:all` (then Expo's `a`, `i`, and `w` shortcuts), following the repository's native development conventions.

References: [i18next TypeScript selectors](https://www.i18next.com/overview/typescript), [Expo SDK 54 localization](https://docs.expo.dev/versions/v54.0.0/sdk/localization/).
