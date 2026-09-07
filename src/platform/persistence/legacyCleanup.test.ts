import { describe, expect, it } from "vitest";

import { cleanupLegacyAccountCaches, type LegacyCleanupAdapter, type LegacySessionRecord } from "./legacyCleanup";

function createAdapter(records: Partial<Record<"dev" | "prod", LegacySessionRecord>>, failures = new Set<string>()) {
  const resetNamespaces: string[] = [];
  const clearedStages: string[] = [];
  const adapter: LegacyCleanupAdapter = {
    async readSession(stage) {
      return records[stage] ?? { present: false, session: null };
    },
    async resetNamespace(namespace) {
      resetNamespaces.push(namespace);
      if (failures.has(namespace)) throw new Error("synthetic reset failure");
    },
    async clearSession(stage) {
      clearedStages.push(stage);
    }
  };
  return { adapter, resetNamespaces, clearedStages };
}

describe("legacy local account cache cleanup", () => {
  it("discovers dev and prod namespaces, resets them, and clears sessions", async () => {
    const { adapter, resetNamespaces, clearedStages } = createAdapter({
      dev: { present: true, session: { backendStage: "dev", accountId: "dev-account" } },
      prod: { present: true, session: { backendStage: "prod", accountId: "prod-account" } }
    });

    await cleanupLegacyAccountCaches(adapter);

    expect(resetNamespaces).toEqual(["account:dev:dev-account", "account:prod:prod-account"]);
    expect(clearedStages).toEqual(["dev", "prod"]);
  });

  it("leaves a failed session available so the next run can retry it", async () => {
    const first = createAdapter(
      { dev: { present: true, session: { backendStage: "dev", accountId: "dev-account" } } },
      new Set(["account:dev:dev-account"])
    );

    await expect(cleanupLegacyAccountCaches(first.adapter)).rejects.toMatchObject({ failedStages: ["dev"] });
    expect(first.clearedStages).toEqual([]);

    const second = createAdapter({ dev: { present: true, session: { backendStage: "dev", accountId: "dev-account" } } });
    await cleanupLegacyAccountCaches(second.adapter);
    expect(second.resetNamespaces).toEqual(["account:dev:dev-account"]);
    expect(second.clearedStages).toEqual(["dev"]);
  });

  it("clears an unreadable discovered session without inventing a namespace", async () => {
    const { adapter, resetNamespaces, clearedStages } = createAdapter({ dev: { present: true, session: null } });

    await cleanupLegacyAccountCaches(adapter);

    expect(resetNamespaces).toEqual([]);
    expect(clearedStages).toEqual(["dev"]);
  });
});
