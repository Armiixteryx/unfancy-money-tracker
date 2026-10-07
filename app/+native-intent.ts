import { normalizeDeveloperSeedPath } from "../src/features/development/normalizeDeveloperSeedPath";
import { holdInvitationToken, invitationTokenFromLink } from "../src/features/trackers/invitationHandoff";

export function redirectSystemPath({ path }: { path: string; initial: boolean }): string {
  const invitationToken = invitationTokenFromLink(path);
  if (invitationToken) {
    holdInvitationToken(invitationToken);
    return "/join";
  }
  return normalizeDeveloperSeedPath(path);
}
