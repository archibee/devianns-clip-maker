import { containRect, recordingSize, type RecordRegion } from './geometry';
import { createTrackOutput, trackProcessorAvailable } from './track-output';
export type CaptureOutput = {
  stream: MediaStream;
  width: number;
  height: number;
  dispose: () => void;
};
export type OutputFactory = (
  source: MediaStream,
  region: RecordRegion,
  signal: AbortSignal,
  onError?: (message: string) => void,
) => Promise<CaptureOutput>;
/** Output dimensions never change. Each current source frame is cropped then contained without stretching. */
export const createCaptureOutput: OutputFactory = async (source, region, signal, onError) => {
  if (trackProcessorAvailable()) return createTrackOutput(source, region, signal, onError);
  const video = document.createElement('video');
  video.muted = true;
  video.playsInline = true;
  video.srcObject = source;
  let canvas: HTMLCanvasElement | undefined,
    stream: MediaStream | undefined,
    captured: MediaStream | undefined;
  let callback: number | undefined,
    timer: ReturnType<typeof setInterval> | undefined,
    disposed = false;
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    if (callback !== undefined) video.cancelVideoFrameCallback(callback);
    clearInterval(timer);
    captured?.getVideoTracks().forEach((t) => t.stop());
    video.pause();
    video.srcObject = null;
    if (canvas) {
      canvas.width = 0;
      canvas.height = 0;
    }
    signal.removeEventListener('abort', dispose);
  };
  try {
    signal.throwIfAborted();
    await new Promise<void>((resolve, reject) => {
      const ready = () => {
        if (video.readyState >= 2 && video.videoWidth > 0) {
          cleanup();
          resolve();
        }
      };
      const fail = () => {
        cleanup();
        reject(new Error('공유 영상 프레임을 준비하지 못했습니다.'));
      };
      const abort = () => {
        cleanup();
        reject(new DOMException('녹화를 취소했습니다.', 'AbortError'));
      };
      const timeout = setTimeout(fail, 10000);
      const cleanup = () => {
        clearTimeout(timeout);
        video.removeEventListener('loadeddata', ready);
        video.removeEventListener('error', fail);
        signal.removeEventListener('abort', abort);
      };
      video.addEventListener('loadeddata', ready);
      video.addEventListener('error', fail);
      signal.addEventListener('abort', abort, { once: true });
      void video.play().then(ready, fail);
      ready();
    });
    signal.throwIfAborted();
    const size = recordingSize(video.videoWidth, video.videoHeight, region);
    canvas = document.createElement('canvas');
    canvas.width = size.width;
    canvas.height = size.height;
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) throw new Error('녹화 캔버스를 만들 수 없습니다.');
    const frame = () => {
      if (disposed || video.readyState < 2 || !video.videoWidth || !video.videoHeight) return;
      const x = region.x * video.videoWidth,
        y = region.y * video.videoHeight;
      const w = Math.min(region.width * video.videoWidth, video.videoWidth - x),
        h = Math.min(region.height * video.videoHeight, video.videoHeight - y);
      const dest = containRect(w, h, size.width, size.height);
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, size.width, size.height);
      ctx.drawImage(video, x, y, w, h, dest.x, dest.y, dest.width, dest.height);
    };
    frame();
    captured = canvas.captureStream(30);
    stream = new MediaStream([...captured.getVideoTracks(), ...source.getAudioTracks()]);
    const safeFrame = () => {
      try {
        frame();
        return true;
      } catch {
        onError?.('녹화 영상 합성에 실패했습니다.');
        dispose();
        return false;
      }
    };
    if (typeof video.requestVideoFrameCallback === 'function') {
      const draw = () => {
        if (disposed) return;
        if (!safeFrame()) return;
        callback = video.requestVideoFrameCallback(draw);
      };
      callback = video.requestVideoFrameCallback(draw);
    } else {
      timer = setInterval(safeFrame, 1000 / 30);
    }
    signal.addEventListener('abort', dispose, { once: true });
    return { stream, ...size, dispose };
  } catch (error) {
    dispose();
    throw error;
  }
};
