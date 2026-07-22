import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from "aws-lambda";
import { z } from "zod";

import { isCurrencyCode } from "../../domain/currency";
import { FrankfurterExchangeRateAdapter } from "../../platform/exchange-rates/frankfurterExchangeRateAdapter";
import { MemoryRateCache } from "../../platform/exchange-rates/memoryRateCache";
import { ExchangeRateError } from "../../platform/exchange-rates/types";

const requestSchema = z.object({
  base: z.string().length(3),
  quote: z.string().length(3),
  date: z.string().date().optional()
});

const provider = new FrankfurterExchangeRateAdapter(new MemoryRateCache());

export async function handler(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
  if (process.env.APP_ENV !== "local" && process.env.AWS_SAM_LOCAL !== "true" && !getSubject(event)) return json(401, { error: "unauthenticated" });
  try {
    const request = requestSchema.parse(event.queryStringParameters ?? {});
    if (!isCurrencyCode(request.base) || !isCurrencyCode(request.quote)) return json(400, { error: "unsupported_currency" });
    const record = request.date
      ? await provider.getHistoricalRate(request.base, request.quote, request.date)
      : await provider.getLatestRate(request.base, request.quote);
    return json(200, record);
  } catch (error) {
    if (error instanceof z.ZodError) return json(400, { error: "invalid_request" });
    if (error instanceof ExchangeRateError) return json(error.code === "unsupported_currency" ? 400 : error.code === "no_rate_available" ? 404 : 503, { error: error.code });
    return json(503, { error: "unavailable" });
  }
}

function getSubject(event: APIGatewayProxyEventV2): string | null {
  const requestContext = event.requestContext as APIGatewayProxyEventV2["requestContext"] & { authorizer?: { jwt?: { claims?: Record<string, unknown> } } };
  const subject = requestContext.authorizer?.jwt?.claims?.sub;
  if (typeof subject === "string" && subject.length > 0) return subject;
  if (process.env.APP_ENV === "local" || process.env.AWS_SAM_LOCAL === "true") return event.headers?.["x-local-subject"] ?? event.headers?.["X-Local-Subject"] ?? "local-synthetic-user";
  return null;
}

function json(statusCode: number, body: unknown): APIGatewayProxyResultV2 {
  return {
    statusCode,
    headers: {
      "access-control-allow-origin": "*",
      "content-type": "application/json"
    },
    body: JSON.stringify(body)
  };
}
