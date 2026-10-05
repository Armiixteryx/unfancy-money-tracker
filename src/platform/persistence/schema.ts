import { z } from "zod";
import { currencyCodeSchema, selectedCurrenciesSchema } from "../../domain/currency";
import { categoryIdSchema, uuidSchema } from "../../domain/validation";
import { transactionSchema, categorySchema, budgetSchema } from "../../domain/recordSchemas";
import { CURRENT_SCHEMA_VERSION } from "./version";
import { syncStateSchema } from "../../features/sync/state";
export { transactionSchema, categorySchema, budgetSchema } from "../../domain/recordSchemas";

const categoryDeletionTombstoneSchema = z.object({
  recordType: z.literal("category"),
  recordId: categoryIdSchema,
  deletedAt: z.string().datetime()
});

export const preferencesSchema = z.object({
  baseCurrency: currencyCodeSchema,
  selectedCurrencies: selectedCurrenciesSchema,
  language: z.enum(["system", "en", "es"]),
  theme: z.enum(["system", "light", "dark"]),
  analyticsConsent: z.boolean(),
  firstRunNoticeDismissed: z.boolean()
}).superRefine((preferences, context) => {
  if (!preferences.selectedCurrencies.includes(preferences.baseCurrency)) {
    context.addIssue({ code: "custom", path: ["selectedCurrencies"], message: "Base currency must be selected" });
  }
});

export const datasetEnvelopeSchema = z.object({
  schemaVersion: z.literal(CURRENT_SCHEMA_VERSION),
  datasetId: uuidSchema,
  transactions: z.array(transactionSchema),
  categories: z.array(categorySchema),
  budgets: z.array(budgetSchema),
  categoryDeletionTombstones: z.array(categoryDeletionTombstoneSchema),
  preferences: preferencesSchema,
  sync: syncStateSchema.optional()
});

export type PersistedDataset = z.infer<typeof datasetEnvelopeSchema>;
