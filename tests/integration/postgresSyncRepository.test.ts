import { Pool } from "pg";
import { v7 } from "uuid";
import { beforeAll, afterAll, describe, expect, it } from "vitest";
import { PostgresSyncRepository } from "../../src/server/repository/postgresSyncRepository";
import { PostgresRateCache } from "../../src/server/repository/postgresRateCache";
import { seedDefaultCategories } from "../../src/domain/categories";
import type { SyncChange } from "../../src/server/contracts/sync";
const pool = new Pool({
  connectionString:
    process.env.TEST_DATABASE_URL ??
    "postgresql://unfancy_migrations:local-development-only@127.0.0.1:55432/unfancy",
  max: 8,
});
const repository = new PostgresSyncRepository(pool);
const now = "2026-10-04T00:00:00.000Z";
function mutation(
  recordType: SyncChange["recordType"],
  recordId: string,
  payload: unknown,
  baseRevision = 0,
): SyncChange {
  return {
    mutationId: v7(),
    recordType,
    recordId,
    payload,
    operation: payload === null ? "delete" : "upsert",
    tombstone: payload === null,
    baseRevision,
    editedAt: now,
    revision: 0,
    committedAt: null,
  };
}
async function fixture() {
  const owner = `synthetic-${v7()}`;
  const bootstrap = await repository.bootstrap(owner);
  await repository.push(
    owner,
    bootstrap.datasetId,
    seedDefaultCategories(undefined, now).map((category) =>
      mutation("category", category.id, category),
    ),
  );
  return { owner, datasetId: bootstrap.datasetId };
}
function transaction(id = v7(), categoryId = "expense-food") {
  return {
    id,
    amount: "12.5",
    currency: "USD",
    type: "expense",
    categoryId,
    description: "Synthetic record",
    date: "2026-10-04",
    createdAt: now,
    updatedAt: now,
  };
}
function budget(id = v7(), categoryId = "expense-food") {
  return {
    id,
    amount: "50",
    currency: "USD",
    categoryId,
    month: "2026-10",
    createdAt: now,
    updatedAt: now,
  };
}
beforeAll(async () => {
  await pool.query("SELECT version FROM flyway_schema_history WHERE success");
});
afterAll(async () => pool.end());
describe("PostgreSQL sync", () => {
  it("bounds application role connections independently of Lambda reservations", async () => {
    const result = await pool.query<{ rolname: string; rolconnlimit: number; rolsuper: boolean }>(
      "SELECT rolname,rolconnlimit,rolsuper FROM pg_roles WHERE rolname IN ('unfancy_sync','unfancy_rates') ORDER BY rolname",
    );
    expect(result.rows).toEqual([
      { rolname: "unfancy_rates", rolconnlimit: 2, rolsuper: false },
      { rolname: "unfancy_sync", rolconnlimit: 5, rolsuper: false },
    ]);
  });
  it("remembers conflicted mutation contents and rejects altered retries", async () => {
    const { owner, datasetId } = await fixture();
    const record = transaction();
    await repository.push(owner, datasetId, [
      mutation("transaction", record.id, record),
    ]);
    const stale = mutation("transaction", record.id, {
      ...record,
      amount: "14",
    });
    expect(
      (await repository.push(owner, datasetId, [stale])).conflicts,
    ).toHaveLength(1);
    expect(
      (await repository.push(owner, datasetId, [stale])).conflicts,
    ).toHaveLength(1);
    await expect(
      repository.push(owner, datasetId, [
        { ...stale, payload: { ...record, amount: "15" } },
      ]),
    ).rejects.toThrow("Invalid sync request");
  });
  it("remembers rejected resolution contents and requires a fresh identity for a revised choice", async () => {
    const { owner, datasetId } = await fixture();
    const record = transaction();
    const created = await repository.push(owner, datasetId, [
      mutation("transaction", record.id, record),
    ]);
    const conflict = (
      await repository.push(owner, datasetId, [
        mutation("transaction", record.id, { ...record, amount: "14" }),
      ])
    ).conflicts[0]!;
    await repository.push(owner, datasetId, [
      mutation(
        "transaction",
        record.id,
        { ...record, amount: "15" },
        created.acknowledgedChanges[0]!.revision,
      ),
    ]);
    const request = {
      datasetId,
      conflict,
      choice: "keep_local" as const,
      mutationId: v7(),
      editedAt: now,
    };
    expect(
      (await repository.resolveConflict(owner, request)).conflicts,
    ).toHaveLength(1);
    await expect(
      repository.resolveConflict(owner, { ...request, choice: "keep_cloud" }),
    ).rejects.toThrow("Invalid sync request");
  });
  it("bootstraps one canonical dataset concurrently and isolates owners", async () => {
    const owner = `synthetic-${v7()}`;
    const values = await Promise.all(
      Array.from({ length: 5 }, () => repository.bootstrap(owner)),
    );
    expect(new Set(values.map((value) => value.datasetId)).size).toBe(1);
    await expect(
      repository.pull("other", values[0]!.datasetId, "0"),
    ).rejects.toThrow("Dataset access denied");
    await expect(
      repository.push("other", values[0]!.datasetId, []),
    ).rejects.toThrow("Dataset access denied");
  });
  it("preserves decimal strings, retries exactly once, and rejects ID reuse", async () => {
    const { owner, datasetId } = await fixture();
    const record = transaction();
    const change = mutation("transaction", record.id, record);
    const accepted = await repository.push(owner, datasetId, [change]);
    expect(await repository.push(owner, datasetId, [change])).toEqual(accepted);
    await expect(
      repository.push(owner, datasetId, [
        { ...change, editedAt: "2026-10-05T00:00:00.000Z" },
      ]),
    ).rejects.toThrow("Invalid sync request");
    const pulled = await repository.pull(owner, datasetId, "12");
    expect(pulled.changes).toHaveLength(1);
    expect((pulled.changes[0]!.payload as { amount: string }).amount).toBe(
      "12.5",
    );
    expect(accepted).not.toHaveProperty("cursor");
  });
  it("serializes concurrent revisions independently of device clock and paginates without gaps", async () => {
    const { owner, datasetId } = await fixture();
    const accepted = await Promise.all(
      Array.from({ length: 8 }, (_, index) => {
        const value = transaction();
        return repository.push(owner, datasetId, [
          {
            ...mutation("transaction", value.id, value),
            editedAt:
              index % 2
                ? "2000-01-01T00:00:00.000Z"
                : "2099-01-01T00:00:00.000Z",
          },
        ]);
      }),
    );
    const revisions = accepted
      .flatMap((response) =>
        response.acknowledgedChanges.map((value) => value.revision),
      )
      .sort((a, b) => a - b);
    expect(revisions).toEqual([13, 14, 15, 16, 17, 18, 19, 20]);
    let cursor = "0";
    const pulled: number[] = [];
    for (;;) {
      const page = await repository.pull(owner, datasetId, cursor, 3);
      pulled.push(...page.changes.map((value) => value.revision));
      cursor = page.cursor;
      if (!page.hasMore) break;
    }
    expect(pulled).toEqual(Array.from({ length: 20 }, (_, index) => index + 1));
  });
  it("returns deletion-versus-edit conflicts and retries manual resolutions", async () => {
    const { owner, datasetId } = await fixture();
    const value = transaction();
    const created = await repository.push(owner, datasetId, [
      mutation("transaction", value.id, value),
    ]);
    const revision = created.acknowledgedChanges[0]!.revision;
    await repository.push(owner, datasetId, [
      mutation("transaction", value.id, null, revision),
    ]);
    const conflicted = await repository.push(owner, datasetId, [
      mutation("transaction", value.id, { ...value, amount: "14" }, revision),
    ]);
    const conflict = conflicted.conflicts[0]!;
    expect(conflict.cloudDeleted).toBe(true);
    expect(conflict.cloudCommittedAt).not.toBeNull();
    const request = {
      datasetId,
      conflict,
      choice: "keep_local" as const,
      mutationId: v7(),
      editedAt: now,
    };
    const response = await repository.resolveConflict(owner, request);
    expect(response.conflicts).toHaveLength(0);
    expect(await repository.resolveConflict(owner, request)).toEqual(response);
    await expect(
      repository.resolveConflict(owner, { ...request, choice: "keep_cloud" }),
    ).rejects.toThrow("Invalid sync request");
  });
  it("returns an updated conflict after an intervening edit", async () => {
    const { owner, datasetId } = await fixture();
    const value = transaction();
    await repository.push(owner, datasetId, [
      mutation("transaction", value.id, value),
    ]);
    const conflict = (
      await repository.push(owner, datasetId, [
        mutation("transaction", value.id, value),
      ])
    ).conflicts[0]!;
    await repository.push(owner, datasetId, [
      mutation(
        "transaction",
        value.id,
        { ...value, amount: "15" },
        conflict.cloudRevision,
      ),
    ]);
    const resolved = await repository.resolveConflict(owner, {
      datasetId,
      conflict,
      choice: "keep_local",
      mutationId: v7(),
      editedAt: now,
    });
    expect(resolved.conflicts[0]!.cloudRevision).toBeGreaterThan(
      conflict.cloudRevision,
    );
  });
  it("requires a manual choice for budgets with different UUIDs", async () => {
    const { owner, datasetId } = await fixture();
    const cloud = budget();
    const local = budget();
    await repository.push(owner, datasetId, [
      mutation("budget", cloud.id, cloud),
    ]);
    const conflict = (
      await repository.push(owner, datasetId, [
        mutation("budget", local.id, local),
      ])
    ).conflicts[0]!;
    expect(conflict.reason).toBe("duplicate_budget");
    expect(conflict.cloudRecordId).toBe(cloud.id);
    const request = {
      datasetId,
      conflict,
      choice: "keep_local" as const,
      mutationId: v7(),
      editedAt: now,
    };
    const response = await repository.resolveConflict(owner, request);
    expect(response.acknowledgedChanges).toHaveLength(1);
    expect(await repository.resolveConflict(owner, request)).toEqual(response);
    const values = await pool.query(
      "SELECT id FROM budgets WHERE dataset_id=$1",
      [datasetId],
    );
    expect(values.rows.map((row) => row.id)).toEqual([local.id]);
    const pulled = await repository.pull(owner, datasetId, "13");
    expect(
      pulled.changes.some(
        (change) => change.recordId === cloud.id && change.tombstone,
      ),
    ).toBe(true);
  });
  it("reassigns dependent records and logs tombstones atomically", async () => {
    const { owner, datasetId } = await fixture();
    const category = {
      id: v7(),
      kind: "expense",
      name: "Synthetic category",
      isSystem: false,
      isArchived: false,
      createdAt: now,
      updatedAt: now,
    };
    const created = await repository.push(owner, datasetId, [
      mutation("category", category.id, category),
    ]);
    const record = transaction(v7(), category.id);
    const limit = budget(v7(), category.id);
    await repository.push(owner, datasetId, [
      mutation("transaction", record.id, record),
      mutation("budget", limit.id, limit),
    ]);
    const deleted = mutation(
      "category",
      category.id,
      null,
      created.acknowledgedChanges[0]!.revision,
    );
    await repository.push(owner, datasetId, [deleted]);
    const changes = (await repository.pull(owner, datasetId, "15")).changes;
    expect(changes.map((value) => value.recordType)).toEqual([
      "transaction",
      "budget",
      "category",
    ]);
    expect((changes[0]!.payload as { categoryId: string }).categoryId).toBe(
      "expense-uncategorized",
    );
    expect(changes[2]!.tombstone).toBe(true);
    expect(
      (await repository.push(owner, datasetId, [deleted])).acknowledgedChanges,
    ).toHaveLength(1);
  });
  it("publishes a tombstone for an unaccepted budget when keeping the cloud budget", async () => {
    const { owner, datasetId } = await fixture();
    const cloud = budget();
    const local = budget();
    await repository.push(owner, datasetId, [
      mutation("budget", cloud.id, cloud),
    ]);
    const conflict = (
      await repository.push(owner, datasetId, [
        mutation("budget", local.id, local),
      ])
    ).conflicts[0]!;
    const request = {
      datasetId,
      conflict,
      choice: "keep_cloud" as const,
      mutationId: v7(),
      editedAt: now,
    };
    const response = await repository.resolveConflict(owner, request);
    expect(response.acknowledgedChanges[0]?.recordId).toBe(local.id);
    expect(await repository.resolveConflict(owner, request)).toEqual(response);
    const pulled = await repository.pull(owner, datasetId, "13");
    expect(pulled.changes).toHaveLength(1);
    expect(pulled.changes[0]).toMatchObject({
      recordId: local.id,
      tombstone: true,
    });
    expect(
      (
        await pool.query("SELECT id FROM budgets WHERE dataset_id=$1", [
          datasetId,
        ])
      ).rows.map((row) => row.id),
    ).toEqual([cloud.id]);
  });
  it("restores an existing budget's previous month when discarding a competing edit", async () => {
    const { owner, datasetId } = await fixture();
    const local = { ...budget(), month: "2026-09" };
    const cloud = budget();
    const created = await repository.push(owner, datasetId, [
      mutation("budget", local.id, local),
      mutation("budget", cloud.id, cloud),
    ]);
    const conflict = (
      await repository.push(owner, datasetId, [
        mutation(
          "budget",
          local.id,
          { ...local, month: cloud.month },
          created.acknowledgedChanges[0]!.revision,
        ),
      ])
    ).conflicts[0]!;
    await repository.resolveConflict(owner, {
      datasetId,
      conflict,
      choice: "keep_cloud",
      mutationId: v7(),
      editedAt: now,
    });
    const pulled = await repository.pull(owner, datasetId, "14");
    expect(pulled.changes[0]).toMatchObject({
      recordId: local.id,
      tombstone: false,
      payload: { month: "2026-09" },
    });
    expect(
      (
        await pool.query("SELECT id FROM budgets WHERE dataset_id=$1", [
          datasetId,
        ])
      ).rowCount,
    ).toBe(2);
  });
  it.each(["keep_local", "keep_cloud"] as const)(
    "checks an intervening edit to the proposed budget before %s",
    async (choice) => {
      const { owner, datasetId } = await fixture();
      const local = { ...budget(), month: "2026-09" };
      const cloud = budget();
      const created = await repository.push(owner, datasetId, [
        mutation("budget", local.id, local),
        mutation("budget", cloud.id, cloud),
      ]);
      const base = created.acknowledgedChanges[0]!.revision;
      const conflict = (
        await repository.push(owner, datasetId, [
          mutation("budget", local.id, { ...local, month: cloud.month }, base),
        ])
      ).conflicts[0]!;
      const newer = await repository.push(owner, datasetId, [
        mutation("budget", local.id, { ...local, amount: "70" }, base),
      ]);
      const result = await repository.resolveConflict(owner, {
        datasetId,
        conflict,
        choice,
        mutationId: v7(),
        editedAt: now,
      });
      expect(result.acknowledgedChanges).toHaveLength(0);
      expect(result.conflicts[0]).toMatchObject({
        reason: "concurrent_edit",
        cloudRecordId: local.id,
        cloudRevision: newer.acknowledgedChanges[0]!.revision,
        cloudPayload: { amount: "70" },
      });
      expect(
        (
          await pool.query("SELECT id FROM budgets WHERE dataset_id=$1", [
            datasetId,
          ])
        ).rowCount,
      ).toBe(2);
    },
  );
  it.each(["keep_local", "keep_cloud"] as const)(
    "pauses category deletion for a budget choice, then completes after %s",
    async (choice) => {
      const { owner, datasetId } = await fixture();
      const category = {
        id: v7(),
        kind: "expense",
        name: "Synthetic category",
        isSystem: false,
        isArchived: false,
        createdAt: now,
        updatedAt: now,
      };
      const created = await repository.push(owner, datasetId, [
        mutation("category", category.id, category),
      ]);
      const a = budget(v7(), category.id);
      const b = budget(v7(), "expense-uncategorized");
      await repository.push(owner, datasetId, [
        mutation("budget", a.id, a),
        mutation("budget", b.id, b),
      ]);
      const deletion = mutation(
        "category",
        category.id,
        null,
        created.acknowledgedChanges[0]!.revision,
      );
      const blocked = await repository.push(owner, datasetId, [
        mutation(
          "category",
          category.id,
          null,
          created.acknowledgedChanges[0]!.revision,
        ),
      ]);
      expect(blocked.acknowledgedChanges).toHaveLength(0);
      expect(blocked.conflicts[0]).toMatchObject({
        recordType: "budget",
        recordId: a.id,
        cloudRecordId: b.id,
        categoryDeletionId: category.id,
      });
      expect(
        (
          await pool.query(
            "SELECT id FROM categories WHERE dataset_id=$1 AND id=$2",
            [datasetId, category.id],
          )
        ).rowCount,
      ).toBe(1);
      expect(
        (
          await pool.query("SELECT id FROM budgets WHERE dataset_id=$1", [
            datasetId,
          ])
        ).rowCount,
      ).toBe(2);
      const request = {
        datasetId,
        conflict: blocked.conflicts[0]!,
        choice,
        mutationId: v7(),
        editedAt: now,
      };
      const resolved = await repository.resolveConflict(owner, request);
      expect(resolved.conflicts).toHaveLength(0);
      expect(await repository.resolveConflict(owner, request)).toEqual(
        resolved,
      );
      expect(
        (await repository.push(owner, datasetId, [deletion]))
          .acknowledgedChanges,
      ).toHaveLength(1);
      expect(
        (
          await pool.query(
            "SELECT id FROM categories WHERE dataset_id=$1 AND id=$2",
            [datasetId, category.id],
          )
        ).rowCount,
      ).toBe(0);
      const remaining = await pool.query<{ id: string; category_id: string }>(
        "SELECT id,category_id FROM budgets WHERE dataset_id=$1",
        [datasetId],
      );
      expect(remaining.rows).toEqual([
        {
          id: choice === "keep_local" ? a.id : b.id,
          category_id: "expense-uncategorized",
        },
      ]);
    },
  );
  it("enforces references, system protection, and immutable SQL history", async () => {
    const { owner, datasetId } = await fixture();
    const value = transaction(v7(), "income-income");
    await expect(
      repository.push(owner, datasetId, [
        mutation("transaction", value.id, value),
      ]),
    ).rejects.toThrow("Invalid sync request");
    await expect(
      repository.push(owner, datasetId, [
        mutation("category", "expense-food", null, 4),
      ]),
    ).rejects.toThrow("Invalid sync request");
    await expect(
      pool.query(
        "DELETE FROM categories WHERE dataset_id=$1 AND id='expense-food'",
        [datasetId],
      ),
    ).rejects.toThrow("Protected category");
    await expect(
      pool.query("UPDATE sync_changes SET change='{}' WHERE dataset_id=$1", [
        datasetId,
      ]),
    ).rejects.toThrow("Immutable sync history");
  });
  it("persists validated rate cache values independently of sync records", async () => {
    const cache = new PostgresRateCache(pool);
    const key = `synthetic-${v7()}`;
    expect(await cache.get(key)).toBeNull();
    const value = {
      base: "USD" as const,
      quote: "COP" as const,
      rate: "4000",
      effectiveDate: "2026-10-04",
      fetchedAt: now,
      provider: "frankfurter-blended" as const,
      status: "fresh" as const,
    };
    await cache.set(key, value);
    expect(await cache.get(key)).toEqual(value);
  });
});
