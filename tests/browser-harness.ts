// 브라우저 검증에서만 동적으로 읽는다. 제품 진입점에는 포함하지 않는다.
import {
  ALL_FORMATS,
  AudioSample,
  AudioSampleSink,
  AudioSampleSource,
  BlobSource,
  BufferTarget,
  CanvasSink,
  CanvasSource,
  Input,
  Mp4OutputFormat,
  Output,
  canEncodeAudio,
  canEncodeVideo,
  type VideoCodec,
} from 'mediabunny';
import { checkSupport } from '../src/export/settings';
import { ExportService, type ExportState } from '../src/export/service';
import { MediaRegistry } from '../src/media/registry';
import {
  defaultTransform,
  emptyProject,
  type Asset,
  type ExportSettings,
  type Project,
} from '../src/project/model';
import { PlaybackService } from '../src/playback/service';

export async function fixture({
  color = '#e54c42',
  rate = 48_000,
  audio = true,
  rotated = false,
  vfr = false,
  width = 640,
  height = 360,
} = {}) {
  const target = new BufferTarget();
  const output = new Output({ target, format: new Mp4OutputFormat({ fastStart: false }) });
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;
  const video = new CanvasSource(canvas, { codec: 'avc', bitrate: 1_500_000, keyFrameInterval: 1 });
  output.addVideoTrack(video, rotated ? { rotation: 90 } : {});
  const sound = audio ? new AudioSampleSource({ codec: 'aac', bitrate: 128_000 }) : null;
  if (sound) output.addAudioTrack(sound);
  await output.start();
  let audioIndex = 0;
  for (let i = 0; i < 60; i++) {
    const time = vfr ? i / 30 + (i % 2 ? 0.006 : 0) : i / 30;
    const next = i === 59 ? 2 : vfr ? (i + 1) / 30 + ((i + 1) % 2 ? 0.006 : 0) : (i + 1) / 30;
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, 640, 360);
    const flash = Math.floor(time * 2) % 2 === 0 && time % 1 < 0.1;
    ctx.fillStyle = flash ? '#ffffff' : '#101010';
    ctx.fillRect(0, 0, 80, 80);
    ctx.fillStyle = '#fff';
    ctx.font = '32px sans-serif';
    ctx.fillText(`FRAME ${String(i).padStart(2, '0')}  ${time.toFixed(3)}s`, 90, 120);
    await video.add(time, next - time);
    if (sound) {
      const end = Math.round(next * rate);
      const count = end - audioIndex;
      if (count > 0) {
        const data = new Float32Array(count);
        for (let j = 0; j < count; j++) {
          const t = (audioIndex + j) / rate;
          data[j] = t % 1 < 0.1 ? Math.sin(2 * Math.PI * 440 * t) * 0.4 : 0;
        }
        const sample = new AudioSample({
          data,
          format: 'f32-planar',
          numberOfChannels: 1,
          sampleRate: rate,
          timestamp: audioIndex / rate,
        });
        try {
          await sound.add(sample);
        } finally {
          sample.close();
        }
      }
      audioIndex = end;
    }
  }
  video.close();
  sound?.close();
  await output.finalize();
  return Array.from(new Uint8Array(target.buffer!));
}

