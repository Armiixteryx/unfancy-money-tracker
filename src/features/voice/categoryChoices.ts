import type { Category, DefaultCategoryKey } from "../../domain/types";
import { en, es } from "../../localization/catalogs";

const bilingualCategoryNames: Record<DefaultCategoryKey, { en: string; es: string }> = {
  uncategorized: { en: en.categories.uncategorized, es: es.categories.uncategorized },
  income: { en: en.categories.income, es: es.categories.income },
  food: { en: en.categories.food, es: es.categories.food },
  housing: { en: en.categories.housing, es: es.categories.housing },
  transport: { en: en.categories.transport, es: es.categories.transport },
  shopping: { en: en.categories.shopping, es: es.categories.shopping },
  utilities: { en: en.categories.utilities, es: es.categories.utilities },
  entertainment: { en: en.categories.entertainment, es: es.categories.entertainment },
  health: { en: en.categories.health, es: es.categories.health },
  education: { en: en.categories.education, es: es.categories.education },
  subscriptions: { en: en.categories.subscriptions, es: es.categories.subscriptions },
};

export function voiceCategoryChoices(
  categories: readonly Category[],
  currentLabel: (category: Category) => string,
) {
  return categories
    .filter(category => category.kind === "expense" && !category.isArchived)
    .map(category => ({
      id: category.id,
      name: currentLabel(category),
      ...(category.defaultCategoryKey ? { localizedNames: bilingualCategoryNames[category.defaultCategoryKey] } : {}),
      isFallback: category.isSystem && category.defaultCategoryKey === "uncategorized",
    }));
}
