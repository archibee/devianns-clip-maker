import type * as Ort from 'onnxruntime-web';
import { openMedia, type OpenMedia } from '../../../src/media/input';
import { mediaLayout, seconds } from '../../../src/project/model';
import { optionsError, type Request, type Response, type Range } from './contracts';
import { union } from './cut-plan';
import { Pcm16Reader } from './pcm-reader';
import { paddedKeep, Segmenter } from './segmenter';

const HASH = '1a153a22f4509e292a94e67d6f9b85e8deb25b4988682b7e174c65279d8788e3';
const send = (message: Response) => self.postMessage(message);
let running = false;
self.onmessage = async (event: MessageEvent<Request>) => {
  if (running) return;
  running = true;
  let session: Ort.InferenceSession | undefined,
    media: OpenMedia | undefined,
    reader: Pcm16Reader | undefined;
  try {
    const job = event.data,
      issue = optionsError(job.options);
    if (issue) throw new Error(issue);
    const ort: typeof Ort = await import(
      /* @vite-ignore */ new URL('ort.wasm.min.mjs', job.assetBase).href
    );
    ort.env.wasm.numThreads = 1;
    ort.env.wasm.proxy = false;
    ort.env.wasm.initTimeout = 30000;
    ort.env.wasm.wasmPaths = {
      mjs: new URL('ort-wasm-simd-threaded.mjs', job.assetBase).href,
      wasm: new URL('ort-wasm-simd-threaded.wasm', job.assetBase).href,
    };
    send({ type: 'progress', stage: '음성 모델 읽는 중', progress: 0.01 });
    const response = await fetch(new URL('silero_vad.onnx', job.assetBase));
    if (!response.ok)
      throw new Error('음성 모델을 읽을 수 없습니다. 배포 파일을 확인하고 다시 시도하세요.');
    const bytes = await response.arrayBuffer();
    const digest = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), (v) =>
      v.toString(16).padStart(2, '0'),
    ).join('');
    if (digest !== HASH) throw new Error('음성 모델 파일이 손상되었거나 지원 버전이 아닙니다.');
    send({ type: 'progress', stage: '로컬 추론 엔진 준비 중', progress: 0.05 });
    session = await ort.InferenceSession.create(bytes, { executionProviders: ['wasm'] });
    const rows = mediaLayout(job.project);
    const total = rows.reduce((n, row) => n + row.endUs - row.startUs, 0);
    if (!total) throw new Error('분석할 영상이 없습니다.');
    const keep: Range[] = [],
      warnings = new Set<string>();
    let complete = 0,
      speechFrames = 0,
      lastReport = 0;
    for (const row of rows) {
      const length = row.endUs - row.startUs;
      const asset = job.project.assets.find((a) => a.id === row.clip.assetId);
      if (!asset) throw new Error('영상 원본 정보를 찾지 못했습니다.');
      if (!asset.hasAudio) {
        if (job.purpose !== 'caption') keep.push({ startUs: row.startUs, endUs: row.endUs });
        complete += length;
        warnings.add('오디오 없는 블록은 보존했습니다.');
        continue;
      }
      if (media?.asset.id !== asset.id) {
        media?.input.dispose();
        const file = job.files.find((f) => f.id === asset.id)?.file;
        if (!file) throw new Error('누락된 원본을 다시 연결하세요.');
        media = await openMedia(file, asset.id);
      }
      if (!media.audio)
        throw new Error('원본 오디오를 읽을 수 없습니다. 변경사항은 적용되지 않았습니다.');
      const segmenter = new Segmenter(job.options);
      const protectedFrames: Range[] = [];
      const states = [new Float32Array(256), new Float32Array(256)],
        contexts = [new Float32Array(64), new Float32Array(64)];
      reader = new Pcm16Reader(
        media,
        media.origin + seconds(row.clip.inUs),
        media.origin + seconds(row.clip.outUs),
      );
      for await (const frame of reader.frames()) {
        let probability = 0;
        for (let channel = 0; channel < frame.channels.length; channel++) {
          const input = new Float32Array(576);
          input.set(contexts[channel]);
          input.set(frame.channels[channel], 64);
          const tensors = {
            input: new ort.Tensor('float32', input, [1, 576]),
            state: new ort.Tensor('float32', states[channel], [2, 1, 128]),
            sr: new ort.Tensor('int64', new BigInt64Array([16000n]), []),
          };
          let output: Ort.InferenceSession.OnnxValueMapType | undefined;
          try {
            output = await session.run(tensors);
            const score = Number(output.output.data[0]);
            if (!Number.isFinite(score) || score < 0 || score > 1)
              throw new Error('음성 분석 결과가 올바르지 않습니다.');
            probability = Math.max(probability, score);
            states[channel] = new Float32Array(output.stateN.data as Float32Array);
            contexts[channel] = input.slice(-64);
          } finally {
            Object.values(tensors).forEach((t) => t.dispose());
            if (output) Object.values(output).forEach((t) => t.dispose());
          }
        }
        const startUs = Math.min(
          row.endUs,
          row.startUs + Math.round((frame.offset / 16000) * 1_000_000),
        );
        const endUs = Math.min(
          row.endUs,
          row.startUs + Math.round(((frame.offset + frame.count) / 16000) * 1_000_000),
        );
        if (probability >= job.options.positive) speechFrames++;
        if (frame.missing) {
          if (endUs > startUs) protectedFrames.push({ startUs, endUs });
          warnings.add(job.purpose === 'caption'
            ? '오디오가 없는 일부 샘플은 무음으로 처리했습니다. 감지된 음성 구간만 자막으로 생성합니다.'
            : '오디오 디코딩 공백은 보존했습니다.');
        }
        segmenter.feed(probability, startUs);
        if (performance.now() - lastReport > 100) {
          send({
            type: 'progress',
            stage: `음성 분석 중 · ${asset.name}`,
            progress: 0.1 + (0.85 * (complete + startUs - row.startUs)) / total,
          });
          lastReport = performance.now();
        }
      }
      segmenter.finish(row.endUs);
      await reader.close();
      reader = undefined;
      if (job.purpose === 'caption') {
        // Timestamp gaps and shorter audio tails are normal in video containers.
        // Pcm16Reader zero-fills missing samples without shifting absolute time;
        // use the remaining decoded audio instead of rejecting the whole analysis.
        keep.push(...segmenter.speech);
      } else {
        keep.push(
          ...paddedKeep(segmenter.speech, row.startUs, row.endUs, job.options, job.project.fps),
          ...protectedFrames,
        );
      }
      if (keep.length > 100000)
        throw new Error('분석 구간이 너무 많습니다. 더 짧은 프로젝트로 나누어 분석하세요.');
      complete += length;
    }
    if (!speechFrames && job.purpose !== 'caption') {
      keep.length = 0;
      keep.push(...rows.map((r) => ({ startUs: r.startUs, endUs: r.endUs })));
      warnings.add(
        '음성을 확실히 감지하지 못해 전체 영상을 보존했습니다. 임계값을 낮추거나 직접 확인하세요.',
      );
    }
    send({ type: 'result', result: { keep: union(keep), speechFrames, warnings: [...warnings] } });
  } catch (error) {
    send({ type: 'error', message: error instanceof Error ? error.message : String(error) });
  } finally {
    await reader?.close().catch(() => {});
    media?.input.dispose();
    await session?.release().catch(() => {});
    running = false;
  }
};
