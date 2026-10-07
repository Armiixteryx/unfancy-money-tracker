import { describe, expect, it } from "vitest";
import { invitationSafeUrl, redactInvitationTelemetry } from "./invitationRedaction";

const token = "a".repeat(43);
describe("invitation telemetry privacy", () => {
  it("redacts browser and native invitation URLs while keeping useful route context", () => {
    expect(invitationSafeUrl(`https://example.invalid/join#token=${token}`)).toBe("https://example.invalid/join");
    expect(invitationSafeUrl(`unfancy-money-tracker://join?token=${token}`)).toBe("unfancy-money-tracker://join");
    expect(invitationSafeUrl(`/join?token=${token}`)).toBe("/join");
  });
  it("removes credentials from nested automatic events and replay metadata without mutating originals", () => {
    const event = { event: "$snapshot", properties: { $current_url: `https://example.invalid/join#token=${token}`, $snapshot_data: [{ type: 4, data: { href: `https://example.invalid/join?token=${token}`, params: { token, safe: true } } }] } };
    const safe = redactInvitationTelemetry(event);
    expect(JSON.stringify(safe)).not.toContain(token);
    expect(safe.properties.$snapshot_data[0]?.data.params.safe).toBe(true);
    expect(JSON.stringify(event)).toContain(token);
  });
  it("handles cyclical provider metadata without leaking or blocking product actions", () => {
    const event: { token: string; child?: unknown } = { token };
    event.child = event;
    expect(redactInvitationTelemetry(event)).toEqual({ child: null });
  });
  it("preserves provider timestamps", () => {
    const timestamp = new Date("2026-10-07T12:00:00.000Z");
    expect(redactInvitationTelemetry({ timestamp }).timestamp).toBe(timestamp);
  });
});
