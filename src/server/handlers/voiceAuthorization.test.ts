import { generateKeyPairSync, sign } from "node:crypto";
import { CognitoJwtVerifier } from "aws-jwt-verify";
import type { APIGatewayProxyEventV2 } from "aws-lambda";
import { describe, expect, it, vi } from "vitest";
import { createVoiceAuthorizer, createVoiceHandler } from "./voiceExpense";
const pool = "us-east-1_synthetic";
const client = "synthetic-client";
const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const verifier = CognitoJwtVerifier.create({ userPoolId: pool, clientId: client, tokenUse: "access", scope: "aws.cognito.signin.user.admin" });
verifier.cacheJwks({ keys: [{ ...publicKey.export({ format: "jwk" }), kty: "RSA", kid: "synthetic-key", alg: "RS256", use: "sig" }] });
function token(overrides: Record<string, unknown> = {}) {
  const header = Buffer.from(JSON.stringify({ alg: "RS256", kid: "synthetic-key" })).toString("base64url");
  const body = Buffer.from(JSON.stringify({ iss: `https://cognito-idp.us-east-1.amazonaws.com/${pool}`, client_id: client, token_use: "access", exp: Math.floor(Date.now()/1000)+900, scope: "aws.cognito.signin.user.admin", sub: "synthetic", ...overrides })).toString("base64url");
  const input = `${header}.${body}`;
  return `${input}.${sign("RSA-SHA256", Buffer.from(input), privateKey).toString("base64url")}`;
}
const event = (bearer: string) => ({ headers: { authorization: `Bearer ${bearer}` }, body: "not-json" }) as unknown as APIGatewayProxyEventV2;
describe("signed voice access-token authorization", () => {
  it("accepts valid direct-sign-in access tokens", async () => {
    await expect(createVoiceAuthorizer(verifier)(event(token()))).resolves.toBeUndefined();
  });
  it.each([
    { exp: Math.floor(Date.now()/1000)-60 },
    { token_use: "id", aud: client },
    { client_id: "wrong-client" },
    { iss: "https://cognito-idp.us-east-1.amazonaws.com/us-east-1_other" },
    { scope: "openid" },
  ])("rejects invalid claims before parsing audio or calling providers", async claims => {
    const transcribe = vi.fn(); const classify = vi.fn();
    const handler = createVoiceHandler({ authorize: createVoiceAuthorizer(verifier), transcribe, classify });
    expect(await handler(event(token(claims)))).toMatchObject({ statusCode: 401 });
    expect(transcribe).not.toHaveBeenCalled(); expect(classify).not.toHaveBeenCalled();
  });
  it("rejects a tampered signature", async () => {
    await expect(createVoiceAuthorizer(verifier)(event(token().slice(0,-10)+"tamperedxx"))).rejects.toThrow();
  });
});
