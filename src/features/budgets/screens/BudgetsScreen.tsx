import { AppScreen, EmptyState } from "../../../ui/AppScreen";

export function BudgetsScreen() {
  return (
    <AppScreen eyebrow="Monthly planning" title="Budgets">
      <EmptyState
        title="No budgets yet"
        description="Create an expense-category budget when you’re ready to compare spending with a monthly limit."
      />
    </AppScreen>
  );
}

