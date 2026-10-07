import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  register: vi.fn(), initialize: vi.fn(async () => undefined),
  restore: vi.fn(async () => ({})), account: vi.fn(async () => "synthetic-account"),
  process: vi.fn<() => Promise<void>>(async () => undefined), unsubscribe: vi.fn(),
  failPending: vi.fn(async () => undefined),
  state: { dataset: {} as object | null, hydration: { status: "ready" } },
}));
vi.mock("react-native", () => ({ Platform: { OS: "android" }, AppRegistry: { registerHeadlessTask: mocks.register } }));
vi.mock("../../platform/auth/client", () => ({ authClient: { restore: mocks.restore }, getAuthenticatedAccountId: mocks.account }));
vi.mock("../../platform/auth/lifecycle", () => ({ subscribeAuthentication: () => mocks.unsubscribe }));
vi.mock("../local-data/store/useLocalDatasetStore", () => ({ useLocalDatasetStore: { getState: () => ({ ...mocks.state, initialize: mocks.initialize }) } }));
vi.mock("./bridge", () => ({ watchAudioBridge: { failPendingForCurrentBinding: mocks.failPending } }));
vi.mock("./processor", () => ({ processWatchQueue: mocks.process }));

async function task() {
  await import("./registerHeadlessTask");
  return mocks.register.mock.calls[0]![1]() as () => Promise<void>;
}
describe("watch headless lifetime", () => {
  beforeEach(() => {
    vi.resetModules(); vi.clearAllMocks();
    mocks.state = { dataset: {}, hydration: { status: "ready" } };
    mocks.process.mockResolvedValue(undefined);
  });
  it("preserves an already hydrated dataset", async () => {
    await (await task())();
    expect(mocks.initialize).not.toHaveBeenCalled();
    expect(mocks.process).toHaveBeenCalledWith("synthetic-account", expect.any(Function));
    expect(mocks.unsubscribe).toHaveBeenCalledOnce();
  });
  it("hydrates cold storage before processing", async () => {
    mocks.state.dataset = null;
    await (await task())();
    expect(mocks.initialize).toHaveBeenCalledOnce();
    expect(mocks.initialize.mock.invocationCallOrder[0]).toBeLessThan(mocks.process.mock.invocationCallOrder[0]!);
  });
  it("keeps the native task open until shared processing settles", async () => {
    let finish!: () => void;
    mocks.process.mockImplementation(() => new Promise<void>(resolve => { finish = resolve; }));
    let completed = false;
    const running = (await task())().then(() => { completed = true; });
    await vi.waitFor(() => expect(mocks.process).toHaveBeenCalledOnce());
    expect(completed).toBe(false);
    expect(mocks.unsubscribe).not.toHaveBeenCalled();
    finish(); await running;
    expect(completed).toBe(true);
    expect(mocks.unsubscribe).toHaveBeenCalledOnce();
  });
  it("resolves a failed handoff so native task completion is delivered", async () => {
    mocks.process.mockRejectedValueOnce(new Error("synthetic handoff failure"));
    await expect((await task())()).resolves.toBeUndefined();
    expect(mocks.failPending).toHaveBeenCalledWith("handoff_failed");
    expect(mocks.unsubscribe).toHaveBeenCalledOnce();
  });
  it("still resolves when durable failure storage is unavailable", async () => {
    mocks.process.mockRejectedValueOnce(new Error("synthetic handoff failure"));
    mocks.failPending.mockRejectedValueOnce(new Error("synthetic storage failure"));
    await expect((await task())()).resolves.toBeUndefined();
    expect(mocks.unsubscribe).toHaveBeenCalledOnce();
  });

});
