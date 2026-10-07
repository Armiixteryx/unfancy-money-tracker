import { v7 } from "uuid";
import type { Pool, PoolClient } from "pg";
import { seedDefaultCategories } from "../../domain/categories";
import {
  syncedPreferencesSchema,
  type SyncChange,
} from "../contracts/sync";
import {
  createTrackerRequestSchema,
  inviteTrackerRequestSchema,
  invitationPreviewSchema,
  memberRoleRequestSchema,
  removeMemberRequestSchema,
  renameTrackerRequestSchema,
  revokeInvitationRequestSchema,
  trackerScopeSchema,
  trackerSummarySchema,
  type InvitationPreview,
  type TrackerMember,
  type TrackerRole,
  type TrackerScope,
  type TrackerSummary,
} from "../contracts/trackers";

export type TrackerErrorCode =
  | "membership_revoked"
  | "permission_denied"
  | "tracker_archived"
  | "last_admin"
  | "invitation_invalid"
  | "invitee_unavailable";

export class TrackerRepositoryError extends Error {
  constructor(readonly code: TrackerErrorCode) {
    super(code);
    this.name = "TrackerRepositoryError";
  }
}

type Membership = {
  membership_id: string;
  subject: string;
  email: string;
  role: TrackerRole;
};

type DatasetRow = {
  id: string;
  tracker_kind: "personal" | "shared";
  tracker_name: string;
  archived_at: Date | null;
  revision: string;
};

async function inTransaction<T>(
  pool: Pool,
  work: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await work(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    if (
      error &&
      typeof error === "object" &&
      "message" in error &&
      error.message === "Last tracker admin"
    )
      throw new TrackerRepositoryError("last_admin");
    throw error;
  } finally {
    client.release();
  }
}

function summary(
  row: DatasetRow & { role: TrackerRole; membership_id: string | null },
): TrackerSummary {
  return trackerSummarySchema.parse({
    datasetId: row.id,
    kind: row.tracker_kind,
    name: row.tracker_name,
    role: row.role,
    membershipId: row.membership_id,
    archived: row.archived_at !== null,
  });
}

export class PostgresTrackerRepository {
  constructor(private readonly pool: Pool) {}

  private async lockScope(
    client: PoolClient,
    actor: string,
    scope: TrackerScope,
  ): Promise<{ dataset: DatasetRow; membership: Membership }> {
    const parsed = trackerScopeSchema.parse({
      datasetId: scope.datasetId,
      membershipId: scope.membershipId,
    });
    const datasetResult = await client.query<DatasetRow>(
      `SELECT id,tracker_kind,tracker_name,archived_at,revision FROM datasets
       WHERE id=$1 AND tracker_kind='shared' FOR UPDATE`,
      [parsed.datasetId],
    );
    const dataset = datasetResult.rows[0];
    if (!dataset) throw new TrackerRepositoryError("membership_revoked");
    // Read membership only after acquiring the dataset lock. Membership changes
    // take this same lock, so role and generation are current for this operation.
    const membershipResult = await client.query<Membership>(
      `SELECT membership_id,subject,email,role FROM tracker_memberships
       WHERE dataset_id=$1 AND subject=$2 AND membership_id=$3 AND revoked_at IS NULL`,
      [parsed.datasetId, actor, parsed.membershipId],
    );
    const membership = membershipResult.rows[0];
    if (!membership) throw new TrackerRepositoryError("membership_revoked");
    return {
      dataset,
      membership,
    };
  }

  private requireAdmin(membership: Membership) {
    if (membership.role !== "admin")
      throw new TrackerRepositoryError("permission_denied");
  }

  private requireActive(dataset: DatasetRow) {
    if (dataset.archived_at)
      throw new TrackerRepositoryError("tracker_archived");
  }

  async assertAdmin(actor: string, scope: TrackerScope): Promise<void> {
    await inTransaction(this.pool, async (client) => {
      const { dataset, membership } = await this.lockScope(client, actor, scope);
      this.requireAdmin(membership);
      this.requireActive(dataset);
    });
  }

