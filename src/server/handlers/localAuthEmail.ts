import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from "aws-lambda";
import { createConnection, type Socket } from "node:net";

import { localAuthEmailSchema, type LocalAuthEmail } from "../../platform/auth/localEmailSender";

export async function handler(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
  if (process.env.APP_ENV !== "local" && process.env.AWS_SAM_LOCAL !== "true") return json(404, { error: "not_found" });
  if (event.requestContext.http.method !== "POST" || !event.rawPath.endsWith("/auth/email")) return json(404, { error: "not_found" });

  try {
    const email = localAuthEmailSchema.parse(parseBody(event.body));
    await sendMailHogEmail(email);
    return { statusCode: 204 };
  } catch (error) {
    if (error instanceof SyntaxError || (error instanceof Error && error.name === "ZodError")) return json(400, { error: "invalid_request" });
    return json(503, { error: "email_unavailable" });
  }
}

function parseBody(body: string | undefined): unknown {
  return body ? JSON.parse(body) : {};
}

async function sendMailHogEmail(email: LocalAuthEmail): Promise<void> {
  const host = process.env.MAILHOG_HOST ?? "127.0.0.1";
  const port = Number.parseInt(process.env.MAILHOG_SMTP_PORT ?? "1025", 10);
  const subject = email.kind === "confirmation" ? "Confirm your Unfancy Money Tracker email" : "Reset your Unfancy Money Tracker password";
  const body = email.kind === "confirmation"
    ? `Your synthetic local confirmation code is ${email.code}.`
    : `Your synthetic local password reset code is ${email.code}.`;
  const message = [
    `From: Unfancy Money Tracker <unfancy-local@localhost>`,
    `To: ${email.to}`,
    `Subject: ${subject}`,
    "Content-Type: text/plain; charset=utf-8",
    "",
    body
  ].join("\r\n");

  const socket = createConnection({ host, port });
  try {
    await command(socket, undefined, 220);
    await command(socket, `EHLO localhost`, 250);
    await command(socket, `MAIL FROM:<unfancy-local@localhost>`, 250);
    await command(socket, `RCPT TO:<${email.to}>`, 250);
    await command(socket, "DATA", 354);
    await command(socket, `${message.replace(/^\./gm, "..")}.`, 250);
    await command(socket, "QUIT", 221);
  } finally {
    socket.destroy();
  }
}

function command(socket: Socket, value: string | undefined, expectedCode: number): Promise<void> {
  return new Promise((resolve, reject) => {
    let buffer = "";
    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error("MailHog SMTP timeout"));
    }, 5000);
    const onData = (chunk: Buffer) => {
      buffer += chunk.toString("utf8");
      const lines = buffer.split("\r\n");
      buffer = lines.pop() ?? "";
      const line = lines.find((candidate) => candidate.startsWith(`${expectedCode} `) || candidate === `${expectedCode}`);
      if (!line) return;
      cleanup();
      if (value !== undefined) socket.write(`${value}\r\n`);
      resolve();
    };
    const onError = (error: Error) => { cleanup(); reject(error); };
    const cleanup = () => {
      clearTimeout(timeout);
      socket.off("data", onData);
      socket.off("error", onError);
    };
    socket.on("data", onData);
    socket.on("error", onError);
  });
}

function json(statusCode: number, body: unknown): APIGatewayProxyResultV2 {
  return { statusCode, headers: { "content-type": "application/json" }, body: JSON.stringify(body) };
}
