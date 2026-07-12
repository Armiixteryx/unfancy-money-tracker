import { describe, expect, it, vi } from "vitest";
import type { APIGatewayProxyEventV2 } from "aws-lambda";

import { handler } from "./localAuthEmail";

function event(body: unknown): APIGatewayProxyEventV2 {
  return { rawPath: "/auth/email", body: JSON.stringify(body), requestContext: { http: { method: "POST" } } } as APIGatewayProxyEventV2;
}

describe("local MailHog auth handler", () => {
  it("rejects malformed auth email requests without opening SMTP", async () => {
    vi.stubEnv("APP_ENV", "local");
    const response = await handler(event({ to: "not-an-email", code: "123", kind: "confirmation" }));
    expect(response).toMatchObject({ statusCode: 400 });
    vi.unstubAllEnvs();
  });

  it("is unavailable outside the local environment", async () => {
    vi.stubEnv("APP_ENV", "cloud");
    const response = await handler(event({ to: "synthetic@example.test", code: "000000", kind: "confirmation" }));
    expect(response).toMatchObject({ statusCode: 404 });
    vi.unstubAllEnvs();
  });
});
