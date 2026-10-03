import { describe, expect, it } from "vitest";

import { archiveCategory, createCategory, findUncategorizedCategory, renameCategory, seedDefaultCategories } from "./categories";

describe("category defaults", () => {
  it("creates fresh UUID-backed defaults for each dataset", () => {
    let first = 0;
    let second = 0;
    const firstDataset = seedDefaultCategories(() => `00000000-0000-4000-8000-${String(++first).padStart(12, "0")}`);
    const secondDataset = seedDefaultCategories(() => `00000000-0000-4000-8000-${String(100 + ++second).padStart(12, "0")}`);

    expect(firstDataset).toHaveLength(12);
    expect(firstDataset.map((category) => category.id)).not.toEqual(secondDataset.map((category) => category.id));
    expect(findUncategorizedCategory(firstDataset, "expense").isSystem).toBe(true);
    expect(firstDataset.some((category) => category.name === "Subscriptions")).toBe(true);
    expect(firstDataset.every((category) => category.isSystem && !category.isArchived && category.defaultCategoryKey)).toBe(true);
  });

  it("supports custom category lifecycle", () => {
    const custom = createCategory({ kind: "expense", name: "Travel" }, { idFactory: () => "00000000-0000-4000-8000-000000000099", now: () => "2026-07-11T00:00:00.000Z" });
    expect(renameCategory(custom, "Trips").name).toBe("Trips");
    expect(archiveCategory(custom).isArchived).toBe(true);
    expect(custom.isSystem).toBe(false);
    expect(custom.defaultCategoryKey).toBeUndefined();
  });

  it.each(seedDefaultCategories())("protects $kind/$defaultCategoryKey from rename and archive", (category) => {
    expect(() => renameCategory(category, "Synthetic name")).toThrow("Protected categories cannot be renamed");
    expect(() => archiveCategory(category)).toThrow("Protected categories cannot be archived");
  });

  it.each(["income", "expense"] as const)("finds only the active system Uncategorized fallback for %s", (kind) => {
    const categories = seedDefaultCategories().reverse();
    const fallback = findUncategorizedCategory(categories, kind);
    expect(fallback).toMatchObject({ kind, defaultCategoryKey: "uncategorized", isSystem: true, isArchived: false });
    const withoutFallback = categories.filter(category => category.id !== fallback.id);
    const impostor = createCategory({ kind, name: "Uncategorized" });
    expect(() => findUncategorizedCategory([...withoutFallback, impostor], kind)).toThrow("Missing protected");
    expect(() => findUncategorizedCategory([...withoutFallback, { ...fallback, isArchived: true }], kind)).toThrow("Missing protected");
  });
});
