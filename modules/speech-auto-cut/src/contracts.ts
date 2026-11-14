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
type SpeechOptions = Pick<Options, 'positive' | 'negative' | 'silenceMs' | 'minSpeechMs'>;
type MarginOptions = Pick<Options, 'beforeMs' | 'afterMs' | 'minRemoveMs'>;
export const PRESETS: Record<
  string,
  { label: string; description: string; options: SpeechOptions }
> = {
  veryHigh: {
    label: '매우 높음 · 최대한 보존',
    description: '아주 약한 소리도 음성으로 남깁니다. 잡음이 더 많이 남을 수 있습니다.',
    options: { positive: 0.1, negative: 0.04, silenceMs: 650, minSpeechMs: 0 },
  },
  high: {
    label: '높음 · 작은 목소리 보존',
    description: '작은 목소리와 말끝을 관대하게 판정합니다.',
    options: { positive: 0.25, negative: 0.14, silenceMs: 500, minSpeechMs: 0 },
  },
  medium: {
    label: '중간 · 기본',
    description: '음성 보존과 비음성 정리의 균형을 잡는 시작 설정입니다.',
    options: { positive: 0.4, negative: 0.25, silenceMs: 400, minSpeechMs: 0 },
  },
  low: {
    label: '낮음 · 또렷한 음성 위주',
    description: '음성을 더 엄격하게 판정합니다. 작은 목소리나 짧은 말이 누락될 수 있습니다.',
    options: { positive: 0.6, negative: 0.4, silenceMs: 250, minSpeechMs: 0 },
  },
  veryLow: {
    label: '매우 낮음 · 강한 음성 위주',
    description: '확률이 높은 음성만 남기는 강한 정리 설정입니다. 음성 누락에 주의하세요.',
    options: { positive: 0.8, negative: 0.6, silenceMs: 150, minSpeechMs: 0 },
  },
};
export const MARGIN_PRESETS: Record<
  string,
  { label: string; description: string; options: MarginOptions }
> = {
  high: {
    label: '많이(높음) · 앞뒤 각각 1초',
    description: '말 앞뒤의 호흡과 주변 소리를 넉넉하게 남깁니다.',
    options: { beforeMs: 1000, afterMs: 1000, minRemoveMs: 1000 },
  },
  medium: {
    label: '보통(중간) · 앞뒤 각각 0.5초',
    description: '자연스럽게 이어 붙이기 위한 기본 여백입니다.',
    options: { beforeMs: 500, afterMs: 500, minRemoveMs: 700 },
  },
  low: {
    label: '적게(낮음) · 앞뒤 각각 0.25초',
    description: '말 주변의 짧은 여유만 남겨 간결하게 편집합니다.',
    options: { beforeMs: 250, afterMs: 250, minRemoveMs: 350 },
  },
  minimal: {
    label: '최소 · 앞뒤 각각 0.1초',
    description: '매우 짧게 붙입니다. 첫소리와 말끝이 잘리지 않는지 확인하세요.',
    options: { beforeMs: 100, afterMs: 100, minRemoveMs: 150 },
  },
};
export const DEFAULT_OPTIONS: Options = {
  ...PRESETS.medium.options,
  ...MARGIN_PRESETS.medium.options,
};
export const MARGIN_FIELDS: readonly (keyof Options)[] = ['beforeMs', 'afterMs', 'minRemoveMs'];
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
