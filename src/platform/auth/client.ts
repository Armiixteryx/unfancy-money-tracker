import { AuthenticationRequiredError } from "./errors";
import { Amplify } from "aws-amplify";
import { cognitoUserPoolsTokenProvider } from "aws-amplify/auth/cognito";
import * as auth from "aws-amplify/auth";
import { authConfig } from "./config";
import { credentialStorage } from "./storage";
let configured = false;
try {
  if (/^[a-z]{2}-[a-z]+-\d_[A-Za-z0-9]+$/.test(authConfig.userPoolId) && /^[A-Za-z0-9]+$/.test(authConfig.userPoolClientId)) {
    Amplify.configure({ Auth: { Cognito: authConfig } });
    cognitoUserPoolsTokenProvider.setKeyValueStorage(credentialStorage);
    configured = true;
  }
} catch { /* Authentication configuration must not block manual tracking. */ }
function requireConfiguration() { if (!configured) throw new Error("Authentication is unavailable"); }
export interface AuthClient {
  register(email: string, password: string): Promise<void>;
  confirm(email: string, code: string): Promise<void>;
  resend(email: string): Promise<void>;
  login(email: string, password: string): Promise<"signedIn" | "confirm">;
  recover(email: string): Promise<void>;
  reset(email: string, code: string, password: string): Promise<void>;
  restore(): Promise<string | null>;
  signOut(): Promise<void>;
  accessToken(): Promise<string>;
}
export const authClient: AuthClient = {
  async register(email, password) { requireConfiguration(); await auth.signUp({ username: email, password, options: { userAttributes: { email } } }); },
  async confirm(email, code) { requireConfiguration(); await auth.confirmSignUp({ username: email, confirmationCode: code }); },
  async resend(email) { requireConfiguration(); await auth.resendSignUpCode({ username: email }); },
  async login(email, password) {
    requireConfiguration();
    const result = await auth.signIn({ username: email, password, options: { authFlowType: "USER_SRP_AUTH" } });
    if (result.isSignedIn) return "signedIn";
    if (result.nextStep.signInStep === "CONFIRM_SIGN_UP") return "confirm";
    throw new Error("Unsupported sign-in step");
  },
  async recover(email) { requireConfiguration(); await auth.resetPassword({ username: email }); },
  async reset(email, code, password) { requireConfiguration(); await auth.confirmResetPassword({ username: email, confirmationCode: code, newPassword: password }); },
  async restore() { if (!configured) return null; try { return (await auth.getCurrentUser()).signInDetails?.loginId ?? null; } catch { return null; } },
  async signOut() { try { await auth.signOut(); } finally { await credentialStorage.clear(); } },
  async accessToken() {
    requireConfiguration();
    try {
      const session = await auth.fetchAuthSession({ forceRefresh: true });
      const token = session.tokens?.accessToken.toString();
      if (!token) throw new AuthenticationRequiredError();
      return token;
    } catch (error) {
      if (error instanceof AuthenticationRequiredError || (error instanceof Error && ["NotAuthorizedException", "UserUnAuthenticatedException"].includes(error.name))) throw new AuthenticationRequiredError();
      throw new Error("Authentication is unavailable");
    }
  },
};
