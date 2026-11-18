import { AudioSampleSink } from 'mediabunny';
import { openMedia } from '../../../src/media/input';
import type { Project } from '../../../src/project/model';
import { visualizerScope } from './plan';
import { MAX_VISUALIZER_VALUES } from './types';
import { spectrum } from './spectrum';
self.onmessage = async (
  event: MessageEvent<{ project: Project; lane: number; files: { id: string; file: File }[] }>,
) => {
  try {
    const { project, lane, files } = event.data,
      rows = visualizerScope(project, lane);
    if (!rows.length) throw new Error('분석할 소리가 없습니다.');
    const startUs = Math.min(...rows.map((r) => r.startUs)),
      endUs = Math.max(...rows.map((r) => r.endUs));
    const bands = 32,
      stepUs = Math.max(
        50_000,
        Math.ceil((endUs - startUs) / Math.floor(MAX_VISUALIZER_VALUES / bands)),
      );
    const values = new Uint8Array(Math.ceil((endUs - startUs) / stepUs) * bands);
    let decoded = 0;
    for (let rowIndex = 0; rowIndex < rows.length; rowIndex++) {
      const row = rows[rowIndex],
        file = files.find((f) => f.id === row.clip.assetId)?.file;
      if (!file) throw new Error('분석할 원본 파일이 없습니다.');
      const media = await openMedia(file, row.clip.assetId);
      try {
        if (!media.audio) throw new Error('오디오 트랙을 읽을 수 없습니다.');
        const from = media.origin + row.clip.inUs / 1_000_000,
          to = media.origin + row.clip.outUs / 1_000_000;
        const sink = new AudioSampleSink(media.audio);
        let lastProgress = 0;
        for await (const sample of sink.samples(from, to)) {
          try {
            const timestamp = sample.timestamp,
              rate = sample.sampleRate,
              count = sample.numberOfFrames;
            const planes = Array.from({ length: sample.numberOfChannels }, (_, channel) => {
              const plane = new Float32Array(count);
              sample.copyTo(plane, { planeIndex: channel, format: 'f32-planar' });
              return plane;
            });
            // Fixed small windows; source timestamps retain gaps and trimmed source offsets.
            for (let offset = 0; offset < count; offset += 1024) {
              const sourceTime = timestamp + offset / rate;
              if (sourceTime < from || sourceTime >= to) continue;
              const targetUs = row.startUs + (sourceTime - from) * 1_000_000;
              const index = Math.floor((targetUs - startUs) / stepUs);
              if (index < 0 || index >= values.length / bands) continue;
              const bars = spectrum(
                planes.map((plane) => plane.subarray(offset, offset + 1024)),
                rate,
                bands,
              );
              for (let b = 0; b < bands; b++)
                values[index * bands + b] = Math.max(values[index * bands + b], bars[b]);
              decoded++;
            }
            if (performance.now() - lastProgress > 100) {
              self.postMessage({
                type: 'progress',
                value:
                  (rowIndex + Math.max(0, Math.min(1, (timestamp - from) / (to - from)))) /
                  rows.length,
              });
              lastProgress = performance.now();
            }
          } finally {
            sample.close();
          }
        }
      } finally {
        media.input.dispose();
      }
    }
    if (!decoded) throw new Error('디코딩된 오디오가 없습니다. 원본과 코덱을 확인하세요.');
    self.postMessage({ type: 'done', startUs, endUs, stepUs, values: Array.from(values) });
  } catch (error) {
    self.postMessage({
      type: 'error',
      message: error instanceof Error ? error.message : String(error),
    });
  }
};
