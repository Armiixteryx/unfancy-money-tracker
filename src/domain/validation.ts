import { DomainError, errorToken } from "./errors";
import { z } from "zod";

import { currencyCodeSchema } from "./currency";
import { normalizeMoneyAmount } from "./money";
import type { CategoryKind, TransactionType } from "./types";

export const uuidSchema = z.string().uuid();
export const uuidV7Schema = z.string().uuid().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
export const systemCategoryIds = ["income-income", "income-uncategorized", ...["food", "housing", "transport", "shopping", "utilities", "entertainment", "health", "education", "subscriptions", "uncategorized"].map(key => `expense-${key}`)];
// Historical UUIDs remain readable locally; new sync records use UUIDv7.
export const categoryIdSchema = z.union([uuidSchema, z.string().refine(value => systemCategoryIds.includes(value))]);
export const syncCategoryIdSchema = z.union([uuidV7Schema, z.string().refine(value => systemCategoryIds.includes(value))]);
export const calendarDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD");
export const calendarMonthSchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Use YYYY-MM");

function isRealCalendarDate(value: string): boolean {
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

const baseTransactionInputSchema = z.object({
  amount: z.string(),
  type: z.enum(["income", "expense"]),
  categoryId: categoryIdSchema,
  description: z.string().trim().min(1, "Description is required").max(200, "Description is too long"),
  date: calendarDateSchema,
  currency: currencyCodeSchema
});

export const transactionInputSchema = baseTransactionInputSchema.superRefine((input, context) => {
  try {
    normalizeMoneyAmount(input.amount, input.currency, { allowNegative: false, allowZero: false });
  } catch (error) {
    context.addIssue({
      code: "custom",
      path: ["amount"],
      message: errorToken(error)
    });
  }

  if (!isRealCalendarDate(input.date)) {
    context.addIssue({ code: "custom", path: ["date"], message: "Enter a real calendar date" });
  }
});

export type TransactionInput = z.infer<typeof transactionInputSchema>;

export const budgetInputSchema = z
  .object({
    categoryId: categoryIdSchema,
    month: calendarMonthSchema,
    amount: z.string(),
    currency: currencyCodeSchema
  })
  .superRefine((input, context) => {
    try {
      normalizeMoneyAmount(input.amount, input.currency, { allowNegative: false, allowZero: false });
    } catch (error) {
      context.addIssue({
        code: "custom",
        path: ["amount"],
        message: errorToken(error)
      });
    }
  });

export type BudgetInput = z.infer<typeof budgetInputSchema>;

export const categoryInputSchema = z.object({
  kind: z.enum(["income", "expense"]),
  name: z.string().trim().min(1, "Category name is required").max(80, "Category name is too long")
});

export type CategoryInput = z.infer<typeof categoryInputSchema>;

export function assertCategoryMatchesTransaction(categoryKind: CategoryKind, transactionType: TransactionType): void {
  if (categoryKind !== transactionType) {
    throw new DomainError("Category type must match transaction type");
  }
}
