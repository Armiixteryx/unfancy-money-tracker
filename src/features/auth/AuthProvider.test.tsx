import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AuthProvider, useAuth } from "./AuthProvider";
import { WelcomeScreen } from "./WelcomeScreen";

const state = vi.hoisted(() => ({
  marker: null as string | null,
  snapshot: null as string | null,
  recovery: null as string | null,
  identity: null as string | null,
  failMarker: false,
  failDatasetRead: false,
  financialMounts: 0,
  mountsWithoutDurableMarker: 0,
  signOut: vi.fn(),
  invalidateAuthentication: vi.fn(),
}));

vi.mock("react-native", () => ({
  StyleSheet: { create: (value: unknown) => value },
  ActivityIndicator: "progress",
  Modal: "modal",
  Pressable: "button",
  Text: "text",
  View: "view",
}));
vi.mock("../../platform/auth/client", () => ({
  authClient: { restore: async () => state.identity, signOut: state.signOut },
  getAuthenticatedIdentity: async () => state.identity ? { subject: `subject:${state.identity}`, email: state.identity } : null,
}));
vi.mock("../../platform/auth/lifecycle", () => ({ invalidateAuthentication: state.invalidateAuthentication }));
vi.mock("../../platform/persistence", () => ({
  createPersistenceAdapter: (namespace: string) => ({
    readSnapshot: async () => {
      if (namespace !== "introduction" && state.failDatasetRead) throw new Error("unreadable dataset");
      return namespace === "introduction" ? state.marker : state.snapshot;
    },
    readRecoverySnapshot: async () => state.recovery,
    writeSnapshot: async (value: string) => {
      if (state.failMarker) throw new Error("storage");
      if (namespace === "introduction") state.marker = value;
      else state.snapshot = value;
    },
  }),
}));
vi.mock("./AuthForm", () => ({ AuthForm: "form" }));
vi.mock("./WelcomeScreen", () => ({ WelcomeScreen: "div" }));

let tree: ReactTestRenderer;
let controls: ReturnType<typeof useAuth>;

function FinancialApp() {
  controls = useAuth();
  state.financialMounts++;
  if (state.marker !== "completed") state.mountsWithoutDurableMarker++;
  return <span>local financial application</span>;
}

beforeEach(() => {
  state.marker = null;
  state.snapshot = null;
  state.recovery = null;
  state.identity = null;
  state.failMarker = false;
  state.failDatasetRead = false;
  state.financialMounts = 0;
  state.mountsWithoutDurableMarker = 0;
  vi.clearAllMocks();
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

afterEach(async () => {
  if (tree) await act(async () => tree.unmount());
  vi.unstubAllEnvs();
});

async function mount() {
  await act(async () => {
    tree = create(<AuthProvider><FinancialApp /></AuthProvider>);
  });
}

describe("optional first-use introduction", () => {
  it("opens demo directly as a guest and never shows a credential form", async () => {
    vi.stubEnv("EXPO_PUBLIC_ENV", "demo");
    state.identity = "existing@example.invalid";
    state.failDatasetRead = true;
    await mount();
    expect(state.financialMounts).toBeGreaterThan(0);
    expect(controls.identity).toBeNull();
    expect(controls.subject).toBeNull();
    await act(async () => controls.open());
    expect(tree.root.findAllByType("form")).toHaveLength(0);
    expect(state.marker).toBeNull();
  });
  it("shows welcome without putting a new user behind an authentication form", async () => {
    await mount();

    expect(tree.root.findAllByType(WelcomeScreen)).toHaveLength(1);
    expect(tree.root.findAllByType("form")).toHaveLength(0);
    expect(state.financialMounts).toBe(0);
  });

  it("saves the introduction marker before mounting the guest financial app", async () => {
    await mount();

    await act(async () => {
      await tree.root.findByType(WelcomeScreen).props.onComplete();
    });

    expect(state.marker).toBe("completed");
    expect(state.financialMounts).toBeGreaterThan(0);
    expect(state.mountsWithoutDurableMarker).toBe(0);
    expect(tree.root.findAllByType(WelcomeScreen)).toHaveLength(0);
  });

  it("rejects a failed marker save, stays gated, and can retry successfully", async () => {
    state.failMarker = true;
    await mount();

    await act(async () => {
      await expect(tree.root.findByType(WelcomeScreen).props.onComplete()).rejects.toThrow("storage");
    });

    expect(state.marker).toBeNull();
    expect(state.financialMounts).toBe(0);
    expect(tree.root.findAllByType(WelcomeScreen)).toHaveLength(1);

    state.failMarker = false;
    await act(async () => {
      await tree.root.findByType(WelcomeScreen).props.onComplete();
    });

    expect(state.marker).toBe("completed");
    expect(state.financialMounts).toBeGreaterThan(0);
    expect(state.mountsWithoutDurableMarker).toBe(0);
  });

  it.each(["snapshot", "recovery"] as const)("bypasses welcome for %s and mounts the existing financial recovery path", async (kind) => {
    if (kind === "snapshot") state.snapshot = "preserved";
    else state.recovery = "preserved";

    await mount();

    expect(tree.root.findAllByType(WelcomeScreen)).toHaveLength(0);
    expect(state.marker).toBe("completed");
    expect(state.financialMounts).toBeGreaterThan(0);
  });

  it("bypasses welcome when financial storage is unreadable so recovery can handle it", async () => {
    state.failDatasetRead = true;

    await mount();

    expect(tree.root.findAllByType(WelcomeScreen)).toHaveLength(0);
    expect(state.marker).toBe("completed");
    expect(state.financialMounts).toBeGreaterThan(0);
  });

  it("honors an existing marker without reading a new-user welcome", async () => {
    state.marker = "completed";

    await mount();

    expect(tree.root.findAllByType(WelcomeScreen)).toHaveLength(0);
    expect(state.financialMounts).toBeGreaterThan(0);
  });
});

describe("optional authentication after introduction", () => {
  it("keeps sign-in modal, identity refresh, sign-out, and local records independent", async () => {
    state.snapshot = "preserved financial records";
    state.identity = "synthetic-first";
    await mount();

    expect(controls.identity).toBe("synthetic-first");
    expect(tree.root.findAllByType(WelcomeScreen)).toHaveLength(0);

    await act(async () => controls.open());
    expect(tree.root.findAllByType("form")).toHaveLength(1);
    expect(tree.root.findAllByType(WelcomeScreen)).toHaveLength(0);

    state.identity = "synthetic-second";
    await act(async () => {
      await tree.root.findByType("form").props.onComplete();
    });

    expect(controls.identity).toBe("synthetic-second");
    expect(controls.subject).toBe("subject:synthetic-second");
    expect(controls.epoch).toBe(1);
    expect(state.invalidateAuthentication).toHaveBeenCalledTimes(1);
    expect(tree.root.findAllByType("form")).toHaveLength(0);

    await act(async () => controls.signOut());

    expect(controls.identity).toBeNull();
    expect(controls.subject).toBeNull();
    expect(controls.epoch).toBe(2);
    expect(state.signOut).toHaveBeenCalledTimes(1);
    expect(state.snapshot).toBe("preserved financial records");
  });
});
