import { describe, expect, it } from "vitest";

import { LocalAuthClient } from "./index";

describe("local auth adapter", () => {
  it("preserves the confirmation and password-reset-code flow", async () => {
    const auth = new LocalAuthClient();
    expect(await auth.signUp({ email: "synthetic@example.test", password: "SyntheticPassword1!" })).toEqual({ status: "confirmation_required" });
    await auth.confirmSignUp("synthetic@example.test", "000000");
    const signedIn = await auth.signIn({ email: "synthetic@example.test", password: "SyntheticPassword1!" });
    expect(signedIn.status).toBe("signed_in");
    await auth.requestPasswordReset("synthetic@example.test");
    await auth.confirmPasswordReset({ email: "synthetic@example.test", code: "000000", newPassword: "SyntheticPassword2!" });
    await auth.signOut();
    expect((await auth.signIn({ email: "synthetic@example.test", password: "SyntheticPassword2!" })).status).toBe("signed_in");
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
});