  async authorizeActiveMember(actor: string, scope: TrackerScope): Promise<void> {
    await inTransaction(this.pool, async (client) => {
      const { dataset } = await this.lockScope(client, actor, scope);
      this.requireActive(dataset);
    });
  }

  async list(actor: string): Promise<TrackerSummary[]> {
    const result = await this.pool.query<
      DatasetRow & { role: TrackerRole; membership_id: string | null }
    >(
      `SELECT id,tracker_kind,tracker_name,archived_at,revision,
              'admin'::text AS role,NULL::uuid AS membership_id
       FROM datasets WHERE tracker_kind='personal' AND owner_subject=$1
       UNION ALL
       SELECT d.id,d.tracker_kind,d.tracker_name,d.archived_at,d.revision,
              m.role,m.membership_id
       FROM datasets d JOIN tracker_memberships m ON m.dataset_id=d.id
       WHERE d.tracker_kind='shared' AND m.subject=$1 AND m.revoked_at IS NULL
       ORDER BY tracker_kind,tracker_name,id`,
      [actor],
    );
    return result.rows.map(summary);
  }

  async create(
    actor: string,
    actorEmail: string,
    request: unknown,
  ): Promise<TrackerSummary> {
    const parsed = createTrackerRequestSchema.parse(request);
    const currencies = syncedPreferencesSchema.parse(parsed.currencies);
    const datasetId = v7();
    const membershipId = v7();
    return inTransaction(this.pool, async (client) => {
      await client.query(
        `INSERT INTO datasets(id,owner_subject,tracker_kind,tracker_name)
         VALUES($1,NULL,'shared',$2)`,
        [datasetId, parsed.name],
      );
      await client.query(
        `INSERT INTO tracker_memberships(membership_id,dataset_id,subject,email,role)
         VALUES($1,$2,$3,$4,'admin')`,
        [membershipId, datasetId, actor, validEmail(actorEmail)],
      );

      const categories = seedDefaultCategories(undefined, new Date().toISOString());
      for (const category of categories) {
        await client.query(
          `INSERT INTO categories(dataset_id,id,kind,name,default_category_key,is_system,is_archived,created_at,updated_at)
           VALUES($1,$2,$3,$4,$5,true,false,$6,$7)`,
          [
            datasetId,
            category.id,
            category.kind,
            category.name,
            category.defaultCategoryKey,
            category.createdAt,
            category.updatedAt,
          ],
        );
        await this.appendInitial(client, datasetId, {
          mutationId: v7(),
          recordType: "category",
          recordId: category.id,
          operation: "upsert",
          baseRevision: 0,
          payload: category,
          tombstone: false,
          editedAt: category.updatedAt,
          revision: 0,
          committedAt: null,
        });
      }

      await client.query(
        "INSERT INTO currency_preferences(dataset_id,base_currency,selected_currencies) VALUES($1,$2,$3)",
        [datasetId, currencies.baseCurrency, currencies.selectedCurrencies],
      );
      await this.appendInitial(client, datasetId, {
        mutationId: v7(),
        recordType: "preference",
        recordId: "currency",
        operation: "upsert",
        baseRevision: 0,
        payload: currencies,
        tombstone: false,
        editedAt: new Date().toISOString(),
        revision: 0,
        committedAt: null,
      });

      const created = await client.query<DatasetRow>(
        "SELECT id,tracker_kind,tracker_name,archived_at,revision FROM datasets WHERE id=$1",
        [datasetId],
      );
      return summary({
        ...created.rows[0]!,
        role: "admin",
        membership_id: membershipId,
      });
    });
  }

