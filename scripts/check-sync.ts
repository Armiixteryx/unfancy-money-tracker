// Synthetic-only authenticated protocol smoke check; prints fixed outcomes, never payloads or credentials.
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import { Amplify } from "aws-amplify";
import { cognitoUserPoolsTokenProvider } from "aws-amplify/auth/cognito";
import { signIn, fetchAuthSession, signOut } from "aws-amplify/auth";
import { z } from "zod";
import { seedDefaultCategories } from "../src/domain/categories";
import { createUuid } from "../src/platform/identifiers/createUuid";
import {
  bootstrapResponseSchema,
  pushResponseSchema,
  pullResponseSchema,
  type SyncChange,
} from "../src/server/contracts/sync";
const endpoint = z.url().parse(process.argv[2]).replace(/\/$/, "");
const pool = process.env.COGNITO_USER_POOL_ID ?? "us-east-1_gCLS9k4s0";
const client = process.env.COGNITO_CLIENT_ID ?? "63kh2vrfpvd7h9moob0m9l2umf";
const region = process.env.AWS_REGION ?? "us-east-1";
function cognito(operation: string, input: Record<string, unknown>) {
  const directory = mkdtempSync(join(tmpdir(), "unfancy-sync-auth-"));
  try {
    const file = join(directory, "input.json");
    writeFileSync(file, JSON.stringify(input), { mode: 0o600 });
    execFileSync(
      "aws",
      [
        "cognito-idp",
        operation,
        "--region",
        region,
        "--cli-input-json",
        `file://${file}`,
      ],
      { stdio: ["ignore", "pipe", "pipe"], timeout: 30000 },
    );
  } catch (error) {
    const failure = error as {
      stderr?: Buffer;
      code?: string;
      signal?: string;
    };
    const code =
      failure.stderr
        ?.toString()
        .match(/An error occurred \(([A-Za-z]+)\)/)?.[1] ??
      (failure.signal ? "timeout" : "command_failed");
    throw new Error(code);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}
function assert(condition: unknown) {
  if (!condition) throw new Error("Synthetic sync check failed");
}
let stage = "configuration";
async function main() {
  const email = `synthetic-${createUuid()}@example.invalid`;
  const password = `Synthetic-Aa1!${randomBytes(24).toString("hex")}`;
  const memory = new Map<string, string>();
  let created = false;
  Amplify.configure({
    Auth: { Cognito: { userPoolId: pool, userPoolClientId: client } },
  });
  cognitoUserPoolsTokenProvider.setKeyValueStorage({
    async getItem(key) {
      return memory.get(key) ?? null;
    },
    async setItem(key, value) {
      memory.set(key, value);
    },
    async removeItem(key) {
      memory.delete(key);
    },
    async clear() {
      memory.clear();
    },
  });
  try {
    stage = "create synthetic login";
    cognito("admin-create-user", {
      UserPoolId: pool,
      Username: email,
      MessageAction: "SUPPRESS",
      UserAttributes: [
        { Name: "email", Value: email },
        { Name: "email_verified", Value: "true" },
      ],
    });
    created = true;
    cognito("admin-set-user-password", {
      UserPoolId: pool,
      Username: email,
      Password: password,
      Permanent: true,
    });
    stage = "SRP authentication";
    assert(
      (
        await signIn({
          username: email,
          password,
          options: { authFlowType: "USER_SRP_AUTH" },
        })
      ).isSignedIn,
    );
    const tokens = (await fetchAuthSession()).tokens!;
    const token = tokens.accessToken.toString();
    const request = async (route: string, value: unknown, credential = token) =>
      fetch(`${endpoint}/sync/${route}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${credential}`,
        },
        body: JSON.stringify(value),
        signal: AbortSignal.timeout(30000),
      });
    const parsed = async <T>(
      route: string,
      value: unknown,
      schema: z.ZodType<T>,
    ) => {
      const result = await request(route, value);
      assert(result.ok);
      return schema.parse(await result.json());
    };
    stage = "access-token boundary";
    assert(
      [401, 403].includes(
        (await request("bootstrap", {}, tokens.idToken!.toString())).status,
      ),
    );
    assert(
      [401, 403].includes((await request("bootstrap", {}, "invalid")).status),
    );
    stage = "canonical bootstrap";
    const cloud = await parsed("bootstrap", {}, bootstrapResponseSchema);
    assert(cloud.empty);
    assert(
      (await parsed("bootstrap", {}, bootstrapResponseSchema)).datasetId ===
        cloud.datasetId,
    );
    const now = new Date().toISOString();
    const mutation = (
      recordType: SyncChange["recordType"],
      recordId: string,
      payload: unknown,
      baseRevision = 0,
    ): SyncChange => ({
      recordType,
      recordId,
      payload,
      baseRevision,
      mutationId: createUuid(),
      operation: payload === null ? "delete" : "upsert",
      tombstone: payload === null,
      editedAt: now,
      revision: 0,
      committedAt: null,
    });
    stage = "system slug upload";
    const seeded = seedDefaultCategories(undefined, now).map((value) =>
      mutation("category", value.id, value),
    );
    await parsed(
      "push",
      { datasetId: cloud.datasetId, changes: seeded },
      pushResponseSchema,
    );
    stage = "two-device transaction and retry";
    const transaction = {
      id: createUuid(),
      amount: "12.5",
      currency: "USD",
      type: "expense",
      categoryId: "expense-food",
      description: "Synthetic endpoint record",
      date: "2026-10-04",
      createdAt: now,
      updatedAt: now,
    };
    const initial = mutation("transaction", transaction.id, transaction);
    const first = await parsed(
      "push",
      { datasetId: cloud.datasetId, changes: [initial] },
      pushResponseSchema,
    );
    assert(
      JSON.stringify(
        await parsed(
          "push",
          { datasetId: cloud.datasetId, changes: [initial] },
          pushResponseSchema,
        ),
      ) === JSON.stringify(first),
    );
    assert(!("cursor" in first));
    const changed = { ...initial, payload: { ...transaction, amount: "13" } };
    assert(
      (
        await request("push", {
          datasetId: cloud.datasetId,
          changes: [changed],
        })
      ).status === 400,
    );
    stage = "paginated pull";
    let cursor = "0";
    let count = 0;
    for (;;) {
      const page = await parsed(
        "pull",
        { datasetId: cloud.datasetId, cursor, limit: 2 },
        pullResponseSchema,
      );
      count += page.changes.length;
      cursor = page.cursor;
      if (!page.hasMore) break;
    }
    assert(count === 13);
    stage = "manual conflict";
    const base = first.acknowledgedChanges[0]!.revision;
    await parsed(
      "push",
      {
        datasetId: cloud.datasetId,
        changes: [
          mutation(
            "transaction",
            transaction.id,
            { ...transaction, amount: "13" },
            base,
          ),
        ],
      },
      pushResponseSchema,
    );
    const stale = mutation(
      "transaction",
      transaction.id,
      { ...transaction, amount: "14" },
      base,
    );
    const conflict = (
      await parsed(
        "push",
        {
          datasetId: cloud.datasetId,
          changes: [stale],
        },
        pushResponseSchema,
      )
    ).conflicts[0]!;
    assert(conflict.cloudRevision > base);
    stage = "conflicted retry identity";
    assert(
      (
        await request("push", {
          datasetId: cloud.datasetId,
          changes: [{ ...stale, payload: { ...transaction, amount: "15" } }],
        })
      ).status === 400,
    );
    const resolved = await parsed(
      "conflicts/resolve",
      {
        datasetId: cloud.datasetId,
        conflict,
        choice: "keep_local",
        mutationId: createUuid(),
        editedAt: now,
      },
      pushResponseSchema,
    );
    assert(resolved.acknowledgedChanges.length === 1);
    stage = "deletion tombstone";
    await parsed(
      "push",
      {
        datasetId: cloud.datasetId,
        changes: [
          mutation(
            "transaction",
            transaction.id,
            null,
            resolved.acknowledgedChanges[0]!.revision,
          ),
        ],
      },
      pushResponseSchema,
    );
    assert(
      (
        await parsed(
          "pull",
          { datasetId: cloud.datasetId, cursor },
          pullResponseSchema,
        )
      ).changes.at(-1)!.tombstone,
    );
    stage = "ownership isolation";
    assert(
      [401, 403].includes(
        (await request("pull", { datasetId: createUuid(), cursor: "0" }))
          .status,
      ),
    );
    console.log("Authenticated synthetic sync protocol checks passed.");
  } finally {
    try {
      await signOut();
    } finally {
      memory.clear();
      if (created)
        cognito("admin-delete-user", { UserPoolId: pool, Username: email });
    }
  }
}
void main().catch((error) => {
  const code =
    error instanceof Error && /^[A-Za-z_]+$/.test(error.message)
      ? error.message
      : "check_failed";
  console.error(
    `Synthetic sync check failed at ${stage} (${code}); sensitive details hidden.`,
  );
  process.exitCode = 1;
});
