import { AuthClientError, type AuthActionResult, type AuthClient, type AuthSession, type AuthState, type PasswordResetConfirmation, type SignInInput, type SignUpInput } from "./types";
import { MemoryAuthSessionStore, type AuthSessionStore } from "./sessionStore";
import { createUuid } from "../identifiers/createUuid";
import { v5 as uuid } from "uuid";

type LocalUser = { email: string; password: string; confirmed: boolean; resetCode: string | null; accountId: string };
export type TestAuthEmail = { to: string; code: string; kind: "confirmation" | "password_reset" };
export type TestAuthEmailSender = { send(email: TestAuthEmail): Promise<void> };
const LOCAL_ACCOUNT_NAMESPACE = "e162fd3f-39e7-449b-a63d-3060e8568e31";
const discardTestEmail: TestAuthEmailSender = { async send() { return undefined; } };

export class LocalAuthClient implements AuthClient {
  private readonly users = new Map<string, LocalUser>();
  private session: AuthSession | null = null;
  private online = true;
  private readonly sessionStore: AuthSessionStore;
  private loadPromise: Promise<void> | null = null;

  constructor(sessionStore: AuthSessionStore = new MemoryAuthSessionStore(), private readonly emailSender: TestAuthEmailSender = discardTestEmail) {
    this.sessionStore = sessionStore;
  }

  setOnline(online: boolean): void {
    this.online = online;
  }

  async signUp(input: SignUpInput): Promise<AuthActionResult> {
    this.requireOnline();
    if (this.users.has(input.email)) throw new AuthClientError("account_exists", "This account cannot be created.");
    const user: LocalUser = { email: input.email, password: input.password, confirmed: false, resetCode: null, accountId: `local-${uuid(input.email, LOCAL_ACCOUNT_NAMESPACE)}` };
    this.users.set(input.email, user);
    try {
      await this.emailSender.send({ to: input.email, code: "000000", kind: "confirmation" });
    } catch {
      this.users.delete(input.email);
      throw new AuthClientError("provider_unavailable", "The local email service is unavailable.");
    }
    return { status: "confirmation_required" };
  }

  async confirmSignUp(email: string, code: string): Promise<AuthActionResult> {
    this.requireOnline();
    const user = this.users.get(email);
    if (!user || code !== "000000") throw new AuthClientError("invalid_confirmation_code", "That confirmation code is not valid.");
    user.confirmed = true;
    return { status: "completed" };
  }

  async signIn(input: SignInInput): Promise<AuthActionResult> {
    await this.ensureLoaded();
    this.requireOnline();
    const user = this.users.get(input.email);
    if (!user || user.password !== input.password) throw new AuthClientError("invalid_credentials", "The email or password is not valid.");
    if (!user.confirmed) throw new AuthClientError("confirmation_required", "Confirm your email before signing in.");
    this.session = this.createSession(user.accountId, "verified");
    await this.sessionStore.set(this.session);
    return { status: "signed_in", session: this.session };
  }

  async refreshSession(): Promise<AuthActionResult> {
    await this.ensureLoaded();
    if (!this.session) throw new AuthClientError("invalid_credentials", "Your session is no longer available.");
    if (!this.online) return { status: "signed_in", session: { ...this.session, accessToken: "local-offline-session" } };
    this.session = this.createSession(this.session.accountId, this.session.status);
    await this.sessionStore.set(this.session);
    return { status: "signed_in", session: this.session };
  }

  async signOut(): Promise<AuthActionResult> {
    await this.ensureLoaded();
    this.session = null;
    await this.sessionStore.clear();
    return { status: "completed" };
  }

  async requestPasswordReset(email: string): Promise<AuthActionResult> {
    this.requireOnline();
    const user = this.users.get(email);
    if (user) {
      const previousResetCode = user.resetCode;
      user.resetCode = "000000";
      try {
        await this.emailSender.send({ to: email, code: "000000", kind: "password_reset" });
      } catch {
        user.resetCode = previousResetCode;
        throw new AuthClientError("provider_unavailable", "The local email service is unavailable.");
      }
    }
    return { status: "code_sent" };
  }

  async confirmPasswordReset(input: PasswordResetConfirmation): Promise<AuthActionResult> {
    this.requireOnline();
    const user = this.users.get(input.email);
    if (!user || user.resetCode !== input.code) throw new AuthClientError("invalid_password_reset_code", "That password reset code is not valid.");
    user.password = input.newPassword;
    user.resetCode = null;
    return { status: "completed" };
  }

  async getSession(): Promise<{ state: AuthState; session: AuthSession | null }> {
    await this.ensureLoaded();
    if (!this.session) return { state: "signed_out", session: null };
    return { state: this.online ? "signed_in" : "offline_session", session: this.session };
  }

  private requireOnline(): void {
    if (!this.online) throw new AuthClientError("offline", "This action requires a connection.");
  }

  private createSession(accountId: string, status: AuthSession["status"]): AuthSession {
    return { provider: "test", backendStage: "test", accountId, status, accessToken: `local-access-${createUuid()}`, refreshToken: `local-refresh-${createUuid()}`, expiresAt: null };
  }

  private async ensureLoaded(): Promise<void> {
    if (!this.loadPromise) {
      this.loadPromise = this.sessionStore.get().then((session) => { this.session = session; }).finally(() => { this.loadPromise = null; });
    }
    await this.loadPromise;
  }
}
