# Budget planned expenses: Android validation

## Target and build

- Device: Samsung Galaxy A54 (`SM_A546E`), connected over ADB Wi-Fi.
- Package: `com.unfancy.moneytracker.e2e` (`UNFANCY_E2E=1`, `EXPO_PUBLIC_ENV=local`).
- Launch workflow: `pnpm run android -- --no-bundler`; shared Metro from `pnpm run start:all -- --port 8081`.
- Native build: `BUILD SUCCESSFUL` (38 seconds); installed and opened from the shared Metro server.

## Scenarios

- Planned expense create/edit validation and budget totals separate from actual expenses.
- Record-expense prefill, cancel, and save; reusable planned item actions.
- Copy, delete, and persistence after app restart.
- Currency behavior when feasible.

## Results

- Created an October 2026 Food limit of USD 300 and a planned `Internet_bill` expense of USD 85.25. With only the planned item, the budget showed USD 0 spent and USD 300 remaining.
- Attempting to save an empty planned expense showed the positive-amount validation message. Creating and editing a planned item worked; editing it to USD 90 changed Planned to USD 90 and Unallocated to USD 210 without changing actual spending.
- Record expense opened the transaction form prefilled with Expense, USD 85.25, Food, `Internet_bill`, the current date, and USD. Cancel returned to the budget with the planned item intact. Saving created the local transaction and changed actual spending to USD 85.25 with USD 214.75 remaining; the planned item remained separately listed.
- Copied the October budget to November. The copy reported one budget copied, and November contained the same planned item with USD 0 spent. Confirmed planned-item deletion removed that copied item and reset Planned to USD 0 while preserving the USD 300 limit.
- Force-stopped and relaunched the E2E app without clearing its data. The October transaction total and planned item persisted.
- Currency coverage used USD. Additional currency setup was not included in this pass.

Visual evidence from the physical device is saved at [budget-planned-expenses-android.png](artifacts/budget-planned-expenses-android.png).
