import { afterEach, expect, it, vi } from 'vitest';
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
  const service = new ScreenRecordingService((state) => states.push(state), complete);
  return { service, track, stream, states, complete };
}
afterEach(() => vi.unstubAllGlobals());
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
  test.service.start();
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
  test.service.start();
  test.service.cancel();
  expect(test.complete).not.toHaveBeenCalled();
  expect(test.track.stop).toHaveBeenCalledOnce();
});
it('stopping sharing from browser controls completes the recording', async () => {
  const test = setup();
  await test.service.choose();
  test.service.start();
  test.track.dispatchEvent(new Event('ended'));
  expect(test.complete).toHaveBeenCalledOnce();
  expect(test.states.at(-1)?.status).toBe('done');
});
it('a chunk exceeding the memory budget aborts rather than importing corrupt output', async () => {
  const test = setup();
  await test.service.choose();
  test.service.start();
  Recorder.current.ondataavailable?.({ data: { size: MAX_RECORDING_BYTES + 1 } as Blob });
  expect(test.states.at(-1)?.status).toBe('error');
  expect(test.complete).not.toHaveBeenCalled();
  expect(test.track.stop).toHaveBeenCalledOnce();
});
