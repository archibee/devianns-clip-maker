import { AudioSampleSink, type AudioSample } from 'mediabunny';
import { mediaLayout, duration, seconds, type Project } from '../project/model';
import type { OpenMedia } from '../media/input';

export const AUDIO_RATE = 48_000;
export const AUDIO_BLOCK = 4096;
type Pcm = { timestamp: number; rate: number; frames: number; channels: Float32Array[] };
function unpack(sample: AudioSample): Pcm {
  try {
    const channels = Array.from({ length: sample.numberOfChannels }, (_, i) => {
      const plane = new Float32Array(sample.numberOfFrames);
      sample.copyTo(plane, { planeIndex: i, format: 'f32-planar' });
      return plane;
    });
    return {
      timestamp: sample.timestamp,
      rate: sample.sampleRate,
      frames: sample.numberOfFrames,
      channels,
    };
  } finally {
    sample.close();
  }
}

/** 절대 원본 timestamp에서 샘플 위치를 계산해 블록 사이 리샘플링 위상을 유지한다. */
class PcmReader {
  private current?: Pcm;
  private next?: Pcm;
  private iterator: AsyncGenerator<AudioSample, void, unknown>;
  constructor(media: OpenMedia, start: number, end: number) {
    this.iterator = new AudioSampleSink(media.audio!).samples(start, end);
  }
  private async advance() {
    this.current = this.next;
    const result = await this.iterator.next();
    this.next = result.value ? unpack(result.value) : undefined;
  }
  async read(start: number, count: number) {
    const output = new Float32Array(count * 2);
    if (!this.current && !this.next) {
      await this.advance();
      await this.advance();
    }
    for (let i = 0; i < count; i++) {
      const time = start + i / AUDIO_RATE;
      while (this.next && this.next.timestamp <= time + 1e-8) await this.advance();
      const c = this.current;
      if (!c || time < c.timestamp || time >= c.timestamp + c.frames / c.rate + 1e-8) continue;
      const position = Math.max(0, (time - c.timestamp) * c.rate);
      const j = Math.min(c.frames - 1, Math.floor(position));
      const fraction = position - j;
      for (let channel = 0; channel < 2; channel++) {
        const data = c.channels[Math.min(channel, c.channels.length - 1)];
        const a = data[j];
        const neighborContinuous =
          this.next &&
          Math.abs(this.next.timestamp - (c.timestamp + c.frames / c.rate)) < 2 / c.rate;
        const b =
          j + 1 < c.frames
            ? data[j + 1]
            : neighborContinuous
              ? this.next!.channels[Math.min(channel, this.next!.channels.length - 1)][0]
              : a;
        output[channel * count + i] = Math.max(-1, Math.min(1, a + (b - a) * fraction));
      }
    }
    return output;
  }
  async close() {
    await this.iterator.return();
    this.current = undefined;
    this.next = undefined;
  }
}

export type AudioBlock = { timestamp: number; frames: number; data: Float32Array<ArrayBuffer> };
export async function* timelineAudio(
  project: Project,
  getMedia: (id: string) => Promise<OpenMedia>,
  fromUs = 0,
): AsyncGenerator<AudioBlock> {
  let cursor = Math.ceil(seconds(fromUs) * AUDIO_RATE);
  const silence = function* (until: number) {
    while (cursor < until) {
      const frames = Math.min(AUDIO_BLOCK, until - cursor);
      const block = { timestamp: cursor / AUDIO_RATE, frames, data: new Float32Array(frames * 2) };
      cursor += frames;
      yield block;
    }
  };
  for (const item of mediaLayout(project).sort((a, b) => a.startUs - b.startUs)) {
    if (item.endUs <= fromUs) continue;
    yield* silence(Math.max(cursor, Math.round(seconds(item.startUs) * AUDIO_RATE)));
    const media = await getMedia(item.clip.assetId);
    const first = Math.max(
      Math.round(seconds(item.startUs) * AUDIO_RATE),
      Math.ceil(seconds(fromUs) * AUDIO_RATE),
    );
    const end = Math.round(seconds(item.endUs) * AUDIO_RATE);
    const sourceAt = (sample: number) =>
      media.origin + seconds(item.clip.inUs) + sample / AUDIO_RATE - seconds(item.startUs);
    const reader = media.audio
      ? new PcmReader(media, sourceAt(first), media.origin + seconds(item.clip.outUs) + 0.05)
      : null;
    try {
      for (let offset = first; offset < end; offset += AUDIO_BLOCK) {
        const frames = Math.min(AUDIO_BLOCK, end - offset);
        yield {
          timestamp: offset / AUDIO_RATE,
          frames,
          data: reader ? await reader.read(sourceAt(offset), frames) : new Float32Array(frames * 2),
        };
        cursor = offset + frames;
      }
    } finally {
      await reader?.close();
    }
  }
  yield* silence(Math.round(seconds(duration(project)) * AUDIO_RATE));
}
