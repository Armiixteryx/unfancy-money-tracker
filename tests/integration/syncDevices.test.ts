import { Pool } from "pg";
import { v7 } from "uuid";
import { it, expect } from "vitest";
import { PostgresSyncRepository } from "../../src/server/repository/postgresSyncRepository";
import { createDatasetStore } from "../../src/features/local-data/store/useLocalDatasetStore";
import {
  DatasetPersistence,
  MemoryPersistenceAdapter,
} from "../../src/platform/persistence";
import { SyncCoordinator } from "../../src/features/sync/coordinator";
import type { SyncClient } from "../../src/server/contracts/sync";
import { syncState } from "../../src/features/sync/state";
const input = {
  amount: "12.5",
  currency: "USD" as const,
  type: "expense" as const,
  categoryId: "expense-food",
  description: "Synthetic two-device record",
  date: "2026-10-04",
};
it("syncs two independent durable devices, reviews concurrent edits and duplicate budgets, and survives category deletion", async () => {
  const pool = new Pool({
    connectionString:
      process.env.TEST_DATABASE_URL ??
      "postgresql://unfancy_migrations:local-development-only@127.0.0.1:55432/unfancy",
  });
  try {
    const repository = new PostgresSyncRepository(pool);
    const owner = `synthetic-${v7()}`;
    const client: SyncClient = {
      bootstrap: () => repository.bootstrap(owner),
      push: (request) =>
        repository.push(owner, request.datasetId, request.changes),
      pull: (request) =>
        repository.pull(owner, request.datasetId, request.cursor, 2),
      resolveConflict: (request) => repository.resolveConflict(owner, request),
    };
    const devices = await Promise.all(
      [1, 2].map(async () => {
        const store = createDatasetStore(
          new DatasetPersistence(new MemoryPersistenceAdapter()),
          async () => {},
        );
        await store.getState().initialize();
        const coordinator = new SyncCoordinator(store, client);
        coordinator.authenticationChanged(true);
        return { store, coordinator };
      }),
    );
    const a = devices[0]!;
    const b = devices[1]!;
    const created = await a.store.getState().addTransaction(input);
    if (!created.ok) throw new Error("Fixture failed");
    await a.coordinator.enable("upload", await a.coordinator.inspect());
    await b.coordinator.enable("replace", await b.coordinator.inspect());
    expect(b.store.getState().dataset!.transactions).toEqual(
      a.store.getState().dataset!.transactions,
    );
    await a.store
      .getState()
      .editTransaction(created.value.id, { ...input, amount: "13" });
    await b.store
      .getState()
      .editTransaction(created.value.id, { ...input, amount: "14" });
    await a.coordinator.run();
    await b.coordinator.run();
    expect(b.coordinator.status).toBe("conflicts");
    const conflict = syncState(b.store.getState().dataset!).conflicts[0]!;
    expect(conflict.localEditedAt).not.toBeNull();
    expect(conflict.cloudCommittedAt).not.toBeNull();
    await b.coordinator.resolve(conflict, "keep_local");
    await a.coordinator.run();
    expect(a.store.getState().dataset!.transactions[0]!.amount).toBe("14");
    expect(b.store.getState().dataset!.transactions).toEqual(
      a.store.getState().dataset!.transactions,
    );
    const budget = {
      categoryId: "expense-food",
      amount: "100",
      currency: "USD" as const,
      month: "2026-10" as const,
    };
    await a.store.getState().addBudget(budget);
    await b.store.getState().addBudget({ ...budget, amount: "120" });
    await a.coordinator.run();
    await b.coordinator.run();
    const duplicate = syncState(b.store.getState().dataset!).conflicts[0]!;
    expect(duplicate.reason).toBe("duplicate_budget");
    await b.coordinator.resolve(duplicate, "keep_local");
    await a.coordinator.run();
    expect(a.store.getState().dataset!.budgets).toEqual(
      b.store.getState().dataset!.budgets,
    );
    expect(a.store.getState().dataset!.budgets).toHaveLength(1);
    const custom = await a.store
      .getState()
      .addCategory({ kind: "expense", name: "Synthetic shared category" });
    if (!custom.ok) throw new Error("Fixture failed");
    const dependent = await a.store
      .getState()
      .addTransaction({ ...input, categoryId: custom.value.id });
    if (!dependent.ok) throw new Error("Fixture failed");
    await a.coordinator.run();
    await b.coordinator.run();
    await b.store.getState().editTransaction(dependent.value.id, {
      ...input,
      categoryId: custom.value.id,
      amount: "16",
    });
    await a.store.getState().deleteCategory(custom.value.id);
    await a.coordinator.run();
    await b.coordinator.run();
    expect(b.coordinator.status).toBe("conflicts");
    expect(
      b.store
        .getState()
        .dataset!.transactions.find((value) => value.id === dependent.value.id),
    ).toMatchObject({ amount: "16", categoryId: "expense-uncategorized" });
    await b.coordinator.resolve(
      syncState(b.store.getState().dataset!).conflicts[0]!,
      "keep_local",
    );
    await a.coordinator.run();
    expect(a.coordinator.status).toBe("idle");
    expect(b.coordinator.status).toBe("idle");
    expect(b.store.getState().dataset!.transactions).toEqual(
      a.store.getState().dataset!.transactions,
    );
    expect(
      b.store
        .getState()
        .dataset!.categories.some((value) => value.id === custom.value.id),
    ).toBe(false);
    expect(syncState(a.store.getState().dataset!).outbox).toHaveLength(0);
    const category = await a.store
      .getState()
      .addCategory({
        kind: "expense",
        name: "Synthetic budget collision category",
      });
    if (!category.ok) throw new Error("Fixture failed");
    await a.store
      .getState()
      .addBudget({
        ...budget,
        categoryId: category.value.id,
        month: "2026-11",
      });
    await a.coordinator.run();
    await b.coordinator.run();
    await b.store
      .getState()
      .addBudget({
        ...budget,
        categoryId: "expense-uncategorized",
        month: "2026-11",
        amount: "130",
      });
    await b.coordinator.run();
    await a.store.getState().deleteCategory(category.value.id);
    await a.coordinator.run();
    expect(a.coordinator.status).toBe("conflicts");
    const collision = syncState(a.store.getState().dataset!).conflicts[0]!;
    expect(collision.categoryDeletionId).toBe(category.value.id);
    await a.coordinator.resolve(collision, "keep_cloud");
    await b.coordinator.run();
    expect(a.coordinator.status).toBe("idle");
    expect(b.coordinator.status).toBe("idle");
    expect(a.store.getState().dataset!.budgets).toEqual(
      b.store.getState().dataset!.budgets,
    );
    expect(
      a.store
        .getState()
        .dataset!.budgets.filter((value) => value.month === "2026-11"),
    ).toHaveLength(1);
  } finally {
    await pool.end();
  }
});
