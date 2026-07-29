import { describe, expect, it } from "vitest";

import { CognitoAuthClient, LocalAuthClient, MemoryAuthSessionStore, type TestAuthEmail, type TestAuthEmailSender } from "./index";

class TestLocalEmailSender implements TestAuthEmailSender {
  readonly sent: TestAuthEmail[] = [];
  async send(email: TestAuthEmail): Promise<void> { this.sent.push(email); }
}

describe("local auth adapter", () => {
  it("preserves the confirmation and password-reset-code flow", async () => {
    const emailSender = new TestLocalEmailSender();
    const auth = new LocalAuthClient(undefined, emailSender);
    expect(await auth.signUp({ email: "synthetic@example.test", password: "SyntheticPassword1!" })).toEqual({ status: "confirmation_required" });
    expect(emailSender.sent[0]).toEqual({ to: "synthetic@example.test", code: "000000", kind: "confirmation" });
    await auth.confirmSignUp("synthetic@example.test", "000000");
    const signedIn = await auth.signIn({ email: "synthetic@example.test", password: "SyntheticPassword1!" });
    expect(signedIn.status).toBe("signed_in");
    await auth.requestPasswordReset("synthetic@example.test");
    expect(emailSender.sent[1]).toEqual({ to: "synthetic@example.test", code: "000000", kind: "password_reset" });
    await auth.confirmPasswordReset({ email: "synthetic@example.test", code: "000000", newPassword: "SyntheticPassword2!" });
    await auth.signOut();
    expect((await auth.signIn({ email: "synthetic@example.test", password: "SyntheticPassword2!" })).status).toBe("signed_in");
  });

  it("uses the same synthetic local account subject on each device", async () => {
    const first = new LocalAuthClient();
    const second = new LocalAuthClient();
    for (const client of [first, second]) {
      await client.signUp({ email: "synthetic@example.test", password: "SyntheticPassword1!" });
      await client.confirmSignUp("synthetic@example.test", "000000");
    }
    const firstSession = await first.signIn({ email: "synthetic@example.test", password: "SyntheticPassword1!" });
    const secondSession = await second.signIn({ email: "synthetic@example.test", password: "SyntheticPassword1!" });
    expect(firstSession.status).toBe("signed_in");
    expect(secondSession.status).toBe("signed_in");
    if (firstSession.status === "signed_in" && secondSession.status === "signed_in") {
      expect(secondSession.session.accountId).toBe(firstSession.session.accountId);
    }
  });

  it("supports a cached offline session and generic credential errors", async () => {
    const auth = new LocalAuthClient();
    await auth.signUp({ email: "offline@example.test", password: "SyntheticPassword1!" });
    await auth.confirmSignUp("offline@example.test", "000000");
    await auth.signIn({ email: "offline@example.test", password: "SyntheticPassword1!" });
    auth.setOnline(false);
    expect((await auth.getSession()).state).toBe("offline_session");
    await expect(auth.signIn({ email: "offline@example.test", password: "wrong" })).rejects.toMatchObject({ code: "offline" });
  });

  it("restores a persisted session through a new client instance", async () => {
    const sessionStore = new MemoryAuthSessionStore();
    const firstClient = new LocalAuthClient(sessionStore);
    await firstClient.signUp({ email: "persisted@example.test", password: "SyntheticPassword1!" });
    await firstClient.confirmSignUp("persisted@example.test", "000000");
    await firstClient.signIn({ email: "persisted@example.test", password: "SyntheticPassword1!" });

    const secondClient = new LocalAuthClient(sessionStore);
    expect((await secondClient.getSession()).state).toBe("signed_in");
    await secondClient.signOut();
    expect((await firstClient.getSession()).state).toBe("signed_out");
  });

  it("uses the credential-free Cognito HTTPS boundary", async () => {
    const sessionStore = new MemoryAuthSessionStore();
    const targets: string[] = [];
    const auth = new CognitoAuthClient({
      region: "us-east-1",
      clientId: "synthetic-client",
      backendStage: "dev",
      sessionStore,
      fetcher: async (_input, init) => {
        const target = new Headers(init?.headers).get("X-Amz-Target") ?? "";
        targets.push(target);
        if (target.endsWith("InitiateAuth")) return new Response(JSON.stringify({ AuthenticationResult: { AccessToken: "access-token", RefreshToken: "refresh-token", ExpiresIn: 3600 } }), { status: 200 });
        if (target.endsWith("GetUser")) return new Response(JSON.stringify({ UserAttributes: [{ Name: "sub", Value: "account-subject" }] }), { status: 200 });
        return new Response(null, { status: 204 });
      }
    });

    const result = await auth.signIn({ email: "person@example.com", password: "synthetic-password" });
    expect(result.status).toBe("signed_in");
    expect((await auth.getSession()).session?.accountId).toBe("account-subject");
    expect((await auth.getSession()).session).toMatchObject({ provider: "cognito", backendStage: "dev" });
    await auth.signOut();
    expect((await auth.getSession()).state).toBe("signed_out");
    expect(targets).toContain("AWSCognitoIdentityProviderService.InitiateAuth");
    expect(targets).toContain("AWSCognitoIdentityProviderService.GetUser");
  });
});
