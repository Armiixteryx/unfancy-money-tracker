export const ANALYTICS_EVENTS = [
  "dashboard_viewed",
  "report_viewed",
  "transaction_created",
  "budget_created",
  "transaction_filter_applied",
  "csv_upgrade_interest_clicked"
] as const;

export type AnalyticsEvent = (typeof ANALYTICS_EVENTS)[number];
export type AnalyticsProperties = {
  platform?: "web" | "ios" | "android";
  appVersion?: string;
  surface?: "dashboard" | "reports" | "transactions" | "budgets" | "settings";
  actionResult?: "success" | "error" | "started" | "cancelled";
  errorCode?: string;
};

export interface AnalyticsClient {
  initialize(): Promise<void>;
  setConsent(enabled: boolean): Promise<void>;
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
