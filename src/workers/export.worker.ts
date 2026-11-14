import {
  AudioSample,
  AudioSampleSource,
  BufferTarget,
  CanvasSource,
  Mp4OutputFormat,
  Output,
  StreamTarget,
  WebMOutputFormat,
  type Target,
} from 'mediabunny';
import { timelineAudio } from '../audio/timeline-audio';
import { openMedia, type OpenMedia } from '../media/input';
import { VideoReader } from '../media/video-reader';
import {
  defaultTransform,
  cueErrors,
  dimensions,
  duration,
  frameTime,
  resolveAll,
  clipLane,
  cueLane,
  laneCount,
  seconds,
  type ExportSettings,
  type Project,
} from '../project/model';
import { parseProject } from '../project/validation';
import { renderFrame } from '../render/compositor';
import { loadFont, loadProvidedFonts } from '../render/font';
import {
  checkSupport,
  estimateBytes,
  hasAudio,
  MEMORY_LIMIT,
  videoBitrate,
} from '../export/settings';

type Start = {
  type: 'start';
  requestId: number;
  project: Project;
  settings: ExportSettings;
  fonts?: import('../render/local-fonts').LocalFontPayload[];
  files: { id: string; file: File }[];
  handle?: FileSystemFileHandle;
};
let cancelled = false;
let running = false;
self.onmessage = (event: MessageEvent<Start | { type: 'cancel' }>) => {
  if (event.data.type === 'cancel') {
    cancelled = true;
    return;
  }
  if (running) return;
  running = true;
  void run(event.data).finally(() => {
    running = false;
  });
};
async function run(job: Start) {
  const inputs = new Map<string, OpenMedia>();
  const readers = new Map<string, VideoReader>();
  let audioIterator: ReturnType<typeof timelineAudio> | undefined;
  let output: Output | undefined;
  let disk: FileSystemWritableFileStream | undefined;
  let diskClosed = false;
  let finalizeRequested = false;
  const send = (type: string, payload: object = {}, transfer: Transferable[] = []) =>
    self.postMessage({ type, requestId: job.requestId, ...payload }, { transfer });
  const check = () => {
    if (cancelled) throw new DOMException('내보내기를 취소했습니다.', 'AbortError');
  };
  try {
    cancelled = false;
    const project = parseProject(JSON.stringify(job.project));
    const issues = cueErrors(project);
    if (!duration(project) || issues.length)
      throw new Error(issues[0] ?? '타임라인에 클립을 추가하세요.');
    const support = await checkSupport(project, job.settings);
    if (!support.supported) throw new Error(support.reason);
    if (!job.handle && estimateBytes(project, job.settings) > MEMORY_LIMIT)
      throw new Error(
        '메모리 출력 한도(256MiB)를 초과합니다. 파일에 직접 저장하거나 길이/해상도를 낮추세요.',
      );
    await loadFont();
    await loadProvidedFonts(job.project, job.fonts ?? []);
    check();
    let target: Target;
    let memory: BufferTarget | undefined;
    if (job.handle) {
      disk = await job.handle.createWritable();
      target = new StreamTarget(
        new WritableStream({
          async write(chunk) {
            check();
            await disk!.write({ type: 'write', position: chunk.position, data: chunk.data });
          },
          async close() {
            if (finalizeRequested && !cancelled) await disk!.close();
            else await disk!.abort();
            diskClosed = true;
          },
        }),
        { chunked: true, chunkSize: 1_048_576 },
      );
    } else {
      memory = new BufferTarget();
      target = memory;
      target.on('write', ({ end }) => {
        if (end > MEMORY_LIMIT) throw new Error('실제 출력 크기가 메모리 한도를 초과했습니다.');
      });
    }
    output = new Output({
      target,
      format:
        job.settings.format === 'mp4'
          ? new Mp4OutputFormat({ fastStart: false })
          : new WebMOutputFormat(),
    });
    const size = dimensions(project.aspect, job.settings.resolution);
    const canvas = new OffscreenCanvas(size.width, size.height);
    const context = canvas.getContext('2d');
    if (!context) throw new Error('출력 캔버스를 만들 수 없습니다.');
    const videoSource = new CanvasSource(canvas, {
      codec: support.videoCodec!,
      bitrate: videoBitrate(job.settings),
      keyFrameInterval: 2,
    });
    output.addVideoTrack(videoSource, { frameRate: job.settings.fps });
    const audioSource = hasAudio(project)
      ? new AudioSampleSource({ codec: support.audioCodec!, bitrate: 128_000 })
      : null;
    if (audioSource) output.addAudioTrack(audioSource);
    const getMedia = async (id: string) => {
      if (inputs.has(id)) return inputs.get(id)!;
      const file = job.files.find((f) => f.id === id)?.file;
      if (!file) throw new Error('원본 파일이 연결되지 않았습니다.');
      const media = await openMedia(file, id);
      inputs.set(id, media);
      return media;
    };
    await output.start();
    check();
    const endUs = duration(project);
    const totalFrames = Math.ceil((endUs * job.settings.fps) / 1_000_000);
    audioIterator = audioSource ? timelineAudio(project, getMedia) : undefined;
    let audioBlock = audioIterator ? await audioIterator.next() : undefined;
    let lastReport = 0;
    for (let n = 0; n < totalFrames; n++) {
      check();
      const timeUs = frameTime(n, job.settings.fps);
      const nextUs = Math.min(endUs, frameTime(n + 1, job.settings.fps));
      const items = resolveAll(project, timeUs);
      const active = new Set(items.map((i) => i.sourceKey));
      for (const [key, reader] of readers)
        if (!active.has(key)) {
          await reader.close();
          readers.delete(key);
        }
      renderFrame(context, null, 0, 0, defaultTransform(), [], timeUs);
      for (let lane = 0; lane < laneCount(project); lane++) {
        const item = items.find((i) => clipLane(i.clip) === lane);
        let image: Awaited<ReturnType<VideoReader['at']>> | undefined;
        if (item) {
          let reader = readers.get(item.sourceKey);
          if (!reader) {
            reader = new VideoReader(await getMedia(item.clip.assetId));
            readers.set(item.sourceKey, reader);
          }
          image = await reader.at(seconds(item.sourceUs));
        }
        renderFrame(
          context,
          image ?? null,
          image?.width ?? 0,
          image?.height ?? 0,
          item?.clip.transform ?? defaultTransform(),
          project.subtitles.filter((c) => cueLane(c) === lane),
          timeUs,
          false,
        );
      }
      await videoSource.add(seconds(timeUs), seconds(nextUs - timeUs));
      while (
        audioSource &&
        audioBlock &&
        !audioBlock.done &&
        audioBlock.value.timestamp < seconds(nextUs)
      ) {
        check();
        const block = audioBlock.value;
        const sample = new AudioSample({
          data: block.data,
          format: 'f32-planar',
          numberOfChannels: 2,
          sampleRate: 48_000,
          timestamp: block.timestamp,
        });
        try {
          await audioSource.add(sample);
        } finally {
          sample.close();
        }
        audioBlock = await audioIterator!.next();
      }
      if (performance.now() - lastReport > 100 || n === totalFrames - 1) {
        send('progress', { progress: ((n + 1) / totalFrames) * 0.97, stage: '영상·오디오 렌더링' });
        lastReport = performance.now();
      }
    }
    check();
    videoSource.close();
    audioSource?.close();
    send('progress', { progress: 0.98, stage: '파일 마무리' });
    finalizeRequested = true;
    await output.finalize();
    check();
    const buffer = memory?.buffer;
    send('completed', { buffer, savedToDisk: !!job.handle }, buffer ? [buffer] : []);
  } catch (error) {
    try {
      await output?.cancel();
    } catch {
      /* 원래 오류 유지 */
    }
    if (disk && !diskClosed) {
      try {
        await disk.abort();
      } catch {
        /* 파일 시스템 오류 */
      }
    }
    send(
      cancelled || (error instanceof DOMException && error.name === 'AbortError')
        ? 'cancelled'
        : 'error',
      { message: error instanceof Error ? error.message : String(error) },
    );
  } finally {
    await audioIterator?.return(undefined);
    for (const reader of readers.values()) await reader.close();
    for (const media of inputs.values()) media.input.dispose();
  }
}
