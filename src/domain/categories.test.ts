import { describe, expect, it } from "vitest";

import { archiveCategory, createCategory, findUncategorizedCategory, renameCategory, seedDefaultCategories } from "./categories";

describe("category defaults", () => {
  it("creates fresh UUID-backed defaults for each dataset", () => {
    let first = 0;
    let second = 0;
    const firstDataset = seedDefaultCategories(() => `00000000-0000-4000-8000-00000000000${++first}`);
    const secondDataset = seedDefaultCategories(() => `00000000-0000-4000-8000-00000000010${++second}`);

    expect(firstDataset).toHaveLength(12);
    expect(firstDataset.map((category) => category.id)).not.toEqual(secondDataset.map((category) => category.id));
    expect(findUncategorizedCategory(firstDataset, "expense").isSystem).toBe(true);
    expect(firstDataset.some((category) => category.name === "Subscriptions")).toBe(true);
  });

  it("supports custom category lifecycle while protecting Uncategorized", () => {
    const custom = createCategory({ kind: "expense", name: "Travel" }, { idFactory: () => "00000000-0000-4000-8000-000000000099", now: () => "2026-07-11T00:00:00.000Z" });
    expect(renameCategory(custom, "Trips").name).toBe("Trips");
    expect(archiveCategory(custom).isArchived).toBe(true);
    expect(() => archiveCategory(findUncategorizedCategory(seedDefaultCategories(), "expense"))).toThrow("Protected");
  });
});
