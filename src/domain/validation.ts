import { z } from "zod";

import { currencyCodeSchema } from "./currency";
import { normalizeMoneyAmount } from "./money";
import type { CategoryKind, TransactionType } from "./types";

export const uuidSchema = z.string().uuid();
export const calendarDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD");
export const calendarMonthSchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Use YYYY-MM");

function isRealCalendarDate(value: string): boolean {
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

const baseTransactionInputSchema = z.object({
  amount: z.string(),
  type: z.enum(["income", "expense"]),
  categoryId: uuidSchema,
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
      message: error instanceof Error ? error.message : "Enter a valid positive amount"
    });
  }

  if (!isRealCalendarDate(input.date)) {
    context.addIssue({ code: "custom", path: ["date"], message: "Enter a real calendar date" });
  }
});

export type TransactionInput = z.infer<typeof transactionInputSchema>;

export const budgetInputSchema = z
  .object({
    categoryId: uuidSchema,
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
        message: error instanceof Error ? error.message : "Enter a valid positive budget"
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
    throw new Error("Category type must match transaction type");
  }
}
