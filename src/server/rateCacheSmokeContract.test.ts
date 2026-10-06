import { describe, expect, it } from "vitest";
import {
  awsCliServiceErrorCode,
  findRateCacheFunctionName,
  isUnsignedInvokeHttpDenied,
  isUnsignedInvokeDenied,
  parseAwsDevRateCacheSettings,
  parseAwsProdRateCacheSettings,
} from "../../scripts/rate-cache-smoke-contract";

describe("AWS dev rate-cache smoke contract", () => {
  it("accepts only a ready dev stack with its expected API host", () => {
    expect(
      parseAwsDevRateCacheSettings({
        Stacks: [
          {
            StackName: "UnfancyMoneyTracker-dev",
            StackStatus: "UPDATE_COMPLETE",
            Outputs: [
              {
                OutputKey: "ApiUrl",
                OutputValue:
                  "https://abc123.execute-api.us-east-1.amazonaws.com/",
              },
            ],
          },
        ],
      }).apiUrl,
    ).toBe("https://abc123.execute-api.us-east-1.amazonaws.com/");
    expect(() =>
      parseAwsDevRateCacheSettings({
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

  it("resolves exactly one private cache function from the dev service stack", () => {
    expect(
      findRateCacheFunctionName({
        StackResourceSummaries: [
          {
            LogicalResourceId: "RateCacheFunctionA1B2C3",
            PhysicalResourceId: "UnfancyMoneyTracker-dev-RateCacheFunctionEE42AFD6-123",
            ResourceType: "AWS::Lambda::Function",
          },
          {
            LogicalResourceId: "RateCacheFunctionLogGroupD4E5F6",
            PhysicalResourceId: "log-group",
            ResourceType: "AWS::Logs::LogGroup",
          },
        ],
      }),
    ).toBe("UnfancyMoneyTracker-dev-RateCacheFunctionEE42AFD6-123");
    expect(() =>
      findRateCacheFunctionName({ StackResourceSummaries: [] }),
    ).toThrow("AWS development rate-cache function is unavailable.");
  });

  it("resolves production CloudFormation function names and rejects dev functions", () => {
    const resources = { StackResourceSummaries: [{
      LogicalResourceId: "RateCacheFunctionEE42AFD6",
      PhysicalResourceId: "UnfancyMoneyTracker-prod-RateCacheFunctionEE42AFD6-SYNTHETIC",
      ResourceType: "AWS::Lambda::Function",
    }] };
    expect(findRateCacheFunctionName(resources, "prod")).toBe("UnfancyMoneyTracker-prod-RateCacheFunctionEE42AFD6-SYNTHETIC");
    expect(() => findRateCacheFunctionName(resources, "dev")).toThrow("AWS development rate-cache function is unavailable.");
  });

  it("rejects a dev stack as a production target", () => {
    expect(() =>
      parseAwsProdRateCacheSettings({
        Stacks: [
          {
            StackName: "UnfancyMoneyTracker-dev",
            StackStatus: "UPDATE_COMPLETE",
            Outputs: [
              {
                OutputKey: "ApiUrl",
                OutputValue:
                  "https://abc123.execute-api.us-east-1.amazonaws.com/",
              },
            ],
          },
        ],
      }),
    ).toThrow("AWS production stack is not ready.");
  });

  it("accepts a ready production stack with the expected HTTPS API shape", () => {
    expect(
      parseAwsProdRateCacheSettings({
        Stacks: [
          {
            StackName: "UnfancyMoneyTracker-prod",
            StackStatus: "CREATE_COMPLETE",
            Outputs: [
              {
                OutputKey: "ApiUrl",
                OutputValue:
                  "https://abc123.execute-api.us-east-1.amazonaws.com/",
              },
            ],
          },
        ],
      }).apiUrl,
    ).toBe("https://abc123.execute-api.us-east-1.amazonaws.com/");
  });

  it("counts only the Lambda AccessDeniedException as unsigned denial", () => {
    expect(
      isUnsignedInvokeDenied({
        stderr: Buffer.from(
          "An error occurred (AccessDeniedException) when calling Invoke",
        ),
      }),
    ).toBe(true);
    expect(
      isUnsignedInvokeDenied({
        stderr: Buffer.from(
          "An error occurred (ResourceNotFoundException) when calling Invoke",
        ),
      }),
    ).toBe(false);
    expect(isUnsignedInvokeDenied(new Error("network unavailable"))).toBe(false);
    expect(
      awsCliServiceErrorCode({
        stderr: Buffer.from(
          "An error occurred (MissingAuthenticationTokenException) when calling Invoke",
        ),
      }),
    ).toBe("MissingAuthenticationTokenException");
    expect(
      awsCliServiceErrorCode({
        stderr: Buffer.from(
          "An error occurred (InternalFailure) when calling Invoke",
        ),
      }),
    ).toBeUndefined();
    expect(
      isUnsignedInvokeHttpDenied(
        403,
        "com.amazonaws.lambda#MissingAuthenticationTokenException:message",
      ),
    ).toBe(true);
    expect(isUnsignedInvokeHttpDenied(403, "InternalFailure:internal")).toBe(
      false,
    );
    expect(
      isUnsignedInvokeHttpDenied(500, "MissingAuthenticationTokenException"),
    ).toBe(false);
  });
});
