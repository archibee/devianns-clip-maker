import { afterEach, expect, it, vi } from 'vitest';
import type { CaptureOutput } from '../modules/screen-recorder/src/canvas-output';
import {
  ScreenRecordingService,
  MAX_RECORDING_BYTES,
  type RecordingState,
} from '../modules/screen-recorder/src/service';
class Recorder {
  static current: Recorder;
  static isTypeSupported() {
    return true;
  }
  state = 'inactive';
  mimeType = 'video/webm';
  ondataavailable: ((e: { data: Blob }) => void) | null = null;
  onstop: (() => void) | null = null;
  onerror: (() => void) | null = null;
  constructor() {
    Recorder.current = this;
  }
  start() {
    this.state = 'recording';
  }
  stop() {
    this.state = 'inactive';
    this.ondataavailable?.({ data: new Blob(['recorded'], { type: this.mimeType }) });
    this.onstop?.();
  }
}
function setup(capture?: () => Promise<MediaStream>) {
  const track = Object.assign(new EventTarget(), { readyState: 'live', stop: vi.fn() });
  const stream = {
    getTracks: () => [track],
    getVideoTracks: () => [track],
    getAudioTracks: () => [],
  } as unknown as MediaStream;
  vi.stubGlobal('isSecureContext', true);
  vi.stubGlobal('navigator', {
    mediaDevices: { getDisplayMedia: vi.fn(capture ?? (async () => stream)) },
  });
  vi.stubGlobal('MediaRecorder', Recorder);
  const states: RecordingState[] = [],
    complete = vi.fn();
  const service = new ScreenRecordingService(
    (state) => states.push(state),
    complete,
    async (stream) => ({ stream, width: 640, height: 360, dispose: vi.fn() }),
  );
  return { service, track, stream, states, complete };
}
afterEach(() => vi.unstubAllGlobals());
it('requests system/window audio and keeps a monitor audio track instead of filtering by surface', async () => {
  const test = setup();
  const video = Object.assign(test.track, { getSettings: () => ({ displaySurface: 'monitor' }) });
  const audio = Object.assign(new EventTarget(), {
    kind: 'audio',
    readyState: 'live',
    stop: vi.fn(),
  });
  const stream = {
    getTracks: () => [video, audio],
    getVideoTracks: () => [video],
    getAudioTracks: () => [audio],
  } as unknown as MediaStream;
  const capture = vi.fn(async () => stream);
  vi.stubGlobal('navigator', { mediaDevices: { getDisplayMedia: capture } });
  await test.service.choose();
  expect(capture.mock.calls[0]).toBeDefined();
  const options = (capture.mock.calls as unknown as [[Record<string, unknown>]])[0][0];
  expect(options.systemAudio).toBe('include');
  expect(options.windowAudio).toBe('system');
  expect(test.states.at(-1)?.hasAudio).toBe(true);
  await test.service.start();
  expect(test.states.at(-1)?.hasAudio).toBe(true);
  test.service.cancel();
  expect(audio.stop).toHaveBeenCalledOnce();
});
it('cancelling while the fixed output is preparing releases a late pipeline without importing', async () => {
  const test = setup(),
    notify = vi.fn(),
    complete = vi.fn(),
    dispose = vi.fn();
  let resolve!: (output: CaptureOutput) => void;
  const service = new ScreenRecordingService(
    notify,
    complete,
    () =>
      new Promise((r) => {
        resolve = r;
      }),
  );
  await service.choose();
  const pending = service.start();
  service.cancel();
  resolve({ stream: test.stream, width: 640, height: 360, dispose });
  await pending;
  expect(dispose).toHaveBeenCalledOnce();
  expect(complete).not.toHaveBeenCalled();
  expect(notify.mock.calls.some(([state]) => state.status === 'recording')).toBe(false);
});
it('pending share selection cancelled by the user releases a late stream without recording', async () => {
  let resolve!: (stream: MediaStream) => void;
  const test = setup(
    () =>
      new Promise((r) => {
        resolve = r;
      }),
  );
  const pending = test.service.choose();
  test.service.cancel();
  resolve(test.stream);
  await pending;
  expect(test.track.stop).toHaveBeenCalledOnce();
  expect(test.complete).not.toHaveBeenCalled();
  expect(test.states.some((s) => s.status === 'ready')).toBe(false);
});
it('finalizes once after recording stops and releases the shared tracks', async () => {
  const test = setup();
  await test.service.choose();
  await test.service.start();
  test.service.stop();
  expect(test.complete).toHaveBeenCalledOnce();
  expect(test.complete.mock.calls[0][0].name).toMatch(/\.webm$/);
  expect(test.complete.mock.calls[0][0].type).toBe('video/webm');
  expect(test.track.stop).toHaveBeenCalledOnce();
  test.service.cancel();
  expect(test.complete).toHaveBeenCalledOnce();
});
it('discarding an active recording does not import a partial file', async () => {
  const test = setup();
  await test.service.choose();
  await test.service.start();
  test.service.cancel();
  expect(test.complete).not.toHaveBeenCalled();
  expect(test.track.stop).toHaveBeenCalledOnce();
});
it('stopping sharing from browser controls completes the recording', async () => {
  const test = setup();
  await test.service.choose();
  await test.service.start();
  test.track.dispatchEvent(new Event('ended'));
  expect(test.complete).toHaveBeenCalledOnce();
  expect(test.states.at(-1)?.status).toBe('done');
});
it('a chunk exceeding the memory budget aborts rather than importing corrupt output', async () => {
  const test = setup();
  await test.service.choose();
  await test.service.start();
  Recorder.current.ondataavailable?.({ data: { size: MAX_RECORDING_BYTES + 1 } as Blob });
  expect(test.states.at(-1)?.status).toBe('error');
  expect(test.complete).not.toHaveBeenCalled();
  expect(test.track.stop).toHaveBeenCalledOnce();
});
