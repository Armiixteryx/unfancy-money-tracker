import type { AuthClient } from "../../platform/auth/types";
import type { Dataset } from "../../domain/types";
import type { MutationResult } from "../sync/store/useDatasetStore";

/**
 * Resets only the current device's local-preview session and account cache.
 * It deliberately has no sync or backend dependency.
 */
export async function resetLocalMockSeedSession(
  authClient: Pick<AuthClient, "signOut">,
  switchToAnonymousNamespace: (clearAccountCache: boolean) => Promise<MutationResult<Dataset>>
): Promise<MutationResult<Dataset>> {
  await authClient.signOut();
  return switchToAnonymousNamespace(true);
}
