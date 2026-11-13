import { openMedia, type OpenMedia } from '../media/input';
import { VideoReader } from '../media/video-reader';
import { duration, resolve, seconds, type Project } from '../project/model';
import { previewSize, renderFrame } from '../render/compositor';
import { loadFont } from '../render/font';

type FrameRequest = {
  type: 'frame';
  requestId: number;
  generation: number;
  project: Project;
  timeUs: number;
  files: { id: string; file: File }[];
};
let media: OpenMedia | undefined;
let reader: VideoReader | undefined;
let currentId: string | undefined;
let canvas: OffscreenCanvas | undefined;
self.onmessage = async (event: MessageEvent<FrameRequest>) => {
  const job = event.data;
  try {
    await loadFont();
    const size = previewSize(job.project.aspect);
    if (!canvas || canvas.width !== size.width || canvas.height !== size.height)
      canvas = new OffscreenCanvas(size.width, size.height);
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('미리보기 캔버스를 사용할 수 없습니다.');
    const item = resolve(job.project, Math.min(job.timeUs, Math.max(0, duration(job.project) - 1)));
    if (item) {
      if (currentId !== item.clip.assetId) {
        await reader?.close();
        media?.input.dispose();
        currentId = undefined;
        const file = job.files.find((f) => f.id === item.clip.assetId)?.file;
        if (!file) throw new Error('원본을 다시 연결하면 미리보기를 재개할 수 있습니다.');
        media = await openMedia(file, item.clip.assetId);
        reader = new VideoReader(media, true);
        currentId = item.clip.assetId;
      }
      const image = await reader!.at(seconds(item.sourceUs));
      renderFrame(
        ctx,
        image,
        image.width,
        image.height,
        item.clip.transform,
        job.project.subtitles,
        job.timeUs,
      );
    } else ctx.clearRect(0, 0, canvas.width, canvas.height);
    const bitmap = canvas.transferToImageBitmap();
    self.postMessage(
      { type: 'frame', requestId: job.requestId, generation: job.generation, bitmap },
      { transfer: [bitmap] },
    );
  } catch (error) {
    self.postMessage({
      type: 'error',
      requestId: job.requestId,
      generation: job.generation,
      message: error instanceof Error ? error.message : String(error),
    });
  }
};
