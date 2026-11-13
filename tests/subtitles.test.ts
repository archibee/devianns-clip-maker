import { describe, expect, it } from 'vitest';
import { applyCommand, historyReducer, initialHistory } from '../src/project/commands';
import { defaultTransform, emptyProject, type Cue, type Project } from '../src/project/model';
import { cueDragRange } from '../src/project/subtitles';
import { parseProject } from '../src/project/validation';

const cue: Cue = {
  id: 'q',
  startUs: 500_000,
  endUs: 2_500_000,
  text: '한글\n자막',
  size: 0.05,
  color: '#ffffff',
  background: '#000000',
  x: 0.5,
  y: 0.9,
};
function project(): Project {
  return {
    ...emptyProject(),
    assets: [
      {
        id: 'a',
        name: 'a.mp4',
        size: 1,
        lastModified: 0,
        durationUs: 6_000_000,
        width: 640,
        height: 360,
        hasAudio: true,
        videoCodec: 'avc',
      },
    ],
    clips: [{ id: 'c', assetId: 'a', inUs: 0, outUs: 6_000_000, transform: defaultTransform() }],
    subtitles: [cue],
  };
}
describe('영상·자막 동시 분할', () => {
  it('한 명령으로 영상과 교차하는 자막을 함께 자르고 undo/redo한다', () => {
    const initial = initialHistory(project());
    const edited = historyReducer(initial, {
      type: 'command',
      command: { type: 'split', timeUs: 1_250_000 },
    });
    expect(edited.past).toHaveLength(1);
    expect(edited.present.clips.map((c) => [c.inUs, c.outUs])).toEqual([
      [0, 1_250_000],
      [1_250_000, 6_000_000],
    ]);
    expect(edited.present.subtitles.map((c) => [c.startUs, c.endUs])).toEqual([
      [500_000, 1_250_000],
      [1_250_000, 2_500_000],
    ]);
    expect(edited.present.subtitles[1].text).toBe(cue.text);
    expect(new Set(edited.present.subtitles.map((c) => c.id)).size).toBe(2);
    const undone = historyReducer(edited, { type: 'undo' });
    expect(undone.present).toEqual(initial.present);
    expect(historyReducer(undone, { type: 'redo' }).present).toEqual(edited.present);
  });
  it('영상 경계에서도 자막만 분할하고 자막 경계에서는 0 길이 블록을 만들지 않는다', () => {
    const p = applyCommand(project(), { type: 'split', timeUs: 1_000_000 });
    const spanning = { ...p, subtitles: [cue] };
    const split = applyCommand(spanning, { type: 'split', timeUs: 1_000_000 });
    expect(split.clips).toHaveLength(2);
    expect(split.subtitles).toHaveLength(2);
    expect(applyCommand(split, { type: 'split', timeUs: 1_000_000 })).toBe(split);
    const original = project();
    expect(applyCommand(original, { type: 'split', timeUs: 6_000_000 })).toBe(original);
  });
});
describe('자막 이동·트림·붙여넣기', () => {
  it('이동은 길이와 스타일을 보존하며 인접 반개구간과 저장/복원이 가능하다', () => {
    let p = applyCommand(project(), {
      type: 'cueRange',
      id: cue.id,
      startUs: 1_000_000,
      endUs: 3_000_000,
    });
    p = applyCommand(p, {
      type: 'cue',
      cue: { ...cue, id: 'paste', startUs: 3_000_000, endUs: 5_000_000 },
    });
    expect(p.subtitles[0]).toEqual({ ...cue, startUs: 1_000_000, endUs: 3_000_000 });
    expect(parseProject(JSON.stringify(p))).toEqual(p);
    expect(applyCommand(p, { type: 'deleteCue', id: cue.id }).clips).toEqual(p.clips);
    expect(applyCommand(p, { type: 'deleteCue', id: cue.id }).subtitles.map((c) => c.id)).toEqual([
      'paste',
    ]);
  });
  it('겹침·범위 초과·0 길이 편집은 원본을 변경하지 않고 거부한다', () => {
    const p = {
      ...project(),
      subtitles: [cue, { ...cue, id: 'other', startUs: 3_000_000, endUs: 4_000_000 }],
    };
    for (const [startUs, endUs] of [
      [-1, 2_000_000],
      [2_000_000, 3_500_000],
      [1, 1],
      [5_000_000, 7_000_000],
    ]) {
      expect(() => applyCommand(p, { type: 'cueRange', id: cue.id, startUs, endUs })).toThrow();
    }
    expect(p.subtitles[0]).toEqual(cue);
  });
  it('드래그는 경계에 스냅하고 트림은 최소 길이를 유지한다', () => {
    const p = {
      ...project(),
      subtitles: [cue, { ...cue, id: 'next', startUs: 4_000_000, endUs: 5_000_000 }],
    };
    expect(cueDragRange(p, cue, 'move', 1_470_000, 60_000)).toEqual({
      startUs: 2_000_000,
      endUs: 4_000_000,
    });
    expect(cueDragRange(p, cue, 'move', -9_000_000)).toEqual({ startUs: 0, endUs: 2_000_000 });
    const trimmed = cueDragRange(p, cue, 'end', -9_000_000);
    expect(trimmed.endUs - trimmed.startUs).toBe(Math.round(1_000_000 / p.fps));
  });
});
