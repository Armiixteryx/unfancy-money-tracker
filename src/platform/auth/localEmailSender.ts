import { z } from "zod";

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
  constructor(private readonly endpoint: string, private readonly fetcher: typeof fetch = fetch) {}

  async send(email: LocalAuthEmail): Promise<void> {
    const response = await this.fetcher(this.endpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(email)
    });
    if (!response.ok) throw new Error("Local email service unavailable");
  }
}

export function createLocalAuthEmailSender(fetcher: typeof fetch = fetch, configuredEndpoint = process.env.EXPO_PUBLIC_LOCAL_AUTH_EMAIL_URL ?? (process.env.EXPO_PUBLIC_API_URL ? `${process.env.EXPO_PUBLIC_API_URL}/auth/email` : "")): LocalAuthEmailSender {
  const endpoint = configuredEndpoint;
  return endpoint ? new HttpLocalAuthEmailSender(endpoint, fetcher) : new NoopLocalAuthEmailSender();
}