  private async appendInitial(
    client: PoolClient,
    datasetId: string,
    change: SyncChange,
  ): Promise<void> {
    const next = await client.query<{ revision: string; committed_at: Date }>(
      "UPDATE datasets SET revision=revision+1 WHERE id=$1 RETURNING revision,clock_timestamp() AS committed_at",
      [datasetId],
    );
    const row = next.rows[0]!;
    const revision = Number(row.revision);
    const committedAt = row.committed_at.toISOString();
    await client.query(
      `INSERT INTO sync_records(dataset_id,record_type,record_id,revision,deleted,edited_at,committed_at)
       VALUES($1,$2,$3,$4,false,$5,$6)`,
      [datasetId, change.recordType, change.recordId, revision, change.editedAt, committedAt],
    );
    await client.query(
      "INSERT INTO sync_changes(dataset_id,revision,change) VALUES($1,$2,$3)",
      [datasetId, revision, JSON.stringify({ ...change, revision, committedAt })],
    );
  }

  async rename(
    actor: string,
    request: unknown,
  ): Promise<TrackerSummary> {
    const parsed = renameTrackerRequestSchema.parse(request);
    return inTransaction(this.pool, async (client) => {
      const { dataset, membership } = await this.lockScope(client, actor, {
        datasetId: parsed.datasetId, membershipId: parsed.membershipId,
      });
      this.requireAdmin(membership);
      await client.query("UPDATE datasets SET tracker_name=$2 WHERE id=$1", [
        parsed.datasetId,
        parsed.name,
      ]);
      return summary({ ...dataset, tracker_name: parsed.name, role: membership.role, membership_id: membership.membership_id });
    });
  }

  async archive(
    actor: string,
    scope: TrackerScope,
    restore = false,
  ): Promise<TrackerSummary> {
    const parsed = trackerScopeSchema.parse(scope);
    return inTransaction(this.pool, async (client) => {
      const { dataset, membership } = await this.lockScope(client, actor, parsed);
      this.requireAdmin(membership);
      await client.query(
        restore
          ? "UPDATE datasets SET archived_at=NULL WHERE id=$1"
          : "UPDATE datasets SET archived_at=COALESCE(archived_at,clock_timestamp()) WHERE id=$1",
        [parsed.datasetId],
      );
      return summary({
        ...dataset,
        archived_at: restore ? null : dataset.archived_at ?? new Date(),
        role: membership.role,
        membership_id: membership.membership_id,
      });
    });
  }

  async leave(actor: string, scope: TrackerScope): Promise<void> {
    const parsed = trackerScopeSchema.parse(scope);
    await inTransaction(this.pool, async (client) => {
      const { membership } = await this.lockScope(client, actor, {
        datasetId: parsed.datasetId, membershipId: parsed.membershipId,
      });
      await client.query(
        `UPDATE tracker_memberships SET revoked_at=clock_timestamp(),revoked_by_subject=$2
         WHERE membership_id=$1 AND revoked_at IS NULL`,
        [membership.membership_id, actor],
      );
    });
  }

  async members(actor: string, scope: TrackerScope): Promise<TrackerMember[]> {
    const parsed = trackerScopeSchema.parse(scope);
    return inTransaction(this.pool, async (client) => {
      await this.lockScope(client, actor, { datasetId: parsed.datasetId, membershipId: parsed.membershipId });
      const result = await client.query<Membership>(
        `SELECT membership_id,subject,email,role FROM tracker_memberships
         WHERE dataset_id=$1 AND revoked_at IS NULL ORDER BY created_at,subject`,
        [parsed.datasetId],
      );
      return result.rows.map((member) => ({
        membershipId: member.membership_id,
        subject: member.subject,
        email: member.email,
        role: member.role,
      }));
    });
  }

  async setRole(actor: string, request: unknown): Promise<void> {
    const parsed = memberRoleRequestSchema.parse(request);
    await inTransaction(this.pool, async (client) => {
      const { membership } = await this.lockScope(client, actor, {
        datasetId: parsed.datasetId, membershipId: parsed.membershipId,
      });
      this.requireAdmin(membership);
      const result = await client.query(
        `UPDATE tracker_memberships SET role=$3 WHERE dataset_id=$1
         AND membership_id=$2 AND revoked_at IS NULL`,
        [parsed.datasetId, parsed.targetMembershipId, parsed.role],
      );
      if (!result.rowCount) throw new TrackerRepositoryError("invitee_unavailable");
    });
  }

