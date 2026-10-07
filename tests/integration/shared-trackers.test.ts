import { createHash } from "node:crypto";
import { Pool } from "pg";
import { v7 } from "uuid";
import { describe, expect, it } from "vitest";
import type { SyncChange } from "../../src/server/contracts/sync";
import { PostgresSyncRepository, canonicalJson } from "../../src/server/repository/postgresSyncRepository";
import { PostgresTrackerRepository } from "../../src/server/repository/postgresTrackerRepository";

const databaseUrl = process.env.TEST_DATABASE_URL;
const enabled = Boolean(databaseUrl);
function makeChange(partial: Partial<SyncChange> & Pick<SyncChange, "recordType" | "recordId" | "payload">): SyncChange {
  const tombstone = partial.tombstone ?? false;
  return {
    ...partial,
    mutationId: partial.mutationId ?? v7(),
    operation: partial.operation ?? (tombstone ? "delete" : "upsert"),
    baseRevision: partial.baseRevision ?? 0,
    tombstone,
    editedAt: partial.editedAt ?? new Date().toISOString(),
    revision: partial.revision ?? 0,
    committedAt: partial.committedAt ?? null,
  };
}

function transaction(id: string, description: string) {
  const now = new Date().toISOString();
  return { id, amount: "14.5", currency: "USD" as const, type: "expense" as const,
    categoryId: "expense-food", description, date: "2026-10-06", createdAt: now, updatedAt: now };
}

