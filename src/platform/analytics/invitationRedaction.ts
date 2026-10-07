/** Strip invitation credentials from automatic URL and replay metadata too. */
export function invitationSafeUrl(value: string): string {
  try {
    const url = new URL(value);
    url.hash = "";
    url.searchParams.delete("token");
    return url.toString();
  } catch {
    return value.split(/[?#]/, 1)[0] ?? "";
  }
}

export function redactInvitationTelemetry<T>(value: T): T {
  const seen = new WeakSet<object>();
  const redact = (item: unknown, depth: number): unknown => {
    if (depth > 40) return null;
    if (typeof item === "string") {
      if (/^(?:https?:\/\/|unfancy-money-tracker:|\/join(?:[?#]|$))/i.test(item)) return invitationSafeUrl(item);
      return item;
    }
    if (!item || typeof item !== "object") return item;
    if (item instanceof Date) return item;
    if (seen.has(item)) return null;
    seen.add(item);
    if (Array.isArray(item)) return item.map(entry => redact(entry, depth + 1));
    return Object.fromEntries(Object.entries(item).flatMap(([key, entry]) =>
      /^(?:token|invitationToken|invitation_token)$/i.test(key) ? [] : [[key, redact(entry, depth + 1)]],
    ));
  };
  return redact(value, 0) as T;
}