  async removeMember(actor: string, request: unknown): Promise<void> {
    const parsed = removeMemberRequestSchema.parse(request);
    await inTransaction(this.pool, async (client) => {
      const { membership } = await this.lockScope(client, actor, {
        datasetId: parsed.datasetId, membershipId: parsed.membershipId,
      });
      this.requireAdmin(membership);
      const result = await client.query(
        `UPDATE tracker_memberships SET revoked_at=clock_timestamp(),revoked_by_subject=$3
         WHERE dataset_id=$1 AND membership_id=$2 AND revoked_at IS NULL`,
        [parsed.datasetId, parsed.targetMembershipId, actor],
      );
      if (!result.rowCount) throw new TrackerRepositoryError("invitee_unavailable");
    });
  }

  async createInvitation(
    actor: string,
    request: unknown,
    target: { subject: string; email: string },
    tokenHash: string,
  ) {
    const parsed = inviteTrackerRequestSchema.parse(request);
    if (!/^[0-9a-f]{64}$/.test(tokenHash))
      throw new TrackerRepositoryError("invitation_invalid");
    const invitationId = v7();
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    const email = validEmail(target.email);
    return inTransaction(this.pool, async (client) => {
      const { dataset, membership } = await this.lockScope(client, actor, {
        datasetId: parsed.datasetId, membershipId: parsed.membershipId,
      });
      this.requireAdmin(membership);
      this.requireActive(dataset);
      await client.query(
        `UPDATE tracker_invitations SET revoked_at=clock_timestamp()
         WHERE dataset_id=$1 AND accepted_at IS NULL AND revoked_at IS NULL
           AND expires_at<=clock_timestamp()`,
        [parsed.datasetId],
      );
      const alreadyMember = await client.query(
        `SELECT 1 FROM tracker_memberships WHERE dataset_id=$1 AND subject=$2 AND revoked_at IS NULL`,
        [parsed.datasetId, target.subject],
      );
      if (alreadyMember.rowCount)
        throw new TrackerRepositoryError("invitee_unavailable");
      // Reissuing replaces any pending invitation for this account. This also
      // lets an admin recover cleanly if a previous response was interrupted.
      await client.query(
        `UPDATE tracker_invitations SET revoked_at=clock_timestamp()
         WHERE dataset_id=$1 AND target_subject=$2
           AND accepted_at IS NULL AND revoked_at IS NULL`,
        [parsed.datasetId, target.subject],
      );
      await client.query(
        `INSERT INTO tracker_invitations(invitation_id,dataset_id,token_hash,target_subject,target_email,role,invited_by_subject,expires_at)
         VALUES($1,$2,$3,$4,$5,$6,$7,$8)`,
        [invitationId, parsed.datasetId, tokenHash, target.subject, email, parsed.role, actor, expiresAt],
      );
      return { invitationId, expiresAt: expiresAt.toISOString() };
    });
  }

  async revokeInvitation(actor: string, request: unknown): Promise<void> {
    const parsed = revokeInvitationRequestSchema.parse(request);
    await inTransaction(this.pool, async (client) => {
      const { membership } = await this.lockScope(client, actor, {
        datasetId: parsed.datasetId, membershipId: parsed.membershipId,
      });
      this.requireAdmin(membership);
      const result = await client.query(
        `UPDATE tracker_invitations SET revoked_at=clock_timestamp()
         WHERE dataset_id=$1 AND invitation_id=$2 AND accepted_at IS NULL AND revoked_at IS NULL`,
        [parsed.datasetId, parsed.invitationId],
      );
      if (!result.rowCount)
        throw new TrackerRepositoryError("invitation_invalid");
    });
  }

