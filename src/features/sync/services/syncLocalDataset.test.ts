import { describe, expect, it } from "vitest";

import { createEmptyDataset } from "../../../platform/persistence/datasetPersistence";
import { buildInitialSyncChanges } from "./syncLocalDataset";

describe("initial sync changes", () => {
  it("includes local records and preference state without changing the dataset", () => {
    const dataset = createEmptyDataset(() => "11111111-1111-4111-8111-111111111111", "2026-07-01T00:00:00.000Z");
    const changes = buildInitialSyncChanges(dataset);
    expect(changes).toHaveLength(dataset.categories.length + 1);
    expect(changes.some((change) => change.recordType === "preference")).toBe(true);
    expect(changes.every((change) => change.baseRevision === 0)).toBe(true);
  });
});
