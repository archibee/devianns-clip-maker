import { expect, it } from 'vitest';
import { CAPTION_PRESETS, captionOptions } from '../modules/auto-caption/src/plan';
import { Segmenter } from '../modules/speech-auto-cut/src/segmenter';
import {
  DEFAULT_OPTIONS,
  MARGIN_FIELDS,
  MARGIN_PRESETS,
  PRESETS,
  optionsError,
} from '../modules/speech-auto-cut/src/contracts';

it('다섯 음성 단계는 순서대로 판정이 엄격해지며 짧은 말 필터를 끈다', () => {
  const presets = Object.values(PRESETS);
  expect(presets).toHaveLength(5);
  expect(presets.map((p) => p.options.positive)).toEqual([0.3, 0.4, 0.5, 0.6, 0.7]);
  expect(presets.map((p) => p.options.negative)).toEqual([0.15, 0.25, 0.35, 0.45, 0.55]);
  expect(presets.every((p) => p.options.minSpeechMs === 0)).toBe(true);
  expect(presets[0].options.positive).toBeGreaterThan(0);
  expect(presets.at(-1)!.options.positive).toBeGreaterThan(0.55);
});
it('모든 음성/여백 조합이 유효하며 두 프리셋의 설정 범위가 겹치지 않는다', () => {
  for (const speech of Object.values(PRESETS))
    for (const margin of Object.values(MARGIN_PRESETS)) {
      expect(
        Object.keys(speech.options).some((key) =>
          MARGIN_FIELDS.includes(key as keyof typeof DEFAULT_OPTIONS),
        ),
      ).toBe(false);
      expect(Object.keys(margin.options).sort()).toEqual([...MARGIN_FIELDS].sort());
      expect(optionsError({ ...speech.options, ...margin.options })).toBeUndefined();
    }
  expect(Object.values(MARGIN_PRESETS)).toHaveLength(5);
  expect(Object.values(MARGIN_PRESETS).map((p) => p.options.beforeMs)).toEqual([
    1000, 800, 600, 400, 200,
  ]);
  expect(DEFAULT_OPTIONS.beforeMs).toBe(600);
  expect(DEFAULT_OPTIONS.positive).toBe(0.5);
});
it('두 선택지의 모든 수치 단계가 등간격이다', () => {
  const speech = Object.values(PRESETS).map((p) => p.options),
    margins = Object.values(MARGIN_PRESETS).map((p) => p.options);
  for (const key of ['positive', 'negative', 'silenceMs'] as const) {
    const step = speech[1][key] - speech[0][key];
    for (let i = 2; i < speech.length; i++)
      expect(speech[i][key] - speech[i - 1][key]).toBeCloseTo(step, 10);
  }
  for (const key of ['beforeMs', 'afterMs', 'minRemoveMs'] as const) {
    const step = margins[1][key] - margins[0][key];
    for (let i = 2; i < margins.length; i++)
      expect(margins[i][key] - margins[i - 1][key]).toBe(step);
  }
});
it('빈 자막 감도도 같은 다섯 단계이며 무음과 확실한 음성을 구분한다', () => {
  expect(CAPTION_PRESETS.map((p) => p.positive)).toEqual([0.3, 0.4, 0.5, 0.6, 0.7]);
  expect(CAPTION_PRESETS.map((p) => p.negative)).toEqual([0.15, 0.25, 0.35, 0.45, 0.55]);
  for (let i = 0; i < 5; i++) {
    const options = captionOptions(i);
    expect(optionsError(options)).toBeUndefined();
    const silent = new Segmenter(options),
      speech = new Segmenter(options);
    for (let time = 0; time < 500_000; time += 32_000) {
      silent.feed(0, time);
      speech.feed(0.95, time);
    }
    silent.finish(500_000);
    speech.finish(500_000);
    expect(silent.speech).toEqual([]);
    expect(speech.speech).toEqual([{ startUs: 0, endUs: 500_000 }]);
  }
});
