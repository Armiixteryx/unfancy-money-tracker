import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  register: vi.fn(), initialize: vi.fn(async () => undefined), setPrincipal: vi.fn(async () => undefined),
  restore: vi.fn<() => Promise<string | null>>(async () => "synthetic@example.invalid"), account: vi.fn<() => Promise<string | null>>(async () => "synthetic-account"),
  process: vi.fn<() => Promise<void>>(async () => undefined), unsubscribe: vi.fn(),
  failPending: vi.fn(async () => undefined), setAccount: vi.fn(async () => undefined), setTargets: vi.fn(async () => undefined), listTargets: vi.fn(async () => []),
}));
vi.mock("react-native", () => ({ Platform: { OS: "android" }, AppRegistry: { registerHeadlessTask: mocks.register } }));
vi.mock("../../platform/auth/client", () => ({ authClient: { restore: mocks.restore }, getAuthenticatedAccountId: mocks.account }));
vi.mock("../../platform/auth/lifecycle", () => ({ subscribeAuthentication: () => mocks.unsubscribe }));
vi.mock("../trackers/store", () => ({
  setTrackerPrincipal: mocks.setPrincipal,
  initializeTrackerRegistry: mocks.initialize,
  listVoiceTargets: mocks.listTargets,
}));
vi.mock("./bridge", () => ({ watchAudioBridge: { failPendingForCurrentBinding: mocks.failPending, setAccount: mocks.setAccount, setTargets: mocks.setTargets } }));
vi.mock("./processor", () => ({ processWatchQueue: mocks.process }));

async function task() {
  await import("./registerHeadlessTask");
  return mocks.register.mock.calls[0]![1]() as () => Promise<void>;
}
describe("watch headless lifetime", () => {
  beforeEach(() => {
    vi.resetModules(); vi.clearAllMocks();
    mocks.process.mockResolvedValue(undefined); mocks.restore.mockResolvedValue("synthetic@example.invalid");
    mocks.account.mockResolvedValue("synthetic-account"); mocks.listTargets.mockResolvedValue([]);
  });
  it("restores the tracker principal and target catalog before processing", async () => {
    await (await task())();
    expect(mocks.setPrincipal).toHaveBeenCalledWith({ subject: "synthetic-account", email: "synthetic@example.invalid" });
    expect(mocks.initialize).toHaveBeenCalledOnce();
    expect(mocks.setAccount).toHaveBeenCalledWith("synthetic-account");
    expect(mocks.setTargets).toHaveBeenCalledWith([]);
    expect(mocks.process).toHaveBeenCalledWith("synthetic-account", expect.any(Function));
    expect(mocks.unsubscribe).toHaveBeenCalledOnce();
  });
  it("does not process queue without an authenticated subject", async () => {
    mocks.restore.mockResolvedValue(null); mocks.account.mockResolvedValue(null);
    await (await task())();
    expect(mocks.process).not.toHaveBeenCalled();
    expect(mocks.failPending).toHaveBeenCalledWith("authentication_required");
    expect(mocks.setAccount).toHaveBeenCalledWith(null);
  });
  it("keeps the native task open until shared processing settles", async () => {
    let finish!: () => void;
    mocks.process.mockImplementation(() => new Promise<void>(resolve => { finish = resolve; }));
    let completed = false;
    const running = (await task())().then(() => { completed = true; });
    await vi.waitFor(() => expect(mocks.process).toHaveBeenCalledOnce());
    expect(completed).toBe(false); expect(mocks.unsubscribe).not.toHaveBeenCalled();
    finish(); await running;
    expect(completed).toBe(true); expect(mocks.unsubscribe).toHaveBeenCalledOnce();
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
