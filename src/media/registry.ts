import { CanvasSink } from 'mediabunny';
import { openMedia, type OpenMedia } from './input';
import type { Asset } from '../project/model';

export class MediaRegistry {
  private entries = new Map<string, { file: File; media: OpenMedia; thumbnail?: string }>();
  async add(file: File, reconnect?: Asset): Promise<Asset> {
    const media = await openMedia(file, reconnect?.id);
    if (
      reconnect &&
      (reconnect.size !== file.size ||
        reconnect.name !== file.name ||
        reconnect.lastModified !== file.lastModified ||
        Math.abs(reconnect.durationUs - media.asset.durationUs) > 1000 ||
        reconnect.width !== media.asset.width ||
        reconnect.height !== media.asset.height ||
        reconnect.hasAudio !== media.asset.hasAudio)
    ) {
      media.input.dispose();
      throw new Error('원본 정보가 일치하지 않습니다. 저장한 프로젝트와 같은 파일을 선택하세요.');
    }
    let thumbnail: string | undefined;
    try {
      const frame = await new CanvasSink(media.video, {
        width: 240,
        height: 135,
        fit: 'contain',
        poolSize: 1,
      }).getCanvas(media.origin);
      if (frame && frame.canvas instanceof HTMLCanvasElement && this.entries.size < 200) {
        const blob = await new Promise<Blob | null>((r) =>
          (frame.canvas as HTMLCanvasElement).toBlob(r, 'image/jpeg', 0.65),
        );
        if (blob) thumbnail = URL.createObjectURL(blob);
      }
    } catch {
      /* 썸네일 생성 실패는 원본 접근을 막지 않는다. */
    }
    this.remove(media.asset.id);
    this.entries.set(media.asset.id, { file, media, thumbnail });
    return media.asset;
  }
  has(id: string) {
    return this.entries.has(id);
  }
  get(id: string) {
    return this.entries.get(id);
  }
  files() {
    return [...this.entries].map(([id, x]) => ({ id, file: x.file }));
  }
  remove(id: string) {
    const entry = this.entries.get(id);
    if (entry) {
      entry.media.input.dispose();
      if (entry.thumbnail) URL.revokeObjectURL(entry.thumbnail);
    }
    this.entries.delete(id);
  }
  dispose() {
    for (const id of this.entries.keys()) this.remove(id);
  }
  retain(ids: Set<string>) {
    for (const id of this.entries.keys()) if (!ids.has(id)) this.remove(id);
  }
}
