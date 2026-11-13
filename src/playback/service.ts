import { timelineAudio, AUDIO_RATE } from '../audio/timeline-audio';
import { MediaRegistry } from '../media/registry';
import { duration, seconds, toUs, type Project } from '../project/model';
import { previewSize } from '../render/compositor';

export type PlaybackState = {
  timeUs: number;
  playing: boolean;
  buffering: boolean;
  error?: string;
};
export class PlaybackService {
  private project?: Project;
  private canvas?: HTMLCanvasElement;
  private worker?: Worker;
  private pending?: { project: Project; timeUs: number; generation: number };
  private busy = false;
  private generation = 0;
  private requestId = 0;
  private audio?: AudioContext;
  private sources = new Set<AudioBufferSourceNode>();
  private audioIterator?: ReturnType<typeof timelineAudio>;
  private audioToken = 0;
  private raf = 0;
  private wake?: () => void;
  private origin = 0;
  private bufferedEnd = 0;
  private state: PlaybackState = { timeUs: 0, playing: false, buffering: false };
  constructor(
    private registry: MediaRegistry,
    private onState: (state: PlaybackState) => void,
  ) {}
  attach(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    if (this.project) this.requestFrame(this.state.timeUs);
  }
  bind(project: Project) {
    this.pause();
    this.project = project;
    if (!duration(project)) this.suspendPreview();
    this.generation++;
    this.state = {
      ...this.state,
      error: undefined,
      timeUs: Math.min(this.state.timeUs, duration(project)),
    };
    this.onState(this.state);
    this.requestFrame(this.state.timeUs);
  }
  private notify(patch: Partial<PlaybackState>) {
    this.state = { ...this.state, ...patch };
    this.onState(this.state);
  }
  private ensureWorker() {
    if (this.worker) return;
    const worker = new Worker(new URL('../workers/preview.worker.ts', import.meta.url), {
      type: 'module',
    });
    this.worker = worker;
    worker.onmessage = (event) => {
      const data = event.data;
      this.busy = false;
      if (data.type === 'frame') {
        const bitmap = data.bitmap as ImageBitmap;
        if (data.generation === this.generation && this.canvas) {
          if (this.canvas.width !== bitmap.width || this.canvas.height !== bitmap.height) {
            this.canvas.width = bitmap.width;
            this.canvas.height = bitmap.height;
          }
          this.canvas.getContext('2d')?.drawImage(bitmap, 0, 0);
        }
        bitmap.close();
      } else if (data.generation === this.generation) {
        this.pause();
        this.notify({ error: data.message });
      }
      this.pumpFrame();
    };
    worker.onerror = (event) => {
      this.busy = false;
      this.pause();
      this.notify({ error: event.message });
      this.worker?.terminate();
      this.worker = undefined;
    };
  }
  private requestFrame(timeUs: number) {
    if (!this.project || !this.canvas) return;
    if (!duration(this.project)) {
      const size = previewSize(this.project.aspect);
      this.canvas.width = size.width;
      this.canvas.height = size.height;
      this.canvas.getContext('2d')?.clearRect(0, 0, size.width, size.height);
      return;
    }
    this.pending = { project: this.project, timeUs, generation: this.generation };
    this.pumpFrame();
  }
  private pumpFrame() {
    if (this.busy || !this.pending) return;
    this.ensureWorker();
    this.busy = true;
    const job = this.pending;
    this.pending = undefined;
    this.worker!.postMessage({
      type: 'frame',
      requestId: ++this.requestId,
      ...job,
      files: this.registry.files(),
    });
  }
  seek(timeUs: number) {
    this.pause();
    this.generation++;
    const end = this.project ? duration(this.project) : 0;
    this.notify({ timeUs: Math.round(Math.max(0, Math.min(end, timeUs))), error: undefined });
    this.requestFrame(this.state.timeUs);
  }
  async play() {
    const project = this.project;
    if (!project || !duration(project) || this.state.playing) return;
    if (project.clips.some((c) => !this.registry.has(c.assetId))) {
      this.notify({ error: '누락된 원본을 먼저 다시 연결하세요.' });
      return;
    }
    if (this.state.timeUs >= duration(project)) this.seek(0);
    const token = ++this.audioToken;
    try {
      this.audio ??= new AudioContext({ sampleRate: AUDIO_RATE });
      await this.audio.resume();
      if (token !== this.audioToken) return;
      this.generation++;
      this.origin = this.audio.currentTime + 0.15 - seconds(this.state.timeUs);
      this.bufferedEnd = seconds(this.state.timeUs);
      this.notify({ playing: true, buffering: true, error: undefined });
      const iterator = timelineAudio(
        project,
        async (id) => {
          const entry = this.registry.get(id);
          if (!entry) throw new Error('원본 파일 누락');
          return entry.media;
        },
        this.state.timeUs,
      );
      this.audioIterator = iterator;
      void this.schedule(iterator, token);
      const tick = () => {
        if (token !== this.audioToken || !this.state.playing) return;
        const clock = this.audio!.currentTime - this.origin;
        const time = Math.max(
          seconds(this.state.timeUs),
          Math.min(clock, this.bufferedEnd, seconds(duration(project))),
        );
        this.notify({ timeUs: toUs(time), buffering: clock > this.bufferedEnd + 0.005 });
        this.requestFrame(this.state.timeUs);
        if (this.state.timeUs >= duration(project) - 20) {
          this.pause();
          this.notify({ timeUs: duration(project) });
        } else this.raf = requestAnimationFrame(tick);
      };
      this.raf = requestAnimationFrame(tick);
    } catch (error) {
      this.pause();
      this.notify({ error: error instanceof Error ? error.message : String(error) });
    }
  }
  private async schedule(iterator: ReturnType<typeof timelineAudio>, token: number) {
    try {
      for await (const block of iterator) {
        if (token !== this.audioToken) break;
        while (this.origin + block.timestamp > this.audio!.currentTime + 0.7) {
          await new Promise<void>((resolve) => {
            const timer = setTimeout(resolve, 20);
            this.wake = () => {
              clearTimeout(timer);
              resolve();
            };
          });
          this.wake = undefined;
          if (token !== this.audioToken) return;
        }
        const ctx = this.audio!;
        if (this.origin + block.timestamp < ctx.currentTime + 0.01)
          this.origin = ctx.currentTime + 0.06 - block.timestamp;
        const buffer = ctx.createBuffer(2, block.frames, AUDIO_RATE);
        buffer.copyToChannel(block.data.subarray(0, block.frames), 0);
        buffer.copyToChannel(block.data.subarray(block.frames), 1);
        const source = ctx.createBufferSource();
        source.buffer = buffer;
        source.connect(ctx.destination);
        this.sources.add(source);
        source.onended = () => {
          source.disconnect();
          this.sources.delete(source);
        };
        source.start(this.origin + block.timestamp);
        this.bufferedEnd = block.timestamp + block.frames / AUDIO_RATE;
      }
    } catch (error) {
      if (token === this.audioToken) {
        this.pause();
        this.notify({ error: error instanceof Error ? error.message : String(error) });
      }
    }
  }
  pause() {
    this.audioToken++;
    cancelAnimationFrame(this.raf);
    this.wake?.();
    this.wake = undefined;
    for (const source of this.sources) {
      source.onended = null;
      try {
        source.stop();
      } catch {
        /* 이미 종료됨 */
      }
      source.disconnect();
    }
    this.sources.clear();
    const iterator = this.audioIterator;
    this.audioIterator = undefined;
    if (iterator) void iterator.return(undefined).catch(() => {});
    if (this.state.playing || this.state.buffering)
      this.notify({ playing: false, buffering: false });
  }
  suspendPreview() {
    this.pause();
    this.pending = undefined;
    this.worker?.terminate();
    this.worker = undefined;
    this.busy = false;
    this.generation++;
  }
  refresh() {
    this.generation++;
    this.requestFrame(this.state.timeUs);
  }
  dispose() {
    this.suspendPreview();
    void this.audio?.close();
    this.audio = undefined;
  }
}