export async function inspect(bytes: number[]) {
  const input = new Input({
    source: new BlobSource(new Blob([new Uint8Array(bytes)])),
    formats: ALL_FORMATS,
  });
  try {
    const video = await input.getPrimaryVideoTrack();
    const audio = await input.getPrimaryAudioTrack();
    const end = await input.computeDuration();
    if (!video) throw new Error('출력 영상 트랙 누락');
    const videoEnd = await video.computeDuration();
    const frames: { time: number; color: number[]; flash: number[] }[] = [];
    const sink = new CanvasSink(video, { width: 160, height: 90, fit: 'contain', poolSize: 1 });
    for (const time of [0.05, 0.35, 0.65, 1.05, 1.35, 1.65]) {
      if (time >= videoEnd) continue;
      const wrapped = await sink.getCanvas(time);
      if (wrapped) {
        const ctx = (wrapped.canvas as HTMLCanvasElement).getContext('2d')!;
        frames.push({
          time,
          color: Array.from(ctx.getImageData(120, 40, 1, 1).data),
          flash: Array.from(ctx.getImageData(5, 5, 1, 1).data),
        });
      }
    }
    const visualOnsets: number[] = [];
    let lit = false;
    for await (const frame of sink.canvases()) {
      const pixel = (frame.canvas as HTMLCanvasElement)
        .getContext('2d')!
        .getImageData(5, 5, 1, 1).data;
      const white = pixel[0] > 220 && pixel[1] > 220 && pixel[2] > 220;
      if (white && !lit) visualOnsets.push(frame.timestamp);
      lit = white;
    }
    const onset: number[] = [];
    let active = false;
    if (audio) {
      for await (const sample of new AudioSampleSink(audio).samples()) {
        try {
          const data = new Float32Array(sample.numberOfFrames);
          sample.copyTo(data, { planeIndex: 0, format: 'f32-planar' });
          for (let i = 0; i < data.length; i++) {
            if (Math.abs(data[i]) > 0.08 && !active) {
              onset.push(sample.timestamp + i / sample.sampleRate);
              active = true;
            }
            // 한 비프 내부의 영점 교차는 새 시작으로 세지 않는다.
            if (
              active &&
              Math.abs(data[i]) < 0.005 &&
              i + 128 < data.length &&
              data.subarray(i, i + 128).every((x) => Math.abs(x) < 0.005)
            )
              active = false;
          }
        } finally {
          sample.close();
        }
      }
    }
    const avErrorsMs = visualOnsets.map(
      (v) => Math.min(...onset.map((a) => Math.abs(a - v))) * 1000,
    );
    return {
      duration: end,
      videoEnd,
      width: await video.getDisplayWidth(),
      height: await video.getDisplayHeight(),
      videoCodec: await video.getCodec(),
      audioCodec: await audio?.getCodec(),
      onset,
      visualOnsets,
      avErrorsMs,
      frames,
      fps: (await video.computeFrameRateMetrics()).averageFrameRate,
    };
  } finally {
    input.dispose();
  }
}

export async function runExport(
  files: { bytes: number[]; name: string }[],
  settings: ExportSettings,
  customProject?: Project,
) {
  const registry = new MediaRegistry();
  try {
    const assets: Asset[] = [];
    for (const file of files)
      assets.push(
        await registry.add(
          new File([new Uint8Array(file.bytes)], file.name, { type: 'video/mp4', lastModified: 0 }),
        ),
      );
    const project: Project = customProject
      ? {
          ...customProject,
          assets,
          clips: customProject.clips.map((c, i) => {
            const remap = (id: string) =>
              assets[customProject.assets.findIndex((a) => a.id === id)]?.id ??
              assets[i % assets.length].id;
            return {
              ...c,
              assetId: remap(c.assetId),
              ...(c.parts
                ? { parts: c.parts.map((part) => ({ ...part, assetId: remap(part.assetId) })) }
                : {}),
            };
          }),
        }
      : {
          ...emptyProject(),
          assets,
          clips: assets.map((a, i) => ({
            id: `clip-${i}`,
            assetId: a.id,
            inUs: 0,
            outUs: a.durationUs,
            transform: defaultTransform(),
          })),
        };
    const support = await checkSupport(project, settings);
    if (!support.supported) return { supported: false as const, reason: support.reason };
    let actualService: ExportService | undefined;
    const result = await new Promise<ExportState>((resolve, reject) => {
      const timer = setTimeout(() => {
        actualService?.dispose();
        reject(new Error('출력 180초 제한 초과'));
      }, 180_000);
      actualService = new ExportService((state) => {
        if (state.status !== 'running' && state.status !== 'idle') {
          clearTimeout(timer);
          resolve(state);
        }
      });
      void actualService.start(project, settings, registry, false);
    });
    if (result.status !== 'completed' || !result.url) {
      actualService?.dispose();
      throw new Error(result.error ?? result.stage);
    }
    const bytes = Array.from(new Uint8Array(await (await fetch(result.url)).arrayBuffer()));
    const info = await inspect(bytes);
    actualService?.dispose();
    return { supported: true as const, info, bytes };
  } finally {
    registry.dispose();
  }
}

