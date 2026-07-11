import { v4 as uuid } from "uuid";

import type { Category, CategoryKind, UUID } from "./types";

const DEFAULT_EXPENSE_NAMES = [
  "Food",
  "Housing",
  "Transport",
  "Shopping",
  "Utilities",
  "Entertainment",
  "Health",
  "Education",
  "Subscriptions"
] as const;

type CategoryIdFactory = () => UUID;

export function seedDefaultCategories(
  idFactory: CategoryIdFactory = uuid,
  now: string = new Date().toISOString()
): Category[] {
  const definitions: readonly { name: string; kind: CategoryKind; isSystem: boolean }[] = [
    { name: "Uncategorized", kind: "income", isSystem: true },
    { name: "Uncategorized", kind: "expense", isSystem: true },
    { name: "Income", kind: "income", isSystem: false },
    ...DEFAULT_EXPENSE_NAMES.map((name) => ({ name, kind: "expense" as const, isSystem: false }))
  ];

  return definitions.map(({ name, kind, isSystem }) => ({
    id: idFactory(),
    kind,
    name,
    isSystem,
    isArchived: false,
    createdAt: now,
    updatedAt: now
  }));
}

export function findUncategorizedCategory(categories: readonly Category[], kind: CategoryKind): Category {
  const category = categories.find((candidate) => candidate.kind === kind && candidate.isSystem);
  if (!category) {
    throw new Error(`Missing protected Uncategorized category for ${kind}`);
  }
  return category;
}
