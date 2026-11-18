import { expect, it } from 'vitest';
import { spectrum } from '../modules/audio-visualizer/src/spectrum';
import { appendVisualizer } from '../modules/audio-visualizer/src/plan';
import { validVisualizer } from '../modules/audio-visualizer/src/types';
import { drawVisualizer } from '../modules/audio-visualizer/src/render';
import { emptyProject, type Cue } from '../src/project/model';
import { applyCommand, historyReducer, initialHistory } from '../src/project/commands';
import { parseProject } from '../src/project/validation';

const effect = (): Cue => ({
  id: 'fx',
  startUs: 1_000_000,
  endUs: 3_000_000,
  text: '',
  size: 0.16,
  color: '#e4b5ff',
  background: '#000000',
  x: 0.5,
  y: 0.8,
  visualizer: {
    version: 1,
    bands: 32,
    stepUs: 50_000,
    offsetUs: 0,
    values: new Array(40 * 32).fill(100),
    width: 0.65,
    gain: 1,
    showTime: true,
  },
});

it('silence stays flat while a tone produces frequency-localized bars, even with opposite stereo phase', () => {
  const tone = Float32Array.from(
    { length: 1024 },
    (_, i) => Math.sin((2 * Math.PI * 1000 * i) / 48000) * 0.5,
  );
  const quiet = spectrum([new Float32Array(1024)], 48000);
  const loud = spectrum([tone, tone.map((x) => -x)], 48000);
  expect(quiet.every((x) => x === 0)).toBe(true);
  expect(Math.max(...loud)).toBeGreaterThan(200);
  expect(loud.filter((x) => x > 150).length).toBeLessThan(12);
});
it('appends only one new effect line, round-trips its signal, and undo preserves the original project', () => {
  const project = emptyProject(),
    original = structuredClone(project);
  const next = appendVisualizer(project, effect());
  expect(project).toEqual(original);
  expect(next.clips).toEqual(project.clips);
  expect(next.assets).toEqual(project.assets);
  expect(next.laneCount).toBe(2);
  expect(next.subtitles[0].lane).toBe(1);
  expect(parseProject(JSON.stringify(next))).toEqual(next);
  const history = historyReducer(initialHistory(project), {
    type: 'command',
    command: {
      type: 'replaceTimeline',
      laneCount: next.laneCount,
      clips: next.clips,
      subtitles: next.subtitles,
    },
  });
  expect(historyReducer(history, { type: 'undo' }).present).toEqual(project);
});
it('rejects corrupt/unbounded spectra and refuses a new line at the line limit', () => {
  expect(validVisualizer({ ...effect().visualizer, values: [NaN] })).toBe(false);
  expect(() => appendVisualizer({ ...emptyProject(), laneCount: 32 }, effect())).toThrow();
  const project = appendVisualizer(emptyProject(), effect());
  project.subtitles[0].visualizer!.values[0] = 999;
  expect(() => parseProject(JSON.stringify(project))).toThrow();
});
it('splitting and trimming keep the correct analyzed time while moving keeps local animation time', () => {
  const original = appendVisualizer(emptyProject(), effect());
  const split = applyCommand(original, { type: 'split', timeUs: 2_000_000 });
  expect(split.subtitles[1].visualizer!.offsetUs).toBe(1_000_000);
  const trimmed = applyCommand(original, {
    type: 'cueRange',
    id: original.subtitles[0].id,
    startUs: 1_500_000,
    endUs: 3_000_000,
  });
  expect(trimmed.subtitles[0].visualizer!.offsetUs).toBe(500_000);
  const moved = applyCommand(original, {
    type: 'cueRange',
    id: original.subtitles[0].id,
    startUs: 2_000_000,
    endUs: 4_000_000,
  });
  expect(moved.subtitles[0].visualizer!.offsetUs).toBe(0);
});
it('draws only bars and timer instead of painting an opaque background', () => {
  const rectangles: number[][] = [];
  const ctx = {
    canvas: { width: 640, height: 360 },
    save() {},
    restore() {},
    fillText() {},
    fillRect(...args: number[]) {
      rectangles.push(args);
    },
  };
  drawVisualizer(ctx as unknown as CanvasRenderingContext2D, effect(), 1_000_000);
  expect(rectangles).toHaveLength(65);
  expect(rectangles.every(([, , width, height]) => width < 640 && height < 360)).toBe(true);
});
