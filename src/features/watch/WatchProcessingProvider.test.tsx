import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WatchProcessingProvider } from './WatchProcessingProvider';
const mocks = vi.hoisted(() => ({
  auth: { identity: 'synthetic-login' as string | null, epoch: 0 },
  account: 'subject-a', process: vi.fn(), failPending: vi.fn(), setAccount: vi.fn(),
  setTargets: vi.fn(), listTargets: vi.fn(),
}));
vi.mock('../auth/AuthProvider', () => ({ useAuth: () => mocks.auth }));
vi.mock('../../platform/auth/client', () => ({ getAuthenticatedAccountId: async () => mocks.account }));
vi.mock('./processor', () => ({ processWatchQueue: mocks.process }));
vi.mock('./bridge', () => ({ watchAudioBridge: {
  available: true, setAccount: mocks.setAccount, failPendingForCurrentBinding: mocks.failPending,
  setTargets: mocks.setTargets,
  subscribe: () => () => undefined,
} }));
vi.mock('../trackers/store', () => ({ listVoiceTargets: mocks.listTargets, subscribeTrackerRegistry: () => () => undefined }));
let tree: ReactTestRenderer | undefined;
beforeEach(() => {
  vi.clearAllMocks(); mocks.auth = { identity: 'synthetic-login', epoch: 0 }; mocks.account = 'subject-a';
  mocks.process.mockResolvedValue(undefined); mocks.failPending.mockResolvedValue(undefined);
  mocks.setAccount.mockResolvedValue(undefined); mocks.setTargets.mockResolvedValue(undefined); mocks.listTargets.mockResolvedValue([]);
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});
afterEach(async () => { if (tree) await act(async () => tree?.unmount()); tree = undefined; });
async function mount() { await act(async () => { tree = create(<WatchProcessingProvider><span>Manual tracking</span></WatchProcessingProvider>); }); }
async function update() { await act(async () => tree?.update(<WatchProcessingProvider><span>Manual tracking</span></WatchProcessingProvider>)); }
describe('watch foreground lifecycle', () => {
  it('starts the new account drain while canceling the old effect', async () => {
    let finishOld: (() => void) | undefined;
    mocks.process.mockImplementationOnce(() => new Promise<void>(resolve => { finishOld = resolve; }));
    await mount();
    const oldIsCurrent = mocks.process.mock.calls[0]?.[1] as () => boolean;
    expect(oldIsCurrent()).toBe(true);
    mocks.account = 'subject-b'; mocks.auth = { identity: 'second-login', epoch: 1 };
    await update();
    expect(oldIsCurrent()).toBe(false);
    expect(mocks.process.mock.calls.map(call => call[0])).toEqual(['subject-a', 'subject-b']);
    await act(async () => finishOld?.());
  });
  it('does not let a delayed guest cleanup clear a new login binding', async () => {
    let finishCleanup: (() => void) | undefined;
    mocks.auth = { identity: null, epoch: 0 };
    mocks.failPending.mockImplementationOnce(() => new Promise<void>(resolve => { finishCleanup = resolve; }));
    await mount();
    mocks.auth = { identity: 'new-login', epoch: 1 };
    await update();
    await act(async () => finishCleanup?.());
    expect(mocks.process).toHaveBeenCalledWith('subject-a', expect.any(Function));
    expect(mocks.setAccount).not.toHaveBeenCalledWith(null);
  });
  it('does not publish a prior account catalog after a delayed binding completes', async () => {
    let finishOldBinding: (() => void) | undefined;
    const personal = (datasetId: string, name: string) => ({
      datasetId, name, membershipId: null, generation: 1, kind: 'personal', writable: true,
    });
    mocks.listTargets.mockResolvedValue([personal('personal-a', 'Account A')]);
    mocks.setAccount.mockImplementationOnce(() => new Promise<void>(resolve => { finishOldBinding = resolve; }));
    await mount();

    mocks.account = 'subject-b'; mocks.auth = { identity: 'second-login', epoch: 1 };
    mocks.listTargets.mockResolvedValue([personal('personal-b', 'Account B')]);
    await update();
    expect(mocks.setTargets).toHaveBeenCalledOnce();
    expect(mocks.setTargets).toHaveBeenCalledWith([expect.objectContaining({ datasetId: 'personal-b' })]);

    await act(async () => finishOldBinding?.());
    expect(mocks.setTargets).toHaveBeenCalledOnce();
  });
  it('preserves manual tracking when the encrypted queue is unavailable', async () => {
    mocks.process.mockRejectedValue(new Error('watch_audio_error'));
    await mount();
    expect(tree?.root.findByType('span').children).toEqual(['Manual tracking']);
  });
});
