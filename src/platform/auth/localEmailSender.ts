import { z } from "zod";
import { isLoopbackUrl, isWebRuntime, resolveLocalApiUrl } from "../runtime/localApiUrl";

export const localAuthEmailSchema = z.object({
  to: z.string().email(),
  code: z.string().regex(/^\d{6}$/),
  kind: z.enum(["confirmation", "password_reset"])
});

export type LocalAuthEmail = z.infer<typeof localAuthEmailSchema>;

export interface LocalAuthEmailSender {
  send(email: LocalAuthEmail): Promise<void>;
}

class NoopLocalAuthEmailSender implements LocalAuthEmailSender {
  async send(_email: LocalAuthEmail): Promise<void> {
    return undefined;
  }
}

class HttpLocalAuthEmailSender implements LocalAuthEmailSender {
  private readonly fetcher: typeof fetch;

  constructor(private readonly endpoint: string, fetcher: typeof fetch = fetch, private readonly useSimpleLocalRequest = false) {
    this.fetcher = fetcher.bind(globalThis);
  }

  async send(email: LocalAuthEmail): Promise<void> {
    const response = await this.fetcher(this.endpoint, {
      method: "POST",
      headers: { "content-type": this.useSimpleLocalRequest ? "text/plain;charset=UTF-8" : "application/json" },
      body: JSON.stringify(email)
    });
    if (!response.ok) throw new Error("Local email service unavailable");
  }
}

export function createLocalAuthEmailSender(fetcher: typeof fetch = fetch, configuredEndpoint = process.env.EXPO_PUBLIC_LOCAL_AUTH_EMAIL_URL ?? (process.env.EXPO_PUBLIC_API_URL ? `${process.env.EXPO_PUBLIC_API_URL}/auth/email` : ""), useSimpleLocalRequest = process.env.EXPO_PUBLIC_ENV === "local" && isWebRuntime() && isLoopbackUrl(configuredEndpoint)): LocalAuthEmailSender {
  const endpoint = resolveLocalApiUrl(configuredEndpoint);
  return endpoint ? new HttpLocalAuthEmailSender(endpoint, fetcher, useSimpleLocalRequest) : new NoopLocalAuthEmailSender();
}
