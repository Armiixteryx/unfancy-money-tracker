# First-use welcome — physical Android validation

## Target and isolation

October 15, 2026: physical Samsung Galaxy A54 (`SM_A546E`), Android 16, connected over wireless ADB. Used the existing isolated `com.unfancy.moneytracker.e2e` package, preserving normal development and production app data. No app data was cleared, no account was used, and no cloud sync was enabled.

Scrcpy created a separate 1080 × 2340 virtual display at 420 dpi. A local macOS application wrapper made the scrcpy window available to desktop inspection. Host mouse events did not reliably reach Android, so interactions used ADB taps scoped to that virtual display, with screenshots inspected through the scrcpy window.

## Build and checks

- `UNFANCY_E2E=1 UNFANCY_USE_WATCHMAN=0 pnpm run android -- --device SM_A546E --port 8095` — build succeeded and APK installed in place. Explicitly opened the E2E development-client URL on the virtual display because Expo's automatic scheme launch presented a chooser among the three installed app variants.
- Forwarded the worktree's Metro port to the attached phone. Initial checks used port 8093; the rebuilt client uses port 8095.
- Focused welcome, authentication-gate, and tracker-store tests: 19 passed. TypeScript and targeted ESLint passed after the sample-bar adjustment.

## Observed results

- Fresh first-use welcome displayed without login or preloaded financial records.
- All four chapters displayed inside the enclosing card with readable content and reachable controls.
- The single icon button cycled System → Light → Dark → System without changing the current chapter. System matched the phone's light appearance. Both navy and cream transparent logo masks displayed correctly.
- Continue advanced to Simple budgets and Your choices; Back returned to Simple budgets.
- Skip intro jumped to the required Before you begin warning, without opening the financial app. Back to intro returned to the first chapter.
- Android-specific rendering defect reproduced: returning from Your choices to Simple budgets removed the sample progress fill. A fixed 6 px fill height alone did not resolve it. Added distinct keys to the budget/info sample roots so the changed native subtree mounts cleanly, retaining the fixed fill height. Repeated Your choices → Back on the rebuilt client confirmed the green fill remains visible in both light and dark appearance.

## Completion and restart

After the Mac was manually unlocked, resumed on the rebuilt E2E client. A clean force-stop/relaunch removed a transient duplicate-navigation-container warning caused by opening competing development-client links during installation.

- Selected Dark explicitly before completion while the phone's System appearance remained light.
- Start exploring opened the empty Dashboard directly as a guest. It showed No budget set and No transactions yet, confirming the welcome examples were not inserted as records.
- The separate dismissible portfolio banner remained present as designed.
- Force-stopped and relaunched the E2E package on the same scrcpy virtual display. Welcome stayed completed and the empty Dashboard reopened in Dark mode.
- The normal development and production app datasets were not reset or edited. The E2E app now retains its completed introduction, Dark preference, and empty local tracker for review.

## Coverage limits

Spanish device configuration, rotation, offline/recovery fault injection, and native tablet validation were not exercised in this pass. This validates a physical A54 running the native Android app in scrcpy's virtual phone-sized display; it is not evidence for the phone's main-display cutout/keyboard behavior.

## No-scroll phone refinement — October 15

Retested the updated welcome on the physical A54's main display through scrcpy, using the existing E2E client and Metro on port 8095. All four chapters fit inside the available screen with their complete copy, actions, and footer visible. An upward swipe on Your choices left the card stationary. No data reset or completion action was performed in this pass. The phone was left on the final chapter.

Phone styles now use compact spacing, a single-row header, and a non-scrolling viewport. Short phones omit the decorative example; required copy and actions remain. A browser check at 393×780 showed the choices card fully within the viewport with no scrollable container; at 320×568 the final chapter card also fit. Seven focused welcome tests, TypeScript, and focused ESLint passed. Verified saved evidence: `.playwright-cli/welcome/a54-no-scroll.jpg`.
