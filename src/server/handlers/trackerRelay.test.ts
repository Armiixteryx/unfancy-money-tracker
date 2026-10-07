import { describe, expect, it } from "vitest";
import { inviteTrackerRequestSchema, trackerScopeSchema } from "../contracts/trackers";
import { projectTrackerScope } from "./trackerRelay";

describe("tracker relay request projection", () => {
  it("sends only the active membership generation when pre-authorizing an invitation", () => {
    const request = inviteTrackerRequestSchema.parse({
      datasetId: "018f0000-0000-7000-8000-000000000001",
      membershipId: "018f0000-0000-7000-8000-000000000002",
      email: "friend@example.test",
      role: "member",
    });
    const scope = projectTrackerScope(request);
    expect(scope).toEqual({ datasetId: request.datasetId, membershipId: request.membershipId });
    expect(trackerScopeSchema.parse(scope)).toEqual(scope);
  });
});
