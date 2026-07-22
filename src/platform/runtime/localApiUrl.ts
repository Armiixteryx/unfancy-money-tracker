const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

export function isLoopbackUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" && LOOPBACK_HOSTS.has(url.hostname);
  } catch {
    return false;
  }
}

export function isWebRuntime(): boolean {
  return typeof globalThis.document !== "undefined";
}

export function resolveLocalApiUrl(configuredUrl: string, pageUrl: string | undefined = currentPageUrl()): string {
  if (!pageUrl) return configuredUrl;
  try {
    const endpoint = new URL(configuredUrl);
    const page = new URL(pageUrl);
    if (!LOOPBACK_HOSTS.has(endpoint.hostname) || !LOOPBACK_HOSTS.has(page.hostname)) return configuredUrl;
    endpoint.hostname = page.hostname;
    return endpoint.toString().replace(/\/$/, "");
  } catch {
    return configuredUrl;
  }
}

function currentPageUrl(): string | undefined {
  return typeof globalThis.location?.href === "string" ? globalThis.location.href : undefined;
}
