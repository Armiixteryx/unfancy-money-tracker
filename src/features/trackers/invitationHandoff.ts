import { invitationTokenSchema } from "../../server/contracts/trackers";

let pendingInvitationToken: string | null = null;

function isJoinPath(url: URL): boolean {
  return url.hostname === "join" || url.pathname.replace(/\/+$/, "") === "/join";
}

export function invitationTokenFromLink(value: string): string | null {
  try {
    const url = new URL(value, "https://unfancy.invalid");
    if (!isJoinPath(url)) return null;
    const fragment = url.hash.replace(/^#/, "");
    const token = new URLSearchParams(fragment).get("token") ?? (/^[A-Za-z0-9_-]{43}$/.test(fragment) ? fragment : null);
    return token && invitationTokenSchema.safeParse(token).success ? token : null;
  } catch {
    return null;
  }
}

export function holdInvitationToken(token: string): void {
  if (invitationTokenSchema.safeParse(token).success) pendingInvitationToken = token;
}

export function peekInvitationToken(): string | null {
  return pendingInvitationToken;
}

export function clearInvitationToken(token: string): void {
  if (pendingInvitationToken === token) pendingInvitationToken = null;
}

export function resetInvitationHandoffForTesting(): void {
  pendingInvitationToken = null;
}
