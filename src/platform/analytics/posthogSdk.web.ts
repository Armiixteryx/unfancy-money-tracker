import posthog from "posthog-js";

import type { AnalyticsEvent, AnalyticsProperties } from "./types";
import type { PostHogSdk, PostHogSdkConfig } from "./posthogSdk";

const MASKED_SELECTOR = "[data-sensitive], [data-financial-content], [data-financial-value], [data-transaction-row], [data-chart-value]";

export function createPostHogSdk(config: PostHogSdkConfig): PostHogSdk | null {
  if (!config.apiKey || typeof window === "undefined") return null;
  return {
    async initialize() {
      await new Promise<void>((resolve) => {
        posthog.init(config.apiKey ?? "", {
          api_host: config.host,
          autocapture: true,
          capture_pageview: false,
          capture_pageleave: false,
          opt_out_capturing_by_default: true,
          mask_all_text: true,
          mask_all_element_attributes: true,
          disable_session_recording: true,
          session_recording: { maskAllInputs: true, maskTextSelector: MASKED_SELECTOR, blockSelector: MASKED_SELECTOR },
          loaded: () => resolve()
        } as never);
      });
    },
    async optIn() {
      posthog.opt_in_capturing();
      posthog.startSessionRecording({ sampling: true });
    },
    async optOut() {
      posthog.stopSessionRecording();
      posthog.opt_out_capturing();
    },
    async flush() {
      const flushable = posthog as unknown as { flush?: () => void | Promise<void> };
      await flushable.flush?.();
    },
    async capture(event: AnalyticsEvent, properties: AnalyticsProperties) {
      posthog.capture(event, properties);
    }
  };
}
