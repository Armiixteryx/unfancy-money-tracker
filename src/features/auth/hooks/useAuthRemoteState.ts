import { useMutation } from "@tanstack/react-query";

import type { AuthActionResult, AuthClient } from "../../../platform/auth/types";

export function useAuthRemoteState(authClient: AuthClient) {
  const action = useMutation<AuthActionResult, unknown, () => Promise<AuthActionResult>>({
    mutationFn: (run) => run()
  });
  return { action };
}
