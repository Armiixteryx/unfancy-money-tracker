import { describe, expect, it } from "vitest";
import {
  evaluateVoiceSmokeResponse,
  expectedSystemExpenseCategoryId,
  parseAwsDevVoiceSettings,
  type VoiceSmokeExpectation,
  type VoiceSmokeResponse,
} from "../../scripts/voice-smoke-contract";
import { createEmptyDataset } from "../platform/persistence/datasetPersistence";
import { voiceCategoryChoices } from "../features/voice/categoryChoices";
import { categoryLabel, i18n } from "../localization/i18n";

const expected: VoiceSmokeExpectation = {
  requestId: "request-1",
  amount: "10",
  currency: "USD",
  categoryId: "expense-food",
  fallbackCategoryId: "expense-uncategorized",
};

function response(
  changes: Partial<VoiceSmokeResponse["transaction"]> & {
    requestId?: string;
  } = {},
): VoiceSmokeResponse {
  const { requestId = "request-1", ...transaction } = changes;
  return {
    requestId,
    transaction: {
      amount: "10",
      currency: "USD",
      categoryId: "expense-food",
      ...transaction,
    },
  };
}

describe("voice smoke result contract", () => {
  it("passes only the exact expected system category ID", () => {
    expect(evaluateVoiceSmokeResponse(response(), expected)).toEqual({
      outcome: "matched",
      passed: true,
    });
    expect(
      evaluateVoiceSmokeResponse(
        response({ categoryId: "expense-shopping" }),
        expected,
      ),
    ).toEqual({ outcome: "wrong_selection", passed: false });
  });

  it("reports a fallback as a failed category match", () => {
    expect(
      evaluateVoiceSmokeResponse(
        response({ categoryId: "expense-uncategorized" }),
        expected,
      ),
    ).toEqual({ outcome: "model_fallback", passed: false });
  });

  it("rejects request, amount, and currency mismatches", () => {
    expect(
      evaluateVoiceSmokeResponse(response({ requestId: "other" }), expected)
        .outcome,
    ).toBe("identity_mismatch");
    expect(
      evaluateVoiceSmokeResponse(response({ amount: "11" }), expected).outcome,
    ).toBe("amount_mismatch");
    expect(
      evaluateVoiceSmokeResponse(response({ currency: "COP" }), expected)
        .outcome,
    ).toBe("currency_mismatch");
  });

  it("requires the fixed system slug and semantic key to agree", () => {
    expect(
      expectedSystemExpenseCategoryId(
        [
          {
            id: "expense-food",
            kind: "expense",
            isSystem: true,
            defaultCategoryKey: "food",
          },
        ],
        "food",
      ),
    ).toBe("expense-food");
    expect(() =>
      expectedSystemExpenseCategoryId(
        [
          {
            id: "old-food-id",
            kind: "expense",
            isSystem: true,
            defaultCategoryKey: "food",
          },
        ],
        "food",
      ),
    ).toThrow("Expected system category is unavailable.");
  });

  it("sends English and Spanish aliases under the same built-in category ID", async () => {
    const originalLanguage = i18n.language;
    const categories = createEmptyDataset().categories;
    try {
      await i18n.changeLanguage("en");
      const englishFood = voiceCategoryChoices(categories, categoryLabel).find(
        (choice) => choice.id === "expense-food",
      );
      await i18n.changeLanguage("es");
      const spanishFood = voiceCategoryChoices(categories, categoryLabel).find(
        (choice) => choice.id === "expense-food",
      );
      expect(englishFood?.name).not.toBe(spanishFood?.name);
      expect(englishFood?.localizedNames).toEqual(spanishFood?.localizedNames);
      expect(englishFood?.localizedNames?.en).toBeTruthy();
      expect(englishFood?.localizedNames?.es).toBeTruthy();
    } finally {
      await i18n.changeLanguage(originalLanguage);
    }
  });

  it("accepts only the deployed dev stack and its existing Cognito identities", () => {
    const settings = parseAwsDevVoiceSettings({
      Stacks: [
        {
          StackName: "UnfancyMoneyTracker-dev",
          StackStatus: "UPDATE_COMPLETE",
          Outputs: [
            {
              OutputKey: "ApiUrl",
              OutputValue: "https://abc123.execute-api.us-east-1.amazonaws.com/",
            },
            { OutputKey: "CognitoRegion", OutputValue: "us-east-1" },
            { OutputKey: "CognitoUserPoolId", OutputValue: "us-east-1_gCLS9k4s0" },
            {
              OutputKey: "CognitoClientId",
              OutputValue: "63kh2vrfpvd7h9moob0m9l2umf",
            },
          ],
        },
      ],
    });
    expect(settings.apiUrl).toBe(
      "https://abc123.execute-api.us-east-1.amazonaws.com/",
    );
    expect(() =>
      parseAwsDevVoiceSettings({
        Stacks: [
          {
            StackName: "UnfancyMoneyTracker-dev",
            StackStatus: "UPDATE_COMPLETE",
            Outputs: [
              { OutputKey: "ApiUrl", OutputValue: "https://other.example.com" },
              { OutputKey: "CognitoRegion", OutputValue: "us-east-1" },
              {
                OutputKey: "CognitoUserPoolId",
                OutputValue: "us-east-1_gCLS9k4s0",
              },
              {
                OutputKey: "CognitoClientId",
                OutputValue: "63kh2vrfpvd7h9moob0m9l2umf",
              },
            ],
          },
        ],
      }),
    ).toThrow("AWS development voice settings did not match the expected target.");
    expect(() =>
      parseAwsDevVoiceSettings({
        Stacks: [
          {
            StackName: "UnfancyMoneyTracker-dev",
            StackStatus: "UPDATE_IN_PROGRESS",
            Outputs: [],
          },
        ],
      }),
    ).toThrow("AWS development stack is not ready.");
  });
});
