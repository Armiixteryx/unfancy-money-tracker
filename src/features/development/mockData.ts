import { archiveCategory, createCategory, findUncategorizedCategory } from "../../domain/categories";
import { createBudget } from "../../domain/budgets";
import { createTransaction } from "../../domain/transactions";
import type { Budget, Category, CategoryDeletionTombstone, Dataset, DefaultCategoryKey, Transaction, UUID } from "../../domain/types";
import { createEmptyDataset } from "../../platform/persistence";
import { createUuid } from "../../platform/identifiers/createUuid";

export const mockDatasetPresets = ["dashboard", "edge-cases"] as const;
export type MockDatasetPreset = (typeof mockDatasetPresets)[number];

export function isMockDatasetPreset(value: unknown): value is MockDatasetPreset {
  return typeof value === "string" && (mockDatasetPresets as readonly string[]).includes(value);
}

type Dependencies = { now?: Date; idFactory?: () => UUID };

function dateAtMonthOffset(now: Date, offset: number, day: number): string {
  const safeDay = offset === 0 ? Math.min(day, now.getUTCDate()) : day;
  const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + offset, safeDay));
  return date.toISOString().slice(0, 10);
}

function monthAtOffset(now: Date, offset: number): `${number}-${number}` {
  const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + offset, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}` as `${number}-${number}`;
}

function category(categories: readonly Category[], key: DefaultCategoryKey): Category {
  const found = categories.find((candidate) => candidate.defaultCategoryKey === key);
  if (!found) throw new Error(`Mock fixture category is missing: ${key}`);
  return found;
}

export function createMockDataset(preset: MockDatasetPreset, existingDatasetId: UUID, dependencies: Dependencies = {}): Dataset {
  const now = dependencies.now ?? new Date();
  const timestamp = now.toISOString();
  const idFactory = dependencies.idFactory ?? createUuid;
  const base = createEmptyDataset(idFactory, timestamp);
  const currentMonth = monthAtOffset(now, 0);
  const categories = [...base.categories];
  const transactions: Transaction[] = [];
  const budgets: Budget[] = [];
  const addTransaction = (input: Parameters<typeof createTransaction>[0]) => {
    transactions.push(createTransaction(input, { categories, idFactory, now: () => timestamp }));
  };
  const addBudget = (input: Parameters<typeof createBudget>[0]) => {
    budgets.push(createBudget(input, { categories, idFactory, now: () => timestamp }));
  };

  const income = category(categories, "income");
  const food = category(categories, "food");
  const housing = category(categories, "housing");
  const transport = category(categories, "transport");
  const utilities = category(categories, "utilities");
  const entertainment = category(categories, "entertainment");

  addTransaction({ type: "income", amount: "4800", categoryId: income.id, description: "Sample monthly income", date: dateAtMonthOffset(now, 0, 1), currency: "USD" });
  addTransaction({ type: "expense", amount: "1200", categoryId: housing.id, description: "Sample rent", date: dateAtMonthOffset(now, 0, 2), currency: "USD" });
  addTransaction({ type: "expense", amount: "68.40", categoryId: food.id, description: "Sample groceries", date: dateAtMonthOffset(now, 0, 4), currency: "USD" });
  addTransaction({ type: "expense", amount: "32", categoryId: transport.id, description: "Sample transit", date: dateAtMonthOffset(now, 0, 6), currency: "USD" });
  addTransaction({ type: "expense", amount: "95", categoryId: utilities.id, description: "Sample utilities", date: dateAtMonthOffset(now, 0, 8), currency: "USD" });
  addTransaction({ type: "expense", amount: "44", categoryId: entertainment.id, description: "Sample movie night", date: dateAtMonthOffset(now, 0, 10), currency: "USD" });
  addBudget({ categoryId: food.id, month: currentMonth, amount: "400", currency: "USD" });
  addBudget({ categoryId: transport.id, month: currentMonth, amount: "150", currency: "USD" });

  for (const offset of [-1, -2, -3]) {
    addTransaction({ type: "income", amount: "4800", categoryId: income.id, description: "Sample monthly income", date: dateAtMonthOffset(now, offset, 1), currency: "USD" });
    addTransaction({ type: "expense", amount: "76", categoryId: food.id, description: "Sample groceries", date: dateAtMonthOffset(now, offset, 7), currency: "USD" });
    addTransaction({ type: "expense", amount: "1200", categoryId: housing.id, description: "Sample rent", date: dateAtMonthOffset(now, offset, 2), currency: "USD" });
  }
  addTransaction({ type: "expense", amount: "180000", categoryId: food.id, description: "Sample Colombian groceries", date: dateAtMonthOffset(now, -1, 12), currency: "COP" });
  addTransaction({ type: "expense", amount: "8500", categoryId: transport.id, description: "Sample Venezuelan transport", date: dateAtMonthOffset(now, -1, 20), currency: "VES" });


  const categoryDeletionTombstones: CategoryDeletionTombstone[] = [];
  if (preset === "edge-cases") {
    addTransaction({ type: "expense", amount: "180", categoryId: food.id, description: "Sample dinner", date: dateAtMonthOffset(now, 0, 12), currency: "EUR" });
    addTransaction({ type: "expense", amount: "5600", categoryId: transport.id, description: "Sample rail pass", date: dateAtMonthOffset(now, 0, 13), currency: "JPY" });
    addTransaction({ type: "expense", amount: "290", categoryId: food.id, description: "Sample pantry restock", date: dateAtMonthOffset(now, 0, 14), currency: "USD" });
    addBudget({ categoryId: entertainment.id, month: currentMonth, amount: "30", currency: "USD" });

    const travel = createCategory({ kind: "expense", name: "Sample archived travel" }, { idFactory, now: () => timestamp });
    categories.push(travel);
    addTransaction({ type: "expense", amount: "140", categoryId: travel.id, description: "Sample historic trip", date: dateAtMonthOffset(now, -1, 18), currency: "USD" });
    const archivedTravel = archiveCategory(travel, timestamp);
    categories.splice(categories.findIndex((candidate) => candidate.id === travel.id), 1, archivedTravel);

    const deleted = createCategory({ kind: "expense", name: "Sample deleted category" }, { idFactory, now: () => timestamp });
    categories.push(deleted);
    addTransaction({ type: "expense", amount: "25", categoryId: deleted.id, description: "Sample reassigned expense", date: dateAtMonthOffset(now, 0, 15), currency: "USD" });
    const uncategorized = findUncategorizedCategory(categories, "expense");
    const deletedAt = timestamp;
    for (let index = 0; index < transactions.length; index += 1) {
      const transaction = transactions[index];
      if (transaction && transaction.categoryId === deleted.id) transactions[index] = { ...transaction, categoryId: uncategorized.id, updatedAt: deletedAt };
    }
    categories.splice(categories.findIndex((candidate) => candidate.id === deleted.id), 1);
    const tombstone = { recordType: "category" as const, recordId: deleted.id, deletedAt };
    categoryDeletionTombstones.push(tombstone);
  }

  return {
    ...base,
    datasetId: existingDatasetId,
    transactions,
    categories,
    budgets,
    categoryDeletionTombstones
  };
}
