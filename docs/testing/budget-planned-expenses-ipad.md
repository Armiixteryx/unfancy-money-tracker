# Budget planned expenses: iPad validation

## Target and build

- Device: David’s iPad (A16), iPadOS 27.0.1, UDID `00008120-0009394210414032`.
- App: `com.unfancy.moneytracker.e2e`, built with `UNFANCY_E2E=1` and `EXPO_PUBLIC_ENV=local`.
- Existing generated E2E workspace and Pods were reused. A generic-device Debug build completed successfully into `/private/tmp/ipad-checks-derived`.
- The temporary app was signed with the installed development identity and matching local profile, then installed successfully. Signing was limited to the E2E bundle and its embedded frameworks/dylibs; no keychain changes were made.
- The first direct launch failed because the unsigned build’s `UnfancyMoneyTrackerE2E.debug.dylib` was not signed. After signing embedded code explicitly, `devicectl` launched the app without dyld errors.
- `pnpm exec expo run:ios --device 00008120-0009394210414032 --binary /tmp/ipad-checks-derived/Build/Products/Debug-iphoneos/UnfancyMoneyTrackerE2E.app --scheme UnfancyMoneyTrackerE2E --no-bundler` connected to the iPad and began installing/launching with Metro. A device screenshot showed the E2E Dashboard after the JS bundle loaded, with the E2E warning and native bottom navigation visible.

## Scenarios

- Launch and loaded Dashboard screenshot on the physical iPad: passed.
- Tablet layout at the available landscape size, including native bottom navigation: visually observed.
- Created an October 2026 Food budget with a $500 USD limit: passed.
- Added a synthetic `Groceries` planned expense for $120 USD. The card showed $120 planned and $380 unallocated while actual spending stayed at $0: passed.
- Edited the planned item from $120 to $150 USD. The displayed plan changed to $150 planned/$350 unallocated; actual spending remained $120 and remaining budget remained $380: passed.
- Submitted the empty planned-expense form. The form stayed open and displayed “Enter a positive amount without grouping separators, for example 12.5.” No item was added: passed.
- Opened Record expense and visually verified the prefilled Food category, description, amount, date, and USD currency. Saved the first $120 transaction; actual spending became $120 and remaining budget became $380. The planned item remained available to record again: passed.
- Opened the prefilled form again after editing the item to $150 and used Cancel. Actual spending stayed at $120 and the planned item stayed at $150: passed.
- Copied October to November. The preview showed one eligible budget and zero skipped categories; November displayed the copied $500 Food limit and $120 Groceries item: passed.
- Deleted the copied November planned item through the app confirmation. The November plan returned to $0 planned/$500 unallocated: passed.
- Terminated and relaunched the E2E app on the iPad. The October dashboard restored $120 expenses/$380 remaining; the October budget restored the $150 planned item: passed.
- Tablet layout was visually inspected in landscape, including the five native bottom tabs, wide budget card, planned-item controls, and transaction form. Text and controls were visible at the tested size. Device Hub did not expose the iPad app’s accessibility tree; VoiceOver and semantic labels were not independently checked.

## Results

- Physical install, launch, React Native bundle load, and Dashboard render: passed. The initial screen showed the “No budget set” and “No transactions yet” empty states, the E2E warning banner, and native bottom navigation.
- Planned-budget and expense flows listed above: passed on David’s iPad (A16), iPadOS 27.0.1, using the synthetic `com.unfancy.moneytracker.e2e` app.
- The initial empty-state capture is [budget-planned-expenses-ipad.png](budget-planned-expenses-ipad.png). The post-restart budget and plan state is captured at [budget-planned-expenses-ipad-actual.png](budget-planned-expenses-ipad-actual.png). Interaction results were visually inspected through Device Hub during the run.
