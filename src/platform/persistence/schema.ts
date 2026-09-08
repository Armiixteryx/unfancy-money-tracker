import { z } from "zod";

import { currencyCodeSchema } from "../../domain/currency";
import { normalizeMoneyAmount } from "../../domain/money";
import { calendarDateSchema, calendarMonthSchema, uuidSchema } from "../../domain/validation";
import { CURRENT_SCHEMA_VERSION } from "./version";

const canonicalAmount = z.string().superRefine((value, context) => {
  if (/[eE]/.test(value)) {
    context.addIssue({ code: "custom", message: "Persisted amounts cannot use exponent notation" });
  }
});

export const transactionSchema = z
  .object({
    id: uuidSchema,
    amount: canonicalAmount,
    currency: currencyCodeSchema,
    type: z.enum(["income", "expense"]),
    categoryId: uuidSchema,
    description: z.string().min(1).max(200),
    date: calendarDateSchema,
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime()
  })
  .superRefine((transaction, context) => {
    try {
      const normalized = normalizeMoneyAmount(transaction.amount, transaction.currency);
      if (normalized !== transaction.amount) {
        context.addIssue({ code: "custom", path: ["amount"], message: "Persisted amount is not canonical" });
      }
    } catch (error) {
      context.addIssue({
        code: "custom",
        path: ["amount"],
        message: error instanceof Error ? error.message : "Persisted amount is invalid"
      });
    }
  });

export const categorySchema = z.object({
  id: uuidSchema,
  kind: z.enum(["income", "expense"]),
  name: z.string().min(1).max(80),
  isSystem: z.boolean(),
  isArchived: z.boolean(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime()
});

export const budgetSchema = z
  .object({
    id: uuidSchema,
    categoryId: uuidSchema,
    month: calendarMonthSchema,
    amount: canonicalAmount,
    currency: currencyCodeSchema,
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime()
  })
  .superRefine((budget, context) => {
    try {
      const normalized = normalizeMoneyAmount(budget.amount, budget.currency);
      if (normalized !== budget.amount) {
        context.addIssue({ code: "custom", path: ["amount"], message: "Persisted amount is not canonical" });
      }
    } catch (error) {
      context.addIssue({
        code: "custom",
        path: ["amount"],
        message: error instanceof Error ? error.message : "Persisted amount is invalid"
      });
    }
  });

const categoryDeletionTombstoneSchema = z.object({
  recordType: z.literal("category"),
  recordId: uuidSchema,
  deletedAt: z.string().datetime()
});

export const preferencesSchema = z.object({
  baseCurrency: currencyCodeSchema,
  theme: z.enum(["system", "light", "dark"]),
  analyticsConsent: z.boolean(),
  firstRunNoticeDismissed: z.boolean()
});

export const datasetEnvelopeSchema = z.object({
  schemaVersion: z.literal(CURRENT_SCHEMA_VERSION),
  datasetId: uuidSchema,
  transactions: z.array(transactionSchema),
  categories: z.array(categorySchema),
  budgets: z.array(budgetSchema),
  categoryDeletionTombstones: z.array(categoryDeletionTombstoneSchema),
  preferences: preferencesSchema
});

export type PersistedDataset = z.infer<typeof datasetEnvelopeSchema>;
