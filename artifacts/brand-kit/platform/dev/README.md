# Non-production icon variant

`icon-ios-dev.svg` and `android-foreground-dev.svg` add a solid `#C63D3D` DEV
ribbon with cream `#F7F5F0` path-outlined lettering over the lower-right coin
area. The U remains clear and the badge sits inside the launcher safe area.
Matching 1024 × 1024 iOS and 432 × 432 Android PNG exports are supplied. Pair
the Android development foreground with the unchanged
`platform/android/background.svg`.

`android-monochrome-dev.svg` and its 432 × 432 PNG use an outlined DEV ribbon
with a knockout through the coin mark, so Android themed icons remain distinct
without introducing a fixed color. `favicon-dev.svg` is the source for the
48 × 48 non-production web favicon.

Use these files only for non-production builds. `app.config.ts` selects the
clean release artwork when `EXPO_PUBLIC_ENV=prod` and these DEV variants for all
other environments, including E2E. The clean release artwork under
`platform/ios/` and `platform/android/` is unchanged.

Refresh these assets and the presentation-board preview without rebuilding
approved production artwork:

```sh
python3 artifacts/brand-kit/scripts/build_brand_kit.py --dev-only
```