  async previewInvitation(actor: string, tokenHash: string): Promise<InvitationPreview> {
    if (!/^[0-9a-f]{64}$/.test(tokenHash))
      throw new TrackerRepositoryError("invitation_invalid");
    const result = await this.pool.query<{
      tracker_name: string;
      role: TrackerRole;
      expires_at: Date;
    }>(
      `SELECT d.tracker_name,i.role,i.expires_at FROM tracker_invitations i
       JOIN datasets d ON d.id=i.dataset_id
       WHERE i.token_hash=$1 AND i.target_subject=$2 AND i.accepted_at IS NULL
         AND i.revoked_at IS NULL AND i.expires_at>clock_timestamp()
         AND d.tracker_kind='shared' AND d.archived_at IS NULL`,
      [tokenHash, actor],
    );
    const invitation = result.rows[0];
    if (!invitation) throw new TrackerRepositoryError("invitation_invalid");
    return invitationPreviewSchema.parse({
      name: invitation.tracker_name,
      role: invitation.role,
      expiresAt: invitation.expires_at.toISOString(),
    });
  }

  async acceptInvitation(
    actor: string,
    actorEmail: string,
    tokenHash: string,
  ): Promise<TrackerSummary> {
    if (!/^[0-9a-f]{64}$/.test(tokenHash))
      throw new TrackerRepositoryError("invitation_invalid");
    return inTransaction(this.pool, async (client) => {
      const found = await client.query<{ dataset_id: string }>(
        `SELECT dataset_id FROM tracker_invitations WHERE token_hash=$1`,
        [tokenHash],
      );
      const datasetId = found.rows[0]?.dataset_id;
      if (!datasetId) throw new TrackerRepositoryError("invitation_invalid");
      const locked = await client.query<DatasetRow>(
        `SELECT id,tracker_kind,tracker_name,archived_at,revision FROM datasets
         WHERE id=$1 AND tracker_kind='shared' FOR UPDATE`,
        [datasetId],
      );
      const dataset = locked.rows[0];
      if (!dataset) throw new TrackerRepositoryError("invitation_invalid");
      const invitation = await client.query<{
        target_subject: string;
        target_email: string;
        role: TrackerRole;
        expires_at: Date;
        accepted_at: Date | null;
        revoked_at: Date | null;
      }>(
        `SELECT target_subject,target_email,role,expires_at,accepted_at,revoked_at
         FROM tracker_invitations WHERE token_hash=$1 AND dataset_id=$2 FOR UPDATE`,
        [tokenHash, datasetId],
      );
      const invite = invitation.rows[0];
      if (
        !invite ||
        invite.target_subject !== actor ||
        invite.accepted_at ||
        invite.revoked_at ||
        invite.expires_at.getTime() <= Date.now() ||
        dataset.archived_at
      )
        throw new TrackerRepositoryError("invitation_invalid");
      const existing = await client.query(
        `SELECT 1 FROM tracker_memberships WHERE dataset_id=$1 AND subject=$2 AND revoked_at IS NULL`,
        [datasetId, actor],
      );
      if (existing.rowCount)
        throw new TrackerRepositoryError("invitation_invalid");
      const membershipId = v7();
      await client.query(
        `INSERT INTO tracker_memberships(membership_id,dataset_id,subject,email,role)
         VALUES($1,$2,$3,$4,$5)`,
        [membershipId, datasetId, actor, validEmail(actorEmail), invite.role],
      );
      await client.query(
        `UPDATE tracker_invitations SET accepted_at=clock_timestamp()
         WHERE token_hash=$1`,
        [tokenHash],
      );
      return summary({ ...dataset, role: invite.role, membership_id: membershipId });
    });
  }
}

function validEmail(email: string): string {
  const parsed = email.trim();
  if (
    parsed.length < 3 ||
    parsed.length > 320 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(parsed)
  )
    throw new TrackerRepositoryError("invitee_unavailable");
  return parsed;
}
