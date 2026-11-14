import { AudioSampleSink, type AudioSample } from 'mediabunny';
import type { OpenMedia } from '../../../src/media/input';

type Pcm = { time: number; rate: number; frames: number; channels: Float32Array[] };
function unpack(sample: AudioSample): Pcm {
  try {
    return {
      time: sample.timestamp,
      rate: sample.sampleRate,
      frames: sample.numberOfFrames,
      channels: Array.from({ length: sample.numberOfChannels }, (_, i) => {
        const plane = new Float32Array(sample.numberOfFrames);
        sample.copyTo(plane, { planeIndex: i, format: 'f32-planar' });
        return plane;
      }),
    };
  } finally {
    sample.close();
  }
}
const RADIUS = 16,
  PHASES = 128;
const kernels = new Map<number, Float32Array[]>();
function kernel(rate: number) {
  let bank = kernels.get(rate);
  if (bank) return bank;
  const cutoff = Math.min(0.48, 7400 / rate);
  bank = Array.from({ length: PHASES }, (_, phase) => {
    const weights = new Float32Array(RADIUS * 2 + 1);
    let sum = 0;
    for (let k = -RADIUS; k <= RADIUS; k++) {
      const d = k - phase / PHASES;
      const angle = 2 * Math.PI * cutoff * d;
      const w =
        (angle === 0 ? 2 * cutoff : Math.sin(angle) / (Math.PI * d)) *
        (0.5 + 0.5 * Math.cos((Math.PI * d) / (RADIUS + 1)));
      weights[k + RADIUS] = w;
      sum += w;
    }
    for (let i = 0; i < weights.length; i++) weights[i] /= sum;
    return weights;
  });
  kernels.set(rate, bank);
  return bank;
}
/** 현재/이전/lookahead 샘플만 보관하며 절대 샘플 번호에서 16kHz 위치를 계산한다. */
export class Pcm16Reader {
  private iterator: AsyncGenerator<AudioSample, void, unknown>;
  private current?: Pcm;
  private previous?: Pcm;
  private next?: Pcm;
  constructor(
    media: OpenMedia,
    private start: number,
    private end: number,
  ) {
    this.iterator = new AudioSampleSink(media.audio!).samples(
      Math.max(0, start - 0.01),
      end + 0.01,
    );
  }
  private async advance() {
    this.previous = this.current;
    this.current = this.next;
    const next = await this.iterator.next();
    this.next = next.value ? unpack(next.value) : undefined;
  }
  private value(c: Pcm, channel: number, index: number) {
    if (index >= 0 && index < c.frames)
      return c.channels[Math.min(channel, c.channels.length - 1)][index];
    const neighbor = index < 0 ? this.previous : this.next;
    if (!neighbor || neighbor.rate !== c.rate) return 0;
    const time = c.time + index / c.rate;
    const n = Math.round((time - neighbor.time) * neighbor.rate);
    return n >= 0 && n < neighbor.frames
      ? neighbor.channels[Math.min(channel, neighbor.channels.length - 1)][n]
      : 0;
  }
  async *frames() {
    await this.advance();
    await this.advance();
    const total = Math.max(0, Math.ceil((this.end - this.start) * 16000));
    const countChannels = Math.min(
      2,
      this.current?.channels.length ?? this.next?.channels.length ?? 1,
    );
    for (let offset = 0; offset < total; offset += 512) {
      const count = Math.min(512, total - offset);
      const channels = Array.from({ length: countChannels }, () => new Float32Array(512));
      let missing = false;
      for (let i = 0; i < count; i++) {
        const time = this.start + (offset + i) / 16000;
        while (this.next && this.next.time <= time + 1e-9) await this.advance();
        const c = this.current;
        if (!c || time < c.time - 1e-8 || time >= c.time + c.frames / c.rate + 1e-8) {
          missing = true;
          continue;
        }
        const position = Math.max(0, (time - c.time) * c.rate),
          index = Math.floor(position);
        if (c.rate === 16000) {
          for (let ch = 0; ch < countChannels; ch++) channels[ch][i] = this.value(c, ch, index);
          continue;
        }
        const weights = kernel(c.rate)[
          Math.min(PHASES - 1, Math.floor((position - index) * PHASES))
        ];
        for (let ch = 0; ch < countChannels; ch++) {
          let sample = 0;
          for (let k = -RADIUS; k <= RADIUS; k++)
            sample += this.value(c, ch, index + k) * weights[k + RADIUS];
          channels[ch][i] = Math.max(-1, Math.min(1, sample));
        }
      }
      yield { channels, offset, count, missing };
    }
  }
  async close() {
    await this.iterator.return();
    this.current = this.previous = this.next = undefined;
  }
}
