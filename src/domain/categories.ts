import { DomainError } from "./errors";
import { categoryInputSchema, type CategoryInput } from "./validation";
import type { Category, CategoryKind, DefaultCategoryKey, UUID } from "./types";
import { createUuid } from "../platform/identifiers/createUuid";

const SYSTEM_CATEGORY_DEFINITIONS: readonly { name: string; kind: CategoryKind; key: DefaultCategoryKey }[] = [
  { name: "Uncategorized", kind: "income", key: "uncategorized" },
  { name: "Uncategorized", kind: "expense", key: "uncategorized" },
  { name: "Income", kind: "income", key: "income" },
  { name: "Food", kind: "expense", key: "food" },
  { name: "Housing", kind: "expense", key: "housing" },
  { name: "Transport", kind: "expense", key: "transport" },
  { name: "Shopping", kind: "expense", key: "shopping" },
  { name: "Utilities", kind: "expense", key: "utilities" },
  { name: "Entertainment", kind: "expense", key: "entertainment" },
  { name: "Health", kind: "expense", key: "health" },
  { name: "Education", kind: "expense", key: "education" },
  { name: "Subscriptions", kind: "expense", key: "subscriptions" }
];

type CategoryIdFactory = () => UUID;

export function seedDefaultCategories(
  _idFactory: CategoryIdFactory = createUuid,
  now: string = new Date().toISOString()
): Category[] {
  return SYSTEM_CATEGORY_DEFINITIONS.map(({ name, kind, key }) => ({
    id: `${kind}-${key}`,
    kind,
    name,
    isSystem: true,
    defaultCategoryKey: key,
    isArchived: false,
    createdAt: now,
    updatedAt: now
  }));
}

export function findUncategorizedCategory(categories: readonly Category[], kind: CategoryKind): Category {
  const category = categories.find((candidate) => candidate.kind === kind && candidate.isSystem && candidate.defaultCategoryKey === "uncategorized" && !candidate.isArchived);
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
  if (category.isSystem) throw new DomainError("Protected categories cannot be renamed");
  const parsed = categoryInputSchema.shape.name.parse(name);
  return { ...category, defaultCategoryKey: undefined, name: parsed, updatedAt: now };
}

export function archiveCategory(category: Category, now = new Date().toISOString()): Category {
  if (category.isSystem) throw new DomainError("Protected categories cannot be archived");
  return { ...category, isArchived: true, updatedAt: now };
}
