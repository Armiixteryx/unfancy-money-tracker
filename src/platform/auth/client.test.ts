import { authClient } from "./client";
import { beforeEach, describe, expect, it, vi } from "vitest";
const sdk = vi.hoisted(() => ({
  configure: vi.fn(), setStorage: vi.fn(), signUp: vi.fn(), confirmSignUp: vi.fn(), resendSignUpCode: vi.fn(), signIn: vi.fn(), resetPassword: vi.fn(), confirmResetPassword: vi.fn(), getCurrentUser: vi.fn(), fetchAuthSession: vi.fn(), signOut: vi.fn(), clear: vi.fn(),
}));
vi.mock("aws-amplify", () => ({ Amplify: { configure: sdk.configure } }));
vi.mock("aws-amplify/auth/cognito", () => ({ cognitoUserPoolsTokenProvider: { setKeyValueStorage: sdk.setStorage } }));
vi.mock("aws-amplify/auth", () => sdk);
vi.mock("./storage", () => ({ credentialStorage: { clear: sdk.clear } }));
describe("AuthClient lifecycle", () => {
  beforeEach(() => vi.clearAllMocks());
  it("preserves email spelling and uses direct SRP", async () => {
    sdk.signIn.mockResolvedValue({ isSignedIn: true });
    expect(await authClient.login("Synthetic+Case@Example.invalid", "synthetic")).toBe("signedIn");
    expect(sdk.signIn).toHaveBeenCalledWith({ username: "Synthetic+Case@Example.invalid", password: "synthetic", options: { authFlowType: "USER_SRP_AUTH" } });
    await authClient.register("Synthetic+Case@Example.invalid", "synthetic");
    expect(sdk.signUp).toHaveBeenCalledWith({ username: "Synthetic+Case@Example.invalid", password: "synthetic", options: { userAttributes: { email: "Synthetic+Case@Example.invalid" } } });
  });
  it("routes unconfirmed accounts to confirmation and safely refuses other challenges", async () => {
    sdk.signIn.mockResolvedValue({ isSignedIn: false, nextStep: { signInStep: "CONFIRM_SIGN_UP" } });
    expect(await authClient.login("synthetic", "synthetic")).toBe("confirm");
    sdk.signIn.mockResolvedValue({ isSignedIn: false, nextStep: { signInStep: "CONFIRM_SIGN_IN_WITH_SMS_CODE" } });
    await expect(authClient.login("synthetic", "synthetic")).rejects.toThrow("Unsupported sign-in step");
  });
  it("supports confirmation, resend, recovery and reset", async () => {
    await authClient.confirm("synthetic", "123456"); await authClient.resend("synthetic"); await authClient.recover("synthetic"); await authClient.reset("synthetic", "123456", "synthetic");
    expect(sdk.confirmSignUp).toHaveBeenCalledWith({ username: "synthetic", confirmationCode: "123456" });
    expect(sdk.resendSignUpCode).toHaveBeenCalledWith({ username: "synthetic" });
    expect(sdk.resetPassword).toHaveBeenCalledWith({ username: "synthetic" });
    expect(sdk.confirmResetPassword).toHaveBeenCalledWith({ username: "synthetic", confirmationCode: "123456", newPassword: "synthetic" });
  });
  it("restores identity independently of financial persistence", async () => {
    sdk.getCurrentUser.mockResolvedValue({ signInDetails: { loginId: "synthetic" } });
    expect(await authClient.restore()).toBe("synthetic");
    sdk.getCurrentUser.mockRejectedValue(new Error("offline"));
    expect(await authClient.restore()).toBeNull();
  });
  it("uses Amplify session refresh and requires an access token", async () => {
    sdk.fetchAuthSession.mockResolvedValue({ tokens: { accessToken: { toString: () => "synthetic-access" }, idToken: { toString: () => "synthetic-id" } } });
    expect(await authClient.accessToken()).toBe("synthetic-access");
    expect(sdk.fetchAuthSession).toHaveBeenCalledWith({ forceRefresh: true });
    sdk.fetchAuthSession.mockResolvedValue({});
    await expect(authClient.accessToken()).rejects.toThrow("Sign in required");
    sdk.fetchAuthSession.mockRejectedValue(new Error("offline"));
    await expect(authClient.accessToken()).rejects.toThrow("Authentication is unavailable");
  });
  it("clears local credentials even when remote logout fails", async () => {
    sdk.signOut.mockRejectedValue(new Error("offline"));
    await expect(authClient.signOut()).rejects.toThrow("offline");
    expect(sdk.clear).toHaveBeenCalledOnce();
  });
});
