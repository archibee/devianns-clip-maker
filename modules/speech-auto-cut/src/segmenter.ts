import type { Options, Range } from './contracts';
import { union } from './cut-plan';

export class Segmenter {
  private start: number | undefined;
  private pending: number | undefined;
  readonly speech: Range[] = [];
  constructor(private options: Options) {}
  feed(probability: number, timeUs: number) {
    if (probability >= this.options.positive && this.start === undefined) this.start = timeUs;
    if (this.start === undefined) return;
    if (probability >= this.options.negative) this.pending = undefined;
    else {
      this.pending ??= timeUs;
      if (timeUs - this.pending >= this.options.silenceMs * 1000) this.close(this.pending);
    }
  }
  private close(endUs: number) {
    if (
      this.start !== undefined &&
      endUs > this.start &&
      endUs - this.start >= this.options.minSpeechMs * 1000
    )
      this.speech.push({ startUs: this.start, endUs });
    this.start = undefined;
    this.pending = undefined;
  }
  finish(endUs: number) {
    if (this.start !== undefined) this.close(this.pending ?? endUs);
  }
}
export function paddedKeep(
  speech: Range[],
  startUs: number,
  endUs: number,
  options: Options,
  fps: number,
) {
  const step = 1_000_000 / fps;
  const expanded = union(
    speech
      .map((r) => ({
        startUs: Math.max(startUs, Math.floor((r.startUs - options.beforeMs * 1000) / step) * step),
        endUs: Math.min(endUs, Math.ceil((r.endUs + options.afterMs * 1000) / step) * step),
      }))
      .map((r) => ({ startUs: Math.round(r.startUs), endUs: Math.round(r.endUs) }))
      .filter((r) => r.endUs > r.startUs),
  );
  const fill: Range[] = [];
  let cursor = startUs;
  for (const r of expanded) {
    if (r.startUs > cursor && r.startUs - cursor < options.minRemoveMs * 1000)
      fill.push({ startUs: cursor, endUs: r.startUs });
    cursor = r.endUs;
  }
  if (cursor < endUs && endUs - cursor < options.minRemoveMs * 1000)
    fill.push({ startUs: cursor, endUs });
  return union([...expanded, ...fill]);
}
