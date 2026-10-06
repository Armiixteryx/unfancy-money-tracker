import { z } from "zod";

const awsStackSchema = z.object({
  Stacks: z.array(
    z.object({
      StackName: z.string(),
      StackStatus: z.string(),
      Outputs: z.array(
        z.object({ OutputKey: z.string(), OutputValue: z.string() }),
      ),
    }),
  ),
});

const stackResourcesSchema = z.object({
  StackResourceSummaries: z.array(
    z.object({
      LogicalResourceId: z.string(),
      PhysicalResourceId: z.string().optional(),
      ResourceType: z.string(),
    }),
  ),
});

export type RateCacheSmokeStage = "dev" | "prod";

export function parseAwsRateCacheSettings(
  value: unknown,
  stage: RateCacheSmokeStage,
) {
  const parsed = awsStackSchema.parse(value);
  const stack = parsed.Stacks[0];
  const label = stage === "dev" ? "development" : "production";
  const stackName = `UnfancyMoneyTracker-${stage}`;
  if (
    !stack ||
    stack.StackName !== stackName ||
    !["CREATE_COMPLETE", "UPDATE_COMPLETE"].includes(stack.StackStatus)
  )
    throw new Error(`AWS ${label} stack is not ready.`);
  const apiUrl = stack.Outputs.find(
    (output) => output.OutputKey === "ApiUrl",
  )?.OutputValue;
  const parsedApiUrl = apiUrl ? new URL(apiUrl) : undefined;
  if (
    !parsedApiUrl ||
    parsedApiUrl.protocol !== "https:" ||
    !/^[a-z0-9]+\.execute-api\.us-east-1\.amazonaws\.com$/.test(parsedApiUrl.hostname) ||
    parsedApiUrl.username ||
    parsedApiUrl.password ||
    parsedApiUrl.port ||
    (parsedApiUrl.pathname !== "/" && parsedApiUrl.pathname !== "") ||
    parsedApiUrl.search ||
    parsedApiUrl.hash
  )
    throw new Error(`AWS ${label} API did not match the expected target.`);
  return { apiUrl: parsedApiUrl.toString() };
}

export function parseAwsDevRateCacheSettings(value: unknown) {
  return parseAwsRateCacheSettings(value, "dev");
}

export function parseAwsProdRateCacheSettings(value: unknown) {
  return parseAwsRateCacheSettings(value, "prod");
}

export function findRateCacheFunctionName(
  value: unknown,
  stage: RateCacheSmokeStage = "dev",
): string {
  const parsed = stackResourcesSchema.parse(value);
  const label = stage === "dev" ? "development" : "production";
  const prefix = `UnfancyMoneyTracker-${stage}-RateCacheFunction`;
  const matches = parsed.StackResourceSummaries.filter(
    (resource) =>
      resource.ResourceType === "AWS::Lambda::Function" &&
      resource.LogicalResourceId.startsWith("RateCacheFunction") &&
      resource.PhysicalResourceId?.startsWith(prefix),
  );
  if (matches.length !== 1 || !matches[0]?.PhysicalResourceId)
    throw new Error(`AWS ${label} rate-cache function is unavailable.`);
  return matches[0].PhysicalResourceId;
}

export function awsCliServiceErrorCode(error: unknown): string | undefined {
  if (typeof error !== "object" || error === null || !("stderr" in error))
    return undefined;
  const stderr = error.stderr;
  if (typeof stderr !== "string" && !Buffer.isBuffer(stderr)) return undefined;
  const code = stderr
    .toString()
    .match(/An error occurred \(([A-Za-z0-9]+)\)/)?.[1];
  const safeCodes = new Set([
    "AccessDeniedException",
    "MissingAuthenticationTokenException",
    "InvalidSignatureException",
    "UnrecognizedClientException",
    "SignatureDoesNotMatch",
    "ExpiredTokenException",
    "InvalidClientTokenId",
    "IncompleteSignature",
    "ForbiddenException",
  ]);
  return code && safeCodes.has(code) ? code : undefined;
}

export function isUnsignedInvokeDenied(error: unknown): boolean {
  return awsCliServiceErrorCode(error) === "AccessDeniedException";
}

export function unsignedInvokeErrorCode(errorType: string | null): string | undefined {
  if (!errorType) return undefined;
  const code = errorType.split("#").at(-1)?.split(":")[0];
  const authCodes = new Set([
    "AccessDeniedException",
    "MissingAuthenticationTokenException",
    "InvalidSignatureException",
    "UnrecognizedClientException",
    "SignatureDoesNotMatch",
    "ExpiredTokenException",
    "InvalidClientTokenId",
    "IncompleteSignature",
  ]);
  return code && authCodes.has(code) ? code : undefined;
}

export function isUnsignedInvokeHttpDenied(
  statusCode: number,
  errorType: string | null,
): boolean {
  return statusCode === 403 && unsignedInvokeErrorCode(errorType) !== undefined;
}
