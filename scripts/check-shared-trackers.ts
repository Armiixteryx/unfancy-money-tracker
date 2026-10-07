// Synthetic-only authenticated checks. Diagnostics omit identities, tokens and records.
import { randomBytes, randomUUID } from "node:crypto";
import { writeFileSync, chmodSync } from "node:fs";
import { resolve } from "node:path";
import { CognitoIdentityProviderClient, AdminCreateUserCommand, AdminSetUserPasswordCommand, AdminDeleteUserCommand } from "@aws-sdk/client-cognito-identity-provider";
import { Amplify } from "aws-amplify";
import { signIn, signOut, fetchAuthSession } from "aws-amplify/auth";
import { cognitoUserPoolsTokenProvider } from "aws-amplify/auth/cognito";
import { v7 } from "uuid";
import { trackerSummarySchema, invitationResultSchema, sharedPushResponseSchema, sharedPullResponseSchema } from "../src/server/contracts/trackers";
import type { SyncChange } from "../src/server/contracts/sync";

const endpoint = new URL(process.argv[2] ?? "http://localhost:3001").origin;
const pool = process.env.COGNITO_USER_POOL_ID ?? "us-east-1_gCLS9k4s0";
const clientId = process.env.COGNITO_CLIENT_ID ?? "63kh2vrfpvd7h9moob0m9l2umf";
if (process.env.EXPO_PUBLIC_ENV === "prod" || pool === "us-east-1_Z2RzT6nDo") throw new Error("Synthetic checks require a development pool");
const cognito = new CognitoIdentityProviderClient({ region: process.env.AWS_REGION ?? "us-east-1", maxAttempts: 2 });
const accounts: { email: string; password: string; subject: string; accessToken: string }[] = [];
const memory = new Map<string, string>();
Amplify.configure({ Auth: { Cognito: { userPoolId: pool, userPoolClientId: clientId } } });
cognitoUserPoolsTokenProvider.setKeyValueStorage({ async getItem(key) { return memory.get(key) ?? null; }, async setItem(key, value) { memory.set(key, value); }, async removeItem(key) { memory.delete(key); }, async clear() { memory.clear(); } });
let stage = "configuration";
function check(value: unknown): asserts value { if (!value) throw new Error("Synthetic check failed"); }
async function post(index: number, path: string, body: unknown, expected = 200): Promise<unknown> {
  const response = await fetch(`${endpoint}${path}`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${accounts[index]!.accessToken}` }, body: JSON.stringify(body), signal: AbortSignal.timeout(60000) });
  check(response.status === expected);
  return response.json();
}
function change(payload: unknown, recordId: string, recordType: SyncChange["recordType"] = "transaction", baseRevision = 0): SyncChange {
  return { mutationId: v7(), recordType, recordId, payload, baseRevision, tombstone: false, operation: "upsert", editedAt: new Date().toISOString(), revision: 0, committedAt: null };
}
async function main() {
  let retained = false;
  try {
    stage = "temporary accounts";
    for (let index = 0; index < 3; index++) {
      const prefix = process.env.SHARED_E2E_PREFIX;
      if (prefix && !/^synthetic-family-[a-z0-9-]+$/.test(prefix)) throw new Error("Invalid synthetic prefix");
      const email = prefix ? `${prefix}-${index}@example.invalid` : `synthetic-family-${randomUUID()}@example.invalid`;
      const password = process.env.SHARED_E2E_PASSWORD ?? `Synthetic-Aa1!${randomBytes(24).toString("hex")}`;
      const created = await cognito.send(new AdminCreateUserCommand({ UserPoolId: pool, Username: email, MessageAction: "SUPPRESS", UserAttributes: [{ Name: "email", Value: email }, { Name: "email_verified", Value: "true" }] }));
      const subject = created.User?.Attributes?.find(attribute => attribute.Name === "sub")?.Value;
      accounts.push({ email, password, subject: subject ?? "", accessToken: "" });
      check(subject);
      await cognito.send(new AdminSetUserPasswordCommand({ UserPoolId: pool, Username: email, Password: password, Permanent: true }));
      check((await signIn({ username: email, password, options: { authFlowType: "USER_SRP_AUTH" } })).isSignedIn);
      const session = await fetchAuthSession();
      check(session.tokens?.accessToken);
      accounts[index]!.accessToken = session.tokens.accessToken.toString();
      await signOut();
    }
    stage = "personal isolation";
    const personal = await Promise.all(accounts.map((_, index) => post(index, "/sync/bootstrap", {})));
    check(new Set(personal.map(value => (value as { datasetId: string }).datasetId)).size === 3);
    stage = "family creation";
    const tracker = trackerSummarySchema.parse(await post(0, "/trackers/create", { name: "Synthetic family", currencies: { baseCurrency: "USD", selectedCurrencies: ["USD"] } }));
    const adminScope = { datasetId: tracker.datasetId, membershipId: tracker.membershipId };
    stage = "account-bound invitations";
    const memberships = [tracker];
    const invitationUrls: string[] = [];
    for (let index = 1; index < 3; index++) {
      const invitation = invitationResultSchema.parse(await post(0, "/trackers/invite", { ...adminScope, email: accounts[index]!.email, role: index === 1 ? "admin" : "member" }));
      const token = new URLSearchParams(new URL(invitation.url).hash.slice(1)).get("token");
      check(token);
      invitationUrls.push(invitation.url);
      await post(0, "/trackers/accept-invitation", { token }, 400);
      await post(index, "/trackers/preview-invitation", { token });
      memberships.push(trackerSummarySchema.parse(await post(index, "/trackers/accept-invitation", { token })));
      await post(index, "/trackers/accept-invitation", { token }, 400);
    }
    const memberScope = { datasetId: tracker.datasetId, membershipId: memberships[2]!.membershipId };
    stage = "member author permissions";
    const now = new Date().toISOString();
    const transactionId = v7();
    const payload = { id: transactionId, type: "expense", amount: "7.5", currency: "USD", categoryId: "expense-food", description: "Synthetic entry", date: "2026-10-07", createdAt: now, updatedAt: now };
    const added = sharedPushResponseSchema.parse(await post(2, "/sync/v2/push", { ...memberScope, changes: [change(payload, transactionId)] }));
    check(added.acknowledgedChanges.length === 1 && added.attribution[0]?.creator.subject === accounts[2]!.subject);
    const denied = sharedPushResponseSchema.parse(await post(2, "/sync/v2/push", { ...memberScope, changes: [change({ baseCurrency: "EUR", selectedCurrencies: ["EUR"] }, "currency", "preference")] }));
    check(denied.rejectedChanges[0]?.code === "permission_denied");
    await post(2, "/trackers/rename", { ...memberScope, name: "Forbidden" }, 403);
    const pulled = sharedPullResponseSchema.parse(await post(1, "/sync/v2/pull", { datasetId: tracker.datasetId, membershipId: memberships[1]!.membershipId, cursor: "0" }));
    check(pulled.attribution[0]?.creator.subject === accounts[2]!.subject);
    stage = "archive and restore";
    await post(0, "/trackers/archive", adminScope);
    const archived = sharedPushResponseSchema.parse(await post(2, "/sync/v2/push", { ...memberScope, changes: [change({ ...payload, description: "Synthetic update" }, transactionId, "transaction", added.acknowledgedChanges[0]!.revision)] }));
    check(archived.rejectedChanges[0]?.code === "tracker_archived");
    await post(1, "/trackers/restore", { datasetId: tracker.datasetId, membershipId: memberships[1]!.membershipId });
    stage = "last admin protection";
    await post(0, "/trackers/role", { ...adminScope, targetMembershipId: memberships[1]!.membershipId, role: "member" });
    await post(0, "/trackers/leave", adminScope, 409);
    await post(0, "/trackers/role", { ...adminScope, targetMembershipId: memberships[1]!.membershipId, role: "admin" });
    const sessionPath = process.env.SHARED_E2E_SESSION_FILE;
    if (sessionPath) {
      check(!resolve(sessionPath).startsWith(`${resolve(process.cwd())}/`));
      writeFileSync(sessionPath, JSON.stringify({ endpoint, pool, clientId, accounts, tracker, memberships, invitationUrls }), { mode: 0o600 });
      chmodSync(sessionPath, 0o600);
      retained = true;
    }
    console.log("Synthetic shared tracker API checks passed.");
  } finally {
    memory.clear();
    if (!retained) for (const account of accounts) await cognito.send(new AdminDeleteUserCommand({ UserPoolId: pool, Username: account.email }));
  }
}
void main().catch(() => { console.error(`Synthetic shared tracker check failed at ${stage}; sensitive details hidden.`); process.exitCode = 1; });
