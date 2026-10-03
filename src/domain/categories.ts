import { DomainError } from "./errors";
import { categoryInputSchema, type CategoryInput } from "./validation";
import type { Category, CategoryKind, DefaultCategoryKey, UUID } from "./types";
import { createUuid } from "../platform/identifiers/createUuid";

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
  idFactory: CategoryIdFactory = createUuid,
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
    defaultCategoryKey: name.toLowerCase() as DefaultCategoryKey,
    isArchived: false,
    createdAt: now,
    updatedAt: now
  }));
}

export function findUncategorizedCategory(categories: readonly Category[], kind: CategoryKind): Category {
  const category = categories.find((candidate) => candidate.kind === kind && candidate.isSystem);
  if (!category) {
    throw new DomainError(`Missing protected Uncategorized category for ${kind}`);
  }
  return category;
}

export function createCategory(
  input: CategoryInput,
  dependencies: { idFactory?: () => UUID; now?: () => string } = {}
): Category {
  const parsed = categoryInputSchema.parse(input);
  const now = dependencies.now?.() ?? new Date().toISOString();

  return {
    id: dependencies.idFactory?.() ?? createUuid(),
    kind: parsed.kind,
    name: parsed.name,
    isSystem: false,
    isArchived: false,
    createdAt: now,
    updatedAt: now
  };
}

export function renameCategory(category: Category, name: string, now = new Date().toISOString()): Category {
  const parsed = categoryInputSchema.shape.name.parse(name);
  if (category.isSystem) throw new DomainError("Protected categories cannot be renamed");
  return { ...category, defaultCategoryKey: undefined, name: parsed, updatedAt: now };
}

export function archiveCategory(category: Category, now = new Date().toISOString()): Category {
  if (category.isSystem) throw new DomainError("Protected categories cannot be archived");
  return { ...category, isArchived: true, updatedAt: now };
}
