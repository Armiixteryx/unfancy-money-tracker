import { createHash } from "node:crypto";
import { v7 } from "uuid";
import type { Pool, PoolClient } from "pg";
import type { Budget, Category, Transaction } from "../../domain/types";
import { seedDefaultCategories } from "../../domain/categories";
import {
  syncChangeSchema,
  syncedPreferencesSchema,
  type AcknowledgedChange,
  type BootstrapResponse,
  type PullResponse,
  type PushResponse,
  type ResolveConflictRequest,
  type SyncChange,
  type SyncConflict,
  type SyncRecordType,
} from "../contracts/sync";
import {
  sharedPullRequestSchema,
  sharedPullResponseSchema,
  sharedPushRequestSchema,
  sharedPushResponseSchema,
  sharedResolveRequestSchema,
  trackerScopeSchema,
  type SharedPullResponse,
  type SharedPushResponse,
  type SharedResolveRequest,
  type SharedPullRequest,
  type SharedPushRequest,
  type TrackerScope,
} from "../contracts/trackers";
import {
  DatasetAccessError,
  InvalidSyncPayloadError,
  type SyncRepository,
} from "./syncRepository";

type Metadata = {
  revision: string;
  deleted: boolean;
  edited_at: Date;
  committed_at: Date;
};
type MutationSender = { subject: string; membershipId: string | null };
type SharedAccess = {
  role: "admin" | "member";
  email: string;
  archived: boolean;
};
const tables = {
  category: "categories",
  transaction: "transactions",
  budget: "budgets",
  preference: "currency_preferences",
} as const;
// Stable hashing makes retries insensitive to JSON object-key order.
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const object = value as Record<string, unknown>;
  return `{${Object.keys(object)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(object[key])}`)
    .join(",")}}`;
}

export class PostgresSyncRepository implements SyncRepository {
  constructor(private readonly pool: Pool) {}
  private async transaction<T>(
    work: (client: PoolClient) => Promise<T>,
  ): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const result = await work(client);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }
  private async lock(client: PoolClient, owner: string, dataset: string) {
    const result = await client.query(
      "SELECT revision FROM datasets WHERE id=$1 AND owner_subject=$2 AND tracker_kind='personal' FOR UPDATE",
      [dataset, owner],
    );
    if (!result.rowCount) throw new DatasetAccessError();
  }
  private async lockSharedAccess(
    client: PoolClient,
    actor: string,
    rawScope: TrackerScope,
    mode: "UPDATE" | "SHARE" = "UPDATE",
  ): Promise<SharedAccess> {
    const scope = trackerScopeSchema.parse(rawScope);
    const dataset = await client.query<{ archived_at: Date | null }>(
      `SELECT archived_at FROM datasets WHERE id=$1 AND tracker_kind='shared' FOR ${mode}`,
      [scope.datasetId],
    );
    if (!dataset.rowCount) throw new Error("membership_revoked");
    // Membership edits serialize through the dataset lock. Querying afterward
    // prevents a join taken before a lock wait from authorizing stale rights.
    const membership = await client.query<{
      role: "admin" | "member";
      email: string;
    }>(
      `SELECT role,email FROM tracker_memberships WHERE dataset_id=$1
       AND subject=$2 AND membership_id=$3 AND revoked_at IS NULL`,
      [scope.datasetId, actor, scope.membershipId],
    );
    const row = membership.rows[0];
    if (!row) throw new Error("membership_revoked");
    return {
      role: row.role,
      email: row.email,
      archived: dataset.rows[0]!.archived_at !== null,
    };
  }

  private async canChangeSharedRecord(
    client: PoolClient,
    actor: string,
    role: SharedAccess["role"],
    dataset: string,
    change: SyncChange,
  ): Promise<boolean> {
    if (change.recordType !== "transaction") return role === "admin";
    if (role === "admin") return true;
    const owner = await client.query<{ creator_subject: string }>(
      `SELECT creator_subject FROM transaction_authorship
       WHERE dataset_id=$1 AND transaction_id=$2`,
      [dataset, change.recordId],
    );
    if (owner.rows[0]) return owner.rows[0].creator_subject === actor;
    const current = await client.query<{ exists: boolean }>(
      `SELECT EXISTS(SELECT 1 FROM transactions WHERE dataset_id=$1 AND id=$2) AS exists`,
      [dataset, change.recordId],
    );
    // A member can create a fresh record only. An existing legacy/imported
    // record without trusted creator metadata remains admin-managed.
    return !current.rows[0]?.exists && !change.tombstone;
  }

  private async readAttributions(
    client: PoolClient,
    dataset: string,
    changes: readonly SyncChange[],
    includeIds?: ReadonlySet<string>,
  ) {
    const ids = [...new Set(
      changes
        .filter((change) => change.recordType === "transaction")
        .map((change) => change.recordId)
        .filter((id) => !includeIds || includeIds.has(id)),
    )];
    if (!ids.length) return [];
    const rows = await client.query<{
      transaction_id: string;
      creator_subject: string;
      creator_email: string;
    }>(
      `SELECT transaction_id,creator_subject,creator_email FROM transaction_authorship
       WHERE dataset_id=$1 AND transaction_id=ANY($2::uuid[])`,
      [dataset, ids],
    );
    return rows.rows.map((row) => ({
      transactionId: row.transaction_id,
      creator: { subject: row.creator_subject, email: row.creator_email },
    }));
  }
  async bootstrap(owner: string): Promise<BootstrapResponse> {
    const result = await this.pool.query<{ id: string; revision: string }>(
      "INSERT INTO datasets(id,owner_subject) VALUES($1,$2) ON CONFLICT(owner_subject) DO UPDATE SET owner_subject=EXCLUDED.owner_subject RETURNING id,revision",
      [v7(), owner],
    );
    return {
      datasetId: result.rows[0]!.id,
      ownerSubject: owner,
      empty: Number(result.rows[0]!.revision) === 0,
    };
  }
  async push(
    owner: string,
    dataset: string,
    changes: readonly SyncChange[],
  ): Promise<PushResponse> {
    return this.transaction(async (client) => {
      await this.lock(client, owner, dataset);
      const acknowledgedChanges: AcknowledgedChange[] = [];
      const conflicts: SyncConflict[] = [];
      for (const raw of changes) {
        const change = syncChangeSchema.parse(raw);
        const outcome = await this.apply(client, dataset, change);
        if ("conflict" in outcome) conflicts.push(outcome.conflict);
        else acknowledgedChanges.push(outcome.acknowledgment);
      }
      return { acknowledgedChanges, conflicts };
    });
  }

  async pushShared(
    actor: string,
    request: SharedPushRequest,
  ): Promise<SharedPushResponse> {
    const parsed = sharedPushRequestSchema.parse(request);
    const scope = { datasetId: parsed.datasetId, membershipId: parsed.membershipId };
    return this.transaction(async (client) => {
      const access = await this.lockSharedAccess(client, actor, scope);
      const sender = { subject: actor, membershipId: parsed.membershipId };
      const acknowledgedChanges: AcknowledgedChange[] = [];
      const conflicts: SyncConflict[] = [];
      const rejectedChanges: SharedPushResponse["rejectedChanges"] = [];
      const attributedIds = new Set<string>();

      for (const raw of parsed.changes) {
        const change = syncChangeSchema.parse(raw);
        const hash = createHash("sha256")
          .update(canonicalJson(change))
          .digest("hex");
        await this.rememberRequest(
          client,
          parsed.datasetId,
          change.mutationId,
          hash,
          sender,
        );
        const prior = (
          await client.query<{
            request_hash: string;
            acknowledgment: AcknowledgedChange;
          }>(
            `SELECT request_hash,acknowledgment FROM mutation_acknowledgments
             WHERE dataset_id=$1 AND mutation_id=$2`,
            [parsed.datasetId, change.mutationId],
          )
        ).rows[0];
        if (prior) {
          if (prior.request_hash !== hash) throw new InvalidSyncPayloadError();
          acknowledgedChanges.push(prior.acknowledgment);
          if (change.recordType === "transaction")
            attributedIds.add(change.recordId);
          continue;
        }
        if (access.archived) {
          rejectedChanges.push({ mutationId: change.mutationId, code: "tracker_archived" });
          continue;
        }
        if (
          !(await this.canChangeSharedRecord(
            client,
            actor,
            access.role,
            parsed.datasetId,
            change,
          ))
        ) {
          rejectedChanges.push({ mutationId: change.mutationId, code: "permission_denied" });
          continue;
        }

        const previous = await this.current(
          client,
          parsed.datasetId,
          change.recordType,
          change.recordId,
        );
        const hasAuthorship =
          change.recordType === "transaction" &&
          ((await client.query(
            `SELECT 1 FROM transaction_authorship WHERE dataset_id=$1 AND transaction_id=$2`,
            [parsed.datasetId, change.recordId],
          )).rowCount ?? 0) > 0;
        const result = await this.apply(
          client,
          parsed.datasetId,
          change,
          hash,
          sender,
        );
        if ("conflict" in result) {
          conflicts.push(result.conflict);
          if (change.recordType === "transaction")
            attributedIds.add(change.recordId);
          continue;
        }
        acknowledgedChanges.push(result.acknowledgment);
        if (change.recordType === "transaction") {
          attributedIds.add(change.recordId);
          if (!change.tombstone && !hasAuthorship && !previous.payload) {
            await client.query(
              `INSERT INTO transaction_authorship
               (dataset_id,transaction_id,creator_subject,creator_email,creator_membership_id)
               VALUES($1,$2,$3,$4,$5) ON CONFLICT(dataset_id,transaction_id) DO NOTHING`,
              [parsed.datasetId, change.recordId, actor, access.email, parsed.membershipId],
            );
          }
        }
      }
      return sharedPushResponseSchema.parse({
        acknowledgedChanges,
        conflicts,
        rejectedChanges,
        attribution: await this.readAttributions(
          client,
          parsed.datasetId,
          parsed.changes,
          attributedIds,
        ),
      });
    });
  }

  async pull(
    owner: string,
    dataset: string,
    cursor: string,
    limit = 100,
  ): Promise<PullResponse> {
    if (
      !/^\d+$/.test(cursor) ||
      BigInt(cursor) > BigInt(Number.MAX_SAFE_INTEGER) ||
      limit < 1 ||
      limit > 200
    )
      throw new InvalidSyncPayloadError();
    const access = await this.pool.query(
      "SELECT id FROM datasets WHERE id=$1 AND owner_subject=$2",
      [dataset, owner],
    );
    if (!access.rowCount) throw new DatasetAccessError();
    const result = await this.pool.query<{ change: SyncChange }>(
      "SELECT change FROM sync_changes WHERE dataset_id=$1 AND revision>$2 ORDER BY revision LIMIT $3",
      [dataset, cursor, limit + 1],
    );
    const changes = result.rows
      .slice(0, limit)
      .map((row) => syncChangeSchema.parse(row.change));
    return {
      changes,
      cursor: changes.length
        ? String(changes[changes.length - 1]!.revision)
        : cursor,
      hasMore: result.rows.length > limit,
    };
  }

  async pullShared(
    actor: string,
    request: SharedPullRequest,
  ): Promise<SharedPullResponse> {
    const parsed = sharedPullRequestSchema.parse(request);
    if (
      !/^\d+$/.test(parsed.cursor) ||
      BigInt(parsed.cursor) > BigInt(Number.MAX_SAFE_INTEGER) ||
      (parsed.limit ?? 100) < 1 ||
      (parsed.limit ?? 100) > 200
    )
      throw new InvalidSyncPayloadError();
    const limit = parsed.limit ?? 100;
    return this.transaction(async (client) => {
      await this.lockSharedAccess(
        client,
        actor,
        { datasetId: parsed.datasetId, membershipId: parsed.membershipId },
        "SHARE",
      );
      const result = await client.query<{ change: SyncChange }>(
        `SELECT change FROM sync_changes WHERE dataset_id=$1 AND revision>$2
         ORDER BY revision LIMIT $3`,
        [parsed.datasetId, parsed.cursor, limit + 1],
      );
      const changes = result.rows
        .slice(0, limit)
        .map((row) => syncChangeSchema.parse(row.change));
      return sharedPullResponseSchema.parse({
        changes,
        cursor: changes.length
          ? String(changes[changes.length - 1]!.revision)
          : parsed.cursor,
        hasMore: result.rows.length > limit,
        attribution: await this.readAttributions(client, parsed.datasetId, changes),
      });
    });
  }
  private async current(
    client: PoolClient,
    dataset: string,
    type: SyncRecordType,
    id: string,
  ): Promise<{ metadata: Metadata | undefined; payload: unknown | null }> {
    const metadata = (
      await client.query<Metadata>(
        "SELECT * FROM sync_records WHERE dataset_id=$1 AND record_type=$2 AND record_id=$3",
        [dataset, type, id],
      )
    ).rows[0];
    if (!metadata || metadata.deleted) return { metadata, payload: null };
    const selection =
      type === "category"
        ? `jsonb_build_object('id',id,'kind',kind,'name',name,'isSystem',is_system,'isArchived',is_archived,'createdAt',created_at,'updatedAt',updated_at) || CASE WHEN default_category_key IS NULL THEN '{}'::jsonb ELSE jsonb_build_object('defaultCategoryKey',default_category_key) END`
        : type === "transaction"
          ? `jsonb_build_object('id',id,'amount',amount::text,'currency',currency,'type',type,'categoryId',category_id,'description',description,'date',to_char(date,'YYYY-MM-DD'),'createdAt',created_at,'updatedAt',updated_at)`
          : type === "budget"
            ? `jsonb_build_object('id',id,'amount',amount::text,'currency',currency,'categoryId',category_id,'month',to_char(month,'YYYY-MM'),'createdAt',created_at,'updatedAt',updated_at)`
            : `jsonb_build_object('baseCurrency',base_currency,'selectedCurrencies',selected_currencies)`;
    const result = await client.query<{ payload: unknown }>(
      `SELECT ${selection} AS payload FROM ${tables[type]} WHERE dataset_id=$1${type === "preference" ? "" : " AND id=$2"}`,
      type === "preference" ? [dataset] : [dataset, id],
    );
    // PostgreSQL JSON timestamps are normalized through the persisted record validators.
    const payload = result.rows[0]?.payload;
    if (payload && typeof payload === "object") {
      for (const key of ["createdAt", "updatedAt"])
        if (key in payload)
          (payload as Record<string, unknown>)[key] = new Date(
            String((payload as Record<string, unknown>)[key]),
          ).toISOString();
    }
    return { metadata, payload: payload ?? null };
  }
  private conflict(
    change: SyncChange,
    current: { metadata: Metadata | undefined; payload: unknown | null },
    cloudRecordId = change.recordId,
  ): SyncConflict {
    return {
      mutationId: change.mutationId,
      recordType: change.recordType,
      recordId: change.recordId,
      cloudRecordId,
      localRevision: change.baseRevision,
      cloudRevision: Number(current.metadata?.revision ?? 0),
      localPayload: change.payload,
      cloudPayload: current.payload,
      localDeleted: change.tombstone,
      cloudDeleted: current.metadata?.deleted ?? true,
      localEditedAt: change.editedAt,
      cloudEditedAt: current.metadata?.edited_at.toISOString() ?? null,
      cloudCommittedAt: current.metadata?.committed_at.toISOString() ?? null,
      reason:
        cloudRecordId === change.recordId
          ? "concurrent_edit"
          : "duplicate_budget",
      resolution: "pending",
    };
  }
  private async apply(
    client: PoolClient,
    dataset: string,
    change: SyncChange,
    requestHash?: string,
    sender?: MutationSender,
  ): Promise<
    { acknowledgment: AcknowledgedChange } | { conflict: SyncConflict }
  > {
    const hash =
      requestHash ??
      createHash("sha256").update(canonicalJson(change)).digest("hex");
    await this.rememberRequest(client, dataset, change.mutationId, hash, sender);
    const repeated = (
      await client.query<{
        request_hash: string;
        acknowledgment: AcknowledgedChange;
      }>(
        "SELECT request_hash,acknowledgment FROM mutation_acknowledgments WHERE dataset_id=$1 AND mutation_id=$2",
        [dataset, change.mutationId],
      )
    ).rows[0];
    if (repeated) {
      if (repeated.request_hash !== hash) throw new InvalidSyncPayloadError();
      return { acknowledgment: repeated.acknowledgment };
    }
    const current = await this.current(
      client,
      dataset,
      change.recordType,
      change.recordId,
    );
    if (Number(current.metadata?.revision ?? 0) !== change.baseRevision)
      return { conflict: this.conflict(change, current) };
    if (change.recordType === "budget" && !change.tombstone) {
      const budget = change.payload as Budget;
      const other = (
        await client.query<{ id: string }>(
          "SELECT id FROM budgets WHERE dataset_id=$1 AND category_id=$2 AND month=$3 AND id<>$4",
          [dataset, budget.categoryId, `${budget.month}-01`, budget.id],
        )
      ).rows[0];
      if (other)
        return {
          conflict: this.conflict(
            change,
            await this.current(client, dataset, "budget", other.id),
            other.id,
          ),
        };
    }
    if (
      change.recordType === "category" &&
      change.tombstone &&
      current.payload
    ) {
      const category = current.payload as Category;
      if (category.isSystem) throw new InvalidSyncPayloadError();
      const collision = (
        await client.query<{ local_id: string; cloud_id: string }>(
          "SELECT a.id AS local_id,b.id AS cloud_id FROM budgets a JOIN budgets b ON a.dataset_id=b.dataset_id AND a.month=b.month WHERE a.dataset_id=$1 AND a.category_id=$2 AND b.category_id=$3 ORDER BY a.month LIMIT 1",
          [dataset, change.recordId, `${category.kind}-uncategorized`],
        )
      ).rows[0];
      if (collision) {
        const local = await this.current(
          client,
          dataset,
          "budget",
          collision.local_id,
        );
        const proposed = {
          ...(local.payload as Budget),
          categoryId: `${category.kind}-uncategorized`,
          updatedAt: change.editedAt,
        };
        return {
          conflict: {
            ...this.conflict(
              {
                ...change,
                recordType: "budget",
                recordId: collision.local_id,
                operation: "upsert",
                tombstone: false,
                payload: proposed,
                baseRevision: Number(local.metadata?.revision ?? 0),
              },
              await this.current(client, dataset, "budget", collision.cloud_id),
              collision.cloud_id,
            ),
            categoryDeletionId: change.recordId,
          },
        };
      }
    }
    await this.writeRecord(client, dataset, change, current.payload);
    const acknowledgment = await this.append(client, dataset, change);
    await client.query(
      "INSERT INTO mutation_acknowledgments(dataset_id,mutation_id,request_hash,acknowledgment) VALUES($1,$2,$3,$4)",
      [dataset, change.mutationId, hash, JSON.stringify(acknowledgment)],
    );
    return { acknowledgment };
  }
  private async append(
    client: PoolClient,
    dataset: string,
    change: SyncChange,
  ): Promise<AcknowledgedChange> {
    const row = (
      await client.query<{ revision: string; committed_at: Date }>(
        "UPDATE datasets SET revision=revision+1 WHERE id=$1 RETURNING revision,clock_timestamp() AS committed_at",
        [dataset],
      )
    ).rows[0]!;
    const revision = Number(row.revision);
    const committedAt = row.committed_at.toISOString();
    await client.query(
      "INSERT INTO sync_records(dataset_id,record_type,record_id,revision,deleted,edited_at,committed_at) VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(dataset_id,record_type,record_id) DO UPDATE SET revision=EXCLUDED.revision,deleted=EXCLUDED.deleted,edited_at=EXCLUDED.edited_at,committed_at=EXCLUDED.committed_at",
      [
        dataset,
        change.recordType,
        change.recordId,
        revision,
        change.tombstone,
        change.editedAt,
        committedAt,
      ],
    );
    await client.query(
      "INSERT INTO sync_changes(dataset_id,revision,change) VALUES($1,$2,$3)",
      [dataset, revision, JSON.stringify({ ...change, revision, committedAt })],
    );
    return {
      mutationId: change.mutationId,
      recordType: change.recordType,
      recordId: change.recordId,
      revision,
      committedAt,
    };
  }
  private async writeRecord(
    client: PoolClient,
    dataset: string,
    change: SyncChange,
    previous: unknown,
  ) {
    const { recordType: type, recordId: id } = change;
    if (change.tombstone) {
      if (type === "preference") throw new InvalidSyncPayloadError();
      if (type === "category" && previous) {
        const category = previous as Category;
        if (category.isSystem) throw new InvalidSyncPayloadError();
        const fallback = `${category.kind}-uncategorized`;
        const present = await client.query(
          "SELECT id FROM categories WHERE dataset_id=$1 AND id=$2",
          [dataset, fallback],
        );
        if (!present.rowCount) throw new InvalidSyncPayloadError();
        // Reassign dependents and publish each server revision in the same dataset transaction.
        for (const dependent of ["transaction", "budget"] as const) {
          const rows = await client.query<{ id: string }>(
            `SELECT id FROM ${tables[dependent]} WHERE dataset_id=$1 AND category_id=$2`,
            [dataset, id],
          );
          if (dependent === "budget" && rows.rowCount) {
            const duplicates = await client.query(
              "SELECT 1 FROM budgets a JOIN budgets b ON a.dataset_id=b.dataset_id AND a.month=b.month WHERE a.dataset_id=$1 AND a.category_id=$2 AND b.category_id=$3",
              [dataset, id, fallback],
            );
            if (duplicates.rowCount) throw new InvalidSyncPayloadError();
          }
          for (const row of rows.rows) {
            const old = await this.current(client, dataset, dependent, row.id);
            const payload = {
              ...(old.payload as Transaction | Budget),
              categoryId: fallback,
              updatedAt: change.editedAt,
            };
            await client.query(
              `UPDATE ${tables[dependent]} SET category_id=$3,updated_at=$4 WHERE dataset_id=$1 AND id=$2`,
              [dataset, row.id, fallback, change.editedAt],
            );
            await this.append(client, dataset, {
              ...change,
              mutationId: v7(),
              recordType: dependent,
              recordId: row.id,
              operation: "upsert",
              tombstone: false,
              payload,
              baseRevision: Number(old.metadata?.revision ?? 0),
            });
          }
        }
      }
      await client.query(
        `DELETE FROM ${tables[type]} WHERE dataset_id=$1 AND id=$2`,
        [dataset, id],
      );
      return;
    }
    if (type === "category") {
      const value = change.payload as Category;
      if (
        previous &&
        ((previous as Category).kind !== value.kind ||
          (previous as Category).createdAt !== value.createdAt)
      )
        throw new InvalidSyncPayloadError();
      if (value.isSystem) {
        const expected = seedDefaultCategories().find(
          (category) => category.id === value.id,
        );
        if (
          !expected ||
          expected.name !== value.name ||
          expected.kind !== value.kind ||
          expected.defaultCategoryKey !== value.defaultCategoryKey ||
          value.isArchived
        )
          throw new InvalidSyncPayloadError();
        if (
          previous &&
          canonicalJson({
            ...(previous as Category),
            createdAt: value.createdAt,
            updatedAt: value.updatedAt,
          }) !== canonicalJson(value)
        )
          throw new InvalidSyncPayloadError();
      } else if (
        (previous as Category | null)?.isSystem ||
        value.id !== id ||
        !/^[0-9a-f-]{14}7/.test(id)
      )
        throw new InvalidSyncPayloadError();
      await client.query(
        "INSERT INTO categories VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT(dataset_id,id) DO UPDATE SET name=EXCLUDED.name,is_archived=EXCLUDED.is_archived,updated_at=EXCLUDED.updated_at",
        [
          dataset,
          id,
          value.kind,
          value.name,
          value.defaultCategoryKey ?? null,
          value.isSystem,
          value.isArchived,
          value.createdAt,
          value.updatedAt,
        ],
      );
    } else if (type === "transaction" || type === "budget") {
      const value = change.payload as Transaction | Budget;
      if (
        previous &&
        (previous as Transaction | Budget).createdAt !== value.createdAt
      )
        throw new InvalidSyncPayloadError();
      const category = (
        await client.query<{ kind: string; is_archived: boolean }>(
          "SELECT kind,is_archived FROM categories WHERE dataset_id=$1 AND id=$2",
          [dataset, value.categoryId],
        )
      ).rows[0];
      const oldCategory = (previous as Transaction | Budget | null)?.categoryId;
      if (
        !category ||
        category.kind !==
          (type === "budget" ? "expense" : (value as Transaction).type) ||
        (category.is_archived && oldCategory !== value.categoryId)
      )
        throw new InvalidSyncPayloadError();
      if (type === "transaction") {
        const transaction = value as Transaction;
        await client.query(
          "INSERT INTO transactions VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) ON CONFLICT(dataset_id,id) DO UPDATE SET amount=EXCLUDED.amount,currency=EXCLUDED.currency,type=EXCLUDED.type,category_id=EXCLUDED.category_id,description=EXCLUDED.description,date=EXCLUDED.date,updated_at=EXCLUDED.updated_at",
          [
            dataset,
            id,
            transaction.amount,
            transaction.currency,
            transaction.type,
            transaction.categoryId,
            transaction.description,
            transaction.date,
            transaction.createdAt,
            transaction.updatedAt,
          ],
        );
      } else {
        const budget = value as Budget;
        await client.query(
          "INSERT INTO budgets(dataset_id,id,category_id,month,amount,currency,created_at,updated_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT(dataset_id,id) DO UPDATE SET category_id=EXCLUDED.category_id,month=EXCLUDED.month,amount=EXCLUDED.amount,currency=EXCLUDED.currency,updated_at=EXCLUDED.updated_at",
          [
            dataset,
            id,
            budget.categoryId,
            `${budget.month}-01`,
            budget.amount,
            budget.currency,
            budget.createdAt,
            budget.updatedAt,
          ],
        );
      }
    } else {
      const value = syncedPreferencesSchema.parse(change.payload);
      await client.query(
        "INSERT INTO currency_preferences VALUES($1,$2,$3) ON CONFLICT(dataset_id) DO UPDATE SET base_currency=EXCLUDED.base_currency,selected_currencies=EXCLUDED.selected_currencies",
        [dataset, value.baseCurrency, value.selectedCurrencies],
      );
    }
  }

  async resolveConflictShared(
    actor: string,
    request: SharedResolveRequest,
  ): Promise<SharedPushResponse> {
    const parsed = sharedResolveRequestSchema.parse(request);
    const { membershipId, ...financialRequest } = parsed;
    const sender = { subject: actor, membershipId };
    const hash = createHash("sha256")
      .update(canonicalJson(financialRequest))
      .digest("hex");
    return this.transaction(async (client) => {
      const access = await this.lockSharedAccess(client, actor, {
        datasetId: parsed.datasetId,
        membershipId,
      });
      await this.rememberRequest(
        client,
        parsed.datasetId,
        parsed.mutationId,
        hash,
        sender,
      );
      const prior = (
        await client.query<{
          acknowledgment: AcknowledgedChange;
          request_hash: string;
        }>(
          `SELECT acknowledgment,request_hash FROM mutation_acknowledgments
           WHERE dataset_id=$1 AND mutation_id=$2`,
          [parsed.datasetId, parsed.mutationId],
        )
      ).rows[0];
      if (prior) {
        if (prior.request_hash !== hash) throw new InvalidSyncPayloadError();
        const response = {
          acknowledgedChanges: [prior.acknowledgment],
          conflicts: [],
          rejectedChanges: [],
          attribution: await this.readAttributions(
            client,
            parsed.datasetId,
            [
              {
                recordType: parsed.conflict.recordType,
                recordId: parsed.conflict.recordId,
              } as SyncChange,
            ],
          ),
        };
        return sharedPushResponseSchema.parse(response);
      }
      if (access.archived)
        return sharedPushResponseSchema.parse({
          acknowledgedChanges: [],
          conflicts: [],
          rejectedChanges: [{ mutationId: parsed.mutationId, code: "tracker_archived" }],
          attribution: [],
        });

      const conflict = parsed.conflict;
      const change = syncChangeSchema.parse({
        mutationId: parsed.mutationId,
        recordType: conflict.recordType,
        recordId: conflict.recordId,
        operation: conflict.localDeleted ? "delete" : "upsert",
        tombstone: conflict.localDeleted,
        payload: conflict.localPayload,
        baseRevision:
          conflict.reason === "duplicate_budget"
            ? conflict.localRevision
            : conflict.cloudRevision,
        editedAt: parsed.editedAt,
        revision: 0,
        committedAt: null,
      });
      if (
        !(await this.canChangeSharedRecord(
          client,
          actor,
          access.role,
          parsed.datasetId,
          change,
        ))
      )
        return sharedPushResponseSchema.parse({
          acknowledgedChanges: [],
          conflicts: [],
          rejectedChanges: [{ mutationId: parsed.mutationId, code: "permission_denied" }],
          attribution: [],
        });

      const current = await this.current(
        client,
        parsed.datasetId,
        conflict.recordType,
        conflict.cloudRecordId,
      );
      if (conflict.reason === "duplicate_budget") {
        if (
          conflict.recordType !== "budget" ||
          conflict.recordId === conflict.cloudRecordId ||
          conflict.localDeleted
        )
          throw new InvalidSyncPayloadError();
      } else if (conflict.recordId !== conflict.cloudRecordId)
        throw new InvalidSyncPayloadError();

      if (Number(current.metadata?.revision ?? 0) !== conflict.cloudRevision)
        return sharedPushResponseSchema.parse({
          acknowledgedChanges: [],
          conflicts: [
            {
              ...this.conflict(change, current, conflict.cloudRecordId),
              categoryDeletionId: conflict.categoryDeletionId,
            },
          ],
          rejectedChanges: [],
          attribution: await this.readAttributions(
            client,
            parsed.datasetId,
            [change],
          ),
        });

      if (conflict.reason === "duplicate_budget") {
        const local = await this.current(
          client,
          parsed.datasetId,
          "budget",
          conflict.recordId,
        );
        if (Number(local.metadata?.revision ?? 0) !== conflict.localRevision)
          return sharedPushResponseSchema.parse({
            acknowledgedChanges: [],
            conflicts: [this.conflict(change, local)],
            rejectedChanges: [],
            attribution: [],
          });
        if (
          conflict.categoryDeletionId &&
          ((local.payload as Budget | null)?.categoryId !==
            conflict.categoryDeletionId ||
            (change.payload as Budget).categoryId !== "expense-uncategorized")
        )
          throw new InvalidSyncPayloadError();
        if (parsed.choice === "keep_local") {
          await this.writeRecord(
            client,
            parsed.datasetId,
            {
              ...change,
              recordId: conflict.cloudRecordId,
              tombstone: true,
              operation: "delete",
              payload: null,
            },
            current.payload,
          );
          await this.append(client, parsed.datasetId, {
            ...change,
            mutationId: v7(),
            recordId: conflict.cloudRecordId,
            tombstone: true,
            operation: "delete",
            payload: null,
          });
        } else {
          change.payload = conflict.categoryDeletionId ? null : local.payload;
          change.tombstone = conflict.categoryDeletionId
            ? true
            : (local.metadata?.deleted ?? true);
          change.operation = change.tombstone ? "delete" : "upsert";
        }
        await this.writeRecord(client, parsed.datasetId, change, local.payload);
        const acknowledgment = await this.append(client, parsed.datasetId, change);
        await client.query(
          "INSERT INTO mutation_acknowledgments VALUES($1,$2,$3,$4)",
          [parsed.datasetId, parsed.mutationId, hash, JSON.stringify(acknowledgment)],
        );
        return sharedPushResponseSchema.parse({
          acknowledgedChanges: [acknowledgment],
          conflicts: [],
          rejectedChanges: [],
          attribution: [],
        });
      }
      if (parsed.choice === "keep_cloud") {
        change.payload = current.payload;
        change.tombstone = current.metadata?.deleted ?? true;
        change.operation = change.tombstone ? "delete" : "upsert";
      }
      const result = await this.apply(
        client,
        parsed.datasetId,
        syncChangeSchema.parse(change),
        hash,
        sender,
      );
      if (
        !("conflict" in result) &&
        change.recordType === "transaction" &&
        !change.tombstone &&
        !current.payload
      ) {
        await client.query(
          `INSERT INTO transaction_authorship
           (dataset_id,transaction_id,creator_subject,creator_email,creator_membership_id)
           VALUES($1,$2,$3,$4,$5) ON CONFLICT(dataset_id,transaction_id) DO NOTHING`,
          [parsed.datasetId, change.recordId, actor, access.email, membershipId],
        );
      }
      return sharedPushResponseSchema.parse({
        acknowledgedChanges: "conflict" in result ? [] : [result.acknowledgment],
        conflicts: "conflict" in result ? [result.conflict] : [],
        rejectedChanges: [],
        attribution: await this.readAttributions(
          client,
          parsed.datasetId,
          [change],
        ),
      });
    });
  }

  async resolveConflict(
    owner: string,
    request: ResolveConflictRequest,
  ): Promise<PushResponse> {
    return this.transaction(async (client) => {
      await this.lock(client, owner, request.datasetId);
      const hash = createHash("sha256")
        .update(canonicalJson(request))
        .digest("hex");
      await this.rememberRequest(
        client,
        request.datasetId,
        request.mutationId,
        hash,
      );
      const prior = (
        await client.query<{
          acknowledgment: AcknowledgedChange;
          request_hash: string;
        }>(
          "SELECT acknowledgment,request_hash FROM mutation_acknowledgments WHERE dataset_id=$1 AND mutation_id=$2",
          [request.datasetId, request.mutationId],
        )
      ).rows[0];
      if (prior) {
        if (prior.request_hash !== hash) throw new InvalidSyncPayloadError();
        return { acknowledgedChanges: [prior.acknowledgment], conflicts: [] };
      }
      const conflict = request.conflict;
      const current = await this.current(
        client,
        request.datasetId,
        conflict.recordType,
        conflict.cloudRecordId,
      );
      const change = syncChangeSchema.parse({
        mutationId: request.mutationId,
        recordType: conflict.recordType,
        recordId: conflict.recordId,
        operation: conflict.localDeleted ? "delete" : "upsert",
        tombstone: conflict.localDeleted,
        payload: conflict.localPayload,
        baseRevision:
          conflict.reason === "duplicate_budget"
            ? conflict.localRevision
            : conflict.cloudRevision,
        editedAt: request.editedAt,
        revision: 0,
        committedAt: null,
      });
      if (conflict.reason === "duplicate_budget") {
        if (
          conflict.recordType !== "budget" ||
          conflict.recordId === conflict.cloudRecordId ||
          conflict.localDeleted
        )
          throw new InvalidSyncPayloadError();
      } else if (conflict.recordId !== conflict.cloudRecordId)
        throw new InvalidSyncPayloadError();
      if (Number(current.metadata?.revision ?? 0) !== conflict.cloudRevision)
        return {
          acknowledgedChanges: [],
          conflicts: [
            {
              ...this.conflict(change, current, conflict.cloudRecordId),
              categoryDeletionId: conflict.categoryDeletionId,
            },
          ],
        };
      if (conflict.reason === "duplicate_budget") {
        const local = await this.current(
          client,
          request.datasetId,
          "budget",
          conflict.recordId,
        );
        if (Number(local.metadata?.revision ?? 0) !== conflict.localRevision)
          return {
            acknowledgedChanges: [],
            conflicts: [this.conflict(change, local)],
          };
        if (
          conflict.categoryDeletionId &&
          ((local.payload as Budget | null)?.categoryId !==
            conflict.categoryDeletionId ||
            (change.payload as Budget).categoryId !== "expense-uncategorized")
        )
          throw new InvalidSyncPayloadError();
        if (request.choice === "keep_local") {
          await this.writeRecord(
            client,
            request.datasetId,
            {
              ...change,
              recordId: conflict.cloudRecordId,
              tombstone: true,
              operation: "delete",
              payload: null,
            },
            current.payload,
          );
          await this.append(client, request.datasetId, {
            ...change,
            mutationId: v7(),
            recordId: conflict.cloudRecordId,
            tombstone: true,
            operation: "delete",
            payload: null,
          });
        } else {
          // Publish the discarded proposal's cloud state, even when it never existed.
          // This lets every client remove it or restore its previous month through pull.
          change.payload = conflict.categoryDeletionId ? null : local.payload;
          change.tombstone = conflict.categoryDeletionId
            ? true
            : (local.metadata?.deleted ?? true);
          change.operation = change.tombstone ? "delete" : "upsert";
        }
        await this.writeRecord(
          client,
          request.datasetId,
          change,
          local.payload,
        );
        const acknowledgment = await this.append(
          client,
          request.datasetId,
          change,
        );
        await client.query(
          "INSERT INTO mutation_acknowledgments VALUES($1,$2,$3,$4)",
          [
            request.datasetId,
            request.mutationId,
            hash,
            JSON.stringify(acknowledgment),
          ],
        );
        return { acknowledgedChanges: [acknowledgment], conflicts: [] };
      }
      if (request.choice === "keep_cloud") {
        change.payload = current.payload;
        change.tombstone = current.metadata?.deleted ?? true;
        change.operation = change.tombstone ? "delete" : "upsert";
      }
      const result = await this.apply(
        client,
        request.datasetId,
        syncChangeSchema.parse(change),
        hash,
      );
      return "conflict" in result
        ? { acknowledgedChanges: [], conflicts: [result.conflict] }
        : { acknowledgedChanges: [result.acknowledgment], conflicts: [] };
    });
  }
  private async rememberRequest(
    client: PoolClient,
    dataset: string,
    mutationId: string,
    hash: string,
    sender?: MutationSender,
  ) {
    const previous = (
      await client.query<{
        request_hash: string;
        sender_subject: string | null;
        membership_id: string | null;
      }>(
        "SELECT request_hash,sender_subject,membership_id FROM mutation_requests WHERE dataset_id=$1 AND mutation_id=$2",
        [dataset, mutationId],
      )
    ).rows[0];
    if (previous) {
      if (previous.request_hash !== hash) throw new InvalidSyncPayloadError();
      if (
        sender &&
        (previous.sender_subject !== sender.subject ||
          previous.membership_id !== sender.membershipId)
      )
        throw new InvalidSyncPayloadError();
      return;
    }
    await client.query(
      `INSERT INTO mutation_requests(dataset_id,mutation_id,request_hash,sender_subject,membership_id)
       VALUES($1,$2,$3,$4,$5)`,
      [dataset, mutationId, hash, sender?.subject ?? null, sender?.membershipId ?? null],
    );
  }
}
