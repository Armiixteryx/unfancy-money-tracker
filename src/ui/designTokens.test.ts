import { describe, expect, it } from "vitest";
import { isWebRail, isWebWorkspace } from "./designTokens";

describe("responsive product layouts", () => {
  it("switches web navigation and forms independently at their thresholds", () => {
    expect(isWebRail("web", 1023)).toBe(false);
    expect(isWebRail("web", 1024)).toBe(true);
    expect(isWebWorkspace("web", 1199)).toBe(false);
    expect(isWebWorkspace("web", 1200)).toBe(true);
  });
  it.each(["ios", "android"])("retains native navigation and full-screen forms on wide %s tablets", (platform) => {
    expect(isWebRail(platform, 1440)).toBe(false);
    expect(isWebWorkspace(platform, 1440)).toBe(false);
  });
});
