import type { AuthClient, AuthSession, AuthState } from "../../../platform/auth/types";
import type { Dataset } from "../../../domain/types";
import type { MutationResult } from "../store/useDatasetStore";

type RestoredSession = {
  state: AuthState;
  session: AuthSession | null;
  namespaceResult: MutationResult<Dataset> | null;
};

export async function reconcileRestoredSession(
  authClient: Pick<AuthClient, "getSession">,
  switchToAccountNamespace: (accountId: string) => Promise<MutationResult<Dataset>>
): Promise<RestoredSession> {
  const restored = await authClient.getSession();
  const isAuthenticated = restored.state === "signed_in" || restored.state === "offline_session";
  if (!isAuthenticated || !restored.session) return { ...restored, namespaceResult: null };

  const namespaceResult = await switchToAccountNamespace(restored.session.accountId);
  return { ...restored, namespaceResult };
}
