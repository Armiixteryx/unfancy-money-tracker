import { AppScreen, EmptyState } from "../../../ui/AppScreen";

export function TransactionsScreen() {
  return (
    <AppScreen eyebrow="Your local records" title="Transactions">
      <EmptyState
        title="No transactions yet"
        description="Add a transaction to start building your local activity history."
      />
    </AppScreen>
  );
}

