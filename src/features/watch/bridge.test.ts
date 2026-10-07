import { beforeEach, describe, expect, it, vi } from 'vitest';
import { watchAudioBridge } from './bridge';
const native = vi.hoisted(() => ({ list: vi.fn(), getPending: vi.fn(), readAudio: vi.fn(), markProcessing: vi.fn(), setAccount: vi.fn() }));
vi.mock('react-native', () => ({ Platform: { OS: 'android' }, NativeModules: { WatchAudioBridge: native }, NativeEventEmitter: vi.fn() }));
const row = {
  requestId: '019a568d-3000-7000-8000-000000000001', accountId: 'synthetic-sub',
  recordedAt: '2026-10-06T12:00:00.000Z', mimeType: 'audio/mp4', durationMs: 900, status: 'failed',
};
beforeEach(() => vi.clearAllMocks());
describe('native watch boundary', () => {
  it('accepts the actual native metadata and audio field names', async () => {
    native.list.mockResolvedValue([row]);
    native.getPending.mockResolvedValue([{ ...row, status: 'pending' }]);
    native.readAudio.mockResolvedValue({ audio: 'AAAA', mimeType: 'audio/mp4', durationMs: 900 });
    expect(await watchAudioBridge.list()).toEqual([row]);
    expect(await watchAudioBridge.getPending()).toHaveLength(1);
    expect(await watchAudioBridge.readAudio(row.requestId)).toEqual({ audio: 'AAAA', mimeType: 'audio/mp4', durationMs: 900 });
  });
  it.each([
    { ...row, requestId: '../recording' },
    { ...row, accountId: '' },
    { ...row, recordedAt: 'invalid' },
    { ...row, status: 'deleted' },
    { ...row, audio: 'sensitive-content' },
  ])('rejects malformed or unexpected recovery metadata', async invalid => {
    native.list.mockResolvedValue([invalid]);
    await expect(watchAudioBridge.list()).rejects.toThrow();
  });
  it.each([
    { audioBase64: 'AAAA', mimeType: 'audio/mp4', durationMs: 900 },
    { audio: 'invalid?', mimeType: 'audio/mp4', durationMs: 900 },
    { audio: 'AAAA', mimeType: 'application/json', durationMs: 900 },
    { audio: 'AAAA', mimeType: 'audio/mp4', durationMs: 0 },
  ])('rejects invalid audio before remote processing', async invalid => {
    native.readAudio.mockResolvedValue(invalid);
    await expect(watchAudioBridge.readAudio(row.requestId)).rejects.toThrow();
  });
});
