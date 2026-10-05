import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { AuthProvider, useAuth } from "./AuthProvider";
const state = vi.hoisted(() => ({ marker: null as string | null, snapshot: null as string | null, recovery: null as string | null, identity: null as string | null, failMarker: false, financialMounts: 0, signOut: vi.fn() }));
vi.mock("react-native", () => ({
  StyleSheet: { create: (value: unknown) => value }, ActivityIndicator: "progress", Modal: "modal", Pressable: "button", Text: "text", View: "view" }));
vi.mock("../../platform/auth/client", () => ({ authClient: { restore: async () => state.identity, signOut: state.signOut } }));
vi.mock("../../platform/persistence", () => ({ createPersistenceAdapter: (namespace: string) => ({ readSnapshot: async () => namespace === "introduction" ? state.marker : state.snapshot, readRecoverySnapshot: async () => state.recovery, writeSnapshot: async (value: string) => { if (state.failMarker) throw new Error("storage"); state.marker = value; } }) }));
vi.mock("./AuthForm", () => ({ AuthForm: "form" }));
let tree: ReactTestRenderer;
let controls: ReturnType<typeof useAuth>;
function FinancialApp() { controls = useAuth(); state.financialMounts++; return <span>local financial application</span>; }
beforeEach(() => { state.marker=null; state.snapshot=null; state.recovery=null; state.identity=null; state.failMarker=false; state.financialMounts=0; vi.clearAllMocks(); (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT=true; });
afterEach(async () => { if (tree) await act(async () => tree.unmount()); });
async function mount() { await act(async () => { tree = create(<AuthProvider><FinancialApp /></AuthProvider>); }); }
describe("optional introduction gate", () => {
  it("persists Skip login before mounting financial initialization", async () => {
    await mount(); expect(state.financialMounts).toBe(0);
    await act(async () => { await tree.root.findByType("form").props.onComplete(); });
    expect(state.marker).toBe("completed"); expect(state.financialMounts).toBeGreaterThan(0);
  });
  it("keeps financial initialization blocked if the introduction choice cannot save", async () => {
    state.failMarker=true; await mount();
    await act(async () => { await expect(tree.root.findByType("form").props.onComplete()).rejects.toThrow("storage"); });
    expect(state.financialMounts).toBe(0); expect(state.marker).toBeNull();
  });
  it.each(["snapshot", "recovery"])("bypasses introduction for existing %s", async kind => {
    state[kind === "snapshot" ? "snapshot" : "recovery"]="preserved";
    await mount(); expect(tree.root.findAllByType("form")).toHaveLength(0); expect(state.marker).toBe("completed");
  });
  it("restores identity and preserves records across sign-out and a different login", async () => {
    state.snapshot="preserved financial records"; state.identity="synthetic-first"; await mount();
    expect(controls.identity).toBe("synthetic-first");
    await act(async () => { await controls.signOut(); }); expect(controls.identity).toBeNull(); expect(state.snapshot).toBe("preserved financial records");
    await act(async () => { controls.open(); }); state.identity="synthetic-second";
    await act(async () => { await tree.root.findByType("form").props.onComplete(); });
    expect(controls.identity).toBe("synthetic-second"); expect(state.snapshot).toBe("preserved financial records"); expect(tree.root.findAllByType("form")).toHaveLength(0);
  });
});