export async function stressExport(bytes: number[]) {
  const registry = new MediaRegistry();
  const states: string[] = [];
  const memory: number[] = [];
  const asset = await registry.add(
    new File([new Uint8Array(bytes)], 'stress.mp4', { type: 'video/mp4', lastModified: 0 }),
  );
  const project: Project = {
    ...emptyProject(),
    assets: [asset],
    clips: [
      {
        id: 'c',
        assetId: asset.id,
        inUs: 0,
        outUs: asset.durationUs,
        transform: defaultTransform(),
      },
    ],
  };
  const settings: ExportSettings = { resolution: 480, fps: 30, format: 'mp4' };
  let done: ((s: ExportState) => void) | undefined;
  const service = new ExportService((s) => {
    if (s.status !== 'running' && s.status !== 'idle') done?.(s);
  });
  const wait = () =>
    new Promise<ExportState>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('stress output timeout')), 30_000);
      done = (state) => {
        clearTimeout(timer);
        resolve(state);
      };
    });
  const descriptor = Object.getOwnPropertyDescriptor(window, 'showSaveFilePicker');
  try {
    const canceled = wait();
    await service.start(project, { ...settings, resolution: 1080, fps: 60 }, registry, false);
    service.cancel();
    states.push((await canceled).status);
    for (let i = 0; i < 3; i++) {
      const completed = wait();
      await service.start(project, settings, registry, false);
      const result = await completed;
      if (result.status !== 'completed') throw new Error(result.error ?? result.stage);
      states.push(result.status);
      service.dispose();
      const metrics = performance as unknown as { memory?: { usedJSHeapSize: number } };
      memory.push(metrics.memory?.usedJSHeapSize ?? 0);
    }
    // OPFS는 실제 clone 가능한 파일 핸들이다. 제품에서는 사용자 파일 선택기로 얻는다.
    const root = await navigator.storage.getDirectory();
    const handle = await root.getFileHandle('ssg-test-output.mp4', { create: true });
    Object.defineProperty(window, 'showSaveFilePicker', {
      configurable: true,
      value: async () => handle,
    });
    const diskDone = wait();
    await service.start(project, settings, registry, true);
    const disk = await diskDone;
    if (disk.status !== 'completed') throw new Error(disk.error ?? disk.stage);
    const saved = await handle.getFile();
    const diskInfo = await inspect(Array.from(new Uint8Array(await saved.arrayBuffer())));
    service.dispose();
    await root.removeEntry('ssg-test-output.mp4');
    Object.defineProperty(window, 'showSaveFilePicker', {
      configurable: true,
      value: async () => {
        throw new DOMException('테스트 저장 권한 거부', 'NotAllowedError');
      },
    });
    const denied = wait();
    await service.start(project, settings, registry, true);
    states.push((await denied).status);
    const missing = wait();
    await service.start(
      { ...project, clips: [{ ...project.clips[0], assetId: 'missing' }] },
      settings,
      registry,
      false,
    );
    states.push((await missing).status);
    return {
      states,
      memory,
      disk: { size: saved.size, videoEnd: diskInfo.videoEnd, audioCodec: diskInfo.audioCodec },
    };
  } finally {
    service.dispose();
    registry.dispose();
    if (descriptor) Object.defineProperty(window, 'showSaveFilePicker', descriptor);
    else delete (window as unknown as { showSaveFilePicker?: unknown }).showSaveFilePicker;
  }
}

export async function stressPlayback(files: { bytes: number[]; name: string }[]) {
  const registry = new MediaRegistry();
  const canvas = document.createElement('canvas');
  const failures: string[] = [];
  const playback = new PlaybackService(registry, (state) => {
    if (state.error) failures.push(state.error);
  });
  try {
    const assets: Asset[] = [];
    for (const file of files)
      assets.push(
        await registry.add(
          new File([new Uint8Array(file.bytes)], file.name, { type: 'video/mp4', lastModified: 0 }),
        ),
      );
    const project: Project = {
      ...emptyProject(),
      assets,
      clips: assets.map((a, i) => ({
        id: `c${i}`,
        assetId: a.id,
        inUs: 0,
        outUs: a.durationUs,
        transform: defaultTransform(),
      })),
    };
    playback.attach(canvas);
    playback.bind(project);
    for (let i = 0; i < 100; i++) {
      playback.seek((i % 7) * 500_000);
      if (i % 10 === 0) await new Promise((r) => setTimeout(r, 20));
    }
    playback.seek(3_200_000);
    await new Promise((r) => setTimeout(r, 1500));
    const pixel = Array.from(canvas.getContext('2d')!.getImageData(600, 200, 1, 1).data);
    return { requests: 101, pixel, failures, width: canvas.width, height: canvas.height };
  } finally {
    playback.dispose();
    registry.dispose();
  }
}

