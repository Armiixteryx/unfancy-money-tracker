import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { TrackerManagement } from "./TrackerManagement";

const fixture = vi.hoisted(() => ({
  summary: { kind: "shared", role: "admin", datasetId: "dataset", membershipId: "membership", name: "Family", archived: false },
  invite: vi.fn(async () => ({ url: "https://example.invalid/join", expiresAt: "2026-10-14", invitationId: "invitation" })),
  members: vi.fn(async () => []), refresh: vi.fn(async () => undefined),
}));
vi.mock("react-native", () => ({ Modal: "modal", Pressable: "button", TextInput: "input", View: "view", Share: { share: vi.fn() } }));
vi.mock("react-i18next", () => ({ useTranslation: () => ({ i18n: { resolvedLanguage: "en" } }) }));
vi.mock("../../ui/AppText", () => ({ AppText: "text" }));
vi.mock("../../ui/theme", () => ({ useAppTheme: () => ({ colors: {} }) }));
vi.mock("../../platform/analytics/SensitiveContent", () => ({ SensitiveContent: ({ children }: { children: React.ReactNode }) => children }));
vi.mock("../auth/AuthProvider", () => ({ useAuth: () => ({ subject: "subject", identity: "synthetic@example.invalid" }) }));
vi.mock("./TrackerProvider", () => ({ useTrackers: () => provider }));
vi.mock("./store", () => ({
  useActiveTrackerSummary: () => fixture.summary, useTrackerRegistry: () => [],
  trackerRegistryStore: { getState: () => ({ principal: { subject: "subject" }, activeSummary: fixture.summary }) },
  selectTracker: vi.fn(), removeInaccessibleTracker: vi.fn(), updateTrackerSummary: vi.fn(),
}));
const provider = { client: { invite: fixture.invite, members: fixture.members }, refresh: fixture.refresh, createShared: vi.fn() };
let tree: ReactTestRenderer;
function button(label: string) {
  return tree.root.findAllByType("button").find(node => node.findAllByType("text").some(text => text.children.join("") === label));
}
beforeEach(() => { Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true }); fixture.summary.role = "admin"; vi.clearAllMocks(); });
afterEach(async () => { await act(async () => tree?.unmount()); });
it("lets an admin enter the invited account and select its role", async () => {
  await act(async () => { tree = create(<TrackerManagement />); });
  expect(button("Invite")!.props.disabled).toBe(true);
  await act(async () => { tree.root.findByProps({ accessibilityLabel: "Email to invite" }).props.onChangeText(" spouse@example.invalid "); });
  await act(async () => { button("Admin")!.props.onPress(); });
  await act(async () => { button("Invite")!.props.onPress(); });
  expect(fixture.invite).toHaveBeenCalledWith({ datasetId: "dataset", membershipId: "membership", email: "spouse@example.invalid", role: "admin" });
});
it("hides invitation and tracker administration from members", async () => {
  fixture.summary.role = "member";
  await act(async () => { tree = create(<TrackerManagement />); });
  expect(tree.root.findAllByProps({ accessibilityLabel: "Email to invite" })).toHaveLength(0);
  expect(button("Invite")).toBeUndefined();
  expect(button("Archive tracker")).toBeUndefined();
  expect(button("Leave tracker")).toBeDefined();
});
