import { commonEn, commonEs } from "./catalogs/common";
import { navigationEn, navigationEs } from "./catalogs/navigation";
import { dashboardEn, dashboardEs } from "./catalogs/dashboard";
import { settingsEn, settingsEs } from "./catalogs/settings";
import { transactionsEn, transactionsEs } from "./catalogs/transactions";
import { budgetsEn, budgetsEs } from "./catalogs/budgets";
import { voiceEn, voiceEs } from "./catalogs/voice";
import { reportsEn, reportsEs } from "./catalogs/reports";

export const uiEn = { ...commonEn, ...navigationEn, ...dashboardEn, ...settingsEn, ...transactionsEn, ...budgetsEn, ...voiceEn, ...reportsEn } as const;
export const uiEs: Record<keyof typeof uiEn, string> = { ...commonEs, ...navigationEs, ...dashboardEs, ...settingsEs, ...transactionsEs, ...budgetsEs, ...voiceEs, ...reportsEs };
