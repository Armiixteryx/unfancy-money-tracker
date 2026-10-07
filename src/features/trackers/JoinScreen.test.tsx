import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, expect, it, vi } from "vitest";
import JoinTrackerScreen from "../../../app/join";
import { resetInvitationHandoffForTesting } from "./invitationHandoff";

const fixture = vi.hoisted(() => ({ replace: vi.fn(), open: vi.fn(), url: `unfancy-money-tracker://join#token=${"A".repeat(43)}` }));
vi.mock("expo-router", () => ({ useRouter: () => ({ replace: fixture.replace }), useLocalSearchParams: () => ({}) }));
vi.mock("react-native", () => ({ ActivityIndicator: "spinner", Pressable: "button", View: "view", Platform: { OS: "ios" }, Linking: { getInitialURL: async () => fixture.url, addEventListener: () => ({ remove: vi.fn() }) } }));
vi.mock("react-i18next", () => ({ useTranslation: () => ({ i18n: { resolvedLanguage: "en" } }) }));
vi.mock("../../ui/AppScreen", () => ({ AppScreen: ({ children }: { children: React.ReactNode }) => children }));
vi.mock("../../ui/AppText", () => ({ AppText: "text" }));
vi.mock("../../ui/theme", () => ({ useAppTheme: () => ({ colors: {} }) }));
vi.mock("../../platform/analytics/SensitiveContent", () => ({ SensitiveContent: ({ children }: { children: React.ReactNode }) => children }));
vi.mock("../auth/AuthProvider", () => ({ useAuth: () => ({ subject: null, identity: null, open: fixture.open }) }));
vi.mock("./TrackerProvider", () => ({ useTrackers: () => ({ client: {}, acceptShared: vi.fn() }) }));
let tree: ReactTestRenderer;
afterEach(async () => { await act(async () => tree?.unmount()); resetInvitationHandoffForTesting(); vi.clearAllMocks(); });
it("holds a fragment invitation through router rerenders without replacing the route repeatedly", async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  await act(async () => { tree = create(<JoinTrackerScreen />); });
  await act(async () => { tree.update(<JoinTrackerScreen />); });
  expect(fixture.replace).not.toHaveBeenCalled();
  expect(tree.root.findAllByType("text").some(node => node.children.join("").startsWith("Sign in to preview"))).toBe(true);
  await act(async () => tree.root.findByType("button").props.onPress());
  expect(fixture.open).toHaveBeenCalledOnce();
});
