import { beforeEach, describe, expect, it } from "vitest";

import { redirectSystemPath } from "../../../app/+native-intent";
import { clearInvitationToken, peekInvitationToken, resetInvitationHandoffForTesting } from "./invitationHandoff";

const token = "A".repeat(43);

describe("native invitation link handoff", () => {
  beforeEach(() => resetInvitationHandoffForTesting());

  it("captures a cold-start fragment in memory and strips it from the route", () => {
    expect(redirectSystemPath({ path: `unfancy-money-tracker://join#token=${token}`, initial: true })).toBe("/join");
    expect(peekInvitationToken()).toBe(token);
  });

  it("captures warm universal links and retains the token through route replacement", () => {
    expect(redirectSystemPath({ path: `https://tracker.example/join#token=${token}`, initial: false })).toBe("/join");
    expect(peekInvitationToken()).toBe(token);
    clearInvitationToken(token);
    expect(peekInvitationToken()).toBeNull();
  });

  it("does not capture a token supplied in the query string", () => {
    expect(redirectSystemPath({ path: `unfancy-money-tracker://join?token=${token}`, initial: true })).toBe("/join");
    expect(peekInvitationToken()).toBeNull();
  });
});
