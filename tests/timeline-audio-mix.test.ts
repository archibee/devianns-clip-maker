import { expect, it, vi } from 'vitest';
import { timelineAudio } from '../src/audio/timeline-audio';
import { emptyProject, defaultTransform, type Project } from '../src/project/model';
import type { OpenMedia } from '../src/media/input';
const closed = vi.hoisted(() => vi.fn());
vi.mock('mediabunny', () => ({
  AudioSampleSink: class {
    async *samples() {
      try {
        yield {
          numberOfChannels: 1,
          numberOfFrames: 4800,
          sampleRate: 48000,
          timestamp: 0,
          copyTo: (target: Float32Array) => target.fill(0.75),
          close: vi.fn(),
        };
      } finally {
        closed();
      }
    }
  },
}));
it('겹치는 영상 오디오를 시간순 블록으로 합산하고 클리핑하며 자막 이후는 무음이다', async () => {
  const p: Project = {
    ...emptyProject(),
    laneCount: 3,
    clips: [0, 1].map((lane) => ({
      id: `v${lane}`,
      lane,
      assetId: 'asset',
      startUs: lane * 50_000,
      inUs: 0,
      outUs: 100_000,
      transform: defaultTransform(),
    })),
    subtitles: [
      {
        id: 's',
        lane: 2,
        startUs: 0,
        endUs: 200_000,
        text: '',
        size: 0.05,
        color: '#ffffff',
        background: '#000000',
        x: 0.5,
        y: 0.9,
      },
    ],
  };
  const left: number[] = [],
    times: number[] = [];
  for await (const block of timelineAudio(p, async () => ({ origin: 0, audio: {} }) as OpenMedia)) {
    times.push(block.timestamp);
    left.push(...block.data.slice(0, block.frames));
  }
  expect(left).toHaveLength(9600);
  expect(left[0]).toBe(0.75);
  expect(left[2400]).toBe(1);
  expect(left[5000]).toBe(0.75);
  expect(left[8000]).toBe(0);
  expect(times).toEqual([...times].sort((a, b) => a - b));
  expect(closed).toHaveBeenCalledTimes(2);
});