describe.skipIf(!enabled)("shared PostgreSQL tracker authorization and sync", () => {
  it("keeps owner-only v1 access and the submitted immutable mutation hash after V004", async () => {
    const pool = new Pool({ connectionString: databaseUrl, max: 3 });
    try {
      const sync = new PostgresSyncRepository(pool);
      const actor = `v1-${v7()}`;
      const { datasetId } = await sync.bootstrap(actor);
      const customId = v7();
      const payload = { id: customId, kind: "expense", name: "Synthetic category", isSystem: false, isArchived: false,
        createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
      const change = makeChange({ recordType: "category", recordId: customId, payload });
      const expectedHash = createHash("sha256").update(canonicalJson(change)).digest("hex");
      const first = await sync.push(actor, datasetId, [change]);
      expect(first.acknowledgedChanges).toHaveLength(1);
      expect(await sync.push(actor, datasetId, [change])).toEqual(first);
      const saved = await pool.query<{ request_hash: string; sender_subject: string | null; membership_id: string | null }>(
        `SELECT request_hash,sender_subject,membership_id FROM mutation_requests WHERE dataset_id=$1 AND mutation_id=$2`,
        [datasetId, change.mutationId],
      );
      expect(saved.rows[0]).toEqual({ request_hash: expectedHash, sender_subject: null, membership_id: null });
      await expect(sync.push("different-owner", datasetId, [makeChange({ ...change, mutationId: v7() })])).rejects.toThrow();
      const tracker = await new PostgresTrackerRepository(pool).list(actor);
      expect(tracker).toEqual([expect.objectContaining({ datasetId, kind: "personal", role: "admin", membershipId: null })]);
    } finally { await pool.end(); }
  });

  it("binds creator metadata outside the immutable payload and applies member/admin permissions", async () => {
    const pool = new Pool({ connectionString: databaseUrl, max: 4 });
    try {
      const trackers = new PostgresTrackerRepository(pool);
      const sync = new PostgresSyncRepository(pool);
      const admin = `admin-${v7()}`;
      const member = `member-${v7()}`;
      const secondMember = `member2-${v7()}`;
      const tracker = await trackers.create(admin, "admin@example.test", { name: "Household", currencies: { baseCurrency: "USD", selectedCurrencies: ["USD"] } });
      const scope = { datasetId: tracker.datasetId, membershipId: tracker.membershipId! };
      const inviteOne = { ...scope, email: "member@example.test", role: "member" as const };
      const tokenOne = createHash("sha256").update(v7()).digest("hex");
      await trackers.createInvitation(admin, inviteOne, { subject: member, email: inviteOne.email }, tokenOne);
      const joinedOne = await trackers.acceptInvitation(member, inviteOne.email, tokenOne);
      const inviteTwo = { ...scope, email: "member2@example.test", role: "member" as const };
      const tokenTwo = createHash("sha256").update(v7()).digest("hex");
      await trackers.createInvitation(admin, inviteTwo, { subject: secondMember, email: inviteTwo.email }, tokenTwo);
      const joinedTwo = await trackers.acceptInvitation(secondMember, inviteTwo.email, tokenTwo);
      const memberScope = { datasetId: joinedOne.datasetId, membershipId: joinedOne.membershipId! };
      const secondMemberScope = { datasetId: joinedTwo.datasetId, membershipId: joinedTwo.membershipId! };
      const transactionId = v7();
      const originalTransaction = transaction(transactionId, "Own lunch");
      const created = makeChange({ recordType: "transaction", recordId: transactionId, payload: originalTransaction });
      const accepted = await sync.pushShared(member, { ...memberScope, changes: [created] });
      expect(accepted.acknowledgedChanges).toHaveLength(1);
      expect(accepted.attribution).toEqual([{ transactionId, creator: { subject: member, email: inviteOne.email } }]);
      const stored = await pool.query<{ change: { payload: Record<string, unknown> }; request_hash: string; sender_subject: string; membership_id: string }>(
        `SELECT c.change,m.request_hash,m.sender_subject,m.membership_id FROM sync_changes c
         JOIN mutation_requests m ON m.dataset_id=c.dataset_id AND m.mutation_id=(c.change->>'mutationId')::uuid
         WHERE c.dataset_id=$1 AND c.change->>'mutationId'=$2`, [tracker.datasetId, created.mutationId],
      );
      expect(stored.rows[0]!.change.payload).not.toHaveProperty("creator");
      expect(stored.rows[0]!.request_hash).toBe(createHash("sha256").update(canonicalJson(created)).digest("hex"));
      expect(stored.rows[0]!.sender_subject).toBe(member);
      expect(stored.rows[0]!.membership_id).toBe(joinedOne.membershipId);
      await expect(sync.pushShared(secondMember, { ...secondMemberScope, changes: [created] })).rejects.toThrow("Invalid sync request");

      const updated = makeChange({ ...created, mutationId: v7(), payload: { ...transaction(transactionId, "Updated own lunch"), createdAt: originalTransaction.createdAt }, baseRevision: accepted.acknowledgedChanges[0]!.revision });
      const updatedAck = (await sync.pushShared(member, { ...memberScope, changes: [updated] })).acknowledgedChanges[0]!;
      expect(updatedAck).toBeDefined();
      const deniedUpdate = makeChange({ ...updated, mutationId: v7(), payload: { ...transaction(transactionId, "Attempted edit") }, baseRevision: 2 });
      expect((await sync.pushShared(secondMember, { ...secondMemberScope, changes: [deniedUpdate] })).rejectedChanges).toEqual([{ mutationId: deniedUpdate.mutationId, code: "permission_denied" }]);

      const preference = makeChange({ recordType: "preference", recordId: "currency", payload: { baseCurrency: "EUR", selectedCurrencies: ["EUR", "USD"] } });
      expect((await sync.pushShared(member, { ...memberScope, changes: [preference] })).rejectedChanges).toEqual([{ mutationId: preference.mutationId, code: "permission_denied" }]);
      const customCategoryId = v7();
      const category = makeChange({ recordType: "category", recordId: customCategoryId, payload: { id: customCategoryId, kind: "expense", name: "Private attempt", isSystem: false, isArchived: false, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() } });
      expect((await sync.pushShared(member, { ...memberScope, changes: [category] })).rejectedChanges).toEqual([{ mutationId: category.mutationId, code: "permission_denied" }]);
      const budgetId = v7();
      const now = new Date().toISOString();
      const budget = makeChange({ recordType: "budget", recordId: budgetId, payload: { id: budgetId, amount: "50", currency: "USD", categoryId: "expense-food", month: "2026-10", createdAt: now, updatedAt: now } });
      expect((await sync.pushShared(member, { ...memberScope, changes: [budget] })).rejectedChanges).toEqual([{ mutationId: budget.mutationId, code: "permission_denied" }]);

      const adminEdit = makeChange({ recordType: "transaction", recordId: transactionId, payload: { ...transaction(transactionId, "Admin correction"), createdAt: originalTransaction.createdAt }, baseRevision: updatedAck.revision });
      const adminAck = (await sync.pushShared(admin, { ...scope, changes: [adminEdit] })).acknowledgedChanges[0]!;
      expect(adminAck).toBeDefined();
      const staleMemberEdit = makeChange({ recordType: "transaction", recordId: transactionId, payload: { ...transaction(transactionId, "Member conflict choice"), createdAt: originalTransaction.createdAt }, baseRevision: updatedAck.revision });
      const conflictResponse = await sync.pushShared(member, { ...memberScope, changes: [staleMemberEdit] });
      expect(conflictResponse.conflicts).toHaveLength(1);
      const resolved = await sync.resolveConflictShared(member, { ...memberScope, mutationId: v7(), conflict: conflictResponse.conflicts[0]!, choice: "keep_local", editedAt: new Date().toISOString() });
      expect(resolved.acknowledgedChanges).toHaveLength(1);
      const deleted = makeChange({ recordType: "transaction", recordId: transactionId, payload: null, tombstone: true, operation: "delete", baseRevision: resolved.acknowledgedChanges[0]!.revision });
      expect((await sync.pushShared(member, { ...memberScope, changes: [deleted] })).acknowledgedChanges).toHaveLength(1);
      const pull = await sync.pullShared(secondMember, { ...secondMemberScope, cursor: "0" });
      expect(pull.attribution).toEqual([{ transactionId, creator: { subject: member, email: inviteOne.email } }]);
      expect(pull.changes.some((change) => change.recordId === transactionId && typeof change.payload === "object" && change.payload !== null && "creator" in change.payload)).toBe(false);
      await expect(trackers.setRole(member, { ...memberScope, targetMembershipId: joinedTwo.membershipId, role: "admin" })).rejects.toMatchObject({ code: "permission_denied" });
      await expect(trackers.setRole(admin, { ...scope, targetMembershipId: scope.membershipId, role: "member" })).rejects.toMatchObject({ code: "last_admin" });
      await expect(trackers.removeMember(admin, { ...scope, targetMembershipId: scope.membershipId })).rejects.toMatchObject({ code: "last_admin" });
    } finally { await pool.end(); }
  });

  it("serializes role revocation before a blocked push and leaves removed generations inaccessible", async () => {
    const pool = new Pool({ connectionString: databaseUrl, max: 6 });
    const blocker = await pool.connect();
    try {
      const trackers = new PostgresTrackerRepository(pool);
      const sync = new PostgresSyncRepository(pool);
      const owner = `race-owner-${v7()}`;
      const target = `race-target-${v7()}`;
      const tracker = await trackers.create(owner, "owner@example.test", { name: "Race test", currencies: { baseCurrency: "USD", selectedCurrencies: ["USD"] } });
      const scope = { datasetId: tracker.datasetId, membershipId: tracker.membershipId! };
      const request = { ...scope, email: "target@example.test", role: "admin" as const };
      const invitationHash = createHash("sha256").update(v7()).digest("hex");
      await trackers.createInvitation(owner, request, { subject: target, email: request.email }, invitationHash);
      const joined = await trackers.acceptInvitation(target, request.email, invitationHash);
      const joinedScope = { datasetId: joined.datasetId, membershipId: joined.membershipId! };
      const mutation = makeChange({ recordType: "preference", recordId: "currency", payload: { baseCurrency: "EUR", selectedCurrencies: ["EUR", "USD"] } });

      await blocker.query("BEGIN");
      await blocker.query("SELECT id FROM datasets WHERE id=$1 FOR UPDATE", [tracker.datasetId]);
      const pendingPush = sync.pushShared(target, { ...joinedScope, changes: [mutation] });
      let isWaiting = false;
      for (let attempt = 0; attempt < 100; attempt++) {
        const waiting = await blocker.query<{ exists: boolean }>(
          `SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE wait_event_type='Lock'
            AND query LIKE '%SELECT archived_at FROM datasets%') AS exists`,
        );
        if (waiting.rows[0]?.exists) { isWaiting = true; break; }
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
      expect(isWaiting).toBe(true);
      await blocker.query(`UPDATE tracker_memberships SET role='member' WHERE membership_id=$1`, [joined.membershipId]);
      await blocker.query("COMMIT");
      const response = await pendingPush;
      expect(response.rejectedChanges).toEqual([{ mutationId: mutation.mutationId, code: "permission_denied" }]);

      await trackers.removeMember(owner, { ...scope, targetMembershipId: joined.membershipId! });
      await expect(sync.pullShared(target, { ...joinedScope, cursor: "0" })).rejects.toThrow("membership_revoked");
      await expect(sync.pushShared(target, { ...joinedScope, changes: [makeChange({ ...mutation, mutationId: v7() })] })).rejects.toThrow("membership_revoked");
    } finally {
      await blocker.query("ROLLBACK").catch(() => undefined);
      blocker.release();
      await pool.end();
    }
  });

  it("expires, replaces, revokes, and consumes invitations against verified subject identity", async () => {
    const pool = new Pool({ connectionString: databaseUrl, max: 3 });
    try {
      const trackers = new PostgresTrackerRepository(pool);
      const admin = `inviter-${v7()}`;
      const target = `invitee-${v7()}`;
      const tracker = await trackers.create(admin, "inviter@example.test", { name: "Invites", currencies: { baseCurrency: "USD", selectedCurrencies: ["USD"] } });
      const scope = { datasetId: tracker.datasetId, membershipId: tracker.membershipId! };
      expect(await trackers.rename(admin, { ...scope, name: "Renamed invites" })).toMatchObject({ name: "Renamed invites" });
      const request = { ...scope, email: "invitee@example.test", role: "member" as const };
      const oldHash = createHash("sha256").update(v7()).digest("hex");
      const freshHash = createHash("sha256").update(v7()).digest("hex");
      await trackers.createInvitation(admin, request, { subject: target, email: request.email }, oldHash);
      await trackers.createInvitation(admin, request, { subject: target, email: request.email }, freshHash);
      await expect(trackers.previewInvitation(target, oldHash)).rejects.toMatchObject({ code: "invitation_invalid" });
      expect(await trackers.previewInvitation(target, freshHash)).toMatchObject({ name: "Renamed invites", role: "member" });
      await expect(trackers.acceptInvitation("different-subject", request.email, freshHash)).rejects.toMatchObject({ code: "invitation_invalid" });
      // The fresh invitation remains active; revoking its exact id invalidates the token.
      const pending = await trackers.createInvitation(admin, { ...request, email: "revocable@example.test" }, { subject: `revocable-${v7()}`, email: "revocable@example.test" }, createHash("sha256").update(v7()).digest("hex"));
      await trackers.revokeInvitation(admin, { ...scope, invitationId: pending.invitationId });
      const accepted = await trackers.acceptInvitation(target, request.email, freshHash);
      expect(accepted.kind).toBe("shared");
      await expect(trackers.acceptInvitation(target, request.email, freshHash)).rejects.toMatchObject({ code: "invitation_invalid" });
      const targetScope = { datasetId: accepted.datasetId, membershipId: accepted.membershipId! };
      expect(await trackers.members(target, targetScope)).toHaveLength(2);
      const archived = await trackers.archive(admin, scope);
      expect(archived.archived).toBe(true);
      const blockedWrite = makeChange({ recordType: "preference", recordId: "currency", payload: { baseCurrency: "EUR", selectedCurrencies: ["EUR", "USD"] } });
      expect((await new PostgresSyncRepository(pool).pushShared(target, { ...targetScope, changes: [blockedWrite] })).rejectedChanges).toEqual([{ mutationId: blockedWrite.mutationId, code: "tracker_archived" }]);
      expect(await new PostgresSyncRepository(pool).pullShared(target, { ...targetScope, cursor: "0" })).toHaveProperty("changes");
      expect((await trackers.archive(admin, scope, true)).archived).toBe(false);
      await trackers.leave(target, targetScope);
      expect(await trackers.list(target)).toEqual([]);
      await expect(new PostgresSyncRepository(pool).pullShared(target, { ...targetScope, cursor: "0" })).rejects.toThrow("membership_revoked");
      const expiredSubject = `expired-${v7()}`;
      const expiredHash = createHash("sha256").update(v7()).digest("hex");
      const expired = await trackers.createInvitation(admin, { ...request, email: "expired@example.test" }, { subject: expiredSubject, email: "expired@example.test" }, expiredHash);
      await pool.query(`UPDATE tracker_invitations SET created_at=clock_timestamp()-interval '8 days',expires_at=clock_timestamp()-interval '1 second' WHERE invitation_id=$1`, [expired.invitationId]);
      await expect(trackers.previewInvitation(expiredSubject, expiredHash)).rejects.toMatchObject({ code: "invitation_invalid" });
    } finally { await pool.end(); }
  });
});
