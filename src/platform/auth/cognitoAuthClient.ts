import { z } from "zod";

import { AuthClientError, type AuthActionResult, type AuthClient, type AuthSession, type AuthState, type PasswordResetConfirmation, type SignInInput, type SignUpInput } from "./types";
import { RuntimeAuthSessionStore, type AuthSessionStore } from "./sessionStore";

type CognitoAuthConfig = { region: string; clientId: string; fetcher?: typeof fetch; sessionStore?: AuthSessionStore };
type AuthenticationResult = { AccessToken?: string; RefreshToken?: string; ExpiresIn?: number };
type InitiateAuthResponse = { AuthenticationResult?: AuthenticationResult };
type GetUserResponse = { UserAttributes?: readonly { Name?: string; Value?: string }[] };

const initiateAuthResponseSchema: z.ZodType<InitiateAuthResponse> = z.object({
  AuthenticationResult: z.object({ AccessToken: z.string().optional(), RefreshToken: z.string().optional(), ExpiresIn: z.number().optional() }).optional()
});
const getUserResponseSchema: z.ZodType<GetUserResponse> = z.object({
  UserAttributes: z.array(z.object({ Name: z.string().optional(), Value: z.string().optional() })).readonly().optional()
});

export class CognitoAuthClient implements AuthClient {
  private readonly endpoint: string;
  private readonly fetcher: typeof fetch;
  private readonly sessionStore: AuthSessionStore;
  private session: AuthSession | null = null;
  private loadPromise: Promise<void> | null = null;

  constructor(private readonly config: CognitoAuthConfig) {
    this.endpoint = `https://cognito-idp.${config.region}.amazonaws.com/`;
    this.fetcher = config.fetcher ?? fetch;
    this.sessionStore = config.sessionStore ?? new RuntimeAuthSessionStore();
  }

  async signUp(input: SignUpInput): Promise<AuthActionResult> {
    try {
      await this.request("AWSCognitoIdentityProviderService.SignUp", { ClientId: this.config.clientId, Username: input.email, Password: input.password });
      return { status: "confirmation_required" };
    } catch (error) {
      throw mapCognitoError(error);
    }
  }

  async confirmSignUp(email: string, code: string): Promise<AuthActionResult> {
    try {
      await this.request("AWSCognitoIdentityProviderService.ConfirmSignUp", { ClientId: this.config.clientId, Username: email, ConfirmationCode: code });
      return { status: "completed" };
    } catch (error) {
      throw mapCognitoError(error);
    }
  }

  async signIn(input: SignInInput): Promise<AuthActionResult> {
    await this.ensureLoaded();
    try {
      const response = initiateAuthResponseSchema.parse(await this.request("AWSCognitoIdentityProviderService.InitiateAuth", {
        AuthFlow: "USER_PASSWORD_AUTH",
        ClientId: this.config.clientId,
        AuthParameters: { USERNAME: input.email, PASSWORD: input.password }
      }));
      const auth = response.AuthenticationResult;
      if (!auth?.AccessToken) throw new AuthClientError("invalid_credentials", "The email or password is not valid.");
      const accountId = await this.getAccountId(auth.AccessToken);
      this.session = {
        accountId,
        status: "verified",
        accessToken: auth.AccessToken,
        refreshToken: auth.RefreshToken ?? null,
        expiresAt: auth.ExpiresIn ? new Date(Date.now() + auth.ExpiresIn * 1000).toISOString() : null
      };
      await this.sessionStore.set(this.session);
      return { status: "signed_in", session: this.session };
    } catch (error) {
      throw mapCognitoError(error);
    }
  }

  async refreshSession(): Promise<AuthActionResult> {
    await this.ensureLoaded();
    if (!this.session?.refreshToken) throw new AuthClientError("invalid_credentials", "Your session is no longer available.");
    try {
      const response = initiateAuthResponseSchema.parse(await this.request("AWSCognitoIdentityProviderService.InitiateAuth", {
        AuthFlow: "REFRESH_TOKEN_AUTH",
        ClientId: this.config.clientId,
        AuthParameters: { REFRESH_TOKEN: this.session.refreshToken }
      }));
      const auth = response.AuthenticationResult;
      if (!auth?.AccessToken) throw new AuthClientError("invalid_credentials", "Your session is no longer available.");
      this.session = { ...this.session, accessToken: auth.AccessToken, expiresAt: auth.ExpiresIn ? new Date(Date.now() + auth.ExpiresIn * 1000).toISOString() : null };
      await this.sessionStore.set(this.session);
      return { status: "signed_in", session: this.session };
    } catch (error) {
      throw mapCognitoError(error);
    }
  }

