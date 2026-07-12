import type { PropsWithChildren } from "react";

export function PostHogProviderWrapper({ children }: PropsWithChildren<{ client?: unknown }>) {
  return children;
}
