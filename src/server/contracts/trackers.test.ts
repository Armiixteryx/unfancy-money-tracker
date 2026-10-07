import { describe, expect, it } from "vitest";
import { trackerSummarySchema, invitationTokenRequestSchema, sharedPushRequestSchema, sharedPullResponseSchema } from "./trackers";
import { syncChangeSchema } from "./sync";

const datasetId = "019bc9e0-0000-7000-8000-000000000001";
const membershipId = "019bc9e0-0000-7000-8000-000000000002";
const recordId = "019bc9e0-0000-7000-8000-000000000003";
const timestamp = "2026-10-07T12:00:00.000Z";
const change = {
  mutationId: "019bc9e0-0000-7000-8000-000000000004", recordType: "transaction", recordId,
  operation: "upsert", baseRevision: 0, tombstone: false, editedAt: timestamp, revision: 0, committedAt: null,
  payload: { id: recordId, type: "expense", categoryId: "expense-food", amount: "1", currency: "USD", description: "Synthetic entry", date: "2026-10-07", createdAt: timestamp, updatedAt: timestamp },
};

describe("shared tracker boundaries", () => {
  it("requires shared membership identities and keeps personal trackers private", () => {
    const tracker = { datasetId, kind: "shared", name: "Synthetic tracker", role: "member", membershipId, archived: false };
    expect(trackerSummarySchema.safeParse(tracker).success).toBe(true);
    expect(trackerSummarySchema.safeParse({ ...tracker, membershipId: null }).success).toBe(false);
    expect(trackerSummarySchema.safeParse({ ...tracker, kind: "personal" }).success).toBe(false);
    expect(trackerSummarySchema.safeParse({ ...tracker, kind: "personal", role: "admin", membershipId: null }).success).toBe(true);
  });

  it("requires unambiguous random invitation tokens without identity assertions", () => {
    expect(invitationTokenRequestSchema.safeParse({ token: "a".repeat(43) }).success).toBe(true);
    expect(invitationTokenRequestSchema.safeParse({ token: "short" }).success).toBe(false);
    expect(invitationTokenRequestSchema.safeParse({ token: "a".repeat(43), subject: "forged" }).success).toBe(false);
  });

  it("requires a membership incarnation on shared pushes and forbids forged author metadata", () => {
    expect(sharedPushRequestSchema.safeParse({ datasetId, membershipId, changes: [change] }).success).toBe(true);
    expect(sharedPushRequestSchema.safeParse({ datasetId, changes: [change] }).success).toBe(false);
    expect(syncChangeSchema.safeParse({ ...change, payload: { ...change.payload, creator: { subject: "forged", email: "synthetic@example.invalid" } } }).success).toBe(false);
  });

  it("receives immutable creators outside mutation payloads", () => {
    const result = sharedPullResponseSchema.parse({ changes: [{ ...change, revision: 1, committedAt: timestamp }], cursor: "1", hasMore: false, attribution: [{ transactionId: recordId, creator: { subject: "synthetic-sub", email: "synthetic@example.invalid" } }] });
    expect(result.changes[0]?.payload).not.toHaveProperty("creator");
    expect(result.attribution[0]?.creator.subject).toBe("synthetic-sub");
  });
});
