import { z } from "zod";
import type { Category, DefaultCategoryKey } from "../src/domain/types";

export type VoiceSmokeOutcome =
  | "matched"
  | "identity_mismatch"
  | "amount_mismatch"
  | "currency_mismatch"
  | "model_fallback"
  | "wrong_selection";

export interface VoiceSmokeExpectation {
  requestId: string;
  amount: string;
  currency: string;
  categoryId: string;
  fallbackCategoryId: string;
}

export interface VoiceSmokeResponse {
  requestId: string;
  transaction: {
    amount: string;
    currency: string;
    categoryId: string;
  };
}

export function evaluateVoiceSmokeResponse(
  response: VoiceSmokeResponse,
  expected: VoiceSmokeExpectation,
): { outcome: VoiceSmokeOutcome; passed: boolean } {
  const outcome: VoiceSmokeOutcome =
    response.requestId !== expected.requestId
      ? "identity_mismatch"
      : response.transaction.amount !== expected.amount
        ? "amount_mismatch"
        : response.transaction.currency !== expected.currency
          ? "currency_mismatch"
          : response.transaction.categoryId === expected.categoryId
            ? "matched"
            : response.transaction.categoryId === expected.fallbackCategoryId
              ? "model_fallback"
              : "wrong_selection";
  return { outcome, passed: outcome === "matched" };
}

export function expectedSystemExpenseCategoryId(
  categories: readonly Pick<
    Category,
    "id" | "kind" | "isSystem" | "defaultCategoryKey"
  >[],
  key: DefaultCategoryKey,
): string {
  const expectedId = `expense-${key}`;
  const category = categories.find(
    (candidate) =>
      candidate.id === expectedId &&
      candidate.kind === "expense" &&
      candidate.isSystem &&
      candidate.defaultCategoryKey === key,
  );
  if (!category) throw new Error("Expected system category is unavailable.");
  return expectedId;
}

const awsDevStackSchema = z.object({
  Stacks: z.array(
    z.object({
      StackName: z.literal("UnfancyMoneyTracker-dev"),
      StackStatus: z.string(),
      Outputs: z.array(
        z.object({ OutputKey: z.string(), OutputValue: z.string() }),
      ),
    }),
  ),
});

export interface AwsDevVoiceSettings {
  apiUrl: string;
  region: "us-east-1";
  userPoolId: "us-east-1_gCLS9k4s0";
  userPoolClientId: "63kh2vrfpvd7h9moob0m9l2umf";
}

export function parseAwsDevVoiceSettings(value: unknown): AwsDevVoiceSettings {
  const parsed = awsDevStackSchema.parse(value);
  const stack = parsed.Stacks[0];
  if (!stack || !["CREATE_COMPLETE", "UPDATE_COMPLETE"].includes(stack.StackStatus))
    throw new Error("AWS development stack is not ready.");
  const output = (key: string) =>
    stack.Outputs.find((candidate) => candidate.OutputKey === key)?.OutputValue;
  const apiUrl = output("ApiUrl");
  const region = output("CognitoRegion");
  const userPoolId = output("CognitoUserPoolId");
  const userPoolClientId = output("CognitoClientId");
  const parsedApiUrl = apiUrl ? new URL(apiUrl) : undefined;
  if (
    !parsedApiUrl ||
    parsedApiUrl.protocol !== "https:" ||
    !parsedApiUrl.hostname.endsWith(".execute-api.us-east-1.amazonaws.com") ||
    region !== "us-east-1" ||
    userPoolId !== "us-east-1_gCLS9k4s0" ||
    userPoolClientId !== "63kh2vrfpvd7h9moob0m9l2umf"
  )
    throw new Error("AWS development voice settings did not match the expected target.");
  return { apiUrl: parsedApiUrl.toString(), region, userPoolId, userPoolClientId };
}
