import { openMedia, type OpenMedia } from '../media/input';
import { VideoReader } from '../media/video-reader';
import {
  duration,
  resolveAll,
  clipLane,
  cueLane,
  laneCount,
  seconds,
  defaultTransform,
  type Project,
} from '../project/model';
import { previewSize, renderFrame } from '../render/compositor';
import { loadFont, loadProvidedFonts } from '../render/font';

type FrameRequest = {
  type: 'frame';
  requestId: number;
  generation: number;
  project: Project;
  timeUs: number;
  fonts?: import('../render/local-fonts').LocalFontPayload[];
  files: { id: string; file: File }[];
};
const readers = new Map<string, { media: OpenMedia; reader: VideoReader }>();
let canvas: OffscreenCanvas | undefined;
self.onmessage = async (event: MessageEvent<FrameRequest>) => {
  const job = event.data;
  try {
    await loadFont();
    await loadProvidedFonts(job.project, job.fonts ?? []);
    const size = previewSize(job.project.aspect);
    if (!canvas || canvas.width !== size.width || canvas.height !== size.height)
      canvas = new OffscreenCanvas(size.width, size.height);
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('미리보기 캔버스를 사용할 수 없습니다.');
    const time = Math.min(job.timeUs, Math.max(0, duration(job.project) - 1));
    const items = job.timeUs > duration(job.project) ? [] : resolveAll(job.project, time);
    const active = new Set(items.map((i) => i.sourceKey));
    for (const [key, entry] of readers)
      if (!active.has(key)) {
        await entry.reader.close();
        entry.media.input.dispose();
        readers.delete(key);
      }
    renderFrame(ctx, null, 0, 0, defaultTransform(), [], job.timeUs);
    for (let lane = 0; lane < laneCount(job.project); lane++) {
      const item = items.find((i) => clipLane(i.clip) === lane);
      let image: Awaited<ReturnType<VideoReader['at']>> | undefined;
      if (item) {
        let entry = readers.get(item.sourceKey);
        if (!entry) {
          const file = job.files.find((f) => f.id === item.clip.assetId)?.file;
          if (!file) throw new Error('원본 파일을 다시 연결하세요.');
          const media = await openMedia(file, item.clip.assetId);
          entry = { media, reader: new VideoReader(media, true) };
          readers.set(item.sourceKey, entry);
        }
        image = await entry.reader.at(seconds(item.sourceUs));
      }
      renderFrame(
        ctx,
        image ?? null,
        image?.width ?? 0,
        image?.height ?? 0,
        item?.clip.transform ?? defaultTransform(),
        job.project.subtitles.filter((c) => cueLane(c) === lane),
        job.timeUs,
        false,
      );
    }
    const bitmap = canvas.transferToImageBitmap();
    self.postMessage(
      { type: 'frame', requestId: job.requestId, generation: job.generation, bitmap },
      { transfer: [bitmap] },
    );
  } catch (error) {
    for (const entry of readers.values()) {
      try {
        await entry.reader.close();
      } finally {
        entry.media.input.dispose();
      }
    }
    readers.clear();
    self.postMessage({
      type: 'error',
      requestId: job.requestId,
      generation: job.generation,
      message: error instanceof Error ? error.message : String(error),
    });
  }
};