export async function capabilities() {
  const codecs: Record<string, boolean> = {};
  for (const video of ['avc', 'vp9', 'vp8'] as VideoCodec[])
    codecs[video] = await canEncodeVideo(video, { width: 1920, height: 1080, frameRate: 60 });
  codecs.aac = await canEncodeAudio('aac', { sampleRate: 48000, numberOfChannels: 2 });
  codecs.opus = await canEncodeAudio('opus', { sampleRate: 48000, numberOfChannels: 2 });
  return { userAgent: navigator.userAgent, codecs };
}

export async function silenceRms(bytes: number[], ranges: [number, number][]) {
  const input = new Input({
    source: new BlobSource(new Blob([new Uint8Array(bytes)])),
    formats: ALL_FORMATS,
  });
  try {
    const track = await input.getPrimaryAudioTrack();
    if (!track) throw new Error('오디오 트랙 누락');
    const sums = ranges.map(() => ({ sum: 0, count: 0 }));
    for await (const sample of new AudioSampleSink(track).samples()) {
      try {
        const plane = new Float32Array(sample.numberOfFrames);
        sample.copyTo(plane, { planeIndex: 0, format: 'f32-planar' });
        for (let i = 0; i < plane.length; i++) {
          const time = sample.timestamp + i / sample.sampleRate;
          ranges.forEach(([start, end], j) => {
            if (time >= start && time < end) {
              sums[j].sum += plane[i] ** 2;
              sums[j].count++;
            }
          });
        }
      } finally {
        sample.close();
      }
    }
    return sums.map((s) => (s.count ? Math.sqrt(s.sum / s.count) : -1));
  } finally {
    input.dispose();
  }
}

export async function comparePreview(
  bytes: number[],
  references: { time: number; pixels: number[] }[],
) {
  const input = new Input({
    source: new BlobSource(new Blob([new Uint8Array(bytes)])),
    formats: ALL_FORMATS,
  });
  try {
    const track = await input.getPrimaryVideoTrack();
    if (!track) throw new Error('비교 영상 트랙 누락');
    const sink = new CanvasSink(track, { width: 160, height: 90, fit: 'contain', poolSize: 1 });
    const differences = [];
    for (const reference of references) {
      const frame = await sink.getCanvas(reference.time);
      if (!frame) throw new Error('비교 프레임 누락');
      const pixels = (frame.canvas as HTMLCanvasElement)
        .getContext('2d')!
        .getImageData(0, 0, 160, 90).data;
      let error = 0;
      for (let i = 0; i < pixels.length; i++)
        if (i % 4 !== 3) error += Math.abs(pixels[i] - reference.pixels[i]);
      differences.push({ time: reference.time, meanRgbError: error / (160 * 90 * 3) });
    }
    return differences;
  } finally {
    input.dispose();
  }
}

export async function inspectRecordingRegion(bytes: number[], times: number[]) {
  const input = new Input({
    source: new BlobSource(new Blob([new Uint8Array(bytes)])),
    formats: ALL_FORMATS,
  });
  try {
    const video = await input.getPrimaryVideoTrack();
    if (!video) throw new Error('녹화 영상 누락');
    const sink = new CanvasSink(video, { poolSize: 1 });
    const samples = [];
    for (const time of times) {
      const sample = await sink.getCanvas(time);
      if (!sample) continue;
      const canvas = sample.canvas as HTMLCanvasElement,
        ctx = canvas.getContext('2d')!;
      const width = canvas.width,
        height = canvas.height,
        pixels = ctx.getImageData(0, 0, width, height).data;
      let left = width,
        right = -1,
        top = height,
        bottom = -1;
      for (let y = 0; y < height; y++)
        for (let x = 0; x < width; x++) {
          const offset = (y * width + x) * 4;
          if (pixels[offset] > 225 && pixels[offset + 1] > 225 && pixels[offset + 2] > 225) {
            left = Math.min(left, x);
            right = Math.max(right, x);
            top = Math.min(top, y);
            bottom = Math.max(bottom, y);
          }
        }
      samples.push({
        time,
        width,
        height,
        whiteBox: { width: right - left + 1, height: bottom - top + 1 },
        center: Array.from(
          ctx.getImageData(Math.floor(width * 0.15), Math.floor(height * 0.5), 1, 1).data,
        ),
        top: Array.from(
          ctx.getImageData(Math.floor(width * 0.5), Math.floor(height * 0.03), 1, 1).data,
        ),
      });
    }
    return samples;
  } finally {
    input.dispose();
  }
}
