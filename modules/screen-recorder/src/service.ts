import { createCaptureOutput, type CaptureOutput, type OutputFactory } from './canvas-output';
import { FULL_REGION, type RecordRegion } from './geometry';
export type RecordingState = {
  status:
    'idle' | 'selecting' | 'ready' | 'preparing' | 'recording' | 'finishing' | 'done' | 'error';
  stream?: MediaStream;
  hasAudio?: boolean;
  cursorHidden?: boolean;
  cursorModeApplied?: boolean;
  bytes: number;
  error?: string;
  reason?: string;
  outputSize?: { width: number; height: number };
};
export const MAX_RECORDING_BYTES = 128 * 1024 * 1024;
export const MAX_RECORDING_MS = 30 * 60 * 1000;
export function recordingUnavailable() {
  if (!globalThis.isSecureContext) return '탭 녹화는 HTTPS 또는 localhost에서 사용할 수 있습니다.';
  if (typeof navigator.mediaDevices?.getDisplayMedia !== 'function')
    return '이 브라우저는 탭·화면 공유 녹화를 지원하지 않습니다. 데스크톱 Chrome 또는 Edge 등 지원 브라우저를 사용하세요.';
  if (typeof MediaRecorder !== 'function')
    return '이 브라우저는 녹화 파일 생성을 지원하지 않습니다.';
  return undefined;
}
export function recordingFormats(hasAudio: boolean) {
  return hasAudio
    ? [
        'video/webm;codecs=vp9,opus',
        'video/webm;codecs=vp8,opus',
        'video/mp4;codecs=avc1.42001e,mp4a.40.2',
        'video/webm',
        'video/mp4',
      ]
    : [
        'video/webm;codecs=vp9',
        'video/webm;codecs=vp8',
        'video/mp4;codecs=avc1.42001e',
        'video/webm',
        'video/mp4',
      ];
}
/** Owns the display stream and bounded encoded chunks; never touches editor state. */
export class ScreenRecordingService {
  private stream?: MediaStream;
  private recorder?: MediaRecorder;
  private chunks: Blob[] = [];
  private bytes = 0;
  private generation = 0;
  private timer?: ReturnType<typeof setTimeout>;
  private events?: AbortController;
  private reason?: string;
  private output?: CaptureOutput;
  private outputController?: AbortController;
  private createOutput: OutputFactory;
  private notify: (state: RecordingState) => void;
  private complete: (file: File) => void;
  constructor(
    notify: (state: RecordingState) => void,
    complete: (file: File) => void,
    createOutput: OutputFactory = createCaptureOutput,
  ) {
    this.notify = notify;
    this.complete = complete;
    this.createOutput = createOutput;
  }
  private async configureCursor(stream: MediaStream, visible: boolean) {
    const cursor = visible ? 'always' : 'never';
    for (const track of stream.getVideoTracks()) {
      try {
        await track.applyConstraints({ cursor: { exact: cursor } } as MediaTrackConstraints & {
          cursor: ConstrainDOMString;
        });
      } catch {
        // Unsupported constraints must not prevent recording; verify settings below.
      }
    }
    const settings = stream.getVideoTracks().map(
      (track) => (track.getSettings?.() as (MediaTrackSettings & { cursor?: string }) | undefined)?.cursor,
    );
    return {
      cursorHidden: settings.every((value) => value === 'never'),
      cursorModeApplied: settings.every((value) => value === cursor),
    };
  }
  async setCursorVisible(visible: boolean) {
    const stream = this.stream, generation = this.generation;
    if (!stream || this.recorder || this.outputController) return;
    const cursorState = await this.configureCursor(stream, visible);
    if (generation !== this.generation || this.recorder || this.outputController) return;
    this.notify({
      status: 'ready', stream, bytes: 0, ...cursorState,
      hasAudio: stream.getAudioTracks().some((track) => track.readyState === 'live'),
    });
  }
  async choose(showCursor = false) {
    this.cancel();
    const generation = this.generation;
    this.notify({ status: 'selecting', bytes: 0 });
    try {
      const issue = recordingUnavailable();
      if (issue) throw new Error(issue);
      // Called synchronously by the user's button handler; no permission persistence or remote capture.
      const options: DisplayMediaStreamOptions & {
        selfBrowserSurface: string;
        preferCurrentTab: boolean;
        systemAudio: 'include';
        windowAudio: 'system';
      } = {
        video: {
          displaySurface: 'browser',
          frameRate: 30,
          width: { ideal: 1920 },
          height: { ideal: 1080 },
          cursor: showCursor ? 'always' : 'never',
        } as MediaTrackConstraints & { cursor: string },
        audio: {
          suppressLocalAudioPlayback: false,
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        } as MediaTrackConstraints,
        systemAudio: 'include',
        windowAudio: 'system',
        selfBrowserSurface: 'exclude',
        preferCurrentTab: false,
      };
      const stream = await navigator.mediaDevices.getDisplayMedia(options);
      if (generation !== this.generation) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      this.stream = stream;
      if (!stream.getVideoTracks().some((t) => t.readyState === 'live'))
        throw new Error('공유할 영상 트랙이 없습니다.');
      const cursorState = await this.configureCursor(stream, showCursor);
      if (generation !== this.generation) return;
      this.events = new AbortController();
      for (const track of stream.getVideoTracks())
        track.addEventListener(
          'ended',
          () => {
            if (this.recorder?.state === 'recording')
              this.stop('브라우저에서 공유가 종료되어 녹화를 마쳤습니다.');
            else if (!this.recorder) this.fail('화면 공유가 종료됐습니다. 탭을 다시 선택하세요.');
          },
          { signal: this.events.signal },
        );
      this.notify({
        status: 'ready',
        stream,
        hasAudio: stream.getAudioTracks().some((t) => t.readyState === 'live'),
        ...cursorState,
        bytes: 0,
      });
    } catch (error) {
      if (generation !== this.generation) return;
      const name = error instanceof DOMException ? error.name : '';
      this.fail(
        name === 'NotAllowedError'
          ? '화면 공유 선택을 취소했거나 권한이 허용되지 않았습니다.'
          : name === 'NotReadableError'
            ? '선택한 화면을 읽을 수 없습니다. 시스템 화면 녹화 권한을 확인하세요.'
            : error instanceof Error
              ? error.message
              : '화면 공유를 시작하지 못했습니다.',
      );
    }
  }
  async start(region: RecordRegion = FULL_REGION) {
    if (
      !this.stream ||
      this.recorder ||
      this.outputController ||
      !this.stream.getVideoTracks().some((t) => t.readyState === 'live')
    )
      return;
    const generation = this.generation;
    this.outputController = new AbortController();
    this.notify({ status: 'preparing', stream: this.stream, bytes: 0 });
    try {
      const hasAudio = this.stream.getAudioTracks().some((t) => t.readyState === 'live');
      const output = await this.createOutput(
        this.stream,
        { ...region },
        this.outputController.signal,
        (message) => {
          if (generation === this.generation) this.fail(message);
        },
      );
      if (generation !== this.generation) {
        output.dispose();
        return;
      }
      this.output = output;
      const mimeType = recordingFormats(hasAudio).find((type) =>
        MediaRecorder.isTypeSupported(type),
      );
      if (!mimeType) throw new Error('지원하는 녹화 형식이 없습니다. 다른 브라우저를 사용하세요.');
      const recorder = new MediaRecorder(output.stream, {
        mimeType,
        videoBitsPerSecond: 4_000_000,
        ...(hasAudio ? { audioBitsPerSecond: 128_000 } : {}),
      });
      this.recorder = recorder;
      this.bytes = 0;
      this.chunks = [];
      this.reason = undefined;
      recorder.ondataavailable = (event) => {
        if (generation !== this.generation || !event.data.size) return;
        if (this.bytes + event.data.size > MAX_RECORDING_BYTES) {
          this.fail('녹화 버퍼 한도를 초과했습니다. 더 짧게 나누어 녹화하세요.');
          return;
        }
        this.chunks.push(event.data);
        this.bytes += event.data.size;
        this.notify({
          status: recorder.state === 'recording' ? 'recording' : 'finishing',
          stream: output.stream,
          outputSize: { width: output.width, height: output.height },
          hasAudio,
          bytes: this.bytes,
          reason: this.reason,
        });
        if (this.bytes >= MAX_RECORDING_BYTES - 8 * 1024 * 1024)
          this.stop('녹화 용량 한도에 가까워져 자동으로 완료했습니다.');
      };
      recorder.onerror = () =>
        this.fail('녹화 인코더 오류가 발생했습니다. 기존 프로젝트는 유지됩니다.');
      recorder.onstop = () => {
        if (generation !== this.generation) return;
        const type = recorder.mimeType || mimeType;
        const blob = new Blob(this.chunks, { type });
        this.chunks = [];
        this.release();
        if (!blob.size) {
          this.fail('녹화된 내용이 없습니다.');
          return;
        }
        const extension = type.startsWith('video/mp4') ? 'mp4' : 'webm';
        const file = new File(
          [blob],
          `recording-${new Date().toISOString().replace(/[:.]/g, '-')}.${extension}`,
          { type, lastModified: Date.now() },
        );
        this.notify({ status: 'done', hasAudio, bytes: file.size, reason: this.reason });
        this.complete(file);
      };
      recorder.start(1000);
      this.timer = setTimeout(
        () => this.stop('녹화 시간 한도에 도달해 자동으로 완료했습니다.'),
        MAX_RECORDING_MS,
      );
      this.notify({
        status: 'recording',
        stream: output.stream,
        hasAudio,
        bytes: 0,
        outputSize: { width: output.width, height: output.height },
      });
    } catch (error) {
      if (generation !== this.generation) return;
      this.fail(error instanceof Error ? error.message : '녹화를 시작하지 못했습니다.');
    }
  }
  stop(reason?: string) {
    if (!this.recorder || this.recorder.state !== 'recording') return;
    this.reason = reason;
    this.notify({
      status: 'finishing',
      stream: this.output?.stream ?? this.stream,
      bytes: this.bytes,
      reason,
    });
    try {
      this.recorder.stop();
    } catch {
      this.fail('녹화 파일을 마무리하지 못했습니다.');
    }
  }
  private release() {
    clearTimeout(this.timer);
    this.timer = undefined;
    this.events?.abort();
    this.events = undefined;
    this.outputController?.abort();
    this.outputController = undefined;
    this.output?.dispose();
    this.output = undefined;
    if (this.recorder) {
      this.recorder.ondataavailable = null;
      this.recorder.onstop = null;
      this.recorder.onerror = null;
    }
    this.recorder = undefined;
    this.stream?.getTracks().forEach((track) => track.stop());
    this.stream = undefined;
  }
  private fail(error: string) {
    this.cancel();
    this.notify({ status: 'error', bytes: 0, error });
  }
  cancel() {
    this.generation++;
    const recorder = this.recorder;
    this.release();
    if (recorder && recorder.state !== 'inactive') {
      try {
        recorder.stop();
      } catch {
        /* stream already ended */
      }
    }
    this.chunks = [];
    this.bytes = 0;
  }
}
