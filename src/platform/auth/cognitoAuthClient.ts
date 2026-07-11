import {
  CognitoIdentityProviderClient,
  ConfirmForgotPasswordCommand,
  ConfirmSignUpCommand,
  ForgotPasswordCommand,
  GetUserCommand,
  InitiateAuthCommand,
  SignUpCommand,
  GlobalSignOutCommand
} from "@aws-sdk/client-cognito-identity-provider";

import { AuthClientError, type AuthActionResult, type AuthClient, type AuthSession, type AuthState, type PasswordResetConfirmation, type SignInInput, type SignUpInput } from "./types";

type CognitoAuthConfig = { region: string; clientId: string; client?: CognitoIdentityProviderClient };

export class CognitoAuthClient implements AuthClient {
  private readonly client: CognitoIdentityProviderClient;
  private session: AuthSession | null = null;

  constructor(private readonly config: CognitoAuthConfig) {
    this.client = config.client ?? new CognitoIdentityProviderClient({ region: config.region });
  }

  async signUp(input: SignUpInput): Promise<AuthActionResult> {
    try {
      await this.client.send(new SignUpCommand({ ClientId: this.config.clientId, Username: input.email, Password: input.password }));
      return { status: "confirmation_required" };
    } catch (error) {
      throw mapCognitoError(error);
    }
  }

  async confirmSignUp(email: string, code: string): Promise<AuthActionResult> {
    try {
      await this.client.send(new ConfirmSignUpCommand({ ClientId: this.config.clientId, Username: email, ConfirmationCode: code }));
      return { status: "completed" };
    } catch (error) {
      throw mapCognitoError(error);
    }
  }

  async signIn(input: SignInInput): Promise<AuthActionResult> {
    try {
      const response = await this.client.send(new InitiateAuthCommand({
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
      return { status: "signed_in", session: this.session };
    } catch (error) {
      throw mapCognitoError(error);
    }
  }

  async refreshSession(): Promise<AuthActionResult> {
    if (!this.session?.refreshToken) throw new AuthClientError("invalid_credentials", "Your session is no longer available.");
    try {
      const response = await this.client.send(new InitiateAuthCommand({
        AuthFlow: "REFRESH_TOKEN_AUTH",
        ClientId: this.config.clientId,
        AuthParameters: { REFRESH_TOKEN: this.session.refreshToken }
      }));
      const auth = response.AuthenticationResult;
      if (!auth?.AccessToken) throw new AuthClientError("invalid_credentials", "Your session is no longer available.");
      this.session = { ...this.session, accessToken: auth.AccessToken, expiresAt: auth.ExpiresIn ? new Date(Date.now() + auth.ExpiresIn * 1000).toISOString() : null };
      return { status: "signed_in", session: this.session };
    } catch (error) {
      throw mapCognitoError(error);
    }
  }

  async signOut(): Promise<AuthActionResult> {
    if (this.session?.accessToken) {
      try {
        await this.client.send(new GlobalSignOutCommand({ AccessToken: this.session.accessToken }));
      } catch (error) {
        throw mapCognitoError(error);
      }
    }
    this.session = null;
    return { status: "completed" };
  }

  async requestPasswordReset(email: string): Promise<AuthActionResult> {
    try {
      await this.client.send(new ForgotPasswordCommand({ ClientId: this.config.clientId, Username: email }));
      return { status: "code_sent" };
    } catch (error) {
      throw mapCognitoError(error);
    }
  }

  async confirmPasswordReset(input: PasswordResetConfirmation): Promise<AuthActionResult> {
    try {
      await this.client.send(new ConfirmForgotPasswordCommand({ ClientId: this.config.clientId, Username: input.email, ConfirmationCode: input.code, Password: input.newPassword }));
      return { status: "completed" };
    } catch (error) {
      throw mapCognitoError(error);
    }
  }

  async getSession(): Promise<{ state: AuthState; session: AuthSession | null }> {
    return this.session ? { state: "signed_in", session: this.session } : { state: "signed_out", session: null };
  }

  private async getAccountId(accessToken: string): Promise<string> {
    const response = await this.client.send(new GetUserCommand({ AccessToken: accessToken }));
    return response.UserAttributes?.find((attribute) => attribute.Name === "sub")?.Value ?? "cognito-subject";
  }
}

function mapCognitoError(error: unknown): AuthClientError {
  const name = error instanceof Error ? error.name : "UnknownError";
  if (name === "NotAuthorizedException" || name === "UserNotFoundException") return new AuthClientError("invalid_credentials", "The email or password is not valid.");
  if (name === "UserNotConfirmedException") return new AuthClientError("confirmation_required", "Confirm your email before signing in.");
  if (name === "CodeMismatchException" || name === "ExpiredCodeException") return new AuthClientError("invalid_confirmation_code", "That confirmation code is not valid.");
  if (name === "UsernameExistsException") return new AuthClientError("account_exists", "This account cannot be created.");
  if (name === "CodeDeliveryFailureException" || name === "LimitExceededException") return new AuthClientError("provider_unavailable", "We could not complete that request. Try again later.");
  if (name === "NetworkError" || name === "TimeoutError") return new AuthClientError("offline", "This action requires a connection.");
  return new AuthClientError("provider_unavailable", "We could not complete that request. Try again later.");
}