  async signOut(): Promise<AuthActionResult> {
    await this.ensureLoaded();
    if (this.session?.accessToken) {
      try {
        await this.request("AWSCognitoIdentityProviderService.GlobalSignOut", { AccessToken: this.session.accessToken });
      } catch (error) {
        const mapped = mapCognitoError(error);
        if (mapped.code !== "offline") throw mapped;
      }
    }
    this.session = null;
    await this.sessionStore.clear();
    return { status: "completed" };
  }

  async requestPasswordReset(email: string): Promise<AuthActionResult> {
    try {
      await this.request("AWSCognitoIdentityProviderService.ForgotPassword", { ClientId: this.config.clientId, Username: email });
      return { status: "code_sent" };
    } catch (error) {
      throw mapCognitoError(error);
    }
  }

  async confirmPasswordReset(input: PasswordResetConfirmation): Promise<AuthActionResult> {
    try {
      await this.request("AWSCognitoIdentityProviderService.ConfirmForgotPassword", { ClientId: this.config.clientId, Username: input.email, ConfirmationCode: input.code, Password: input.newPassword });
      return { status: "completed" };
    } catch (error) {
      throw mapCognitoError(error);
    }
  }

  async getSession(): Promise<{ state: AuthState; session: AuthSession | null }> {
    await this.ensureLoaded();
    if (!this.session) return { state: "signed_out", session: null };
    if (this.session.expiresAt && new Date(this.session.expiresAt).getTime() <= Date.now() && this.session.refreshToken) {
      try {
        const refreshed = await this.refreshSession();
        if (refreshed.status === "signed_in") return { state: "signed_in", session: refreshed.session };
      } catch (error) {
        if (error instanceof AuthClientError && error.code === "offline") return { state: "offline_session", session: this.session };
        if (error instanceof AuthClientError && error.code === "invalid_credentials") {
          this.session = null;
          await this.sessionStore.clear();
          return { state: "invalid_credentials", session: null };
        }
      }
    }
    return { state: "signed_in", session: this.session };
  }

  private async getAccountId(accessToken: string): Promise<string> {
    const response = getUserResponseSchema.parse(await this.request("AWSCognitoIdentityProviderService.GetUser", { AccessToken: accessToken }));
    return response.UserAttributes?.find((attribute) => attribute.Name === "sub")?.Value ?? "cognito-subject";
  }

  private async ensureLoaded(): Promise<void> {
    if (!this.loadPromise) {
      this.loadPromise = this.sessionStore.get().then((session) => { this.session = session; }).finally(() => { this.loadPromise = null; });
    }
    await this.loadPromise;
  }

  private async request(target: string, body: Record<string, unknown>): Promise<unknown> {
    let response: Response;
    try {
      response = await this.fetcher(this.endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/x-amz-json-1.1", "X-Amz-Target": target },
        body: JSON.stringify(body)
      });
    } catch {
      throw new AuthClientError("offline", "This action requires a connection.");
    }
    if (!response.ok) {
      const code = response.headers.get("x-amzn-errortype")?.split(":")[0] ?? "ProviderError";
      throw new CognitoProviderError(code);
    }
    if (response.status === 204) return undefined;
    try {
      return await response.json() as unknown;
    } catch {
      throw new CognitoProviderError("InvalidResponse");
    }
  }
}

class CognitoProviderError extends Error {
  constructor(readonly providerCode: string) {
    super(providerCode);
    this.name = providerCode;
  }
}

function mapCognitoError(error: unknown): AuthClientError {
  if (error instanceof AuthClientError) return error;
  const name = error instanceof CognitoProviderError ? error.providerCode : error instanceof Error ? error.name : "UnknownError";
  if (name === "NotAuthorizedException" || name === "UserNotFoundException") return new AuthClientError("invalid_credentials", "The email or password is not valid.");
  if (name === "UserNotConfirmedException") return new AuthClientError("confirmation_required", "Confirm your email before signing in.");
  if (name === "CodeMismatchException" || name === "ExpiredCodeException") return new AuthClientError("invalid_confirmation_code", "That confirmation code is not valid.");
  if (name === "UsernameExistsException") return new AuthClientError("account_exists", "This account cannot be created.");
  if (name === "CodeDeliveryFailureException" || name === "LimitExceededException") return new AuthClientError("provider_unavailable", "We could not complete that request. Try again later.");
  if (name === "NetworkError" || name === "TimeoutError") return new AuthClientError("offline", "This action requires a connection.");
  return new AuthClientError("provider_unavailable", "We could not complete that request. Try again later.");
}
