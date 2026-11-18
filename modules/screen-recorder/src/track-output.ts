import { containRect, recordingSize, type RecordRegion } from './geometry';
import type { CaptureOutput } from './canvas-output';
type ProcessorConstructor = new (options: { track: MediaStreamTrack; maxBufferSize: number }) => {
  readable: ReadableStream<VideoFrame>;
};
const processor = () =>
  (globalThis as unknown as { MediaStreamTrackProcessor?: ProcessorConstructor })
    .MediaStreamTrackProcessor;
export const trackProcessorAvailable = () => typeof processor() === 'function';
/** Consume at most one queued VideoFrame, avoiding HTML video paint throttling in a hidden recording tab. */
export async function createTrackOutput(
  source: MediaStream,
  region: RecordRegion,
  signal: AbortSignal,
  onError?: (message: string) => void,
): Promise<CaptureOutput> {
  const Processor = processor();
  if (!Processor) throw new Error('영상 프레임 처리기를 사용할 수 없습니다.');
  const reader = new Processor({
    track: source.getVideoTracks()[0],
    maxBufferSize: 1,
  }).readable.getReader();
  let canvas: HTMLCanvasElement | undefined,
    captured: MediaStream | undefined,
    output: MediaStream | undefined,
    disposed = false;
  let pendingFrame: VideoFrame | undefined;
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    void reader.cancel().catch(() => {});
    pendingFrame?.close();
    pendingFrame = undefined;
    captured?.getVideoTracks().forEach((track) => track.stop());
    if (canvas) {
      canvas.width = 0;
      canvas.height = 0;
    }
    signal.removeEventListener('abort', dispose);
  };
  signal.addEventListener('abort', dispose, { once: true });
  const timeout = setTimeout(dispose, 10000);
  try {
    signal.throwIfAborted();
    const first = await reader.read();
    clearTimeout(timeout);
    if (!first.done) pendingFrame = first.value;
    if (first.done || disposed) throw new Error('녹화할 공유 영상 프레임을 읽을 수 없습니다.');
    const size = recordingSize(first.value.displayWidth, first.value.displayHeight, region);
    canvas = document.createElement('canvas');
    canvas.width = size.width;
    canvas.height = size.height;
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) {
      throw new Error('녹화 캔버스를 만들 수 없습니다.');
    }
    captured = canvas.captureStream(0);
    let track = captured.getVideoTracks()[0] as CanvasCaptureMediaStreamTrack;
    if (typeof track.requestFrame !== 'function') {
      track.stop();
      captured = canvas.captureStream(30);
      track = captured.getVideoTracks()[0] as CanvasCaptureMediaStreamTrack;
    }
    output = new MediaStream([...captured.getVideoTracks(), ...source.getAudioTracks()]);
    const draw = (frame: VideoFrame) => {
      try {
        if (disposed || !frame.displayWidth || !frame.displayHeight) return;
        const w = frame.displayWidth * region.width,
          h = frame.displayHeight * region.height;
        const dest = containRect(w, h, size.width, size.height);
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, size.width, size.height);
        ctx.drawImage(
          frame,
          region.x * frame.displayWidth,
          region.y * frame.displayHeight,
          w,
          h,
          dest.x,
          dest.y,
          dest.width,
          dest.height,
        );
        if (typeof track.requestFrame === 'function') track.requestFrame();
      } finally {
        frame.close();
      }
    };
    pendingFrame = undefined;
    draw(first.value);
    void (async () => {
      while (!disposed) {
        const next = await reader.read();
        if (next.done) break;
        draw(next.value);
      }
    })().catch(() => {
      if (!disposed) {
        onError?.('녹화 영상 프레임 처리에 실패했습니다.');
        dispose();
      }
    });
    return { stream: output, ...size, dispose };
  } catch (error) {
    clearTimeout(timeout);
    dispose();
    throw error;
  }
}
