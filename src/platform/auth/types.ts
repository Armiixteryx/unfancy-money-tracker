import type { BackendStage } from "../runtime/cloudConfig";

export type AuthState =
  | "signed_out"
  | "loading"
  | "signed_in"
  | "refreshing"
  | "offline_session"
  | "invalid_credentials"
  | "error";

export type AuthErrorCode =
  | "invalid_credentials"
  | "offline"
  | "confirmation_required"
  | "invalid_confirmation_code"
  | "invalid_password_reset_code"
  | "account_exists"
  | "invalid_request"
  | "provider_unavailable";

export type AuthSession = {
  provider: "cognito" | "test";
  backendStage: BackendStage | "test";
  accountId: string;
  status: "verified" | "unverified";
  accessToken: string;
  refreshToken: string | null;
  expiresAt: string | null;
};

export type SignUpInput = { email: string; password: string };
export type SignInInput = SignUpInput;
export type PasswordResetConfirmation = { email: string; code: string; newPassword: string };

export type AuthActionResult =
  | { status: "signed_in"; session: AuthSession }
  | { status: "confirmation_required" }
  | { status: "code_sent" }
  | { status: "completed" };

export class AuthClientError extends Error {
  constructor(readonly code: AuthErrorCode, message: string) {
    super(message);
    this.name = "AuthClientError";
  }
}

export interface AuthClient {
  signUp(input: SignUpInput): Promise<AuthActionResult>;
  confirmSignUp(email: string, code: string): Promise<AuthActionResult>;
  signIn(input: SignInInput): Promise<AuthActionResult>;
  refreshSession(): Promise<AuthActionResult>;
  signOut(): Promise<AuthActionResult>;
  requestPasswordReset(email: string): Promise<AuthActionResult>;
  confirmPasswordReset(input: PasswordResetConfirmation): Promise<AuthActionResult>;
  getSession(): Promise<{ state: AuthState; session: AuthSession | null }>;
}
