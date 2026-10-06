// Synthetic-only AWS authorization check. Suppresses rate records and AWS error details.
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { rateRecordSchema } from "../src/platform/exchange-rates/types";
import {
  awsCliServiceErrorCode,
  findRateCacheFunctionName,
  isUnsignedInvokeHttpDenied,
  parseAwsRateCacheSettings,
  unsignedInvokeErrorCode,
} from "./rate-cache-smoke-contract";

const region = "us-east-1";
const cacheKey = "latest:USD:COP";
let stage = "configuration";
let deploymentStage: "dev" | "prod" = "dev";
let unsignedErrorCode: string | undefined;
let unsignedHttpStatus: number | undefined;
let publicRateHttpStatus: number | undefined;
let safeAwsErrorCode: string | undefined;

function runAwsJson(args: string[]): unknown {
  const output = execFileSync(
    "aws",
    ["--region", region, ...args, "--output", "json"],
    { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout: 30000 },
  );
  return JSON.parse(output) as unknown;
}

type LambdaInvokeMetadata = { statusCode?: number; functionError?: string };

function invokeCache(
  functionName: string,
  requestPath: string,
  responsePath: string,
): LambdaInvokeMetadata {
  const args = [
    "--region",
    region,
    "lambda",
    "invoke",
    "--function-name",
    functionName,
    "--invocation-type",
    "RequestResponse",
    "--payload",
    `fileb://${requestPath}`,
    "--cli-binary-format",
    "raw-in-base64-out",
    "--query",
    "{statusCode:StatusCode,functionError:FunctionError}",
    "--output",
    "json",
    responsePath,
  ];
  const output = execFileSync("aws", args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    timeout: 30000,
  });
  return JSON.parse(output) as LambdaInvokeMetadata;
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function main() {
  const cliArguments = process.argv.slice(2).filter((argument) => argument !== "--");
  assert(
    cliArguments.length === 1 &&
      (cliArguments[0] === "--aws-dev" || cliArguments[0] === "--aws-prod"),
    "Run this check explicitly with --aws-dev or --aws-prod.",
  );
  deploymentStage = cliArguments[0] === "--aws-prod" ? "prod" : "dev";
  const stackName = `UnfancyMoneyTracker-${deploymentStage}`;
  stage = `${deploymentStage} stack lookup`;
  const stack = runAwsJson([
    "cloudformation",
    "describe-stacks",
    "--stack-name",
    stackName,
  ]);
  const { apiUrl } = parseAwsRateCacheSettings(stack, deploymentStage);
  stage = "private function lookup";
  const resources = runAwsJson([
    "cloudformation",
    "list-stack-resources",
    "--stack-name",
    stackName,
  ]);
  const functionName = findRateCacheFunctionName(resources, deploymentStage);

  stage = "public rate request";
  const rateResponse = await fetch(`${apiUrl}rates?base=USD&quote=COP`, {
    signal: AbortSignal.timeout(20000),
  });
  if (!rateResponse.ok) {
    publicRateHttpStatus = rateResponse.status;
    throw new Error("Public rates request failed.");
  }
  stage = "public rate response validation";
  const rate = rateRecordSchema.safeParse(await rateResponse.json());
  assert(
    rate.success && rate.data.base === "USD" && rate.data.quote === "COP",
    "Public rates response did not match the expected currency pair.",
  );

  const directory = mkdtempSync(join(tmpdir(), "unfancy-rate-cache-smoke-"));
  try {
    const requestPath = join(directory, "request.json");
    const responsePath = join(directory, "response.json");
    writeFileSync(
      requestPath,
      JSON.stringify({ operation: "get", key: cacheKey }),
      { mode: 0o600 },
    );
    writeFileSync(responsePath, "", { mode: 0o600 });

    stage = "IAM-signed cache invocation";
    const signed = invokeCache(functionName, requestPath, responsePath);
    assert(
      signed.statusCode === 200 && !signed.functionError,
      "IAM-signed rate-cache invocation failed.",
    );
    stage = "IAM-signed cache record validation";
    const cached = rateRecordSchema.safeParse(
      JSON.parse(readFileSync(responsePath, "utf8")) as unknown,
    );
    assert(
      cached.success && cached.data.base === "USD" && cached.data.quote === "COP",
      "IAM-signed rate-cache read did not find the expected record.",
    );

    stage = "unsigned cache invoke";
    const unsignedResponse = await fetch(
      `https://lambda.${region}.amazonaws.com/2015-03-31/functions/${encodeURIComponent(functionName)}/invocations`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-amz-invocation-type": "RequestResponse",
        },
        body: JSON.stringify({ operation: "get", key: cacheKey }),
        signal: AbortSignal.timeout(30000),
      },
    );
    const errorType = unsignedResponse.headers.get("x-amzn-errortype");
    unsignedHttpStatus = unsignedResponse.status;
    unsignedErrorCode = unsignedInvokeErrorCode(errorType) ?? "unrecognized_service_error";
    await unsignedResponse.body?.cancel();
    if (!isUnsignedInvokeHttpDenied(unsignedResponse.status, errorType)) {
      throw new Error("Unsigned rate-cache invocation did not return an authenticated 403.");
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }

  process.stdout.write(
    `public rate: HTTP 200; IAM-signed cache read: present; unsigned Invoke: HTTP 403 (${unsignedErrorCode})\n`,
  );
}

main().catch((error: unknown) => {
  safeAwsErrorCode ??= awsCliServiceErrorCode(error);
  const details = [
    publicRateHttpStatus ? `HTTP ${publicRateHttpStatus}` : undefined,
    unsignedHttpStatus ? `unsigned HTTP ${unsignedHttpStatus}` : undefined,
    unsignedErrorCode,
    safeAwsErrorCode,
  ].filter(Boolean);
  const diagnostic = details.length ? ` (${details.join(", ")})` : "";
  process.stderr.write(
    `AWS ${deploymentStage} rate-cache authorization smoke failed at ${stage}${diagnostic}.\n`,
  );
  process.exitCode = 1;
});
