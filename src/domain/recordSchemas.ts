import { DEFAULT_CATEGORY_KEYS } from "./types";
import { z } from "zod";

import { currencyCodeSchema } from "./currency";
import { normalizeMoneyAmount } from "./money";
import { calendarDateSchema, calendarMonthSchema, categoryIdSchema, uuidSchema } from "./validation";

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
    categoryId: categoryIdSchema,
    description: z.string().min(1).max(200),
    date: calendarDateSchema,
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime()
  })
  .superRefine((transaction, context) => {
    try {
      const normalized = normalizeMoneyAmount(transaction.amount, transaction.currency, { allowNegative:false,allowZero:false });
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
  id: categoryIdSchema,
  kind: z.enum(["income", "expense"]),
  name: z.string().min(1).max(80),
  defaultCategoryKey: z.enum(DEFAULT_CATEGORY_KEYS).optional(),
  isSystem: z.boolean(),
  isArchived: z.boolean(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime()
}).superRefine((category, context) => {
  const key = category.defaultCategoryKey;
  if (category.isSystem && (!key || category.isArchived)) {
    context.addIssue({ code: "custom", message: "System categories must have a semantic key and remain active" });
  }
  if (key && (key === "income" ? category.kind !== "income" : key !== "uncategorized" && category.kind !== "expense")) {
    context.addIssue({ code: "custom", path: ["defaultCategoryKey"], message: "Category key must match its kind" });
  }
  if (key && !category.isSystem) {
    context.addIssue({ code: "custom", path: ["isSystem"], message: "Built-in categories must be protected" });
  }
});

export const budgetSchema = z
  .object({
    id: uuidSchema,
    categoryId: categoryIdSchema,
    month: calendarMonthSchema,
    amount: canonicalAmount,
    currency: currencyCodeSchema,
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime()
  })
  .superRefine((budget, context) => {
    try {
      const normalized = normalizeMoneyAmount(budget.amount, budget.currency, { allowNegative:false,allowZero:false });
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
