import { CanvasSink, type WrappedCanvas } from 'mediabunny';
import type { OpenMedia } from './input';

/** 한 프레임과 lookahead만 보유한다. pooled canvas는 draw 전에 다음 호출로 넘기지 않는다. */
export class VideoReader {
  private iterator?: AsyncGenerator<WrappedCanvas, void, unknown>;
  private current?: WrappedCanvas;
  private next?: WrappedCanvas;
  private last = -Infinity;
  private sink: CanvasSink;
  constructor(
    private media: OpenMedia,
    preview = false,
  ) {
    this.sink = new CanvasSink(media.video, {
      poolSize: 3,
      ...(preview
        ? {
            width: Math.max(
              1,
              Math.round(
                media.asset.width * Math.min(1, 960 / media.asset.width, 960 / media.asset.height),
              ),
            ),
          }
        : {}),
    });
  }
  async at(sourceSeconds: number) {
    const absolute = this.media.origin + sourceSeconds;
    if (!this.iterator || absolute < this.last || absolute - this.last > 2) {
      await this.close();
      this.iterator = this.sink.canvases(absolute);
      this.current = (await this.iterator.next()).value || undefined;
      this.next = (await this.iterator.next()).value || undefined;
    }
    this.last = absolute;
    while (this.next && this.next.timestamp <= absolute + 0.000001) {
      this.current = this.next;
      this.next = (await this.iterator.next()).value || undefined;
    }
    if (!this.current) throw new Error('요청한 영상 프레임을 읽지 못했습니다.');
    return this.current.canvas;
  }
  async close() {
    const iterator = this.iterator;
    this.iterator = undefined;
    this.current = undefined;
    this.next = undefined;
    this.last = -Infinity;
    if (iterator) await iterator.return();
  }
}
