import { describe, expect, it, vi } from "vitest";
import { runVoiceEnvironment } from "../../scripts/voice-environment";

const account = "123456789012";
const region = "us-east-1";
const credentials = {
  AI_GATEWAY_API_KEY: "synthetic-ai-key",
  CLOUDFLARE_ACCOUNT_ID: "a".repeat(32),
  CLOUDFLARE_AUTH_TOKEN: "synthetic-cloudflare-token",
};
const envContents = Object.entries(credentials)
  .map(([key, value]) => `${key}=${value}`)
  .join("\n");
const secretArn = `arn:aws:secretsmanager:${region}:${account}:secret:UnfancyMoneyTracker-dev/voice-AbCdEf`;

function dependencies(options: {
  localEnv?: string;
  secretArn?: string;
  secretString?: string;
  account?: string;
} = {}) {
  const log = vi.fn<(message: string) => void>();
  const getSecret = vi.fn(async () => ({
    ARN: options.secretArn ?? secretArn,
    SecretString: options.secretString ?? JSON.stringify(credentials),
  }));
  const putSecret = vi.fn(async () => undefined);
  return {
    log,
    getSecret,
    putSecret,
    value: {
      environment: {
        NODE_ENV: "test",
        CDK_DEFAULT_ACCOUNT: options.account ?? account,
        CDK_DEFAULT_REGION: region,
      },
      readFile: (path: string) =>
        path === ".env.local" ? options.localEnv : undefined,
      writeFile: vi.fn(),
      chmodFile: vi.fn(),
      getSecret,
      putSecret,
      log,
    },
  };
}

describe("development voice credential reuse", () => {
  it("allows deployment preflight to validate the existing secret when local keys are absent", async () => {
    const setup = dependencies();

    await runVoiceEnvironment(
      ["check", "--allow-existing-dev-secret"],
      setup.value,
    );

    expect(setup.getSecret).toHaveBeenCalledWith(
      "UnfancyMoneyTracker-dev/voice",
      region,
    );
    expect(setup.putSecret).not.toHaveBeenCalled();
    expect(setup.log).toHaveBeenCalledWith(
      "Existing development voice credentials are ready.",
    );
    expect(JSON.stringify(setup.log.mock.calls)).not.toContain(
      credentials.AI_GATEWAY_API_KEY,
    );
    expect(JSON.stringify(setup.log.mock.calls)).not.toContain(
      credentials.CLOUDFLARE_AUTH_TOKEN,
    );
  });

  it("reuses the existing secret after deployment without writing a new version", async () => {
    const setup = dependencies();

    await runVoiceEnvironment(["dev", "--reuse-existing"], setup.value);

    expect(setup.getSecret).toHaveBeenCalledOnce();
    expect(setup.putSecret).not.toHaveBeenCalled();
  });

  it("rejects partially configured local keys instead of silently falling back", async () => {
    const setup = dependencies({ localEnv: "AI_GATEWAY_API_KEY=partial" });

    await expect(
      runVoiceEnvironment(["dev", "--reuse-existing"], setup.value),
    ).rejects.toThrow();

    expect(setup.getSecret).not.toHaveBeenCalled();
    expect(setup.putSecret).not.toHaveBeenCalled();
  });

  it("refuses a secret from a different AWS account", async () => {
    const setup = dependencies({
      secretArn: secretArn.replace(account, "999999999999"),
    });

    await expect(
      runVoiceEnvironment(
        ["check", "--allow-existing-dev-secret"],
        setup.value,
      ),
    ).rejects.toThrow();
    expect(setup.putSecret).not.toHaveBeenCalled();
  });

  it("keeps the existing local-key refresh behavior when valid keys are present", async () => {
    const setup = dependencies({ localEnv: envContents });

    await runVoiceEnvironment(["dev", "--reuse-existing"], setup.value);

    expect(setup.putSecret).toHaveBeenCalledWith(
      "UnfancyMoneyTracker-dev/voice",
      region,
      credentials,
    );
    expect(setup.getSecret).not.toHaveBeenCalled();
  });
});
