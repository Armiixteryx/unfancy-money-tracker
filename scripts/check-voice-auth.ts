import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
// Disposable synthetic accounts only. Never print credentials, identity or provider bodies.
import { execFileSync } from "node:child_process";
import { randomUUID, randomBytes } from "node:crypto";
import { Amplify } from "aws-amplify";
import { cognitoUserPoolsTokenProvider } from "aws-amplify/auth/cognito";
import { signIn, fetchAuthSession, signOut } from "aws-amplify/auth";
import { z } from "zod";
const settings = z.object({ pool: z.string().min(1), client: z.string().min(1), endpoint: z.url(), region: z.string().min(1) }).parse({ pool: process.env.COGNITO_USER_POOL_ID, client: process.env.COGNITO_CLIENT_ID, region: process.env.AWS_REGION ?? "us-east-1", endpoint: process.argv[2] });
function cognito(operation: string, input: Record<string, unknown>) {
  const directory = mkdtempSync(join(tmpdir(), "unfancy-auth-check-"));
  try {
    const path = join(directory, "input.json");
    writeFileSync(path, JSON.stringify(input), { mode: 0o600 });
    execFileSync("aws", ["cognito-idp", operation, "--region", settings.region, "--cli-input-json", `file://${path}`, "--output", "json"], { stdio: ["ignore", "pipe", "pipe"], timeout: 30000 });
  } finally { rmSync(directory, { recursive: true, force: true }); }
}
function check(success: boolean) { if (!success) throw new Error("Synthetic authentication check failed"); }
let stage = "configuration";
async function main() {
  const email = `synthetic-${randomUUID()}@example.invalid`;
  const password = `Synthetic-Aa1!${randomBytes(24).toString("hex")}`;
  const memory = new Map<string, string>();
  Amplify.configure({ Auth: { Cognito: { userPoolId: settings.pool, userPoolClientId: settings.client } } });
  cognitoUserPoolsTokenProvider.setKeyValueStorage({ async getItem(key) { return memory.get(key) ?? null; }, async setItem(key, value) { memory.set(key, value); }, async removeItem(key) { memory.delete(key); }, async clear() { memory.clear(); } });
  let created = false;
  try {
    stage = "create synthetic user";
    cognito("admin-create-user", { UserPoolId: settings.pool, Username: email, MessageAction: "SUPPRESS", UserAttributes: [{ Name: "email", Value: email }, { Name: "email_verified", Value: "true" }] });
    created = true;
    stage = "set synthetic credential";
    cognito("admin-set-user-password", { UserPoolId: settings.pool, Username: email, Password: password, Permanent: true });
    stage = "SRP login";
    check((await signIn({ username: email, password, options: { authFlowType: "USER_SRP_AUTH" } })).isSignedIn);
    stage = "rotating refresh";
    const refreshed = await fetchAuthSession({ forceRefresh: true });
    check(!!refreshed.tokens?.accessToken);
    stage = "authenticated malformed input";
    const response = await fetch(`${settings.endpoint.replace(/\/$/, "")}/voice/expense`, { method: "POST", headers: { Authorization: `Bearer ${refreshed.tokens!.accessToken.toString()}`, "Content-Type": "application/json" }, body: "{}", signal: AbortSignal.timeout(30000) });
    check(response.status === 422);
    stage = "ID-token rejection";
    const idResponse = await fetch(`${settings.endpoint.replace(/\/$/, "")}/voice/expense`, { method: "POST", headers: { Authorization: `Bearer ${refreshed.tokens!.idToken!.toString()}`, "Content-Type": "application/json" }, body: "{}", signal: AbortSignal.timeout(30000) });
    check([401, 403].includes(idResponse.status));
    const persistedSession = new Map(memory);
    stage = "logout";
    await signOut();
    check(!(await fetchAuthSession()).tokens);
    stage = "refresh revocation";
    for (const [key, value] of persistedSession) memory.set(key, value);
    let revoked = false;
    try { revoked = !(await fetchAuthSession({ forceRefresh: true })).tokens; } catch { revoked = true; }
    check(revoked);
    console.log("Synthetic SRP, rotating refresh, voice authorization, ID-token rejection and logout checks passed.");
  } finally {
    memory.clear();
    if (created) cognito("admin-delete-user", { UserPoolId: settings.pool, Username: email });
  }
}
void main().catch(() => { console.error(`Synthetic authentication check failed at ${stage}; sensitive details hidden.`); process.exitCode = 1; });
