import type { Project } from '../../../src/project/model';

export type Range = { startUs: number; endUs: number };
export type Options = {
  positive: number;
  negative: number;
  beforeMs: number;
  afterMs: number;
  silenceMs: number;
  minSpeechMs: number;
  minRemoveMs: number;
};
export const PRESETS: Record<string, { label: string; options: Options }> = {
  low: {
    label: '낮음 · 더 많이 정리',
    options: {
      positive: 0.55,
      negative: 0.35,
      beforeMs: 180,
      afterMs: 180,
      silenceMs: 300,
      minSpeechMs: 0,
      minRemoveMs: 450,
    },
  },
  medium: {
    label: '중간 · 기본',
    options: {
      positive: 0.4,
      negative: 0.25,
      beforeMs: 300,
      afterMs: 300,
      silenceMs: 400,
      minSpeechMs: 0,
      minRemoveMs: 700,
    },
  },
  high: {
    label: '높음 · 음성 보존 우선',
    options: {
      positive: 0.3,
      negative: 0.18,
      beforeMs: 450,
      afterMs: 450,
      silenceMs: 500,
      minSpeechMs: 0,
      minRemoveMs: 1000,
    },
  },
};
export function optionsError(o: Options) {
  const fields: [keyof Options, number, number][] = [
    ['positive', 0.05, 0.95],
    ['negative', 0, 0.9],
    ['beforeMs', 0, 2000],
    ['afterMs', 0, 2000],
    ['silenceMs', 100, 3000],
    ['minSpeechMs', 0, 1000],
    ['minRemoveMs', 100, 10000],
  ];
  if (fields.some(([key, min, max]) => !Number.isFinite(o[key]) || o[key] < min || o[key] > max))
    return '설정값을 표시된 범위 안으로 입력하세요.';
  if (o.negative >= o.positive) return '종료 확률은 시작 확률보다 작아야 합니다.';
  return undefined;
}
export type Analysis = { keep: Range[]; speechFrames: number; warnings: string[] };
export type Progress = { stage: string; progress: number };
export type Request = {
  project: Project;
  options: Options;
  files: { id: string; file: File }[];
  assetBase: string;
};
export type Response =
  | ({ type: 'progress' } & Progress)
  | { type: 'result'; result: Analysis }
  | { type: 'error'; message: string };
