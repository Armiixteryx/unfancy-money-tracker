export const ANALYTICS_EVENTS = [
  "dashboard_viewed",
  "report_viewed",
  "transaction_created",
  "budget_created",
  "transaction_filter_applied",
  "sync_account_intent",
  "sync_account_completed",
  "csv_upgrade_interest_clicked",
  "auth_signup_status",
  "auth_signin_status",
  "auth_password_reset_status",
  "auth_confirmation_status",
  "auth_error"
] as const;

export type AnalyticsEvent = (typeof ANALYTICS_EVENTS)[number];
export type AnalyticsProperties = {
  platform?: "web" | "ios" | "android";
  appVersion?: string;
  surface?: "dashboard" | "reports" | "transactions" | "budgets" | "settings" | "auth" | "sync";
  actionResult?: "success" | "error" | "started" | "cancelled";
  errorCode?: string;
  syncStatus?: string;
};

export interface AnalyticsClient {
  initialize(): Promise<void>;
  setConsent(enabled: boolean): Promise<void>;
  identifyAccount(accountSubject: string): Promise<void>;
  capture(event: AnalyticsEvent, properties?: AnalyticsProperties): Promise<void>;
}

export interface AnalyticsIdentityStore {
  get(): Promise<string | null>;
  set(value: string): Promise<void>;
}

export const REPLAY_MASKING_SELECTORS = [
  "input",
  "textarea",
  "[data-financial-value]",
  "[data-financial-content]",
  "[data-transaction-row]",
  "[data-chart-value]"
] as const;
