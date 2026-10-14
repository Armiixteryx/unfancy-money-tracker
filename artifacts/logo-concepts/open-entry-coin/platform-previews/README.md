# Android and iOS icon previews

Illustrative mockups of the selected flat silver coin, not device screenshots
or a production icon release. Other home-screen apps are generic placeholders.
The app's current assets and Expo configuration remain unchanged.

## Output

- `android-preview.png`: home-screen example and three launcher-mask examples.
- `ios-preview.png`: home-screen example and square-source/system-mask comparison.
- `ios-square-study.png`: opaque 1024 × 1024 RGB source study.
- `android-foreground-study.svg`: transparent foreground on a 108 × 108 dp canvas.
- `android-background-study.svg`: opaque warm cream background on the same canvas.

The existing silver face `#D9DEE3`, navy mark/outline `#102A43`, and upright
coin geometry are preserved. Warm cream `#F7F5F0` is the proposed icon background.

## Platform rules used

### Android

Official guide: https://developer.android.com/develop/ui/compose/system/icon_design_adaptive

Verified the official page through a direct HTTP read after the fetch tool
encountered an authentication redirect. Its requirements include separate
foreground/background layers, 108 × 108 dp layer canvases, and essential artwork
between 48 and 66 dp in the protected center. This study uses a centered 58 dp
coin, wholly inside the 66 dp safe circle.

The layers themselves are unmasked. Only the presentation applies illustrative
circle, squircle, and rounded-square launcher masks. The foreground's transparent
exterior is intentional; the background is opaque. The presentation uses the
central 72 dp viewport. Different launchers can use different shapes and effects.
Monochrome/themed icons and dynamic movement are not previewed here.

### iOS

Official guide: https://developer.apple.com/design/human-interface-guidelines/app-icons

Verified Apple's current HIG through its public documentation JSON endpoint:
https://developer.apple.com/tutorials/data/design/human-interface-guidelines/app-icons.json

The source is a square 1024 × 1024 canvas, with a full-bleed opaque background
and centered artwork. Rounded corners are applied only in the mockup; they
are not baked into the square source. The displayed mask is an approximation,
not Apple's exact system rendering.

Apple's current guidance prefers layers and Icon Composer for Liquid Glass,
while explicitly allowing flattened images. This is a flattened light/default
appearance study. It does not simulate Liquid Glass, automatic shadows,
specular highlights, dark, clear, or tinted appearances. Those require a
separate Icon Composer/device validation step rather than painted-in effects.

## Reproduction and validation

From the repository root:

```sh
python3 artifacts/logo-concepts/open-entry-coin/platform-previews/build_previews.py
```

Render the generated preview SVGs with the logo-design skill's `render_png.py`,
using 1080 × 1000 output. Render the iOS square study at 1024 × 1024.
The generator reads the existing flat-coin SVG instead of duplicating its geometry.

Validation performed:

- Rendered and visually inspected both platform boards, then improved contrast
  behind the mask comparisons and rendered/inspected them again.
- Asserted the Android foreground center and containment inside the 66 dp safe circle.
- Asserted both board PNG dimensions and the iOS source's 1024 × 1024 dimensions.
- Confirmed the iOS source PNG is RGB with no alpha channel.
- Ran `svg_audit.py` on the iOS source and Android foreground. No FAIL findings.
  Android's small-in-canvas informational notice is intentional adaptive-icon padding.
- Ran `git diff --check`.

No app build, emulator, simulator, physical-device check, or Icon Composer
render was performed. These examples demonstrate layout and masking, not
pixel-exact appearance on every OS version or launcher.
